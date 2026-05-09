import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F7F7',
  surface: '#FFFFFF',
  border: '#EAEAEA',
  text1: '#000000',
  text2: '#444444',
  text3: '#888888',
  gold: '#F5A623',
  indigo: '#0070F3',
  success: '#00B341',
  error: '#EE0000',
  amber: '#F5A623',
  amberBg: '#FFF8EB',
  blueBg: '#EBF4FF',
  greenBg: '#EDFBF3',
  redBg: '#FFF0F0',
};

const FILTERS = ['ALL', 'PENDING', 'PREPARING', 'READY'];

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INITIAL_MOCK = [
  {
    id: 'k1',
    order_number: 'ORD-001',
    table_number: '3',
    created_at: new Date(Date.now() - 8 * 60000).toISOString(),
    status: 'pending',
    items: [
      { id: 'i1', name: 'Paneer Butter Masala', quantity: 2, item_status: 'waiting' },
      { id: 'i2', name: 'Garlic Naan', quantity: 4, item_status: 'waiting' },
      { id: 'i3', name: 'Dal Makhani', quantity: 1, item_status: 'waiting' },
    ],
  },
  {
    id: 'k2',
    order_number: 'ORD-002',
    table_number: '7',
    created_at: new Date(Date.now() - 23 * 60000).toISOString(),
    status: 'preparing',
    items: [
      { id: 'i4', name: 'Chicken Tikka Masala', quantity: 1, item_status: 'cooking' },
      { id: 'i5', name: 'Jeera Rice', quantity: 2, item_status: 'done' },
      { id: 'i6', name: 'Raita', quantity: 1, item_status: 'done' },
    ],
  },
  {
    id: 'k3',
    order_number: 'ORD-003',
    table_number: '2',
    created_at: new Date(Date.now() - 14 * 60000).toISOString(),
    status: 'preparing',
    items: [
      { id: 'i7', name: 'Masala Dosa', quantity: 2, item_status: 'cooking' },
      { id: 'i8', name: 'Sambar', quantity: 2, item_status: 'cooking' },
      { id: 'i9', name: 'Filter Coffee', quantity: 2, item_status: 'waiting' },
    ],
  },
  {
    id: 'k4',
    order_number: 'ORD-004',
    table_number: '5',
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
    status: 'ready',
    items: [
      { id: 'i10', name: 'Biryani (Veg)', quantity: 1, item_status: 'done' },
      { id: 'i11', name: 'Butter Naan', quantity: 2, item_status: 'done' },
    ],
  },
  {
    id: 'k5',
    order_number: 'ORD-005',
    table_number: '9',
    created_at: new Date(Date.now() - 31 * 60000).toISOString(),
    status: 'pending',
    items: [
      { id: 'i12', name: 'Chole Bhature', quantity: 2, item_status: 'waiting' },
      { id: 'i13', name: 'Lassi (Sweet)', quantity: 2, item_status: 'waiting' },
      { id: 'i14', name: 'Gulab Jamun', quantity: 4, item_status: 'waiting' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getElapsedMin(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatClock(date) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function elapsedColor(min) {
  if (min <= 10) return C.success;
  if (min <= 20) return C.amber;
  return C.error;
}

function statusConfig(status) {
  switch (status) {
    case 'pending':    return { label: 'PENDING',    color: C.amber,   bg: C.amberBg };
    case 'preparing':  return { label: 'PREPARING',  color: C.indigo,  bg: C.blueBg  };
    case 'ready':      return { label: 'READY',      color: C.success, bg: C.greenBg };
    default:           return { label: status.toUpperCase(), color: C.text3, bg: '#F5F5F5' };
  }
}

function itemStatusDot(s) {
  if (s === 'done')    return { color: C.success, label: '●' };
  if (s === 'cooking') return { color: C.indigo,  label: '●' };
  return { color: C.text3, label: '●' };
}

function ctaLabel(status) {
  if (status === 'pending')   return 'Start Cooking';
  if (status === 'preparing') return 'Mark Ready';
  if (status === 'ready')     return 'Serve';
  return null;
}

function ctaColor(status) {
  if (status === 'pending')   return C.indigo;
  if (status === 'preparing') return C.success;
  if (status === 'ready')     return '#7C3AED';
  return C.text3;
}

function nextStatus(status) {
  if (status === 'pending')   return 'preparing';
  if (status === 'preparing') return 'ready';
  if (status === 'ready')     return 'served';
  return status;
}

// ─── PulseCard ────────────────────────────────────────────────────────────────
function PulseCard({ isNew, children, style }) {
  const pulse = useSharedValue(isNew && Platform.OS !== 'web' ? 0 : 1);

  useEffect(() => {
    if (isNew && Platform.OS !== 'web') {
      pulse.value = withSequence(
        withTiming(1, { duration: 300 }),
        withRepeat(
          withSequence(withTiming(0.92, { duration: 400 }), withTiming(1, { duration: 400 })),
          3,
          false
        )
      );
    }
  }, [isNew]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.96, 1], Extrapolation.CLAMP) }],
  }));

  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

