import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  ShieldCheck, Monitor, Smartphone, Tablet, AppWindow, MapPin, LogOut, Clock,
  LogIn, History, Loader2, HelpCircle, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * DevicesSecurityPage — self-service account security for owners/staff.
 * Shows the last sign-in, the list of devices currently signed in (with the
 * current device marked), a "log out all other devices" action, per-device
 * sign-out, and recent sign-in history. Backed by /api/auth/sessions,
 * /api/auth/login-history and the revoke endpoints. Region-agnostic — mounted
 * for both India and Australia navs.
 */

function timeAgo(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo} mo ago`;
  return `${Math.floor(mo / 12)} yr ago`;
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const DEVICE_ICON = { desktop: Monitor, laptop: Monitor, mobile: Smartphone, tablet: Tablet, app: AppWindow };
const deviceIcon = (type) => DEVICE_ICON[type] || HelpCircle;

export default function DevicesSecurityPage() {
  const qc = useQueryClient();
  const [confirmAll, setConfirmAll] = useState(false);

  const { data: sess, isLoading, isError, refetch } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.get('/auth/sessions').then((r) => r.data),
    refetchInterval: 60_000,
  });
  const { data: history } = useQuery({
    queryKey: ['auth-login-history'],
    queryFn: () => api.get('/auth/login-history?limit=25').then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['auth-sessions'] });
    qc.invalidateQueries({ queryKey: ['auth-login-history'] });
  };

  const revokeMut = useMutation({
    mutationFn: (sid) => api.post(`/auth/sessions/${sid}/revoke`),
    onSuccess: () => { toast.success('Device signed out'); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not sign out that device'),
  });
  const logoutOthersMut = useMutation({
    mutationFn: () => api.post('/auth/sessions/logout-others'),
    onSuccess: (r) => { toast.success(r?.message || 'Signed out other devices'); setConfirmAll(false); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not sign out other devices'),
  });

  const sessions = sess?.sessions || [];
  const otherCount = sessions.filter((s) => !s.is_current && s.sid).length;
  const current = sessions.find((s) => s.is_current);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ShieldCheck size={22} style={{ color: 'var(--accent)' }} /> Devices &amp; Security
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            See where you&apos;re signed in, review recent activity, and sign out devices you don&apos;t recognise.
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={Clock}
          label="Last sign-in"
          value={sess?.last_login_at ? timeAgo(sess.last_login_at) : '—'}
          sub={sess?.last_login_at ? fmtDateTime(sess.last_login_at) : 'No record yet'}
        />
        <SummaryCard
          icon={Monitor}
          label="Active devices"
          value={isLoading ? '…' : String(sess?.active_count ?? sessions.length)}
          sub={otherCount > 0 ? `${otherCount} besides this one` : 'Only this device'}
          accent
        />
        <SummaryCard
          icon={current ? deviceIcon(current.device_type) : HelpCircle}
          label="This device"
          value={current?.browser || '—'}
          sub={current?.os || 'Unknown'}
        />
      </div>

      {/* Active devices */}
      <div className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Monitor size={17} style={{ color: 'var(--accent)' }} /> Signed-in devices
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Devices with an active session in the last 7 days.</p>
          </div>
          {!confirmAll ? (
            <button
              onClick={() => setConfirmAll(true)}
              disabled={otherCount === 0}
              className="text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
            >
              <LogOut size={14} className="inline mr-1.5 -mt-0.5" /> Log out all other devices
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sign out {otherCount} device(s)?</span>
              <button onClick={() => setConfirmAll(false)} className="text-sm px-3 py-2 rounded-lg" style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}>Cancel</button>
              <button
                onClick={() => logoutOthersMut.mutate()}
                disabled={logoutOthersMut.isPending}
                className="text-sm font-semibold px-3 py-2 rounded-lg text-white inline-flex items-center gap-1.5"
                style={{ background: 'var(--danger)' }}
              >
                {logoutOthersMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Confirm
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : isError ? (
          <div className="text-center py-10">
            <AlertTriangle size={28} className="mx-auto mb-2" style={{ color: 'var(--warning)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Could not load your devices.</p>
            <button onClick={() => refetch()} className="btn-primary btn-sm mt-3">Retry</button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sessions.map((s, i) => {
              const Icon = deviceIcon(s.device_type);
              return (
                <div
                  key={s.sid || `cur-${i}`}
                  className="flex items-center gap-3.5 p-3 rounded-xl border"
                  style={{
                    borderColor: s.is_current ? 'color-mix(in srgb, var(--success) 45%, var(--border))' : 'var(--border)',
                    background: s.is_current ? 'color-mix(in srgb, var(--success) 6%, transparent)' : 'var(--bg-card)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                  >
                    <Icon size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.device_label}</span>
                      {s.is_current && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 14%, transparent)' }}>
                          <CheckCircle2 size={10} /> This device
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs flex-wrap" style={{ color: 'var(--text-secondary)' }}>
                      {s.ip && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {s.ip}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> {s.signed_in_at ? `Signed in ${timeAgo(s.signed_in_at)}` : 'Active now'}
                      </span>
                    </div>
                  </div>
                  {s.is_current ? (
                    <span className="text-xs font-medium px-2" style={{ color: 'var(--success)' }}>Current</span>
                  ) : s.sid ? (
                    <button
                      onClick={() => revokeMut.mutate(s.sid)}
                      disabled={revokeMut.isPending}
                      className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-shrink-0 inline-flex items-center gap-1.5"
                      style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
                    >
                      <LogOut size={13} /> Sign out
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Login history */}
      <div className="card">
        <h2 className="text-base font-semibold flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
          <History size={17} style={{ color: 'var(--accent)' }} /> Recent sign-in activity
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Your last 25 sign-in and sign-out events.</p>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Device</th>
                <th className="px-3 py-2 font-semibold">IP address</th>
                <th className="px-3 py-2 font-semibold">Event</th>
              </tr>
            </thead>
            <tbody>
              {(history?.items || []).length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>No sign-in activity yet.</td></tr>
              ) : (history?.items || []).map((h) => {
                const Icon = deviceIcon(h.device_type);
                const isLogin = h.action === 'login';
                return (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{fmtDateTime(h.at)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <Icon size={14} /> <span className="truncate max-w-[220px]">{h.device_label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{h.ip || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg"
                        style={{
                          color: isLogin ? 'var(--success)' : 'var(--text-secondary)',
                          background: isLogin ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'var(--bg-hover)',
                        }}>
                        {isLogin ? <LogIn size={12} /> : <LogOut size={12} />} {isLogin ? 'Signed in' : 'Signed out'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="card flex items-center gap-3.5">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: accent ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-hover)',
          color: accent ? 'var(--accent)' : 'var(--text-secondary)',
        }}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <p className="text-lg font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{sub}</p>
      </div>
    </div>
  );
}
