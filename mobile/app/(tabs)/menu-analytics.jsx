/**
 * Menu Analytics — owner "Item performance" screen.
 *
 * ABC menu performance for the SELECTED outlet (last 30 days) from
 * GET /ho/menu-analytics, with a reports/summary fallback. Shows a KPI header
 * (items tracked, top-revenue item, avg item revenue), best-seller +
 * underperformer callouts, a category revenue breakdown, and a ranked item list
 * with a Revenue/Qty toggle. Each row carries an ABC class badge and a revenue
 * -share bar. Skeleton + empty + error states, pull-to-refresh.
 *
 * All money renders through useCurrency (outlet's own symbol — AU $ / IN ₹).
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useMenuAnalytics, revenueShare, SORT_MODES } from '../../src/hooks/useMenuAnalytics';

// ─── ABC badge meta ───────────────────────────────────────────────────────────
function abcMeta(abc, colors) {
  switch (abc) {
    case 'A':
      return { color: colors.success, label: 'A', hint: 'Top seller' };
    case 'B':
      return { color: colors.accent, label: 'B', hint: 'Steady' };
    case 'C':
      return { color: colors.textMuted, label: 'C', hint: 'Slow mover' };
    default:
      return { color: colors.textMuted, label: '–', hint: '' };
  }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function AnalyticsSkeleton({ skeletonColor }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SkeletonBox width="31%" height={82} borderRadius={16} color={skeletonColor} />
        <SkeletonBox width="31%" height={82} borderRadius={16} color={skeletonColor} />
        <SkeletonBox width="31%" height={82} borderRadius={16} color={skeletonColor} />
      </View>
      <SkeletonBox width="100%" height={96} borderRadius={16} color={skeletonColor} />
      <SkeletonBox width="100%" height={96} borderRadius={16} color={skeletonColor} />
      {[0, 1, 2, 3, 4].map((i) => (
        <SkeletonBox key={i} width="100%" height={72} borderRadius={14} color={skeletonColor} />
      ))}
    </View>
  );
}

// ─── KPI header ──────────────────────────────────────────────────────────────
function KpiHeader({ kpis, fmt, colors, styles }) {
  const top = kpis.topRevenueItem;
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.kpiValue, { color: colors.text }]}>{kpis.itemCount}</Text>
          <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Items tracked</Text>
        </View>
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.kpiValue, { color: colors.text }]}>{fmt(kpis.totalRevenue)}</Text>
          <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Total revenue</Text>
        </View>
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.kpiValue, { color: colors.text }]}>{fmt(kpis.avgItemRevenue)}</Text>
          <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Avg / item</Text>
        </View>
      </View>

      {top ? (
        <View style={[styles.topRevCard, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '33' }]}>
          <View style={[styles.topRevIcon, { backgroundColor: colors.accent + '22' }]}>
            <Ionicons name="ribbon" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.topRevLabel, { color: colors.accent }]}>Top revenue item</Text>
            <Text style={[styles.topRevName, { color: colors.text }]} numberOfLines={1}>
              {top.name}
            </Text>
          </View>
          <Text style={[styles.topRevMoney, { color: colors.text }]}>{fmt(top.revenue)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Best / underperformer callouts ──────────────────────────────────────────
function Callouts({ best, under, fmt, colors, styles }) {
  if (!best) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.calloutCard, { backgroundColor: colors.card, borderColor: colors.success }]}>
        <View style={styles.calloutHead}>
          <Ionicons name="flame" size={15} color={colors.success} />
          <Text style={[styles.calloutTag, { color: colors.success }]}>Best seller</Text>
        </View>
        <Text style={[styles.calloutName, { color: colors.text }]} numberOfLines={1}>
          {best.name}
        </Text>
        <Text style={[styles.calloutMeta, { color: colors.textMuted }]}>
          {best.qty} sold · {fmt(best.revenue)} · {best.category}
        </Text>
      </View>

      {under ? (
        <View style={[styles.calloutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calloutHead}>
            <Ionicons name="trending-down" size={15} color={colors.warning} />
            <Text style={[styles.calloutTag, { color: colors.warning }]}>Underperformer</Text>
          </View>
          <Text style={[styles.calloutName, { color: colors.text }]} numberOfLines={1}>
            {under.name}
          </Text>
          <Text style={[styles.calloutMeta, { color: colors.textMuted }]}>
            {under.qty} sold · {fmt(under.revenue)} · {under.category}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Category breakdown ──────────────────────────────────────────────────────
function CategoryBreakdown({ categories, fmt, colors, styles }) {
  if (!categories.length) return null;
  const shown = categories.slice(0, 6);
  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Category breakdown</Text>
      <View style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {shown.map((c, i) => (
          <View
            key={c.category}
            style={[styles.catRow, i < shown.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
          >
            <View style={styles.catTop}>
              <Text style={[styles.catName, { color: colors.text }]} numberOfLines={1}>
                {c.category}
              </Text>
              <Text style={[styles.catMoney, { color: colors.text }]}>{fmt(c.revenue)}</Text>
            </View>
            <View style={[styles.catBarTrack, { backgroundColor: colors.border }]}>
              <View
                style={[styles.catBarFill, { backgroundColor: colors.accent, width: `${Math.round(c.share * 100)}%` }]}
              />
            </View>
            <Text style={[styles.catSub, { color: colors.textMuted }]}>
              {c.itemCount} item{c.itemCount === 1 ? '' : 's'} · {c.qty} sold · {Math.round(c.share * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Item row ────────────────────────────────────────────────────────────────
function ItemRow({ item, rank, totalRevenue, fmt, colors, styles }) {
  const meta = abcMeta(item.abc, colors);
  const share = revenueShare(item.revenue, totalRevenue);
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.itemTop}>
        <Text style={[styles.itemRank, { color: colors.textMuted }]}>{rank}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.itemCat, { color: colors.textMuted }]} numberOfLines={1}>
            {item.category} · {item.qty} sold
          </Text>
        </View>
        <View style={styles.itemRight}>
          <Text style={[styles.itemMoney, { color: colors.text }]}>{fmt(item.revenue)}</Text>
          <View style={[styles.abcBadge, { backgroundColor: meta.color + '1f' }]}>
            <Text style={[styles.abcText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.shareTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.shareFill, { backgroundColor: meta.color, width: `${Math.max(3, Math.round(share * 100))}%` }]} />
      </View>
    </Animated.View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function MenuAnalyticsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { fmt } = useCurrency();
  const [sortMode, setSortMode] = useState(SORT_MODES.REVENUE);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skeletonColor = colors.pillBg || colors.border;

  const {
    items,
    kpis,
    categories,
    bestSeller,
    underperformer,
    periodDays,
    usingFallback,
    isLoading,
    isError,
    isRefetching,
    refetch,
    hasOutlet,
  } = useMenuAnalytics({ sortMode });

  const onRefresh = useCallback(() => refetch(), [refetch]);
  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <View style={{ gap: 16, marginBottom: 12 }}>
      <KpiHeader kpis={kpis} fmt={fmt} colors={colors} styles={styles} />
      <Callouts best={bestSeller} under={underperformer} fmt={fmt} colors={colors} styles={styles} />
      <CategoryBreakdown categories={categories} fmt={fmt} colors={colors} styles={styles} />

      {/* Ranked list header + sort toggle */}
      <View style={styles.listHeadRow}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          Items · {items.length}
        </Text>
        <View style={[styles.toggle, { backgroundColor: colors.pillBg || colors.card, borderColor: colors.border }]}>
          {[
            { key: SORT_MODES.REVENUE, label: 'Revenue' },
            { key: SORT_MODES.QTY, label: 'Qty' },
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
          <Text style={[styles.title, { color: colors.text }]}>Menu Analytics</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {outletName} · Last {periodDays} days
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.accent + '18' }]}>
          <Ionicons name="stats-chart" size={13} color={colors.accent} />
          <Text style={[styles.pillText, { color: colors.accent }]}>ABC</Text>
        </View>
      </View>

      {/* Body */}
      {!hasOutlet ? (
        <EmptyState
          icon="🏬"
          title="No outlet selected"
          subtitle="Choose an outlet to see its item performance."
        />
      ) : isLoading ? (
        <AnalyticsSkeleton skeletonColor={skeletonColor} />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load analytics"
          subtitle="Something went wrong fetching item performance. Pull to refresh or retry."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : items.length === 0 ? (
        <FlashList
          data={[]}
          keyExtractor={() => 'x'}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="🍽️"
              title="No sales data yet"
              subtitle="Once this outlet records paid orders, item performance and ABC ranking will appear here."
            />
          }
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          estimatedItemSize={84}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={ListHeader}
          renderItem={({ item, index }) => (
            <View style={{ marginBottom: 10 }}>
              <ItemRow
                item={item}
                rank={index + 1}
                totalRevenue={kpis.totalRevenue}
                fmt={fmt}
                colors={colors}
                styles={styles}
              />
            </View>
          )}
          ListFooterComponent={
            usingFallback ? (
              <Text style={[styles.footerNote, { color: colors.textMuted }]}>
                Showing top items from your sales summary. Full ABC ranking builds up as more orders come in.
              </Text>
            ) : null
          }
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
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

    kpiRow: { flexDirection: 'row', gap: 10 },
    kpiCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    kpiValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
    kpiLabel: { fontSize: 11, marginTop: 3, fontWeight: '600', textAlign: 'center' },

    topRevCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
    },
    topRevIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    topRevLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    topRevName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, marginTop: 1 },
    topRevMoney: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },

    calloutCard: { borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 5 },
    calloutHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    calloutTag: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    calloutName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
    calloutMeta: { fontSize: 12.5, fontWeight: '500' },

    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    catCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
    catRow: { paddingVertical: 12, gap: 7 },
    catTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    catName: { flex: 1, fontSize: 14.5, fontWeight: '700' },
    catMoney: { fontSize: 14.5, fontWeight: '800', letterSpacing: -0.3 },
    catBarTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
    catBarFill: { height: 7, borderRadius: 4 },
    catSub: { fontSize: 11.5, fontWeight: '500' },

    listHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3 },
    toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
    toggleText: { fontSize: 13, fontWeight: '700' },

    itemCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
    itemTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    itemRank: { fontSize: 13, fontWeight: '800', width: 22 },
    itemName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
    itemCat: { fontSize: 12, marginTop: 1 },
    itemRight: { alignItems: 'flex-end', gap: 5 },
    itemMoney: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
    abcBadge: { minWidth: 22, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, alignItems: 'center' },
    abcText: { fontSize: 12, fontWeight: '800' },
    shareTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
    shareFill: { height: 6, borderRadius: 3 },

    footerNote: { fontSize: 12, textAlign: 'center', paddingVertical: 16, paddingHorizontal: 24, lineHeight: 18 },
  });
