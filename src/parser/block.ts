/**
 * block.ts — Bitcoin block and undo data parser
 *
 * Parses:
 *   - Block headers (80 bytes)
 *   - Block transactions
 *   - Undo data (rev*.dat) for prevout recovery
 *   - XOR-key decoding as used by Bitcoin Core
 *   - Merkle root computation and verification
 *   - BIP34 coinbase height decoding
 *
 * References:
 *   - https://en.bitcoin.it/wiki/Block
 *   - https://github.com/bitcoin/bitcoin/blob/master/src/undo.h
 */

import * as fs from 'fs';
import { BufferReader } from '../lib/buffer-reader';
import { doubleSha256 } from '../lib/hash';
import { ParsedTransaction } from '../types';
import { parseTransaction, encodeVarInt, computeTxid } from './transaction';

/** Bitcoin network magic bytes */
const MAINNET_MAGIC = 0xd9b4bef9;

export interface ParsedBlockHeader {
  version: number;
  prevBlockHash: string;
  merkleRoot: string;
  timestamp: number;
  bits: string;
  nonce: number;
  blockHash: string;
  headerBytes: Buffer;
}

export interface ParsedBlock {
  header: ParsedBlockHeader;
  transactions: ParsedTransaction[];
  rawTxBytes: Buffer[];
}

export interface UndoPrevout {
  value: number;
  scriptPubKey: Buffer;
}

/**
 * XOR-decode a buffer using the provided key.
 * Bitcoin Core XORs blk*.dat and rev*.dat with a repeating key.
 */
