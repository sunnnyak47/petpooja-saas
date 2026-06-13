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
// Health grades use a restrained semantic traffic-light set only.
const GRADE_CONFIG = {
  Champion: { color: '#16a34a', bg: 'color-mix(in srgb, #16a34a 12%, transparent)', ring: '#16a34a', icon: Trophy,        label: 'Champion'  },
  Healthy:  { color: '#16a34a', bg: 'color-mix(in srgb, #16a34a 12%, transparent)', ring: '#16a34a', icon: CheckCircle2,  label: 'Healthy'   },
  'At Risk':{ color: '#f59e0b', bg: 'color-mix(in srgb, #f59e0b 12%, transparent)', ring: '#f59e0b', icon: AlertTriangle, label: 'At Risk'   },
  Critical: { color: '#ef4444', bg: 'color-mix(in srgb, #ef4444 12%, transparent)', ring: '#ef4444', icon: Activity,      label: 'Critical'  },
};

const PLAN_ICONS = { TRIAL: Zap, STARTER: Star, PRO: Crown, ENTERPRISE: Building2 };
// Plan tags are not semantic health signals — render them in a neutral / accent tone.
const PLAN_COLORS = { TRIAL: '#64748b', STARTER: 'var(--accent)', PRO: 'var(--accent)', ENTERPRISE: 'var(--accent)' };

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
  const color = pct >= 50 ? '#16a34a' : pct >= 30 ? '#f59e0b' : '#ef4444';
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
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dim.signal}</p>
      )}
    </div>
  );
}

// ── Chain Row ────────────────────────────────────────────────────────────────
function ChainRow({ chain, rank, expanded, onToggle }) {
  const cfg = GRADE_CONFIG[chain.grade?.label] || GRADE_CONFIG.Critical;
  const GradeIcon = cfg.icon;
  const PlanIcon = PLAN_ICONS[chain.plan] || Zap;
  const planColor = PLAN_COLORS[chain.plan] || '#64748b';
  const planTint = planColor === '#64748b'
    ? 'color-mix(in srgb, #64748b 12%, transparent)'
    : 'color-mix(in srgb, var(--accent) 12%, transparent)';

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1px solid ${expanded ? `color-mix(in srgb, ${cfg.ring} 40%, var(--border))` : 'var(--border)'}`,
               background: expanded ? `color-mix(in srgb, ${cfg.ring} 6%, var(--bg-card))` : 'var(--bg-secondary)' }}>
      {/* Row Header */}
      <button className="w-full flex items-center gap-4 px-5 py-4 hover:opacity-90 transition-opacity text-left"
        onClick={onToggle}>
        {/* Rank */}
        <div className="w-7 text-center">
          {rank <= 3 ? (
            <Trophy className="w-[18px] h-[18px] mx-auto" style={{ color: ['#FBBF24', '#9CA3AF', '#B45309'][rank-1] }} />
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
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: planTint, color: planColor }}>
              <PlanIcon className="w-3 h-3" />
              {chain.plan}
            </span>
            {!chain.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'color-mix(in srgb, #ef4444 12%, transparent)', color: '#ef4444' }}>Inactive</span>
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
            const col = pct >= 50 ? '#16a34a' : pct >= 30 ? '#f59e0b' : '#ef4444';
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
        <div className="px-5 pb-5 border-t" style={{ borderColor: `color-mix(in srgb, ${cfg.ring} 25%, var(--border))` }}>
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
                <p className="flex items-center gap-1 text-xs font-semibold mb-1.5" style={{ color: cfg.color }}>
                  <Zap className="w-3.5 h-3.5" /> Quick Wins
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
                  <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-primary)' }}><CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#16a34a' }} /> All dimensions looking good</p>
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
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Activity className="w-6 h-6" style={{ color: 'var(--accent)' }} />
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
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
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
                className="rounded-xl p-4 flex flex-col items-center gap-1 transition-colors"
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
        style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))' }}>
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>How Health Scores Work</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
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
                background: planFilter === p ? 'var(--accent)'      : 'var(--bg-secondary)',
                color:      planFilter === p ? 'var(--accent-text)'  : 'var(--text-secondary)',
                border:     `1px solid ${planFilter === p ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chain List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
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
