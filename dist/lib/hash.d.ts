/**
 * hash.ts — Cryptographic hashing utilities for Bitcoin
 *
 * Provides SHA-256, double-SHA-256, RIPEMD-160, and HASH-160
 * using Node.js built-in crypto module.
 */
/** Single SHA-256 hash */
export declare function sha256(data: Buffer): Buffer;
/** Double SHA-256 hash (used for txid, block hash, merkle trees) */
export declare function doubleSha256(data: Buffer): Buffer;
/** RIPEMD-160 hash */
export declare function ripemd160(data: Buffer): Buffer;
/** HASH-160: RIPEMD-160(SHA-256(data)) — used for P2PKH and P2WPKH */
export declare function hash160(data: Buffer): Buffer;
//# sourceMappingURL=hash.d.ts.map