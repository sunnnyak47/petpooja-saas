/**
 * @fileoverview Canonical menu-items query hook.
 *
 * The endpoint `/menu/items?outlet_id=…&limit=5000` was previously fetched under
 * three different query keys (POSPage, MenuPage, RunningOrders' AddKOTModal) →
 * 3× cache, 3× network, zero reuse. This hook is the single source of truth for
 * that fetch so callers share one cache entry under `qk.menuItems(outletId)`.
 *
 * Behavior is matched to POSPage's original inline query EXACTLY:
 *   queryKey:  ['menuItems', outletId]            (via qk.menuItems)
 *   queryFn:   api.get(`/menu/items?outlet_id=${outletId}&limit=5000`).then(r => r.data)
 *   enabled:   !!outletId
 *   staleTime: 60_000
 *
 * `api` (src/lib/api.js) has a response interceptor that already returns
 * `response.data` (the parsed body). So `api.get(...)` resolves to the body and
 * `.then(r => r.data)` extracts the body's `data` field — i.e. this hook returns
 * exactly what POSPage's `cloudMenuData` held. Downstream code that does
 * `data?.items || data?.data || data || []` keeps working unchanged.
 *
 * Options let individual call sites preserve their own semantics (e.g. MenuPage
 * is enabled on Electron too; RunningOrders uses a different staleTime) without
 * forking the key or queryFn.
 *
 * @param {string} outletId
 * @param {object} [options]
 * @param {boolean} [options.enabled]  Extra gate ANDed with `!!outletId`.
 * @param {number}  [options.staleTime] Defaults to 60_000 (POSPage's value).
 * @param {function} [options.queryFn]  Override the fetcher (e.g. offline branch).
 * @param {Array}   [options.queryKey]  Override the key (advanced; prefer default).
 * @param {object}  [rest]              Any other useQuery option is passed through.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { qk } from '../../lib/queryKeys';

export function useMenuItems(outletId, options = {}) {
  const {
    enabled = true,
    staleTime = 60_000,
    queryFn,
    queryKey,
    ...rest
  } = options;

  return useQuery({
    queryKey: queryKey ?? qk.menuItems(outletId),
    queryFn:
      queryFn ??
      (() => api.get(`/menu/items?outlet_id=${outletId}&limit=5000`).then((r) => r.data)),
    enabled: !!outletId && enabled,
    staleTime,
    ...rest,
  });
}

export default useMenuItems;
