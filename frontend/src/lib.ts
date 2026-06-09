/* ================================================================
   TYPES — mirrors backend src/types.ts for the API response shapes
   ================================================================ */

export interface RelativeTimelock {
  enabled: boolean;
  type?: 'blocks' | 'time';
  value?: number;
}

export interface VinEntry {
  txid: string;
  vout: number;
  sequence: number;
  script_sig_hex: string;
  script_asm: string;
  witness: string[];
  script_type: string;
  address: string | null;
  prevout: { value_sats: number; script_pubkey_hex: string };
  relative_timelock: RelativeTimelock;
  witness_script_asm?: string;
}

export interface VoutEntry {
  n: number;
  value_sats: number;
  script_pubkey_hex: string;
  script_asm: string;
  script_type: string;
  address: string | null;
  op_return_data_hex?: string;
  op_return_data_utf8?: string | null;
  op_return_protocol?: string;
}

export interface SegwitSavings {
  witness_bytes: number;
  non_witness_bytes: number;
  total_bytes: number;
  weight_actual: number;
  weight_if_legacy: number;
  savings_pct: number;
}

export interface TransactionReport {
  ok: true;
  network: string;
  segwit: boolean;
  txid: string;
  wtxid: string | null;
  version: number;
  locktime: number;
  size_bytes: number;
  weight: number;
  vbytes: number;
  total_input_sats: number;
  total_output_sats: number;
  fee_sats: number;
  fee_rate_sat_vb: number;
  rbf_signaling: boolean;
  locktime_type: 'none' | 'block_height' | 'unix_timestamp';
  locktime_value: number;
  segwit_savings: SegwitSavings | null;
  vin: VinEntry[];
  vout: VoutEntry[];
  warnings: Array<{ code: string } | string>;
}

export interface ErrorReport {
  ok: false;
  error: { code: string; message: string };
}

export interface BlockHeader {
  version: number;
  prev_block_hash: string;
  merkle_root: string;
  merkle_root_valid: boolean;
  timestamp: number;
  bits: string;
  nonce: number;
  block_hash: string;
}

export interface CoinbaseInfo {
  bip34_height: number;
  coinbase_script_hex: string;
  total_output_sats: number;
}

export interface BlockReport {
  ok: true;
  mode: 'block';
  block_header: BlockHeader;
  tx_count: number;
  coinbase: CoinbaseInfo;
  transactions: TransactionReport[];
  block_stats: {
    total_fees_sats: number;
    total_weight: number;
    avg_fee_rate_sat_vb: number;
    script_type_summary: Record<string, number>;
  };
}

/* ================================================================
   API
   ================================================================ */

export async function fetchHealth(): Promise<boolean> {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    return d.ok === true;
  } catch {
    return false;
  }
}

export async function fetchFixtures(): Promise<string[]> {
  try {
    const r = await fetch('/api/fixtures');
    const d = await r.json();
    return d.ok ? d.fixtures : [];
  } catch {
    return [];
  }
}

export async function fetchFixture(name: string): Promise<unknown> {
  const r = await fetch(`/api/fixtures/${encodeURIComponent(name)}`);
  return r.json();
}

export async function analyzeTransaction(body: unknown): Promise<TransactionReport | ErrorReport> {
  const r = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function analyzeBlock(
  blk: ArrayBuffer,
  rev: ArrayBuffer,
  xor: ArrayBuffer,
): Promise<{ ok: true; blocks: BlockReport[] } | ErrorReport> {
  const formData = new FormData();
  formData.append('blk', new Blob([blk]), 'blk.dat');
  formData.append('rev', new Blob([rev]), 'rev.dat');
  formData.append('xor', new Blob([xor]), 'xor.dat');

  const r = await fetch('/api/analyze-block', {
    method: 'POST',
    body: formData,
  });
  return r.json();
}

/* ================================================================
   FORMATTING
   ================================================================ */

export function formatSats(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString() + ' sats';
}

export function formatBTC(sats: number): string {
  return (sats / 1e8).toFixed(8) + ' BTC';
}

export function truncHash(h: string | null, n = 8): string {
  if (!h) return '—';
  if (h.length <= n * 2 + 3) return h;
  return h.slice(0, n) + '…' + h.slice(-n);
}

export function scriptColor(t: string): { bg: string; fg: string; label: string } {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    p2pkh: { bg: 'rgba(234,179,8,0.1)', fg: '#eab308', label: 'P2PKH · Legacy' },
    p2sh: { bg: 'rgba(167,139,250,0.08)', fg: '#a78bfa', label: 'P2SH · Script Hash' },
    'p2sh-p2wpkh': { bg: 'rgba(139,92,246,0.08)', fg: '#8b5cf6', label: 'P2SH-P2WPKH · Nested SegWit' },
    'p2sh-p2wsh': { bg: 'rgba(139,92,246,0.08)', fg: '#8b5cf6', label: 'P2SH-P2WSH · Nested SegWit' },
    p2wpkh: { bg: 'rgba(59,130,246,0.08)', fg: '#3b82f6', label: 'P2WPKH · Native SegWit' },
    p2wsh: { bg: 'rgba(6,182,212,0.08)', fg: '#06b6d4', label: 'P2WSH · SegWit Script' },
    p2tr: { bg: 'rgba(16,185,129,0.08)', fg: '#10b981', label: 'P2TR · Taproot' },
    op_return: { bg: 'rgba(244,63,94,0.08)', fg: '#f43f5e', label: 'OP_RETURN · Data' },
  };
  return map[t] || { bg: 'rgba(82,82,91,0.1)', fg: '#71717a', label: (t || 'unknown').toUpperCase() };
}

