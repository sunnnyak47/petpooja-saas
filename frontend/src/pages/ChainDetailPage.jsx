/**
 * ChainDetailPage — Outlet-level dashboard for a specific chain
 * Route: /chain/:id
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  ArrowLeft, Store, TrendingUp, ShoppingCart, Activity,
  Clock, DollarSign, AlertCircle, CheckCircle2, Star,
  MapPin, Phone, BarChart2, Package
} from 'lucide-react';

const SCORE_COLOR = (s) => s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : s >= 25 ? '#f97316' : '#ef4444';
const SCORE_LABEL = (s) => s >= 75 ? 'Excellent' : s >= 50 ? 'Good' : s >= 25 ? 'Fair' : 'Poor';

function HealthBar({ score }) {
  const color = SCORE_COLOR(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{score}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = '#6366f1' }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
      </div>
    </div>
  );
}

export default function ChainDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sort, setSort] = useState('revenue_30d');

  const { data: chainData } = useQuery({
    queryKey: ['chain-detail', id],
    queryFn: () => api.get(`/superadmin/chains/${id}`).then(r => r.data),
    staleTime: 60_000,
  });

  const { data: outlets = [], isLoading } = useQuery({
    queryKey: ['chain-outlets', id],
    queryFn: () => api.get(`/superadmin/chains/${id}/outlets`).then(r => r.data),
    staleTime: 30_000,
  });

  const sorted = [...outlets].sort((a, b) => b[sort] - a[sort]);

  const totalRevenue30d = outlets.reduce((s, o) => s + o.revenue_30d, 0);
  const totalOrders30d = outlets.reduce((s, o) => s + o.orders_30d, 0);
  const avgHealth = outlets.length > 0 ? Math.round(outlets.reduce((s, o) => s + o.health_score, 0) / outlets.length) : 0;
  const activeOutlets = outlets.filter(o => o.is_active).length;

  const isChainAU = chainData?.region === 'AU';
  const chainSym = isChainAU ? 'A$' : '₹';
  const fmt = (n) => {
    if (isChainAU) {
      if (n >= 1000000) return `A$${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `A$${(n / 1000).toFixed(1)}K`;
      return `A$${n}`;
    }
    return n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`;
  };
  const timeAgo = (dt) => {
    if (!dt) return 'Never';
    const diff = Date.now() - new Date(dt).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/super-admin')}
          className="p-2 rounded-lg transition-colors hover:opacity-80"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {chainData?.name || 'Chain Detail'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Outlet performance dashboard • {outlets.length} outlets
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
            {chainData?.plan || 'TRIAL'}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: chainData?.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: chainData?.is_active ? '#4ade80' : '#f87171' }}>
            {chainData?.is_active ? 'Active' : 'Suspended'}
          </span>
        </div>
      </div>

      {/* Chain summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Store} label="Total Outlets" value={outlets.length} sub={`${activeOutlets} active`} color="#6366f1" />
        <StatCard icon={DollarSign} label="Revenue (30d)" value={fmt(totalRevenue30d)} sub="Across all outlets" color="#22c55e" />
        <StatCard icon={ShoppingCart} label="Orders (30d)" value={totalOrders30d.toLocaleString()} sub={`Avg ${outlets.length ? Math.round(totalOrders30d / outlets.length) : 0}/outlet`} color="#f59e0b" />
        <StatCard icon={Activity} label="Avg Health Score" value={`${avgHealth}/100`} sub={SCORE_LABEL(avgHealth)} color={SCORE_COLOR(avgHealth)} />
      </div>

      {/* Sort + Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Outlet Breakdown</h2>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="revenue_30d">Sort: Revenue</option>
            <option value="orders_30d">Sort: Orders</option>
            <option value="health_score">Sort: Health Score</option>
            <option value="orders_today">Sort: Today's Orders</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Store className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>No outlets found for this chain</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Outlet', 'Location', 'Orders Today', 'Revenue 30d', 'Orders 30d', 'Last Order', 'Menu Items', 'Health', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((o, i) => (
                  <tr key={o.id} className="transition-colors hover:opacity-80"
                    style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                          {o.name.charAt(0)}
                        </div>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{o.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="text-xs">{o.city || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {o.orders_today}
                      <span className="text-xs ml-1 font-normal" style={{ color: 'var(--text-secondary)' }}>
                        ({fmt(o.revenue_today)})
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: '#4ade80' }}>{fmt(o.revenue_30d)}</td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-primary)' }}>{o.orders_30d}</td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(o.last_order_at)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <div className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {o.menu_items_count}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 w-32">
                      <HealthBar score={o.health_score} />
                    </td>
                    <td className="px-5 py-3.5">
                      {o.is_active ? (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#4ade80' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#f87171' }}>
                          <AlertCircle className="w-3.5 h-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
