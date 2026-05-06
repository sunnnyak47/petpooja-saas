/**
 * Dashboard — MS-RM Owner
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
} from 'react-native';
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
import { useDashboard } from '../../src/hooks/useApi';
import { Colors } from '../../src/constants/colors';
import SkeletonBox from '../../src/components/SkeletonBox';

// ─── Constants ────────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_PAD = 16;
const CONTENT_W = Math.min(SCREEN_W, 480); // cap for web at tablet width
const HERO_W = CONTENT_W - CARD_PAD * 2;

// ─── Mock fallback data ───────────────────────────────────────────────────────
const MOCK = {
  todayRevenue: 124500,
  totalOrders: 47,
  pendingOrders: 8,
  preparingOrders: 12,
  readyOrders: 5,
  completedOrders: 22,
  avgOrderValue: 2648,
  topItems: [
    { name: 'Butter Chicken', count: 18, revenue: 32400 },
    { name: 'Dal Makhani', count: 15, revenue: 18750 },
    { name: 'Paneer Tikka', count: 12, revenue: 21600 },
  ],
  hourlyRevenue: [8000, 12000, 18000, 22000, 19000, 24000, 21500],
  revenueGrowth: 12.4,
};

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
      // Ease-out cubic
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

// ─── Pressable scale card (replaces Gesture.Pan tilt) ────────────────────────
function PressCard({ children, style, onPress }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.975, { damping: 20, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 250 });
      }}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

// ─── Hero Revenue Card ────────────────────────────────────────────────────────
function HeroRevenueCard({ revenue, totalOrders, avgOrderValue, revenueGrowth, hourlyRevenue }) {
  const displayRevenue = useCounter(revenue, 1400);
  const displayOrders = useCounter(totalOrders, 1000);
  const displayAvg = useCounter(Math.round(avgOrderValue), 1200);

  const isPositive = revenueGrowth >= 0;
  const growthColor = isPositive ? Colors.success : Colors.error;

  return (
    <PressCard style={styles.heroCard}>
      {/* Base gradient */}
      <LinearGradient
        colors={['#1C2E50', '#0D1F3C', '#080F1E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Gold shimmer overlay */}
      <LinearGradient
        colors={[Colors.gold + '08', 'transparent', Colors.gold + '05']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
      />

      {/* Subtle grid lines */}
      <View style={styles.heroGrid} pointerEvents="none">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.heroGridLine} />
        ))}
      </View>

      {/* Eyebrow */}
      <Text style={styles.heroEyebrow}>TODAY'S REVENUE</Text>

      {/* Big revenue number */}
      <View style={styles.heroRevenueRow}>
        <Text style={styles.heroRevenue}>
          ₹{displayRevenue.toLocaleString('en-IN')}
        </Text>
        <View style={[styles.growthBadge, { backgroundColor: growthColor + '22', borderColor: growthColor + '44' }]}>
          <Text style={[styles.growthText, { color: growthColor }]}>
            {isPositive ? '+' : ''}{revenueGrowth.toFixed(1)}% vs yesterday
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
          <Text style={[styles.heroStatValue, { color: Colors.success }]}>
            {isPositive ? '+' : ''}{revenueGrowth.toFixed(1)}%
          </Text>
          <Text style={styles.heroStatLabel}>Growth</Text>
        </View>
      </View>

      {/* Glassmorphism border highlights */}
      <View style={styles.glassBorderTop} />
      <View style={styles.glassBorderLeft} />
    </PressCard>
  );
}

