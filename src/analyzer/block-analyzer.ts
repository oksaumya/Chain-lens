/**
 * block-analyzer.ts — Full block analysis
 *
 * Takes raw block + undo data and produces the complete block JSON report.
 */

import * as fs from 'fs';
import { BufferReader } from '../lib/buffer-reader';
import { doubleSha256 } from '../lib/hash';
import {
  xorDecode,
  parseBlockHeader,
  ParsedBlockHeader,
  computeMerkleRoot,
  decodeBip34Height,
  parseUndoData,
  UndoPrevout,
} from '../parser/block';
import { parseTransaction, computeTxid, encodeVarInt } from '../parser/transaction';
import { analyzeTransaction } from './transaction-analyzer';
import {
  BlockReport,
  BlockHeader,
  CoinbaseInfo,
  BlockStats,
  TransactionReport,
  Prevout,
  ErrorReport,
  ParsedTransaction,
  ScriptTypeSummary,
} from '../types';
import { classifyOutputScript } from '../lib/script';

const MAINNET_MAGIC = 0xd9b4bef9;

/** Pre-parsed undo record: raw CBlockUndo bytes for a single block. */
interface UndoRecord {
  undoBytes: Buffer;  // raw CBlockUndo serialization (without magic/size/checksum)
  checksum: Buffer;   // 32-byte checksum following the undo data
  txCount: number;    // number of CTxUndo entries (non-coinbase tx count)
}

/**
 * Pre-parse all undo records from rev*.dat.
 * Each record: magic(4) + size(4) + CBlockUndo(size) + checksum(32)
 */
function preParseUndoRecords(revData: Buffer): UndoRecord[] {
  const reader = new BufferReader(revData);
  const records: UndoRecord[] = [];

  while (reader.remaining >= 8) {
    const magic = reader.readUInt32LE();
    if (magic !== MAINNET_MAGIC) break;

    const size = reader.readUInt32LE();
    if (size === 0 || reader.remaining < size + 32) break;

    const undoBytes = Buffer.from(reader.readBytes(size));
    const checksum = Buffer.from(reader.readBytes(32));

    // Read the CompactSize tx count from the beginning of the undo data
    const undoInner = new BufferReader(undoBytes);
    const txCount = undoInner.readVarInt();

    records.push({ undoBytes, checksum, txCount });
  }

  return records;
}

/**
 * Match an undo record to a block by verifying the checksum.
 * First filters by non-coinbase tx count, then verifies checksum.
 * Checksum = doubleSHA256(prev_block_hash_LE_bytes || undoBytes)
 */
function findUndoForBlock(
  prevBlockHash: string,
  nonCoinbaseTxCount: number,
  undoRecords: UndoRecord[],
  usedIndices: Set<number>
): { record: UndoRecord; index: number } | null {
  const prevHashBytes = Buffer.from(prevBlockHash, 'hex').reverse();

  // First try matching by tx count (fast filter)
  for (let i = 0; i < undoRecords.length; i++) {
    if (usedIndices.has(i)) continue;
    if (undoRecords[i].txCount !== nonCoinbaseTxCount) continue;

    const rec = undoRecords[i];
    const preimage = Buffer.concat([prevHashBytes, rec.undoBytes]);
    const expected = doubleSha256(preimage);

    if (expected.equals(rec.checksum)) {
      return { record: rec, index: i };
    }
  }

  // Fallback: try all remaining records (shouldn't happen with valid data)
  for (let i = 0; i < undoRecords.length; i++) {
    if (usedIndices.has(i)) continue;

    const rec = undoRecords[i];
    const preimage = Buffer.concat([prevHashBytes, rec.undoBytes]);
    const expected = doubleSha256(preimage);

    if (expected.equals(rec.checksum)) {
      return { record: rec, index: i };
    }
  }

  return null;
}

/**
 * Analyze all blocks in the given blk/rev/xor files.
 * Returns an array of block reports (one per block in the file).
 */
