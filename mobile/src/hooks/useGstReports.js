/**
 * useGstReports — region-aware GST / BAS reporting data hook.
 *
 * The tax regime follows the SELECTED OUTLET's region (never the logged-in
 * user), so we branch on useCurrency().isAU:
 *   • AU outlets  → a single BAS (Business Activity Statement) via
 *                   GET /api/reports/bas-report.
 *   • IN outlets  → GSTR-1 (GET /api/gst/gstr1), GSTR-3B (GET /api/gst/gstr3b),
 *                   and a rate-wise/HSN Summary (GET /api/reports/gstDetailed).
 *
 * Every request is scoped by outlet_id from useOutlet() (the owner's user row
 * often carries a null outlet_id, so we must pass the selected one explicitly).
 *
 * This file also exports a set of PURE helpers (period math + CSV/text export
 * builders) that carry no React/network dependency, so they can be unit-tested
 * in isolation (see mobile/__tests__/gstreports.test.js).
 */

import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';
import { useCurrency } from './useCurrency';

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Coerce anything to a finite number (null/undefined/NaN → 0). */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Format a Date as a local 'YYYY-MM-DD' string (no UTC shift). */
export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The selectable reporting periods, in display order. */
export const PERIOD_PRESETS = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_fy', label: 'This FY' },
];

/**
 * Resolve a preset key to a concrete { from, to } YYYY-MM-DD range.
 * Financial-year boundaries are region-aware: AU FY runs Jul 1 → Jun 30,
 * India FY runs Apr 1 → Mar 31.
 * @param {string} preset
 * @param {boolean} [isAU=false]
 * @param {Date} [ref=new Date()] injectable "today" for deterministic tests.
 */
export function periodRange(preset, isAU = false, ref = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth(); // 0-11
  switch (preset) {
    case 'this_month':
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case 'this_quarter': {
      const q = Math.floor(m / 3);
      return { from: ymd(new Date(y, q * 3, 1)), to: ymd(new Date(y, q * 3 + 3, 0)) };
    }
    case 'this_fy': {
      if (isAU) {
        const startY = m >= 6 ? y : y - 1; // Jul = month 6
        return { from: ymd(new Date(startY, 6, 1)), to: ymd(new Date(startY + 1, 5, 30)) };
      }
      const startY = m >= 3 ? y : y - 1; // Apr = month 3
      return { from: ymd(new Date(startY, 3, 1)), to: ymd(new Date(startY + 1, 2, 31)) };
    }
    default:
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
  }
}

/** Human label for a preset key. */
export function periodLabel(preset) {
  const found = PERIOD_PRESETS.find((p) => p.key === preset);
  return found ? found.label : 'This Month';
}

/** True when a report payload has no billable activity for the period. */
export function isReportEmpty(region, tab, data) {
  if (!data) return true;
  if (region === 'AU') {
    return num(data.order_count) === 0 && num(data.g1_total_sales_incl_gst) === 0;
  }
  if (tab === 'gstr1') {
    return num(data?.totals?.taxable) === 0 && (data?.b2cs?.length || 0) === 0 && num(data?.docs?.invoices_count) === 0;
  }
  if (tab === 'gstr3b') {
    return num(data?.section_3_1_a?.taxable_value) === 0 && num(data?.tax_payable?.total) === 0;
  }
  // summary (gstDetailed)
  return num(data?.totals?.order_count) === 0 && (data?.by_rate?.length || 0) === 0;
}

// ─── CSV / text export builders (pure) ──────────────────────────────────────

/** Escape + join a matrix of rows into RFC-4180-ish CSV text. */
export function rowsToCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [headers.map(esc).join(',')];
  for (const r of rows) out.push(r.map(esc).join(','));
  return out.join('\n');
}

/** BAS statement → CSV. */
export function basCsv(bas, label = '') {
  const b = bas || {};
  return rowsToCsv(
    ['Field', 'Amount'],
    [
      ['Period', label],
      ['G1 Total Sales (incl GST)', num(b.g1_total_sales_incl_gst)],
      ['Net Sales (excl GST)', num(b.net_sales_excl_gst)],
      ['1A GST on Sales', num(b.gst_collected)],
      ['1B GST on Purchases', num(b.gst_paid_on_purchases)],
      ['Net GST Payable', num(b.net_gst_payable)],
      ['Total Orders', num(b.order_count)],
    ]
  );
}

