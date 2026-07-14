/**
 * useQrCodes — data layer for the "Table ordering QR" screen (mobile-only).
 *
 * For every dine-in table in the SELECTED outlet we build a scannable customer
 * ordering deep-link. Scanning it on a guest phone opens the web ordering page
 * pre-scoped to this outlet + table, so the guest can browse the menu and place
 * an order from their seat.
 *
 * Tables come from the offline SQLite cache via useOfflineTables(outletId)
 * (the same source the Tables screen reads), so this screen works offline and
 * every fetch is implicitly scoped to the selected outlet.
 *
 * The URL math is pure and unit-tested (buildOrderingUrl + helpers) — no React,
 * no network — so the deep-link contract can be verified deterministically.
 */
import { useMemo, useState, useCallback } from 'react';
import Constants from 'expo-constants';
import { useOfflineTables } from './useOfflineTables';

// ─── Deep-link base ─────────────────────────────────────────────────────────
// The customer ordering site. Configurable via app.json expo.extra.webUrl;
// falls back to a sensible https default so QR codes are always scannable even
// before the web origin is wired into config.
export const WEB_ORDER_BASE = (
  Constants?.expoConfig?.extra?.webUrl ||
  'https://petpooja-saas.vercel.app'
).replace(/\/+$/, '');

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/**
 * Resolve an outlet id from either a bare id string or an outlet object.
 * @param {string|object} outlet
 * @returns {string}
 */
export function resolveOutletId(outlet) {
  if (!outlet) return '';
  if (typeof outlet === 'string' || typeof outlet === 'number') return String(outlet);
  return String(outlet.id ?? outlet.outlet_id ?? outlet.outletId ?? '');
}

/**
 * The number/label a guest and staff use to identify a table. Falls back
 * through the several field names the cache may carry.
 * @param {object} table
 * @returns {string}
 */
export function resolveTableNumber(table = {}) {
  const raw =
    table.table_number ??
    table.number ??
    table.tableNumber ??
    table.name ??
    table.id ??
    '';
  return String(raw);
}

/**
 * The table's backend id (UUID). The customer ordering page consumes the
 * `table` query param AS the table_id when the guest places an order, so the
 * deep-link must carry the id — NOT the human table number. Falls back to the
 * table number only if no id is present, so the URL is never empty.
 * @param {object} table
 * @returns {string}
 */
export function resolveTableId(table = {}) {
  return String(table.id ?? table.table_id ?? table.tableId ?? resolveTableNumber(table));
}

/**
 * A table may already carry a server-issued QR/ordering URL (e.g. printed
 * signage the backend generated). Prefer it verbatim when present so the QR the
 * app renders matches the one already in the wild.
 * @param {object} table
 * @returns {string|null}
 */
export function existingOrderingUrl(table = {}) {
  const direct = table.qr_url || table.ordering_url || table.orderingUrl || table.qrUrl;
  if (direct) return String(direct);
  const nested = table.data || {};
  const fromData = nested.qr_url || nested.ordering_url || nested.orderingUrl || nested.qrUrl;
  return fromData ? String(fromData) : null;
}

/**
 * Build the customer ordering deep-link for one table. Mirrors the web
 * generator EXACTLY (QRCodesPage.jsx): the web app is hash-routed and the
 * ordering page reads `outlet` + `table` (as table_id) query params, so:
 *   `${WEB_ORDER_BASE}/#/order?outlet=<outletId>&table=<tableId>`
 * If the table already carries a qr_url/ordering_url, that is returned as-is.
 *
 * @param {string|object} outlet - outlet id or outlet object
 * @param {object} table
 * @returns {string}
 */
export function buildOrderingUrl(outlet, table = {}) {
  const preset = existingOrderingUrl(table);
  if (preset) return preset;

  const outletId = resolveOutletId(outlet);
  const tableId = resolveTableId(table);
  const params = `outlet=${encodeURIComponent(outletId)}&table=${encodeURIComponent(tableId)}`;
  return `${WEB_ORDER_BASE}/#/order?${params}`;
}

/**
 * A friendly display label for a table.
 *
 * The offline tables cache stores `name = table.name ?? `Table <id>`` — so a
 * table with no name is cached as the literal "Table <uuid>". We therefore
 * PREFER the real table_number (carried in the raw `data` blob), then a genuine
 * name (not the uuid fallback), and only then a short id — never a raw UUID.
 * @param {object} table
 * @returns {string}
 */
export function tableLabel(table = {}) {
  const num = table.data?.table_number ?? table.data?.number ?? table.table_number;
  if (num != null && String(num).trim() !== '') return `Table ${num}`;
  const id = String(table.id ?? '');
  const name = table.name;
  // Reject the cache's "Table <uuid>" fallback (name contains the id prefix).
  if (name && !(id && name.includes(id.slice(0, 8)))) return name;
  return id ? `Table ${id.slice(0, 6)}` : 'Table';
}

/**
 * Does a table match a free-text search (by label, number, or section)?
 * Empty/blank query matches everything.
 * @param {object} table
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQuery(table = {}, query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [
    tableLabel(table),
    table.name,
    table.data?.table_number,
    table.section,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/**
 * Shape one cache row into a QR card model: keep the identity fields the UI
 * needs and attach the built ordering url.
 * @param {string|object} outlet
 * @param {object} table
 * @returns {{id,number,name,section,capacity,status,url,isPreset}}
 */
export function toQrCard(outlet, table = {}) {
  const url = buildOrderingUrl(outlet, table);
  const num = table.data?.table_number ?? table.data?.number;
  return {
    id: String(table.id ?? resolveTableNumber(table)),
    number: num != null ? String(num) : '',
    name: tableLabel(table),
    section: table.section || 'Main',
    capacity: table.capacity ?? null,
    status: table.status || 'empty',
    url,
    isPreset: !!existingOrderingUrl(table),
  };
}

/**
 * Build + filter the full list of QR cards from raw cache rows.
 * @param {string|object} outlet
 * @param {Array} tables
 * @param {string} query
 * @returns {Array}
 */
export function buildQrCards(outlet, tables = [], query = '') {
  return (Array.isArray(tables) ? tables : [])
    .filter((t) => matchesQuery(t, query))
    .map((t) => toQrCard(outlet, t));
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * @param {string} outletId - selected outlet id (from useOutlet)
 */
export function useQrCodes(outletId) {
  const { tables, isLoading, refresh } = useOfflineTables(outletId);
  const [query, setQuery] = useState('');

  const cards = useMemo(
    () => buildQrCards(outletId, tables, query),
    [outletId, tables, query]
  );

  // Total (unfiltered) count — drives the "no tables at all" vs "no matches" split.
  const totalCount = Array.isArray(tables) ? tables.length : 0;

  const buildUrl = useCallback((table) => buildOrderingUrl(outletId, table), [outletId]);

  return {
    cards,
    totalCount,
    query,
    setQuery,
    isLoading,
    refresh,
    buildOrderingUrl: buildUrl,
    hasOutlet: !!outletId,
    webOrderBase: WEB_ORDER_BASE,
  };
}
