import { useMemo } from 'react';
import type { TransactionReport, VoutEntry } from '../lib';
import { formatSats } from '../lib';

/* DONUT */
interface DonutSlice { label: string; value: number; color: string; }
export function DonutChart({ slices, size = 150, title, centerValue, centerLabel }: {
    slices: DonutSlice[]; size?: number; title: string; centerValue?: string; centerLabel?: string;
}) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total === 0) return null;
    const r = (size - 20) / 2, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
    let cum = 0;
    const arcs = slices.filter(s => s.value > 0).map(s => {
        const pct = s.value / total, dash = circ * pct, gap = circ - dash, off = -cum;
        cum += dash;
        return { ...s, dash, gap, off, pct };
    });
    return (
        <div className="chart-card">
            <div className="chart-title">{title}</div>
            <div className="donut-wrap">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="12" />
                    {arcs.map((a, i) => (
                        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color} strokeWidth="12" strokeLinecap="round"
                            strokeDasharray={`${a.dash} ${a.gap}`} strokeDashoffset={a.off}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            style={{ transition: 'all 0.8s ease' }} />
                    ))}
                </svg>
                {(centerValue || centerLabel) && (
                    <div className="donut-center">
                        {centerValue && <div className="donut-center-value">{centerValue}</div>}
                        {centerLabel && <div className="donut-center-label">{centerLabel}</div>}
                    </div>
                )}
            </div>
            <div className="chart-legend">
                {arcs.map((a, i) => (
                    <div key={i} className="legend-item">
                        <div className="legend-dot" style={{ background: a.color }} />
                        {a.label}: {a.value.toLocaleString()} ({(a.pct * 100).toFixed(1)}%)
                    </div>
                ))}
            </div>
        </div>
    );
}

/* VALUE WATERFALL */
export function ValueWaterfall({ data }: { data: TransactionReport }) {
    const { total_input_sats: inS, total_output_sats: outS, fee_sats: feeS } = data;
    const mx = Math.max(inS, 1);
    return (
        <div className="chart-card">
            <div className="chart-title">Value Waterfall</div>
            <div className="bar-chart">
                <div className="bar-row"><div className="bar-label">Inputs</div><div className="bar-track">
                    <div className="bar-fill" style={{ width: '100%', background: 'linear-gradient(90deg, #46d369, #3cb85c)' }}>{formatSats(inS)}</div>
                </div></div>
                <div className="bar-row"><div className="bar-label">Outputs</div><div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(outS / mx * 100).toFixed(1)}%`, background: 'linear-gradient(90deg, #4ca1e8, #3d8fd4)' }}>{formatSats(outS)}</div>
                </div></div>
                <div className="bar-row"><div className="bar-label">Fee</div><div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(feeS / mx * 100, 2).toFixed(1)}%`, background: 'linear-gradient(90deg, #E50914, #b8070f)' }}>{formatSats(feeS)}</div>
                </div></div>
            </div>
        </div>
    );
}

/* SCRIPT TYPE DONUT */
export function ScriptTypeDonut({ vout, title = 'Output Script Types' }: { vout: VoutEntry[]; title?: string }) {
    const counts = useMemo(() => {
        const m: Record<string, number> = {};
        vout.forEach(v => { const t = v.script_type || 'unknown'; m[t] = (m[t] || 0) + 1; });
        return m;
    }, [vout]);
    const C: Record<string, string> = {
        p2pkh: '#E50914', p2sh: '#b48efa', p2wpkh: '#4ca1e8', p2wsh: '#5ed1e5',
        p2tr: '#46d369', op_return: '#ff3b47', 'p2sh-p2wpkh': '#b48efa', 'p2sh-p2wsh': '#b48efa', unknown: '#5a5a5a',
    };
    const slices = Object.entries(counts).map(([l, v]) => ({ label: l.toUpperCase(), value: v, color: C[l] || '#5a5a5a' }));
    return <DonutChart slices={slices} title={title} centerValue={String(vout.length)} centerLabel="Outputs" />;
}

