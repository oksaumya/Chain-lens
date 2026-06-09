/**
 * transaction-analyzer.ts — Full transaction analysis
 *
 * Takes a parsed transaction + prevouts and produces the complete
 * JSON report matching the required schema.
 */

import { ParsedTransaction, Prevout, TransactionReport, VinEntry, VoutEntry, Warning, SegwitSavings, RelativeTimelock, ErrorReport } from '../types';
import { computeTxid } from '../parser/transaction';
import { classifyOutputScript, classifyInputScript, disassembleScript, extractOpReturnData } from '../lib/script';
import { deriveAddress } from '../lib/address';

/** BIP68 constants */
const SEQUENCE_LOCKTIME_DISABLE_FLAG = 1 << 31;  // bit 31
const SEQUENCE_LOCKTIME_TYPE_FLAG = 1 << 22;     // bit 22
const SEQUENCE_LOCKTIME_MASK = 0x0000ffff;        // lower 16 bits

/** BIP125 RBF threshold */
const SEQUENCE_RBF_MAX = 0xfffffffe;

/**
 * Analyze a parsed transaction with its prevouts.
 * Returns the full TransactionReport or ErrorReport.
 */
export function analyzeTransaction(
  parsed: ParsedTransaction,
  prevouts: Prevout[],
  network: string
): TransactionReport | ErrorReport {
  try {
    // Match prevouts to inputs by (txid, vout)
    const matchedPrevouts = matchPrevouts(parsed, prevouts);

    // Compute txid and wtxid
    const txid = computeTxid(parsed.txidPreimage);
    const wtxid = parsed.segwit ? computeTxid(parsed.wtxidPreimage) : null;

    // Build vin entries
    const vin = buildVinEntries(parsed, matchedPrevouts, network);

    // Build vout entries
    const vout = buildVoutEntries(parsed, network);

    // Calculate totals
    const totalInputSats = matchedPrevouts.reduce((sum, p) => sum + p.value_sats, 0);
    const totalOutputSats = parsed.outputs.reduce((sum, o) => sum + o.value, 0);
    const feeSats = totalInputSats - totalOutputSats;

    if (feeSats < 0) {
      return {
        ok: false,
        error: {
          code: 'INVALID_TX',
          message: `Negative fee: inputs (${totalInputSats}) < outputs (${totalOutputSats})`
        }
      };
    }

    // Weight and vbytes calculation (BIP141)
    const { weight, witnessBytes, nonWitnessBytes } = computeWeight(parsed);
    const vbytes = Math.ceil(weight / 4);
    const feeRate = parseFloat((feeSats / vbytes).toFixed(2));

    // RBF signaling: any input with sequence < 0xFFFFFFFE
    const rbfSignaling = parsed.inputs.some(inp => inp.sequence < 0xfffffffe);

    // Locktime analysis
    const { locktimeType, locktimeValue } = analyzeLocktime(parsed.locktime);

    // SegWit savings
    let segwitSavings: SegwitSavings | null = null;
    if (parsed.segwit) {
      const weightIfLegacy = nonWitnessBytes * 4;
      const savingsPct = weightIfLegacy > 0
        ? parseFloat((((weightIfLegacy - weight) / weightIfLegacy) * 100).toFixed(2))
        : 0;

      segwitSavings = {
        witness_bytes: witnessBytes,
        non_witness_bytes: nonWitnessBytes,
        total_bytes: parsed.size,
        weight_actual: weight,
        weight_if_legacy: weightIfLegacy,
        savings_pct: savingsPct,
      };
    }

    // Warnings
    const warnings = generateWarnings(feeSats, feeRate, vout, rbfSignaling);

    return {
      ok: true,
      network,
      segwit: parsed.segwit,
      txid,
      wtxid,
      version: parsed.version,
      locktime: parsed.locktime,
      size_bytes: parsed.size,
      weight,
      vbytes,
      total_input_sats: totalInputSats,
      total_output_sats: totalOutputSats,
      fee_sats: feeSats,
      fee_rate_sat_vb: feeRate,
      rbf_signaling: rbfSignaling,
      locktime_type: locktimeType,
      locktime_value: parsed.locktime,
      segwit_savings: segwitSavings,
      vin,
      vout,
      warnings,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: 'INVALID_TX',
        message: err.message || String(err),
      }
    };
  }
}

