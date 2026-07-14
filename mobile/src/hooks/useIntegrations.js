/**
 * useIntegrations — data layer for the Integrations Hub ("Connect & sync").
 *
 * Surfaces the outlet's third-party connections, grouped by type:
 *   • Delivery aggregators — Swiggy/Zomato (IN), Uber Eats/DoorDash/Menulog (AU)
 *       GET  /aggregators/platforms            → platform definitions
 *       GET  /aggregators/config?outlet_id=    → per-platform connection state
 *       POST /aggregators/menu/push/:platform  → push menu to one platform
 *       POST /aggregators/menu/push-all        → push menu to all enabled
 *   • Accounting — Xero (AU, live status), MYOB (AU), Tally (IN)
 *       GET  /integrations/accounting/xero/status
 *       GET  /integrations/accounting/tally/mappings
 *
 * Region awareness follows the SELECTED OUTLET (useCurrency().isAU), not the
 * user — an owner's user row often has no single outlet. Every fetch is scoped
 * to the selected outlet via outletId.
 *
 * All formatting/branching math lives in the pure helpers below (unit-tested);
 * the screen only renders what these return.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

// ─── Query keys ───────────────────────────────────────────────────────────────
export const INTEG_KEYS = {
  platforms: ['integrations', 'aggregator-platforms'],
  configs: (outletId) => ['integrations', 'aggregator-config', outletId || 'none'],
  xero: (outletId) => ['integrations', 'xero-status', outletId || 'none'],
  tally: (outletId) => ['integrations', 'tally-mappings', outletId || 'none'],
};

export const INTEGRATION_TYPES = { AGGREGATOR: 'aggregator', ACCOUNTING: 'accounting' };

// Fallback platform definitions if the backend list is momentarily empty. Keeps
// the region grouping meaningful even before /platforms resolves.
export const FALLBACK_PLATFORMS = [
  { id: 'swiggy', name: 'Swiggy', region: 'IN', color: '#FC8019', commission: 0.18 },
  { id: 'zomato', name: 'Zomato', region: 'IN', color: '#E23744', commission: 0.15 },
  { id: 'ubereats', name: 'Uber Eats', region: 'AU', color: '#06C167', commission: 0.3 },
  { id: 'doordash', name: 'DoorDash AU', region: 'AU', color: '#FF3008', commission: 0.2 },
  { id: 'menulog', name: 'Menulog AU', region: 'AU', color: '#E8172B', commission: 0.14 },
];

// Ionicons name per platform id (best-effort branding).
const PLATFORM_ICON = {
  swiggy: 'fast-food',
  zomato: 'restaurant',
  ubereats: 'car',
  doordash: 'bicycle',
  menulog: 'pizza',
};

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

const str = (v) => (v == null ? null : String(v));

/**
 * Normalize a raw platform definition from GET /aggregators/platforms.
 * @param {object} raw { id, name, region, color, commission }
 */
export function normalizePlatform(raw = {}) {
  const id = str(raw.id) || str(raw.platform) || 'platform';
  return {
    id,
    name: raw.name || id,
    region: (raw.region || 'IN').toUpperCase(),
    color: raw.color || '#64748b',
    commission: Number.isFinite(Number(raw.commission)) ? Number(raw.commission) : null,
    icon: PLATFORM_ICON[id] || 'storefront',
  };
}

/**
 * Merge a platform definition with its stored config into a display card.
 * Connection semantics (from aggregator.service):
 *   • connected  = config.enabled === true (toggle is on)
 *   • configured = a store_id or api_key has been saved
 * @param {object} platform normalized platform def
 * @param {object} [config] per-platform config row
 */
export function buildAggregatorCard(platform, config = {}) {
  const enabled = config?.enabled === true || config?.enabled === 'true';
  const storeId = str(config?.store_id);
  const configured = !!(storeId || config?.api_key);
  const lastSync = str(config?.last_menu_push);
  const lastPull = str(config?.last_order_pull);
  return {
    ...platform,
    type: INTEGRATION_TYPES.AGGREGATOR,
    connected: enabled,
    configured,
    enabled,
    storeId,
    lastSync,
    lastPull,
    // Menu push only makes sense once the channel is actually enabled.
    canSync: enabled,
  };
}

/**
 * Build the full aggregator card list from platform defs + the config map,
 * filtered to the outlet's region (AU vs IN). Connected channels sort first,
 * then configured, then by name.
 * @param {Array} platforms normalized platform defs
 * @param {object} configs  { [platformId]: config }
 * @param {boolean} isAU
 */
