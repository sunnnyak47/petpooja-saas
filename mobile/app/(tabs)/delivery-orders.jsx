import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  StatusBar,
  Pressable,
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
  zomato: '#E23744',
  swiggy: '#FC8019',
  direct: '#0070F3',
};

const PLATFORM_TABS = [
  { key: 'ALL', label: 'All', color: C.text1 },
  { key: 'ZOMATO', label: 'Zomato', color: C.zomato },
  { key: 'SWIGGY', label: 'Swiggy', color: C.swiggy },
  { key: 'DIRECT', label: 'Direct', color: C.direct },
];

const STATUS_ORDER = ['new', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

const REJECT_REASONS = [
  'Too busy right now',
  'Item unavailable',
  'Restaurant closing soon',
  'Cannot fulfill order',
];

const MOCK_ORDERS = [
  {
    id: 'ZO-1042',
    platform: 'ZOMATO',
    customer: 'Rahul K.',
    phone: '+91 98765 XXXXX',
    items: [
      { qty: 2, name: 'Butter Chicken' },
      { qty: 1, name: 'Garlic Naan' },
    ],
    total: 620,
    placedAt: new Date(Date.now() - 2 * 60 * 1000),
    estimatedDelivery: 35,
    status: 'new',
    deliveryPartner: null,
  },
  {
    id: 'SW-8831',
    platform: 'SWIGGY',
    customer: 'Priya S.',
    phone: '+91 91234 XXXXX',
    items: [
      { qty: 1, name: 'Paneer Tikka Masala' },
      { qty: 2, name: 'Tandoori Roti' },
      { qty: 1, name: 'Mango Lassi' },
    ],
    total: 490,
    placedAt: new Date(Date.now() - 8 * 60 * 1000),
    estimatedDelivery: 30,
    status: 'preparing',
    deliveryPartner: 'Amit (Swiggy)',
  },
  {
    id: 'DR-0219',
    platform: 'DIRECT',
    customer: 'Arun M.',
    phone: '+91 87654 XXXXX',
    items: [
      { qty: 3, name: 'Veg Biryani' },
      { qty: 1, name: 'Raita' },
    ],
    total: 750,
    placedAt: new Date(Date.now() - 15 * 60 * 1000),
    estimatedDelivery: 40,
    status: 'accepted',
    deliveryPartner: null,
  },
  {
    id: 'ZO-1039',
    platform: 'ZOMATO',
    customer: 'Neha R.',
    phone: '+91 77777 XXXXX',
    items: [
      { qty: 1, name: 'Dal Makhani' },
      { qty: 2, name: 'Butter Naan' },
      { qty: 1, name: 'Gulab Jamun' },
    ],
    total: 380,
    placedAt: new Date(Date.now() - 28 * 60 * 1000),
    estimatedDelivery: 30,
    status: 'out_for_delivery',
    deliveryPartner: 'Suresh (Zomato)',
  },
  {
    id: 'SW-8820',
    platform: 'SWIGGY',
    customer: 'Vijay T.',
    phone: '+91 99999 XXXXX',
    items: [
      { qty: 2, name: 'Chicken Biryani' },
    ],
    total: 520,
    placedAt: new Date(Date.now() - 65 * 60 * 1000),
    estimatedDelivery: 35,
    status: 'delivered',
    deliveryPartner: 'Ravi (Swiggy)',
  },
  {
    id: 'DR-0215',
    platform: 'DIRECT',
    customer: 'Kavya P.',
    phone: '+91 88888 XXXXX',
    items: [
      { qty: 1, name: 'Veg Thali' },
      { qty: 1, name: 'Chaas' },
    ],
    total: 290,
    placedAt: new Date(Date.now() - 90 * 60 * 1000),
    estimatedDelivery: 30,
    status: 'cancelled',
    deliveryPartner: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function platformColor(platform) {
  if (platform === 'ZOMATO') return C.zomato;
  if (platform === 'SWIGGY') return C.swiggy;
  return C.direct;
}

function platformLabel(platform) {
  if (platform === 'ZOMATO') return 'Zomato';
  if (platform === 'SWIGGY') return 'Swiggy';
  return 'Direct';
}

function statusMeta(status) {
  const map = {
    new: { label: 'New', color: C.gold, bg: '#FFF8EB' },
    accepted: { label: 'Accepted', color: C.indigo, bg: '#EBF4FF' },
    preparing: { label: 'Preparing', color: '#9B59B6', bg: '#F5EBF7' },
    out_for_delivery: { label: 'Out for Delivery', color: C.success, bg: '#EDFBF3' },
    delivered: { label: 'Delivered', color: C.text3, bg: '#F5F5F5' },
    cancelled: { label: 'Cancelled', color: C.error, bg: '#FFF0F0' },
  };
  return map[status] || map.new;
}

function formatTimeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000 / 60);
  if (diff < 1) return 'Just now';
  if (diff === 1) return '1 min ago';
  return `${diff} mins ago`;
}

function formatItems(items) {
  return items.map(i => `${i.qty}x ${i.name}`).join(', ');
}

// ─── Pulsing dot for NEW orders ───────────────────────────────────────────────

function PulsingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false
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
    backgroundColor: progress.value > 0.4 ? C.success : C.error,
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

function RejectModal({ visible, onClose, onConfirm }) {
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
            style={[styles.confirmRejectBtn, !selected && styles.confirmRejectBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selected}
          >
            <Text style={styles.confirmRejectBtnText}>Confirm Rejection</Text>
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

function OrderCard({ order, onAccept, onReject, onMarkReady, onAutoAccept }) {
  const sm = statusMeta(order.status);
  const pc = platformColor(order.platform);
  const isNew = order.status === 'new';
  const canMarkReady = order.status === 'accepted' || order.status === 'preparing';

  return (
    <View style={styles.orderCard}>
      {/* Header row */}
      <View style={styles.orderHeader}>
        <View style={[styles.platformBadge, { backgroundColor: pc + '18' }]}>
          <View style={[styles.platformDot, { backgroundColor: pc }]} />
          <Text style={[styles.platformText, { color: pc }]}>{platformLabel(order.platform)}</Text>
        </View>
        <View style={styles.orderHeaderRight}>
          <View style={[styles.statusBadge, { backgroundColor: sm.bg }]}>
            {isNew && <PulsingDot />}
            <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
          </View>
        </View>
      </View>

      {/* Order info */}
      <View style={styles.orderRow}>
        <Text style={styles.orderId}>#{order.id}</Text>
        <Text style={styles.orderCustomer}>{order.customer}</Text>
      </View>
      <Text style={styles.orderItems}>{formatItems(order.items)}</Text>

      {/* Meta row */}
      <View style={styles.orderMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={13} color={C.text3} />
          <Text style={styles.metaText}>{formatTimeAgo(order.placedAt)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="bicycle-outline" size={13} color={C.text3} />
          <Text style={styles.metaText}>~{order.estimatedDelivery} min</Text>
        </View>
        {order.deliveryPartner && (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={13} color={C.text3} />
            <Text style={styles.metaText}>{order.deliveryPartner}</Text>
          </View>
        )}
      </View>

      {/* Total */}
      <View style={styles.orderFooterRow}>
        <Text style={styles.orderTotal}>₹{order.total.toLocaleString()}</Text>
      </View>

      {/* Countdown for new orders */}
      {isNew && (
        <CountdownBar orderId={order.id} onAutoAccept={onAutoAccept} />
      )}

      {/* Action buttons */}
      {isNew && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(order.id)}
          >
            <Ionicons name="close" size={16} color={C.error} />
            <Text style={[styles.actionBtnText, { color: C.error }]}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => onAccept(order.id)}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>Accept</Text>
          </TouchableOpacity>
        </View>
      )}

      {canMarkReady && (
        <TouchableOpacity style={styles.markReadyBtn} onPress={() => onMarkReady(order.id)}>
          <Ionicons name="bag-check-outline" size={16} color="#fff" />
          <Text style={styles.markReadyBtnText}>Mark Ready for Pickup</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DeliveryOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [activeTab, setActiveTab] = useState('ALL');
  const [rejectTarget, setRejectTarget] = useState(null);

  const filtered = activeTab === 'ALL'
    ? orders
    : orders.filter(o => o.platform === activeTab);

  const activeCount = orders.filter(o => ['new', 'accepted', 'preparing', 'out_for_delivery'].includes(o.status)).length;

  const todayRevenue = orders
    .filter(o => o.status === 'delivered')
    .reduce((s, o) => s + o.total, 0);

  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const avgDelivery = deliveredOrders.length
    ? Math.round(deliveredOrders.reduce((s, o) => s + o.estimatedDelivery, 0) / deliveredOrders.length)
    : 0;

  function handleAccept(id) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'accepted' } : o));
  }

  function handleReject(id) {
    setRejectTarget(id);
  }

  function handleRejectConfirm(reason) {
    setOrders(prev => prev.map(o => o.id === rejectTarget ? { ...o, status: 'cancelled' } : o));
    setRejectTarget(null);
  }

  function handleMarkReady(id) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'out_for_delivery' } : o));
  }

  function handleAutoAccept(id) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'accepted' } : o));
  }

  // Revenue by platform
  const zomatoRev = orders.filter(o => o.platform === 'ZOMATO' && o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const swiggyRev = orders.filter(o => o.platform === 'SWIGGY' && o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const directRev = orders.filter(o => o.platform === 'DIRECT' && o.status === 'delivered').reduce((s, o) => s + o.total, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery Orders</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{activeCount} active</Text>
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
              style={[
                styles.tab,
                isActive && { backgroundColor: tab.color, borderColor: tab.color },
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive, !isActive && { color: tab.color }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.summaryIcon, { backgroundColor: '#EBF4FF' }]}>
              <Ionicons name="flash" size={16} color={C.indigo} />
            </View>
            <Text style={styles.summaryValue}>{activeCount}</Text>
            <Text style={styles.summaryLabel}>Active</Text>
          </View>
          <View style={[styles.summaryCard, { flex: 1.4, marginHorizontal: 10 }]}>
            <View style={[styles.summaryIcon, { backgroundColor: '#EDFBF3' }]}>
              <Ionicons name="cash-outline" size={16} color={C.success} />
            </View>
            <Text style={styles.summaryValue}>₹{todayRevenue.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Today's Revenue</Text>
          </View>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.summaryIcon, { backgroundColor: '#FFF8EB' }]}>
              <Ionicons name="timer-outline" size={16} color={C.gold} />
            </View>
            <Text style={styles.summaryValue}>{avgDelivery}m</Text>
            <Text style={styles.summaryLabel}>Avg Time</Text>
          </View>
        </View>

        {/* Order list */}
        {filtered.length === 0 ? (
          <EmptyState
            icon="bicycle-outline"
            title="No delivery orders"
            subtitle="Orders from Zomato, Swiggy and direct customers will appear here"
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
            />
          ))
        )}

        {/* Revenue breakdown */}
        <View style={styles.revenueBreakdown}>
          <Text style={styles.breakdownTitle}>Today's Revenue Breakdown</Text>
          <View style={styles.breakdownRow}>
            <View style={[styles.breakdownDot, { backgroundColor: C.zomato }]} />
            <Text style={styles.breakdownLabel}>Zomato</Text>
            <Text style={styles.breakdownAmount}>₹{zomatoRev.toLocaleString()}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <View style={[styles.breakdownDot, { backgroundColor: C.swiggy }]} />
            <Text style={styles.breakdownLabel}>Swiggy</Text>
            <Text style={styles.breakdownAmount}>₹{swiggyRev.toLocaleString()}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <View style={[styles.breakdownDot, { backgroundColor: C.direct }]} />
            <Text style={styles.breakdownLabel}>Direct</Text>
            <Text style={styles.breakdownAmount}>₹{directRev.toLocaleString()}</Text>
          </View>
          <View style={[styles.breakdownRow, styles.breakdownTotal]}>
            <Ionicons name="wallet-outline" size={14} color={C.text2} />
            <Text style={[styles.breakdownLabel, { fontWeight: '700', color: C.text1 }]}>Total</Text>
            <Text style={[styles.breakdownAmount, { fontWeight: '700', color: C.text1 }]}>
              ₹{(zomatoRev + swiggyRev + directRev).toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <RejectModal
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
      />
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text1,
    flex: 1,
  },
  countBadge: {
    backgroundColor: C.indigo + '18',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.indigo,
  },
  tabsScroll: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text1,
  },
  summaryLabel: {
    fontSize: 10,
    color: C.text3,
    marginTop: 2,
    textAlign: 'center',
  },
  orderCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
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
    borderRadius: 999,
    gap: 5,
  },
  platformDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  platformText: {
    fontSize: 12,
    fontWeight: '700',
  },
  orderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pulsingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: C.gold,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  orderId: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text1,
  },
  orderCustomer: {
    fontSize: 13,
    color: C.text2,
    fontWeight: '500',
  },
  orderItems: {
    fontSize: 13,
    color: C.text3,
    marginBottom: 10,
    lineHeight: 18,
  },
  orderMeta: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: C.text3,
  },
  orderFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
    marginTop: 2,
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text1,
  },
  countdownWrap: {
    marginTop: 12,
  },
  countdownTrack: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 5,
  },
  countdownBar: {
    height: 4,
    borderRadius: 999,
  },
  countdownText: {
    fontSize: 11,
    color: C.text3,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: C.error + '30',
  },
  acceptBtn: {
    backgroundColor: C.success,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  markReadyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.indigo,
    gap: 6,
  },
  markReadyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  revenueBreakdown: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text1,
    marginBottom: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  breakdownTotal: {
    borderBottomWidth: 0,
    paddingTop: 10,
    marginTop: 4,
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 13,
    color: C.text2,
  },
  breakdownAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text1,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  rejectSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text1,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: C.text3,
    marginBottom: 18,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 8,
  },
  reasonRowSelected: {
    borderColor: C.error,
    backgroundColor: '#FFF0F0',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: C.border,
  },
  radioFilled: {
    borderColor: C.error,
    backgroundColor: C.error,
  },
  reasonText: {
    fontSize: 14,
    color: C.text2,
  },
  reasonTextSelected: {
    color: C.error,
    fontWeight: '600',
  },
  confirmRejectBtn: {
    backgroundColor: C.error,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmRejectBtnDisabled: {
    backgroundColor: C.border,
  },
  confirmRejectBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cancelTextBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  cancelTextBtnText: {
    fontSize: 14,
    color: C.text3,
  },
});
