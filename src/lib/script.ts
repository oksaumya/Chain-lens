/**
 * script.ts — Bitcoin Script disassembly and classification
 *
 * Handles:
 *   - Script disassembly to human-readable ASM format
 *   - Output script type classification (P2PKH, P2SH, P2WPKH, P2WSH, P2TR, OP_RETURN, unknown)
 *   - Input script type classification (p2pkh, p2sh-p2wpkh, p2sh-p2wsh, p2wpkh, p2wsh, p2tr_keypath, p2tr_scriptpath, unknown)
 *   - OP_RETURN payload extraction and protocol detection
 */

import { getOpcodeName } from './opcodes';

/** Valid output script types */
export type OutputScriptType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr' | 'op_return' | 'unknown';

/** Valid input script types */
export type InputScriptType =
  | 'p2pkh'
  | 'p2sh-p2wpkh'
  | 'p2sh-p2wsh'
  | 'p2wpkh'
  | 'p2wsh'
  | 'p2tr_keypath'
  | 'p2tr_scriptpath'
  | 'unknown';

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
export function disassembleScript(scriptHex: string): string {
  if (!scriptHex || scriptHex.length === 0) return '';

  const buf = Buffer.from(scriptHex, 'hex');
  const tokens: string[] = [];
  let i = 0;

  while (i < buf.length) {
    const opcode = buf[i];
    i++;

    if (opcode === 0x00) {
      tokens.push('OP_0');
    } else if (opcode >= 0x01 && opcode <= 0x4b) {
      // Direct push: OP_PUSHBYTES_<n> <hex>
      const n = opcode;
      if (i + n > buf.length) {
        tokens.push(`OP_PUSHBYTES_${n}`);
        break;
      }
      const data = buf.slice(i, i + n).toString('hex');
      i += n;
      tokens.push(`OP_PUSHBYTES_${n} ${data}`);
    } else if (opcode === 0x4c) {
      // OP_PUSHDATA1
      if (i >= buf.length) break;
      const len = buf[i];
      i++;
      if (i + len > buf.length) break;
      const data = buf.slice(i, i + len).toString('hex');
      i += len;
      tokens.push(`OP_PUSHDATA1 ${data}`);
    } else if (opcode === 0x4d) {
      // OP_PUSHDATA2
      if (i + 2 > buf.length) break;
      const len = buf.readUInt16LE(i);
      i += 2;
      if (i + len > buf.length) break;
      const data = buf.slice(i, i + len).toString('hex');
      i += len;
      tokens.push(`OP_PUSHDATA2 ${data}`);
    } else if (opcode === 0x4e) {
      // OP_PUSHDATA4
      if (i + 4 > buf.length) break;
      const len = buf.readUInt32LE(i);
      i += 4;
      if (i + len > buf.length) break;
      const data = buf.slice(i, i + len).toString('hex');
      i += len;
      tokens.push(`OP_PUSHDATA4 ${data}`);
    } else {
      tokens.push(getOpcodeName(opcode));
    }
  }

  return tokens.join(' ');
}

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
export function classifyOutputScript(scriptHex: string): OutputScriptType {
  const buf = Buffer.from(scriptHex, 'hex');
  const len = buf.length;

  // P2PKH: 76 a9 14 <20 bytes> 88 ac
  if (len === 25 && buf[0] === 0x76 && buf[1] === 0xa9 && buf[2] === 0x14 &&
      buf[23] === 0x88 && buf[24] === 0xac) {
    return 'p2pkh';
  }

  // P2SH: a9 14 <20 bytes> 87
  if (len === 23 && buf[0] === 0xa9 && buf[1] === 0x14 && buf[22] === 0x87) {
    return 'p2sh';
  }

  // P2WPKH: 00 14 <20 bytes>
  if (len === 22 && buf[0] === 0x00 && buf[1] === 0x14) {
    return 'p2wpkh';
  }

  // P2WSH: 00 20 <32 bytes>
  if (len === 34 && buf[0] === 0x00 && buf[1] === 0x20) {
    return 'p2wsh';
  }

  // P2TR: 51 20 <32 bytes>
  if (len === 34 && buf[0] === 0x51 && buf[1] === 0x20) {
    return 'p2tr';
  }

  // OP_RETURN: 6a ...
  if (len >= 1 && buf[0] === 0x6a) {
    return 'op_return';
  }

  return 'unknown';
}

/**
 * Classify an input's spend type based on the prevout scriptPubKey, scriptSig, and witness.
 */