export function buildAggregatorCards(platforms = [], configs = {}, isAU = false) {
  const region = isAU ? 'AU' : 'IN';
  return platforms
    .filter((p) => p.region === region)
    .map((p) => buildAggregatorCard(p, configs?.[p.id] || {}))
    .sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Build the region-appropriate accounting cards. Xero (AU) carries a live
 * connection status; MYOB (AU) and Tally (IN) are web-configured (no mobile
 * OAuth) so they surface as "available" with a connect-on-web action.
 * @param {boolean} isAU
 * @param {object} [live] { xero, tallyConfigured }
 */
export function buildAccountingCards(isAU, live = {}) {
  const cards = [];
  if (isAU) {
    const xero = live.xero || {};
    cards.push({
      id: 'xero',
      name: 'Xero',
      type: INTEGRATION_TYPES.ACCOUNTING,
      region: 'AU',
      color: '#13B5EA',
      icon: 'calculator',
      connected: xero.connected === true,
      configured: xero.connected === true,
      orgName: xero.org_name || null,
      lastSync: str(xero.last_sync),
      invoicesExported: Number(xero.invoices_exported) || 0,
      statusMessage: xero.message || null,
      webConfigured: false, // supports in-app OAuth launch
      canSync: xero.connected === true,
    });
    cards.push({
      id: 'myob',
      name: 'MYOB',
      type: INTEGRATION_TYPES.ACCOUNTING,
      region: 'AU',
      color: '#6100A5',
      icon: 'business',
      connected: false,
      configured: false,
      lastSync: null,
      webConfigured: true,
      canSync: false,
    });
  } else {
    cards.push({
      id: 'tally',
      name: 'Tally',
      type: INTEGRATION_TYPES.ACCOUNTING,
      region: 'IN',
      color: '#0A56A3',
      icon: 'document-text',
      connected: !!live.tallyConfigured,
      configured: !!live.tallyConfigured,
      lastSync: null,
      webConfigured: true,
      canSync: false,
    });
  }
  return cards;
}

/**
 * Group cards into the sections the screen renders.
 * @param {Array} aggregators
 * @param {Array} accounting
 */
export function groupIntegrations(aggregators = [], accounting = []) {
  return [
    {
      key: INTEGRATION_TYPES.AGGREGATOR,
      title: 'Delivery aggregators',
      subtitle: 'Push your menu and receive online orders',
      icon: 'bicycle-outline',
      data: aggregators,
    },
    {
      key: INTEGRATION_TYPES.ACCOUNTING,
      title: 'Accounting',
      subtitle: 'Sync sales, tax and invoices to your books',
      icon: 'calculator-outline',
      data: accounting,
    },
  ].filter((s) => s.data.length > 0);
}

/**
 * Roll-up counts for the header.
 * @param {Array} aggregators
 * @param {Array} accounting
 */
export function computeSummary(aggregators = [], accounting = []) {
  const all = [...aggregators, ...accounting];
  const connected = all.filter((c) => c.connected).length;
  const syncable = aggregators.filter((c) => c.canSync).length;
  return {
    total: all.length,
    connected,
    notConnected: all.length - connected,
    aggregatorsConnected: aggregators.filter((c) => c.connected).length,
    syncable,
  };
}

/**
 * Relative "time ago" for a last-sync timestamp. Pure — takes an explicit `now`
 * so it's deterministic under test. Returns null for empty/invalid input.
 * @param {string|number|Date} value
 * @param {number} [now] epoch ms
 */
export function formatRelativeTime(value, now = Date.now()) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = now - t;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/**
 * Summarise a push-all response into a human sentence + counts. The endpoint
 * returns an array of per-platform results ({ platform, success/status, ... }).
 * @param {any} res raw mutation response (may be {data:[...]}, [...], etc.)
 */
export function summarizePushResult(res) {
  const arr = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
  if (!arr.length) {
    return { total: 0, ok: 0, failed: 0, message: 'No enabled channels to push to yet.' };
  }
  const ok = arr.filter((r) => r?.success !== false && r?.status !== 'failed' && r?.error == null).length;
  const failed = arr.length - ok;
  const message =
    failed === 0
      ? `Menu pushed to ${ok} channel${ok === 1 ? '' : 's'}.`
      : `Pushed to ${ok} of ${arr.length} channels — ${failed} failed.`;
  return { total: arr.length, ok, failed, message };
}

// ─── React-query hooks ──────────────────────────────────────────────────────

/** Platform definitions (region-agnostic; filtered client-side). */
export function useAggregatorPlatforms() {
  return useQuery({
    queryKey: INTEG_KEYS.platforms,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const res = await api.get('/aggregators/platforms');
      const list = res?.data ?? res;
      return Array.isArray(list) ? list.map(normalizePlatform) : [];
    },
  });
}

