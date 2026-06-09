/**
 * script.ts — Bitcoin Script disassembly and classification
 *
 * Handles:
 *   - Script disassembly to human-readable ASM format
 *   - Output script type classification (P2PKH, P2SH, P2WPKH, P2WSH, P2TR, OP_RETURN, unknown)
 *   - Input script type classification (p2pkh, p2sh-p2wpkh, p2sh-p2wsh, p2wpkh, p2wsh, p2tr_keypath, p2tr_scriptpath, unknown)
 *   - OP_RETURN payload extraction and protocol detection
 */
/** Valid output script types */
export type OutputScriptType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr' | 'op_return' | 'unknown';
/** Valid input script types */
export type InputScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2sh-p2wsh' | 'p2wpkh' | 'p2wsh' | 'p2tr_keypath' | 'p2tr_scriptpath' | 'unknown';
/**
 * Disassemble a script (scriptPubKey or scriptSig) into ASM notation.
 *
 * Format: space-separated tokens.
 *   - Opcodes use standard names (OP_DUP, OP_HASH160, etc.)
 *   - Data pushes: OP_PUSHBYTES_<n> <hex> for 0x01-0x4b
 *   - OP_PUSHDATA1/2/4 <hex>
 *   - OP_0 for 0x00, OP_1-OP_16 for 0x51-0x60
 *   - Empty scripts produce ""
 */
export declare function disassembleScript(scriptHex: string): string;
/**
 * Classify an output scriptPubKey into a standard type.
 *
 * Pattern matching:
 *   P2PKH:   OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG  (25 bytes)
 *   P2SH:    OP_HASH160 <20 bytes> OP_EQUAL                            (23 bytes)
 *   P2WPKH:  OP_0 <20 bytes>                                           (22 bytes)
 *   P2WSH:   OP_0 <32 bytes>                                           (34 bytes)
 *   P2TR:    OP_1 <32 bytes>                                           (34 bytes)
 *   OP_RETURN: OP_RETURN ...                                           (varies)
 */
export declare function classifyOutputScript(scriptHex: string): OutputScriptType;
/**
 * Classify an input's spend type based on the prevout scriptPubKey, scriptSig, and witness.
 */
export declare function classifyInputScript(prevoutScriptHex: string, scriptSigHex: string, witness: string[]): InputScriptType;
/** OP_RETURN payload info */
export interface OpReturnData {
    dataHex: string;
    dataUtf8: string | null;
    protocol: 'omni' | 'opentimestamps' | 'unknown';
}
/**
 * Extract OP_RETURN payload data from a script.
 * Concatenates all data pushes after OP_RETURN.
 */
export declare function extractOpReturnData(scriptHex: string): OpReturnData;
//# sourceMappingURL=script.d.ts.map