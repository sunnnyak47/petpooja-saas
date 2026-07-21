/**
 * festival — pure helpers for the Festival Mode screen (mobile). No React / RN /
 * api / expo imports, so the /festival contract stays unit-testable. Consumed by
 * src/hooks/useFestival.js + app/(tabs)/festival.jsx.
 *
 * Backend source of truth — backend/src/modules/festival:
 *   GET  /festival/active?outlet_id=      → sendSuccess(data: <config>|null)  currently-active mode
 *   GET  /festival/configs?outlet_id=     → sendSuccess(data: [config,...])   all saved configs (start_date asc)
 *   GET  /festival/master?country=&year=  → sendSuccess(data: [def,...])      master catalogue
 *   POST /festival/configs/:id/toggle  { outlet_id } → sendSuccess(data: <config>)  flips is_active
 *
 * The mobile api interceptor returns the response BODY ({ success, data, message }),
 * so every extractor accepts EITHER the body OR an already-unwrapped payload.
 *
 * A saved config (Prisma festivalMode) row looks like:
 *   { id, outlet_id, festival_key, festival_name, country, region,
 *     start_date, end_date, is_active, special_mode, theme,
 *     menu_suggestions, offer_structure:{ type, label, value, unit, min_order }, custom_banner }
 * A master def looks like:
 *   { key, name, country, regions[], start, end, theme:{ emoji, ... },
 *     menu_tags[], suggested_items[], offer_structure, decor_tips[], category }
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

// ─── unwrap ──────────────────────────────────────────────────────────────────

/**
 * Peel the { success, data, message } envelope if present, otherwise return the
 * value as-is. Returns `data` even when it is null (the /active endpoint returns
 * `data: null` when nothing is active — we must not fall back to the envelope).
 */
function payloadOf(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    return body.data;
  }
  return body ?? null;
}

