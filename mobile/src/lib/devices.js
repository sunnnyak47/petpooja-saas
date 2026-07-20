/**
 * devices — pure helpers for the Devices & Security screen (parity with the web
 * DevicesSecurityPage). No React / RN / api imports, so the /auth/sessions +
 * /auth/login-history contract is unit-testable. Consumed by useDevices.js.
 *
 * The mobile api interceptor returns the response BODY ({ success, data, message }),
 * so the extractors accept either the body or a raw payload.
 */

function payload(body) {
  return body?.data ?? body ?? null;
}

/** Active device sessions (newest server order preserved). */
export function extractSessions(body) {
  const p = payload(body);
  return Array.isArray(p?.sessions) ? p.sessions : [];
}

/** Recent login-history rows. */
export function extractHistory(body) {
  const p = payload(body);
  return Array.isArray(p?.items) ? p.items : [];
}

/** Last successful login timestamp, or null. */
export function lastLoginAt(body) {
  const p = payload(body);
  return p?.last_login_at ?? null;
}

/** How many OTHER (revocable, non-current) sessions there are. */
export function otherSessionsCount(sessions) {
  return (Array.isArray(sessions) ? sessions : []).filter((s) => s && s.sid && !s.is_current).length;
}

/** A friendly device label, never blank. */
export function deviceLabel(s) {
  const l = s?.device_label && String(s.device_label).trim();
  return l || 'Unknown device';
}

/** Ionicons name for a device type. */
export function deviceIconName(type) {
  switch (String(type || '').toLowerCase()) {
    case 'mobile':
    case 'phone': return 'phone-portrait-outline';
    case 'tablet': return 'tablet-portrait-outline';
    case 'desktop':
    case 'web': return 'desktop-outline';
    case 'pos': return 'card-outline';
    default: return 'help-circle-outline';
  }
}

/** Best available timestamp for a session / history row. */
export function sessionTime(s) {
  return s?.signed_in_at ?? s?.last_active_at ?? null;
}
export function historyTime(h) {
  return h?.at ?? h?.created_at ?? null;
}

/** Turn an audit action into human text. */
export function actionLabel(action) {
  const a = String(action || '').toUpperCase();
  if (a.includes('LOGOUT')) return 'Signed out';
  if (a.includes('LOGIN')) return 'Signed in';
  return action || '';
}

/** Compact relative time. `now` is injectable for deterministic tests. */
export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
