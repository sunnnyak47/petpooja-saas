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
import { useScreenScale } from '../../src/lib/responsive';
import { useDashboard, useOrders } from '../../src/hooks/useApi';
import { useCurrency } from '../../src/hooks/useCurrency';
import SkeletonBox from '../../src/components/SkeletonBox';
import { PressCard } from '../../src/components/PressCard';
import { TYPE } from '../../src/constants/typography';

// ─── Themed styles ─────────────────────────────────────────────────────────────
// Colors now come from useTheme() (web-aligned, light/dark aware, tenant-brandable)
// instead of a hardcoded module-scope palette. makeStyles(colors) is a pure factory
// memoised per-component via useThemedStyles() so every colour re-skins with the theme.
function useThemedStyles() {
  const { colors } = useTheme();
  // Scale to device width so the dashboard fits any phone (iOS/Android).
  const { k } = useScreenScale();
  const styles = useMemo(() => makeStyles(colors, k), [colors, k]);
  return { colors, styles };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_PAD = 16;
const CONTENT_W = Math.min(SCREEN_W, 480);
const HERO_W = CONTENT_W - CARD_PAD * 2;

// ─── Utility ──────────────────────────────────────────────────────────────────
function fmt(v, sym = '') {
  const n = parseFloat(v);
  if (!n || isNaN(n)) return '—';
  if (n >= 100000) return `${sym}${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${sym}${(n / 1000).toFixed(1)}k`;
  return `${sym}${Math.round(n)}`;
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

// ─── Take-a-new-order box (desktop command-bar parity) ────────────────────────
function TakeOrderBox({ totalOrders, pendingOrders, avgOrderValue }) {
  const { symbol } = useCurrency();
  const tiles = [
    { l: "Today's orders", v: String(totalOrders ?? 0) },
    { l: 'Pending',        v: String(pendingOrders ?? 0) },
    { l: 'Avg ticket',     v: fmt(avgOrderValue, symbol) },
  ];
  return (
    <TouchableOpacity activeOpacity={0.92} onPress={() => router.push('/pos')}>
      <LinearGradient
        colors={['#3b82f6', '#2563eb']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: 18, padding: 18 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Take a new order</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 }}>
              Open the POS — split bill, modifiers, KOT routing, all in one place
            </Text>
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
            <Ionicons name="add" size={30} color="#fff" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 16, gap: 8 }}>
          {tiles.map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{s.v}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 1 }}>{s.l}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Hero Revenue Card ────────────────────────────────────────────────────────
