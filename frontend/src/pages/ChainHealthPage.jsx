/**
 * ChainHealthPage — Superadmin chain health score leaderboard
 * Route: /chain-health
 *
 * World-first feature: Real-time composite health scores across 6 dimensions
 * for every restaurant chain on the platform.
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Trophy, ShoppingCart, BookOpen, Users, CreditCard, UserCheck,
  ChevronDown, ChevronUp, RefreshCw, Search, Filter,
  Zap, Star, Crown, Building2, Info, BarChart3, ArrowUpRight
} from 'lucide-react';

// ── Grade config ────────────────────────────────────────────────────────────
const GRADE_CONFIG = {
  Champion: { color: '#22c55e', bg: '#dcfce7', ring: '#16a34a', icon: Trophy,        label: 'Champion'  },
  Healthy:  { color: '#3b82f6', bg: '#dbeafe', ring: '#2563eb', icon: CheckCircle2,  label: 'Healthy'   },
  'At Risk':{ color: '#f59e0b', bg: '#fef3c7', ring: '#d97706', icon: AlertTriangle, label: 'At Risk'   },
  Critical: { color: '#ef4444', bg: '#fee2e2', ring: '#dc2626', icon: Activity,      label: 'Critical'  },
};

const PLAN_ICONS = { TRIAL: Zap, STARTER: Star, PRO: Crown, ENTERPRISE: Building2 };
const PLAN_COLORS = { TRIAL: '#94a3b8', STARTER: '#60a5fa', PRO: '#a78bfa', ENTERPRISE: '#4ade80' };

const DIM_ICONS = {
  orders:    ShoppingCart,
  menu:      BookOpen,
  staff:     Users,
  revenue:   TrendingUp,
  retention: UserCheck,
  payments:  CreditCard,
};

// ── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 64, grade }) {
  const cfg = GRADE_CONFIG[grade?.label] || GRADE_CONFIG.Critical;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={cfg.color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ fontSize: size * 0.26, color: cfg.color }}>{score}</span>
      </div>
    </div>
  );
}

// ── Dimension Bar ─────────────────────────────────────────────────────────────
function DimBar({ dim }) {
  const Icon = DIM_ICONS[dim.key] || Activity;
  const pct = Math.round((dim.score / dim.max) * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#ef4444';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3" style={{ color }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{dim.label}</span>
        </div>
        <span className="text-xs font-semibold" style={{ color }}>{dim.score}/{dim.max}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
      {dim.signal && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary, #9ca3af)' }}>{dim.signal}</p>
      )}
    </div>
  );
}

// ── Chain Row ────────────────────────────────────────────────────────────────
function ChainRow({ chain, rank, expanded, onToggle }) {
  const cfg = GRADE_CONFIG[chain.grade?.label] || GRADE_CONFIG.Critical;
  const GradeIcon = cfg.icon;
  const PlanIcon = PLAN_ICONS[chain.plan] || Zap;
  const planColor = PLAN_COLORS[chain.plan] || '#94a3b8';

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1px solid ${expanded ? cfg.ring + '60' : 'var(--border)'}`,
               background: expanded ? cfg.bg + '30' : 'var(--bg-secondary)' }}>
      {/* Row Header */}
      <button className="w-full flex items-center gap-4 px-5 py-4 hover:opacity-90 transition-opacity text-left"
        onClick={onToggle}>
        {/* Rank */}
        <div className="w-7 text-center">
          {rank <= 3 ? (
            <span style={{ fontSize: 18 }}>{['🥇','🥈','🥉'][rank-1]}</span>
          ) : (
            <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>#{rank}</span>
          )}
        </div>

        {/* Score Ring */}
        <ScoreRing score={chain.score} size={56} grade={chain.grade} />

        {/* Chain Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {chain.chain_name}
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: cfg.bg, color: cfg.color }}>
              <GradeIcon className="w-3 h-3" />
              {cfg.label}
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${planColor}18`, color: planColor }}>
              <PlanIcon className="w-3 h-3" />
              {chain.plan}
            </span>
            {!chain.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">Inactive</span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {chain.outlets?.length || 0} outlet{(chain.outlets?.length || 0) !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Mini dimension bars */}
        <div className="hidden md:flex items-center gap-3">
          {(chain.dimensions || []).slice(0, 4).map(d => {
            const pct = Math.round((d.score / d.max) * 100);
            const col = pct >= 80 ? '#22c55e' : pct >= 50 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#ef4444';
            return (
              <div key={d.key} className="flex flex-col items-center gap-0.5">
                <div className="w-1.5 rounded-full" style={{ height: 32, background: 'var(--bg-primary)' }}>
                  <div className="w-full rounded-full" style={{ height: `${pct}%`, background: col, marginTop: `${100-pct}%` }} />
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{d.key.slice(0,3)}</span>
              </div>
            );
          })}
        </div>

        {/* Score number + chevron */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-lg font-bold" style={{ color: cfg.color }}>{chain.score}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>/ 100</div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-5 pb-5 border-t" style={{ borderColor: cfg.ring + '30' }}>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Dimension breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Score Breakdown
              </h4>
              {(chain.dimensions || []).map(d => <DimBar key={d.key} dim={d} />)}
            </div>

            {/* Per-outlet scores */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Outlet Scores
              </h4>
              {(chain.outlet_scores || []).map(o => {
                const oc = GRADE_CONFIG[o.grade?.label] || GRADE_CONFIG.Critical;
                return (
                  <div key={o.outlet_id} className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--bg-primary)' }}>
                    <ScoreRing score={o.score} size={40} grade={o.grade} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{o.outlet_name}</p>
                      <span className="text-xs" style={{ color: oc.color }}>{oc.label}</span>
                    </div>
                  </div>
                );
              })}
              {(!chain.outlet_scores || chain.outlet_scores.length === 0) && (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No outlets</p>
              )}

              {/* Recommendations */}
              <div className="mt-2 p-3 rounded-lg" style={{ background: cfg.bg }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: cfg.color }}>
                  💡 Quick Wins
                </p>
                {(chain.dimensions || [])
                  .filter(d => d.score / d.max < 0.6)
                  .slice(0, 2)
                  .map(d => (
                    <p key={d.key} className="text-xs" style={{ color: 'var(--text-primary)' }}>
                      • <b>{d.label}</b>: {d.signal}
                    </p>
                  ))}
                {(chain.dimensions || []).filter(d => d.score / d.max < 0.6).length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-primary)' }}>✅ All dimensions looking good!</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ChainHealthPage() {
  const [search, setSearch]     = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [planFilter, setPlanFilter]   = useState('ALL');
  const [expandedId, setExpandedId]   = useState(null);

  const { data: chains = [], isLoading, refetch: refetchChains, isFetching } = useQuery({
    queryKey: ['chain-health'],
    queryFn: () => api.get('/superadmin/chain-health').then(r => r.data),
    staleTime: 60_000,
  });

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['health-summary'],
    queryFn: () => api.get('/superadmin/health-summary').then(r => r.data),
    staleTime: 60_000,
  });

  const refetch = () => { refetchChains(); refetchSummary(); };

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return chains.filter(c => {
      const matchName  = c.chain_name.toLowerCase().includes(search.toLowerCase());
      const matchGrade = gradeFilter === 'ALL' || c.grade?.label === gradeFilter;
      const matchPlan  = planFilter  === 'ALL' || c.plan === planFilter;
      return matchName && matchGrade && matchPlan;
    });
  }, [chains, search, gradeFilter, planFilter]);

  const gradeCounts = useMemo(() => {
    const c = { Champion: 0, Healthy: 0, 'At Risk': 0, Critical: 0 };
    chains.forEach(ch => { if (c[ch.grade?.label] !== undefined) c[ch.grade?.label]++; });
    return c;
  }, [chains]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Activity className="w-7 h-7 text-indigo-500" />
            Chain Health Scores
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Real-time composite health score across 6 dimensions for every restaurant chain
          </p>
        </div>
        <button onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Platform Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Avg score */}
          <div className="col-span-2 md:col-span-1 rounded-xl p-4 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white' }}>
            <BarChart3 className="w-5 h-5 opacity-80 mb-1" />
            <div className="text-3xl font-bold">{summary.avg_score}</div>
            <div className="text-xs opacity-80">Platform Avg</div>
          </div>

          {Object.entries(GRADE_CONFIG).map(([grade, cfg]) => {
            const GI = cfg.icon;
            const count = summary.grade_distribution?.[grade] || 0;
            return (
              <button key={grade}
                onClick={() => setGradeFilter(gradeFilter === grade ? 'ALL' : grade)}
                className="rounded-xl p-4 flex flex-col items-center gap-1 transition-all hover:scale-105"
                style={{ background: gradeFilter === grade ? cfg.bg : 'var(--bg-secondary)',
                         border: `1px solid ${gradeFilter === grade ? cfg.ring : 'var(--border)'}` }}>
                <GI className="w-5 h-5" style={{ color: cfg.color }} />
                <div className="text-2xl font-bold" style={{ color: cfg.color }}>{count}</div>
                <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{grade}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Score Methodology Info */}
      <div className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">How Health Scores Work</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Each chain is scored 0–100 across 6 dimensions: <strong>Order Velocity (25)</strong> ·
            <strong> Menu Completeness (20)</strong> · <strong>Staff Activity (15)</strong> ·
            <strong> Revenue Health (15)</strong> · <strong>Customer Retention (15)</strong> ·
            <strong> Payment Diversity (10)</strong>.
            Scores refresh every time you load this page using live database data.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chains…"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          {['ALL', 'TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'].map(p => (
            <button key={p}
              onClick={() => setPlanFilter(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: planFilter === p ? '#6366f1' : 'var(--bg-secondary)',
                color:      planFilter === p ? 'white'   : 'var(--text-secondary)',
                border:     `1px solid ${planFilter === p ? '#6366f1' : 'var(--border)'}`,
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chain List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <Activity className="w-12 h-12" style={{ color: 'var(--text-secondary)' }} />
          <p style={{ color: 'var(--text-primary)' }}>No chains match your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((chain, idx) => (
            <ChainRow
              key={chain.chain_id}
              chain={chain}
              rank={chains.indexOf(chain) + 1}
              expanded={expandedId === chain.chain_id}
              onToggle={() => setExpandedId(expandedId === chain.chain_id ? null : chain.chain_id)}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      {!isLoading && chains.length > 0 && (
        <p className="text-xs text-center pb-4" style={{ color: 'var(--text-secondary)' }}>
          Showing {filtered.length} of {chains.length} chains · Scores computed live from database
        </p>
      )}
    </div>
  );
}
