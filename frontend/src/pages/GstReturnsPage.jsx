/**
 * GstReturnsPage — GSTR-1 & GSTR-3B summaries for the Indian market
 * Route: /gst-returns
 * Data:
 *   GET /gst/gstr1?outlet_id&from&to  → { period, gstin, b2cs[], hsn[], docs, totals }
 *   GET /gst/gstr3b?outlet_id&from&to → { period, gstin, section_3_1_a, section_3_1_c|null, section_4_itc, tax_payable, notes[] }
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { RefreshCw, AlertTriangle, Download, FileText, Receipt, Info } from 'lucide-react';

/* ── Formatting helpers ────────────────────────────────────────────────────── */
const inr = n =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function startOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().split('T')[0];
}
function endOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return x.toISOString().split('T')[0];
}
const TODAY = () => new Date().toISOString().split('T')[0];

/* ── Primitives (mirror BusinessHealthPage) ────────────────────────────────── */
function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: 'var(--bg-card, var(--bg-secondary))', borderColor: 'var(--border)', ...style }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, right }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {right}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <p className="mt-2.5 text-[26px] leading-none font-semibold tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
    </Card>
  );
}

/* Small download helper: serialise a payload and trigger a browser download. */
function downloadJson(payload, filename) {
  try {
    const blob = new Blob([JSON.stringify(payload ?? {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    /* no-op — defensive */
  }
}

/* Shared table chrome to keep the two returns visually consistent. */
const thCls = 'text-left text-[11px] font-medium uppercase tracking-wide px-4 py-2.5';
const tdCls = 'px-4 py-2.5 text-[13px] tabular-nums';

const TABS = [
  { key: 'gstr1', label: 'GSTR-1' },
  { key: 'gstr3b', label: 'GSTR-3B' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function GstReturnsPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;

  const [activeTab, setActiveTab] = useState('gstr1');
  const now = new Date();
  const [range, setRange] = useState({ from: startOfMonth(now), to: TODAY() });
  const { from, to } = range;

  const setThisMonth = () => {
    const d = new Date();
    setRange({ from: startOfMonth(d), to: TODAY() });
  };
  const setLastMonth = () => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    setRange({ from: startOfMonth(last), to: endOfMonth(last) });
  };

  const path =
    activeTab === 'gstr1'
      ? `/gst/gstr1?outlet_id=${outletId || ''}&from=${from}&to=${to}`
      : `/gst/gstr3b?outlet_id=${outletId || ''}&from=${from}&to=${to}`;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['gst-returns', activeTab, outletId, from, to],
    queryFn: () => api.get(path).then(r => r.data),
    staleTime: 120_000,
  });

  const gstin = data?.gstin || '—';

  /* ── Header (always rendered so tabs/range stay usable across states) ─────── */
  const header = (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>GST Returns</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            GSTR-1 &amp; GSTR-3B — India
          </p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>GSTIN</span>
          <p className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{gstin}</p>
        </div>
      </div>

      {/* Range controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {[
            { label: 'This month', onClick: setThisMonth, active: from === startOfMonth(new Date()) && to === TODAY() },
            {
              label: 'Last month',
              onClick: setLastMonth,
              active:
                from === startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)) &&
                to === endOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
            },
          ].map(b => (
            <button
              key={b.label}
              onClick={b.onClick}
              className="px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: b.active ? 'var(--accent)' : 'transparent',
                color: b.active ? 'var(--accent-text, #fff)' : 'var(--text-secondary)',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            max={to}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="px-2.5 py-1.5 text-xs rounded-md border bg-transparent tabular-nums"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>to</span>
          <input
            type="date"
            value={to}
            min={from}
            max={TODAY()}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="px-2.5 py-1.5 text-xs rounded-md border bg-transparent tabular-nums"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        {data?.period && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{data.period}</span>
        )}
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-4 py-1.5 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              style={{
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-text, #fff)' : 'var(--text-secondary)',
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </>
  );

  /* ── Loading ─────────────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-5">
        {header}
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
          <span className="ml-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading GST returns…</span>
        </div>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────────────── */
  if (isError) {
    return (
      <div className="max-w-7xl mx-auto space-y-5">
        {header}
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <AlertTriangle className="w-8 h-8" style={{ color: '#dc2626' }} />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Couldn’t load GST returns</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {error?.response?.data?.message || error?.message || 'Unexpected error'}
            </p>
          </div>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  if (!data) {
    return (
      <div className="max-w-7xl mx-auto space-y-5">
        {header}
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <Receipt className="w-8 h-8" style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No GST data for this period</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Try a different month or date range.</p>
        </Card>
      </div>
    );
  }

  /* ── GSTR-1 ──────────────────────────────────────────────────────────────── */
  const renderGstr1 = () => {
    const totals = data.totals || {};
    const b2cs = data.b2cs || [];
    const hsn = data.hsn || [];
    const docs = data.docs || {};
    const fname = `GSTR1_${from}_${to}.json`;

    return (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Taxable Value" value={inr(totals.taxable_value)} />
          <Metric label="CGST" value={inr(totals.cgst)} />
          <Metric label="SGST" value={inr(totals.sgst)} />
          <Metric label="Total Tax" value={inr(totals.total_tax)} />
        </div>

        {/* B2C (Small) — rate-wise */}
        <Card>
          <SectionHeader
            title="B2C (Small) — rate-wise"
            right={
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {(b2cs || []).length} rate{(b2cs || []).length === 1 ? '' : 's'}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className={thCls} style={{ color: 'var(--text-secondary)' }}>Rate %</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Taxable Value</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>CGST</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>SGST</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Cess</th>
                  <th className={thCls} style={{ color: 'var(--text-secondary)' }}>Place of Supply</th>
                </tr>
              </thead>
              <tbody>
                {b2cs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                      No B2C (Small) supplies in this period.
                    </td>
                  </tr>
                ) : (
                  b2cs.map((r, i) => (
                    <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <td className={tdCls} style={{ color: 'var(--text-primary)' }}>{Number(r?.rate || 0)}%</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-primary)' }}>{inr(r?.taxable_value)}</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(r?.cgst)}</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(r?.sgst)}</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(r?.cess)}</td>
                      <td className={tdCls} style={{ color: 'var(--text-secondary)' }}>{r?.place_of_supply || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* HSN Summary */}
        <Card>
          <SectionHeader
            title="HSN Summary"
            right={
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {(hsn || []).length} code{(hsn || []).length === 1 ? '' : 's'}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className={thCls} style={{ color: 'var(--text-secondary)' }}>HSN</th>
                  <th className={thCls} style={{ color: 'var(--text-secondary)' }}>Description</th>
                  <th className={thCls} style={{ color: 'var(--text-secondary)' }}>UQC</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Qty</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Taxable Value</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Rate</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>CGST</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>SGST</th>
                </tr>
              </thead>
              <tbody>
                {hsn.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                      No HSN summary for this period.
                    </td>
                  </tr>
                ) : (
                  hsn.map((r, i) => (
                    <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <td className={tdCls} style={{ color: 'var(--text-primary)' }}>{r?.hsn_code || '—'}</td>
                      <td className="px-4 py-2.5 text-[13px] max-w-[220px] truncate" style={{ color: 'var(--text-primary)' }} title={r?.description || ''}>
                        {r?.description || '—'}
                      </td>
                      <td className={tdCls} style={{ color: 'var(--text-secondary)' }}>{r?.uqc || '—'}</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>
                        {Number(r?.total_qty || 0).toLocaleString('en-IN')}
                      </td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-primary)' }}>{inr(r?.taxable_value)}</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{Number(r?.rate || 0)}%</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(r?.cgst)}</td>
                      <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(r?.sgst)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Docs + download */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {Number(docs.invoices_count || 0).toLocaleString('en-IN')} invoice{Number(docs.invoices_count || 0) === 1 ? '' : 's'}
            {' · '}
            {inr(docs.total_value)} total value
          </span>
          <button onClick={() => downloadJson(data, fname)} className="btn-secondary btn-sm">
            <Download className="w-3.5 h-3.5" /> Download GSTR-1 JSON
          </button>
        </div>
      </>
    );
  };

  /* ── GSTR-3B ─────────────────────────────────────────────────────────────── */
  const renderGstr3b = () => {
    const a = data.section_3_1_a || {};
    const c = data.section_3_1_c || null;
    const itc = data.section_4_itc || {};
    const payable = data.tax_payable || {};
    const notes = data.notes || [];
    const fname = `GSTR3B_${from}_${to}.json`;

    const supplyRow = (label, s) => (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Taxable Value</th>
              <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>IGST</th>
              <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>CGST</th>
              <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>SGST</th>
              <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Cess</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${tdCls} text-right`} style={{ color: 'var(--text-primary)' }}>{inr(s?.taxable_value)}</td>
              <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(s?.igst)}</td>
              <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(s?.cgst)}</td>
              <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(s?.sgst)}</td>
              <td className={`${tdCls} text-right`} style={{ color: 'var(--text-secondary)' }}>{inr(s?.cess)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );

    return (
      <>
        {/* 3.1(a) Outward taxable supplies */}
        <Card>
          <SectionHeader title="3.1(a) — Outward taxable supplies (other than zero-rated, nil & exempt)" />
          {supplyRow('3.1(a)', a)}
        </Card>

        {/* 3.1(c) Nil / exempt — only when present */}
        {c && (
          <Card>
            <SectionHeader title="3.1(c) — Other outward supplies (nil-rated, exempt)" />
            {supplyRow('3.1(c)', c)}
          </Card>
        )}

        {/* Section 4 ITC */}
        <Card>
          <SectionHeader title="4 — Eligible ITC" />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>IGST</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>CGST</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>SGST</th>
                  <th className={`${thCls} text-right`} style={{ color: 'var(--text-secondary)' }}>Cess</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${tdCls} text-right`} style={{ color: 'var(--text-primary)' }}>{inr(itc?.igst)}</td>
                  <td className={`${tdCls} text-right`} style={{ color: 'var(--text-primary)' }}>{inr(itc?.cgst)}</td>
                  <td className={`${tdCls} text-right`} style={{ color: 'var(--text-primary)' }}>{inr(itc?.sgst)}</td>
                  <td className={`${tdCls} text-right`} style={{ color: 'var(--text-primary)' }}>{inr(itc?.cess)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Tax Payable — prominent */}
        <Card>
          <SectionHeader
            title="Tax Payable"
            right={
              <span className="text-[15px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {inr(payable.total)}
              </span>
            }
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y" style={{ borderColor: 'var(--border)' }}>
            {[
              ['IGST', payable.igst],
              ['CGST', payable.cgst],
              ['SGST', payable.sgst],
              ['Cess', payable.cess],
            ].map(([label, val], i) => (
              <div key={i} className="px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>{inr(val)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Notes */}
        {(notes || []).length > 0 && (
          <Card className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Info className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Notes</span>
            </div>
            <ul className="space-y-1.5">
              {notes.map((n, i) => (
                <li key={i} className="text-xs leading-relaxed flex gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <span aria-hidden="true">·</span>
                  <span>{String(n)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Download */}
        <div className="flex justify-end">
          <button onClick={() => downloadJson(data, fname)} className="btn-secondary btn-sm">
            <Download className="w-3.5 h-3.5" /> Download GSTR-3B JSON
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {header}
      {activeTab === 'gstr1' ? renderGstr1() : renderGstr3b()}
    </div>
  );
}
