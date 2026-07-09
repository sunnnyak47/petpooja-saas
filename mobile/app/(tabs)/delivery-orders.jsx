/**
 * Delivery Orders — PetPooja ERP
 * Phase 3: Connected to real /orders?order_type=delivery API
 * Expo SDK 54 · Expo Router 6 · Reanimated v4 · JSX
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '../../src/components/EmptyState';
import { T, R, FS, FW } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useOrders, useUpdateOrderStatus } from '../../src/hooks/useApi';
import { useCurrency } from '../../src/hooks/useCurrency';

// ─── Platform brand colours (kept as-is — these are external brand identities)
const ZOMATO = '#e23744';
const SWIGGY  = '#fc8019';
const DIRECT  = T.accent;  // indigo-500 for restaurant's own channel

const PLATFORM_TABS = [
  { key: 'ALL',    label: 'All',    color: T.textPrimary },
  { key: 'ZOMATO', label: 'Zomato', color: ZOMATO },
  { key: 'SWIGGY', label: 'Swiggy', color: SWIGGY },
  { key: 'DIRECT', label: 'Direct', color: DIRECT },
];

const REJECT_REASONS = [
  'Too busy right now',
  'Item unavailable',
  'Restaurant closing soon',
  'Cannot fulfill order',
];

// ─── Field normaliser ────────────────────────────────────────────────────────
/**
 * Maps the real backend order shape (GET /orders, order.service.listOrders) to the UI shape.
 * Confirmed backend fields: grand_total/total_amount (Decimal→string), the platform lives in
 * `aggregator` ('swiggy'|'zomato'|'ubereats'); `source` is 'pos'|'online' (never the brand).
 * `customer` is a RELATION OBJECT { full_name, phone } — plus scalar customer_name/customer_phone.
 */
// Translate the backend Order.status enum into the delivery UI's status bucket.
function deliveryUiStatus(raw) {
  switch (String(raw || '').toLowerCase()) {
    case 'created':
    case 'confirmed':
    case 'pending':          return 'new';
    case 'preparing':        return 'preparing';
    case 'ready':
    case 'served':
    case 'billed':           return 'out_for_delivery';
    case 'delivered':
    case 'completed':
    case 'paid':             return 'delivered';
    case 'cancelled':
    case 'voided':           return 'cancelled';
    default:                 return 'new';
  }
}

function normalizeOrder(o) {
  // Real platform identity is the `aggregator` column; source is just pos/online.
  const rawPlatform = String(o.aggregator || o.source || '').toUpperCase();
  const platform =
    rawPlatform.includes('ZOMATO') ? 'ZOMATO' :
    rawPlatform.includes('SWIGGY') ? 'SWIGGY' : 'DIRECT';

  // Backend returns order_items; each row carries a scalar `name` and `quantity`.
  const items = (o.items || o.order_items || []).map(item => ({
    qty:  item.quantity  ?? item.qty  ?? 1,
    name: item.name      ?? item.item_name ?? item.menu_item?.name ?? 'Item',
  }));

  return {
    ...o,
    platform,
    // Map the real Order.status enum (created|confirmed|ready|billed|paid|
    // cancelled|voided|preparing|served|delivered|completed) into the UI bucket
    // statusMeta/handlers understand — otherwise every order fell through to 'new'
    // and paid orders never counted toward revenue (which keyed on 'delivered').
    status:          deliveryUiStatus(o.status),
    // NEVER render o.customer (a relation object) in <Text> — read its scalar full_name.
    customer:        o.customer?.full_name ?? o.customer_name  ?? 'Guest',
    phone:           o.customer?.phone     ?? o.customer_phone ?? '',
    // grand_total/total_amount are Prisma Decimals → serialised as strings; coerce to Number
    // so the summary reduces add instead of string-concatenating.
    total:           Number(o.grand_total ?? o.total_amount ?? o.total ?? 0) || 0,
    placedAt:        o.created_at       ? new Date(o.created_at) : (o.placedAt ?? new Date()),
    estimatedDelivery: o.estimated_delivery_time ?? o.estimatedDelivery ?? 35,
    deliveryPartner: o.delivery_partner ?? o.deliveryPartner ?? null,
    items,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function platformColor(platform) {
  if (platform === 'ZOMATO') return ZOMATO;
  if (platform === 'SWIGGY') return SWIGGY;
  return DIRECT;
}

function platformLabel(platform) {
  if (platform === 'ZOMATO') return 'Zomato';
  if (platform === 'SWIGGY') return 'Swiggy';
  return 'Direct';
}

function statusMeta(status) {
  const map = {
    new:              { label: 'New',              color: T.warning,       bg: T.warningBg   },
    accepted:         { label: 'Accepted',         color: T.accent,        bg: T.accentSoft  },
    preparing:        { label: 'Preparing',        color: '#7c3aed',       bg: '#ede9fe'     },
    out_for_delivery: { label: 'Out for Delivery', color: T.success,       bg: T.successBg   },
    delivered:        { label: 'Delivered',        color: T.textMuted,     bg: T.surfaceMuted },
    cancelled:        { label: 'Cancelled',        color: T.danger,        bg: T.dangerBg    },
  };
  return map[status] ?? map.new;
}

function formatTimeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff === 1) return '1 min ago';
  return `${diff} mins ago`;
}

