/**
 * hash.ts — Cryptographic hashing utilities for Bitcoin
 *
 * Provides SHA-256, double-SHA-256, RIPEMD-160, and HASH-160
 * using Node.js built-in crypto module.
 */

import * as crypto from 'crypto';

/** Single SHA-256 hash */
export function sha256(data: Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/** Double SHA-256 hash (used for txid, block hash, merkle trees) */
export function doubleSha256(data: Buffer): Buffer {
  return sha256(sha256(data));
}

/** RIPEMD-160 hash */
export function ripemd160(data: Buffer): Buffer {
  return crypto.createHash('ripemd160').update(data).digest();
}

/** HASH-160: RIPEMD-160(SHA-256(data)) — used for P2PKH and P2WPKH */
export function hash160(data: Buffer): Buffer {
  return ripemd160(sha256(data));
}