export function classifyInputScript(
  prevoutScriptHex: string,
  scriptSigHex: string,
  witness: string[]
): InputScriptType {
  const prevout = Buffer.from(prevoutScriptHex, 'hex');
  const scriptSig = Buffer.from(scriptSigHex, 'hex');
  const prevoutType = classifyOutputScript(prevoutScriptHex);

  // P2PKH spend: prevout is P2PKH
  if (prevoutType === 'p2pkh') {
    return 'p2pkh';
  }

  // P2WPKH spend: prevout is P2WPKH, empty scriptSig, witness has 2 items
  if (prevoutType === 'p2wpkh') {
    return 'p2wpkh';
  }

  // P2WSH spend: prevout is P2WSH, empty scriptSig, witness present
  if (prevoutType === 'p2wsh') {
    return 'p2wsh';
  }

  // P2TR spend: prevout is P2TR
  if (prevoutType === 'p2tr') {
    if (witness.length === 1 && (Buffer.from(witness[0], 'hex').length === 64 || Buffer.from(witness[0], 'hex').length === 65)) {
      return 'p2tr_keypath';
    }
    // Script path: witness has more items, last is script, second-to-last is control block
    if (witness.length >= 2) {
      const lastItem = Buffer.from(witness[witness.length - 1], 'hex');
      // Control block starts with 0xc0 or 0xc1 (and has length 33 + 32*n)
      if (lastItem.length >= 33 && (lastItem[0] === 0xc0 || lastItem[0] === 0xc1)) {
        return 'p2tr_scriptpath';
      }
      // Also check if second-to-last is control block (when annex is present)
      if (witness.length >= 3) {
        const secondLast = Buffer.from(witness[witness.length - 2], 'hex');
        if (secondLast.length >= 33 && (secondLast[0] === 0xc0 || secondLast[0] === 0xc1)) {
          return 'p2tr_scriptpath';
        }
      }
    }
    return 'p2tr_keypath';
  }

  // P2SH: prevout is P2SH, check nested types
  if (prevoutType === 'p2sh') {
    // P2SH-P2WPKH: scriptSig pushes a P2WPKH redeemScript (0014<20bytes>), witness has 2 items
    if (scriptSig.length > 0 && witness.length > 0) {
      // Extract pushed data from scriptSig
      const redeemScript = extractPushedData(scriptSig);
      if (redeemScript) {
        const nestedType = classifyOutputScript(redeemScript.toString('hex'));
        if (nestedType === 'p2wpkh') {
          return 'p2sh-p2wpkh';
        }
        if (nestedType === 'p2wsh') {
          return 'p2sh-p2wsh';
        }
      }
    }
    return 'unknown';
  }

  return 'unknown';
}

/**
 * Extract the single pushed data item from a scriptSig.
 * Used for nested P2SH scripts where scriptSig is just a push of the redeemScript.
 */
function extractPushedData(scriptSig: Buffer): Buffer | null {
  if (scriptSig.length === 0) return null;

  const opcode = scriptSig[0];
  let dataStart: number;
  let dataLen: number;

  if (opcode >= 0x01 && opcode <= 0x4b) {
    dataLen = opcode;
    dataStart = 1;
  } else if (opcode === 0x4c) {
    if (scriptSig.length < 2) return null;
    dataLen = scriptSig[1];
    dataStart = 2;
  } else if (opcode === 0x4d) {
    if (scriptSig.length < 3) return null;
    dataLen = scriptSig.readUInt16LE(1);
    dataStart = 3;
  } else if (opcode === 0x4e) {
    if (scriptSig.length < 5) return null;
    dataLen = scriptSig.readUInt32LE(1);
    dataStart = 5;
  } else {
    return null;
  }

  if (dataStart + dataLen > scriptSig.length) return null;
  return scriptSig.slice(dataStart, dataStart + dataLen);
}

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
export function extractOpReturnData(scriptHex: string): OpReturnData {
  const buf = Buffer.from(scriptHex, 'hex');

  // First byte must be 0x6a (OP_RETURN)
  if (buf.length === 0 || buf[0] !== 0x6a) {
    return { dataHex: '', dataUtf8: null, protocol: 'unknown' };
  }

  const chunks: Buffer[] = [];
  let i = 1; // skip OP_RETURN

  while (i < buf.length) {
    const opcode = buf[i];
    i++;

    if (opcode >= 0x01 && opcode <= 0x4b) {
      // Direct push
      const n = opcode;
      if (i + n > buf.length) break;
      chunks.push(buf.slice(i, i + n));
      i += n;
    } else if (opcode === 0x4c) {
      // OP_PUSHDATA1
      if (i >= buf.length) break;
      const len = buf[i];
      i++;
      if (i + len > buf.length) break;
      chunks.push(buf.slice(i, i + len));
      i += len;
    } else if (opcode === 0x4d) {
      // OP_PUSHDATA2
      if (i + 2 > buf.length) break;
      const len = buf.readUInt16LE(i);
      i += 2;
      if (i + len > buf.length) break;
      chunks.push(buf.slice(i, i + len));
      i += len;
    } else if (opcode === 0x4e) {
      // OP_PUSHDATA4
      if (i + 4 > buf.length) break;
      const len = buf.readUInt32LE(i);
      i += 4;
      if (i + len > buf.length) break;
      chunks.push(buf.slice(i, i + len));
      i += len;
    } else if (opcode === 0x00) {
      // OP_0 pushes empty
      chunks.push(Buffer.alloc(0));
    }
    // Other opcodes after OP_RETURN are ignored for data extraction
  }

  const combined = Buffer.concat(chunks);
  const dataHex = combined.toString('hex');

  // UTF-8 decode
  let dataUtf8: string | null = null;
  try {
    const decoded = combined.toString('utf8');
    // Verify it's valid UTF-8 by re-encoding and comparing
    if (Buffer.from(decoded, 'utf8').equals(combined)) {
      dataUtf8 = decoded;
    }
  } catch {
    dataUtf8 = null;
  }

  // Protocol detection
  let protocol: 'omni' | 'opentimestamps' | 'unknown' = 'unknown';
  if (dataHex.startsWith('6f6d6e69')) {
    protocol = 'omni';
  } else if (dataHex.startsWith('0109f91102')) {
    protocol = 'opentimestamps';
  }

  return { dataHex, dataUtf8, protocol };
}
