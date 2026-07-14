/**
 * Aggregator Reconciliation — "Delivery payouts" review screen.
 *
 * Per delivery-platform reconciliation for the SELECTED outlet from
 * GET /aggregator-reconciliation/commission-report: gross sales, the commission
 * each aggregator takes, and the EXPECTED net payout. A summary header rolls up
 * total expected, total commission and net discrepancy; each platform row shows
 * gross / commission / net payout with a match / short-paid badge and a
 * "Reconcile → Settlement" action (POST /payout-to-settlement).
 *
 * Date-range + platform filters, skeleton + empty + error states, pull-to
 * -refresh. All money renders through useCurrency (outlet's own symbol AU $/IN ₹).
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, Alert, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import {
  useAggregatorRecon,
  RANGE_OPTIONS,
  PLATFORM_FILTERS,
  SORT_MODES,
  STATUS_META,
  reconcileStatus,
  platformMeta,
} from '../../src/hooks/useAggregatorRecon';

// ─── Tone → color resolver ─────────────────────────────────────────────────────
function toneColor(tone, colors) {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'error':
      return colors.error;
    case 'warning':
      return colors.warning;
    default:
      return colors.textMuted;
  }
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
function ReconSkeleton({ skeletonColor }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <SkeletonBox width="100%" height={120} borderRadius={18} color={skeletonColor} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SkeletonBox width="48%" height={70} borderRadius={16} color={skeletonColor} />
        <SkeletonBox width="48%" height={70} borderRadius={16} color={skeletonColor} />
      </View>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBox key={i} width="100%" height={120} borderRadius={16} color={skeletonColor} />
      ))}
    </View>
  );
}

// ─── Summary header ────────────────────────────────────────────────────────────
function SummaryHeader({ totals, fmt, fmtFull, colors, styles }) {
  const hasReceived = totals.reconciled_count > 0;
  const discPositive = totals.discrepancy >= 0;
  const discColor = !hasReceived
    ? colors.textMuted
    : Math.abs(totals.discrepancy) < 0.01
    ? colors.success
    : discPositive
    ? colors.warning
    : colors.error;

  return (
    <View style={{ gap: 12 }}>
      {/* Hero: expected net payout */}
      <View style={[styles.hero, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '33' }]}>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent + '22' }]}>
            <Ionicons name="wallet" size={18} color={colors.accent} />
          </View>
          <Text style={[styles.heroLabel, { color: colors.accent }]}>Expected net payout</Text>
        </View>
        <Text style={[styles.heroValue, { color: colors.text }]}>{fmtFull(totals.net_payout)}</Text>
        <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
          {fmtFull(totals.gross)} gross · {totals.order_count} order{totals.order_count === 1 ? '' : 's'} ·{' '}
          {totals.platform_count} platform{totals.platform_count === 1 ? '' : 's'}
        </Text>
      </View>

      {/* Two stat tiles: commission + discrepancy */}
      <View style={styles.statRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statHead}>
            <Ionicons name="cut" size={13} color={colors.warning} />
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Commission</Text>
          </View>
          <Text style={[styles.statValue, { color: colors.text }]}>{fmt(totals.commission_amount)}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statHead}>
            <Ionicons
              name={hasReceived ? 'git-compare' : 'time-outline'}
              size={13}
              color={discColor}
            />
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              {hasReceived ? 'Net discrepancy' : 'Received'}
            </Text>
          </View>
          <Text style={[styles.statValue, { color: discColor }]}>
            {hasReceived ? `${discPositive ? '+' : ''}${fmt(totals.discrepancy)}` : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Platform / payout row ─────────────────────────────────────────────────────
function PayoutRow({ row, fmt, fmtFull, colors, styles, onReconcile, reconciling }) {
  const st = reconcileStatus(row);
  const meta = STATUS_META[st.key] || STATUS_META.pending;
  const badgeColor = toneColor(meta.tone, colors);
  const pm = platformMeta(row.platform);
  const accent = pm.hue || colors.accent;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Head: platform + status badge */}
      <View style={styles.cardHead}>
        <View style={[styles.platIcon, { backgroundColor: accent + '1f' }]}>
          <Ionicons name={pm.icon} size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.platName, { color: colors.text }]} numberOfLines={1}>
            {row.platform_name}
          </Text>
          <Text style={[styles.platSub, { color: colors.textMuted }]}>
            {row.order_count} order{row.order_count === 1 ? '' : 's'} · {row.commission_pct}% fee
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeColor + '1f' }]}>
          <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
          <Text style={[styles.badgeText, { color: badgeColor }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Money breakdown */}
      <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
        <View style={styles.moneyCol}>
          <Text style={[styles.moneyLabel, { color: colors.textMuted }]}>Gross</Text>
          <Text style={[styles.moneyValue, { color: colors.text }]}>{fmtFull(row.gross)}</Text>
        </View>
        <View style={styles.moneyCol}>
          <Text style={[styles.moneyLabel, { color: colors.textMuted }]}>Commission</Text>
          <Text style={[styles.moneyValue, { color: colors.warning }]}>-{fmtFull(row.commission_amount)}</Text>
        </View>
        <View style={[styles.moneyCol, { alignItems: 'flex-end' }]}>
          <Text style={[styles.moneyLabel, { color: colors.textMuted }]}>Net payout</Text>
          <Text style={[styles.moneyValue, { color: colors.text, fontWeight: '800' }]}>{fmtFull(row.net_payout)}</Text>
        </View>
      </View>

      {/* Expected vs received (only when a received signal exists) */}
      {st.received != null ? (
        <View style={[styles.reconRow, { backgroundColor: badgeColor + '12' }]}>
          <Text style={[styles.reconText, { color: colors.textSecondary }]}>
            Expected {fmtFull(row.net_payout)} · Received {fmtFull(st.received)}
          </Text>
          <Text style={[styles.reconDelta, { color: badgeColor }]}>
            {st.discrepancy >= 0 ? '+' : ''}
            {fmtFull(st.discrepancy)}
          </Text>
        </View>
      ) : null}

      {/* Reconcile action */}
      <Pressable
        onPress={() => onReconcile(row)}
        disabled={reconciling}
        style={({ pressed }) => [
          styles.reconcileBtn,
          { borderColor: colors.accent, opacity: reconciling ? 0.6 : pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="documents-outline" size={15} color={colors.accent} />
        <Text style={[styles.reconcileText, { color: colors.accent }]}>
          {reconciling ? 'Creating settlement…' : 'Reconcile → Settlement'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Filter chip strip ─────────────────────────────────────────────────────────
function ChipStrip({ options, activeKey, onSelect, colors, styles }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipStrip}
    >
      {options.map((o) => {
        const active = o.key === activeKey;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onSelect(o.key)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.accent : colors.pillBg || colors.card,
                borderColor: active ? colors.accent : colors.border,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function AggregatorReconciliationScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { fmt, fmtFull } = useCurrency();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skeletonColor = colors.pillBg || colors.border;

  const [range, setRange] = useState('30d');
  const [platform, setPlatform] = useState(null);
  const [sortMode, setSortMode] = useState(SORT_MODES.PAYOUT);

  const {
    rows,
    totals,
    isLoading,
    isError,
    isRefetching,
    refetch,
    hasOutlet,
    reconcile,
    isReconciling,
    reconcilingPlatform,
  } = useAggregatorRecon({ range, platform, sortMode });

  const onRefresh = useCallback(() => refetch(), [refetch]);
  const outletName = currentOutlet?.name || 'Selected outlet';

  const onReconcile = useCallback(
    (row) => {
      Alert.alert(
        `Reconcile ${row.platform_name}?`,
        `Create a settlement from this platform's payout (${row.order_count} order${
          row.order_count === 1 ? '' : 's'
        }). You can then match it against recorded payments in Settlements.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create settlement',
            onPress: async () => {
              try {
                await reconcile({ platform: row.platform });
                Alert.alert('Settlement created', `${row.platform_name} payout is ready to reconcile.`);
              } catch (e) {
                Alert.alert(
                  'Could not reconcile',
                  e?.response?.data?.message || e?.message || 'Something went wrong creating the settlement.'
                );
              }
            },
          },
        ]
      );
    },
    [reconcile]
  );

  const ListHeader = (
    <View style={{ gap: 16, marginBottom: 12 }}>
      <SummaryHeader totals={totals} fmt={fmt} fmtFull={fmtFull} colors={colors} styles={styles} />

      {/* Sort toggle */}
      <View style={styles.listHeadRow}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          Platforms · {rows.length}
        </Text>
        <View style={[styles.toggle, { backgroundColor: colors.pillBg || colors.card, borderColor: colors.border }]}>
          {[
            { key: SORT_MODES.PAYOUT, label: 'Payout' },
            { key: SORT_MODES.GROSS, label: 'Gross' },
            { key: SORT_MODES.COMMISSION, label: 'Fee' },
          ].map((s) => {
            const active = sortMode === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSortMode(s.key)}
                style={[styles.toggleBtn, active && { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.toggleText, { color: active ? '#fff' : colors.textSecondary }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Delivery Payouts</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {outletName} · Aggregator reconciliation
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.accent + '18' }]}>
          <Ionicons name="swap-horizontal" size={13} color={colors.accent} />
          <Text style={[styles.pillText, { color: colors.accent }]}>RECON</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={[styles.filters, { borderBottomColor: colors.border }]}>
        <ChipStrip options={RANGE_OPTIONS} activeKey={range} onSelect={setRange} colors={colors} styles={styles} />
        <ChipStrip
          options={PLATFORM_FILTERS}
          activeKey={platform}
          onSelect={setPlatform}
          colors={colors}
          styles={styles}
        />
      </View>

      {/* Body */}
      {!hasOutlet ? (
        <EmptyState
          icon="🏬"
          title="No outlet selected"
          subtitle="Choose an outlet to review its delivery-platform payouts."
        />
      ) : isLoading ? (
        <ReconSkeleton skeletonColor={skeletonColor} />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load payouts"
          subtitle="Something went wrong fetching aggregator reconciliation. Pull to refresh or retry."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : rows.length === 0 ? (
        <FlashList
          data={[]}
          keyExtractor={() => 'x'}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="🛵"
              title="No aggregator payouts to reconcile"
              subtitle="Once this outlet takes Swiggy, Zomato, Uber Eats or other delivery orders in this period, their payouts and commission appear here."
            />
          }
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.platform}
          estimatedItemSize={180}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={ListHeader}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 12 }}>
              <PayoutRow
                row={item}
                fmt={fmt}
                fmtFull={fmtFull}
                colors={colors}
                styles={styles}
                onReconcile={onReconcile}
                reconciling={isReconciling && reconcilingPlatform === item.platform}
              />
            </View>
          )}
          ListFooterComponent={
            <Text style={[styles.footerNote, { color: colors.textMuted }]}>
              Net payout is the expected amount after each platform's commission. Reconcile a platform to bridge its
              payout into Settlements and match it against what actually landed.
            </Text>
          }
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const makeStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
    },
    title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
    subtitle: { fontSize: 13, marginTop: 2 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    pillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

    filters: { paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
    chipStrip: { paddingHorizontal: 16, gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '700' },

    // Summary
    hero: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 6 },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    heroLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    heroValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
    heroSub: { fontSize: 13, fontWeight: '500' },

    statRow: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
    statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    statValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },

    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    listHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3 },
    toggleBtn: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999 },
    toggleText: { fontSize: 13, fontWeight: '700' },

    // Payout card
    card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    platIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    platName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
    platSub: { fontSize: 12.5, marginTop: 1, fontWeight: '500' },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    badgeDot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },

    breakdown: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, paddingTop: 12 },
    moneyCol: { gap: 3 },
    moneyLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
    moneyValue: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },

    reconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
    },
    reconText: { fontSize: 12.5, fontWeight: '600', flex: 1 },
    reconDelta: { fontSize: 13.5, fontWeight: '800', letterSpacing: -0.3 },

    reconcileBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingVertical: 11,
    },
    reconcileText: { fontSize: 14, fontWeight: '700' },

    footerNote: { fontSize: 12, textAlign: 'center', paddingVertical: 18, paddingHorizontal: 20, lineHeight: 18 },
  });