export function analyzeBlockFile(
  blkPath: string,
  revPath: string,
  xorPath: string,
  maxBlocks?: number
): (BlockReport | ErrorReport)[] {
  const blkRaw = fs.readFileSync(blkPath);
  const revRaw = fs.readFileSync(revPath);
  const xorKey = fs.readFileSync(xorPath);

  // XOR-decode
  const blkData = xorDecode(blkRaw, xorKey);
  const revData = xorDecode(revRaw, xorKey);

  // Pre-parse all undo records from rev file
  const undoRecords = preParseUndoRecords(revData);
  const usedUndoIndices = new Set<number>();

  const blkReader = new BufferReader(blkData);
  const reports: (BlockReport | ErrorReport)[] = [];

  while (blkReader.remaining >= 8) {
    const magic = blkReader.readUInt32LE();
    if (magic !== MAINNET_MAGIC) break;

    const blockSize = blkReader.readUInt32LE();
    if (blockSize === 0 || blkReader.remaining < blockSize) {
      reports.push({
        ok: false,
        error: { code: 'INVALID_BLOCK', message: `Invalid block size: ${blockSize}` },
      });
      break;
    }

    const blockDataStart = blkReader.offset;

    try {
      const report = analyzeOneBlock(blkReader, undoRecords, usedUndoIndices, blockSize);
      reports.push(report);
    } catch (err: any) {
      reports.push({
        ok: false,
        error: { code: 'INVALID_BLOCK', message: err.message || String(err) },
      });
      const consumed = blkReader.offset - blockDataStart;
      if (consumed < blockSize) {
        blkReader.skip(blockSize - consumed);
      }
    }

    // Optional limit for web UI (to avoid JSON string length overflow)
    if (maxBlocks !== undefined && reports.length >= maxBlocks) {
      break;
    }
  }

  return reports;
}

/**
 * Analyze a single block from the reader.
 */
function analyzeOneBlock(
  blkReader: BufferReader,
  undoRecords: UndoRecord[],
  usedUndoIndices: Set<number>,
  blockSize: number
): BlockReport | ErrorReport {
  const blockStart = blkReader.offset;

  // 1. Parse 80-byte block header
  const header = parseBlockHeader(blkReader);

  // 2. Parse all transactions
  const txCount = blkReader.readVarInt();
  const parsedTxs: ParsedTransaction[] = [];

  for (let i = 0; i < txCount; i++) {
    const tx = parseTransactionFromBlockReader(blkReader);
    parsedTxs.push(tx);
  }

  // 3. Find matching undo record using prev_block_hash checksum verification
  let undoPrevouts: UndoPrevout[][];
  try {
    const match = findUndoForBlock(header.prevBlockHash, parsedTxs.length - 1, undoRecords, usedUndoIndices);
    if (!match) {
      throw new Error('No matching undo record found for block ' + header.blockHash.substring(0, 16));
    }
    usedUndoIndices.add(match.index);

    const undoReader = new BufferReader(match.record.undoBytes);
    undoPrevouts = parseUndoData(undoReader, parsedTxs);
  } catch (err: any) {
    return {
      ok: false,
      error: { code: 'INVALID_UNDO', message: `Failed to parse undo data: ${err.message}` },
    };
  }

  // 4. Compute txids
  const txids = parsedTxs.map(tx => computeTxid(tx.txidPreimage));

  // 5. Compute and verify merkle root
  const computedMerkle = computeMerkleRoot(txids);
  const merkleValid = computedMerkle === header.merkleRoot;

  if (!merkleValid) {
    return {
      ok: false,
      error: {
        code: 'MERKLE_MISMATCH',
        message: `Computed merkle root ${computedMerkle} does not match header ${header.merkleRoot}`,
      },
    };
  }

  // 6. Identify coinbase
  const coinbaseTx = parsedTxs[0];
  const coinbaseInput = coinbaseTx.inputs[0];
  const isValidCoinbase =
    coinbaseTx.inputs.length === 1 &&
    coinbaseInput.txid === '0000000000000000000000000000000000000000000000000000000000000000' &&
    coinbaseInput.vout === 0xffffffff;

  if (!isValidCoinbase) {
    return {
      ok: false,
      error: { code: 'INVALID_COINBASE', message: 'First transaction is not a valid coinbase' },
    };
  }

  // 7. Decode BIP34 height
  const bip34Height = decodeBip34Height(coinbaseInput.scriptSig);

  // 8. Analyze all transactions
  const txReports: TransactionReport[] = [];
  let totalFees = 0;
  let totalWeight = 0;
  const scriptTypeSummary: ScriptTypeSummary = {};

  // Coinbase transaction (index 0) - special handling
  const coinbaseReport = analyzeCoinbaseTransaction(coinbaseTx, 'mainnet');
  txReports.push(coinbaseReport);
  totalWeight += coinbaseReport.weight;

  // Count output script types from coinbase
  for (const vout of coinbaseReport.vout) {
    scriptTypeSummary[vout.script_type] = (scriptTypeSummary[vout.script_type] || 0) + 1;
  }

  // Non-coinbase transactions (index 1..N)
  for (let txIdx = 1; txIdx < parsedTxs.length; txIdx++) {
    const tx = parsedTxs[txIdx];
    const txUndoPrevouts = undoPrevouts[txIdx - 1]; // undo is indexed from 0 for non-coinbase

    // Build prevouts from undo data
    const prevouts: Prevout[] = tx.inputs.map((inp, inIdx) => {
      const undoP = txUndoPrevouts[inIdx];
      return {
        txid: inp.txid,
        vout: inp.vout,
        value_sats: undoP.value,
        script_pubkey_hex: undoP.scriptPubKey.toString('hex'),
      };
    });

    const report = analyzeTransaction(tx, prevouts, 'mainnet');
    if (report.ok) {
      txReports.push(report);
      totalFees += report.fee_sats;
      totalWeight += report.weight;

      // Count output script types
      for (const vout of report.vout) {
        scriptTypeSummary[vout.script_type] = (scriptTypeSummary[vout.script_type] || 0) + 1;
      }
    } else {
      // If a tx fails to analyze, still include it as error (shouldn't happen with valid blocks)
      txReports.push(report as any);
    }
  }

  const coinbaseOutputTotal = coinbaseTx.outputs.reduce((sum, o) => sum + o.value, 0);
  const totalVbytes = txReports.reduce((sum, r) => sum + (r as TransactionReport).vbytes, 0);
  const avgFeeRate = totalVbytes > 0 ? parseFloat((totalFees / totalVbytes).toFixed(1)) : 0;

  const blockReport: BlockReport = {
    ok: true,
    mode: 'block',
    block_header: {
      version: header.version,
      prev_block_hash: header.prevBlockHash,
      merkle_root: header.merkleRoot,
      merkle_root_valid: merkleValid,
      timestamp: header.timestamp,
      bits: header.bits,
      nonce: header.nonce,
      block_hash: header.blockHash,
    },
    tx_count: txCount,
    coinbase: {
      bip34_height: bip34Height,
      coinbase_script_hex: coinbaseInput.scriptSig.toString('hex'),
      total_output_sats: coinbaseOutputTotal,
    },
    transactions: txReports,
    block_stats: {
      total_fees_sats: totalFees,
      total_weight: totalWeight,
      avg_fee_rate_sat_vb: avgFeeRate,
      script_type_summary: scriptTypeSummary,
    },
  };

  return blockReport;
}