/** All saved configs, tolerant of body / raw payload / { items }. */
export function extractConfigs(body) {
  const p = payloadOf(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

/** Master catalogue defs, tolerant of body / raw payload / { items }. */
export function extractMaster(body) {
  const p = payloadOf(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

/** The currently-active config, or null. Guards against arrays / envelopes. */
export function extractActive(body) {
  const p = payloadOf(body);
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  // Must look like a festival config/def (has an id, key or name).
  if (p.id == null && p.festival_key == null && p.key == null && p.festival_name == null) return null;
  return p;
}

// ─── identity / labels ───────────────────────────────────────────────────────

/** Stable string id for a config, or null. */
export function configId(config) {
  return config?.id != null ? String(config.id) : null;
}

/** The festival key (configs use festival_key, master defs use key). */
export function configKey(config) {
  return config?.festival_key ?? config?.key ?? null;
}

/** A never-blank display name (configs: festival_name, master: name). */
export function festivalName(config) {
  const n = config?.festival_name ?? config?.name;
  const s = n && String(n).trim();
  return s || 'Festival';
}

/** Is this config currently switched on? */
export function isConfigActive(config) {
  return !!config?.is_active;
}

/** Leading emoji for the festival, from its theme; falls back to a party popper. */
export function festivalEmoji(config) {
  const t = config?.theme;
  const e = t && typeof t === 'object' ? t.emoji : null;
  return (e && String(e)) || '🎉';
}

// ─── list-level helpers ──────────────────────────────────────────────────────

/** Id of the (first) active config in a list, or null. */
export function activeConfigId(configs) {
  const list = Array.isArray(configs) ? configs : [];
  const a = list.find(isConfigActive);
  return a ? configId(a) : null;
}

/** How many configs are switched on. */
export function countActive(configs) {
  return (Array.isArray(configs) ? configs : []).filter(isConfigActive).length;
}

/** Configs sorted by start date ascending (mirrors the backend list order). */
export function sortConfigs(configs) {
  const list = Array.isArray(configs) ? configs.slice() : [];
  return list.sort((a, b) => {
    const ta = Date.parse(a?.start_date ?? a?.start ?? '') || 0;
    const tb = Date.parse(b?.start_date ?? b?.start ?? '') || 0;
    return ta - tb;
  });
}

// ─── dates ───────────────────────────────────────────────────────────────────

function toDate(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

// UTC getters so the printed calendar day never drifts across timezones.
function fmtDay(dt) {
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

function startOf(config) {
  return config?.start_date ?? config?.start ?? null;
}
function endOf(config) {
  return config?.end_date ?? config?.end ?? null;
}

/** "26 Jan" for a single day, "20 Oct – 22 Oct" for a range, "" if unparseable. */
export function formatDateRange(start, end) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s && !e) return '';
  if (s && !e) return fmtDay(s);
  if (!s && e) return fmtDay(e);
  const sStr = fmtDay(s);
  const eStr = fmtDay(e);
  return sStr === eStr ? sStr : `${sStr} – ${eStr}`;
}

/** Date range straight off a config/def object. */
export function configDateRange(config) {
  return formatDateRange(startOf(config), endOf(config));
}

// ─── offer / uplift ──────────────────────────────────────────────────────────

/** Normalise offer_structure → { type, label, value, unit, minOrder } | null. */
export function offerOf(config) {
  const o = config?.offer_structure;
  if (!o || typeof o !== 'object') return null;
  const value = Number(o.value);
  const min = o.min_order != null ? Number(o.min_order) : null;
  return {
    type: o.type ?? null,
    label: o.label ?? null,
    value: Number.isFinite(value) ? value : null,
    unit: o.unit ?? null,
    minOrder: min != null && Number.isFinite(min) ? min : null,
  };
}

/** Compact surcharge/uplift badge, e.g. "26%" (percent) or the raw value. "" if none. */
export function formatOfferValue(config) {
  const o = offerOf(config);
  if (!o || o.value == null) return '';
  if (o.unit === 'percent') return `${o.value}%`;
  return String(o.value);
}

/** Human headline for the offer — its label, else its type, else "". */
export function offerHeadline(config) {
  const o = offerOf(config);
  if (!o) return '';
  if (o.label) return String(o.label);
  if (o.type) return String(o.type).replace(/_/g, ' ');
  return '';
}

// ─── status + relative time ──────────────────────────────────────────────────

/**
 * Window status of a festival relative to `now` (injectable for tests):
 * 'upcoming' | 'ongoing' | 'ended' | 'unknown'. The end date is inclusive of its
 * whole day.
 */
export function festivalStatus(config, now = Date.now()) {
  const s = toDate(startOf(config));
  const e = toDate(endOf(config));
  if (!s && !e) return 'unknown';
  const startMs = s ? s.getTime() : -Infinity;
  const endMs = e ? e.getTime() + DAY_MS : Infinity;
  if (now < startMs) return 'upcoming';
  if (now >= startMs && now < endMs) return 'ongoing';
  return 'ended';
}

const STATUS_META = {
  ongoing: { label: 'Ongoing', tone: 'success' },
  upcoming: { label: 'Upcoming', tone: 'accent' },
  ended: { label: 'Ended', tone: 'muted' },
  unknown: { label: '', tone: 'muted' },
};

/** Label + semantic tone key for a window status. */
export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.unknown;
}

/**
 * Compact relative time to a date. `now` is injectable for deterministic tests.
 * "today" / "tomorrow" / "yesterday" / "in 3d" / "5d ago"; "" for bad input.
 */
export function timeUntil(dateStr, now = Date.now()) {
  const t = toDate(dateStr);
  if (!t) return '';
  const diffDays = Math.round((t.getTime() - now) / DAY_MS);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 0) return `in ${diffDays}d`;
  return `${-diffDays}d ago`;
}

/**
 * From the master catalogue, the soonest festivals that have not fully ended yet,
 * soonest-first, capped at `limit`. `now` injectable for tests.
 */
export function upcomingFromMaster(master, now = Date.now(), limit = 8) {
  const list = Array.isArray(master) ? master : [];
  const cap = Math.max(0, limit);
  return list
    .map((f) => {
      const start = toDate(f?.start ?? f?.start_date);
      const end = toDate(f?.end ?? f?.end_date);
      return {
        f,
        startMs: start ? start.getTime() : Infinity,
        endMs: (end ? end.getTime() : start ? start.getTime() : -Infinity) + DAY_MS,
      };
    })
    .filter((x) => x.endMs >= now)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, cap)
    .map((x) => x.f);
}

// ─── request body ────────────────────────────────────────────────────────────

/** Toggle body — owner JWT outlet_id is often null, so always send it explicitly. */
export function toggleBody(outletId) {
  return { outlet_id: outletId };
}
