import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, { Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

import { LC } from '../../src/constants/colors';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import PressCard from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useOwnerDashboard, useAlertBadges, useLowStock } from '../../src/hooks/useOwnerApi';
import { useRealtimeOwner } from '../../src/hooks/useRealtimeOwner';
import { useOutlet } from '../../src/context/OutletContext';
import { useAuth } from '../../src/context/AuthContext';
import { OutletSwitcher } from '../../src/components/OutletSwitcher';
import { useCurrency } from '../../src/hooks/useCurrency';

// ─── Constants ──────────────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const CONTENT_W = Math.min(SCREEN_W, 480);
const CARD_PAD = 16;


// ─── Helpers ────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(dateLocale = 'en-AU') {
  const now = new Date();
  return now.toLocaleDateString(dateLocale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Animated counter (requestAnimationFrame) ───────────────────────────────

function useCounter(target, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(null);
  const startValRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    startValRef.current = display;
    startRef.current = null;
    const diff = target - startValRef.current;

    function step(ts) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startValRef.current + diff * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return display;
}

// ─── Order Status Config ────────────────────────────────────────────────────

const ORDER_STATUSES = [
  { key: 'pendingOrders', label: 'Pending', icon: 'time-outline', color: LC.warning },
  { key: 'preparingOrders', label: 'Preparing', icon: 'flame-outline', color: LC.accent },
  { key: 'readyOrders', label: 'Ready', icon: 'checkmark-circle-outline', color: LC.success },
  { key: 'completedOrders', label: 'Done', icon: 'checkmark-done-outline', color: LC.text3 },
];

// ─── Quick Action Config ────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Reports', icon: 'bar-chart-outline', route: '/(owner)/reports', color: LC.accent },
  { label: 'Staff', icon: 'people-outline', route: '/(owner)/staff', color: '#8B5CF6' },
  { label: 'Approvals', icon: 'checkmark-circle-outline', route: '/(owner)/approvals', color: LC.success },
  { label: 'EOD Status', icon: 'cash-outline', route: '/(owner)/cash-recon', color: LC.warning },
];

// ─── Memoized list-item components ─────────────────────────────────────────

