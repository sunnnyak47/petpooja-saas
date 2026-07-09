import React, {
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  FadeInDown,
  SlideInDown,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import {
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useReceivePurchaseOrder,
  useCancelPurchaseOrder,
} from '../../src/hooks/useApi';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import api from '../../src/lib/api';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  pageBg:   '#F7F7F7',
  card:     '#FFFFFF',
  border:   '#EAEAEA',
  text1:    '#0f172a',
  text2:    '#444444',
  text3:    '#888888',

  // Status colors
  pendingColor: '#F5A623',
  pendingBg:    '#FFF8EB',
  orderedColor: '#2563eb',
  orderedBg:    '#EBF4FF',
  deliveredColor: '#00B341',
  deliveredBg:  '#EDFBF3',
  cancelledColor: '#EE0000',
  cancelledBg:  '#FFF0F0',
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  pending:   { color: T.pendingColor,   bg: T.pendingBg,    label: 'Pending' },
  ordered:   { color: T.orderedColor,   bg: T.orderedBg,    label: 'Ordered' },
  received:  { color: T.deliveredColor, bg: T.deliveredBg,  label: 'Received' },
  delivered: { color: T.deliveredColor, bg: T.deliveredBg,  label: 'Delivered' },
  cancelled: { color: T.cancelledColor, bg: T.cancelledBg,  label: 'Cancelled' },
  draft:     { color: T.text3,          bg: T.border,        label: 'Draft' },
  sent:      { color: T.orderedColor,   bg: T.orderedBg,    label: 'Sent' },
  approved:  { color: T.pendingColor,   bg: T.pendingBg,    label: 'Approved' },
};

function statusCfg(status) {
  return STATUS[status] || STATUS.pending;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={[styles.skeletonLine, { width: '40%', height: 14, marginBottom: 10 }]} />
      <View style={[styles.skeletonLine, { width: '65%', height: 12, marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '80%', height: 11, marginBottom: 14 }]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[styles.skeletonLine, { width: 110, height: 32, borderRadius: 8 }]} />
        <View style={[styles.skeletonLine, { width: 80, height: 32, borderRadius: 8 }]} />
      </View>
    </View>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, iconColor }) {
  const Container = Platform.OS === 'web' ? View : Animated.View;
  const enterProp = Platform.OS === 'web'
    ? {}
    : { entering: FadeInDown.delay(100).springify() };

  return (
    <Container {...enterProp} style={styles.statCard}>
      <Ionicons name={icon} size={18} color={iconColor} style={{ marginBottom: 6 }} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Container>
  );
}