function HeroRevenueCard({ revenue, totalOrders, avgOrderValue, revenueGrowth, hourlyRevenue }) {
  const { colors, styles } = useThemedStyles();
  const { symbol } = useCurrency();
  const displayRevenue = useCounter(revenue, 1400);
  const displayOrders = useCounter(totalOrders, 1000);
  const displayAvg = useCounter(Math.round(avgOrderValue), 1200);

  const isPositive = revenueGrowth >= 0;
  const isEmpty = !revenue && !totalOrders;

  return (
    <PressCard style={styles.heroCard}>
      {/* Eyebrow */}
      <Text style={styles.heroEyebrow}>TODAY'S REVENUE</Text>

      {/* Big revenue number + growth badge */}
      <View style={styles.heroRevenueRow}>
        <Text style={styles.heroRevenue}>
          {symbol}{displayRevenue.toLocaleString('en-IN')}
        </Text>
        {!isEmpty && (
          <View style={styles.growthBadge}>
            <Text style={styles.growthText}>
              {isPositive ? '+' : ''}{revenueGrowth.toFixed(1)}%
            </Text>
          </View>
        )}
      </View>

      {/* Hourly bar mini-chart, or an honest note before the first sale */}
      {isEmpty ? (
        <Text style={styles.heroEmptyNote}>No sales yet today — take an order and it shows up here live.</Text>
      ) : (
        <HourlyMiniChart data={hourlyRevenue} />
      )}

      {/* Stats row */}
      <View style={styles.heroStats}>
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatValue}>{displayOrders}</Text>
          <Text style={styles.heroStatLabel}>Orders</Text>
        </View>
        <View style={styles.heroStatDivider} />
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatValue}>{symbol}{displayAvg.toLocaleString('en-IN')}</Text>
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
  const { symbol } = useCurrency();
  const [activeIdx, setActiveIdx] = useState(0);

  const pills = [
    { label: 'Orders',    value: String(totalOrders) },
    { label: 'Pending',   value: String(pendingOrders) },
    { label: 'Avg Value', value: fmt(avgOrderValue, symbol) },
    { label: 'Covers',    value: String(completedOrders) },
  ];

  return (
    <ScrollView
      horizontal
        style={{ flexGrow: 0, flexShrink: 0 }}
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

// ─── Revenue Bar Chart (hourly, horizontally sliding) ─────────────────────────
// Business hours start at 10am; each array index = one hour after that.
function hourLabel(i, startHour = 10) {
  const h = (startHour + i) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${suffix}`;
}

function RevenueBarChart({ data = [] }) {
  const { colors } = useThemedStyles();
  const { symbol } = useCurrency();
  const bars = Array.isArray(data) ? data : [];
  const n = Math.max(bars.length, 1);
  const max = Math.max(...bars, 1);
  const CHART_H = 100;
  const BAR_SLOT = 46;                       // fixed slot/hour → the chart slides
  const barW = 18;
  const chartW = Math.max(HERO_W, n * BAR_SLOT);
  const [activeIdx, setActiveIdx] = useState(bars.length - 1);

  return (
    <View>
      {/* Horizontal slide through every hour of the day */}
      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false}>
        <Svg width={chartW} height={CHART_H + 28}>
          {[0.25, 0.5, 0.75, 1].map((pct, i) => (
            <Rect key={i} x={0} y={CHART_H - CHART_H * pct} width={chartW} height={1} fill={colors.borderLight} />
          ))}
          {bars.map((v, i) => {
            const bh = Math.max((v / max) * CHART_H, 4);
            const x = i * BAR_SLOT + (BAR_SLOT - barW) / 2;
            const isActive = i === activeIdx;
            return (
              <G key={i}>
                <Rect
                  x={x} y={CHART_H - bh} width={barW} height={bh} rx={6}
                  fill={isActive ? colors.text : colors.accent}
                  opacity={isActive ? 1 : 0.7}
                  onPress={() => setActiveIdx(i)}
                />
                <SvgText
                  x={x + barW / 2} y={CHART_H + 18} textAnchor="middle" fontSize={9}
                  fill={isActive ? colors.text : colors.textMuted}
                  fontWeight={isActive ? '700' : '400'}
                >
                  {hourLabel(i)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </ScrollView>

      {activeIdx !== null && bars[activeIdx] !== undefined && (
        <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.text }}>
          {hourLabel(activeIdx)} · {fmt(bars[activeIdx], symbol)}
        </Text>
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
  const { symbol } = useCurrency();
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
          {fmt(item.revenue ?? item.total_revenue ?? item.amount, symbol)}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Quick Actions grid ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'New Order',   icon: '🛒',  route: '/pos' },
  { label: 'Collect Pay', icon: '💳',  route: '/tables' },
  { label: 'Tables',      icon: '🍽️', route: '/tables' },
  { label: 'Kitchen',     icon: '🧑‍🍳', route: '/kot' },
  { label: 'Inventory',   icon: '📦',  route: '/inventory' },
  { label: 'View Orders', icon: '📋',  route: '/orders' },
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

function recentTimeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Recent Orders (desktop-parity) ───────────────────────────────────────────
function RecentOrders() {
  const { colors, styles } = useThemedStyles();
  const { symbol } = useCurrency();
  const { data: orders } = useOrders({ limit: 6 });
  const rows = (Array.isArray(orders) ? orders : []).slice(0, 6);
  if (rows.length === 0) return null;

  const tone = (s) => {
    const v = String(s || '').toLowerCase();
    if (v === 'ready') return colors.success;
    if (['pending', 'created', 'preparing', 'confirmed'].includes(v)) return colors.warning;
    if (['paid', 'billed', 'served', 'completed', 'delivered'].includes(v)) return colors.textMuted;
    return colors.accent;
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="Recent Orders" />
      <View style={styles.card}>
        {rows.map((o, i) => (
          <TouchableOpacity
            key={o.id ?? i}
            activeOpacity={0.7}
            onPress={() => router.push('/orders')}
            style={{
              flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                #{o.order_number ?? '—'}{o.table_number ? `  ·  T-${o.table_number}` : ''}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                {recentTimeAgo(o.created_at)}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginRight: 10 }}>
              {fmt(o.grand_total ?? o.total_amount, symbol)}
            </Text>
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: tone(o.status) + '22' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: tone(o.status), textTransform: 'capitalize' }}>
                {String(o.status || '').toLowerCase() || '—'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
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
        {isError ? (
          /* ── Error state — never fabricate revenue ─────────────────────── */
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>Couldn't load dashboard</Text>
            <Text style={styles.emptySubtitle}>
              We couldn't reach the server. Pull to refresh or try again.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* 0. Take a new order — big blue command box, always up top */}
            <View style={styles.section}>
              <TakeOrderBox
                totalOrders={d.totalOrders}
                pendingOrders={d.pendingOrders}
                avgOrderValue={d.avgOrderValue}
              />
            </View>

            {/* 1. Hero Revenue Card — the headline KPI (zeros before the first sale) */}
            <View style={styles.section}>
              <HeroRevenueCard
                revenue={d.todayRevenue}
                totalOrders={d.totalOrders}
                avgOrderValue={d.avgOrderValue}
                revenueGrowth={d.revenueGrowth}
                hourlyRevenue={d.hourlyRevenue}
              />
            </View>

            {/* 2. Stats Row — KPI pills, always visible */}
            <View style={{ marginTop: 16 }}>
              <StatsRow
                totalOrders={d.totalOrders}
                pendingOrders={d.pendingOrders}
                avgOrderValue={d.avgOrderValue}
                completedOrders={d.completedOrders}
              />
            </View>

            {/* Live data-viz — only once there's real activity to show */}
            {hasData && (
              <>
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
                {d.topItems.length > 0 && (
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
                )}
              </>
            )}

            {/* 6. Quick Actions 2×2 grid — always available */}
            <View style={styles.section}>
              <SectionHeader title="Quick Actions" />
              <View style={styles.quickActionsGrid}>
                {[0, 2, 4].map((start) => (
                  <View key={start} style={styles.quickActionsRow}>
                    {QUICK_ACTIONS.slice(start, start + 2).map((a, i) => (
                      <QuickAction key={i} {...a} onPress={() => a.route && router.push(a.route)} />
                    ))}
                  </View>
                ))}
              </View>
            </View>

            {/* 7. Recent Orders — desktop parity */}
            <RecentOrders />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// makeStyles(colors) — pure factory built from web-aligned theme colours.
const makeStyles = (colors, k = 1) => {
  const s = (n) => Math.round(n * k);
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Header
  header: {
    paddingHorizontal: CARD_PAD,
    paddingBottom: s(14),
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
    fontSize: s(18),
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerDate: {
    fontSize: s(12),
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: s(2),
  },

  // Bell
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: s(22),
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
    borderRadius: s(8),
    minWidth: 16,
    height: 16,
    paddingHorizontal: s(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    fontSize: s(9),
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Scroll
  scrollContent: {
    paddingTop: s(8),
  },

  // Empty / error state
  emptyWrap: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(32),
    paddingTop: s(80),
  },
  emptyIcon: {
    fontSize: s(44),
    marginBottom: s(14),
  },
  emptyTitle: {
    fontSize: s(18),
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: s(13),
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: s(6),
    lineHeight: s(19),
  },
  retryBtn: {
    marginTop: s(18),
    backgroundColor: colors.accent,
    borderRadius: s(10),
    paddingHorizontal: s(22),
    paddingVertical: s(11),
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: s(14),
    fontWeight: '700',
  },

  // Hero empty note (before the first sale of the day)
  heroEmptyNote: {
    fontSize: s(13),
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: s(14),
    marginBottom: s(14),
    lineHeight: s(19),
  },

  // Take-order CTA (shown when there's no activity yet)
  takeOrderCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(14),
    backgroundColor: colors.accent,
    borderRadius: s(16),
    padding: s(16),
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  takeOrderIcon: {
    width: 44,
    height: 44,
    borderRadius: s(12),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeOrderTitle: {
    fontSize: s(16),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  takeOrderSub: {
    fontSize: s(12.5),
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    marginTop: s(2),
    lineHeight: s(17),
  },

  // Layout
  section: {
    paddingHorizontal: CARD_PAD,
    marginTop: s(24),
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: s(16),
    padding: s(16),
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
    marginBottom: s(12),
  },
  sectionTitle: {
    fontSize: s(17),
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: s(11),
    color: colors.textMuted,
    fontWeight: '500',
  },

  // Hero Card
  heroCard: {
    width: HERO_W,
    borderRadius: s(16),
    padding: s(20),
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
    fontSize: s(10),
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: s(6),
  },
  heroRevenueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: s(12),
    flexWrap: 'wrap',
  },
  heroRevenue: {
    fontSize: s(36),
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1.2,
    lineHeight: s(44),
  },
  growthBadge: {
    borderRadius: s(20),
    paddingHorizontal: s(10),
    paddingVertical: s(4),
    backgroundColor: colors.success + '22',
    marginBottom: s(4),
  },
  growthText: {
    fontSize: s(12),
    fontWeight: '700',
    color: colors.success,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: s(14),
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: s(16),
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  heroStatLabel: {
    fontSize: s(10),
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: s(2),
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
    gap: s(8),
  },
  statPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: s(14),
    paddingVertical: s(12),
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
    fontSize: s(9),
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: s(4),
  },
  statPillLabelActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  statPillValue: {
    fontSize: s(15),
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
    gap: s(20),
  },
  donutLegend: {
    flex: 1,
    gap: s(10),
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: s(4),
  },
  legendLabel: {
    flex: 1,
    fontSize: s(13),
    fontWeight: '500',
    color: colors.textSecondary,
  },
  legendCount: {
    fontSize: s(14),
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // Bar chart tooltip
  barTooltip: {
    position: 'absolute',
    top: -28,
    backgroundColor: colors.card,
    borderRadius: s(8),
    paddingHorizontal: s(8),
    paddingVertical: s(4),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tooltipText: {
    fontSize: s(11),
    fontWeight: '700',
    color: colors.text,
  },

  // Top dishes
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: s(10),
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: s(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: s(11),
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dishName: {
    fontSize: s(14),
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.1,
  },
  dishCount: {
    fontSize: s(11),
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: s(1),
  },
  dishRevenue: {
    fontSize: s(15),
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: -0.3,
  },

  // Quick actions
  quickActionsGrid: {
    gap: s(10),
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: s(10),
  },
  quickAction: {
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: s(16),
    alignItems: 'center',
    gap: s(6),
    minHeight: 80,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  quickActionIcon: {
    fontSize: s(22),
  },
  quickActionLabel: {
    fontSize: s(12),
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
    padding: s(24),
    paddingBottom: s(40),
  },
  profileSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: s(2),
    alignSelf: 'center',
    marginBottom: s(20),
  },
  profileName: {
    fontSize: s(18),
    fontWeight: '700',
    color: colors.text,
    marginBottom: s(4),
  },
  profileEmail: {
    fontSize: s(14),
    color: colors.textSecondary,
    marginBottom: s(20),
  },
  profileSeparator: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: s(20),
  },
  signOutBtn: {
    backgroundColor: colors.text,
    borderRadius: s(10),
    paddingVertical: s(14),
    alignItems: 'center',
    marginBottom: s(12),
  },
  signOutBtnText: {
    color: colors.card,
    fontSize: s(15),
    fontWeight: '700',
  },
  profileCloseBtn: {
    borderRadius: s(10),
    paddingVertical: s(14),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileCloseBtnText: {
    color: colors.text,
    fontSize: s(15),
    fontWeight: '600',
  },

  // Notifications modal
  notifSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: s(16),
    paddingBottom: s(0),
    paddingTop: s(12),
  },
  notifHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: s(2),
    alignSelf: 'center',
    marginBottom: s(14),
  },
  notifHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: s(12),
  },
  notifTitle: {
    fontSize: s(17),
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  notifMarkAll: {
    fontSize: s(12),
    fontWeight: '600',
    color: colors.accent,
  },
  notifEmpty: {
    paddingVertical: s(56),
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifEmptyIcon: {
    fontSize: s(40),
    marginBottom: s(12),
    opacity: 0.5,
  },
  notifEmptyText: {
    fontSize: s(15),
    fontWeight: '700',
    color: colors.text,
  },
  notifEmptySub: {
    fontSize: s(13),
    color: colors.textMuted,
    marginTop: s(4),
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: s(12),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingLeft: s(0),
    position: 'relative',
  },
  notifRowUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: s(10),
  },
  notifBlueDot: {
    display: 'none',
  },
  notifIcon: {
    fontSize: s(24),
    lineHeight: s(30),
  },
  notifItemTitle: {
    fontSize: s(14),
    fontWeight: '700',
    color: colors.text,
    marginBottom: s(2),
  },
  notifItemBody: {
    fontSize: s(13),
    color: colors.textMuted,
    lineHeight: s(18),
  },
  notifTime: {
    fontSize: s(11),
    color: colors.textMuted,
    marginLeft: s(8),
    alignSelf: 'flex-start',
    paddingTop: s(2),
  },
});
};
