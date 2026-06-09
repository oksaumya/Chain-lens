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
import { ParsedTransaction } from '../types';
/**
 * Parse a raw Bitcoin transaction from hex.
 * Detects SegWit marker/flag and parses witness data accordingly.
 */
export declare function parseTransaction(rawHex: string): ParsedTransaction;
/** Encode a number as a Bitcoin CompactSize varint */
export declare function encodeVarInt(n: number): Buffer;
/**
 * Compute txid from the preimage (double SHA-256, then reverse for display).
 */
export declare function computeTxid(preimage: Buffer): string;
//# sourceMappingURL=transaction.d.ts.map