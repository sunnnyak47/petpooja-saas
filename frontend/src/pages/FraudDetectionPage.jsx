import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  ShieldAlert, AlertTriangle, Eye, CheckCircle, X, RefreshCw,
  ChevronDown, ChevronUp, User, Clock, TrendingUp, Bell,
  Filter, Search, Zap, MessageCircle, BarChart3, Shield,
  XCircle, Flag, Trash2, Check, MoreVertical, Activity,
} from 'lucide-react';

/* ─── API ─────────────────────────────────────────────────── */
const fraudApi = {
  detect:    (outletId) => api.post('/fraud/detect', { outlet_id: outletId }).then(r => r.data.data),
  alerts:    (outletId, params) => api.get('/fraud/alerts', { params: { outlet_id: outletId, ...params } }).then(r => r.data.data),
  stats:     (outletId) => api.get('/fraud/stats', { params: { outlet_id: outletId } }).then(r => r.data.data),
  risks:     (outletId) => api.get('/fraud/staff-risks', { params: { outlet_id: outletId } }).then(r => r.data.data),
  markRead:  (id, outletId) => api.patch(`/fraud/alerts/${id}/read`, { outlet_id: outletId }).then(r => r.data),
  readAll:   (outletId) => api.post('/fraud/alerts/read-all', { outlet_id: outletId }).then(r => r.data),
  dismiss:   (id, outletId) => api.patch(`/fraud/alerts/${id}/dismiss`, { outlet_id: outletId }).then(r => r.data),
  resolve:   (id, outletId, note) => api.patch(`/fraud/alerts/${id}/resolve`, { outlet_id: outletId, note }).then(r => r.data),
};