// ─── OrderCard ────────────────────────────────────────────────────────────────
function OrderCard({ order, onStatusChange, isNew }) {
  const elapsed = getElapsedMin(order.created_at);
  const isRush = elapsed > 20;
  const sc = statusConfig(order.status);
  const cta = ctaLabel(order.status);
  const ctaBg = ctaColor(order.status);

  const buttonScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));

  function handleCtaPress() {
    buttonScale.value = withSequence(
      withSpring(0.94, { damping: 20, stiffness: 300 }),
      withSpring(1, { damping: 18, stiffness: 250 })
    );
    onStatusChange(order.id, nextStatus(order.status));
  }

  return (
    <PulseCard isNew={isNew} style={styles.orderCard}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.orderNum}>{order.order_number}</Text>
          <View style={styles.tableChip}>
            <Ionicons name="grid-outline" size={11} color={C.text3} />
            <Text style={styles.tableChipText}>T-{order.table_number}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          {isRush && (
            <View style={styles.rushBadge}>
              <Text style={styles.rushText}>🔴 RUSH</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>
      </View>

      {/* Elapsed */}
      <Text style={[styles.elapsed, { color: elapsedColor(elapsed) }]}>
        <Ionicons name="time-outline" size={12} color={elapsedColor(elapsed)} /> {elapsed} min ago
      </Text>

      {/* Items */}
      <View style={styles.itemsList}>
        {order.items.map((item) => {
          const dot = itemStatusDot(item.item_status);
          return (
            <View key={item.id} style={styles.itemRow}>
              <Text style={[styles.itemDot, { color: dot.color }]}>{dot.label}</Text>
              <Text style={styles.itemQty}>{item.quantity}x</Text>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={[styles.itemStatusLabel, { color: dot.color }]}>{item.item_status}</Text>
            </View>
          );
        })}
      </View>

      {/* CTA */}
      {cta && (
        <Animated.View style={btnStyle}>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: ctaBg }]}
            onPress={handleCtaPress}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaButtonText}>{cta}</Text>
            <Ionicons
              name={order.status === 'ready' ? 'checkmark-done-outline' : 'arrow-forward-outline'}
              size={16}
              color="#FFF"
            />
          </TouchableOpacity>
        </Animated.View>
      )}
    </PulseCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function KotScreen() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState(INITIAL_MOCK);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [clock, setClock] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const [, forceUpdate] = useState(0);
  const mountedRef = useRef(true);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => {
      if (mountedRef.current) setClock(new Date());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Elapsed color re-render every 30s
  useEffect(() => {
    const t = setInterval(() => {
      if (mountedRef.current) forceUpdate((n) => n + 1);
    }, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1200);
  }, []);

  const handleStatusChange = useCallback((id, newStatus) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updatedItems = o.items.map((item) => ({
          ...item,
          item_status:
            newStatus === 'preparing' ? 'cooking' :
            newStatus === 'ready'     ? 'done'    :
            item.item_status,
        }));
        return { ...o, status: newStatus, items: updatedItems };
      })
    );
  }, []);

  const filtered = orders.filter((o) => {
    if (activeFilter === 'ALL') return o.status !== 'served';
    return o.status === activeFilter.toLowerCase();
  });

  const counts = {
    ALL:      orders.filter((o) => o.status !== 'served').length,
    PENDING:  orders.filter((o) => o.status === 'pending').length,
    PREPARING:orders.filter((o) => o.status === 'preparing').length,
    READY:    orders.filter((o) => o.status === 'ready').length,
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Kitchen</Text>
          <Text style={styles.headerSub}>KOT Display</Text>
        </View>
        <View style={styles.clockBox}>
          <Ionicons name="time-outline" size={16} color={C.indigo} />
          <Text style={styles.clockText}>{formatClock(clock)}</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = activeFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => setActiveFilter(f)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                {f}
              </Text>
              {counts[f] > 0 && (
                <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
                  <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>
                    {counts[f]}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Order list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.indigo} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="restaurant-outline"
            title="No orders"
            subtitle={`No ${activeFilter.toLowerCase()} orders right now`}
          />
        ) : (
          filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              isNew={newOrderIds.has(order.id)}
            />
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text1,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: C.text3,
    marginTop: 1,
  },
  clockBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  clockText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.indigo,
    fontVariant: ['tabular-nums'],
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterPillActive: {
    backgroundColor: C.indigo,
    borderColor: C.indigo,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
  },
  filterPillTextActive: {
    color: '#FFF',
  },
  filterBadge: {
    backgroundColor: C.border,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text2,
  },
  filterBadgeTextActive: {
    color: '#FFF',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  orderCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderNum: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text1,
  },
  tableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0F0F0',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tableChipText: {
    fontSize: 12,
    color: C.text3,
    fontWeight: '600',
  },
  rushBadge: {
    backgroundColor: C.redBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.error,
  },
  rushText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.error,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  elapsed: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  itemsList: {
    gap: 6,
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemDot: {
    fontSize: 10,
    width: 14,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text1,
    width: 28,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: C.text2,
  },
  itemStatusLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});