/**
 * Parse a transaction from the block reader (same as parseTransaction but from BufferReader).
 */
function parseTransactionFromBlockReader(reader: BufferReader): ParsedTransaction {
  const txStart = reader.offset;

  const version = reader.readInt32LE();

  let segwit = false;
  const marker = reader.peekUInt8();
  if (marker === 0x00) {
    reader.readUInt8();
    const flag = reader.readUInt8();
    if (flag !== 0x01) {
      throw new Error(`Invalid SegWit flag: 0x${flag.toString(16)}`);
    }
    segwit = true;
  }

  const inputCount = reader.readVarInt();
  const inputs: ParsedTransaction['inputs'] = [];
  for (let i = 0; i < inputCount; i++) {
    const txidBytes = reader.readBytes(32);
    const txid = Buffer.from(txidBytes).reverse().toString('hex');
    const vout = reader.readUInt32LE();
    const scriptLen = reader.readVarInt();
    const scriptSig = reader.readBytes(scriptLen);
    const sequence = reader.readUInt32LE();
    inputs.push({ txid, vout, scriptSig, sequence });
  }

  const outputCount = reader.readVarInt();
  const outputs: ParsedTransaction['outputs'] = [];
  for (let i = 0; i < outputCount; i++) {
    const value = reader.readUInt64LE();
    const scriptLen = reader.readVarInt();
    const scriptPubKey = reader.readBytes(scriptLen);
    outputs.push({ value, scriptPubKey });
  }

  const witness: Buffer[][] = [];
  if (segwit) {
    for (let i = 0; i < inputCount; i++) {
      const witnessCount = reader.readVarInt();
      const items: Buffer[] = [];
      for (let j = 0; j < witnessCount; j++) {
        const itemLen = reader.readVarInt();
        const item = reader.readBytes(itemLen);
        items.push(item);
      }
      witness.push(items);
    }
  } else {
    for (let i = 0; i < inputCount; i++) {
      witness.push([]);
    }
  }

  const locktime = reader.readUInt32LE();

  const txEnd = reader.offset;
  const rawBytes = Buffer.from(reader.getBuffer().slice(txStart, txEnd));

  // Build txid preimage
  const txidPreimage = buildStrippedTxBuf(version, inputs, outputs, locktime);
  const wtxidPreimage = segwit ? rawBytes : txidPreimage;

  return {
    version,
    inputs,
    outputs,
    witness,
    locktime,
    segwit,
    txidPreimage,
    wtxidPreimage,
    size: rawBytes.length,
  };
}

