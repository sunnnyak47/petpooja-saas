/**
 * HealthScoreWidget — Owner dashboard card showing their chain's health score
 * Embedded directly in DashboardPage for restaurant owners.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Activity, ShoppingCart, BookOpen, Users, TrendingUp,
  UserCheck, CreditCard, ChevronRight, Trophy, AlertTriangle,
  CheckCircle2, ArrowUpRight, Info
} from 'lucide-react';

const GRADE_CONFIG = {
  Champion: { color: '#22c55e', bg: '#dcfce7', icon: Trophy,        label: 'Champion',  desc: 'Your restaurant is performing excellently!' },
  Healthy:  { color: '#3b82f6', bg: '#dbeafe', icon: CheckCircle2,  label: 'Healthy',   desc: 'Good performance with some room to grow.' },
  'At Risk':{ color: '#f59e0b', bg: '#fef3c7', icon: AlertTriangle, label: 'At Risk',   desc: 'Several areas need attention soon.' },
  Critical: { color: '#ef4444', bg: '#fee2e2', icon: Activity,      label: 'Critical',  desc: 'Urgent action needed across key areas.' },
};

const DIM_ICONS = {
  orders:    ShoppingCart,
  menu:      BookOpen,
  staff:     Users,
  revenue:   TrendingUp,
  retention: UserCheck,
  payments:  CreditCard,
};

function ScoreArc({ score, grade, size = 120 }) {
  const cfg = GRADE_CONFIG[grade?.label] || GRADE_CONFIG.Critical;
  const strokeWidth = 9;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  // Arc is 270 degrees (from 135° to 45° = bottom gap)
  const arcLength = circ * 0.75;
  const filled = (score / 100) * arcLength;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="var(--border)" strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circ}`} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={cfg.color} strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.2s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 8 }}>
        <span className="font-black leading-none" style={{ fontSize: size * 0.27, color: cfg.color }}>{score}</span>
        <span className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>/ 100</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full mt-1"
          style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
      </div>
    </div>
  );
}

function DimRow({ dim, animate }) {
  const Icon = DIM_ICONS[dim.key] || Activity;
  const pct = Math.round((dim.score / dim.max) * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{dim.label}</span>
          <span className="text-xs font-bold ml-2 flex-shrink-0" style={{ color }}>{dim.score}/{dim.max}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          <div className="h-full rounded-full"
            style={{ width: animate ? `${pct}%` : '0%',
                     background: color,
                     transition: 'width 1s ease' }} />
        </div>
      </div>
    </div>
  );
}

export default function HealthScoreWidget() {
  const navigate = useNavigate();
  const [animate, setAnimate] = useState(false);

  const { data: health, isLoading, isError } = useQuery({
    queryKey: ['my-health-score'],
    queryFn: () => api.get('/ho/my-health-score').then(r => r.data),
    staleTime: 5 * 60_000,
    onSuccess: () => setTimeout(() => setAnimate(true), 100),
  });

  // Trigger animation after data loads
  React.useEffect(() => {
    if (health) setTimeout(() => setAnimate(true), 200);
  }, [health]);

  const cfg = GRADE_CONFIG[health?.grade?.label] || GRADE_CONFIG.Critical;
  const GradeIcon = cfg.icon;

  // Dims that need improvement
  const weakDims = (health?.dimensions || []).filter(d => d.score / d.max < 0.6);
  const strongDims = (health?.dimensions || []).filter(d => d.score / d.max >= 0.8);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Health Score</span>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
        <button onClick={() => navigate('/subscription')}
          className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}>
          Details <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      ) : isError || !health ? (
        <div className="flex flex-col items-center py-8 gap-2">
          <Info className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Health data unavailable</p>
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Score + Grade */}
          <div className="flex items-center gap-4">
            <ScoreArc score={health.score} grade={health.grade} size={110} />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-1.5">
                <GradeIcon className="w-4 h-4" style={{ color: cfg.color }} />
                <span className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cfg.desc}</p>

              {strongDims.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {strongDims.slice(0,2).map(d => (
                    <span key={d.key} className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: '#dcfce7', color: '#16a34a' }}>
                      ✓ {d.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dimension Bars */}
          <div className="space-y-2.5">
            {(health.dimensions || []).map(d => (
              <DimRow key={d.key} dim={d} animate={animate} />
            ))}
          </div>

          {/* Action items */}
          {weakDims.length > 0 && (
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
              <p className="text-xs font-semibold text-amber-700">⚡ Improve Your Score</p>
              {weakDims.slice(0, 2).map(d => (
                <p key={d.key} className="text-xs text-amber-700">• {d.signal}</p>
              ))}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => navigate('/menu-analytics')}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white' }}>
            <ArrowUpRight className="w-4 h-4" />
            View Full Analytics
          </button>
        </div>
      )}
    </div>
  );
}