/**
 * Match prevouts to transaction inputs by (txid, vout).
 * The prevouts array may NOT be in the same order as inputs.
 * Throws if any prevout is missing or duplicated.
 */
function matchPrevouts(parsed: ParsedTransaction, prevouts: Prevout[]): Prevout[] {
  // Build a lookup map: "txid:vout" -> Prevout
  const map = new Map<string, Prevout>();
  for (const p of prevouts) {
    const key = `${p.txid}:${p.vout}`;
    if (map.has(key)) {
      throw new Error(`Duplicate prevout: ${key}`);
    }
    map.set(key, p);
  }

  const matched: Prevout[] = [];
  for (const inp of parsed.inputs) {
    const key = `${inp.txid}:${inp.vout}`;
    const prevout = map.get(key);
    if (!prevout) {
      throw new Error(`Missing prevout for input ${key}`);
    }
    matched.push(prevout);
    map.delete(key);
  }

  // Check for extra prevouts that don't correspond to any input
  if (map.size > 0) {
    const extra = Array.from(map.keys()).join(', ');
    throw new Error(`Extra prevouts not matching any input: ${extra}`);
  }

  return matched;
}

/**
 * Build vin entries with full analysis.
 */
function buildVinEntries(
  parsed: ParsedTransaction,
  matchedPrevouts: Prevout[],
  network: string
): VinEntry[] {
  return parsed.inputs.map((inp, idx) => {
    const prevout = matchedPrevouts[idx];
    const scriptSigHex = inp.scriptSig.toString('hex');
    const witnessItems = parsed.witness[idx].map(w => w.toString('hex'));

    // Script type classification
    const inputScriptType = classifyInputScript(prevout.script_pubkey_hex, scriptSigHex, witnessItems);

    // Address from prevout scriptPubKey
    const outputType = classifyOutputScript(prevout.script_pubkey_hex);
    const address = deriveAddress(prevout.script_pubkey_hex, outputType, network);

    // Relative timelock (BIP68)
    const relativeTimelock = analyzeRelativeTimelock(inp.sequence);

    const entry: VinEntry = {
      txid: inp.txid,
      vout: inp.vout,
      sequence: inp.sequence,
      script_sig_hex: scriptSigHex,
      script_asm: disassembleScript(scriptSigHex),
      witness: witnessItems,
      script_type: inputScriptType,
      address,
      prevout: {
        value_sats: prevout.value_sats,
        script_pubkey_hex: prevout.script_pubkey_hex,
      },
      relative_timelock: relativeTimelock,
    };

    // For p2wsh and p2sh-p2wsh, add witness_script_asm (disassembly of last witness item)
    if ((inputScriptType === 'p2wsh' || inputScriptType === 'p2sh-p2wsh') && witnessItems.length > 0) {
      const lastWitnessItem = witnessItems[witnessItems.length - 1];
      entry.witness_script_asm = disassembleScript(lastWitnessItem);
    }

    return entry;
  });
}

/**
 * Build vout entries with full analysis.
 */
function buildVoutEntries(parsed: ParsedTransaction, network: string): VoutEntry[] {
  return parsed.outputs.map((out, idx) => {
    const scriptHex = out.scriptPubKey.toString('hex');
    const scriptType = classifyOutputScript(scriptHex);
    const address = deriveAddress(scriptHex, scriptType, network);

    const entry: VoutEntry = {
      n: idx,
      value_sats: out.value,
      script_pubkey_hex: scriptHex,
      script_asm: disassembleScript(scriptHex),
      script_type: scriptType,
      address,
    };

    // OP_RETURN fields
    if (scriptType === 'op_return') {
      const opReturnData = extractOpReturnData(scriptHex);
      entry.op_return_data_hex = opReturnData.dataHex;
      entry.op_return_data_utf8 = opReturnData.dataUtf8;
      entry.op_return_protocol = opReturnData.protocol;
    }

    return entry;
  });
}