// ─── Hourly Mini Bar Chart (inside hero card) ─────────────────────────────────
function HourlyMiniChart({ data = [] }) {
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
        <Defs>
          <SvgGrad id="heroBar" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.gold} stopOpacity="0.9" />
            <Stop offset="1" stopColor={Colors.goldDim} stopOpacity="0.3" />
          </SvgGrad>
          <SvgGrad id="heroBarDim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.gold} stopOpacity="0.35" />
            <Stop offset="1" stopColor={Colors.gold} stopOpacity="0.08" />
          </SvgGrad>
        </Defs>
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
                fill={isLast ? 'url(#heroBar)' : 'url(#heroBarDim)'}
              />
              <SvgText
                x={x + barW / 2}
                y={barH + 14}
                textAnchor="middle"
                fontSize={9}
                fill={isLast ? Colors.gold : Colors.text3}
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
  const pills = [
    { label: 'Orders', value: String(totalOrders), color: Colors.indigo },
    { label: 'Pending', value: String(pendingOrders), color: Colors.warning },
    { label: 'Avg Value', value: fmt(avgOrderValue), color: Colors.gold },
    { label: 'Covers', value: String(completedOrders), color: Colors.success },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.statsRowContent}
    >
      {pills.map((p, i) => (
        <StatPill key={i} {...p} />
      ))}
    </ScrollView>
  );
}

function StatPill({ label, value, color }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { scale.value = withSpring(0.94, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 18 }); }}
    >
      <Animated.View style={[styles.statPill, { borderColor: color + '35' }, animStyle]}>
        <LinearGradient
          colors={[color + '18', color + '06']}
          style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
        />
        <View style={[styles.statPillDot, { backgroundColor: color }]} />
        <View>
          <Text style={[styles.statPillLabel]}>{label}</Text>
          <Text style={[styles.statPillValue, { color }]}>{value}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Order Status Donut Ring ──────────────────────────────────────────────────