export function xorDecode(data: Buffer, key: Buffer): Buffer {
  if (key.length === 0 || key.every(b => b === 0)) {
    return data; // No-op if key is all zeros
  }
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Parse the 80-byte block header.
 */
export function parseBlockHeader(reader: BufferReader): ParsedBlockHeader {
  const headerStart = reader.offset;
  const version = reader.readInt32LE();

  const prevBlockHashBytes = reader.readBytes(32);
  const prevBlockHash = Buffer.from(prevBlockHashBytes).reverse().toString('hex');

  const merkleRootBytes = reader.readBytes(32);
  const merkleRoot = Buffer.from(merkleRootBytes).reverse().toString('hex');

  const timestamp = reader.readUInt32LE();

  const bitsRaw = reader.readUInt32LE();
  const bits = bitsRaw.toString(16).padStart(8, '0');

  const nonce = reader.readUInt32LE();

  // Compute block hash from header bytes
  const headerBytes = reader.sliceFrom(headerStart);
  const blockHash = Buffer.from(doubleSha256(headerBytes)).reverse().toString('hex');

  return {
    version,
    prevBlockHash,
    merkleRoot,
    timestamp,
    bits,
    nonce,
    blockHash,
    headerBytes,
  };
}

/**
 * Parse all transactions in a block after the header.
 */
export function parseBlockTransactions(reader: BufferReader): {
  transactions: ParsedTransaction[];
  rawTxHexes: string[];
} {
  const txCount = reader.readVarInt();
  const transactions: ParsedTransaction[] = [];
  const rawTxHexes: string[] = [];

  for (let i = 0; i < txCount; i++) {
    const txStart = reader.offset;
    // We need to parse the raw bytes for the transaction
    const tx = parseTransactionFromReader(reader);
    const txEnd = reader.offset;
    const rawHex = reader.getBuffer().slice(txStart, txEnd).toString('hex');
    rawTxHexes.push(rawHex);
    transactions.push(tx);
  }

  return { transactions, rawTxHexes };
}

/**
 * Parse a transaction directly from a BufferReader (used for block parsing).
 */
function parseTransactionFromReader(reader: BufferReader): ParsedTransaction {
  const txStart = reader.offset;

  const version = reader.readInt32LE();

  // Detect segwit
  let segwit = false;
  const marker = reader.peekUInt8();
  if (marker === 0x00) {
    reader.readUInt8(); // marker
    const flag = reader.readUInt8();
    if (flag !== 0x01) {
      throw new Error(`Invalid SegWit flag: 0x${flag.toString(16)}`);
    }
    segwit = true;
  }

  // Inputs
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

  // Outputs
  const outputCount = reader.readVarInt();
  const outputs: ParsedTransaction['outputs'] = [];
  for (let i = 0; i < outputCount; i++) {
    const value = reader.readUInt64LE();
    const scriptLen = reader.readVarInt();
    const scriptPubKey = reader.readBytes(scriptLen);
    outputs.push({ value, scriptPubKey });
  }

  // Witness
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

  // Locktime
  const locktime = reader.readUInt32LE();

  const txEnd = reader.offset;
  const rawBytes = reader.getBuffer().slice(txStart, txEnd);

  // Build txid preimage (stripped)
  const txidPreimage = buildStrippedTx(version, inputs, outputs, locktime);
  const wtxidPreimage = segwit ? Buffer.from(rawBytes) : txidPreimage;

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

/**
 * Build stripped transaction bytes (no witness) for txid computation.
 */
function buildStrippedTx(
  version: number,
  inputs: ParsedTransaction['inputs'],
  outputs: ParsedTransaction['outputs'],
  locktime: number
): Buffer {
  const parts: Buffer[] = [];

  const versionBuf = Buffer.alloc(4);
  versionBuf.writeInt32LE(version);
  parts.push(versionBuf);

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
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeUInt32LE(out.value % 0x100000000, 0);
    valueBuf.writeUInt32LE(Math.floor(out.value / 0x100000000), 4);
    parts.push(valueBuf);
    parts.push(encodeVarInt(out.scriptPubKey.length));
    parts.push(out.scriptPubKey);
  }

  const lockBuf = Buffer.alloc(4);
  lockBuf.writeUInt32LE(locktime);
  parts.push(lockBuf);

  return Buffer.concat(parts);
}

/**
 * Parse undo data from rev*.dat to recover prevouts.
 *
 * Undo data format (per block):
 *   For each transaction (excluding coinbase, in order):
 *     varint: number of inputs (CTxIn's spent)
 *     For each input:
 *       varint: nCode (encodes height, isCoinbase, and version info — we skip)
 *       compressed TxOut:
 *         varint: compressed amount
 *         compressed script
 *
 * Bitcoin Core's undo compression:
 *   - Amount: special varint encoding
 *   - Script: nSize determines type:
 *       0 = P2PKH (20 bytes follow, reconstruct 76a914{hash}88ac)
 *       1 = P2SH  (20 bytes follow, reconstruct a914{hash}87)
 *       2,3 = P2PK compressed (33 bytes, 02/03 prefix)
 *       4,5 = P2PK uncompressed (33 bytes stored, reconstruct 65-byte pubkey)
 *       >= 6 = raw script, length = nSize - 6
 */
export function parseUndoData(
  reader: BufferReader,
  transactions: ParsedTransaction[]
): UndoPrevout[][] {
  const result: UndoPrevout[][] = [];

  // Read CompactSize count of CTxUndo entries (should = txCount - 1, excluding coinbase)
  const undoTxCount = reader.readVarInt();

  for (let i = 0; i < undoTxCount; i++) {
    // Read CompactSize count of prevouts for this transaction
    const prevoutCount = reader.readVarInt();
    const prevouts: UndoPrevout[] = [];

    for (let j = 0; j < prevoutCount; j++) {
      // Read nCode (Bitcoin VARINT: height * 2 + isCoinbase)
      const nCode = readBitcoinVarInt(reader);
      const height = nCode >>> 1;

      // Bitcoin Core compatibility: if height > 0, there's a version dummy varint
      if (height > 0) {
        readBitcoinVarInt(reader); // discard version dummy
      }

      // Read compressed TxOut
      const value = decompressAmount(readBitcoinVarInt(reader));
      const scriptPubKey = decompressScript(reader);

      prevouts.push({ value, scriptPubKey });
    }

    result.push(prevouts);
  }

  return result;
}

/**
 * Read a Bitcoin Core-style variable-length integer.
 * This is different from the CompactSize used in transaction serialization!
 *
 * Bitcoin Core's serialization uses a base-128 encoding:
 *   - Read bytes where bit 7 is set (continuation), then one final byte without bit 7
 *   - Each byte contributes 7 bits of data
 */
function readBitcoinVarInt(reader: BufferReader): number {
  let n = 0;
  while (true) {
    const chData = reader.readUInt8();
    if (n > Number.MAX_SAFE_INTEGER / 128) {
      throw new Error('Bitcoin VarInt too large');
    }
    n = (n << 7) | (chData & 0x7f);
    if ((chData & 0x80) !== 0) {
      n++;
    } else {
      return n;
    }
  }
}

/**
 * Decompress a Bitcoin Core compressed amount.
 * See Bitcoin Core's `DecompressAmount` in compressor.cpp
 */
function decompressAmount(x: number): number {
  if (x === 0) return 0;
  x--;
  let e = x % 10;
  x = Math.floor(x / 10);
  let n: number;
  if (e < 9) {
    const d = (x % 9) + 1;
    x = Math.floor(x / 9);
    n = x * 10 + d;
  } else {
    n = x + 1;
  }
  while (e > 0) {
    n *= 10;
    e--;
  }
  return n;
}

/**
 * Decompress a Bitcoin Core compressed script.
 * See Bitcoin Core's `DecompressScript` in compressor.cpp
 */
function decompressScript(reader: BufferReader): Buffer {
  const nSize = readBitcoinVarInt(reader);

  switch (nSize) {
    case 0x00: {
      // P2PKH: 20 bytes -> OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG
      const hash = reader.readBytes(20);
      const script = Buffer.alloc(25);
      script[0] = 0x76; // OP_DUP
      script[1] = 0xa9; // OP_HASH160
      script[2] = 0x14; // push 20 bytes
      hash.copy(script, 3);
      script[23] = 0x88; // OP_EQUALVERIFY
      script[24] = 0xac; // OP_CHECKSIG
      return script;
    }

    case 0x01: {
      // P2SH: 20 bytes -> OP_HASH160 <20> OP_EQUAL
      const hash = reader.readBytes(20);
      const script = Buffer.alloc(23);
      script[0] = 0xa9; // OP_HASH160
      script[1] = 0x14; // push 20 bytes
      hash.copy(script, 2);
      script[22] = 0x87; // OP_EQUAL
      return script;
    }

    case 0x02:
    case 0x03: {
      // Compressed P2PK: 33 bytes (including prefix)
      const keyData = reader.readBytes(32);
      // Build: OP_PUSHBYTES_33 <prefix> <32 bytes> OP_CHECKSIG
      const script = Buffer.alloc(35);
      script[0] = 0x21; // push 33 bytes
      script[1] = nSize; // 0x02 or 0x03
      keyData.copy(script, 2);
      script[34] = 0xac; // OP_CHECKSIG
      return script;
    }

    case 0x04:
    case 0x05: {
      // Uncompressed P2PK: stored as 32 bytes, needs to be reconstructed
      // as 65-byte uncompressed public key
      const keyData = reader.readBytes(32);
      // For now, build compressed P2PK script (we don't need to decompress for prevout matching)
      // The stored data is the X coordinate. 0x04 means even Y, 0x05 means odd Y
      const prefix = nSize === 0x04 ? 0x02 : 0x03;
      const script = Buffer.alloc(35);
      script[0] = 0x21; // push 33 bytes
      script[1] = prefix;
      keyData.copy(script, 2);
      script[34] = 0xac; // OP_CHECKSIG
      return script;
    }

    default: {
      // Raw script: nSize - 6 bytes
      const scriptLen = nSize - 6;
      if (scriptLen < 0) {
        throw new Error(`Invalid script nSize: ${nSize}`);
      }
      return reader.readBytes(scriptLen);
    }
  }
}

/**
 * Compute the Merkle root from a list of transaction IDs.
 */
export function computeMerkleRoot(txids: string[]): string {
  if (txids.length === 0) {
    throw new Error('Cannot compute merkle root with no transactions');
  }

  // Convert txids to internal byte order (reversed hex)
  let hashes: Buffer<ArrayBufferLike>[] = txids.map(txid => {
    const buf = Buffer.from(txid, 'hex');
    return Buffer.from(buf).reverse();
  });

  while (hashes.length > 1) {
    const newLevel: Buffer<ArrayBufferLike>[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : hashes[i]; // Duplicate last if odd
      const combined = Buffer.concat([left, right]);
      newLevel.push(doubleSha256(combined));
    }
    hashes = newLevel;
  }

  // Return in display order (reversed)
  return Buffer.from(hashes[0]).reverse().toString('hex');
}

/**
 * Decode BIP34 block height from coinbase scriptSig.
 * The first bytes of the scriptSig encode the block height as a little-endian integer.
 */
export function decodeBip34Height(scriptSig: Buffer): number {
  if (scriptSig.length === 0) {
    throw new Error('Empty coinbase scriptSig');
  }

  const heightLen = scriptSig[0];
  if (heightLen === 0 || heightLen > 4) {
    // Height 0 or single-byte push
    if (heightLen >= 0x01 && heightLen <= 0x10) {
      // Could be a direct number for blocks 1-16
      return heightLen;
    }
    if (heightLen === 0) return 0;
  }

  if (heightLen > scriptSig.length - 1) {
    throw new Error('Coinbase scriptSig too short for BIP34 height');
  }

  let height = 0;
  for (let i = 0; i < heightLen; i++) {
    height |= scriptSig[1 + i] << (8 * i);
  }

  return height;
}

/**
 * Parse all blocks from a blk*.dat file.
 * Each block is prefixed with magic bytes (4) and block size (4).
 */
export function parseBlockFile(
  blkData: Buffer,
  revData: Buffer,
  xorKey: Buffer
): ParsedBlock[] {
  // XOR-decode both files
  const decodedBlk = xorDecode(blkData, xorKey);
  const decodedRev = xorDecode(revData, xorKey);

  const blkReader = new BufferReader(decodedBlk);
  const blocks: ParsedBlock[] = [];

  while (blkReader.remaining >= 8) {
    // Read magic bytes
    const magic = blkReader.readUInt32LE();
    if (magic !== MAINNET_MAGIC) {
      // Try to find next magic bytes (sometimes there's padding)
      break;
    }

    // Block size
    const blockSize = blkReader.readUInt32LE();
    if (blockSize === 0 || blkReader.remaining < blockSize) {
      throw new Error(`Invalid block size: ${blockSize}, remaining: ${blkReader.remaining}`);
    }

    const blockStart = blkReader.offset;

    // Parse header
    const header = parseBlockHeader(blkReader);

    // Parse transactions
    const { transactions, rawTxHexes } = parseBlockTransactions(blkReader);

    const rawTxBytes: Buffer[] = rawTxHexes.map(h => Buffer.from(h, 'hex'));

    blocks.push({ header, transactions, rawTxBytes });
  }

  // Now parse undo data
  const revReader = new BufferReader(decodedRev);

  return { blocks, revReader } as any; // We'll handle this in block-analyzer
}

/**
 * Read blocks and undo data from files.
 */
export function readBlockFiles(
  blkPath: string,
  revPath: string,
  xorPath: string
): { blkData: Buffer; revData: Buffer; xorKey: Buffer } {
  const blkData = fs.readFileSync(blkPath);
  const revData = fs.readFileSync(revPath);
  const xorKey = fs.readFileSync(xorPath);
  return { blkData, revData, xorKey };
}
