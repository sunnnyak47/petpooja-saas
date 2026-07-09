import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrders, useUpdateOrderStatus } from '../../src/hooks/useApi';
import { useCurrency } from '../../src/hooks/useCurrency';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  pageBg:      '#F7F7F7',
  cardBg:      '#FFFFFF',
  cardBorder:  '#EAEAEA',
  cardShadow:  '#000000',
  text1:       '#0f172a',
  text2:       '#444444',
  text3:       '#888888',
  accent:      '#2563eb',
  pending:     '#F5A623',
  pendingBg:   '#FFF8EB',
  preparing:   '#2563eb',
  preparingBg: '#EBF4FF',
  ready:       '#00B341',
  readyBg:     '#EDFBF3',
  delivered:   '#888888',
  deliveredBg: '#F5F5F5',
  cancelled:   '#EE0000',
  cancelledBg: '#FFF0F0',
  skeleton:    '#F0F0F0',
};

const STATUS_TABS = ['All', 'Pending', 'Preparing', 'Ready', 'Delivered'];

// Maps each filter tab to the backend status values it should surface. The real
// Order.status enum is created → confirmed → ready → billed → paid (online orders
// start 'pending'); the UI's tab labels group those raw values. Backend listOrders
// accepts a comma-separated `status` and turns it into an `{ in: [...] }` filter.
const TAB_STATUS_GROUPS = {
  Pending:   ['pending', 'created'],
  Preparing: ['preparing', 'confirmed'],
  Ready:     ['ready'],
  Delivered: ['delivered', 'served', 'completed'],
};

// Live/in-play statuses (used for the header "N live" badge + stats).
const ACTIVE_STATUSES = ['pending', 'created', 'preparing', 'confirmed', 'ready'];

const STATUS_META = {
  created:   { color: C.pending,   bg: C.pendingBg },
  pending:   { color: C.pending,   bg: C.pendingBg },
  confirmed: { color: C.preparing, bg: C.preparingBg },
  preparing: { color: C.preparing, bg: C.preparingBg },
  ready:     { color: C.ready,     bg: C.readyBg },
  served:    { color: C.delivered, bg: C.deliveredBg },
  delivered: { color: C.delivered, bg: C.deliveredBg },
  cancelled: { color: C.cancelled, bg: C.cancelledBg },
};

// Phase 3 — Contextual CTA map. Freshly-synced POS orders are 'created', kitchen-
// accepted orders are 'confirmed'; both advance into the same flow as pending/preparing.
const STATUS_CTA = {
  created:   { label: 'Start Preparing →', color: '#F5A623', nextStatus: 'preparing' },
  pending:   { label: 'Start Preparing →', color: '#F5A623', nextStatus: 'preparing' },
  confirmed: { label: 'Mark Ready →',      color: '#2563eb', nextStatus: 'ready' },
  preparing: { label: 'Mark Ready →',      color: '#2563eb', nextStatus: 'ready' },
  ready:     { label: 'Mark Served ✓',     color: '#00B341', nextStatus: 'served' },
  // NOTE: no served→'billed' advance — the status endpoint rejects 'billed' (400).
  // Billing is a dedicated flow (POST /orders/:id/bill) wired in Phase 3; a served
  // order is terminal in this list until then.
};

// Keep legacy NEXT_STATUS for optimistic-update logic (handleAdvance)
const NEXT_STATUS = {
  created:   'preparing',
  pending:   'preparing',
  confirmed: 'ready',
  preparing: 'ready',
  ready:     'served',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr || Date.now()).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────

function LiveDot() {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 700 }),
        withTiming(1,   { duration: 700 })
      ),
      -1,
      false
    );
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.6], [0.5, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 10, height: 10,
            borderRadius: 5,
            backgroundColor: C.accent,
          },
          ringStyle,
        ]}
      />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent }} />
    </View>
  );
}

// ─── Phase 3 — Orders Skeleton ────────────────────────────────────────────────

function OrdersSkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <SkeletonBox key={i} width={72} height={34} borderRadius={999} color="#F0F0F0" />
        ))}
      </View>
      {[0, 1, 2, 3].map(i => (
        <SkeletonBox key={i} width="100%" height={68} borderRadius={16} color="#F0F0F0" />
      ))}
    </View>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ orders }) {
  const counts = {
    // 'created' (fresh POS) counts as pending; 'confirmed' (kitchen-accepted) as preparing.
    pending:   orders.filter((o) => ['pending', 'created'].includes((o.status || '').toLowerCase())).length,
    preparing: orders.filter((o) => ['preparing', 'confirmed'].includes((o.status || '').toLowerCase())).length,
    ready:     orders.filter((o) => (o.status || '').toLowerCase() === 'ready').length,
  };

  const chips = [
    { label: 'Pending',   count: counts.pending,   color: C.pending,   bg: C.pendingBg },
    { label: 'Preparing', count: counts.preparing, color: C.preparing, bg: C.preparingBg },
    { label: 'Ready',     count: counts.ready,     color: C.ready,     bg: C.readyBg },
  ];

  return (
    <View style={styles.statsBar}>
      {chips.map((chip, i) => (
        <React.Fragment key={chip.label}>
          {/* Phase 1 — statsChip borderRadius 999 */}
          <View style={[styles.statsChip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.statsLabel, { color: chip.color }]}>
              {chip.label} {chip.count}
            </Text>
          </View>
          {i < chips.length - 1 && <View style={styles.statsDivider} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────

function FilterTabs({ activeTab, onSelect }) {
  const tabLayouts = useRef({});
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  const [ready, setReady] = useState(false);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  function onLayout(tab, x, w) {
    tabLayouts.current[tab] = { x, w };
    if (Object.keys(tabLayouts.current).length === STATUS_TABS.length) {
      const layout = tabLayouts.current[activeTab];
      if (layout) {
        indicatorX.value = layout.x;
        indicatorW.value = layout.w;
        setReady(true);
      }
    }
  }

  function handlePress(tab) {
    onSelect(tab);
    const layout = tabLayouts.current[tab];
    if (layout) {
      indicatorX.value = withSpring(layout.x, { damping: 22, stiffness: 220 });
      indicatorW.value = withSpring(layout.w, { damping: 22, stiffness: 220 });
    }
  }

  useEffect(() => {
    const layout = tabLayouts.current[activeTab];
    if (layout && ready) {
      indicatorX.value = withSpring(layout.x, { damping: 22, stiffness: 220 });
      indicatorW.value = withSpring(layout.w, { damping: 22, stiffness: 220 });
    }
  }, [activeTab, ready]);

  return (
    <View style={styles.tabsWrapper}>
      {ready && (
        <Animated.View style={[styles.tabIndicator, indicatorStyle]} />
      )}
      {STATUS_TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          onPress={() => handlePress(tab)}
          onLayout={(e) =>
            onLayout(tab, e.nativeEvent.layout.x, e.nativeEvent.layout.width)
          }
          style={styles.tab}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === tab ? C.text1 : C.text3 },
              activeTab === tab && { fontWeight: '700' },
            ]}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Action Menu (long-press) ─────────────────────────────────────────────────

function ActionMenu({ visible, status, onMarkReady, onCancel, onPrintKOT, onDismiss }) {
  const opacity = useSharedValue(0);
  const scale   = useSharedValue(0.9);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 150 });
      scale.value   = withSpring(1, { damping: 18, stiffness: 220 });
    } else {
      opacity.value = withTiming(0, { duration: 110 });
      scale.value   = withTiming(0.9, { duration: 110 });
    }
  }, [visible]);

  const menuStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Pressable style={styles.menuOverlay} onPress={onDismiss}>
      <Animated.View style={[styles.menuBox, menuStyle]}>
        {status !== 'ready' && status !== 'delivered' && status !== 'cancelled' && (
          <TouchableOpacity style={styles.menuItem} onPress={onMarkReady} activeOpacity={0.7}>
            <Text style={styles.menuItemText}>Mark Ready</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.menuItem} onPress={onPrintKOT} activeOpacity={0.7}>
          <Text style={styles.menuItemText}>Print KOT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={onCancel} activeOpacity={0.7}>
          <Text style={[styles.menuItemText, { color: C.cancelled }]}>Cancel Order</Text>
        </TouchableOpacity>
      </Animated.View>
    </Pressable>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

const OrderCard = React.memo(function OrderCard({ item: order, onAdvance, onLongAction, index, expanded, onToggle }) {
  const { symbol }  = useCurrency();
  const status     = (order.status || 'pending').toLowerCase();
  const meta       = STATUS_META[status] || STATUS_META.delivered;
  // Phase 3 — contextual CTA (null for billed/completed)
  const ctaConfig  = STATUS_CTA[status] || null;
  const canAdvance = !!ctaConfig;

  const [menuVisible, setMenuVisible] = useState(false);
  const [errorMsg,    setErrorMsg]    = useState('');

  // Staggered slide-in entrance
  const translateX   = useSharedValue(40);
  const entryOpacity = useSharedValue(0);

  useEffect(() => {
    const delay = Math.min(index, 8) * 50;
    const t = setTimeout(() => {
      translateX.value   = withSpring(0, { damping: 20, stiffness: 160 });
      entryOpacity.value = withTiming(1, { duration: 240 });
    }, delay);
    return () => clearTimeout(t);
  }, []);

  const entryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: entryOpacity.value,
  }));

  // Backend listOrders returns `order_items` (array) and a nested `table` relation.
  const items   = order.order_items || order.items || [];
  const orderId = order.id || order._id;

  // Read the scalar table_number off the nested table relation (never render the object).
  const tableNumber = order.table?.table_number ?? order.table_number;
  const tableLabel = tableNumber
    ? (order.order_type === 'takeaway' ? 'Takeaway' : `Table ${tableNumber}`)
    : (order.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in');

  function handleAdvance() {
    setErrorMsg('');
    onAdvance(orderId, status, (err) => {
      if (err) setErrorMsg('Failed — tap to retry');
    });
  }

  return (
    <Animated.View style={entryStyle}>
      <Pressable
        onLongPress={() => setMenuVisible(true)}
        delayLongPress={420}
        style={[styles.card]}
      >
        {/* ── Phase 2: PressCard wraps the collapsed header row ── */}
        <PressCard
          scaleDown={0.98}
          onPress={onToggle}
          style={styles.cardCollapsedRow}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Phase 4 — order number typography */}
              <Text style={styles.orderNumber} numberOfLines={1}>
                {order.order_number || `#${String(orderId).slice(-6)}`}
              </Text>
              {/* Phase 1 — tableBadge borderRadius 999 */}
              <View style={styles.tableBadge}>
                <Text style={styles.tableBadgeText}>{tableLabel}</Text>
              </View>
            </View>
          </View>
          {/* Phase 1 — statusBadge borderRadius 999 */}
          <View style={[styles.statusBadge, { backgroundColor: meta.bg, marginRight: 8 }]}>
            <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
            <Text style={[styles.statusText, { color: meta.color }]}>{capitalize(status)}</Text>
          </View>
          {/* Phase 4 — amount typography */}
          <Text style={styles.amount}>
            {symbol}{Number(order.grand_total ?? order.total_amount ?? order.total ?? 0).toFixed(0)}
</Text>
          <Text style={[styles.chevron, expanded && styles.chevronUp]}>›</Text>
        </PressCard>

        {/* ── Expanded details ── */}
        {expanded && (
          <View style={styles.cardExpanded}>
            {/* Time */}
            <Text style={[styles.timeAgo, { marginBottom: 8 }]}>{timeAgo(order.created_at)}</Text>

            {/* Items list */}
            <View style={styles.itemsBlock}>
              {items.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemQty}>
                    {item.quantity || item.qty || 1}×
                  </Text>
                  {/* Phase 4 — item name/price typography */}
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name || item.item_name || 'Item'}
                  </Text>
                  {(item.item_total ?? item.unit_price ?? item.price) != null && (
                    <Text style={styles.itemPrice}>
                      {symbol}{Number(item.item_total ?? item.unit_price ?? item.price).toFixed(0)}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* Footer: total + advance button */}
            <View style={styles.cardFooter}>
              <Text style={styles.totalLabel}>
                Total: <Text style={styles.amount}>{symbol}{Number(order.grand_total ?? order.total_amount ?? order.total ?? 0).toFixed(0)}</Text>
              </Text>
              {/* Phase 2 + 3: PressCard on advance button, contextual CTA label */}
              {canAdvance && (
                <PressCard
                  scaleDown={0.95}
                  onPress={handleAdvance}
                  style={[styles.advanceBtn, { backgroundColor: ctaConfig.color }]}
                >
                  <Text style={styles.advanceBtnText}>{ctaConfig.label}</Text>
                </PressCard>
              )}
            </View>

            {!!errorMsg && (
              <TouchableOpacity onPress={handleAdvance} activeOpacity={0.8}>
                <Text style={styles.errorMsg}>{errorMsg}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Pressable>

      <ActionMenu
        visible={menuVisible}
        status={status}
        onMarkReady={() => { setMenuVisible(false); onLongAction(orderId, 'ready'); }}
        onCancel={() => { setMenuVisible(false); onLongAction(orderId, 'cancelled'); }}
        onPrintKOT={() => { setMenuVisible(false); onLongAction(orderId, 'print_kot'); }}
        onDismiss={() => setMenuVisible(false)}
      />
    </Animated.View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Orders() {
  const insets = useSafeAreaInsets();

  const [activeTab,   setActiveTab]   = useState('All');
  const [search,      setSearch]      = useState('');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [localOrders, setLocalOrders] = useState(null);
  const [expandedId,  setExpandedId]  = useState(null);

  // Phase 3 — skeleton loading state, auto-resolves after 700ms
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  // Resolve the active tab to its backend status group so 'created'/'confirmed'
  // orders surface under Pending/Preparing. listOrders splits a comma-separated
  // `status` into an `{ in: [...] }` filter.
  const activeStatuses =
    activeTab === 'All' ? null : (TAB_STATUS_GROUPS[activeTab] || [activeTab.toLowerCase()]);
  const { data, isLoading, refetch, isRefetching } = useOrders(
    activeStatuses ? { status: activeStatuses.join(',') } : {}
  );
  const { mutate: updateStatusMutation } = useUpdateOrderStatus();

  const apiOrders     = data?.data || data?.orders || (Array.isArray(data) ? data : null);
  const baseOrders    = apiOrders || []; // real orders or empty — never demo data
  const displayOrders = localOrders !== null ? localOrders : baseOrders;

  useEffect(() => {
    if (apiOrders && apiOrders.length > 0) setLocalOrders(null);
  }, [data]);

  const filtered = React.useMemo(() => {
    let list = displayOrders;
    if (activeStatuses) {
      list = list.filter((o) => activeStatuses.includes((o.status || '').toLowerCase()));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.order_number || '').toLowerCase().includes(q) ||
          String(o.table?.table_number ?? o.table_number ?? '').toLowerCase().includes(q) ||
          (o.order_type || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [displayOrders, activeStatuses, search]);

  const handleAdvance = useCallback(
    (orderId, currentStatus, onError) => {
      const nextStatus = NEXT_STATUS[currentStatus];
      if (!nextStatus) return;
      const snapshot = localOrders !== null ? [...localOrders] : [...baseOrders];
      setLocalOrders(snapshot.map((o) =>
        (o.id || o._id) === orderId ? { ...o, status: nextStatus } : o
      ));
      updateStatusMutation(
        { orderId, status: nextStatus },
        {
          onError: () => { setLocalOrders(snapshot); if (onError) onError(true); },
          onSuccess: () => refetch(),
        }
      );
    },
    [localOrders, baseOrders, updateStatusMutation, refetch]
  );

  const handleLongAction = useCallback(
    (orderId, action) => {
      if (action === 'print_kot') return;
      const snapshot = localOrders !== null ? [...localOrders] : [...baseOrders];
      setLocalOrders(snapshot.map((o) =>
        (o.id || o._id) === orderId ? { ...o, status: action } : o
      ));
      updateStatusMutation(
        { orderId, status: action },
        {
          onError: () => setLocalOrders(snapshot),
          onSuccess: () => refetch(),
        }
      );
    },
    [localOrders, baseOrders, updateStatusMutation, refetch]
  );

  // Search animation
  const searchWidth   = useSharedValue(0);
  const searchOpacity = useSharedValue(0);
  const searchAnimStyle = useAnimatedStyle(() => ({
    flex: searchWidth.value,
    opacity: searchOpacity.value,
    overflow: 'hidden',
  }));

  function toggleSearch() {
    if (searchOpen) {
      setSearch('');
      searchWidth.value   = withTiming(0, { duration: 220 });
      searchOpacity.value = withTiming(0, { duration: 200 });
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
      searchWidth.value   = withTiming(1, { duration: 250 });
      searchOpacity.value = withTiming(1, { duration: 240 });
    }
  }

  const liveCount = displayOrders.filter((o) =>
    ACTIVE_STATUSES.includes((o.status || '').toLowerCase())
  ).length;

  const renderItem = useCallback(
    ({ item, index }) => {
      const id = String(item.id || item._id);
      return (
        <OrderCard
          item={item}
          onAdvance={handleAdvance}
          onLongAction={handleLongAction}
          index={index}
          expanded={expandedId === id}
          onToggle={() => setExpandedId((prev) => (prev === id ? null : id))}
        />
      );
    },
    [handleAdvance, handleLongAction, expandedId]
  );

  const keyExtractor = useCallback(
    (o) => String(o.id || o._id || Math.random()),
    []
  );

  // Phase 1 — gap between cards 12
  const Separator = useCallback(() => <View style={{ height: 12 }} />, []);

  return (
    <View style={[styles.root, { paddingTop: 0 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            <Text style={styles.titleText}>Orders</Text>
            {liveCount > 0 && (
              <View style={styles.liveBadge}>
                <LiveDot />
                <Text style={styles.liveCount}>{liveCount} live</Text>
              </View>
            )}
          </View>

          <View style={styles.searchRow}>
            <Animated.View style={[styles.searchInputWrap, searchAnimStyle]}>
              {searchOpen && (
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Table, order ID…"
                  placeholderTextColor={C.text3}
                  style={styles.searchTextInput}
                  autoFocus
                />
              )}
            </Animated.View>
            <TouchableOpacity
              onPress={toggleSearch}
              style={styles.searchToggle}
              activeOpacity={0.7}
            >
              <Text style={{ color: C.text2, fontSize: 17 }}>
                {searchOpen ? '✕' : '⌕'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        {!loading && !isLoading && displayOrders.length > 0 && (
          <StatsBar orders={displayOrders} />
        )}

        {/* Filter tabs */}
        <FilterTabs activeTab={activeTab} onSelect={setActiveTab} />
      </View>

      {/* ── Content ── */}
      {/* Phase 3 — show skeleton while loading=true OR api isLoading */}
      {(loading || isLoading) ? (
        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled={false}
        >
          <OrdersSkeleton />
        </ScrollView>
      ) : (
        <FlashList
          data={filtered}
          estimatedItemSize={68}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{
            padding: 14,
            paddingBottom: insets.bottom + 90,
          }}
          ItemSeparatorComponent={Separator}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="📋"
              title="No orders yet"
              subtitle="New orders will appear here automatically"
            />
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.pageBg,
  },

  // ── Header ──
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    shadowColor: 'rgba(0,0,0,0.05)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleText: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text1,
    letterSpacing: -0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveCount: {
    fontSize: 11,
    fontWeight: '600',
    color: C.accent,
    letterSpacing: 0.2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchInputWrap: {
    backgroundColor: C.pageBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 7 : 4,
    minWidth: 0,
  },
  searchTextInput: {
    fontSize: 13,
    color: C.text1,
    minWidth: 0,
    flex: 1,
  },
  searchToggle: {
    width: 34,
    height: 34,
    backgroundColor: C.pageBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Stats ──
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  statsChip: {
    // Phase 1 — fully round
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  statsDivider: {
    width: 1,
    height: 12,
    backgroundColor: C.cardBorder,
  },

  // ── Tabs ──
  tabsWrapper: {
    flexDirection: 'row',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: C.accent,
    borderRadius: 1,
  },
  // Phase 4 — filter pills minHeight 36, paddingHorizontal 14
  tab: {
    paddingHorizontal: 14,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    // Phase 4 — fontSize 13, fontWeight '600'
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Card ── Phase 1: borderRadius 16, updated shadow
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  // Phase 4 — order number: fontSize 15, fontWeight '700', letterSpacing -0.2
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text1,
    letterSpacing: -0.2,
  },
  // Phase 1 — tableBadge borderRadius 999; Phase 4 — fontSize 11, fontWeight '700'
  tableBadge: {
    backgroundColor: '#F0F0F0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tableBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text2,
    letterSpacing: 0.2,
  },
  timeAgo: {
    fontSize: 11,
    color: C.text3,
    marginTop: 2,
  },
  // Phase 4 — total amount: fontSize 16, fontWeight '800', letterSpacing -0.4, color '#000000'
  amount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.4,
  },

  // ── Items ──
  itemsBlock: {
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    paddingTop: 9,
    marginBottom: 10,
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemQty: {
    fontSize: 12,
    color: C.text3,
    minWidth: 22,
  },
  // Phase 4 — item name: fontSize 14, fontWeight '600'
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text2,
    flex: 1,
  },
  // Phase 4 — item price: fontSize 13, color '#888888'
  itemPrice: {
    fontSize: 13,
    color: '#888888',
  },
  extraItems: {
    fontSize: 11,
    color: C.text3,
    marginTop: 2,
  },

  // ── Footer ──
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    paddingTop: 10,
  },
  // Phase 1 — statusBadge borderRadius 999; Phase 4 — text fontSize 11, fontWeight '700'
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Phase 4 — advance btn: minHeight 44, borderRadius 10; phase 3 color set dynamically
  advanceBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  advanceBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  errorMsg: {
    fontSize: 11,
    color: C.cancelled,
    marginTop: 6,
    textAlign: 'right',
  },

  // ── Long-press menu ──
  menuOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
  },
  menuBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 10,
  },
  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  menuItemDanger: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.text1,
  },

  // ── Skeleton ──
  skBar: {
    backgroundColor: C.skeleton,
    borderRadius: 5,
  },

  // ── Collapsed card row ── Phase 1 — padding 16; Phase 4 — minHeight 64
  cardCollapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  chevron: {
    fontSize: 20,
    color: '#888888',
    marginLeft: 6,
    transform: [{ rotate: '90deg' }],
    lineHeight: 22,
  },
  chevronUp: {
    transform: [{ rotate: '-90deg' }],
  },
  // Phase 1 — expanded padding 16
  cardExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
  },
  totalLabel: {
    fontSize: 13,
    color: '#444444',
    fontWeight: '500',
  },
});
