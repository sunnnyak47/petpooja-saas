/**
 * Dashboard — MS-RM Owner
 * Web-aligned theme via useTheme() (light + dark aware, tenant-brandable)
 * Web-compatible (expo start --web) · Mobile-first 390px viewport
 * No Gesture.Pan / GestureHandlerRootView — uses TouchableOpacity press effects
 * Reanimated: useSharedValue, useAnimatedStyle, withTiming, withSpring only
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Rect,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Path,
  G,
  Text as SvgText,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useDashboard } from '../../src/hooks/useApi';
import SkeletonBox from '../../src/components/SkeletonBox';
import { PressCard } from '../../src/components/PressCard';
import { TYPE } from '../../src/constants/typography';

// ─── Themed styles ─────────────────────────────────────────────────────────────
// Colors now come from useTheme() (web-aligned, light/dark aware, tenant-brandable)
// instead of a hardcoded module-scope palette. makeStyles(colors) is a pure factory
// memoised per-component via useThemedStyles() so every colour re-skins with the theme.
function useThemedStyles() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return { colors, styles };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_PAD = 16;
const CONTENT_W = Math.min(SCREEN_W, 480);
const HERO_W = CONTENT_W - CARD_PAD * 2;

// ─── Utility ──────────────────────────────────────────────────────────────────
function fmt(v) {
  const n = parseFloat(v);
  if (!n || isNaN(n)) return '—';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// ─── Animated Counter (JS-side, no runOnJS needed) ───────────────────────────
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

// ─── Hero Revenue Card ────────────────────────────────────────────────────────
function HeroRevenueCard({ revenue, totalOrders, avgOrderValue, revenueGrowth, hourlyRevenue }) {
  const { colors, styles } = useThemedStyles();
  const displayRevenue = useCounter(revenue, 1400);
  const displayOrders = useCounter(totalOrders, 1000);
  const displayAvg = useCounter(Math.round(avgOrderValue), 1200);

  const isPositive = revenueGrowth >= 0;

  return (
    <PressCard style={styles.heroCard}>
      {/* Eyebrow */}
      <Text style={styles.heroEyebrow}>TODAY'S REVENUE</Text>

      {/* Big revenue number + growth badge */}
      <View style={styles.heroRevenueRow}>
        <Text style={styles.heroRevenue}>
          ₹{displayRevenue.toLocaleString('en-IN')}
        </Text>
        <View style={styles.growthBadge}>
          <Text style={styles.growthText}>
            {isPositive ? '+' : ''}{revenueGrowth.toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* Hourly bar mini-chart */}
      <HourlyMiniChart data={hourlyRevenue} />

      {/* Stats row */}
      <View style={styles.heroStats}>
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatValue}>{displayOrders}</Text>
          <Text style={styles.heroStatLabel}>Orders</Text>
        </View>
        <View style={styles.heroStatDivider} />
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatValue}>₹{displayAvg.toLocaleString('en-IN')}</Text>
          <Text style={styles.heroStatLabel}>Avg Value</Text>
        </View>
        <View style={styles.heroStatDivider} />
        <View style={styles.heroStatItem}>
          <Text style={[styles.heroStatValue, { color: isPositive ? colors.success : colors.error }]}>
            {isPositive ? '+' : ''}{revenueGrowth.toFixed(1)}%
          </Text>
          <Text style={styles.heroStatLabel}>Growth</Text>
        </View>
      </View>
    </PressCard>
  );
}

