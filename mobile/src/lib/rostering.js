/**
 * rostering — pure helpers for the Rostering (staff shift roster) screen.
 *
 * VIEW-focused: extract + shape the data the read-only screen renders, plus a
 * couple of guards for the one safe write (publish a draft roster). No React /
 * RN / api / expo imports — this is the unit-tested contract for the backend
 * routes at /api/rostering (backend/src/modules/staff/rostering.*).
 *
 * The mobile api interceptor returns the response BODY ({ success, data, message }),
 * so every extractor accepts EITHER that body OR a raw payload (the array itself).
 *
 * Backend shapes (source of truth):
 *   GET /rostering               → data: Roster[]   (each includes `assignments`)
 *   GET /rostering/available-staff?date= → data: Staff[] (already availability-filtered)
 *   POST /rostering/:id/publish  → draft → published (rejects an empty roster)
 *
 *   Roster     { id, name, status:'draft'|'published'|'archived', start_date,
 *                end_date, notes, creator:{id,full_name}, assignments:[...] }
 *   Assignment { id, staff_id, date, start_time, end_time, role_label, status,
 *                staff:{ id, full_name, avatar_url } }
 *   Staff      { id, full_name, avatar_url, is_active, available,
 *                preferred_start, preferred_end }
 */

const DAY_MS = 86400000;
const DASH = ' – '; // spaced en-dash

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_META = {
  draft: { label: 'Draft', tone: '#f59e0b' },
  published: { label: 'Published', tone: '#16a34a' },
  archived: { label: 'Archived', tone: '#94a3b8' },
};

// ─── body / payload plumbing ────────────────────────────────────────────────

function payload(body) {
  return body?.data ?? body ?? null;
}

/** Roster[] from the api body OR a raw array/payload. */
export function extractRosters(body) {
  const p = payload(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.items)) return p.items;
  if (Array.isArray(p?.rosters)) return p.rosters;
  return [];
}

/** Available Staff[] from the api body OR a raw array/payload. */
export function extractAvailableStaff(body) {
  const p = payload(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.items)) return p.items;
  if (Array.isArray(p?.staff)) return p.staff;
  return [];
}

/** A roster's assignments, always an array. */
export function assignmentsOf(roster) {
  return Array.isArray(roster?.assignments) ? roster.assignments : [];
}

// ─── date / time formatting ─────────────────────────────────────────────────

/** Normalise any date value to a YYYY-MM-DD key (UTC, no timezone drift). */
export function dayKey(value) {
  if (!value) return '';
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** "Mon 21 Jul" for a date value; '' when unparseable. */
export function formatDayLabel(value) {
  const key = dayKey(value);
  if (!key) return '';
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Mon 21 Jul – Sun 27 Jul" for a roster's span. */
export function formatDateRange(start, end) {
  const a = formatDayLabel(start);
  const b = formatDayLabel(end);
  if (a && b) return `${a}${DASH}${b}`;
  return a || b || '';
}

/** Clamp a time string to HH:MM; passes odd values through, '' when blank. */
export function formatTime(t) {
  if (t == null) return '';
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** "09:00 – 17:00" for a shift; falls back gracefully, '—' when empty. */
export function formatShift(assignment) {
  const a = assignment || {};
  const start = formatTime(a.start_time);
  const end = formatTime(a.end_time);
  if (start && end) return `${start}${DASH}${end}`;
  return start || end || '—';
}

/** Preferred availability window for a staff member, or 'Any time'. */
export function preferredWindow(person) {
  const p = person || {};
  const start = formatTime(p.preferred_start);
  const end = formatTime(p.preferred_end);
  if (start && end) return `${start}${DASH}${end}`;
  return 'Any time';
}

// ─── labels / status ────────────────────────────────────────────────────────

/** Staff display name on an assignment; never blank. */
export function staffName(assignment) {
  const n = assignment?.staff?.full_name && String(assignment.staff.full_name).trim();
  return n || 'Unassigned';
}

/** Role for an assignment; defaults to 'Staff'. */
export function roleLabel(assignment) {
  const r = assignment?.role_label && String(assignment.role_label).trim();
  return r || 'Staff';
}

/** Staff display name for the availability section; never blank. */
export function personName(person) {
  const n = person?.full_name && String(person.full_name).trim();
  return n || 'Staff member';
}

/** { label, tone } for a roster status; tolerant of unknown values. */
export function rosterStatusMeta(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_META[key] || { label: status ? String(status) : 'Unknown', tone: '#94a3b8' };
}

/** Up-to-2-char initials for an avatar chip. */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── availability ───────────────────────────────────────────────────────────

/** A person counts as available unless explicitly flagged unavailable. */
export function isAvailable(person) {
  return !!person && person.available !== false;
}

/** Keep only available staff. */
export function availableOnly(list) {
  return (Array.isArray(list) ? list : []).filter(isAvailable);
}

// ─── roster selection / grouping / summary ──────────────────────────────────

const byStartDesc = (a, b) => new Date(b?.start_date || 0) - new Date(a?.start_date || 0);

/**
 * Pick the "current / this week" roster: the one whose [start,end] span covers
 * `now`; otherwise the most recently starting one. `now` is injectable.
 */
export function pickCurrentRoster(rosters, now = Date.now()) {
  const list = (Array.isArray(rosters) ? rosters : []).filter(Boolean);
  if (list.length === 0) return null;
  const t = typeof now === 'number' ? now : new Date(now).getTime();
  const covering = list.filter((r) => {
    const s = new Date(r.start_date).getTime();
    const e = new Date(r.end_date).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) return false;
    return s <= t && t <= e + DAY_MS - 1; // include the whole end day
  });
  if (covering.length) return covering.slice().sort(byStartDesc)[0];
  return list.slice().sort(byStartDesc)[0];
}

/**
 * Group a roster's assignments into day sections, days ascending, and within a
 * day sorted by start time. → [{ key:'YYYY-MM-DD', items:[...] }]
 */
export function groupAssignmentsByDay(assignments) {
  const list = Array.isArray(assignments) ? assignments : [];
  const map = new Map();
  for (const a of list) {
    if (!a) continue;
    const key = dayKey(a.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  const groups = [...map.entries()].map(([key, items]) => ({
    key,
    items: items
      .slice()
      .sort((x, y) => String(x.start_time || '').localeCompare(String(y.start_time || ''))),
  }));
  groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return groups;
}

/** Roster totals: shift count, distinct staff, distinct days. */
export function summarizeRoster(roster) {
  const items = assignmentsOf(roster);
  const staff = new Set();
  const days = new Set();
  for (const a of items) {
    const id = a?.staff?.id ?? a?.staff_id;
    if (id) staff.add(id);
    const k = dayKey(a?.date);
    if (k) days.add(k);
  }
  return { shifts: items.length, staff: staff.size, days: days.size };
}

// ─── publish guards (the one safe write) ────────────────────────────────────

/** Is this roster already published? */
export function isPublished(roster) {
  return String(roster?.status || '').toLowerCase() === 'published';
}

/**
 * A draft roster with at least one assignment may be published — mirrors the
 * backend rule (publishRoster rejects an empty roster).
 */
export function canPublish(roster) {
  return !!roster && String(roster.status || '').toLowerCase() === 'draft' && assignmentsOf(roster).length > 0;
}

// ─── misc ───────────────────────────────────────────────────────────────────

/** Local YYYY-MM-DD for the availability `date` query param. `now` injectable. */
export function todayKey(now = Date.now()) {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Compact relative time. `now` injectable for deterministic tests. */
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
