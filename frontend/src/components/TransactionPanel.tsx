import { useState, useEffect, useCallback, useRef } from 'react';
import type { TransactionReport, VinEntry, VoutEntry, SegwitSavings } from '../lib';
import {
  fetchFixtures, fetchFixture, analyzeTransaction as apiAnalyze,
  formatSats, formatBTC, truncHash, scriptColor, warningText, copyText, TIPS,
} from '../lib';
import FlowDiagram from './FlowDiagram';
import { ScriptTypeDonut, ValueWaterfall, FeeGauge } from './Charts';

/* ================================================================
   TOOLTIP
   ================================================================ */
function Tip({ term }: { term: string }) {
  const text = TIPS[term.toLowerCase()];
  if (!text) return <>{term}</>;
  return (
    <span className="tip">
      {term}
      <span className="tip-popup">{text}</span>
    </span>
  );
}

function Badge({ type }: { type: string }) {
  const c = scriptColor(type);
  return <span className="type-badge" style={{ background: c.bg, color: c.fg }}>{c.label}</span>;
}

/* ================================================================
   MAIN PANEL
   ================================================================ */
interface Props { showToast: (msg: string) => void; }

export default function TransactionPanel({ showToast }: Props) {
  const [input, setInput] = useState('');
  const [fixtures, setFixtures] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionReport | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchFixtures().then(setFixtures); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadFixture = useCallback(async (name: string) => {
    setDropdownOpen(false);
    try {
      const data = await fetchFixture(name);
      setInput(JSON.stringify(data, null, 2));
    } catch (e: any) { setError('Failed to load fixture: ' + e.message); }
  }, []);

  const analyze = useCallback(async () => {
    if (!input.trim()) return;
    setError(null); setResult(null); setLoading(true);
    try {
      const fixture = JSON.parse(input);
      const res = await apiAnalyze(fixture);
      if (res.ok) setResult(res as TransactionReport);
      else setError((res as any).error?.code + ': ' + (res as any).error?.message);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [input]);

  const doCopy = useCallback((text: string) => {
    copyText(text);
    showToast('Copied to clipboard');
  }, [showToast]);

  return (
    <div className="fade-up">
      {/* INPUT CARD */}
      <div className="card">
        <div className="card-title">Analyze a Transaction</div>
        <label className="input-label">
          Paste transaction data below, or load a sample to get started
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder='Paste your transaction JSON here...&#10;&#10;Example: {"network":"mainnet","raw_tx":"0200000001...","prevouts":[...]}'
          style={{ minHeight: 160 }}
        />
        <div className="btn-row">
          <button className="btn btn-primary" onClick={analyze} disabled={loading || !input.trim()}>
            {loading ? '⏳ Analyzing…' : '→ Analyze Transaction'}
          </button>
          <div className="dropdown-wrap" ref={dropRef}>
            <button className="btn btn-secondary" onClick={() => setDropdownOpen(!dropdownOpen)}>
              Load Sample ▾
            </button>
            {dropdownOpen && (
              <div className="dropdown-menu fade-up">
                {fixtures.length === 0 && <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12 }}>No fixtures found</div>}
                {fixtures.map(f => (
                  <button key={f} className="dropdown-item" onClick={() => loadFixture(f)}>
                    {f.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ERROR */}
      {error && <div className="error-banner fade-up">⚠ {error}</div>}

      {/* LOADING */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <div className="loading-text">Analyzing transaction…</div>
        </div>
      )}

      {/* RESULTS */}
      {result && <TransactionResults data={result} onCopy={doCopy} />}
    </div>
  );
}

/* ================================================================
   RESULTS VIEW
   ================================================================ */
function TransactionResults({ data: d, onCopy }: { data: TransactionReport; onCopy: (s: string) => void }) {
  const feePct = d.total_input_sats > 0 ? ((d.fee_sats / d.total_input_sats) * 100).toFixed(2) : '0';
  const warnCount = (d.warnings || []).length;
  const safeLabel = warnCount === 0 ? 'All Clear' : warnCount === 1 ? '1 Warning' : `${warnCount} Warnings`;

  return (
    <div className="fade-up">
      {/* ── SECTION 1: THE STORY ── */}
      <div className="story-section">
        <div className="story-section-title">What's in this transaction?</div>
        <div className="story-section-sub">A plain-English breakdown of what happened</div>
      </div>

      <StoryCards data={d} feePct={feePct} safeLabel={safeLabel} warnCount={warnCount} />

      {/* ── SECTION 2: VISUAL FLOW ── */}
      <FlowDiagram vin={d.vin} vout={d.vout} fee={d.fee_sats} />

      {/* ── SECTION 3: CHARTS ── */}
      <div className="charts-row">
        <ScriptTypeDonut vout={d.vout} />
        <ValueWaterfall data={d} />
        <FeeGauge feeRate={d.fee_rate_sat_vb} />
      </div>

      {/* ── SECTION 4: IDENTITY ── */}
      <div className={`txid-row ${d.wtxid ? 'has-wtxid' : ''}`}>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onCopy(d.txid)} title="Click to copy">
          <div className="stat-label"><Tip term="txid" /> · click to copy</div>
          <div className="hash">{d.txid}</div>
        </div>
        {d.wtxid && (
          <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onCopy(d.wtxid!)} title="Click to copy">
            <div className="stat-label"><Tip term="wtxid" /></div>
            <div className="hash">{d.wtxid}</div>
          </div>
        )}
      </div>

      {/* ── SECTION 5: KEY METRICS ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label"><Tip term="Fee" /></div>
          <div className="stat-value accent">{formatSats(d.fee_sats)}</div>
          <div className="stat-sub">{formatBTC(d.fee_sats)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Tip term="Fee Rate" /></div>
          <div className="stat-value accent">{d.fee_rate_sat_vb} sat/vB</div>
          <div className="stat-sub">{feePct}% of input</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Size</div>
          <div className="stat-value">{d.size_bytes} B</div>
          <div className="stat-sub">{d.vin.length} in · {d.vout.length} out</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Tip term="Weight" /></div>
          <div className="stat-value">{d.weight} WU</div>
          <div className="stat-sub">{d.vbytes} <Tip term="vbytes" /></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Version</div>
          <div className="stat-value">{d.version}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Format</div>
          <div className="stat-value blue">{d.segwit ? <Tip term="SegWit" /> : 'Legacy'}</div>
          <div className="stat-sub">{d.network}</div>
        </div>
      </div>

      {/* ── SECTION 6: RBF & LOCKTIME ── */}
      <InfoCards data={d} />

      {/* ── SECTION 7: SEGWIT SAVINGS ── */}
      {d.segwit_savings && <SegwitSavingsCard savings={d.segwit_savings} />}

      {/* ── SECTION 8: INPUTS ── */}
      <DetailSection title="Inputs" count={d.vin.length}>
        {d.vin.map((v, i) => <InputCard key={i} v={v} i={i} />)}
      </DetailSection>

      {/* ── SECTION 9: OUTPUTS ── */}
      <DetailSection title="Outputs" count={d.vout.length}>
        {d.vout.map((v, i) => <OutputCard key={i} v={v} i={i} />)}
      </DetailSection>

      {/* ── SECTION 10: WARNINGS ── */}
      {warnCount > 0 && <WarningsCard warnings={d.warnings} />}

      {/* ── SECTION 11: RAW DATA ── */}
      <DetailSection title="Raw Technical Data" count={0} badge="Advanced">
        <TechTable data={d} />
      </DetailSection>
    </div>
  );
}

/* ================================================================
   STORY CARDS — narrative step-by-step
   ================================================================ */
function StoryCards({ data: d, feePct, safeLabel, warnCount }: { data: TransactionReport; feePct: string; safeLabel: string; warnCount: number }) {
  const priorityLabel = d.fee_rate_sat_vb > 100 ? 'High priority — confirms fast' : d.fee_rate_sat_vb < 5 ? 'Low priority — may take a while' : 'Normal priority';

  return (
    <div className="story-grid-5">
      {/* HERO — spans full width */}
      <div className="story-card card-tx story-hero">
        <div className="story-icon">📝</div>
        <div>
          <div className="story-label">Overview</div>
          <div className="story-title">
            {d.vin.length === 1 ? 'Someone' : `${d.vin.length} senders`} sent Bitcoin to {d.vout.length} {d.vout.length === 1 ? 'recipient' : 'recipients'}
          </div>
          <div className="story-desc">
            This {d.segwit ? 'uses the modern SegWit format (saves on fees)' : 'uses the older Legacy format'}.
            {d.vin.length} source{d.vin.length !== 1 && 's'} of funds → {d.vout.length} destination{d.vout.length !== 1 && 's'}.
          </div>
        </div>
      </div>

      {/* VALUE */}
      <div className="story-card card-value">
        <div className="story-icon">💰</div>
        <div className="story-label">Value Moved</div>
        <div className="story-title">{formatBTC(d.total_input_sats)}</div>
        <div className="story-desc">
          {formatBTC(d.total_output_sats)} was delivered. The difference ({formatSats(d.fee_sats)}) is the processing fee.
        </div>
      </div>

      {/* COST */}
      <div className="story-card card-cost">
        <div className="story-icon">⚡</div>
        <div className="story-label">Fee & Speed</div>
        <div className="story-title">{formatSats(d.fee_sats)}</div>
        <div className="story-desc">
          That's {feePct}% of the total value. {priorityLabel}.
        </div>
      </div>

      {/* FORMAT — new 5th card */}
      <div className="story-card card-format">
        <div className="story-icon">📊</div>
        <div className="story-label">Size & Format</div>
        <div className="story-title">{d.size_bytes} bytes</div>
        <div className="story-desc">
          {d.segwit ? 'SegWit' : 'Legacy'} · {d.weight} weight units · {d.vbytes} virtual bytes.
        </div>
      </div>

      {/* SAFETY */}
      <div className="story-card card-safety">
        <div className="story-icon">{warnCount === 0 ? '✅' : '⚠️'}</div>
        <div className="story-label">Safety Check</div>
        <div className="story-title" style={{ color: warnCount === 0 ? 'var(--green)' : 'var(--yellow)' }}>{safeLabel}</div>
        <div className="story-desc">
          {warnCount === 0
            ? 'Everything looks good — no unusual patterns detected.'
            : <>{d.warnings.map((w, i) => <span key={i} style={{ fontWeight: 600 }}>{warningText(w)}{i < d.warnings.length - 1 ? '. ' : ''}</span>)}.</>}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   INFO CARDS
   ================================================================ */
function InfoCards({ data: d }: { data: TransactionReport }) {
  return (
    <div className="info-grid">
      <div className="info-card">
        <div className="info-card-icon" style={{ background: d.rbf_signaling ? 'linear-gradient(135deg, #E50914, #ff3b47)' : 'linear-gradient(135deg, #3d3d3d, #2a2a2a)' }}>⚡</div>
        <div>
          <div className="info-card-title">
            {d.rbf_signaling ? 'Can be sped up' : 'Speed is locked in'}
          </div>
          <div className="info-card-desc">
            {d.rbf_signaling
              ? 'The sender opted in to fee bumping — they can resubmit this transaction with a higher fee to speed it up.'
              : 'The sender did not opt in to fee bumping. Once broadcast, the fee cannot be increased.'
            }
          </div>
        </div>
      </div>
      <div className="info-card">
        <div className="info-card-icon" style={{ background: d.locktime_type !== 'none' ? 'linear-gradient(135deg, #b48efa, #9366e8)' : 'linear-gradient(135deg, #3d3d3d, #2a2a2a)' }}>🔒</div>
        <div>
          <div className="info-card-title">
            {d.locktime_type === 'none' ? 'No time restriction' : 'Time-locked transaction'}
          </div>
          <div className="info-card-desc">
            {d.locktime_type === 'none' && 'This transaction can be confirmed immediately — no waiting required.'}
            {d.locktime_type === 'block_height' && `Miners can't include this until block ${d.locktime_value.toLocaleString()} is reached.`}
            {d.locktime_type === 'unix_timestamp' && `Miners can't include this until ${new Date(d.locktime_value * 1000).toLocaleString()}.`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SEGWIT SAVINGS
   ================================================================ */
function SegwitSavingsCard({ savings: s }: { savings: SegwitSavings }) {
  const maxW = Math.max(s.weight_if_legacy, s.weight_actual, 1);
  const legPct = ((s.weight_if_legacy / maxW) * 100).toFixed(1);
  const actPct = ((s.weight_actual / maxW) * 100).toFixed(1);

  return (
    <div className="card segwit-card fade-up">
      <div className="card-title"><Tip term="SegWit" /> Savings</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.55 }}>
        Witness data counted at ¼ rate reduces effective size and fees.
      </div>
      <div className="segwit-bar-row">
        <div className="segwit-bar-label">If Legacy</div>
        <div className="segwit-bar-track">
          <div className="segwit-bar-fill legacy" style={{ width: `${legPct}%` }}>{s.weight_if_legacy} WU</div>
        </div>
      </div>
      <div className="segwit-bar-row">
        <div className="segwit-bar-label">With SegWit</div>
        <div className="segwit-bar-track">
          <div className="segwit-bar-fill actual" style={{ width: `${actPct}%` }}>{s.weight_actual} WU</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const, marginTop: 12 }}>
        <div className="segwit-savings-badge">
          ↓ {Math.abs(s.savings_pct).toFixed(1)}% {s.savings_pct > 0 ? 'smaller' : 'larger'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Witness: {s.witness_bytes}B · Non-witness: {s.non_witness_bytes}B · Total: {s.total_bytes}B
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   DETAIL SECTION (ACCORDION)
   ================================================================ */
function DetailSection({ title, count, badge, children }: { title: string; count: number; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="detail-section">
      <div className={`detail-header ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <div className="detail-header-title">
          {title} {count > 0 && <span className="count-badge">{count}</span>}
          {badge && <span className="count-badge" style={{ background: 'var(--s2)', color: 'var(--text3)' }}>{badge}</span>}
        </div>
        <span className="detail-chevron">▾</span>
      </div>
      {open && <div className="detail-body fade-up">{children}</div>}
    </div>
  );
}

/* ================================================================
   INPUT CARD
   ================================================================ */
function InputCard({ v, i }: { v: VinEntry; i: number }) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div className="io-card">
      <div className="io-card-header">
        <span className="io-card-idx">Input #{i}</span>
        <Badge type={v.script_type} />
        <span className="io-card-amount" style={{ color: 'var(--brand)' }}>{formatSats(v.prevout?.value_sats)}</span>
      </div>
      {v.address && <div className="io-card-addr">{v.address}</div>}
      {showDetail && (
        <div className="io-detail fade-up">
          <div className="io-detail-row"><span className="io-detail-key">Prev TX</span><span className="io-detail-val">{v.txid || '—'}</span></div>
          <div className="io-detail-row"><span className="io-detail-key">Output Index</span><span className="io-detail-val">{v.vout ?? '—'}</span></div>
          <div className="io-detail-row"><span className="io-detail-key"><Tip term="nSequence" /></span><span className="io-detail-val">0x{(v.sequence >>> 0).toString(16).toUpperCase()}</span></div>
          {v.script_sig_hex && <div className="io-detail-row"><span className="io-detail-key">ScriptSig (hex)</span><span className="io-detail-val" style={{ fontSize: 10 }}>{v.script_sig_hex}</span></div>}
          {v.script_asm && <div className="io-detail-row"><span className="io-detail-key">ScriptSig (asm)</span><span className="io-detail-val" style={{ fontSize: 10 }}>{v.script_asm}</span></div>}
          {v.witness?.length > 0 && <div className="io-detail-row"><span className="io-detail-key">Witness</span><span className="io-detail-val" style={{ fontSize: 10 }}>{v.witness.join('\n')}</span></div>}
          {v.prevout && <div className="io-detail-row"><span className="io-detail-key">Prevout Script</span><span className="io-detail-val" style={{ fontSize: 10 }}>{v.prevout.script_pubkey_hex}</span></div>}
          {v.relative_timelock?.enabled && (
            <div className="io-detail-row"><span className="io-detail-key">Relative Timelock</span><span className="io-detail-val">{v.relative_timelock.type === 'blocks' ? `${v.relative_timelock.value} blocks` : `${v.relative_timelock.value} seconds`}</span></div>
          )}
        </div>
      )}
      <button className="show-detail-btn" onClick={() => setShowDetail(!showDetail)}>
        {showDetail ? '▲ Hide details' : '▼ Show details'}
      </button>
    </div>
  );
}

/* ================================================================
   OUTPUT CARD
   ================================================================ */
function OutputCard({ v, i }: { v: VoutEntry; i: number }) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div className="io-card">
      <div className="io-card-header">
        <span className="io-card-idx">Output #{v.n ?? i}</span>
        <Badge type={v.script_type} />
        <span className="io-card-amount" style={{ color: 'var(--blue)' }}>{formatSats(v.value_sats)}</span>
      </div>
      {v.address && <div className="io-card-addr">{v.address}</div>}
      {!v.address && v.script_type === 'op_return' && <div className="io-card-addr" style={{ color: 'var(--red)' }}>Unspendable data output</div>}
      {showDetail && (
        <div className="io-detail fade-up">
          <div className="io-detail-row"><span className="io-detail-key">Script (hex)</span><span className="io-detail-val" style={{ fontSize: 10 }}>{v.script_pubkey_hex || '—'}</span></div>
          <div className="io-detail-row"><span className="io-detail-key">Script (asm)</span><span className="io-detail-val" style={{ fontSize: 10 }}>{v.script_asm || '—'}</span></div>
          <div className="io-detail-row"><span className="io-detail-key">Value (BTC)</span><span className="io-detail-val">{formatBTC(v.value_sats)}</span></div>
          {v.op_return_data_hex && <div className="io-detail-row"><span className="io-detail-key">OP_RETURN (hex)</span><span className="io-detail-val" style={{ fontSize: 10 }}>{v.op_return_data_hex}</span></div>}
          {v.op_return_data_utf8 && <div className="io-detail-row"><span className="io-detail-key">OP_RETURN (utf8)</span><span className="io-detail-val">{v.op_return_data_utf8}</span></div>}
        </div>
      )}
      <button className="show-detail-btn" onClick={() => setShowDetail(!showDetail)}>
        {showDetail ? '▲ Hide details' : '▼ Show details'}
      </button>
    </div>
  );
}

/* ================================================================
   WARNINGS
   ================================================================ */
function WarningsCard({ warnings }: { warnings: Array<{ code: string } | string> }) {
  return (
    <div className="card">
      <div className="card-title" style={{ color: 'var(--yellow)' }}>⚠ Warnings</div>
      {warnings.map((w, i) => {
        const text = warningText(w);
        const cls = /negative fee|high fee/i.test(text) ? 'danger' : /op_return|segwit/i.test(text) ? 'info' : 'warn';
        return <div key={i} className={`warning-item ${cls}`}>⚠ {text}</div>;
      })}
    </div>
  );
}

/* ================================================================
   TECH TABLE
   ================================================================ */
function TechTable({ data: d }: { data: TransactionReport }) {
  const rows: [string, string | number][] = [
    ['TXID', d.txid],
    ...(d.wtxid ? [['WTXID', d.wtxid] as [string, string]] : []),
    ['Version', d.version],
    ['Locktime', `${d.locktime} (${d.locktime_type})`],
    ['Size', `${d.size_bytes} bytes`],
    ['Weight', `${d.weight} WU`],
    ['vBytes', d.vbytes],
    ['Total In', formatSats(d.total_input_sats)],
    ['Total Out', formatSats(d.total_output_sats)],
    ['Fee', formatSats(d.fee_sats)],
    ['Fee Rate', `${d.fee_rate_sat_vb} sat/vB`],
    ['RBF', d.rbf_signaling ? 'Yes' : 'No'],
    ['SegWit', d.segwit ? 'Yes' : 'No'],
    ['Network', d.network],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 6 }}>
      {rows.map(([k, v]) => (
        <div className="io-detail-row" key={k}>
          <span className="io-detail-key">{k}</span>
          <span className="io-detail-val">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}
