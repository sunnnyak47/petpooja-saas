import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import SkeletonBox from '../../src/components/SkeletonBox';
import { useScreenScale } from '../../src/lib/responsive';
import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { kotStatus, chartColors } from '../../src/constants/theme';
import { useKotList, useBumpKot, useMarkItemReady } from '../../src/hooks/useKot';

const FILTERS = ['ALL', 'PENDING', 'PREPARING', 'READY'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Turn a #rgb / #rrggbb into an rgba() string at the given alpha.
function withAlpha(hex, a) {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function getElapsedMin(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatClock(date) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function elapsedColor(min, colors) {
  if (min <= 10) return colors.success;
  if (min <= 20) return colors.warning;
  return colors.error;
}

function statusConfig(status, colors) {
  const base = kotStatus[status];
  if (base) return { label: status.toUpperCase(), color: base, bg: withAlpha(base, 0.15) };
  return { label: String(status ?? '').toUpperCase(), color: colors.textMuted, bg: withAlpha(colors.textMuted, 0.15) };
}

function itemStatusDot(s, colors) {
  if (s === 'done')    return { color: colors.success, label: '●' };
  if (s === 'cooking') return { color: kotStatus.preparing, label: '●' };
  return { color: colors.textMuted, label: '●' };
}

function ctaLabel(status) {
  if (status === 'pending')   return 'Start Cooking';
  if (status === 'preparing') return 'Mark Ready';
  if (status === 'ready')     return 'Serve';
  return null;
}

function ctaColor(status, colors) {
  if (status === 'pending')   return colors.accent;
  if (status === 'preparing') return colors.success;
  if (status === 'ready')     return chartColors[4]; // violet
  return colors.textMuted;
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
function OrderCard({ order, onStatusChange, onItemPress, isNew, colors, styles }) {
  const elapsed = getElapsedMin(order.created_at);
  const isRush = elapsed > 20;
  const sc = statusConfig(order.status, colors);
  const cta = ctaLabel(order.status);
  const ctaBg = ctaColor(order.status, colors);
  const tableLabel = order.table_number
    ? `T-${order.table_number}`
    : (order.order_type ? String(order.order_type).replace(/_/g, ' ') : '—');

  const buttonScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));

  function handleCtaPress() {
    buttonScale.value = withSequence(
      withSpring(0.94, { damping: 20, stiffness: 300 }),
      withSpring(1, { damping: 18, stiffness: 250 })
    );
    onStatusChange(order, nextStatus(order.status));
  }

  return (
    <PulseCard isNew={isNew} style={styles.orderCard}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.orderNum}>{order.order_number}</Text>
          <View style={styles.tableChip}>
            <Ionicons name="grid-outline" size={11} color={colors.textMuted} />
            <Text style={styles.tableChipText}>{tableLabel}</Text>
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
      <Text style={[styles.elapsed, { color: elapsedColor(elapsed, colors) }]}>
        <Ionicons name="time-outline" size={12} color={elapsedColor(elapsed, colors)} /> {elapsed} min ago
      </Text>

      {/* Items */}
      <View style={styles.itemsList}>
        {order.items.map((item) => {
          const dot = itemStatusDot(item.item_status, colors);
          const done = item.item_status === 'done';
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.itemRow}
              activeOpacity={done ? 1 : 0.6}
              disabled={done}
              onPress={() => onItemPress(order, item)}
            >
              <Text style={[styles.itemDot, { color: dot.color }]}>{dot.label}</Text>
              <Text style={styles.itemQty}>{item.quantity}x</Text>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={[styles.itemStatusLabel, { color: dot.color }]}>{item.item_status}</Text>
            </TouchableOpacity>
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

// ─── Skeleton loading card ──────────────────────────────────────────────────────
function SkeletonCard({ colors, styles }) {
  const sk = { backgroundColor: colors.border };
  return (
    <View style={styles.orderCard}>
      <View style={styles.cardHeader}>
        <SkeletonBox width={90} height={18} borderRadius={6} style={sk} />
        <SkeletonBox width={64} height={18} borderRadius={999} style={sk} />
      </View>
      <SkeletonBox width={80} height={12} borderRadius={6} style={[sk, { marginTop: 8, marginBottom: 14 }]} />
      <SkeletonBox width="100%" height={14} borderRadius={6} style={[sk, { marginBottom: 8 }]} />
      <SkeletonBox width="80%" height={14} borderRadius={6} style={[sk, { marginBottom: 14 }]} />
      <SkeletonBox width="100%" height={42} borderRadius={12} style={sk} />
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function KotScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { outletId } = useOutlet();
  // Scale everything to the device width so it looks right on any phone (iOS/Android).
  const { k, s } = useScreenScale();
  const styles = useMemo(() => makeStyles(colors, k), [colors, k]);

  const { data, isError, error, refetch } = useKotList({ outlet_id: outletId });
  const bump = useBumpKot();
  const markItemReady = useMarkItemReady();

  const orders = data ?? null; // null → still loading (no data, no error yet)

  const [activeFilter, setActiveFilter] = useState('ALL');
  const [clock, setClock] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const [, forceUpdate] = useState(0);
  const mountedRef = useRef(true);
  const prevIdsRef = useRef(null);

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

  // Pulse newly-arrived tickets. Diff against the previous set of KOT ids; on the
  // first load every ticket flashes in, then only genuinely new ones do.
  const idSig = (orders ?? []).map((o) => o.id).join(',');
  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.map((o) => o.id));
    if (prevIdsRef.current === null) {
      prevIdsRef.current = ids;
      setNewOrderIds(ids);
    } else {
      const fresh = new Set();
      ids.forEach((id) => { if (!prevIdsRef.current.has(id)) fresh.add(id); });
      prevIdsRef.current = ids;
      if (fresh.size) setNewOrderIds(fresh);
    }
    const t = setTimeout(() => { if (mountedRef.current) setNewOrderIds(new Set()); }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSig]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { if (mountedRef.current) setRefreshing(false); }
  }, [refetch]);

  // Ticket-level bump (Start Cooking → Mark Ready → Serve), via PUT /kots/:id/status.
  const handleStatusChange = useCallback((order, newStatus) => {
    bump.mutate({ kotId: order.id, status: newStatus, outlet_id: outletId, order_id: order.order_id });
  }, [bump, outletId]);

  // Per-item tap → mark that item ready (PUT /kots/:kotId/items/:itemId/ready).
  const handleItemPress = useCallback((order, item) => {
    if (item.item_status === 'done') return;
    markItemReady.mutate({ kotId: order.id, itemId: item.kot_item_id, outlet_id: outletId });
  }, [markItemReady, outletId]);

  const list = orders ?? [];
  const filtered = list.filter((o) => {
    if (activeFilter === 'ALL') return o.status !== 'served' && o.status !== 'completed';
    return o.status === activeFilter.toLowerCase();
  });

  const counts = {
    ALL:      list.filter((o) => o.status !== 'served' && o.status !== 'completed').length,
    PENDING:  list.filter((o) => o.status === 'pending').length,
    PREPARING:list.filter((o) => o.status === 'preparing').length,
    READY:    list.filter((o) => o.status === 'ready').length,
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Kitchen</Text>
          <Text style={styles.headerSub}>KOT Display</Text>
        </View>
        <View style={styles.clockBox}>
          <Ionicons name="time-outline" size={s(16)} color={colors.accent} />
          <Text style={styles.clockText}>{formatClock(clock)}</Text>
        </View>
      </View>

      {/* Filter tabs — flexGrow:0 keeps the horizontal strip from expanding to
          fill vertical space (which stretched the pills); alignItems in the
          content container stops the pills stretching too. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isError ? (
          <View style={styles.stateWrap}>
            <Ionicons name="cloud-offline-outline" size={s(40)} color={colors.textMuted} />
            <Text style={styles.stateTitle}>Couldn’t load tickets</Text>
            <Text style={styles.stateSub}>{error?.message || 'Something went wrong. Pull to refresh.'}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh} activeOpacity={0.85}>
              <Ionicons name="refresh-outline" size={s(16)} color="#FFF" />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : orders === null ? (
          <>
            <SkeletonCard colors={colors} styles={styles} />
            <SkeletonCard colors={colors} styles={styles} />
            <SkeletonCard colors={colors} styles={styles} />
          </>
        ) : filtered.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="restaurant-outline" size={s(40)} color={colors.textMuted} />
            <Text style={styles.stateTitle}>No active kitchen tickets</Text>
            <Text style={styles.stateSub}>
              {activeFilter === 'ALL'
                ? 'New orders will appear here as they come in.'
                : `No ${activeFilter.toLowerCase()} tickets right now.`}
            </Text>
          </View>
        ) : (
          filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              onItemPress={handleItemPress}
              isNew={newOrderIds.has(order.id)}
              colors={colors}
              styles={styles}
            />
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = (colors, k = 1) => {
  const s = (n) => Math.round(n * k);
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(20),
    paddingTop: s(16),
    paddingBottom: s(12),
  },
  headerTitle: {
    fontSize: s(26),
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: s(13),
    color: colors.textMuted,
    marginTop: s(1),
  },
  clockBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    backgroundColor: colors.card,
    paddingHorizontal: s(12),
    paddingVertical: s(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  clockText: {
    fontSize: s(13),
    fontWeight: '600',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    paddingHorizontal: s(20),
    paddingBottom: s(12),
    gap: s(8),
    alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingHorizontal: s(16),
    paddingVertical: s(8),
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterPillText: {
    fontSize: s(13),
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: '#FFF',
  },
  filterBadge: {
    backgroundColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: s(6),
    paddingVertical: s(1),
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterBadgeText: {
    fontSize: s(11),
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterBadgeTextActive: {
    color: '#FFF',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: s(20),
    paddingTop: s(4),
  },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: s(16),
    borderWidth: 1,
    borderColor: colors.border,
    padding: s(16),
    marginBottom: s(14),
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
    marginBottom: s(4),
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
  },
  orderNum: {
    fontSize: s(17),
    fontWeight: '700',
    color: colors.text,
  },
  tableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(3),
    backgroundColor: colors.pillBg,
    borderRadius: 999,
    paddingHorizontal: s(8),
    paddingVertical: s(3),
  },
  tableChipText: {
    fontSize: s(12),
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  rushBadge: {
    backgroundColor: withAlpha(colors.error, 0.1),
    borderRadius: 999,
    paddingHorizontal: s(8),
    paddingVertical: s(3),
    borderWidth: 1,
    borderColor: colors.error,
  },
  rushText: {
    fontSize: s(11),
    fontWeight: '700',
    color: colors.error,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: s(10),
    paddingVertical: s(3),
  },
  statusBadgeText: {
    fontSize: s(11),
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  elapsed: {
    fontSize: s(12),
    fontWeight: '600',
    marginBottom: s(12),
  },
  itemsList: {
    gap: s(6),
    marginBottom: s(14),
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
  },
  itemDot: {
    fontSize: s(10),
    width: 14,
  },
  itemQty: {
    fontSize: s(13),
    fontWeight: '700',
    color: colors.text,
    width: 28,
  },
  itemName: {
    flex: 1,
    fontSize: s(13),
    color: colors.textSecondary,
  },
  itemStatusLabel: {
    fontSize: s(11),
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(6),
    borderRadius: s(12),
    paddingVertical: s(11),
  },
  ctaButtonText: {
    fontSize: s(14),
    fontWeight: '700',
    color: '#FFF',
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: s(72),
    paddingHorizontal: s(32),
  },
  stateTitle: {
    fontSize: s(18),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginTop: s(16),
  },
  stateSub: {
    fontSize: s(14),
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: s(8),
    lineHeight: s(20),
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    marginTop: s(20),
    backgroundColor: colors.accent,
    borderRadius: s(12),
    paddingHorizontal: s(20),
    paddingVertical: s(11),
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: s(14),
    fontWeight: '700',
  },
});
};
