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

import { bech32, bech32m } from 'bech32';
import bs58check from 'bs58check';
import { OutputScriptType } from './script';

/**
 * Derive a Bitcoin address from a scriptPubKey hex string.
 * Returns null for unrecognized types (op_return, unknown).
 */
export function deriveAddress(scriptHex: string, scriptType: OutputScriptType, network: string = 'mainnet'): string | null {
  const buf = Buffer.from(scriptHex, 'hex');
  const hrp = network === 'mainnet' ? 'bc' : 'tb';

  switch (scriptType) {
    case 'p2pkh': {
      // Script: 76 a9 14 <20-byte hash> 88 ac
      const hash = buf.slice(3, 23);
      const prefix = network === 'mainnet' ? 0x00 : 0x6f;
      const payload = Buffer.alloc(21);
      payload[0] = prefix;
      hash.copy(payload, 1);
      return bs58check.encode(payload);
    }

    case 'p2sh': {
      // Script: a9 14 <20-byte hash> 87
      const hash = buf.slice(2, 22);
      const prefix = network === 'mainnet' ? 0x05 : 0xc4;
      const payload = Buffer.alloc(21);
      payload[0] = prefix;
      hash.copy(payload, 1);
      return bs58check.encode(payload);
    }

    case 'p2wpkh': {
      // Script: 00 14 <20-byte hash>
      const hash = buf.slice(2, 22);
      const words = bech32.toWords(hash);
      words.unshift(0); // witness version 0
      return bech32.encode(hrp, words);
    }

    case 'p2wsh': {
      // Script: 00 20 <32-byte hash>
      const hash = buf.slice(2, 34);
      const words = bech32.toWords(hash);
      words.unshift(0); // witness version 0
      return bech32.encode(hrp, words);
    }

    case 'p2tr': {
      // Script: 51 20 <32-byte tweaked pubkey>
      const pubkey = buf.slice(2, 34);
      const words = bech32m.toWords(pubkey);
      words.unshift(1); // witness version 1
      return bech32m.encode(hrp, words);
    }

    case 'op_return':
    case 'unknown':
    default:
      return null;
  }
}