/** GSTR-1 (B2CS rate-wise + HSN) → CSV. */
export function gstr1Csv(d) {
  const b2cs = (d?.b2cs || []).map((r) => [
    `${num(r.rate)}%`, num(r.taxable_value), num(r.cgst), num(r.sgst), num(r.igst), num(r.cess),
  ]);
  const header = rowsToCsv(
    ['B2CS Rate', 'Taxable', 'CGST', 'SGST', 'IGST', 'Cess'],
    b2cs.length ? b2cs : [['—', 0, 0, 0, 0, 0]]
  );
  const t = d?.totals || {};
  const totals = rowsToCsv(
    ['Totals', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total Tax'],
    [['All', num(t.taxable_value), num(t.cgst), num(t.sgst), num(t.igst), num(t.total_tax)]]
  );
  return `${header}\n\n${totals}`;
}

/** GSTR-3B (summary sections) → CSV. */
export function gstr3bCsv(d) {
  const a = d?.section_3_1_a || {};
  const tp = d?.tax_payable || {};
  return rowsToCsv(
    ['Section', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'],
    [
      ['3.1(a) Outward taxable', num(a.taxable_value), num(a.igst), num(a.cgst), num(a.sgst), num(a.cess)],
      ['Tax Payable', '', num(tp.igst), num(tp.cgst), num(tp.sgst), num(tp.cess)],
    ]
  );
}

/** GST Summary (rate-wise detailed) → CSV. */
export function summaryCsv(d) {
  const rows = (d?.by_rate || []).map((r) => [
    `${num(r.rate)}%`, num(r.order_count), num(r.taxable), num(r.cgst), num(r.sgst), num(r.igst), num(r.total_tax),
  ]);
  return rowsToCsv(
    ['Rate', 'Orders', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total Tax'],
    rows.length ? rows : [['—', 0, 0, 0, 0, 0, 0]]
  );
}

/**
 * Build the shareable export payload ({ filename, csv }) for the active view.
 * @param {'AU'|'IN'} region
 * @param {string} tab  'bas' | 'gstr1' | 'gstr3b' | 'summary'
 * @param {object} data
 * @param {{from:string,to:string}} range
 * @param {string} [label]
 */
export function buildExport(region, tab, data, range = {}, label = '') {
  const span = `${range.from || ''}_to_${range.to || ''}`;
  if (region === 'AU') {
    return { filename: `BAS_${span}.csv`, csv: basCsv(data, label) };
  }
  if (tab === 'gstr1') return { filename: `GSTR1_${span}.csv`, csv: gstr1Csv(data) };
  if (tab === 'gstr3b') return { filename: `GSTR3B_${span}.csv`, csv: gstr3bCsv(data) };
  return { filename: `GST_Summary_${span}.csv`, csv: summaryCsv(data) };
}

// ─── Data hook ──────────────────────────────────────────────────────────────

async function fetchPayload(url, params) {
  const res = await api.get(url, { params });
  // interceptor already unwrapped axios → we get the { success, data } envelope
  return res?.data ?? res ?? null;
}

/**
 * @param {{ from?: string, to?: string }} range
 * @param {string} [inTab] active India tab: 'gstr1' | 'gstr3b' | 'summary'
 */
export function useGstReports(range = {}, inTab = 'summary') {
  const { outletId } = useOutlet();
  const { isAU } = useCurrency();
  const region = isAU ? 'AU' : 'IN';
  const { from, to } = range;
  const enabled = !!outletId && !!from && !!to;

  const bas = useQuery({
    queryKey: ['gst', 'bas', outletId, from, to],
    queryFn: () => fetchPayload('/reports/bas-report', { outlet_id: outletId, from, to }),
    enabled: enabled && isAU,
    staleTime: 60_000,
  });

  const gstr1 = useQuery({
    queryKey: ['gst', 'gstr1', outletId, from, to],
    queryFn: () => fetchPayload('/gst/gstr1', { outlet_id: outletId, from, to }),
    enabled: enabled && !isAU && inTab === 'gstr1',
    staleTime: 60_000,
  });

  const gstr3b = useQuery({
    queryKey: ['gst', 'gstr3b', outletId, from, to],
    queryFn: () => fetchPayload('/gst/gstr3b', { outlet_id: outletId, from, to }),
    enabled: enabled && !isAU && inTab === 'gstr3b',
    staleTime: 60_000,
  });

  const summary = useQuery({
    queryKey: ['gst', 'summary', outletId, from, to],
    queryFn: () => fetchPayload('/reports/gstDetailed', { outlet_id: outletId, from, to }),
    enabled: enabled && !isAU && inTab === 'summary',
    staleTime: 60_000,
  });

  const active = isAU ? bas : inTab === 'gstr1' ? gstr1 : inTab === 'gstr3b' ? gstr3b : summary;
  const activeTab = isAU ? 'bas' : inTab;

  return {
    region,
    isAU,
    outletId,
    bas,
    gstr1,
    gstr3b,
    summary,
    // convenience: the query for the currently-visible view
    active,
    activeTab,
    data: active.data,
    isLoading: active.isLoading,
    isError: active.isError,
    error: active.error,
    refetch: () => (isAU ? bas.refetch() : Promise.all([gstr1.refetch(), gstr3b.refetch(), summary.refetch()])),
    isRefetching: active.isRefetching || active.isFetching,
    isEmpty: !active.isLoading && !active.isError && isReportEmpty(region, activeTab, active.data),
  };
}

export default useGstReports;
