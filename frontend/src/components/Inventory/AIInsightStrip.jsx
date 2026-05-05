import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { AlertTriangle, TrendingUp, Zap, Package, Trash2, Loader2, Sparkles } from 'lucide-react';

const ICON_MAP = {
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  'zap': Zap,
  'package': Package,
  'trash-2': Trash2,
};

const SEVERITY_STYLES = {
  high:   { bg: 'color-mix(in srgb, var(--danger) 10%, transparent)',   border: 'color-mix(in srgb, var(--danger) 25%, transparent)',   icon: 'var(--danger)' },
  medium: { bg: 'color-mix(in srgb, var(--warning) 10%, transparent)',  border: 'color-mix(in srgb, var(--warning) 25%, transparent)',  icon: 'var(--warning)' },
  low:    { bg: 'color-mix(in srgb, var(--accent) 8%, transparent)',    border: 'color-mix(in srgb, var(--accent) 20%, transparent)',   icon: 'var(--accent)' },
  info:   { bg: 'color-mix(in srgb, var(--accent) 8%, transparent)',    border: 'color-mix(in srgb, var(--accent) 20%, transparent)',   icon: 'var(--accent)' },
};

export default function AIInsightStrip({ outletId, onAction }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inv-ai-insights', outletId],
    queryFn: () => api.get(`/inventory/ai/insights?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,   // cache 5 mins — Gemini calls are slow
    retry: 1,
  });

  const insights = data?.data || [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <Sparkles className="w-4 h-4 animate-pulse" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
          AI is reading your stock…
        </span>
        <Loader2 className="w-4 h-4 animate-spin ml-auto" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (!insights.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          AI Insights
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {insights.map((insight, i) => {
          const Icon = ICON_MAP[insight.icon] || Zap;
          const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;

          return (
            <div key={i}
              className="shrink-0 rounded-2xl p-4 flex flex-col gap-2"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                minWidth: '220px',
                maxWidth: '260px',
              }}>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: style.border }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: style.icon }} />
                </div>
                <p className="text-sm font-black leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {insight.message}
                </p>
              </div>

              {insight.detail && (
                <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                  {insight.detail}
                </p>
              )}

              {insight.action && insight.actionKey && insight.actionKey !== 'null' && (
                <button
                  onClick={() => onAction?.(insight.actionKey)}
                  className="mt-1 self-start px-3 py-1.5 rounded-xl text-xs font-black transition-all hover:opacity-80"
                  style={{ background: style.icon, color: '#fff' }}>
                  {insight.action}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
