import { useState, useCallback, useRef } from 'react';
import type { BlockReport, TransactionReport, VoutEntry } from '../lib';
import { analyzeBlock as apiBlock, formatSats, formatBTC, scriptColor, copyText } from '../lib';
import { BlockScriptBars, FeeDistribution, DonutChart } from './Charts';

interface Props { showToast: (msg: string) => void; }
interface FileState { file: File | null; name: string; }

export default function BlockPanel({ showToast }: Props) {
  const [blk, setBlk] = useState<FileState>({ file: null, name: '' });
  const [rev, setRev] = useState<FileState>({ file: null, name: '' });
  const [xor, setXor] = useState<FileState>({ file: null, name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockReport[] | null>(null);

  const analyze = useCallback(async () => {
    if (!blk.file || !rev.file || !xor.file) {
      setError('Please select all three files: blk*.dat, rev*.dat, and xor.dat');
      return;
    }
    setError(null); setBlocks(null); setLoading(true);
    try {
      const [a, b, c] = await Promise.all([blk.file.arrayBuffer(), rev.file.arrayBuffer(), xor.file.arrayBuffer()]);
      const res = await apiBlock(a, b, c);
      if (res.ok) setBlocks((res as any).blocks);
      else setError((res as any).error?.code + ': ' + (res as any).error?.message);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [blk, rev, xor]);

  const doCopy = useCallback((text: string) => { copyText(text); showToast('Copied to clipboard'); }, [showToast]);

  return (
    <div className="fade-up">
      <div className="card">
        <div className="card-title">Block Files Upload</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
          Upload the three block data files from your Bitcoin Core data directory.
        </div>
        <div className="upload-grid">
          <UploadBox label="blk*.dat" hint="Block data" state={blk} onChange={setBlk} />
          <UploadBox label="rev*.dat" hint="Undo / reverse data" state={rev} onChange={setRev} />
          <UploadBox label="xor.dat" hint="XOR key file" state={xor} onChange={setXor} />
        </div>
        <button className="btn btn-primary" onClick={analyze} disabled={loading}>
          {loading ? '⏳ Analyzing…' : '→ Analyze Block'}
        </button>
      </div>

      {error && <div className="error-banner fade-up">⚠ {error}</div>}
      {loading && <div className="loading-overlay"><div className="spinner" /><div className="loading-text">Analyzing block data — this may take a moment…</div></div>}
      {blocks && <BlockResults blocks={blocks} onCopy={doCopy} />}
    </div>
  );
}

/* ================================================================
   UPLOAD BOX
   ================================================================ */
function UploadBox({ label, hint, state, onChange }: {
  label: string; hint: string; state: FileState; onChange: (s: FileState) => void;
}) {
  return (
    <label className={`upload-box ${state.file ? 'has-file' : ''}`}>
      <input type="file" accept=".dat" onChange={e => {
        const f = e.target.files?.[0] ?? null;
        onChange({ file: f, name: f?.name ?? '' });
      }} />
      <div className="upload-icon">{state.file ? '✓' : '⬆'}</div>
      <div className="upload-label">{label}</div>
      <div className="upload-hint">{hint}</div>
      {state.name && <div className="upload-file-name">{state.name}</div>}
    </label>
  );
}

/* ================================================================
   BLOCK RESULTS
   ================================================================ */
function BlockResults({ blocks, onCopy }: { blocks: BlockReport[]; onCopy: (s: string) => void }) {
  const valid = blocks.filter(b => (b as any).ok !== false);
  if (!valid.length) return <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>No valid blocks found.</div>;

  const totalTx = valid.reduce((s, b) => s + (b.tx_count || 0), 0);
  const totalFees = valid.reduce((s, b) => s + (b.block_stats?.total_fees_sats || 0), 0);
  const totalWeight = valid.reduce((s, b) => s + (b.block_stats?.total_weight || 0), 0);

  return (
    <div className="fade-up">
      {/* Summary */}
      <div className="card">
        <div className="card-title">Block Analysis Summary</div>
        <div className="stats-grid" style={{ marginBottom: 0 }}>
          <div className="stat-card"><div className="stat-label">Blocks</div><div className="stat-value accent">{valid.length}</div></div>
          <div className="stat-card"><div className="stat-label">Total Transactions</div><div className="stat-value">{totalTx.toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-label">Total Fees</div><div className="stat-value green">{formatSats(totalFees)}</div><div className="stat-sub">{formatBTC(totalFees)}</div></div>
          <div className="stat-card"><div className="stat-label">Total Weight</div><div className="stat-value">{totalWeight.toLocaleString()} WU</div></div>
        </div>
      </div>

      {valid.map((block, bi) => <BlockCard key={bi} block={block} idx={bi} onCopy={onCopy} />)}
    </div>
  );
}

/* ================================================================
   SINGLE BLOCK
   ================================================================ */
function BlockCard({ block, idx, onCopy }: { block: BlockReport; idx: number; onCopy: (s: string) => void }) {
  const [txOpen, setTxOpen] = useState(false);
  const hdr = block.block_header;
  const stats = block.block_stats;
  const summary = stats?.script_type_summary || {};

  // SegWit vs Legacy transaction count for donut
  const segwitCount = (block.transactions || []).filter(tx => tx.segwit).length;
  const legacyCount = (block.transactions || []).length - segwitCount;
  const formatSlices = [
    { label: 'SegWit', value: segwitCount, color: '#3b82f6' },
    { label: 'Legacy', value: legacyCount, color: '#64748b' },
  ];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 14 }}>
        Block #{idx + 1}{block.coinbase?.bip34_height ? ` — Height ${block.coinbase.bip34_height.toLocaleString()}` : ''}
      </div>

      {/* Hash */}
      <div style={{ marginBottom: 18 }}>
        <div className="stat-label" style={{ marginBottom: 4 }}>Block Hash</div>
        <div className="hash" onClick={() => onCopy(hdr?.block_hash || '')} title="Click to copy">{hdr?.block_hash || '—'}</div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Transactions</div><div className="stat-value">{(block.tx_count || 0).toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-label">Total Fees</div><div className="stat-value green">{formatSats(stats?.total_fees_sats)}</div><div className="stat-sub">{formatBTC(stats?.total_fees_sats || 0)}</div></div>
        <div className="stat-card"><div className="stat-label">Total Weight</div><div className="stat-value">{(stats?.total_weight || 0).toLocaleString()} WU</div></div>
        <div className="stat-card"><div className="stat-label">Avg Fee Rate</div><div className="stat-value accent">{stats?.avg_fee_rate_sat_vb || 0} sat/vB</div></div>
        <div className="stat-card"><div className="stat-label">Merkle Root</div><div className="stat-value" style={{ color: hdr?.merkle_root_valid ? 'var(--green)' : 'var(--red)', fontSize: 14 }}>{hdr?.merkle_root_valid ? '✓ Valid' : '✗ Invalid'}</div></div>
        <div className="stat-card"><div className="stat-label">Timestamp</div><div className="stat-value" style={{ fontSize: 13 }}>{hdr?.timestamp ? new Date(hdr.timestamp * 1000).toLocaleString() : '—'}</div></div>
      </div>

      {/* Charts */}
      <div className="charts-row">
        <BlockScriptBars summary={summary} />
        <FeeDistribution transactions={block.transactions || []} />
        <DonutChart
          slices={formatSlices}
          title="Transaction Format"
          centerValue={String((block.transactions || []).length)}
          centerLabel="Txns"
        />
      </div>

      {/* Coinbase */}
      {block.coinbase && (
        <div style={{ marginBottom: 16, padding: 16, background: 'var(--brand-50)', border: '1px solid rgba(16,185,129,0.1)', borderRadius: 'var(--r-sm)' }}>
          <div className="stat-label" style={{ color: 'var(--brand)', marginBottom: 6 }}>⛏ Coinbase (Block Reward)</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Height: <strong>{block.coinbase.bip34_height?.toLocaleString() ?? '—'}</strong> · Reward + Fees: <strong>{formatSats(block.coinbase.total_output_sats)}</strong>
          </div>
        </div>
      )}

      {/* Transaction list */}
      <div className="detail-section" style={{ marginBottom: 0 }}>
        <div className={`detail-header ${txOpen ? 'open' : ''}`} onClick={() => setTxOpen(!txOpen)}>
          <div className="detail-header-title">Transactions <span className="count-badge">{block.transactions?.length ?? 0}</span></div>
          <span className="detail-chevron">▾</span>
        </div>
        {txOpen && (
          <div className="detail-body fade-up">
            {(block.transactions || []).slice(0, 200).map((tx, ti) => (
              <BlockTxRow key={ti} tx={tx} idx={ti} />
            ))}
            {(block.transactions?.length ?? 0) > 200 && (
              <div style={{ textAlign: 'center', padding: 12, color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                Showing 200 of {block.transactions!.length} transactions
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   BLOCK TX ROW
   ================================================================ */
function BlockTxRow({ tx, idx }: { tx: TransactionReport; idx: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="block-tx-row" onClick={() => setOpen(!open)}>
        <span className="block-tx-idx">#{idx}</span>
        <span className="block-tx-id">{tx.txid || '—'}</span>
        <span className="block-tx-fee">{idx === 0 ? 'Coinbase' : formatSats(tx.fee_sats)}</span>
      </div>
      {open && (
        <div className="block-tx-detail fade-up">
          <div className="stats-grid" style={{ marginBottom: 8 }}>
            <div className="stat-card"><div className="stat-label">Inputs</div><div className="stat-value">{(tx.vin || []).length}</div></div>
            <div className="stat-card"><div className="stat-label">Outputs</div><div className="stat-value">{(tx.vout || []).length}</div></div>
            <div className="stat-card"><div className="stat-label">Size</div><div className="stat-value">{tx.size_bytes || '—'} B</div></div>
            <div className="stat-card"><div className="stat-label">Weight</div><div className="stat-value">{tx.weight || '—'} WU</div></div>
            <div className="stat-card"><div className="stat-label">Fee Rate</div><div className="stat-value accent">{tx.fee_rate_sat_vb || '—'} sat/vB</div></div>
            <div className="stat-card"><div className="stat-label">SegWit</div><div className="stat-value">{tx.segwit ? 'Yes' : 'No'}</div></div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {(tx.vout || []).map((o: VoutEntry, oi: number) => {
              const c = scriptColor(o.script_type);
              return <span key={oi} className="type-badge" style={{ background: c.bg, color: c.fg }}>{(o.script_type || '?').toUpperCase()} · {formatSats(o.value_sats)}</span>;
            })}
          </div>
        </div>
      )}
    </>
  );
}