export function warningText(w: { code: string } | string): string {
  return typeof w === 'string' ? w : w.code;
}

export function copyText(text: string) {
  navigator.clipboard.writeText(text);
}

/* ================================================================
   TOOLTIPS / TIPS — plain-English Bitcoin explanations
   ================================================================ */

export const TIPS: Record<string, string> = {
  transaction: 'A Bitcoin transaction is like a digital check — it moves value from one person to another by referencing previous money received and creating new amounts for recipients.',
  input: 'An input is money being spent. It points to coins you previously received. Like breaking a $20 bill, you must spend the whole previous amount.',
  output: 'An output defines who gets the money and how much. Each output creates a new "coin" that the recipient can spend later.',
  fee: 'The fee is the leftover amount (inputs minus outputs). It goes to the miner as a reward for processing your transaction — like a service tip.',
  'fee rate': 'Fee rate (sats/vB) tells miners how urgently you want your transaction processed. Higher rate = faster confirmation, like paying for same-day delivery.',
  vbytes: "Virtual bytes (vB) measure a transaction's effective size for fee calculation. SegWit transactions get a size discount, making them cheaper to send.",
  weight: 'Weight units measure the "true size" of a transaction: witness (signature) data counts at ¼ rate. 1 vByte = 4 weight units.',
  segwit: 'Segregated Witness (SegWit) is a Bitcoin upgrade that moves signature data into a separate section, reducing effective transaction size and fees.',
  txid: 'Transaction ID — a unique 64-character fingerprint that identifies this specific transaction on the blockchain, like a receipt number.',
  wtxid: 'Witness TX ID — similar to txid but also includes the signature data. Only exists for SegWit transactions.',
  p2pkh: 'Pay-to-Public-Key-Hash — The classic Bitcoin address format starting with "1". Requires a signature and public key to spend.',
  p2sh: 'Pay-to-Script-Hash — Addresses starting with "3". Can hold complex spending rules, like requiring 2-of-3 signatures (multisig).',
  p2wpkh: 'Pay-to-Witness-Public-Key-Hash — Native SegWit address (bc1q…). Like P2PKH but cheaper to spend thanks to the SegWit discount.',
  p2wsh: 'Pay-to-Witness-Script-Hash — SegWit version of P2SH. Complex scripts with lower fees.',
  p2tr: 'Pay-to-Taproot — The newest Bitcoin address format (bc1p…). Uses advanced cryptography (Schnorr signatures) for better privacy and efficiency.',
  op_return: "OP_RETURN — A special output that embeds data on the blockchain. It's provably unspendable (burned). Used for timestamps, tokens, or messages.",
  rbf: 'Replace-By-Fee (RBF) — When enabled, the sender can replace this transaction with a new version paying a higher fee if the first one gets stuck.',
  nsequence: 'The nSequence number controls two features: RBF signaling (if below 0xFFFFFFFE, RBF is on) and relative timelocks (countdown timers).',
  locktime: 'Locktime prevents a transaction from being confirmed before a certain block height or calendar time — like postdating a check.',
  dust: "A 'dust' output is so tiny (often under 546 sats) that it costs more in fees to spend than it's worth.",
};