// ─── PO Card ──────────────────────────────────────────────────────────────────
function POCard({ po, index, onMarkReceived, onCancel }) {
  const { symbol } = useCurrency();
  const cfg = statusCfg(po.status);
  const total = parseFloat(po.total_amount || 0);
  // List response includes `_count.po_items`; the detail response includes a `po_items`
  // array. Neither is called `items`, so fall through the real backend shapes.
  const itemCount = Array.isArray(po.items)
    ? po.items.length
    : (po.po_items?.length ?? po._count?.po_items ?? po.item_count ?? 0);
  const date = new Date(po.order_date || po.created_at || Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const canReceive = ['pending', 'ordered', 'sent', 'approved'].includes(po.status);
  const canCancel  = ['pending', 'ordered', 'draft', 'sent', 'approved'].includes(po.status);

  const Container = Platform.OS === 'web' ? View : Animated.View;
  const enterProp = Platform.OS === 'web'
    ? {}
    : { entering: SlideInDown.delay(index * 60).springify().damping(18) };

  return (
    <Container {...enterProp} style={styles.card}>
      {/* Top row: PO number + status badge */}
      <View style={styles.cardRow}>
        <Text style={styles.poNum}>{po.po_number || `PO-${po.id}`}</Text>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Supplier */}
      <Text style={styles.supplierName}>
        {po.supplier?.name || po.supplier_name || 'Unknown Supplier'}
      </Text>

      {/* Items + amount + date */}
      <View style={[styles.cardRow, { marginTop: 6 }]}>
        <Text style={styles.itemPreview}>
          {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'No items'}
          {total > 0 ? ` · ${symbol}${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}
        </Text>
        <Text style={styles.dateText}>{date}</Text>
      </View>

      {/* Action buttons */}
      {(canReceive || canCancel) && (
        <View style={styles.actions}>
          {canReceive && (
            <TouchableOpacity
              style={styles.btnReceive}
              onPress={() => onMarkReceived(po)}
              activeOpacity={0.75}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color="#FFFFFF" />
              <Text style={styles.btnReceiveText}>Mark Received</Text>
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity
              style={styles.btnCancel}
              onPress={() => onCancel(po)}
              activeOpacity={0.75}
            >
              <Ionicons name="close-circle-outline" size={15} color={T.cancelledColor} />
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Container>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  const Container = Platform.OS === 'web' ? View : Animated.View;
  const enterProp = Platform.OS === 'web'
    ? {}
    : { entering: FadeInDown.delay(200).springify() };

  return (
    <Container {...enterProp} style={styles.emptyWrap}>
      <Ionicons name="cart-outline" size={52} color={T.text3} />
      <Text style={styles.emptyTitle}>No purchase orders</Text>
      <Text style={styles.emptySubtitle}>Tap + to create your first PO</Text>
    </Container>
  );
}

// ─── Create PO Modal ──────────────────────────────────────────────────────────
const EMPTY_ITEM = () => ({ name: '', qty: '', price: '' });

function CreatePOModal({ visible, onClose, onCreate, outletId }) {
  const insets = useSafeAreaInsets();
  const { symbol } = useCurrency();
  // Backend links a PO to a supplier by supplier_id (uuid FK) — a free-text name is
  // never persisted. So we fetch the outlet's suppliers and let the user pick one.
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierId, setSupplierId] = useState(null);
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setSuppliersLoading(true);
    api.get('/suppliers', { params: outletId ? { outlet_id: outletId } : {} })
      .then((res) => {
        if (cancelled) return;
        const list = res?.data ?? res ?? [];
        setSuppliers(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setSuppliers([]); })
      .finally(() => { if (!cancelled) setSuppliersLoading(false); });
    return () => { cancelled = true; };
  }, [visible, outletId]);

  const slideY = useSharedValue(500);
  React.useEffect(() => {
    if (visible) {
      slideY.value = withSpring(0, { mass: 1, stiffness: 120, damping: 18 });
    } else {
      slideY.value = withTiming(500, { duration: 260 });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  const total = useMemo(() => {
    return items.reduce((sum, it) => {
      const q = parseFloat(it.qty) || 0;
      const p = parseFloat(it.price) || 0;
      return sum + q * p;
    }, 0);
  }, [items]);

  const updateItem = useCallback((idx, field, val) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  }, []);

  const addItem = useCallback(() => {
    setItems(prev => [...prev, EMPTY_ITEM()]);
  }, []);

  const removeItem = useCallback((idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(async () => {
    const validItems = items.filter(it => it.name.trim());
    if (validItems.length === 0) {
      Alert.alert('Required', 'Add at least one item.');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        // Backend expects supplier_id (uuid). Optional — a PO can have no supplier.
        supplier_id: supplierId || null,
        items: validItems.map(it => ({
          // Backend PO line-item field is `item_name`, not `name` — a `name` key is
          // stripped by validation and the supplier/items silently drop.
          item_name: it.name.trim(),
          quantity: parseFloat(it.qty) || 1,
          unit_price: parseFloat(it.price) || 0,
        })),
        total_amount: total,
      });
      setSupplierId(null);
      setItems([EMPTY_ITEM()]);
      onClose();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  }, [supplierId, items, total, onCreate, onClose]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrapper}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, sheetStyle, { paddingBottom: insets.bottom + 20 }]}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          <Text style={styles.sheetTitle}>New Purchase Order</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Supplier */}
            <Text style={styles.inputLabel}>Supplier</Text>
            {suppliersLoading ? (
              <Text style={styles.supplierHint}>Loading suppliers…</Text>
            ) : suppliers.length === 0 ? (
              <Text style={styles.supplierHint}>
                No suppliers yet — this PO will be created without one.
              </Text>
            ) : (
              <View style={styles.supplierChips}>
                {suppliers.map((s) => {
                  const selected = supplierId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.supplierChip, selected && styles.supplierChipActive]}
                      onPress={() => setSupplierId(selected ? null : s.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.supplierChipText, selected && styles.supplierChipTextActive]}>
                        {s.name || 'Unnamed supplier'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Items */}
            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Items</Text>
            {items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <TextInput
                  style={[styles.input, styles.itemNameInput]}
                  value={item.name}
                  onChangeText={v => updateItem(idx, 'name', v)}
                  placeholder="Item name"
                  placeholderTextColor={T.text3}
                />
                <TextInput
                  style={[styles.input, styles.itemQtyInput]}
                  value={item.qty}
                  onChangeText={v => updateItem(idx, 'qty', v)}
                  placeholder="Qty"
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.itemPriceInput]}
                  value={item.price}
                  onChangeText={v => updateItem(idx, 'price', v)}
                  placeholder={symbol}
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                />
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={20} color={T.cancelledColor} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Ionicons name="add-circle-outline" size={18} color={T.text1} />
              <Text style={styles.addItemText}>Add Item</Text>
            </TouchableOpacity>

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {symbol}{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.submitText}>
                {submitting ? 'Creating…' : 'Create Purchase Order'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress }) {
  const scale = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  React.useEffect(() => {
    if (Platform.OS !== 'web') {
      scale.value = withDelay(300, withSpring(1, { mass: 0.7, stiffness: 200, damping: 12 }));
    }
  }, []);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fabWrap, fabStyle]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.fab}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PurchaseOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { symbol } = useCurrency();
  const [modalVisible, setModalVisible] = useState(false);

  const { outletId } = useOutlet();
  const { data: raw, isLoading, isFetching, refetch } = usePurchaseOrders();
  const createPO = useCreatePurchaseOrder();
  const receivePO = useReceivePurchaseOrder();
  const cancelPO  = useCancelPurchaseOrder();

  const pos = useMemo(() => {
    const list = raw?.items || raw?.data?.items || raw?.data || raw || [];
    return Array.isArray(list) ? list : [];
  }, [raw]);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let pendingCount = 0;
    let pendingDelivery = 0;
    let monthSpend = 0;

    for (const po of pos) {
      if (['pending', 'ordered', 'draft', 'sent', 'approved'].includes(po.status)) {
        pendingCount++;
        pendingDelivery++;
      }
      const d = new Date(po.order_date || po.created_at);
      if (d >= monthStart) {
        monthSpend += parseFloat(po.total_amount || 0);
      }
    }
    return { pendingCount, monthSpend, pendingDelivery };
  }, [pos]);

  const totalPending = useMemo(() => {
    return pos
      .filter(p => ['pending', 'ordered', 'draft', 'sent', 'approved'].includes(p.status))
      .reduce((sum, p) => sum + parseFloat(p.total_amount || 0), 0);
  }, [pos]);

  // Handlers
  const handleMarkReceived = useCallback((po) => {
    Alert.alert(
      'Mark as Received',
      `Mark ${po.po_number || 'this PO'} as received?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () => {
            receivePO.mutate(
              { id: po.id, outlet_id: outletId },
              { onError: (e) => Alert.alert('Error', e?.message || 'Failed to update') }
            );
          },
        },
      ]
    );
  }, [receivePO, outletId]);

  const handleCancel = useCallback((po) => {
    Alert.alert(
      'Cancel PO',
      `Cancel ${po.po_number || 'this PO'}? This cannot be undone.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel PO',
          style: 'destructive',
          onPress: () => {
            cancelPO.mutate(
              { id: po.id, outlet_id: outletId },
              { onError: (e) => Alert.alert('Error', e?.message || 'Failed to cancel') }
            );
          },
        },
      ]
    );
  }, [cancelPO, outletId]);

  const handleCreate = useCallback(async (data) => {
    await createPO.mutateAsync({ ...data, outlet_id: outletId });
  }, [createPO, outletId]);

  const renderItem = useCallback(({ item, index }) => (
    <POCard
      po={item}
      index={index}
      onMarkReceived={handleMarkReceived}
      onCancel={handleCancel}
    />
  ), [handleMarkReceived, handleCancel]);

  const keyExtractor = useCallback(
    (item) => String(item.id || item.po_number || Math.random()),
    []
  );

  const ListHeader = useMemo(() => (
    <View style={styles.statsRow}>
      <StatCard
        label="Pending POs"
        value={String(stats.pendingCount)}
        icon="time-outline"
        iconColor={T.pendingColor}
      />
      <StatCard
        label="Month Spend"
        value={`${symbol}${stats.monthSpend >= 1000
          ? (stats.monthSpend / 1000).toFixed(1) + 'K'
          : stats.monthSpend.toFixed(0)}`}
        icon="wallet-outline"
        iconColor={T.orderedColor}
      />
      <StatCard
        label="Awaiting"
        value={String(stats.pendingDelivery)}
        icon="cube-outline"
        iconColor={T.deliveredColor}
      />
    </View>
  ), [stats, symbol]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Purchase Orders</Text>
          <Text style={styles.headerSub}>Manage your supplier orders</Text>
        </View>
        {totalPending > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeLabel}>Pending Spend</Text>
            <Text style={styles.pendingBadgeAmount}>
              {symbol}{totalPending >= 1000
                ? (totalPending / 1000).toFixed(1) + 'K'
                : totalPending.toFixed(0)}
            </Text>
          </View>
        )}
      </View>

      {/* Content */}
      {isLoading ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </ScrollView>
      ) : (
        <FlashList
          data={pos}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={145}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={<EmptyState />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={T.text3}
              colors={[T.text1]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <FAB onPress={() => setModalVisible(true)} />

      {/* Create PO Modal */}
      <CreatePOModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreate={handleCreate}
        outletId={outletId}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.pageBg,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: T.card,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: {
    color: T.text1,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSub: {
    color: T.text3,
    fontSize: 12,
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: T.pendingBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pendingBadgeLabel: {
    color: T.pendingColor,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pendingBadgeAmount: {
    color: T.pendingColor,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },

  // ── Stat cards ───────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: T.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  statValue: {
    color: T.text1,
    fontSize: 17,
    fontWeight: '800',
  },
  statLabel: {
    color: T.text3,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },

  // ── PO card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  poNum: {
    color: T.text1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  supplierName: {
    color: T.text2,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  itemPreview: {
    color: T.text3,
    fontSize: 12,
  },
  dateText: {
    color: T.text3,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  btnReceive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: '#2563eb',
  },
  btnReceiveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  btnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: T.cancelledBg,
  },
  btnCancelText: {
    color: T.cancelledColor,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Skeleton ─────────────────────────────────────────────────────────────────
  skeletonLine: {
    backgroundColor: T.border,
    borderRadius: 6,
  },

  // ── Empty ─────────────────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 72,
  },
  emptyTitle: {
    color: T.text3,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 14,
  },
  emptySubtitle: {
    color: T.text3,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // ── FAB ───────────────────────────────────────────────────────────────────────
  fabWrap: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 10,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Modal / Sheet ─────────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  kvWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: T.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: T.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: T.text1,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 20,
  },

  // ── Form inputs ───────────────────────────────────────────────────────────────
  inputLabel: {
    color: T.text2,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: T.pageBg,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: T.text1,
    fontSize: 14,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 8,
  },
  supplierHint: {
    color: T.text3,
    fontSize: 13,
    marginBottom: 8,
  },
  supplierChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  supplierChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: T.pageBg,
    borderWidth: 1,
    borderColor: T.border,
  },
  supplierChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  supplierChipText: {
    color: T.text2,
    fontSize: 13,
    fontWeight: '600',
  },
  supplierChipTextActive: {
    color: '#FFFFFF',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemNameInput: {
    flex: 2,
    marginBottom: 8,
  },
  itemQtyInput: {
    flex: 0.6,
    marginBottom: 8,
  },
  itemPriceInput: {
    flex: 1,
    marginBottom: 8,
  },
  removeBtn: {
    paddingBottom: 8,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  addItemText: {
    color: T.text1,
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: T.border,
    marginTop: 4,
    marginBottom: 16,
  },
  totalLabel: {
    color: T.text2,
    fontSize: 14,
    fontWeight: '600',
  },
  totalValue: {
    color: T.text1,
    fontSize: 20,
    fontWeight: '800',
  },
  submitBtn: {
    borderRadius: 10,
    backgroundColor: '#2563eb',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
