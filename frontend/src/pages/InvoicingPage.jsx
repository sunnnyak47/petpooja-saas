/**
 * InvoicingPage — Monthly SaaS invoice management
 * Route: /invoicing
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  FileText, IndianRupee, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Download, Plus, ChevronDown, Search, Filter, X
} from 'lucide-react';

const STATUS_STYLES = {
  PAID: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80', icon: CheckCircle2 },
  PENDING: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', icon: Clock },
  OVERDUE: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', icon: AlertCircle },
  WAIVED: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', icon: X },
};

const PLAN_COLORS = {
  TRIAL: '#94a3b8', STARTER: '#60a5fa', PRO: '#a78bfa', ENTERPRISE: '#4ade80',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function InvoiceRow({ inv, onUpdate }) {
  const [updating, setUpdating] = useState(false);
  const style = STATUS_STYLES[inv.status] || STATUS_STYLES.PENDING;
  const Icon = style.icon;

  const handleStatusChange = async (newStatus) => {
    setUpdating(true);
    await onUpdate(inv.id, { status: newStatus, paid_at: newStatus === 'PAID' ? new Date().toISOString() : inv.paid_at });
    setUpdating(false);
  };

  return (
    <tr className="hover:opacity-80 transition-opacity" style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="px-5 py-3.5">
        <div>
          <p className="font-mono text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{inv.id}</p>
          <p className="font-semibold text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>{inv.chain_name}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{inv.email}</p>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {MONTHS[(inv.month || 1) - 1]} {inv.year}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: `${PLAN_COLORS[inv.plan]}20`, color: PLAN_COLORS[inv.plan] }}>
          {inv.plan}
        </span>
      </td>
      <td className="px-5 py-3.5 font-bold" style={{ color: '#4ade80' }}>
        ₹{Number(inv.amount).toLocaleString()}
      </td>
      <td className="px-5 py-3.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold w-fit px-2.5 py-1 rounded-full"
          style={{ background: style.bg, color: style.color }}>
          <Icon className="w-3.5 h-3.5" />
          {inv.status}
        </span>
      </td>
      <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—'}
      </td>
      <td className="px-5 py-3.5">
        {updating ? (
          <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        ) : (
          <select
            value={inv.status}
            onChange={e => handleStatusChange(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {Object.keys(STATUS_STYLES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </td>
    </tr>
  );
}

export default function InvoicingPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1);
  const [genYear, setGenYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get('/superadmin/invoices').then(r => r.data),
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/superadmin/invoices/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['invoices']),
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post('/superadmin/invoices/generate', { month: genMonth, year: genYear });
      qc.invalidateQueries(['invoices']);
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to generate invoices');
    }
    setGenerating(false);
  };

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (search && !inv.chain_name?.toLowerCase().includes(search.toLowerCase()) && !inv.id?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPending = invoices.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter(i => i.status === 'OVERDUE').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Invoice Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Monthly SaaS billing for all restaurant chains</p>
        </div>

        {/* Generate invoices */}
        <div className="flex items-center gap-2">
          <select value={genMonth} onChange={e => setGenMonth(Number(e.target.value))}
            className="text-sm px-3 py-2 rounded-lg outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={genYear} onChange={e => setGenYear(Number(e.target.value))}
            className="text-sm px-3 py-2 rounded-lg outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}>
            {generating ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate Invoices
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Collection', value: `₹${totalPending.toLocaleString()}`, sub: `${invoices.filter(i => i.status === 'PENDING').length} invoices`, color: '#f59e0b', icon: Clock },
          { label: 'Collected This Month', value: `₹${totalPaid.toLocaleString()}`, sub: `${invoices.filter(i => i.status === 'PAID').length} invoices paid`, color: '#22c55e', icon: CheckCircle2 },
          { label: 'Overdue Invoices', value: overdue, sub: 'Requires follow-up', color: '#ef4444', icon: AlertCircle },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-5 flex items-start gap-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${c.color}20` }}>
              <c.icon className="w-5 h-5" style={{ color: c.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{c.value}</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{c.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search chain name or invoice ID..."
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        {['ALL', 'PENDING', 'PAID', 'OVERDUE', 'WAIVED'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: statusFilter === s ? 'rgba(99,102,241,0.2)' : 'var(--bg-secondary)',
              border: `1px solid ${statusFilter === s ? '#6366f1' : 'var(--border)'}`,
              color: statusFilter === s ? '#818cf8' : 'var(--text-secondary)',
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <FileText className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No invoices found</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {invoices.length === 0 ? 'Click "Generate Invoices" to create the first batch' : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Invoice / Chain', 'Period', 'Plan', 'Amount', 'Status', 'Paid On', 'Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <InvoiceRow key={inv.id} inv={inv}
                    onUpdate={(id, data) => updateMutation.mutateAsync({ id, data })} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
        Showing {filtered.length} of {invoices.length} invoices
      </p>
    </div>
  );
}