function formatItems(items) {
  return items.map(i => `${i.qty}× ${i.name}`).join(', ');
}

// ─── Pulsing dot for NEW orders ───────────────────────────────────────────────
function PulsingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 600 }),
        withTiming(1,   { duration: 600 }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulsingDot, style]} />;
}

// ─── Countdown timer bar ──────────────────────────────────────────────────────
function CountdownBar({ orderId, onAutoAccept }) {
  const [remaining, setRemaining] = useState(60);
  const progress = useSharedValue(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1;
        progress.value = withTiming(next / 60, { duration: 900 });
        if (next <= 0) {
          clearInterval(interval);
          onAutoAccept(orderId);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [orderId]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%`,
    backgroundColor: progress.value > 0.4 ? T.success : T.danger,
  }));

  return (
    <View style={styles.countdownWrap}>
      <View style={styles.countdownTrack}>
        <Animated.View style={[styles.countdownBar, barStyle]} />
      </View>
      <Text style={styles.countdownText}>Auto-accept in {remaining}s</Text>
    </View>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ visible, onClose, onConfirm, loading }) {
  const [selected, setSelected] = useState(null);

  function handleConfirm() {
    if (!selected) return;
    onConfirm(selected);
    setSelected(null);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.rejectSheet} onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Reject Order</Text>
          <Text style={styles.sheetSubtitle}>Select a reason</Text>

          {REJECT_REASONS.map(reason => (
            <TouchableOpacity
              key={reason}
              style={[styles.reasonRow, selected === reason && styles.reasonRowSelected]}
              onPress={() => setSelected(reason)}
            >
              <View style={[styles.radioCircle, selected === reason && styles.radioFilled]} />
              <Text style={[styles.reasonText, selected === reason && styles.reasonTextSelected]}>
                {reason}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.confirmRejectBtn, (!selected || loading) && styles.confirmRejectBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selected || loading}
          >
            {loading
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.confirmRejectBtnText}>Confirm Rejection</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelTextBtn} onPress={onClose}>
            <Text style={styles.cancelTextBtnText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order, onAccept, onReject, onMarkReady, onAutoAccept, isUpdating }) {
  const { symbol } = useCurrency();
  const sm        = statusMeta(order.status);
  const pc        = platformColor(order.platform);
  const isNew     = order.status === 'new';
  const canMarkReady = order.status === 'accepted' || order.status === 'preparing';

  return (
    <View style={styles.orderCard}>
      {/* Header */}
      <View style={styles.orderHeader}>
        <View style={[styles.platformBadge, { backgroundColor: pc + '18' }]}>
          <View style={[styles.platformDot, { backgroundColor: pc }]} />
          <Text style={[styles.platformText, { color: pc }]}>{platformLabel(order.platform)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sm.bg }]}>
          {isNew && <PulsingDot />}
          <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      {/* Order info */}
      <View style={styles.orderRow}>
        <Text style={styles.orderId}>#{order.order_number ?? order.id}</Text>
        <Text style={styles.orderCustomer}>{order.customer}</Text>
      </View>
      <Text style={styles.orderItemsText}>{formatItems(order.items)}</Text>

      {/* Meta */}
      <View style={styles.orderMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={13} color={T.textMuted} />
          <Text style={styles.metaText}>{formatTimeAgo(order.placedAt)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="bicycle-outline" size={13} color={T.textMuted} />
          <Text style={styles.metaText}>~{order.estimatedDelivery} min</Text>
        </View>
        {order.deliveryPartner ? (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={13} color={T.textMuted} />
            <Text style={styles.metaText}>{order.deliveryPartner}</Text>
          </View>
        ) : null}
      </View>

      {/* Total */}
      <View style={styles.orderFooterRow}>
        <Text style={styles.orderTotal}>{symbol}{(order.total || 0).toLocaleString('en-IN')}</Text>
      </View>

      {/* Countdown bar for new orders */}
      {isNew && (
        <CountdownBar orderId={order.id} onAutoAccept={onAutoAccept} />
      )}

      {/* Accept / Reject for new orders */}
      {isNew && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(order.id)}
            disabled={isUpdating}
          >
            <Ionicons name="close" size={16} color={T.danger} />
            <Text style={[styles.actionBtnText, { color: T.danger }]}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn, isUpdating && { opacity: 0.65 }]}
            onPress={() => onAccept(order.id)}
            disabled={isUpdating}
          >
            {isUpdating
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <>
                  <Ionicons name="checkmark" size={16} color="#ffffff" />
                  <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Accept</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Mark ready for accepted/preparing orders */}
      {canMarkReady && (
        <TouchableOpacity
          style={[styles.markReadyBtn, isUpdating && { opacity: 0.65 }]}
          onPress={() => onMarkReady(order.id)}
          disabled={isUpdating}
        >
          {isUpdating
            ? <ActivityIndicator size="small" color="#ffffff" />
            : <>
                <Ionicons name="bag-check-outline" size={16} color="#ffffff" />
                <Text style={styles.markReadyBtnText}>Mark Ready for Pickup</Text>
              </>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DeliveryOrdersScreen() {
  const insets    = useSafeAreaInsets();
  const { user }  = useAuth();
  const { symbol } = useCurrency();
  const outletId  = user?.outlet_id;

  const [activeTab,    setActiveTab]    = useState('ALL');
  const [rejectTarget, setRejectTarget] = useState(null);  // orderId being rejected

  // ── API ────────────────────────────────────────────────────────────────────
  const {
    data: rawOrders = [],
    isLoading,
    isRefetching,
    refetch,
  } = useOrders({ order_type: 'delivery', outlet_id: outletId });

  const updateStatus = useUpdateOrderStatus();

  // Normalise API response
  const orders = (Array.isArray(rawOrders) ? rawOrders : []).map(normalizeOrder);

  // ── Derived values ────────────────────────────────────────────────────────
  const filtered = activeTab === 'ALL'
    ? orders
    : orders.filter(o => o.platform === activeTab);

  const activeCount  = orders.filter(o => ['new', 'accepted', 'preparing', 'out_for_delivery'].includes(o.status)).length;
  const deliveredAll = orders.filter(o => o.status === 'delivered');
  const todayRevenue = deliveredAll.reduce((s, o) => s + (o.total || 0), 0);
  const avgDelivery  = deliveredAll.length
    ? Math.round(deliveredAll.reduce((s, o) => s + (o.estimatedDelivery || 0), 0) / deliveredAll.length)
    : 0;

  const zomatoRev = orders.filter(o => o.platform === 'ZOMATO' && o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const swiggyRev = orders.filter(o => o.platform === 'SWIGGY' && o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const directRev = orders.filter(o => o.platform === 'DIRECT'  && o.status === 'delivered').reduce((s, o) => s + o.total, 0);

  // ── Action handlers ───────────────────────────────────────────────────────
  function handleAccept(orderId) {
    // Backend updateOrderStatusSchema accepts pending|preparing|ready|served|
    // delivered|completed|cancelled — NOT 'accepted'/'out_for_delivery' (400).
    updateStatus.mutate({ orderId, status: 'preparing' });
  }

  function handleReject(orderId) {
    setRejectTarget(orderId);
  }

  async function handleRejectConfirm(reason) {
    try {
      await updateStatus.mutateAsync({
        orderId: rejectTarget,
        status: 'cancelled',
        rejection_reason: reason,
      });
    } finally {
      setRejectTarget(null);
    }
  }

  function handleMarkReady(orderId) {
    updateStatus.mutate({ orderId, status: 'ready' });
  }

  function handleAutoAccept(orderId) {
    updateStatus.mutate({ orderId, status: 'preparing' });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery Orders</Text>
        <View style={styles.headerRight}>
          {isRefetching && (
            <ActivityIndicator size="small" color={T.accent} style={{ marginRight: 8 }} />
          )}
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{activeCount} active</Text>
          </View>
        </View>
      </View>

      {/* Platform tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
        style={styles.tabsScroll}
      >
        {PLATFORM_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && { backgroundColor: tab.color, borderColor: tab.color }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, isActive ? styles.tabTextActive : { color: tab.color }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={T.accent}
            colors={[T.accent]}
          />
        }
      >
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.summaryIcon, { backgroundColor: T.accentSoft }]}>
              <Ionicons name="flash" size={16} color={T.accent} />
            </View>
            <Text style={styles.summaryValue}>{activeCount}</Text>
            <Text style={styles.summaryLabel}>Active</Text>
          </View>
          <View style={[styles.summaryCard, { flex: 1.4, marginHorizontal: 10 }]}>
            <View style={[styles.summaryIcon, { backgroundColor: T.successBg }]}>
              <Ionicons name="cash-outline" size={16} color={T.success} />
            </View>
            <Text style={styles.summaryValue}>{symbol}{todayRevenue.toLocaleString('en-IN')}</Text>
            <Text style={styles.summaryLabel}>Today's Revenue</Text>
          </View>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.summaryIcon, { backgroundColor: T.warningBg }]}>
              <Ionicons name="timer-outline" size={16} color={T.warning} />
            </View>
            <Text style={styles.summaryValue}>{avgDelivery || '—'}m</Text>
            <Text style={styles.summaryLabel}>Avg Time</Text>
          </View>
        </View>

        {/* Order list */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={T.accent} />
            <Text style={styles.loadingText}>Loading delivery orders…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="bicycle-outline"
            title="No delivery orders"
            subtitle={
              activeTab === 'ALL'
                ? 'Orders from Zomato, Swiggy and direct customers will appear here'
                : `No ${PLATFORM_TABS.find(t => t.key === activeTab)?.label} orders yet`
            }
          />
        ) : (
          filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={handleAccept}
              onReject={handleReject}
              onMarkReady={handleMarkReady}
              onAutoAccept={handleAutoAccept}
              isUpdating={updateStatus.isPending && updateStatus.variables?.orderId === order.id}
            />
          ))
        )}

        {/* Revenue breakdown by platform */}
        {!isLoading && deliveredAll.length > 0 && (
          <View style={styles.revenueBreakdown}>
            <Text style={styles.breakdownTitle}>Today's Revenue Breakdown</Text>
            <View style={styles.breakdownRow}>
              <View style={[styles.breakdownDot, { backgroundColor: ZOMATO }]} />
              <Text style={styles.breakdownLabel}>Zomato</Text>
              <Text style={styles.breakdownAmount}>{symbol}{zomatoRev.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <View style={[styles.breakdownDot, { backgroundColor: SWIGGY }]} />
              <Text style={styles.breakdownLabel}>Swiggy</Text>
              <Text style={styles.breakdownAmount}>{symbol}{swiggyRev.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <View style={[styles.breakdownDot, { backgroundColor: DIRECT }]} />
              <Text style={styles.breakdownLabel}>Direct</Text>
              <Text style={styles.breakdownAmount}>{symbol}{directRev.toLocaleString('en-IN')}</Text>
            </View>
            <View style={[styles.breakdownRow, styles.breakdownTotal]}>
              <Ionicons name="wallet-outline" size={14} color={T.textSecondary} />
              <Text style={[styles.breakdownLabel, { fontWeight: FW.bold, color: T.textPrimary }]}>Total</Text>
              <Text style={[styles.breakdownAmount, { fontWeight: FW.bold, color: T.textPrimary }]}>
                {symbol}{(zomatoRev + swiggyRev + directRev).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <RejectModal
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
        loading={updateStatus.isPending}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.pageBg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: T.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: { fontSize: FS['2xl'], fontWeight: FW.bold, color: T.textPrimary, flex: 1, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  countBadge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: R.full,
  },
  countBadgeText: { fontSize: 12, fontWeight: FW.semibold, color: T.accent },

  // Platform tabs
  tabsScroll: {
    backgroundColor: T.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: R.full,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.cardBg,
  },
  tabText:       { fontSize: FS.sm, fontWeight: FW.semibold },
  tabTextActive: { color: '#ffffff' },

  // Scroll
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },

  // Loading
  loadingWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: FS.sm, color: T.textMuted },

  // Summary cards
  summaryRow: { flexDirection: 'row', marginBottom: 16 },
  summaryCard: {
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: R.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  summaryValue: { fontSize: FS.lg, fontWeight: FW.bold, color: T.textPrimary },
  summaryLabel: { fontSize: FS.xs, color: T.textMuted, marginTop: 2, textAlign: 'center' },

  // Order card
  orderCard: {
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.full,
    gap: 5,
  },
  platformDot: { width: 7, height: 7, borderRadius: R.full },
  platformText: { fontSize: 12, fontWeight: FW.bold },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.full,
    gap: 5,
  },
  statusText:  { fontSize: 11, fontWeight: FW.semibold },
  pulsingDot:  { width: 7, height: 7, borderRadius: R.full, backgroundColor: T.warning },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  orderId:       { fontSize: FS.sm, fontWeight: FW.bold, color: T.textPrimary },
  orderCustomer: { fontSize: FS.sm, color: T.textSecondary, fontWeight: FW.medium },
  orderItemsText: { fontSize: FS.sm, color: T.textMuted, marginBottom: 10, lineHeight: 18 },
  orderMeta: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: 12, color: T.textMuted },
  orderFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 10,
    marginTop: 2,
  },
  orderTotal: { fontSize: 18, fontWeight: FW.bold, color: T.textPrimary },

  // Countdown
  countdownWrap:  { marginTop: 12 },
  countdownTrack: {
    height: 4,
    backgroundColor: T.border,
    borderRadius: R.full,
    overflow: 'hidden',
    marginBottom: 5,
  },
  countdownBar:  { height: 4, borderRadius: R.full },
  countdownText: { fontSize: 11, color: T.textMuted, textAlign: 'right' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: R.xl,
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: T.dangerBg,
    borderWidth: 1,
    borderColor: T.danger + '30',
  },
  acceptBtn: { backgroundColor: T.success },
  actionBtnText: { fontSize: 14, fontWeight: FW.bold },
  markReadyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: R.xl,
    backgroundColor: T.accent,
    gap: 6,
  },
  markReadyBtnText: { fontSize: 14, fontWeight: FW.bold, color: '#ffffff' },

  // Revenue breakdown
  revenueBreakdown: {
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  breakdownTitle: { fontSize: 14, fontWeight: FW.bold, color: T.textPrimary, marginBottom: 14 },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  breakdownTotal: { borderBottomWidth: 0, paddingTop: 10, marginTop: 4 },
  breakdownDot:   { width: 10, height: 10, borderRadius: R.full },
  breakdownLabel: { flex: 1, fontSize: FS.sm, color: T.textSecondary },
  breakdownAmount: { fontSize: FS.sm, fontWeight: FW.semibold, color: T.textPrimary },

  // Reject modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  rejectSheet: {
    backgroundColor: T.cardBg,
    borderTopLeftRadius: R['3xl'],
    borderTopRightRadius: R['3xl'],
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: T.border,
    borderRadius: R.full,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle:    { fontSize: FS.lg, fontWeight: FW.bold, color: T.textPrimary, marginBottom: 4 },
  sheetSubtitle: { fontSize: FS.sm, color: T.textMuted, marginBottom: 18 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: R.xl,
    borderWidth: 1.5,
    borderColor: T.border,
    marginBottom: 8,
  },
  reasonRowSelected: { borderColor: T.danger, backgroundColor: T.dangerBg },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: R.full,
    borderWidth: 2,
    borderColor: T.border,
  },
  radioFilled: { borderColor: T.danger, backgroundColor: T.danger },
  reasonText:         { fontSize: 14, color: T.textSecondary },
  reasonTextSelected: { color: T.danger, fontWeight: FW.semibold },
  confirmRejectBtn: {
    backgroundColor: T.danger,
    paddingVertical: 14,
    borderRadius: R.xl,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmRejectBtnDisabled: { backgroundColor: T.border },
  confirmRejectBtnText: { fontSize: FS.base, fontWeight: FW.bold, color: '#ffffff' },
  cancelTextBtn:     { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  cancelTextBtnText: { fontSize: 14, color: T.textMuted },
});
