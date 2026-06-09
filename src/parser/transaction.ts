/**
 * transaction.ts — Raw Bitcoin transaction parser
 *
 * Parses a hex-encoded raw transaction according to the Bitcoin protocol
 * serialization format, handling both legacy and SegWit (BIP141) transactions.
 *
 * References:
 *   - https://en.bitcoin.it/wiki/Transaction
 *   - BIP141 (Segregated Witness)
 */

import { BufferReader } from '../lib/buffer-reader';
import { doubleSha256 } from '../lib/hash';
import { ParsedTransaction, RawInput, RawOutput } from '../types';

/**
 * Parse a raw Bitcoin transaction from hex.
 * Detects SegWit marker/flag and parses witness data accordingly.
 */
export function parseTransaction(rawHex: string): ParsedTransaction {
  const buf = Buffer.from(rawHex, 'hex');
  const reader = new BufferReader(buf);

  // --- Version (4 bytes, little-endian) ---
  const version = reader.readInt32LE();

  // --- Detect SegWit marker (0x00) and flag (0x01) ---
  let segwit = false;
  const markerPos = reader.offset;
  const marker = reader.peekUInt8();
  if (marker === 0x00) {
    reader.readUInt8(); // consume marker
    const flag = reader.readUInt8();
    if (flag !== 0x01) {
      throw new Error(`Invalid SegWit flag: 0x${flag.toString(16)}`);
    }
    segwit = true;
  }

  // --- Inputs ---
  const inputCount = reader.readVarInt();
  if (inputCount === 0 && !segwit) {
    throw new Error('Transaction has no inputs');
  }

  const inputs: RawInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const txidBytes = reader.readBytes(32);
    // Reverse for display convention (internal byte order is LE)
    const txid = Buffer.from(txidBytes).reverse().toString('hex');
    const vout = reader.readUInt32LE();
    const scriptLen = reader.readVarInt();
    const scriptSig = reader.readBytes(scriptLen);
    const sequence = reader.readUInt32LE();

    inputs.push({ txid, vout, scriptSig, sequence });
  }

  // --- Outputs ---
  const outputCount = reader.readVarInt();
  const outputs: RawOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    const value = reader.readUInt64LE();
    const scriptLen = reader.readVarInt();
    const scriptPubKey = reader.readBytes(scriptLen);

    outputs.push({ value, scriptPubKey });
  }

  // --- Witness data (only if SegWit) ---
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
    // Legacy: empty witness for all inputs
    for (let i = 0; i < inputCount; i++) {
      witness.push([]);
    }
  }

  // --- Locktime (4 bytes) ---
  const locktime = reader.readUInt32LE();

  // --- Compute txid and wtxid preimages ---
  // txid preimage: version + inputs + outputs + locktime (no witness)
  const txidPreimage = buildTxidPreimage(version, inputs, outputs, locktime);
  // wtxid preimage: full serialization including witness
  const wtxidPreimage = segwit ? buf : txidPreimage;

  return {
    version,
    inputs,
    outputs,
    witness,
    locktime,
    segwit,
    txidPreimage,
    wtxidPreimage,
    size: buf.length,
  };
}

/**
 * Build the serialized data used for computing the txid.
 * This is the "traditional" serialization (without SegWit marker, flag, or witness).
 */
function buildTxidPreimage(
  version: number,
  inputs: RawInput[],
  outputs: RawOutput[],
  locktime: number
): Buffer {
  const parts: Buffer[] = [];

  // Version
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeInt32LE(version);
  parts.push(versionBuf);

  // Input count (varint)
  parts.push(encodeVarInt(inputs.length));

  // Inputs
  for (const inp of inputs) {
    // txid in internal byte order (reverse of display)
    const txidBuf = Buffer.from(inp.txid, 'hex');
    const txidLE = Buffer.from(txidBuf).reverse();
    parts.push(txidLE);

    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(inp.vout);
    parts.push(voutBuf);

    parts.push(encodeVarInt(inp.scriptSig.length));
    parts.push(inp.scriptSig);

    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32LE(inp.sequence);
    parts.push(seqBuf);
  }

  // Output count
  parts.push(encodeVarInt(outputs.length));

  // Outputs
  for (const out of outputs) {
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeUInt32LE(out.value % 0x100000000, 0);
    valueBuf.writeUInt32LE(Math.floor(out.value / 0x100000000), 4);
    parts.push(valueBuf);

    parts.push(encodeVarInt(out.scriptPubKey.length));
    parts.push(out.scriptPubKey);
  }

  // Locktime
  const lockBuf = Buffer.alloc(4);
  lockBuf.writeUInt32LE(locktime);
  parts.push(lockBuf);

  return Buffer.concat(parts);
}

/** Encode a number as a Bitcoin CompactSize varint */
export function encodeVarInt(n: number): Buffer {
  if (n < 0xfd) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(n);
    return buf;
  }
  if (n <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf.writeUInt8(0xfd);
    buf.writeUInt16LE(n, 1);
    return buf;
  }
  if (n <= 0xffffffff) {
    const buf = Buffer.alloc(5);
    buf.writeUInt8(0xfe);
    buf.writeUInt32LE(n, 1);
    return buf;
  }
  const buf = Buffer.alloc(9);
  buf.writeUInt8(0xff);
  buf.writeUInt32LE(n & 0xffffffff, 1);
  buf.writeUInt32LE(Math.floor(n / 0x100000000), 5);
  return buf;
}

/**
 * Compute txid from the preimage (double SHA-256, then reverse for display).
 */
export function computeTxid(preimage: Buffer): string {
  const hash = doubleSha256(preimage);
  return Buffer.from(hash).reverse().toString('hex');
}