function OrderStatusRing({ pending, preparing, ready, completed }) {
  const total = pending + preparing + ready + completed || 1;

  const segments = [
    { label: 'Pending', count: pending, color: Colors.warning },
    { label: 'Preparing', count: preparing, color: Colors.indigo },
    { label: 'Ready', count: ready, color: Colors.success },
    { label: 'Done', count: completed, color: Colors.text3 },
  ];

  const SIZE = 140;
  const STROKE = 18;
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  // Build arc segments
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
      {/* Donut SVG */}
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          {/* Track */}
          <Circle
            cx={cx} cy={cy} r={r}
            stroke={Colors.surface2}
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Segments */}
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
        {/* Center label */}
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.text1 }}>{pending + preparing + ready}</Text>
          <Text style={{ fontSize: 10, color: Colors.text3, fontWeight: '600' }}>Active</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.donutLegend}>
        {segments.map((s, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
            <Text style={[styles.legendCount, { color: s.color }]}>{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Revenue Bar Chart (7 bars, hourly) ───────────────────────────────────────
function RevenueBarChart({ data = [] }) {
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
        <Defs>
          {data.slice(0, n).map((_, i) => (
            <SvgGrad key={i} id={`b${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0"
                stopColor={i === activeIdx ? Colors.gold : Colors.indigo}
                stopOpacity={i === activeIdx ? '1' : '0.6'}
              />
              <Stop
                offset="1"
                stopColor={i === activeIdx ? Colors.goldDim : Colors.indigoDim}
                stopOpacity="0.2"
              />
            </SvgGrad>
          ))}
        </Defs>

        {data.slice(0, n).map((v, i) => {
          const bh = Math.max((v / max) * CHART_H, 4);
          const x = i * gap + (gap - barW) / 2;
          const isActive = i === activeIdx;
          return (
            <G key={i}>
              {isActive && (
                <Rect
                  x={x + 2} y={CHART_H - bh + 4}
                  width={barW} height={bh}
                  rx={6} fill={Colors.gold} opacity="0.15"
                />
              )}
              <Rect
                x={x} y={CHART_H - bh}
                width={barW} height={bh}
                rx={6}
                fill={`url(#b${i})`}
                onPress={() => setActiveIdx(i)}
              />
              <SvgText
                x={x + barW / 2} y={CHART_H + 18}
                textAnchor="middle"
                fontSize={9}
                fill={isActive ? Colors.gold : Colors.text3}
                fontWeight={isActive ? '700' : '400'}
              >
                {HOURS[i] || ''}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Active bar value tooltip */}
      {activeIdx !== null && data[activeIdx] !== undefined && (
        <View
          style={[
            styles.barTooltip,
            {
              left: activeIdx * gap + (gap - barW) / 2 - 12,
            },
          ]}
        >
          <Text style={styles.tooltipText}>{fmt(data[activeIdx])}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Top Dishes List ──────────────────────────────────────────────────────────
const RANK_COLORS = [Colors.gold, Colors.text2, Colors.warning];

function DishItem({ item, index }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 18 }); }}
    >
      <Animated.View style={[styles.dishRow, animStyle]}>
        <View style={[styles.rankBadge, { borderColor: (RANK_COLORS[index] || Colors.text3) + '50' }]}>
          <Text style={[styles.rankText, { color: RANK_COLORS[index] || Colors.text3 }]}>
            #{index + 1}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.dishName}>{item.name}</Text>
          <Text style={styles.dishCount}>{item.count ?? item.total_quantity ?? item.order_count ?? 0} orders</Text>
        </View>
        <Text style={styles.dishRevenue}>{fmt(item.revenue ?? item.total_revenue ?? item.amount)}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Quick Actions grid ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'View Orders', icon: '📋', color: Colors.indigo },
  { label: 'Add Item', icon: '➕', color: Colors.success },
  { label: 'Print Report', icon: '🖨️', color: Colors.gold },
  { label: 'Live Monitor', icon: '📡', color: Colors.warning },
];

function QuickAction({ label, icon, color, onPress }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { scale.value = withSpring(0.93, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 16 }); }}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <Animated.View style={[styles.quickAction, { borderColor: color + '30' }, animStyle]}>
        <LinearGradient
          colors={[color + '18', color + '06']}
          style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
        />
        <Text style={styles.quickActionIcon}>{icon}</Text>
        <Text style={[styles.quickActionLabel, { color }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Skeleton loading layout ──────────────────────────────────────────────────
function DashboardSkeleton({ insets }) {
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
      {/* Header skeleton */}
      <SkeletonBox width="60%" height={22} borderRadius={6} />
      <SkeletonBox width="40%" height={14} borderRadius={4} style={{ marginTop: -6 }} />

      {/* Hero card */}
      <SkeletonBox width="100%" height={200} borderRadius={20} />

      {/* Stats pills row */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBox key={i} width={74} height={64} borderRadius={14} />
        ))}
      </View>

      {/* Order status ring */}
      <SkeletonBox width="100%" height={160} borderRadius={16} />

      {/* Bar chart */}
      <SkeletonBox width="100%" height={148} borderRadius={16} />

      {/* Top dishes */}
      {[0, 1, 2].map((i) => (
        <SkeletonBox key={i} width="100%" height={60} borderRadius={12} />
      ))}

      {/* Quick actions */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SkeletonBox width="48%" height={80} borderRadius={14} />
        <SkeletonBox width="48%" height={80} borderRadius={14} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SkeletonBox width="48%" height={80} borderRadius={14} />
        <SkeletonBox width="48%" height={80} borderRadius={14} />
      </View>
    </ScrollView>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────
function NotifBell({ count = 0 }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={0.8}
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
  const { user } = useAuth();

  const {
    data: rawData,
    isLoading,
    refetch,
    isRefetching,
  } = useDashboard();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Resolve data — use API response if valid, else MOCK
  const d = useMemo(() => {
    const api = rawData?.data || rawData || {};
    // If API returned meaningful data, prefer it; otherwise fall through to MOCK
    const hasData =
      api.todayRevenue != null ||
      api.today_revenue != null ||
      api.totalOrders != null ||
      api.total_orders != null;
    if (!hasData) return MOCK;
    return {
      todayRevenue: Number(api.todayRevenue ?? api.today_revenue ?? MOCK.todayRevenue),
      totalOrders: Number(api.totalOrders ?? api.total_orders ?? MOCK.totalOrders),
      pendingOrders: Number(api.pendingOrders ?? api.pending_orders ?? MOCK.pendingOrders),
      preparingOrders: Number(api.preparingOrders ?? api.preparing_orders ?? MOCK.preparingOrders),
      readyOrders: Number(api.readyOrders ?? api.ready_orders ?? MOCK.readyOrders),
      completedOrders: Number(api.completedOrders ?? api.completed_orders ?? MOCK.completedOrders),
      avgOrderValue: Number(api.avgOrderValue ?? api.avg_order_value ?? MOCK.avgOrderValue),
      topItems: api.topItems ?? api.top_items ?? MOCK.topItems,
      hourlyRevenue: api.hourlyRevenue ?? api.hourly_revenue ?? MOCK.hourlyRevenue,
      revenueGrowth: Number(api.revenueGrowth ?? api.revenue_growth ?? MOCK.revenueGrowth),
    };
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
      <LinearGradient
        colors={['#0D1F3C', '#0A1628', Colors.bg + 'F8']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerGreeting}>
              {getGreeting()}, Owner 👋
            </Text>
            <Text style={styles.headerDate}>{formatDate()}</Text>
          </View>
          <NotifBell count={notifCount} />
        </View>
      </LinearGradient>

      {/* ── Scrollable Body ────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
            progressViewOffset={insets.top + 60}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 96 },
        ]}
      >
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

        {/* 2. Stats Row — 4 pills */}
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
                <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />
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
                <QuickAction key={i} {...a} onPress={() => {}} />
              ))}
            </View>
            <View style={styles.quickActionsRow}>
              {QUICK_ACTIONS.slice(2, 4).map((a, i) => (
                <QuickAction key={i} {...a} onPress={() => {}} />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  // Header
  header: {
    paddingHorizontal: CARD_PAD,
    paddingBottom: 14,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerGreeting: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text1,
    letterSpacing: -0.3,
  },
  headerDate: {
    fontSize: 12,
    color: Colors.text3,
    fontWeight: '500',
    marginTop: 2,
  },

  // Notification bell
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: Colors.error,
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
    color: Colors.textWhite,
  },

  // Scroll
  scrollContent: {
    paddingTop: 8,
  },

  // Layout
  section: {
    paddingHorizontal: CARD_PAD,
    marginTop: 18,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
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
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text1,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.text3,
    fontWeight: '500',
  },

  // Hero Card
  heroCard: {
    width: HERO_W,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.goldDim + '50',
    overflow: 'hidden',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  heroGrid: {
    position: 'absolute',
    inset: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    opacity: 0.06,
  },
  heroGridLine: {
    width: 1,
    flex: 1,
    backgroundColor: Colors.gold,
    marginHorizontal: 20,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.text3,
    marginBottom: 6,
  },
  heroRevenueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroRevenue: {
    fontSize: 38,
    fontWeight: '900',
    color: Colors.gold,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  growthBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    marginBottom: 4,
  },
  growthText: {
    fontSize: 11,
    fontWeight: '700',
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text1,
    letterSpacing: -0.4,
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.text3,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  glassBorderTop: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 1,
  },
  glassBorderLeft: {
    position: 'absolute',
    top: 24,
    bottom: 24,
    left: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 1,
  },

  // Stats pills
  statsRowContent: {
    paddingHorizontal: CARD_PAD,
    gap: 8,
  },
  statPill: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    minWidth: 90,
    minHeight: 64,
  },
  statPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statPillLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 2,
  },
  statPillValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
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
    color: Colors.text2,
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
    backgroundColor: Colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gold,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
  },
  rankText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dishName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text1,
    letterSpacing: -0.1,
  },
  dishCount: {
    fontSize: 11,
    color: Colors.text3,
    fontWeight: '500',
    marginTop: 1,
  },
  dishRevenue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.gold,
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    minHeight: 80,
    justifyContent: 'center',
  },
  quickActionIcon: {
    fontSize: 22,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
});