/* ─── Constants ───────────────────────────────────────────── */
const SEVERITY = {
  critical: { color: 'text-red-400',    bg: 'bg-red-500/15',    border: 'border-red-500/30',    dot: 'bg-red-400',    label: 'Critical' },
  high:     { color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', dot: 'bg-orange-400', label: 'High' },
  medium:   { color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/30',  dot: 'bg-amber-400',  label: 'Medium' },
  low:      { color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/30',   dot: 'bg-blue-400',   label: 'Low' },
};

const ALERT_TYPE_META = {
  EXCESSIVE_CANCELLATIONS: { icon: '🚫', label: 'Excessive Cancellations', short: 'Over-Cancelling' },
  KOT_WITHOUT_BILL:        { icon: '🧾', label: 'KOT Without Bill',        short: 'No Bill' },
  DISCOUNT_ABUSE:          { icon: '🏷️', label: 'Discount Abuse',          short: 'Discount Abuse' },
  VOID_ABUSE:              { icon: '⛔', label: 'Void Abuse',              short: 'Void Abuse' },
  QUICK_CANCEL:            { icon: '⚡', label: 'Quick Cancel',            short: 'Quick Cancel' },
  LATE_NIGHT_ANOMALY:      { icon: '🌙', label: 'Late Night Anomaly',      short: 'Late Night' },
  REFUND_PATTERN:          { icon: '💸', label: 'Refund Pattern',          short: 'Refund Pattern' },
};

const RISK_LEVEL = {
  high:   { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: '🔴 High Risk' },
  medium: { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  label: '🟡 Medium Risk' },
  low:    { color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   label: '🔵 Low Risk' },
  clean:  { color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20',label: '🟢 Clean' },
};

/* ─── Score Ring ──────────────────────────────────────────── */
function ScoreRing({ score, size = 56 }) {
  const r  = (size - 8) / 2;
  const c  = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const color = score >= 80 ? '#f87171' : score >= 60 ? '#fb923c' : score >= 40 ? '#fbbf24' : '#34d399';
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ fill: color, fontSize: size * 0.22, fontWeight: 700, transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  );
}

/* ─── Alert Card ──────────────────────────────────────────── */
function AlertCard({ alert, outletId, onAction }) {
  const [expanded,    setExpanded]    = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [resolving,   setResolving]   = useState(false);
  const sv   = SEVERITY[alert.severity] || SEVERITY.medium;
  const meta = ALERT_TYPE_META[alert.alert_type] || { icon: '⚠️', label: alert.alert_type, short: alert.alert_type };
  const ev   = alert.evidence || {};

  const timeAgo = (dt) => {
    const diff = (Date.now() - new Date(dt)) / 1000;
    if (diff < 60) return `${Math.round(diff)}s ago`;
    if (diff < 3600) return `${Math.round(diff/60)}m ago`;
    return `${Math.round(diff/3600)}h ago`;
  };

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${sv.border} ${sv.bg} ${!alert.is_read ? 'ring-1 ring-white/10' : ''}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Severity dot + icon */}
          <div className="flex flex-col items-center gap-1 pt-0.5">
            <div className={`w-2.5 h-2.5 rounded-full ${sv.dot} ${!alert.is_read ? 'animate-pulse' : ''}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">{meta.icon}</span>
                  <span className={`text-xs font-bold uppercase tracking-wide ${sv.color}`}>{sv.label}</span>
                  <span className="text-xs text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{meta.short}</span>
                  {alert.wa_notified && (
                    <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <MessageCircle size={9} /> WA Sent
                    </span>
                  )}
                  {alert.is_resolved && (
                    <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle size={9} /> Resolved
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-white leading-snug">{alert.title}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ScoreRing score={alert.risk_score} size={44} />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-1.5">
              {alert.staff && (
                <span className="flex items-center gap-1 text-xs text-white/40">
                  <User size={10} /> {alert.staff.name} ({alert.staff.role})
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-white/30">
                <Clock size={10} /> {timeAgo(alert.created_at)}
              </span>
            </div>

            {/* Evidence chips */}
            {Object.keys(ev).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ev.cancel_count !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    {ev.cancel_count} cancels
                  </span>
                )}
                {ev.total_orders !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    {ev.total_orders} total orders
                  </span>
                )}
                {ev.cancel_pct !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    {ev.cancel_pct}% cancellation rate
                  </span>
                )}
                {ev.total_amount !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    ₹{Number(ev.total_amount).toFixed(0)} at risk
                  </span>
                )}
                {ev.discount_count !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    {ev.discount_count} discounted orders
                  </span>
                )}
                {ev.avg_disc_pct !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    avg {ev.avg_disc_pct}% discount
                  </span>
                )}
                {ev.void_count !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    {ev.void_count} voids
                  </span>
                )}
                {ev.refund_count !== undefined && (
                  <span className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                    {ev.refund_count} refunds
                  </span>
                )}
              </div>
            )}

            {/* Expanded description */}
            {expanded && (
              <div className="mt-3 p-3 bg-black/20 rounded-lg">
                <p className="text-xs text-white/60 leading-relaxed">{alert.description}</p>
                {alert.resolved_note && (
                  <div className="mt-2 p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
                    <p className="text-xs text-emerald-400">Resolution note: {alert.resolved_note}</p>
                  </div>
                )}
              </div>
            )}

            {/* Resolve input */}
            {resolving && (
              <div className="mt-3 flex gap-2">
                <input value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                  placeholder="Resolution note (optional)…"
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50" />
                <button onClick={() => { onAction('resolve', alert.id, resolveNote); setResolving(false); }}
                  className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs border border-emerald-500/30 hover:bg-emerald-500/30">
                  Confirm
                </button>
                <button onClick={() => setResolving(false)}
                  className="px-3 py-1.5 bg-white/5 text-white/40 rounded-lg text-xs hover:bg-white/10">
                  Cancel
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => { setExpanded(!expanded); onAction('read', alert.id); }}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors">
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? 'Less' : 'Details'}
              </button>
              {!alert.is_resolved && (
                <>
                  <button onClick={() => setResolving(!resolving)}
                    className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                    <Check size={10} /> Resolve
                  </button>
                  <button onClick={() => onAction('dismiss', alert.id)}
                    className="flex items-center gap-1 text-xs bg-white/5 text-white/30 px-2 py-1 rounded-md hover:bg-white/10 hover:text-white/50 transition-colors">
                    <XCircle size={10} /> Dismiss
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Staff Risk Card ─────────────────────────────────────── */
function StaffRiskCard({ staff }) {
  const rl = RISK_LEVEL[staff.risk_level] || RISK_LEVEL.clean;
  return (
    <div className={`rounded-xl border p-4 ${rl.border} ${rl.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg">
            {staff.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="font-semibold text-white text-sm">{staff.name}</div>
            <div className="text-xs text-white/40 capitalize">{staff.role}</div>
          </div>
        </div>
        <ScoreRing score={staff.max_risk_score} size={50} />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold ${rl.color}`}>{rl.label}</span>
        {staff.unresolved > 0 && (
          <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full border border-red-500/30">
            {staff.unresolved} open
          </span>
        )}
      </div>

      {staff.alert_types?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {staff.alert_types.map(t => (
            <span key={t} className="text-xs bg-white/5 text-white/40 px-1.5 py-0.5 rounded-full">
              {ALERT_TYPE_META[t]?.icon} {ALERT_TYPE_META[t]?.short || t}
            </span>
          ))}
        </div>
      )}

      {staff.risk_level === 'clean' && (
        <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
          <Shield size={11} /> No alerts in 30 days
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────── */
export default function FraudDetectionPage() {
  const outletId = localStorage.getItem('outlet_id') || '';
  const [tab, setTab]             = useState('alerts');
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter]         = useState('');
  const [unreadOnly, setUnreadOnly]         = useState(false);
  const [scanning, setScanning]             = useState(false);
  const [scanResult, setScanResult]         = useState(null);
  const qc = useQueryClient();

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['fraud-stats', outletId],
    queryFn:  () => fraudApi.stats(outletId),
    enabled:  !!outletId,
    refetchInterval: 60000,
  });

  const { data: alertsData, isLoading: loadingAlerts } = useQuery({
    queryKey: ['fraud-alerts', outletId, severityFilter, typeFilter, unreadOnly],
    queryFn:  () => fraudApi.alerts(outletId, { severity: severityFilter || undefined, alert_type: typeFilter || undefined, unread: unreadOnly }),
    enabled:  !!outletId,
    refetchInterval: 30000,
  });

  const { data: riskProfiles, isLoading: loadingRisks } = useQuery({
    queryKey: ['fraud-risks', outletId],
    queryFn:  () => fraudApi.risks(outletId),
    enabled:  !!outletId && tab === 'staff',
    refetchInterval: 120000,
  });

  const invalidate = () => {
    qc.invalidateQueries(['fraud-alerts', outletId]);
    qc.invalidateQueries(['fraud-stats', outletId]);
    qc.invalidateQueries(['fraud-risks', outletId]);
  };

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await fraudApi.detect(outletId);
      setScanResult(result);
      invalidate();
    } catch(e) {
      setScanResult({ error: true });
    } finally {
      setScanning(false);
    }
  };

  const handleAction = async (action, alertId, note) => {
    if (action === 'read')    await fraudApi.markRead(alertId, outletId);
    if (action === 'dismiss') await fraudApi.dismiss(alertId, outletId);
    if (action === 'resolve') await fraudApi.resolve(alertId, outletId, note);
    invalidate();
  };

  const alerts = alertsData?.items || [];
  const bySev  = stats?.by_severity || {};

  const TABS = [
    { key: 'alerts',    label: 'Alerts',        icon: <AlertTriangle size={14} /> },
    { key: 'staff',     label: 'Staff Risk',     icon: <User size={14} /> },
    { key: 'analytics', label: 'Analytics',      icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ShieldAlert size={26} className="text-red-400" />
            Staff Fraud Detection
          </h1>
          <p className="text-white/40 text-sm mt-1">
            AI-powered behavioural analysis · Real-time pattern detection · Silent WhatsApp alerts to owner
          </p>
        </div>
        <button onClick={handleScan} disabled={scanning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-black transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #f87171, #dc2626)' }}>
          {scanning ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
          {scanning ? 'Scanning…' : 'Run Scan Now'}
        </button>
      </div>

      {/* Scan result toast */}
      {scanResult && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          scanResult.error
            ? 'border-red-500/30 bg-red-500/10'
            : scanResult.total === 0
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          {scanResult.error ? (
            <><AlertTriangle size={18} className="text-red-400" /><span className="text-sm text-red-400">Scan failed. Check your connection.</span></>
          ) : scanResult.total === 0 ? (
            <><CheckCircle size={18} className="text-emerald-400" /><span className="text-sm text-emerald-400">✓ Clean scan — no new fraud patterns detected.</span></>
          ) : (
            <><AlertTriangle size={18} className="text-amber-400" /><span className="text-sm text-amber-400">⚠️ Found {scanResult.total} new alert{scanResult.total > 1 ? 's' : ''}. Review below.</span></>
          )}
          <button onClick={() => setScanResult(null)} className="ml-auto text-white/30 hover:text-white"><X size={14} /></button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Alerts', value: stats?.total || 0,   icon: <ShieldAlert size={16} />, color: 'text-white' },
          { label: 'Unread',       value: stats?.unread || 0,  icon: <Bell size={16} />,        color: 'text-amber-400' },
          { label: 'Critical',     value: bySev.critical || 0, icon: <AlertTriangle size={16} />, color: 'text-red-400' },
          { label: 'High',         value: bySev.high || 0,     icon: <Flag size={16} />,        color: 'text-orange-400' },
          { label: 'WA Notified',  value: alertsData?.items?.filter(a => a.wa_notified).length || 0, icon: <MessageCircle size={16} />, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className={`flex items-center gap-2 mb-1 ${s.color}`}>{s.icon}<span className="text-xs text-white/40">{s.label}</span></div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-red-500 text-white' : 'text-white/50 hover:text-white'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── ALERTS TAB ── */}
      {tab === 'alerts' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">All Types</option>
              {Object.entries(ALERT_TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.short}</option>
              ))}
            </select>

            <button onClick={() => setUnreadOnly(!unreadOnly)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                unreadOnly ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
              }`}>
              <Bell size={13} /> Unread Only
            </button>

            {(severityFilter || typeFilter || unreadOnly) && (
              <button onClick={() => { setSeverityFilter(''); setTypeFilter(''); setUnreadOnly(false); }}
                className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1">
                <X size={11} /> Clear
              </button>
            )}

            <div className="ml-auto flex gap-2">
              <button onClick={() => fraudApi.readAll(outletId).then(invalidate)}
                className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1">
                <Eye size={12} /> Mark all read
              </button>
            </div>
          </div>

          {/* Alert list */}
          {loadingAlerts ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-400" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Shield size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">No alerts found</p>
              <p className="text-xs mt-1">Run a scan to check for suspicious patterns.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sort by severity order */}
              {['critical','high','medium','low'].map(sev => {
                const group = alerts.filter(a => a.severity === sev);
                if (!group.length) return null;
                const sv = SEVERITY[sev];
                return (
                  <div key={sev}>
                    <div className={`flex items-center gap-2 mb-2 ${sv.color}`}>
                      <div className={`w-2 h-2 rounded-full ${sv.dot}`} />
                      <span className="text-xs font-bold uppercase tracking-wider">{sv.label} Risk ({group.length})</span>
                    </div>
                    <div className="space-y-2">
                      {group.map(a => <AlertCard key={a.id} alert={a} outletId={outletId} onAction={handleAction} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── STAFF RISK TAB ── */}
      {tab === 'staff' && (
        <>
          {loadingRisks ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-400" />
            </div>
          ) : !riskProfiles?.length ? (
            <div className="text-center py-16 text-white/30">
              <User size={48} className="mx-auto mb-4 opacity-30" />
              <p>No staff profiles found.</p>
            </div>
          ) : (
            <>
              {/* High risk staff first */}
              {['high','medium','low','clean'].map(rl => {
                const group = riskProfiles.filter(s => s.risk_level === rl);
                if (!group.length) return null;
                const cfg = RISK_LEVEL[rl];
                return (
                  <div key={rl} className="mb-6">
                    <h2 className={`text-sm font-bold uppercase tracking-wider mb-3 ${cfg.color}`}>
                      {cfg.label} ({group.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {group.map(s => <StaffRiskCard key={s.id} staff={s} />)}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {/* ── ANALYTICS TAB ── */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          {/* Alert type breakdown */}
          <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 size={14} className="text-red-400" /> Alert Types (Last 7 Days)
            </h2>
            {stats?.by_type?.length > 0 ? (
              <div className="space-y-3">
                {[...(stats.by_type || [])].sort((a,b) => b.count - a.count).map(row => {
                  const meta = ALERT_TYPE_META[row.type] || { icon: '⚠️', short: row.type };
                  const max  = Math.max(...(stats.by_type || []).map(r => r.count), 1);
                  const pct  = Math.round((row.count / max) * 100);
                  return (
                    <div key={row.type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-white/70 flex items-center gap-2">
                          <span>{meta.icon}</span> {meta.short || row.type}
                        </span>
                        <span className="text-sm font-semibold text-white">{row.count}</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-white/30 text-sm">No alert data yet — run a scan first.</p>
            )}
          </div>

          {/* 7-day trend */}
          <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Activity size={14} className="text-amber-400" /> 7-Day Alert Trend
            </h2>
            {stats?.trend_7d?.length > 0 ? (
              <div className="flex items-end gap-2 h-28">
                {stats.trend_7d.map((row, i) => {
                  const maxCount = Math.max(...stats.trend_7d.map(r => Number(r.count)), 1);
                  const h = Math.max(4, (Number(row.count) / maxCount) * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-white/40">{Number(row.count)}</span>
                      <div className="w-full rounded-t-md bg-gradient-to-t from-red-500/60 to-orange-500/40 transition-all"
                        style={{ height: `${h}%` }} />
                      <span className="text-xs text-white/30">
                        {new Date(row.day).toLocaleDateString('en-IN', { weekday: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-white/30 text-sm">No trend data yet.</p>
            )}
          </div>

          {/* Detection rules reference */}
          <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Shield size={14} className="text-blue-400" /> Detection Rules Active
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(ALERT_TYPE_META).map(([key, meta]) => (
                <div key={key} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-xl mt-0.5">{meta.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-white">{meta.label}</div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {key === 'EXCESSIVE_CANCELLATIONS' && 'Triggers when >3 cancels in 8h or >25% cancel rate'}
                      {key === 'KOT_WITHOUT_BILL'        && 'KOT served 3+ hours with no payment collected'}
                      {key === 'DISCOUNT_ABUSE'          && '>4 discounts in shift with avg >20% off'}
                      {key === 'VOID_ABUSE'              && '>3 voids in current shift'}
                      {key === 'QUICK_CANCEL'            && 'Order cancelled within 5 min of creation'}
                      {key === 'LATE_NIGHT_ANOMALY'      && 'High-value tx after 11 PM without oversight'}
                      {key === 'REFUND_PATTERN'          && '>3 refunds by same staff in one day'}
                    </div>
                  </div>
                  <div className="ml-auto">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