const TopItemRow = React.memo(({ item, idx, maxItemCount, colors, fmt }) => (
  <View style={[s.topItemRow, { borderBottomColor: colors.border }]}>
    <View style={s.topItemLeft}>
      <Text style={[s.topItemRank, { color: colors.textMuted }]}>{idx + 1}</Text>
      <View style={s.topItemInfo}>
        <Text style={[s.topItemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[s.topItemMeta, { color: colors.textMuted }]}>{item.count} sold  {fmt(item.revenue)}</Text>
      </View>
    </View>
    <View style={[s.topItemBarWrap, { backgroundColor: colors.pillBg }]}>
      <View
        style={[
          s.topItemBar,
          {
            width: `${(item.count / maxItemCount) * 100}%`,
            backgroundColor: idx === 0 ? colors.warning : colors.accent,
          },
        ]}
      />
    </View>
  </View>
));

const LowStockRow = React.memo(({ item, idx, colors }) => (
  <View style={[s.stockRow, { borderBottomColor: colors.border }]}>
    <View style={[s.stockDot, { backgroundColor: item.currentQty <= 1 ? colors.error : colors.warning }]} />
    <Text style={[s.stockName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
    <Text style={[s.stockQty, { color: colors.error }]}>
      {item.currentQty}<Text style={[s.stockMin, { color: colors.textMuted }]}> / {item.minQty}</Text>
    </Text>
  </View>
));

const ORDER_STATUS_COLORS = {
  pending:    '#F5A623',
  preparing:  '#6366f1',
  ready:      '#22c55e',
  completed:  '#888888',
  cancelled:  '#EE0000',
};

// symbol/locale must be passed in as props — this module-level component has no
// access to the useCurrency() hook values from the screen scope, and referencing
// bare `symbol`/`dateLocale` here throws a ReferenceError (red screen) the moment
// live order rows render.
const LiveOrderRow = React.memo(({ order, colors, symbol = '', locale }) => {
  const statusColor = ORDER_STATUS_COLORS[order.status] || '#888';
  return (
    <View style={[s.liveOrderRow, { borderBottomColor: colors.border }]}>
      <View style={[s.liveStatusDot, { backgroundColor: statusColor }]} />
      <Text style={[s.liveOrderTable, { color: colors.text }]}>{order.table || 'Takeaway'}</Text>
      <Text style={[s.liveOrderStatus, { color: statusColor }]}>{order.status}</Text>
      <View style={{ flex: 1 }} />
      <Text style={[s.liveOrderAmount, { color: colors.text }]}>{symbol}{(order.amount || 0).toLocaleString(locale)}</Text>
      <Text style={[s.liveOrderTime, { color: colors.textMuted }]}>{order.time || ''}</Text>
    </View>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function OwnerHomeScreen() {
  const router = useRouter();
  const { outletId } = useOutlet();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { fmt, fmtFull, symbol, dateLocale } = useCurrency();

  const { data, isLoading, isError, refetch: refetchDash } = useOwnerDashboard(outletId);
  const { data: alertData, refetch: refetchAlerts } = useAlertBadges(outletId);
  const { data: stockData, refetch: refetchStock } = useLowStock(outletId);

  const [refreshing, setRefreshing] = useState(false);
  const [liveStats, setLiveStats] = useState(null);

  // Wire real-time owner stats
  useRealtimeOwner(outletId, useCallback((stats) => {
    setLiveStats(stats);
  }, []));

  // Merge live stats over API data so animated counter and order counts update in real-time
  const d = useMemo(() => ({
    ...(data || {}),
    ...(liveStats ? {
      todayRevenue: liveStats.todayRevenue ?? data?.todayRevenue,
      totalOrders:  liveStats.totalOrders  ?? data?.totalOrders,
      pendingOrders: liveStats.pendingOrders ?? data?.pendingOrders,
      preparingOrders: liveStats.preparingOrders ?? data?.preparingOrders,
    } : {}),
  }), [data, liveStats]);
  const alerts = alertData || { totalAlerts: 0, voids: 0, refunds: 0, lowStock: 0 };
  const lowStockItems = Array.isArray(stockData) ? stockData : [];

  // Animated counter for revenue
  const animatedRevenue = useCounter(d.todayRevenue || 0);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchDash(), refetchAlerts(), refetchStock()]);
    setRefreshing(false);
  }, [refetchDash, refetchAlerts, refetchStock]);

  // Card entry animation
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(24);

  useEffect(() => {
    cardOpacity.value = withTiming(1, { duration: 500 });
    cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
  }, []);

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  // User display name — the auth user carries `full_name` (there is no `name`).
  const userName = user?.full_name || user?.name || 'Owner';
  const firstName = userName.split(' ')[0];

  // Alert count
  const totalAlertCount = alerts.totalAlerts || 0;

  // Revenue growth
  const growth = d.revenueGrowth ?? 0;
  const growthPositive = growth >= 0;

  // Hourly data for bar chart (memoized)
  const hourly = useMemo(() => d.hourlyRevenue || [], [d.hourlyRevenue]);
  const maxHourly = useMemo(() => Math.max(...hourly, 1), [hourly]);

  // Top items (memoized)
  const topItems = useMemo(() => (d.topItems || []).slice(0, 5), [d.topItems]);
  const maxItemCount = useMemo(() => Math.max(...topItems.map((i) => i.count), 1), [topItems]);

  // Low stock (first 3, memoized)
  const lowStockDisplay = useMemo(() => lowStockItems.slice(0, 3), [lowStockItems]);

  // ── Loading Skeleton ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={[s.headerRow, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <View>
            <SkeletonBox width={180} height={20} borderRadius={6} style={{ backgroundColor: colors.pillBg }} />
            <SkeletonBox width={120} height={14} borderRadius={4} style={{ marginTop: 6, backgroundColor: colors.pillBg }} />
          </View>
          <SkeletonBox width={36} height={36} borderRadius={18} style={{ backgroundColor: colors.pillBg }} />
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          <SkeletonBox width={CONTENT_W - 32} height={200} borderRadius={16} style={{ alignSelf: 'center', backgroundColor: colors.pillBg }} />
          <View style={s.statusRow}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBox key={i} width={(CONTENT_W - 56) / 4} height={72} borderRadius={12} style={{ backgroundColor: colors.pillBg }} />
            ))}
          </View>
          <SkeletonBox width={CONTENT_W - 32} height={180} borderRadius={16} style={{ alignSelf: 'center', marginTop: 12, backgroundColor: colors.pillBg }} />
          <SkeletonBox width={CONTENT_W - 32} height={120} borderRadius={16} style={{ alignSelf: 'center', marginTop: 12, backgroundColor: colors.pillBg }} />
          <View style={s.actionGrid}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBox key={i} width={(CONTENT_W - 48) / 2} height={80} borderRadius={14} style={{ backgroundColor: colors.pillBg }} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={[s.headerRow, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <View style={s.headerLeft}>
            <Text style={[s.greeting, { color: colors.text }]}>{getGreeting()}, {firstName}</Text>
            <Text style={[s.dateText, { color: colors.textMuted }]}>{formatDate(dateLocale)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
          <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => refetchDash()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: 8 }}>
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[s.headerRow, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <View style={s.headerLeft}>
          <Text style={[s.greeting, { color: colors.text }]}>{getGreeting()}, {firstName}</Text>
          <Text style={[s.dateText, { color: colors.textMuted }]}>{formatDate(dateLocale)}</Text>
          <View style={{ marginTop: 8 }}>
            <OutletSwitcher />
          </View>
        </View>
        <PressCard
          style={[s.bellWrap, { backgroundColor: colors.pillBg }]}
          onPress={() => router.push('/(owner)/alerts')}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          {totalAlertCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{totalAlertCount > 9 ? '9+' : totalAlertCount}</Text>
            </View>
          )}
        </PressCard>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={LC.accent}
          />
        }
      >
        <Animated.View style={cardAnimStyle}>
          {/* ── Hero Revenue Card ────────────────────────────────────── */}
          <View style={[s.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={[s.heroEyebrow, { color: colors.textMuted }]}>TODAY'S REVENUE</Text>
              {liveStats && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22c55e' }} />
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#16a34a', letterSpacing: 0.5 }}>LIVE</Text>
                </View>
              )}
            </View>

            <View style={s.heroAmountRow}>
              <Text style={[s.heroAmount, { color: colors.text }]}>{fmtFull(animatedRevenue)}</Text>
              <View style={[s.growthPill, growthPositive ? s.growthUp : s.growthDown]}>
                <Ionicons
                  name={growthPositive ? 'arrow-up' : 'arrow-down'}
                  size={11}
                  color={growthPositive ? LC.successText : LC.errorText}
                />
                <Text style={[s.growthText, { color: growthPositive ? LC.successText : LC.errorText }]}>
                  {growthPositive ? '+' : ''}{growth.toFixed(1)}%
                </Text>
              </View>
            </View>

            {/* Hourly bar chart (inline SVG) */}
            {hourly.length > 0 && (
              <View style={s.barChartWrap}>
                <Svg width={CONTENT_W - 64} height={48}>
                  {hourly.map((val, i) => {
                    const barW = Math.floor((CONTENT_W - 64 - (hourly.length - 1) * 6) / hourly.length);
                    const barH = Math.max((val / maxHourly) * 40, 3);
                    const x = i * (barW + 6);
                    const y = 48 - barH;
                    return (
                      <Rect
                        key={i}
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx={4}
                        ry={4}
                        fill={i === hourly.length - 1 ? LC.accent : LC.bg3}
                      />
                    );
                  })}
                </Svg>
              </View>
            )}

            {/* Stats row */}
            <View style={[s.statsRow, { borderTopColor: colors.border }]}>
              <View style={s.statItem}>
                <Text style={[s.statValue, { color: colors.text }]}>{d.totalOrders || 0}</Text>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>Orders</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statValue, { color: colors.text }]}>{fmt(d.avgOrderValue || 0)}</Text>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>Avg Value</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statValue, { color: colors.text }]}>{d.pendingOrders || 0}</Text>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>Pending</Text>
              </View>
            </View>
          </View>

          {/* ── Order Status Cards ───────────────────────────────────── */}
          <View style={s.statusRow}>
            {ORDER_STATUSES.map((st) => (
              <View key={st.key} style={[s.statusCard, { borderTopColor: st.color, backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={st.icon} size={18} color={st.color} />
                <Text style={[s.statusCount, { color: colors.text }]}>{d[st.key] || 0}</Text>
                <Text style={[s.statusLabel, { color: colors.textMuted }]}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Live Orders Board (real-time, only shown when data available) ── */}
          {liveStats?.recentOrders?.length > 0 && (
            <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.sectionHeader}>
                <View style={[s.liveDot, { backgroundColor: '#22c55e' }]} />
                <Text style={[s.sectionTitle, { color: colors.text }]}>Live Orders</Text>
              </View>
              {liveStats.recentOrders.slice(0, 5).map((order, idx) => (
                <LiveOrderRow key={order.id || idx} order={order} colors={colors} symbol={symbol} locale={dateLocale} />
              ))}
            </View>
          )}

          {/* ── Top Selling Items ────────────────────────────────────── */}
          <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.sectionHeader}>
              <Ionicons name="trophy-outline" size={18} color={colors.warning} />
              <Text style={[s.sectionTitle, { color: colors.text }]}>Top Items</Text>
            </View>

            {topItems.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Ionicons name="restaurant-outline" size={36} color={colors.textMuted} />
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>No items sold yet</Text>
              </View>
            )}
            {topItems.map((item, idx) => (
              <TopItemRow key={idx} item={item} idx={idx} maxItemCount={maxItemCount} colors={colors} fmt={fmt} />
            ))}
          </View>

          {/* ── Low Stock Alert ──────────────────────────────────────── */}
          <PressCard
            style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/(owner)/inventory')}
          >
            <View style={s.sectionHeader}>
              <Ionicons name="warning-outline" size={18} color={colors.error} />
              <Text style={[s.sectionTitle, { color: colors.text }]}>Low Stock</Text>
              <View style={s.viewAllWrap}>
                <Text style={[s.viewAllText, { color: colors.accent }]}>View All</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </View>
            </View>

            {lowStockDisplay.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>All stocked up</Text>
              </View>
            )}
            {lowStockDisplay.map((item, idx) => (
              <LowStockRow key={idx} item={item} idx={idx} colors={colors} />
            ))}
          </PressCard>

          {/* ── Quick Actions ────────────────────────────────────────── */}
          <Text style={[s.quickActionsTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={s.actionGrid}>
            {QUICK_ACTIONS.map((action) => (
              <PressCard
                key={action.label}
                style={[s.actionTile, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(action.route)}
              >
                <View style={[s.actionIconWrap, { backgroundColor: action.color + '14' }]}>
                  <Ionicons name={action.icon} size={22} color={action.color} />
                </View>
                <Text style={[s.actionLabel, { color: colors.text }]}>{action.label}</Text>
              </PressCard>
            ))}
          </View>

          {/* Bottom spacer */}
          <View style={{ height: 32 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: LC.bg2,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_PAD,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: LC.bg,
    borderBottomWidth: 1,
    borderBottomColor: LC.separator,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    ...TYPE.h2,
    color: LC.text1,
  },
  dateText: {
    ...TYPE.small,
    color: LC.text3,
    marginTop: 2,
  },
  bellWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: LC.bg2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: LC.error,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    ...TYPE.caption,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: CARD_PAD,
  },

  // ── Hero Revenue Card ──
  heroCard: {
    width: CONTENT_W - 32,
    backgroundColor: LC.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  heroEyebrow: {
    ...TYPE.label,
    color: LC.text3,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroAmount: {
    ...TYPE.amountXl,
    color: LC.text1,
  },
  growthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 3,
  },
  growthUp: {
    backgroundColor: LC.successBg,
  },
  growthDown: {
    backgroundColor: LC.errorBg,
  },
  growthText: {
    ...TYPE.caption,
    fontWeight: '700',
  },
  barChartWrap: {
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: LC.separator,
    paddingTop: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...TYPE.amount,
    color: LC.text1,
  },
  statLabel: {
    ...TYPE.caption,
    color: LC.text3,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: LC.separator,
  },

  // ── Order Status Cards ──
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    width: CONTENT_W - 32,
  },
  statusCard: {
    flex: 1,
    backgroundColor: LC.card,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LC.cardBorder,
    borderTopWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  statusCount: {
    ...TYPE.amount,
    color: LC.text1,
    marginTop: 4,
  },
  statusLabel: {
    ...TYPE.caption,
    color: LC.text3,
    marginTop: 2,
  },

  // ── Section Cards ──
  sectionCard: {
    width: CONTENT_W - 32,
    backgroundColor: LC.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    ...TYPE.h3,
    color: LC.text1,
    flex: 1,
  },

  // ── Top Items ──
  topItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: LC.separator,
  },
  topItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  topItemRank: {
    ...TYPE.smallMed,
    color: LC.text3,
    width: 20,
  },
  topItemInfo: {
    flex: 1,
  },
  topItemName: {
    ...TYPE.bodyMed,
    color: LC.text1,
  },
  topItemMeta: {
    ...TYPE.caption,
    color: LC.text3,
    marginTop: 1,
  },
  topItemBarWrap: {
    width: 64,
    height: 6,
    borderRadius: 3,
    backgroundColor: LC.bg3,
    overflow: 'hidden',
  },
  topItemBar: {
    height: 6,
    borderRadius: 3,
  },

  // ── Low Stock ──
  viewAllWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    ...TYPE.smallMed,
    color: LC.accent,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: LC.separator,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  stockName: {
    ...TYPE.body,
    color: LC.text1,
    flex: 1,
  },
  stockQty: {
    ...TYPE.bodyMed,
    color: LC.error,
  },
  stockMin: {
    ...TYPE.small,
    color: LC.text3,
    fontWeight: '400',
  },

  // ── Live Orders Board ──
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  liveOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  liveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveOrderTable: {
    ...TYPE.bodyMed,
    width: 48,
  },
  liveOrderStatus: {
    ...TYPE.caption,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  liveOrderAmount: {
    ...TYPE.smallMed,
  },
  liveOrderTime: {
    ...TYPE.caption,
    minWidth: 40,
    textAlign: 'right',
  },

  // ── Quick Actions ──
  quickActionsTitle: {
    ...TYPE.h3,
    color: LC.text1,
    alignSelf: 'flex-start',
    marginTop: 20,
    marginBottom: 10,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: CONTENT_W - 32,
  },
  actionTile: {
    width: (CONTENT_W - 32 - 12) / 2,
    backgroundColor: LC.card,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...TYPE.bodyMed,
    color: LC.text1,
  },
});
