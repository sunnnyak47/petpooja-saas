import React, { useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions,
  TouchableOpacity, RefreshControl, ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle, Rect, Defs, LinearGradient as SvgGrad, Stop,
  Polyline, Path,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useDashboard, useOrders, useUpdateOrderStatus } from '../../src/hooks/useApi';
import { Colors } from '../../src/constants/colors';
import { T } from '../../src/constants/typography';

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;

// ─── Skeleton pulse ──────────────────────────────────────────────────────────
function Skeleton({ w, h, radius = 6, style }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius: radius, backgroundColor: Colors.surface2, opacity: anim }, style]}
    />
  );
}

// ─── Ring gauge ──────────────────────────────────────────────────────────────
function Ring({ pct = 0, size = 68, stroke = 5, color = Colors.indigo, value, label }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct, 1);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color + '20'} strokeWidth={stroke} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            rotation="-90" origin={`${size / 2},${size / 2}`} />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={{ ...T.numSm, color }}>{value}</Text>
        </View>
      </View>
      <Text style={[T.caption, { color: Colors.text3, marginTop: 4 }]}>{label}</Text>
    </View>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Spark({ data = [], color = '#fff', w = 72, h = 28 }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 2) - 1}`
  ).join(' ');
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgGrad id="sg" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="0.4" />
          <Stop offset="1" stopColor={color} stopOpacity="1" />
        </SvgGrad>
      </Defs>
      <Polyline points={pts} fill="none" stroke="url(#sg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Stat bar ─────────────────────────────────────────────────────────────────
function StatBar({ label, pct = 0, color }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.statRow}>
        <Text style={[T.label, { color: Colors.text2 }]}>{label}</Text>
        <Text style={[T.label, { color }]}>{Math.round(pct * 100)}%</Text>
      </View>
      <View style={styles.statTrack}>
        <LinearGradient
          colors={[color + 'aa', color]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.statFill, { width: `${Math.round(pct * 100)}%` }]}
        />
      </View>
    </View>
  );
}

// ─── Order row (memoized for FlashList performance) ───────────────────────────
const OrderRow = React.memo(function OrderRow({ item: o, onStatusChange }) {
  const statusColor = {
    pending: Colors.warning,
    preparing: Colors.indigo,
    ready: Colors.success,
    delivered: Colors.text3,
    cancelled: Colors.error,
  }[o.status?.toLowerCase()] || Colors.text3;

  return (
    <View style={styles.orderRow}>
      <View style={{ flex: 1 }}>
        <Text style={[T.body, { color: Colors.text1, fontWeight: '600' }]}>
          {o.table_number ? `Table ${o.table_number}` : o.order_type || 'Dine-in'}
        </Text>
        <Text style={[T.caption, { color: Colors.text3, marginTop: 2 }]}>
          #{String(o.id || o._id || '').slice(-6)} · {o.items_count ?? o.items?.length ?? '–'} items
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[T.numSm, { color: Colors.gold }]}>
          ₹{Number(o.total_amount || o.total || 0).toFixed(0)}
        </Text>
        <TouchableOpacity
          onPress={() => onStatusChange(o.id || o._id, o.status)}
          style={[styles.statusPill, { borderColor: statusColor + '40', backgroundColor: statusColor + '18' }]}
        >
          <Text style={[T.overline, { color: statusColor }]}>{o.status || 'pending'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── Dashboard skeleton ───────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
      <Skeleton w="60%" h={28} radius={8} style={{ marginBottom: 4 }} />
      <Skeleton w="40%" h={18} />
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <Skeleton w={CARD_W} h={90} radius={14} />
        <Skeleton w={CARD_W} h={90} radius={14} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Skeleton w={CARD_W} h={90} radius={14} />
        <Skeleton w={CARD_W} h={90} radius={14} />
      </View>
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} w="100%" h={60} radius={12} />
      ))}
    </ScrollView>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const { data: dashData, isLoading: dashLoading, refetch: refetchDash, isRefetching } = useDashboard();
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useOrders({ limit: 20, status: 'active' });
  const { mutate: updateStatus } = useUpdateOrderStatus();

  const onRefresh = useCallback(async () => {
    await Promise.all([refetchDash(), refetchOrders()]);
  }, [refetchDash, refetchOrders]);

  const handleStatusChange = useCallback((orderId, currentStatus) => {
    const next = { pending: 'preparing', preparing: 'ready', ready: 'delivered' }[currentStatus] || 'pending';
    updateStatus({ orderId, status: next });
  }, [updateStatus]);

  // Extract real data or use sensible defaults
  const d = dashData?.data || dashData || {};
  const revenue = Number(d.today_revenue || d.revenue || 0);
  const orders = Number(d.total_orders || d.orders_count || 0);
  const avgOrder = orders > 0 ? revenue / orders : 0;
  const activeOrders = Number(d.active_orders || d.pending_orders || 0);
  const revenueTarget = Number(d.revenue_target || 50000);
  const revenuePct = Math.min(revenue / revenueTarget, 1);
  const weekData = d.weekly_revenue || [4200, 5800, 3900, 7100, 6300, 8200, revenue || 5000];
  const orderList = ordersData?.data || ordersData?.orders || ordersData || [];

  if (dashLoading && !d.today_revenue) return <DashboardSkeleton />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* Header */}
      <LinearGradient
        colors={['#0D1F3C', '#0A1628']}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[T.overline, { color: Colors.gold, letterSpacing: 1.5 }]}>MS RM OWNER</Text>
            <Text style={[T.h1, { color: Colors.text1, marginTop: 2 }]}>
              {user?.name || user?.restaurant_name || 'Dashboard'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={styles.liveDot} />
            <Text style={[T.caption, { color: Colors.success }]}>LIVE</Text>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
              <Text style={[T.label, { color: Colors.text3 }]}>Exit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero stats */}
        <View style={styles.heroRow}>
          <View style={styles.heroCard}>
            <LinearGradient colors={['#1A2E50', '#0A1628']} style={StyleSheet.absoluteFill} borderRadius={14} />
            <Text style={[T.overline, { color: Colors.text3 }]}>TODAY REVENUE</Text>
            <Text style={[T.display, { color: Colors.gold, marginTop: 4 }]}>
              ₹{revenue >= 1000 ? `${(revenue / 1000).toFixed(1)}k` : revenue.toFixed(0)}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={[T.caption, { color: Colors.text3 }]}>{Math.round(revenuePct * 100)}% of target</Text>
              <Spark data={weekData} color={Colors.gold} w={64} h={22} />
            </View>
          </View>

          <View style={styles.heroCard}>
            <LinearGradient colors={['#1A2E50', '#0A1628']} style={StyleSheet.absoluteFill} borderRadius={14} />
            <Text style={[T.overline, { color: Colors.text3 }]}>ACTIVE ORDERS</Text>
            <Text style={[T.display, { color: Colors.indigo, marginTop: 4 }]}>{activeOrders}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={[T.caption, { color: Colors.text3 }]}>Avg ₹{avgOrder.toFixed(0)}</Text>
              <Spark data={weekData.map((v) => v * 0.1)} color={Colors.indigo} w={64} h={22} />
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Body */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.gold} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        {/* Ring gauges */}
        <View style={styles.section}>
          <Text style={[T.h2, { color: Colors.text1, marginBottom: 14 }]}>Performance</Text>
          <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-around' }]}>
            <Ring pct={revenuePct} value={`${Math.round(revenuePct * 100)}%`} label="Revenue" color={Colors.gold} />
            <Ring pct={Math.min(orders / 100, 1)} value={orders} label="Orders" color={Colors.indigo} />
            <Ring pct={Number(d.satisfaction || 0.88)} value={`${Math.round(Number(d.satisfaction || 0.88) * 100)}%`} label="Rating" color={Colors.success} />
            <Ring pct={Number(d.table_turn || 0.72)} value={`${Math.round(Number(d.table_turn || 0.72) * 100)}%`} label="Tables" color={Colors.warning} />
          </View>
        </View>

        {/* Weekly bar chart */}
        <View style={styles.section}>
          <Text style={[T.h2, { color: Colors.text1, marginBottom: 14 }]}>Weekly Revenue</Text>
          <View style={styles.card}>
            <WeeklyBars data={weekData} />
          </View>
        </View>

        {/* Stat bars */}
        <View style={styles.section}>
          <Text style={[T.h2, { color: Colors.text1, marginBottom: 14 }]}>Channel Mix</Text>
          <View style={styles.card}>
            <StatBar label="Dine-in" pct={Number(d.dine_in_pct || 0.55)} color={Colors.indigo} />
            <StatBar label="Takeaway" pct={Number(d.takeaway_pct || 0.28)} color={Colors.gold} />
            <StatBar label="Delivery" pct={Number(d.delivery_pct || 0.17)} color={Colors.success} />
          </View>
        </View>

        {/* Live orders */}
        <View style={styles.section}>
          <Text style={[T.h2, { color: Colors.text1, marginBottom: 14 }]}>
            Live Orders {activeOrders > 0 && <Text style={{ color: Colors.success }}>· {activeOrders} active</Text>}
          </Text>
          {ordersLoading ? (
            <View style={{ gap: 8 }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} w="100%" h={64} radius={12} />)}
            </View>
          ) : orderList.length === 0 ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <Text style={[T.body, { color: Colors.text3 }]}>No active orders right now</Text>
            </View>
          ) : (
            <FlashList
              data={orderList}
              estimatedItemSize={72}
              keyExtractor={(o) => String(o.id || o._id || Math.random())}
              renderItem={({ item }) => (
                <OrderRow item={item} onStatusChange={handleStatusChange} />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Weekly bar chart component ───────────────────────────────────────────────
function WeeklyBars({ data = [] }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const max = Math.max(...data, 1);
  const chartH = 80;
  const barW = 20;
  const gap = (width - 64) / 7;
  return (
    <Svg width={width - 64} height={chartH + 24}>
      <Defs>
        <SvgGrad id="bar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={Colors.indigo} />
          <Stop offset="1" stopColor={Colors.indigo + '30'} />
        </SvgGrad>
      </Defs>
      {data.slice(0, 7).map((v, i) => {
        const bh = Math.max((v / max) * chartH, 4);
        const x = i * gap + (gap - barW) / 2;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={chartH - bh} width={barW} height={bh} rx={5} fill="url(#bar)" />
            <Svg x={x} y={chartH + 6} width={barW} height={12}>
              <Rect width={barW} height={12} fill="transparent" />
            </Svg>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.surface2 },
  heroRow: { flexDirection: 'row', gap: 12 },
  heroCard: { flex: 1, borderRadius: 14, padding: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  section: { paddingHorizontal: 16, marginTop: 20 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  ringCenter: { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  statTrack: { height: 5, backgroundColor: Colors.surface2, borderRadius: 3, overflow: 'hidden' },
  statFill: { height: '100%', borderRadius: 3 },
  orderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  separator: { height: 8 },
});
