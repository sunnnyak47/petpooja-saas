/**
 * useDynamicPricing — data layer for the Dynamic Pricing screen (mobile).
 *
 * Surfaces the backend Dynamic Pricing Engine for the SELECTED outlet: every
 * pricing rule, the rules applying RIGHT NOW ("Live now"), and rule-performance
 * analytics. Also toggles a rule on/off. Every request is outlet-scoped — the
 * backend reads outlet_id from the query (GET) or body (POST) and an owner's
 * user.outlet_id is often null, so we ALWAYS pass outletId explicitly and put it
 * in every react-query key.
 *
 * Endpoints (backend/src/modules/pricing/pricing.routes.js):
 *   GET  /pricing/rules?outlet_id=      → data: PricingRule[]
 *   GET  /pricing/live?outlet_id=        → data: { active_rules[], price_map, context, ... }
 *   GET  /pricing/analytics?outlet_id=   → data: { total_applications, total_saving, by_rule[] }
 *   POST /pricing/rules/:id/toggle { outlet_id } → data: <updated rule> (toggleRuleSchema requires outlet_id)
 *
 * Pure transforms/extractors live in src/lib/dynamic-pricing.js (unit-tested).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';
import {
  extractRules,
  extractLiveRules,
  extractAnalytics,
  liveRuleIdSet,
  liveContextLabel,
  liveAffectedCount,
  summarizeRules,
} from '../lib/dynamic-pricing';

const PRICING_KEYS = {
  rules: (outletId) => ['pricing-rules', outletId],
  live: (outletId) => ['pricing-live', outletId],
  analytics: (outletId) => ['pricing-analytics', outletId],
};

export function useDynamicPricing() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: PRICING_KEYS.rules(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: () => api.get('/pricing/rules', { params: { outlet_id: outletId } }),
  });

  const liveQuery = useQuery({
    queryKey: PRICING_KEYS.live(outletId),
    enabled: !!outletId,
    staleTime: 15_000,
    refetchInterval: 60_000, // engine recomputes on the minute; keep "Live now" fresh
    queryFn: () => api.get('/pricing/live', { params: { outlet_id: outletId } }),
  });

  const analyticsQuery = useQuery({
    queryKey: PRICING_KEYS.analytics(outletId),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: () => api.get('/pricing/analytics', { params: { outlet_id: outletId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: PRICING_KEYS.rules(outletId) });
    qc.invalidateQueries({ queryKey: PRICING_KEYS.live(outletId) });
    qc.invalidateQueries({ queryKey: PRICING_KEYS.analytics(outletId) });
  };

  const toggleMut = useMutation({
    // toggleRuleSchema requires outlet_id in the BODY.
    mutationFn: (ruleId) => api.post(`/pricing/rules/${ruleId}/toggle`, { outlet_id: outletId }),
    onSuccess: invalidate,
  });

  const rules = extractRules(rulesQuery.data);

  return {
    outletId,
    hasOutlet: !!outletId,

    rules,
    stats: summarizeRules(rules),

    liveRules: extractLiveRules(liveQuery.data),
    liveIds: liveRuleIdSet(liveQuery.data),
    liveContext: liveContextLabel(liveQuery.data),
    affectedCount: liveAffectedCount(liveQuery.data),

    analytics: extractAnalytics(analyticsQuery.data),

    isLoading: rulesQuery.isLoading,
    isError: rulesQuery.isError,
    isRefetching: rulesQuery.isRefetching || liveQuery.isRefetching || analyticsQuery.isRefetching,
    refetch: () => { rulesQuery.refetch(); liveQuery.refetch(); analyticsQuery.refetch(); },

    toggleRule: (ruleId) => toggleMut.mutateAsync(ruleId),
    isToggling: toggleMut.isPending,
    togglingId: toggleMut.isPending ? toggleMut.variables : null,
  };
}
