/**
 * MenuAnalyticsPage — ABC analysis, best sellers, slow movers for owners
 * Route: /menu-analytics
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { useCurrency, formatCurrencyStatic } from '../hooks/useCurrency';
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Star,
  AlertTriangle, Package, ChevronRight, Flame, Snowflake
} from 'lucide-react';

const ABC_CONFIG = {
  A: { label: 'Top Sellers',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: Flame,       desc: 'Drive 70% of revenue — protect these' },
  B: { label: 'Moderate',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Minus,       desc: 'Steady performers — optimize pricing' },
  C: { label: 'Slow Movers',   color: '#f87171', bg: 'rgba(239,68,68,0.12)',  icon: Snowflake,   desc: 'Low volume — consider promotions or removal' },
};

function ItemCard({ item, fmt = (v) => formatCurrencyStatic(v) }) {
  const cfg = ABC_CONFIG[item.abc] || ABC_CONFIG.C;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80"
      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg }}>
        <cfg.icon className="w-4 h-4" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.category}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.qty} sold</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {fmt(item.revenue || 0)}
        </p>
      </div>
    </div>
  );
}

export default function MenuAnalyticsPage() {
  const { user } = useSelector(s => s.auth);
  const { format } = useCurrency();
  const [outletId, setOutletId] = useState(user?.outlet_id || '');
  const [activeTab, setActiveTab] = useState('A');

  // Fetch outlets list
  const { data: outlets = [] } = useQuery({
    queryKey: ['outlets-list'],
    queryFn: () => api.get('/outlets').then(r => r.data).catch(() => []),
    staleTime: 300_000,
  });

  // Set first outlet if none selected
  React.useEffect(() => {
    if (!outletId && outlets.length > 0) setOutletId(outlets[0].id);
  }, [outlets, outletId]);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['menu-analytics', outletId],
    queryFn: () => api.get('/superadmin/menu-analytics', { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!outletId,
    staleTime: 60_000,
  });

  const tabItems = {
    A: analytics?.top_sellers || [],
    B: analytics?.moderate || [],
    C: analytics?.slow_movers || [],
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Menu Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            ABC analysis of your menu items — last 30 days
          </p>
        </div>
        {outlets.length > 1 && (
          <select value={outletId} onChange={e => setOutletId(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(ABC_CONFIG).map(([key, cfg]) => (
          <div key={key} className="rounded-xl p-4 cursor-pointer transition-all"
            onClick={() => setActiveTab(key)}
            style={{
              background: activeTab === key ? cfg.bg : 'var(--bg-secondary)',
              border: `1px solid ${activeTab === key ? cfg.color : 'var(--border)'}`,
            }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}20` }}>
                <cfg.icon className="w-4 h-4" style={{ color: cfg.color }} />
              </div>
              <span className="font-semibold text-sm" style={{ color: cfg.color }}>Class {key} — {cfg.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {isLoading ? '—' : tabItems[key].length}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{cfg.desc}</p>
          </div>
        ))}
      </div>

      {/* ABC Explanation */}
      <div className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)' }}>
        <BarChart2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-400" />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>ABC Analysis:</strong> Class A items account for ~70% of total volume,
          Class B for the next 20%, and Class C for the bottom 10%. Focus promotions on Class C to boost performance.
          Total items sold in last 30 days: <strong style={{ color: 'var(--text-primary)' }}>{analytics?.total_items_sold?.toLocaleString() || '—'}</strong>
        </p>
      </div>

      {/* Item List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      ) : !analytics ? (
        <div className="flex flex-col items-center py-12 gap-2">
          <Package className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
          <p style={{ color: 'var(--text-primary)' }}>No analytics data available</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Orders from the last 30 days will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 mb-2">
            {Object.entries(ABC_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: activeTab === key ? cfg.bg : 'var(--bg-secondary)',
                  border: `1px solid ${activeTab === key ? cfg.color : 'var(--border)'}`,
                  color: activeTab === key ? cfg.color : 'var(--text-secondary)',
                }}>
                {cfg.label} ({tabItems[key].length})
              </button>
            ))}
          </div>

          {tabItems[activeTab].length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2"
              style={{ background: 'var(--bg-secondary)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
              <Package className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No {ABC_CONFIG[activeTab].label.toLowerCase()} found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {tabItems[activeTab].map(item => <ItemCard key={item.id} item={item} fmt={format} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
