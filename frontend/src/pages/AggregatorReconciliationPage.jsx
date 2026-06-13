/**
 * AggregatorReconciliationPage — per-platform delivery payout reconciliation.
 * Route: /aggregator-reconciliation (owner, feature 'payments')
 *
 * Shows, per delivery platform, gross sales, commission taken and the expected
 * net payout for a date range, and lets the user turn an aggregator payout into
 * a reconcilable Settlement (bridged into the Settlements feature).
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import { Truck, RefreshCw, Loader2, FileSpreadsheet, ArrowRight } from 'lucide-react';

export default function AggregatorReconciliationPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlet?.id;
  const { format } = useCurrency();
  const queryClient = useQueryClient();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [platform, setPlatform] = useState('');

  const buildParams = () => {
    const p = new URLSearchParams();
    if (outletId) p.set('outlet_id', outletId);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (platform) p.set('platform', platform);
    return p.toString();
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['aggregator-commission-report', outletId, from, to, platform],
    queryFn: () =>
      api.get(`/aggregator-reconciliation/commission-report?${buildParams()}`).then((r) => r.data),
    staleTime: 30_000,
  });

  const rows = data?.rows || [];
  const totals = data?.totals || { order_count: 0, gross: 0, commission_amount: 0, net_payout: 0 };

  const payoutMutation = useMutation({
    mutationFn: (row) =>
      api
        .post('/aggregator-reconciliation/payout-to-settlement', {
          outlet_id: outletId,
          platform: row.platform,
          from: from || undefined,
          to: to || undefined,
          reference: `${row.platform_name} payout`,
        })
        .then((r) => r.data),
    onSuccess: (settlement) => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success(
        (t) => (
          <span className="flex items-center gap-2">
            Settlement created
            <Link
              to="/settlements"
              onClick={() => toast.dismiss(t.id)}
              className="font-semibold underline"
              style={{ color: 'var(--accent)' }}
            >
              View in Settlements
            </Link>
          </span>
        ),
        { duration: 6000 }
      );
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed to create settlement'),
  });

  const thBase =
    'text-left px-4 py-3 text-xs font-bold uppercase tracking-wider';
  const numTh = 'text-right px-4 py-3 text-xs font-bold uppercase tracking-wider';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
          >
            <Truck className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Delivery Payouts
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Per-platform gross sales, commission taken, and expected net payout
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div
        className="rounded-2xl border p-4 flex flex-wrap items-end gap-4"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            To
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Platform
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="">All platforms</option>
            <option value="uber_eats">Uber Eats</option>
            <option value="doordash">DoorDash</option>
            <option value="menulog">Menulog</option>
            <option value="swiggy">Swiggy</option>
            <option value="zomato">Zomato</option>
          </select>
        </div>
        {(from || to || platform) && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
              setPlatform('');
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ color: 'var(--accent)' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        {isLoading ? (
          <div
            className="flex items-center justify-center py-16"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading payouts…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              Couldn't load delivery payouts
            </p>
            <button
              onClick={() => refetch()}
              className="text-xs font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <Truck className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No aggregator orders in this period
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thBase} style={{ color: 'var(--text-secondary)' }}>
                  Platform
                </th>
                <th className={numTh} style={{ color: 'var(--text-secondary)' }}>
                  Orders
                </th>
                <th className={numTh} style={{ color: 'var(--text-secondary)' }}>
                  Gross
                </th>
                <th className={numTh} style={{ color: 'var(--text-secondary)' }}>
                  Commission %
                </th>
                <th className={numTh} style={{ color: 'var(--text-secondary)' }}>
                  Commission
                </th>
                <th className={numTh} style={{ color: 'var(--text-secondary)' }}>
                  Net payout
                </th>
                <th className={numTh} style={{ color: 'var(--text-secondary)' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.platform} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {r.platform_name}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                    {r.order_count}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                    {format(r.gross)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                    {r.commission_pct}%
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: '#ef4444' }}>
                    −{format(r.commission_amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: '#16a34a' }}>
                    {format(r.net_payout)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => payoutMutation.mutate(r)}
                      disabled={payoutMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80 disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                    >
                      {payoutMutation.isPending && payoutMutation.variables?.platform === r.platform ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      )}
                      Create settlement
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td className="px-4 py-3 font-bold" style={{ color: 'var(--text-primary)' }}>
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text-primary)' }}>
                  {totals.order_count}
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text-primary)' }}>
                  {format(totals.gross)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right font-bold" style={{ color: '#ef4444' }}>
                  −{format(totals.commission_amount)}
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: '#16a34a' }}>
                  {format(totals.net_payout)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Creating a settlement turns the platform's payout into a reconcilable batch
        you can match against recorded payments in{' '}
        <Link to="/settlements" className="font-semibold underline" style={{ color: 'var(--accent)' }}>
          Settlements
        </Link>
        .
      </p>
    </div>
  );
}