/**
 * Compute BIP141 weight units.
 *
 * Weight = (non-witness bytes) * 4 + (witness bytes) * 1
 *
 * Non-witness: version(4) + marker(0 or 1) excluded + flag(0 or 1) excluded +
 *              vin count + inputs + vout count + outputs + locktime(4)
 * Witness: marker(1) + flag(1) + all witness data
 *
 * Actually per BIP141:
 *   - Non-witness data = the "stripped" serialization (no marker, flag, witness)
 *   - Witness data = marker + flag + witness fields
 *   - Weight = stripped_size * 3 + total_size
 *     This is equivalent to non_witness * 4 + witness * 1
 */
function computeWeight(parsed: ParsedTransaction): {
  weight: number;
  witnessBytes: number;
  nonWitnessBytes: number;
} {
  if (!parsed.segwit) {
    // Non-segwit: entire tx counts at weight 4x
    return {
      weight: parsed.size * 4,
      witnessBytes: 0,
      nonWitnessBytes: parsed.size,
    };
  }

  // SegWit: compute stripped size (without marker, flag, and witness)
  const strippedSize = parsed.txidPreimage.length;
  const totalSize = parsed.size;
  const witnessBytes = totalSize - strippedSize;
  const nonWitnessBytes = strippedSize;

  // Weight = stripped * 4 + witness * 1 = stripped * 3 + total
  const weight = strippedSize * 3 + totalSize;

  return { weight, witnessBytes, nonWitnessBytes };
}

/**
 * Analyze locktime value.
 */
function analyzeLocktime(locktime: number): {
  locktimeType: 'none' | 'block_height' | 'unix_timestamp';
  locktimeValue: number;
} {
  if (locktime === 0) {
    return { locktimeType: 'none', locktimeValue: 0 };
  }
  if (locktime < 500000000) {
    return { locktimeType: 'block_height', locktimeValue: locktime };
  }
  return { locktimeType: 'unix_timestamp', locktimeValue: locktime };
}

/**
 * Analyze BIP68 relative timelock from sequence number.
 */
function analyzeRelativeTimelock(sequence: number): RelativeTimelock {
  // If bit 31 is set, relative locktime is disabled
  if (sequence & SEQUENCE_LOCKTIME_DISABLE_FLAG) {
    return { enabled: false };
  }

  const masked = sequence & SEQUENCE_LOCKTIME_MASK;

  // Bit 22 determines type
  if (sequence & SEQUENCE_LOCKTIME_TYPE_FLAG) {
    // Time-based: value in 512-second units
    return {
      enabled: true,
      type: 'time',
      value: masked * 512,
    };
  }

  // Block-based
  return {
    enabled: true,
    type: 'blocks',
    value: masked,
  };
}

/**
 * Generate warning codes based on transaction analysis.
 */
function generateWarnings(
  feeSats: number,
  feeRate: number,
  vout: VoutEntry[],
  rbfSignaling: boolean
): Warning[] {
  const warnings: Warning[] = [];

  // HIGH_FEE: fee > 1M sats or feerate > 200 sat/vB
  if (feeSats > 1_000_000 || feeRate > 200) {
    warnings.push({ code: 'HIGH_FEE' });
  }

  // DUST_OUTPUT: any non-op_return output < 546 sats
  if (vout.some(v => v.script_type !== 'op_return' && v.value_sats < 546)) {
    warnings.push({ code: 'DUST_OUTPUT' });
  }

  // UNKNOWN_OUTPUT_SCRIPT: any output with unknown script type
  if (vout.some(v => v.script_type === 'unknown')) {
    warnings.push({ code: 'UNKNOWN_OUTPUT_SCRIPT' });
  }

  // RBF_SIGNALING
  if (rbfSignaling) {
    warnings.push({ code: 'RBF_SIGNALING' });
  }

  return warnings;
}
