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
import { BufferReader } from '../lib/buffer-reader';
import { ParsedTransaction } from '../types';
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
export declare function xorDecode(data: Buffer, key: Buffer): Buffer;
/**
 * Parse the 80-byte block header.
 */
export declare function parseBlockHeader(reader: BufferReader): ParsedBlockHeader;
/**
 * Parse all transactions in a block after the header.
 */
export declare function parseBlockTransactions(reader: BufferReader): {
    transactions: ParsedTransaction[];
    rawTxHexes: string[];
};
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
export declare function parseUndoData(reader: BufferReader, transactions: ParsedTransaction[]): UndoPrevout[][];
/**
 * Compute the Merkle root from a list of transaction IDs.
 */
export declare function computeMerkleRoot(txids: string[]): string;
/**
 * Decode BIP34 block height from coinbase scriptSig.
 * The first bytes of the scriptSig encode the block height as a little-endian integer.
 */
export declare function decodeBip34Height(scriptSig: Buffer): number;
/**
 * Parse all blocks from a blk*.dat file.
 * Each block is prefixed with magic bytes (4) and block size (4).
 */
export declare function parseBlockFile(blkData: Buffer, revData: Buffer, xorKey: Buffer): ParsedBlock[];
/**
 * Read blocks and undo data from files.
 */
export declare function readBlockFiles(blkPath: string, revPath: string, xorPath: string): {
    blkData: Buffer;
    revData: Buffer;
    xorKey: Buffer;
};
//# sourceMappingURL=block.d.ts.map