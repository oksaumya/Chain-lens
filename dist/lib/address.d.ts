/**
 * address.ts — Bitcoin address derivation from scriptPubKeys
 *
 * Supports:
 *   - P2PKH (Base58Check, prefix 0x00 for mainnet)
 *   - P2SH  (Base58Check, prefix 0x05 for mainnet)
 *   - P2WPKH (Bech32, witness version 0)
 *   - P2WSH  (Bech32, witness version 0)
 *   - P2TR   (Bech32m, witness version 1)
 */
import { OutputScriptType } from './script';
/**
 * Derive a Bitcoin address from a scriptPubKey hex string.
 * Returns null for unrecognized types (op_return, unknown).
 */
export declare function deriveAddress(scriptHex: string, scriptType: OutputScriptType, network?: string): string | null;
//# sourceMappingURL=address.d.ts.map