// ─── Hourly Mini Bar Chart (inside hero card) ─────────────────────────────────
function HourlyMiniChart({ data = [] }) {
  const { colors } = useTheme();
  const HOURS = ['10', '11', '12', '13', '14', '15', '16'];
  const max = Math.max(...data, 1);
  const barH = 32;
  const chartW = HERO_W - 40;
  const n = Math.min(data.length, 7);
  const gap = chartW / n;
  const barW = Math.max(gap * 0.55, 8);

  return (
    <View style={{ marginTop: 14, marginBottom: 14 }}>
      <Svg width={chartW} height={barH + 18}>
        {data.slice(0, n).map((v, i) => {
          const bh = Math.max((v / max) * barH, 3);
          const x = i * gap + (gap - barW) / 2;
          const isLast = i === n - 1;
          return (
            <G key={i}>
              <Rect
                x={x}
                y={barH - bh}
                width={barW}
                height={bh}
                rx={3}
                fill={isLast ? colors.text : colors.accent}
                opacity={isLast ? 1 : 0.55}
              />
              <SvgText
                x={x + barW / 2}
                y={barH + 14}
                textAnchor="middle"
                fontSize={9}
                fill={isLast ? colors.text : colors.textMuted}
                fontWeight={isLast ? '700' : '400'}
              >
                {HOURS[i] || ''}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ─── Stats Row (4 horizontal scroll pills) ───────────────────────────────────
function StatsRow({ totalOrders, pendingOrders, avgOrderValue, completedOrders }) {
  const { styles } = useThemedStyles();
  const [activeIdx, setActiveIdx] = useState(0);

  const pills = [
    { label: 'Orders',    value: String(totalOrders) },
    { label: 'Pending',   value: String(pendingOrders) },
    { label: 'Avg Value', value: fmt(avgOrderValue) },
    { label: 'Covers',    value: String(completedOrders) },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.statsRowContent}
    >
      {pills.map((p, i) => (
        <StatPill
          key={i}
          label={p.label}
          value={p.value}
          active={activeIdx === i}
          onPress={() => setActiveIdx(i)}
        />
      ))}
    </ScrollView>
  );
}

function StatPill({ label, value, active, onPress }) {
  const { styles } = useThemedStyles();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.94, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 18 }); }}
    >
      <Animated.View
        style={[
          styles.statPill,
          active && styles.statPillActive,
          animStyle,
        ]}
      >
        <Text style={[styles.statPillLabel, active && styles.statPillLabelActive]}>
          {label}
        </Text>
        <Text style={[styles.statPillValue, active && styles.statPillValueActive]}>
          {value}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Order Status Donut Ring ──────────────────────────────────────────────────
function OrderStatusRing({ pending, preparing, ready, completed }) {
  const { colors, styles } = useThemedStyles();
  const total = pending + preparing + ready + completed || 1;

  const segments = [
    { label: 'Pending',   count: pending,   color: colors.warning },
    { label: 'Preparing', count: preparing, color: colors.accent },
    { label: 'Ready',     count: ready,     color: colors.success },
    { label: 'Done',      count: completed, color: colors.borderLight },
  ];

  const SIZE = 140;
  const STROKE = 18;
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  let offset = 0;
  const arcs = segments.map((s) => {
    const pct = s.count / total;
    const dash = circ * pct;
    const arc = { ...s, pct, dash, offset };
    offset += dash;
    return arc;
  });

  return (
    <View style={styles.donutRow}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={cx} cy={cy} r={r}
            stroke={colors.borderLight}
            strokeWidth={STROKE}
            fill="none"
          />
          {arcs.map((arc, i) => (
            arc.count > 0 && (
              <Circle
                key={i}
                cx={cx} cy={cy} r={r}
                stroke={arc.color}
                strokeWidth={STROKE - 2}
                fill="none"
                strokeDasharray={`${arc.dash - 2} ${circ - (arc.dash - 2)}`}
                strokeDashoffset={-(arc.offset)}
                rotation="-90"
                origin={`${cx},${cy}`}
                strokeLinecap="round"
              />
            )
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
            {pending + preparing + ready}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }}>Active</Text>
        </View>
      </View>

      <View style={styles.donutLegend}>
        {segments.map((s, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
            <Text style={[styles.legendCount, { color: colors.text }]}>{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Revenue Bar Chart (7 bars, hourly) ───────────────────────────────────────
function RevenueBarChart({ data = [] }) {
  const { colors, styles } = useThemedStyles();
  const HOURS = ['10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm'];
  const max = Math.max(...data, 1);
  const CHART_H = 100;
  const chartW = HERO_W;
  const n = Math.min(data.length, 7);
  const gap = chartW / n;
  const barW = Math.max(gap * 0.5, 12);

  const [activeIdx, setActiveIdx] = useState(n - 1);

  return (
    <View>
      <Svg width={chartW} height={CHART_H + 28}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((pct, i) => (
          <Rect
            key={i}
            x={0}
            y={CHART_H - CHART_H * pct}
            width={chartW}
            height={1}
            fill={colors.borderLight}
          />
        ))}

        {data.slice(0, n).map((v, i) => {
          const bh = Math.max((v / max) * CHART_H, 4);
          const x = i * gap + (gap - barW) / 2;
          const isActive = i === activeIdx;
          return (
            <G key={i}>
              <Rect
                x={x} y={CHART_H - bh}
                width={barW} height={bh}
                rx={6}
                fill={isActive ? colors.text : colors.accent}
                opacity={isActive ? 1 : 0.7}
                onPress={() => setActiveIdx(i)}
              />
              <SvgText
                x={x + barW / 2} y={CHART_H + 18}
                textAnchor="middle"
                fontSize={9}
                fill={isActive ? colors.text : colors.textMuted}
                fontWeight={isActive ? '700' : '400'}
              >
                {HOURS[i] || ''}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {activeIdx !== null && data[activeIdx] !== undefined && (
        <View
          style={[
            styles.barTooltip,
            { left: activeIdx * gap + (gap - barW) / 2 - 12 },
          ]}
        >
          <Text style={styles.tooltipText}>{fmt(data[activeIdx])}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Top Dishes List ──────────────────────────────────────────────────────────
const RANK_STYLES = [
  { bg: '#000000', text: '#FFFFFF' },
  { bg: '#444444', text: '#FFFFFF' },
  { bg: '#DDDDDD', text: '#0f172a' },
];

function DishItem({ item, index }) {
  const { colors, styles } = useThemedStyles();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const rs = RANK_STYLES[index] || { bg: colors.borderLight, text: colors.textMuted };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 18 }); }}
    >
      <Animated.View style={[styles.dishRow, animStyle]}>
        <View style={[styles.rankBadge, { backgroundColor: rs.bg }]}>
          <Text style={[styles.rankText, { color: rs.text }]}>
            #{index + 1}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.dishName}>{item.name}</Text>
          <Text style={styles.dishCount}>
            {item.count ?? item.total_quantity ?? item.order_count ?? 0} orders
          </Text>
        </View>
        <Text style={styles.dishRevenue}>
          {fmt(item.revenue ?? item.total_revenue ?? item.amount)}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Quick Actions grid ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'New Order',   icon: '🛒', route: '/pos' },
  { label: 'View Orders', icon: '📋', route: '/orders' },
  { label: 'Tables',      icon: '🍽️', route: '/tables' },
  { label: 'KOT',         icon: '🧑‍🍳', route: '/kot' },
];

function QuickAction({ label, icon, onPress }) {
  const { styles } = useThemedStyles();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 16 }); }}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <Animated.View style={[styles.quickAction, animStyle]}>
        <Text style={styles.quickActionIcon}>{icon}</Text>
        <Text style={styles.quickActionLabel}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Skeleton loading layout ──────────────────────────────────────────────────
function DashboardSkeleton({ insets }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={{
        padding: CARD_PAD,
        gap: 14,
        paddingTop: insets.top + 76,
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      <SkeletonBox width="60%" height={22} borderRadius={6} color={colors.border} />
      <SkeletonBox width="40%" height={14} borderRadius={4} style={{ marginTop: -6 }} color={colors.border} />
      <SkeletonBox width="100%" height={200} borderRadius={12} color={colors.border} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBox key={i} width={74} height={64} borderRadius={12} color={colors.border} />
        ))}
      </View>
      <SkeletonBox width="100%" height={160} borderRadius={12} color={colors.border} />
      <SkeletonBox width="100%" height={148} borderRadius={12} color={colors.border} />
      {[0, 1, 2].map((i) => (
        <SkeletonBox key={i} width="100%" height={60} borderRadius={12} color={colors.border} />
      ))}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SkeletonBox width="48%" height={80} borderRadius={12} color={colors.border} />
        <SkeletonBox width="48%" height={80} borderRadius={12} color={colors.border} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SkeletonBox width="48%" height={80} borderRadius={12} color={colors.border} />
        <SkeletonBox width="48%" height={80} borderRadius={12} color={colors.border} />
      </View>
    </ScrollView>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  const { styles } = useThemedStyles();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// ─── Notifications Modal ──────────────────────────────────────────────────────
// Real notifications feed is not wired for this screen yet. Rather than fabricate
// data (dangerous on an owner screen), we render an honest empty state until a
// real notifications/alerts source is connected.
function NotificationsModal({ visible, onClose }) {
  const { colors, styles } = useThemedStyles();
  const [notifs, setNotifs] = useState([]);
  const { height: SCREEN_H } = Dimensions.get('window');

  function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: colors.overlay }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={[styles.notifSheet, { maxHeight: SCREEN_H * 0.7 }]}>
        <View style={styles.notifHandle} />
        <View style={styles.notifHeaderRow}>
          <Text style={styles.notifTitle}>Notifications</Text>
          {notifs.length > 0 && (
            <TouchableOpacity onPress={markAllRead} activeOpacity={0.7}>
              <Text style={styles.notifMarkAll}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {notifs.length === 0 ? (
            <View style={styles.notifEmpty}>
              <Text style={styles.notifEmptyIcon}>🔔</Text>
              <Text style={styles.notifEmptyText}>No notifications</Text>
              <Text style={styles.notifEmptySub}>You're all caught up.</Text>
            </View>
          ) : (
            notifs.map((n) => (
              <View
                key={n.id}
                style={[styles.notifRow, n.unread && styles.notifRowUnread]}
              >
                {n.unread && <View style={styles.notifBlueDot} />}
                <Text style={styles.notifIcon}>{n.icon}</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.notifItemTitle}>{n.title}</Text>
                  <Text style={styles.notifItemBody}>{n.body}</Text>
                </View>
                <Text style={styles.notifTime}>{n.time}</Text>
              </View>
            ))
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────
function NotifBell({ count = 0, onPress }) {
  const { styles } = useThemedStyles();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.88, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
      style={styles.bellBtn}
    >
      <Animated.View style={animStyle}>
        <Text style={{ fontSize: 20 }}>🔔</Text>
        {count > 0 && (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{count > 9 ? '9+' : count}</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { colors, styles } = useThemedStyles();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const {
    data: rawData,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useDashboard();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // No silent mock fallback — real data only. Missing fields coerce to neutral
  // zeros/empties so the empty state (below) surfaces instead of fake revenue.
  const d = useMemo(() => {
    const api = rawData?.data || rawData || {};
    return {
      todayRevenue:     Number(api.todayRevenue     ?? api.today_revenue     ?? 0),
      totalOrders:      Number(api.totalOrders      ?? api.total_orders      ?? 0),
      pendingOrders:    Number(api.pendingOrders    ?? api.pending_orders    ?? 0),
      preparingOrders:  Number(api.preparingOrders  ?? api.preparing_orders  ?? 0),
      readyOrders:      Number(api.readyOrders      ?? api.ready_orders      ?? 0),
      completedOrders:  Number(api.completedOrders  ?? api.completed_orders  ?? 0),
      avgOrderValue:    Number(api.avgOrderValue    ?? api.avg_order_value   ?? 0),
      topItems:         api.topItems     ?? api.top_items     ?? [],
      hourlyRevenue:    api.hourlyRevenue ?? api.hourly_revenue ?? [],
      revenueGrowth:    Number(api.revenueGrowth    ?? api.revenue_growth    ?? 0),
    };
  }, [rawData]);

  // The API normalizer always returns numeric fields (0 for an empty outlet), so a
  // "field present" check would always pass and mask the honest empty state. Key
  // off real activity instead — revenue, orders, or any live pipeline count.
  const hasData = useMemo(() => {
    const api = rawData?.data || rawData || {};
    const num = (...vals) => vals.reduce((acc, v) => acc + (Number(v) || 0), 0);
    return (
      num(api.todayRevenue, api.today_revenue) > 0 ||
      num(api.totalOrders, api.total_orders) > 0 ||
      num(
        api.pendingOrders, api.pending_orders,
        api.preparingOrders, api.preparing_orders,
        api.readyOrders, api.ready_orders,
        api.completedOrders, api.completed_orders,
      ) > 0
    );
  }, [rawData]);

  const notifCount = d.pendingOrders;

  if (isLoading) {
    return (
      <View style={styles.root}>
        <DashboardSkeleton insets={insets} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Fixed Header ───────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerGreeting}>{getGreeting()}, Owner 👋</Text>
            <Text style={styles.headerDate}>{formatDate()}</Text>
          </View>
          <NotifBell count={notifCount} onPress={() => setNotifOpen(true)} />
          <TouchableOpacity
            onPress={() => setProfileOpen(true)}
            style={{ marginLeft: 8, padding: 8 }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="person-circle-outline" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Profile Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={profileOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileOpen(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: colors.overlay }}
          activeOpacity={1}
          onPress={() => setProfileOpen(false)}
        />
        <View style={styles.profileSheet}>
          <View style={styles.profileSheetHandle} />
          <Text style={styles.profileName}>{user?.name || 'Owner'}</Text>
          <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          <View style={styles.profileSeparator} />
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={async () => {
              setProfileOpen(false);
              await logout();
              router.replace('/login');
            }}
          >
            <Text style={styles.signOutBtnText}>Sign Out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileCloseBtn}
            onPress={() => setProfileOpen(false)}
          >
            <Text style={styles.profileCloseBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Notifications Modal ────────────────────────────────────────────── */}
      <NotificationsModal visible={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* ── Scrollable Body ────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressViewOffset={insets.top + 60}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 96 },
        ]}
      >
        {(isError || !hasData) ? (
          /* ── Empty / error state — never fabricate revenue ─────────────── */
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>
              {isError ? "Couldn't load dashboard" : 'No data yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {isError
                ? "We couldn't reach the server. Pull to refresh or try again."
                : "Today's revenue and orders will appear here once activity starts."}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* 1. Hero Revenue Card */}
            <View style={styles.section}>
              <HeroRevenueCard
                revenue={d.todayRevenue}
                totalOrders={d.totalOrders}
                avgOrderValue={d.avgOrderValue}
                revenueGrowth={d.revenueGrowth}
                hourlyRevenue={d.hourlyRevenue}
              />
            </View>

            {/* 2. Stats Row */}
            <View style={{ marginTop: 16 }}>
              <StatsRow
                totalOrders={d.totalOrders}
                pendingOrders={d.pendingOrders}
                avgOrderValue={d.avgOrderValue}
                completedOrders={d.completedOrders}
              />
            </View>

            {/* 3. Order Status Ring */}
            <View style={styles.section}>
              <SectionHeader title="Order Status" subtitle="Live breakdown" />
              <View style={styles.card}>
                <OrderStatusRing
                  pending={d.pendingOrders}
                  preparing={d.preparingOrders}
                  ready={d.readyOrders}
                  completed={d.completedOrders}
                />
              </View>
            </View>

            {/* 4. Revenue Bar Chart */}
            <View style={styles.section}>
              <SectionHeader title="Hourly Revenue" subtitle="Tap a bar for value" />
              <View style={styles.card}>
                <RevenueBarChart data={d.hourlyRevenue} />
              </View>
            </View>

            {/* 5. Top Dishes */}
            <View style={styles.section}>
              <SectionHeader title="Top Dishes" subtitle="Today's bestsellers" />
              <View style={styles.card}>
                <FlashList
                  data={d.topItems}
                  estimatedItemSize={64}
                  keyExtractor={(item, i) => item.name + i}
                  renderItem={({ item, index }) => (
                    <DishItem item={item} index={index} />
                  )}
                  ItemSeparatorComponent={() => (
                    <View style={{ height: 1, backgroundColor: colors.borderLight, marginVertical: 4 }} />
                  )}
                  scrollEnabled={false}
                />
              </View>
            </View>

            {/* 6. Quick Actions 2×2 grid */}
            <View style={styles.section}>
              <SectionHeader title="Quick Actions" />
              <View style={styles.quickActionsGrid}>
                <View style={styles.quickActionsRow}>
                  {QUICK_ACTIONS.slice(0, 2).map((a, i) => (
                    <QuickAction key={i} {...a} onPress={() => a.route && router.push(a.route)} />
                  ))}
                </View>
                <View style={styles.quickActionsRow}>
                  {QUICK_ACTIONS.slice(2, 4).map((a, i) => (
                    <QuickAction key={i} {...a} onPress={() => a.route && router.push(a.route)} />
                  ))}
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// makeStyles(colors) — pure factory built from web-aligned theme colours.
const makeStyles = (colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Header
  header: {
    paddingHorizontal: CARD_PAD,
    paddingBottom: 14,
    backgroundColor: colors.bg,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerGreeting: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerDate: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },

  // Bell
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Scroll
  scrollContent: {
    paddingTop: 8,
  },

  // Empty / error state
  emptyWrap: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 18,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Layout
  section: {
    paddingHorizontal: CARD_PAD,
    marginTop: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },

  // Hero Card
  heroCard: {
    width: HERO_W,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 6,
    overflow: 'hidden',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: 6,
  },
  heroRevenueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroRevenue: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  growthBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.success + '22',
    marginBottom: 4,
  },
  growthText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.borderLight,
  },

  // Stats pills
  statsRowContent: {
    paddingHorizontal: CARD_PAD,
    gap: 8,
  },
  statPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 80,
    minHeight: 64,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statPillActive: {
    backgroundColor: colors.pillActiveBg,
    borderColor: colors.pillActiveBg,
  },
  statPillLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 4,
  },
  statPillLabelActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  statPillValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  statPillValueActive: {
    color: colors.pillActiveText,
  },

  // Donut chart
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  donutLegend: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  legendCount: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // Bar chart tooltip
  barTooltip: {
    position: 'absolute',
    top: -28,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },

  // Top dishes
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dishName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.1,
  },
  dishCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  dishRevenue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: -0.3,
  },

  // Quick actions
  quickActionsGrid: {
    gap: 10,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAction: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    minHeight: 80,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  quickActionIcon: {
    fontSize: 22,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.1,
    textAlign: 'center',
  },

  // Profile Modal Sheet
  profileSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  profileSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  profileSeparator: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 20,
  },
  signOutBtn: {
    backgroundColor: colors.text,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  signOutBtnText: {
    color: colors.card,
    fontSize: 15,
    fontWeight: '700',
  },
  profileCloseBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileCloseBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  // Notifications modal
  notifSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 0,
    paddingTop: 12,
  },
  notifHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  notifHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  notifTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  notifMarkAll: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  notifEmpty: {
    paddingVertical: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifEmptyIcon: {
    fontSize: 40,
    marginBottom: 12,
    opacity: 0.5,
  },
  notifEmptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  notifEmptySub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingLeft: 0,
    position: 'relative',
  },
  notifRowUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 10,
  },
  notifBlueDot: {
    display: 'none',
  },
  notifIcon: {
    fontSize: 24,
    lineHeight: 30,
  },
  notifItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  notifItemBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  notifTime: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 8,
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
});
