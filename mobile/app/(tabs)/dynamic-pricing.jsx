/**
 * Dynamic Pricing — "Smart price rules".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * The Dynamic Pricing Engine for the SELECTED outlet: browse every pricing rule
 * (name, condition, adjustment %/amount, active) and flip one on/off with a
 * Switch, plus a "Live now" section listing the rules the engine is applying at
 * this very moment and a small savings summary. Data + pure transforms live in
 * src/hooks/useDynamicPricing.js + src/lib/dynamic-pricing.js; every request is
 * outlet-scoped. Toggling needs pricing-manage rights — a 403 is surfaced kindly.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import { useDynamicPricing } from '../../src/hooks/useDynamicPricing';
import {
  ruleId,
  ruleName,
  isRuleActive,
  actionKind,
  adjustmentLabel,
  adjustmentColor,
  triggerLabel,
  triggerIconName,
  conditionSummary,
  filterRules,
} from '../../src/lib/dynamic-pricing';

function apiErrorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.message;
  if (err?.response?.status === 403 || /permission|forbidden/i.test(String(msg))) {
    return "You don't have permission to change pricing rules. Ask an owner or manager.";
  }
  return msg || fallback;
}

// ─── Live-now rule chip ───────────────────────────────────────────────────────
function LiveRuleRow({ rule, colors, s, fmt }) {
  const tone = adjustmentColor(rule, colors);
  return (
    <View style={s.liveRow}>
      <Ionicons name={triggerIconName(rule.trigger_type)} size={16} color={tone} />
      <Text style={s.liveName} numberOfLines={1}>{ruleName(rule)}</Text>
      <View style={[s.adjPill, { backgroundColor: tone + '1e' }]}>
        <Text style={[s.adjPillText, { color: tone }]}>{adjustmentLabel(rule, fmt)}</Text>
      </View>
    </View>
  );
}

// ─── One rule card ────────────────────────────────────────────────────────────
function RuleCard({ rule, colors, s, fmt, live, busy, onToggle }) {
  const active = isRuleActive(rule);
  const tone = adjustmentColor(rule, colors);
  const kind = actionKind(rule);
  const kindLabel = kind === 'surcharge' ? 'Surcharge' : kind === 'fixed' ? 'Fixed price' : kind === 'discount' ? 'Discount' : 'Adjustment';

  return (
    <Animated.View entering={FadeInDown.duration(220)}>
      <View style={[s.card, !active && s.cardMuted]}>
        <View style={s.cardTop}>
          <View style={[s.iconWrap, { backgroundColor: tone + '18' }]}>
            <Ionicons name={triggerIconName(rule.trigger_type)} size={18} color={tone} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.nameRow}>
              <Text style={s.ruleName} numberOfLines={1}>{ruleName(rule)}</Text>
              {live ? (
                <View style={s.liveDotWrap}>
                  <View style={s.liveDot} />
                  <Text style={s.liveDotText}>LIVE</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.trigger} numberOfLines={1}>{triggerLabel(rule.trigger_type)}</Text>
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={colors.accent} style={s.switchBox} />
          ) : (
            <Switch
              value={active}
              onValueChange={() => onToggle(rule)}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#ffffff"
              ios_backgroundColor={colors.border}
              style={s.switchBox}
            />
          )}
        </View>

        {rule.description ? <Text style={s.desc} numberOfLines={2}>{rule.description}</Text> : null}

        <View style={s.metaRow}>
          <View style={s.conditionBox}>
            <Ionicons name="options-outline" size={13} color={colors.textMuted} />
            <Text style={s.condition} numberOfLines={2}>{conditionSummary(rule)}</Text>
          </View>
          <View style={[s.adjPill, { backgroundColor: tone + '1e' }]}>
            <Text style={[s.adjKind, { color: tone }]}>{kindLabel}</Text>
            <Text style={[s.adjPillText, { color: tone }]}>{adjustmentLabel(rule, fmt)}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DynamicPricingScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU, fmt } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    rules, stats, liveRules, liveIds, liveContext, affectedCount,
    analytics, isLoading, isError, isRefetching, refetch,
    toggleRule, togglingId, hasOutlet,
  } = useDynamicPricing();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = useMemo(() => filterRules(rules, { q: query, status }), [rules, query, status]);

  const onToggle = useCallback(async (rule) => {
    const id = ruleId(rule);
    try {
      await toggleRule(id);
    } catch (err) {
      Alert.alert('Could not update rule', apiErrorMessage(err, 'Please try again.'));
    }
  }, [toggleRule]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      {/* Summary */}
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={s.summaryValue}>{stats.total}</Text>
          <Text style={s.summaryLabel}>Rules</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.accent }]}>{stats.active}</Text>
          <Text style={s.summaryLabel}>Active</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.success }]}>{liveRules.length}</Text>
          <Text style={s.summaryLabel}>Live now</Text>
        </View>
      </View>

      {/* Live now */}
      <View style={s.liveCard}>
        <View style={s.liveHead}>
          <View style={s.liveHeadLeft}>
            <View style={s.livePulse} />
            <Text style={s.liveTitle}>Live now</Text>
          </View>
          {liveContext ? <Text style={s.liveContext} numberOfLines={1}>{liveContext}</Text> : null}
        </View>
        {liveRules.length === 0 ? (
          <Text style={s.liveEmpty}>No rules are being applied right now.</Text>
        ) : (
          <View style={s.liveList}>
            {liveRules.map((r, i) => (
              <LiveRuleRow key={ruleId(r) || String(i)} rule={r} colors={colors} s={s} fmt={fmt} />
            ))}
            {affectedCount > 0 ? (
              <Text style={s.liveFoot}>{affectedCount} menu item{affectedCount === 1 ? '' : 's'} re-priced</Text>
            ) : null}
          </View>
        )}
      </View>

      {/* Analytics strip */}
      {analytics.total_applications > 0 ? (
        <View style={s.analyticsCard}>
          <Ionicons name="stats-chart-outline" size={16} color={colors.accent} />
          <Text style={s.analyticsText}>
            {analytics.total_applications} application{analytics.total_applications === 1 ? '' : 's'} · {fmt(Math.abs(analytics.total_saving))} {analytics.total_saving < 0 ? 'added' : 'saved'}
          </Text>
        </View>
      ) : null}

      {/* Filters */}
      <View style={s.filterRow}>
        {['all', 'active', 'inactive'].map((k) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, status === k && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => setStatus(k)}
            activeOpacity={0.85}
          >
            <Text style={[s.filterChipText, status === k && { color: '#fff' }]}>
              {k === 'all' ? 'All' : k === 'active' ? 'Active' : 'Inactive'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionLabel}>All rules</Text>
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Dynamic Pricing</Text>
            <Text style={s.subtitle} numberOfLines={1}>Smart price rules · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="pricetags-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{stats.total}</Text>
          </View>
        </View>

        {hasOutlet ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search rules…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its pricing rules." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load pricing rules" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {ListHeader}
          {filtered.length === 0 ? (
            rules.length === 0 ? (
              <EmptyState icon="🏷️" title="No pricing rules yet" subtitle="Create rules on the dashboard and they'll appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No rules match your search or filter." />
            )
          ) : (
            filtered.map((rule) => (
              <View key={ruleId(rule)} style={{ marginBottom: 10 }}>
                <RuleCard
                  rule={rule}
                  colors={colors}
                  s={s}
                  fmt={fmt}
                  live={liveIds.has(ruleId(rule))}
                  busy={togglingId === ruleId(rule)}
                  onToggle={onToggle}
                />
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 2 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, height: 42, borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    searchInput: { flex: 1, fontSize: 14, color: c.text, padding: 0, fontWeight: '500' },

    // Summary
    summaryCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16 },
    summaryStat: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    // Live now
    liveCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginTop: 12 },
    liveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
    liveHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
    liveTitle: { fontSize: 14, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    liveContext: { fontSize: 12, color: c.textMuted, fontWeight: '600', flexShrink: 1 },
    liveEmpty: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
    liveList: { gap: 8 },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    liveName: { flex: 1, fontSize: 13.5, color: c.text, fontWeight: '600', minWidth: 0 },
    liveFoot: { fontSize: 11.5, color: c.textMuted, fontWeight: '600', marginTop: 2 },

    // Analytics
    analyticsCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
    analyticsText: { flex: 1, fontSize: 12.5, color: c.textSecondary, fontWeight: '600' },

    // Filters
    filterRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    sectionLabel: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 4 },

    // Rule card
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardMuted: { opacity: 0.72 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    iconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    ruleName: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    trigger: { fontSize: 12, color: c.textMuted, marginTop: 2, fontWeight: '600' },
    switchBox: { marginLeft: 'auto', transform: [{ scaleX: 0.92 }, { scaleY: 0.92 }] },

    liveDotWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: c.success + '22' },
    liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.success },
    liveDotText: { fontSize: 9, fontWeight: '900', color: c.success, letterSpacing: 0.4 },

    desc: { fontSize: 13, color: c.textSecondary, marginTop: 10, lineHeight: 18 },

    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
    conditionBox: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 5, minWidth: 0 },
    condition: { flex: 1, fontSize: 12.5, color: c.textSecondary, fontWeight: '600', lineHeight: 17 },

    adjPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    adjKind: { fontSize: 11, fontWeight: '700', opacity: 0.9 },
    adjPillText: { fontSize: 13.5, fontWeight: '800', letterSpacing: -0.2 },
  });
}