/** Per-platform connection config for the selected outlet. */
export function useAggregatorConfigs(outletId) {
  return useQuery({
    queryKey: INTEG_KEYS.configs(outletId),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/aggregators/config', { params: { outlet_id: outletId } });
      return res?.data ?? res ?? {};
    },
  });
}

/** Live Xero connection status (AU only). */
export function useXeroStatus(outletId, enabled) {
  return useQuery({
    queryKey: INTEG_KEYS.xero(outletId),
    enabled: !!enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const res = await api.get('/integrations/accounting/xero/status');
      return res?.data ?? res ?? { connected: false };
    },
  });
}

/** Tally mapping presence (IN only) — configured if any mappings exist. */
export function useTallyStatus(outletId, enabled) {
  return useQuery({
    queryKey: INTEG_KEYS.tally(outletId),
    enabled: !!enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const res = await api.get('/integrations/accounting/tally/mappings');
      const data = res?.data ?? res;
      const count = Array.isArray(data) ? data.length : Array.isArray(data?.mappings) ? data.mappings.length : 0;
      return { configured: count > 0, count };
    },
  });
}

/** Push menu to a single platform, or all enabled platforms when no id given. */
export function usePushMenu(outletId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (platformId) => {
      const url = platformId ? `/aggregators/menu/push/${platformId}` : '/aggregators/menu/push-all';
      return api.post(url, { outlet_id: outletId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INTEG_KEYS.configs(outletId) });
    },
  });
}

/** Fetch the Xero OAuth URL (to open in the browser) — used for connect. */
export function useXeroConnectUrl() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get('/integrations/accounting/xero/auth-url');
      const data = res?.data ?? res;
      return data?.url || null;
    },
  });
}

/**
 * Composite hook the screen consumes. Wires the queries above, applies region
 * filtering off the selected outlet, and exposes grouped sections + summary.
 * @param {{isAU:boolean}} opts
 */
export function useIntegrations({ isAU = false } = {}) {
  const { outletId } = useOutlet();

  const platformsQ = useAggregatorPlatforms();
  const configsQ = useAggregatorConfigs(outletId);
  const xeroQ = useXeroStatus(outletId, isAU);
  const tallyQ = useTallyStatus(outletId, !isAU);

  const platforms = useMemo(() => {
    const list = platformsQ.data && platformsQ.data.length ? platformsQ.data : FALLBACK_PLATFORMS.map(normalizePlatform);
    return list;
  }, [platformsQ.data]);

  const aggregators = useMemo(
    () => buildAggregatorCards(platforms, configsQ.data || {}, isAU),
    [platforms, configsQ.data, isAU],
  );

  const accounting = useMemo(
    () => buildAccountingCards(isAU, { xero: xeroQ.data, tallyConfigured: tallyQ.data?.configured }),
    [isAU, xeroQ.data, tallyQ.data],
  );

  const sections = useMemo(() => groupIntegrations(aggregators, accounting), [aggregators, accounting]);
  const summary = useMemo(() => computeSummary(aggregators, accounting), [aggregators, accounting]);

  const pushMenu = usePushMenu(outletId);

  const isLoading = platformsQ.isLoading || configsQ.isLoading || (isAU && xeroQ.isLoading);
  const isRefetching =
    platformsQ.isRefetching || configsQ.isRefetching || xeroQ.isRefetching || tallyQ.isRefetching;
  // Config is the load-bearing fetch; platform defs have a fallback so their
  // failure alone shouldn't blank the screen.
  const isError = configsQ.isError;

  const refetch = useCallback(() => {
    platformsQ.refetch();
    configsQ.refetch();
    if (isAU) xeroQ.refetch();
    else tallyQ.refetch();
  }, [platformsQ, configsQ, xeroQ, tallyQ, isAU]);

  return {
    sections,
    aggregators,
    accounting,
    summary,
    pushMenu,
    isLoading,
    isRefetching,
    isError,
    refetch,
    hasOutlet: !!outletId,
  };
}
