/**
 * Multi-Branch — "Manage all outlets" owner cross-outlet overview.
 *
 * A scrollable overview of EVERY outlet in the chain, each showing today's
 * revenue IN ITS OWN CURRENCY (AU → $, IN → ₹), orders, active orders, and a
 * live/offline pulse. A per-currency totals header (never a single mixed sum),
 * a Compare view (best/worst performer per currency), and a tap-through detail
 * sheet with a branch's KPIs. Pull-to-refresh + skeleton + empty state.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import {
  useOutlets,
  useOutletComparison,
  useOutletDetail,
  fmtOutletMoney,
  resolveOutletCurrency,
  outletStatus,
  filterOutlets,
} from '../../src/hooks/useMultiBranch';

// ─── Skeleton ────────────────────────────────────────────────────────────────
function BranchSkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SkeletonBox width="48%" height={92} borderRadius={16} color="#f1f5f9" />
        <SkeletonBox width="48%" height={92} borderRadius={16} color="#f1f5f9" />
      </View>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBox key={i} width="100%" height={104} borderRadius={16} color="#f1f5f9" />
      ))}
    </View>
  );
}

// ─── Status dot ──────────────────────────────────────────────────────────────
function StatusDot({ live, colors }) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.dot, { backgroundColor: live ? colors.success : colors.textMuted }]} />
      <Text style={[styles.statusText, { color: live ? colors.success : colors.textMuted }]}>
        {live ? 'Live' : 'Offline'}
      </Text>
    </View>
  );
}

// ─── Per-currency totals header ──────────────────────────────────────────────
function TotalsHeader({ groups, stats, colors }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.statRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{stats.total}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Outlets</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.success }]}>{stats.live}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Live</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{stats.activeOrders}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Active</Text>
        </View>
      </View>

      {/* Per-currency revenue — NEVER a single mixed-currency sum */}
      <View style={{ gap: 8 }}>
        {groups.map((g) => (
          <View
            key={g.currency}
            style={[styles.currencyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.currencyLeft}>
              <View style={[styles.currencyBadge, { backgroundColor: colors.accent + '18' }]}>
                <Text style={[styles.currencySym, { color: colors.accent }]}>{g.symbol}</Text>
              </View>
              <View>
                <Text style={[styles.currencyRegion, { color: colors.text }]}>
                  {g.region} · {g.count} outlet{g.count === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.currencySub, { color: colors.textMuted }]}>
                  {g.totalOrders} orders today
                </Text>
              </View>
            </View>
            <Text style={[styles.currencyTotal, { color: colors.text }]}>
              {fmtOutletMoney(g.totalRevenue, { currency: g.currency })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Outlet card ─────────────────────────────────────────────────────────────
function OutletCard({ outlet, colors, onPress }) {
  const live = outletStatus(outlet) === 'live';
  const cfg = resolveOutletCurrency(outlet);
  return (
    <Animated.View entering={FadeIn.duration(240)}>
      <Pressable
        onPress={() => onPress(outlet)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {outlet.name || 'Unnamed outlet'}
            </Text>
            <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
              {[outlet.code, outlet.city].filter(Boolean).join(' · ') || cfg.region}
            </Text>
          </View>
          <StatusDot live={live} colors={colors} />
        </View>

        <View style={[styles.cardMetrics, { borderTopColor: colors.border }]}>
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {fmtOutletMoney(outlet.today_revenue, outlet)}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Revenue</Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: colors.text }]}>{outlet.today_orders ?? 0}</Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Orders</Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metric}>
            <Text
              style={[
                styles.metricValue,
                { color: (outlet.active_orders ?? 0) > 0 ? colors.warning : colors.text },
              ]}
            >
              {outlet.active_orders ?? 0}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Active</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Compare view ────────────────────────────────────────────────────────────
function CompareView({ ranked, loading, error, colors, onRetry }) {
  if (loading) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <SkeletonBox key={i} width="100%" height={120} borderRadius={16} color="#f1f5f9" />
        ))}
      </View>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon="⚠️"
        title="Couldn't load comparison"
        subtitle="Check your connection and try again."
        action={{ label: 'Retry', onPress: onRetry }}
      />
    );
  }
  if (!ranked.length) {
    return (
      <EmptyState
        icon="📊"
        title="No comparison data"
        subtitle="Once outlets record paid orders in this period, you'll see best and worst performers here."
      />
    );
  }
  return (
    <View style={{ padding: 16, gap: 20 }}>
      {ranked.map((g) => (
        <Animated.View key={g.currency} entering={FadeIn.duration(240)} style={{ gap: 10 }}>
          <Text style={[styles.compareGroupTitle, { color: colors.textSecondary }]}>
            {g.region} · {g.symbol}
          </Text>

          {g.best && (
            <View style={[styles.perfCard, { backgroundColor: colors.card, borderColor: colors.success }]}>
              <View style={styles.perfHead}>
                <Ionicons name="trophy" size={16} color={colors.success} />
                <Text style={[styles.perfTag, { color: colors.success }]}>Top performer</Text>
              </View>
              <Text style={[styles.perfName, { color: colors.text }]} numberOfLines={1}>
                {g.best.outlet_name}
              </Text>
              <View style={styles.perfMetrics}>
                <Text style={[styles.perfMoney, { color: colors.text }]}>
                  {fmtOutletMoney(g.best.total_revenue, { currency: g.currency })}
                </Text>
                <Text style={[styles.perfMeta, { color: colors.textMuted }]}>
                  {g.best.total_orders} orders · {fmtOutletMoney(g.best.avg_order_value, { currency: g.currency })} avg
                </Text>
              </View>
            </View>
          )}

          {g.worst && (
            <View style={[styles.perfCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.perfHead}>
                <Ionicons name="trending-down" size={16} color={colors.warning} />
                <Text style={[styles.perfTag, { color: colors.warning }]}>Needs attention</Text>
              </View>
              <Text style={[styles.perfName, { color: colors.text }]} numberOfLines={1}>
                {g.worst.outlet_name}
              </Text>
              <View style={styles.perfMetrics}>
                <Text style={[styles.perfMoney, { color: colors.text }]}>
                  {fmtOutletMoney(g.worst.total_revenue, { currency: g.currency })}
                </Text>
                <Text style={[styles.perfMeta, { color: colors.textMuted }]}>
                  {g.worst.total_orders} orders · {fmtOutletMoney(g.worst.avg_order_value, { currency: g.currency })} avg
                </Text>
              </View>
            </View>
          )}

          {/* Full ranked list */}
          <View style={[styles.rankList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {g.rows.map((r, i) => (
              <View
                key={r.outlet_id}
                style={[
                  styles.rankRow,
                  i < g.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.rankNum, { color: colors.textMuted }]}>{i + 1}</Text>
                <Text style={[styles.rankName, { color: colors.text }]} numberOfLines={1}>
                  {r.outlet_name}
                </Text>
                <Text style={[styles.rankMoney, { color: colors.textSecondary }]}>
                  {fmtOutletMoney(r.total_revenue, { currency: g.currency })}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Detail sheet ────────────────────────────────────────────────────────────
function DetailSheet({ outlet, colors, onClose }) {
  const { data, isLoading, isError, refetch } = useOutletDetail(outlet?.id);
  const detail = data || outlet || {};
  const money = (v) => fmtOutletMoney(v, outlet || detail);
  const live = outletStatus(outlet || detail) === 'live';

  return (
    <Modal visible={!!outlet} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalWrap, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={[styles.sheetHead, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
                {detail.name || 'Outlet'}
              </Text>
              <Text style={[styles.sheetSub, { color: colors.textMuted }]} numberOfLines={1}>
                {[detail.code, detail.city, detail.country].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.kpiValue, { color: colors.text }]}>{money(outlet?.today_revenue)}</Text>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Today's revenue</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.kpiValue, { color: colors.text }]}>{outlet?.today_orders ?? 0}</Text>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Today's orders</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.kpiValue, { color: colors.warning }]}>{outlet?.active_orders ?? 0}</Text>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Active orders</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.kpiValue, { color: live ? colors.success : colors.textMuted }]}>
                  {live ? 'Live' : 'Offline'}
                </Text>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Status</Text>
              </View>
            </View>

            {isLoading && (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
            {isError && (
              <Pressable onPress={refetch} style={[styles.retryRow, { borderColor: colors.border }]}>
                <Ionicons name="refresh" size={16} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Retry details</Text>
              </Pressable>
            )}

            {!isLoading && (
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <DetailRow label="Address" value={[detail.address_line1, detail.address_line2].filter(Boolean).join(', ')} colors={colors} />
                <DetailRow label="Phone" value={detail.phone} colors={colors} />
                <DetailRow label="Email" value={detail.email} colors={colors} />
                <DetailRow label="Hours" value={detail.opening_time && detail.closing_time ? `${detail.opening_time} – ${detail.closing_time}` : null} colors={colors} />
                <DetailRow label="Tables" value={detail.table_count != null ? String(detail.table_count) : null} colors={colors} />
                <DetailRow label="Currency" value={detail.currency} colors={colors} last />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, colors, last }) {
  return (
    <View style={[styles.detailRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function MultiBranchScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const [tab, setTab] = useState('overview'); // 'overview' | 'compare'
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { outlets, groups, stats, isLoading, isError, refetch, isRefetching } = useOutlets();
  const comparison = useOutletComparison({ outlets, enabled: tab === 'compare' });

  const filtered = useMemo(() => filterOutlets(outlets, search), [outlets, search]);

  const onRefresh = useCallback(() => {
    refetch();
    if (tab === 'compare') comparison.refetch();
  }, [refetch, comparison, tab]);

  const chainName = currentOutlet?.head_office?.name || 'All branches';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Multi-Branch</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {chainName} · {stats.total} outlet{stats.total === 1 ? '' : 's'}
            {stats.currencies > 1 ? ` · ${stats.currencies} currencies` : ''}
          </Text>
        </View>
        <View style={[styles.livePill, { backgroundColor: colors.success + '18' }]}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text style={[styles.livePillText, { color: colors.success }]}>{stats.live} live</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {[
          { key: 'overview', label: 'Overview', icon: 'grid-outline' },
          { key: 'compare', label: 'Compare', icon: 'bar-chart-outline' },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            >
              <Ionicons name={t.icon} size={16} color={active ? colors.accent : colors.textMuted} />
              <Text style={[styles.tabText, { color: active ? colors.accent : colors.textMuted }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Body */}
      {isLoading ? (
        <BranchSkeleton />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load outlets"
          subtitle="Something went wrong fetching your branches. Pull to refresh or retry."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : tab === 'compare' ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={isRefetching || comparison.isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          <CompareView
            ranked={comparison.ranked}
            loading={comparison.isLoading}
            error={comparison.isError}
            colors={colors}
            onRetry={comparison.refetch}
          />
        </ScrollView>
      ) : outlets.length === 0 ? (
        <EmptyState
          icon="🏬"
          title="No outlets yet"
          subtitle="Once branches are added to your chain, they'll appear here with live sales."
        />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={120}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search outlets, city, code"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
              <TotalsHeader groups={groups} stats={stats} colors={colors} />
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 12 }}>
              <OutletCard outlet={item} colors={colors} onPress={setSelected} />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon="🔍" title="No matches" subtitle={`No outlets match "${search}".`} />
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        />
      )}

      {selected && <DetailSheet outlet={selected} colors={colors} onClose={() => setSelected(null)} />}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
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
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  livePillText: { fontSize: 12, fontWeight: '700' },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tabText: { fontSize: 14, fontWeight: '600' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  statRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '600' },

  currencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  currencyLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  currencyBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySym: { fontSize: 20, fontWeight: '800' },
  currencyRegion: { fontSize: 15, fontWeight: '700' },
  currencySub: { fontSize: 12, marginTop: 1 },
  currencyTotal: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },

  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  cardSub: { fontSize: 12.5, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },

  cardMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  metricLabel: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  metricDivider: { width: 1, height: 28 },

  compareGroupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  perfCard: { borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 6 },
  perfHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  perfTag: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  perfName: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  perfMetrics: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  perfMoney: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  perfMeta: { fontSize: 12.5, fontWeight: '500' },

  rankList: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  rankNum: { fontSize: 13, fontWeight: '700', width: 20 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '600' },
  rankMoney: { fontSize: 14, fontWeight: '700' },

  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  sheetSub: { fontSize: 13, marginTop: 2 },
  closeBtn: { padding: 4 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  kpiValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 12, marginTop: 4, fontWeight: '600' },

  infoCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
  detailRow: { flexDirection: 'row', paddingVertical: 12, gap: 12 },
  detailLabel: { fontSize: 13, fontWeight: '600', width: 88 },
  detailValue: { flex: 1, fontSize: 14, fontWeight: '500', textAlign: 'right' },

  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
});
