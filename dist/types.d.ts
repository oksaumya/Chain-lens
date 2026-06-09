/**
 * types.ts — Shared TypeScript interfaces for Bitcoin parsing
 */
export interface RawInput {
    txid: string;
    vout: number;
    scriptSig: Buffer;
    sequence: number;
}
export interface RawOutput {
    value: number;
    scriptPubKey: Buffer;
}
export interface ParsedTransaction {
    version: number;
    inputs: RawInput[];
    outputs: RawOutput[];
    witness: Buffer[][];
    locktime: number;
    segwit: boolean;
    /** Serialized bytes used for computing txid (without witness) */
    txidPreimage: Buffer;
    /** Full serialized bytes (with witness if present) */
    wtxidPreimage: Buffer;
    /** Total serialized size in bytes */
    size: number;
}
export interface Prevout {
    txid: string;
    vout: number;
    value_sats: number;
    script_pubkey_hex: string;
}
export interface TransactionFixture {
    network: string;
    raw_tx: string;
    prevouts: Prevout[];
}
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
    prevout: {
        value_sats: number;
        script_pubkey_hex: string;
    };
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
export interface Warning {
    code: string;
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
    warnings: Warning[];
}
export interface ErrorReport {
    ok: false;
    error: {
        code: string;
        message: string;
    };
}
export type CliOutput = TransactionReport | ErrorReport;
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
export interface ScriptTypeSummary {
    [key: string]: number;
}
export interface BlockStats {
    total_fees_sats: number;
    total_weight: number;
    avg_fee_rate_sat_vb: number;
    script_type_summary: ScriptTypeSummary;
}
export interface BlockReport {
    ok: true;
    mode: 'block';
    block_header: BlockHeader;
    tx_count: number;
    coinbase: CoinbaseInfo;
    transactions: TransactionReport[];
    block_stats: BlockStats;
}
//# sourceMappingURL=types.d.ts.map