function buildStrippedTxBuf(
  version: number,
  inputs: ParsedTransaction['inputs'],
  outputs: ParsedTransaction['outputs'],
  locktime: number
): Buffer {
  const parts: Buffer[] = [];

  const vBuf = Buffer.alloc(4);
  vBuf.writeInt32LE(version);
  parts.push(vBuf);

  parts.push(encodeVarInt(inputs.length));
  for (const inp of inputs) {
    const txidBuf = Buffer.from(inp.txid, 'hex');
    parts.push(Buffer.from(txidBuf).reverse());
    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(inp.vout);
    parts.push(voutBuf);
    parts.push(encodeVarInt(inp.scriptSig.length));
    parts.push(inp.scriptSig);
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32LE(inp.sequence);
    parts.push(seqBuf);
  }

  parts.push(encodeVarInt(outputs.length));
  for (const out of outputs) {
    const valBuf = Buffer.alloc(8);
    valBuf.writeUInt32LE(out.value % 0x100000000, 0);
    valBuf.writeUInt32LE(Math.floor(out.value / 0x100000000), 4);
    parts.push(valBuf);
    parts.push(encodeVarInt(out.scriptPubKey.length));
    parts.push(out.scriptPubKey);
  }

  const lBuf = Buffer.alloc(4);
  lBuf.writeUInt32LE(locktime);
  parts.push(lBuf);

  return Buffer.concat(parts);
}

/**
 * Analyze a coinbase transaction (no inputs to match).
 */
function analyzeCoinbaseTransaction(
  parsed: ParsedTransaction,
  network: string
): TransactionReport {
  const txid = computeTxid(parsed.txidPreimage);
  const wtxid = parsed.segwit ? computeTxid(parsed.wtxidPreimage) : null;

  const { classifyOutputScript: classifyOut } = require('../lib/script');
  const { deriveAddress } = require('../lib/address');
  const { disassembleScript, extractOpReturnData } = require('../lib/script');

  const vout = parsed.outputs.map((out, idx) => {
    const scriptHex = out.scriptPubKey.toString('hex');
    const scriptType = classifyOutputScript(scriptHex);
    const address = deriveAddress(scriptHex, scriptType, network);

    const entry: any = {
      n: idx,
      value_sats: out.value,
      script_pubkey_hex: scriptHex,
      script_asm: disassembleScript(scriptHex),
      script_type: scriptType,
      address,
    };

    if (scriptType === 'op_return') {
      const opData = extractOpReturnData(scriptHex);
      entry.op_return_data_hex = opData.dataHex;
      entry.op_return_data_utf8 = opData.dataUtf8;
      entry.op_return_protocol = opData.protocol;
    }

    return entry;
  });

  const totalOutputSats = parsed.outputs.reduce((sum, o) => sum + o.value, 0);

  // Coinbase input
  const coinbaseInput = parsed.inputs[0];
  const witnessItems = parsed.witness[0].map(w => w.toString('hex'));

  const vin = [{
    txid: coinbaseInput.txid,
    vout: coinbaseInput.vout,
    sequence: coinbaseInput.sequence,
    script_sig_hex: coinbaseInput.scriptSig.toString('hex'),
    script_asm: disassembleScript(coinbaseInput.scriptSig.toString('hex')),
    witness: witnessItems,
    script_type: 'unknown',
    address: null as string | null,
    prevout: {
      value_sats: 0,
      script_pubkey_hex: '',
    },
    relative_timelock: { enabled: false } as any,
  }];

  const strippedSize = parsed.txidPreimage.length;
  const weight = parsed.segwit ? strippedSize * 3 + parsed.size : parsed.size * 4;
  const vbytes = Math.ceil(weight / 4);

  return {
    ok: true,
    network,
    segwit: parsed.segwit,
    txid,
    wtxid,
    version: parsed.version,
    locktime: parsed.locktime,
    size_bytes: parsed.size,
    weight,
    vbytes,
    total_input_sats: 0,
    total_output_sats: totalOutputSats,
    fee_sats: 0,
    fee_rate_sat_vb: 0,
    rbf_signaling: false,
    locktime_type: 'none',
    locktime_value: parsed.locktime,
    segwit_savings: parsed.segwit ? {
      witness_bytes: parsed.size - strippedSize,
      non_witness_bytes: strippedSize,
      total_bytes: parsed.size,
      weight_actual: weight,
      weight_if_legacy: strippedSize * 4,
      savings_pct: parseFloat((((strippedSize * 4 - weight) / (strippedSize * 4)) * 100).toFixed(2)),
    } : null,
    vin,
    vout,
    warnings: [],
  };
}