/* FEE GAUGE */
export function FeeGauge({ feeRate }: { feeRate: number }) {
    const maxR = 200, norm = Math.min(feeRate / maxR, 1), ang = norm * 180;
    const sz = 150, cx = sz / 2, cy = sz / 2 + 8, r = 52;
    const sa = Math.PI, ea = sa + (ang * Math.PI / 180);
    const sx = cx + r * Math.cos(sa), sy = cy + r * Math.sin(sa);
    const ex = cx + r * Math.cos(ea), ey = cy + r * Math.sin(ea);
    const bgEx = cx + r * Math.cos(0), bgEy = cy + r * Math.sin(0);
    const arc = `M ${sx} ${sy} A ${r} ${r} 0 ${ang > 180 ? 1 : 0} 1 ${ex} ${ey}`;
    const bg = `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${bgEx} ${bgEy}`;
    let color = '#46d369', label = 'Low';
    if (feeRate >= 50) { color = '#e6b91e'; label = 'Medium'; }
    if (feeRate >= 100) { color = '#E50914'; label = 'High'; }
    if (feeRate >= 150) { color = '#ff3b47'; label = 'Very High'; }
    return (
        <div className="chart-card">
            <div className="chart-title">Fee Rate</div>
            <div className="gauge-wrap" style={{ textAlign: 'center' }}>
                <svg width={sz} height={sz * 0.58} viewBox={`0 0 ${sz} ${sz * 0.62}`}>
                    <path d={bg} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="10" strokeLinecap="round" />
                    <path d={arc} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={{ transition: 'all 0.8s ease', filter: `drop-shadow(0 0 4px ${color}30)` }} />
                    <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize="20" fontWeight="800" fontFamily="Inter">{feeRate}</text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fill="#808080" fontSize="8" fontWeight="600" fontFamily="Inter" style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>sat/vB</text>
                </svg>
                <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: -2 }}>{label} Priority</div>
            </div>
        </div>
    );
}

/* BLOCK SCRIPT BARS */
export function BlockScriptBars({ summary }: { summary: Record<string, number> }) {
    const entries = Object.entries(summary).sort((a, b) => b[1] - a[1]);
    const mx = entries.length > 0 ? entries[0][1] : 1;
    const C: Record<string, string> = {
        p2pkh: '#E50914', p2sh: '#b48efa', p2wpkh: '#4ca1e8', p2wsh: '#5ed1e5',
        p2tr: '#46d369', op_return: '#ff3b47', 'p2sh-p2wpkh': '#b48efa', 'p2sh-p2wsh': '#b48efa', unknown: '#5a5a5a',
    };
    return (
        <div className="chart-card">
            <div className="chart-title">Script Distribution</div>
            <div className="bar-chart">
                {entries.map(([t, c]) => (
                    <div className="bar-row" key={t}>
                        <div className="bar-label">{t.toUpperCase()}</div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${(c / mx * 100).toFixed(1)}%`, background: C[t] || '#5a5a5a' }}>{c.toLocaleString()}</div></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* FEE DISTRIBUTION */
export function FeeDistribution({ transactions }: { transactions: TransactionReport[] }) {
    const buckets = useMemo(() => {
        const r = [{ label: '0-5', min: 0, max: 5, count: 0 }, { label: '5-20', min: 5, max: 20, count: 0 }, { label: '20-50', min: 20, max: 50, count: 0 }, { label: '50-100', min: 50, max: 100, count: 0 }, { label: '100+', min: 100, max: Infinity, count: 0 }];
        transactions.forEach(tx => { const rate = tx.fee_rate_sat_vb || 0; const b = r.find(x => rate >= x.min && rate < x.max); if (b) b.count++; });
        return r;
    }, [transactions]);
    const mx = Math.max(...buckets.map(b => b.count), 1);
    const colors = ['#46d369', '#4ca1e8', '#b48efa', '#e6b91e', '#ff3b47'];
    return (
        <div className="chart-card">
            <div className="chart-title">Fee Distribution (sat/vB)</div>
            <div className="bar-chart">
                {buckets.map((b, i) => (
                    <div className="bar-row" key={b.label}>
                        <div className="bar-label">{b.label}</div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${(b.count / mx * 100).toFixed(1)}%`, background: colors[i] }}>{b.count.toLocaleString()}</div></div>
                    </div>
                ))}
            </div>
        </div>
    );
}
