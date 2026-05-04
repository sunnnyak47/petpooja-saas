import React, {
  useState,
  useRef,
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
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  FadeInDown,
  SlideInDown,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import {
  usePurchaseOrders,
  useCreatePurchaseOrder,
} from '../../src/hooks/useApi';

// ─── Theme constants ──────────────────────────────────────────────────────────
const T = {
  bg:      '#080F1E',
  surface: '#0F1D35',
  surf2:   '#162840',
  border:  '#1E3A5F',
  gold:    '#C9A84C',
  indigo:  '#5B5EF4',
  success: '#10C98A',
  warning: '#F5A623',
  error:   '#F05252',
  text1:   '#F0F4FF',
  text2:   '#A8B8D0',
  text3:   '#5A7090',
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  pending:   { color: T.warning, border: T.warning, bg: '#3D280A', label: 'Pending' },
  ordered:   { color: T.indigo,  border: T.indigo,  bg: '#1A1A50', label: 'Ordered' },
  received:  { color: T.success, border: T.success, bg: '#0D3D2A', label: 'Received' },
  cancelled: { color: T.error,   border: T.error,   bg: '#3D0D0D', label: 'Cancelled' },
  // legacy map
  draft:     { color: T.text2,   border: T.border,  bg: T.surf2,   label: 'Draft' },
  sent:      { color: T.indigo,  border: T.indigo,  bg: '#1A1A50', label: 'Sent' },
  approved:  { color: T.warning, border: T.warning, bg: '#3D280A', label: 'Approved' },
};

function statusCfg(status) {
  return STATUS[status] || STATUS.pending;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  const opacity = useSharedValue(0.4);
  React.useEffect(() => {
    opacity.value = withSpring(1, { mass: 1, stiffness: 80, damping: 15 });
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(opacity.value, [0.4, 1], [0.3, 0.7], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[styles.card, animStyle]}>
      <View style={[styles.skeletonLine, { width: '40%', height: 14, marginBottom: 10 }]} />
      <View style={[styles.skeletonLine, { width: '65%', height: 12, marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '80%', height: 11, marginBottom: 14 }]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[styles.skeletonLine, { width: 80, height: 30, borderRadius: 8 }]} />
        <View style={[styles.skeletonLine, { width: 80, height: 30, borderRadius: 8 }]} />
      </View>
    </Animated.View>
  );
}

// ─── Summary stat card ────────────────────────────────────────────────────────
function StatCard({ label, value, icon, accent }) {
  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} style={[styles.statCard, { borderTopColor: accent, borderTopWidth: 2 }]}>
      <Ionicons name={icon} size={18} color={accent} style={{ marginBottom: 6 }} />
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ─── Purchase Order Card ──────────────────────────────────────────────────────
function POCard({ po, index, onMarkReceived, onCancel }) {
  const cfg = statusCfg(po.status);
  const total = parseFloat(po.total_amount || 0);
  const itemCount = Array.isArray(po.items) ? po.items.length : (po.item_count || 0);
  const date = new Date(po.order_date || po.created_at || Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const canReceive = ['pending', 'ordered', 'sent', 'approved'].includes(po.status);
  const canCancel  = ['pending', 'ordered', 'draft', 'sent', 'approved'].includes(po.status);

  return (
    <Animated.View
      entering={SlideInDown.delay(index * 60).springify().damping(18)}
      style={[styles.card, { borderLeftColor: cfg.border, borderLeftWidth: 3 }]}
    >
      {/* Top row */}
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

      {/* Items preview + date */}
      <View style={[styles.cardRow, { marginTop: 6 }]}>
        <Text style={styles.itemPreview}>
          {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'No items'}
          {total > 0 ? ` · ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}
        </Text>
        <Text style={styles.dateText}>{date}</Text>
      </View>

      {/* Action buttons */}
      {(canReceive || canCancel) && (
        <View style={styles.actions}>
          {canReceive && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#0D3D2A' }]}
              onPress={() => onMarkReceived(po)}
              activeOpacity={0.75}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color={T.success} />
              <Text style={[styles.actionText, { color: T.success }]}>Mark Received</Text>
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#3D0D0D' }]}
              onPress={() => onCancel(po)}
              activeOpacity={0.75}
            >
              <Ionicons name="close-circle-outline" size={15} color={T.error} />
              <Text style={[styles.actionText, { color: T.error }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.emptyWrap}>
      <Ionicons name="cart-outline" size={52} color={T.text3} />
      <Text style={styles.emptyTitle}>No Purchase Orders</Text>
      <Text style={styles.emptySubtitle}>Tap the + button to create your first PO</Text>
    </Animated.View>
  );
}

// ─── Create PO Modal ──────────────────────────────────────────────────────────
const EMPTY_ITEM = () => ({ name: '', qty: '', price: '' });

function CreatePOModal({ visible, onClose, onCreate }) {
  const insets = useSafeAreaInsets();
  const [supplier, setSupplier] = useState('');
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [submitting, setSubmitting] = useState(false);

  const slideY = useSharedValue(400);
  React.useEffect(() => {
    if (visible) {
      slideY.value = withSpring(0, { mass: 1, stiffness: 120, damping: 18 });
    } else {
      slideY.value = withTiming(400, { duration: 280 });
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
    if (!supplier.trim()) {
      Alert.alert('Required', 'Please enter a supplier name.');
      return;
    }
    const validItems = items.filter(it => it.name.trim());
    if (validItems.length === 0) {
      Alert.alert('Required', 'Add at least one item.');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        supplier_name: supplier.trim(),
        items: validItems.map(it => ({
          name: it.name.trim(),
          quantity: parseFloat(it.qty) || 1,
          unit_price: parseFloat(it.price) || 0,
        })),
        total_amount: total,
      });
      // Reset
      setSupplier('');
      setItems([EMPTY_ITEM()]);
      onClose();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  }, [supplier, items, total, onCreate, onClose]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrapper}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, sheetStyle, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          <Text style={styles.sheetTitle}>New Purchase Order</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Supplier */}
            <Text style={styles.inputLabel}>Supplier Name</Text>
            <TextInput
              style={styles.input}
              value={supplier}
              onChangeText={setSupplier}
              placeholder="e.g. Fresh Farms Ltd"
              placeholderTextColor={T.text3}
            />

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
                  placeholder="₹"
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                />
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={20} color={T.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Ionicons name="add-circle-outline" size={18} color={T.gold} />
              <Text style={styles.addItemText}>Add Item</Text>
            </TouchableOpacity>

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#C9A84C', '#A07830']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                <Text style={styles.submitText}>
                  {submitting ? 'Creating…' : 'Create Purchase Order'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress }) {
  const scale = useSharedValue(0);
  React.useEffect(() => {
    scale.value = withDelay(300, withSpring(1, { mass: 0.7, stiffness: 200, damping: 12 }));
  }, []);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fabWrap, fabStyle]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.fabTouch}>
        <LinearGradient
          colors={['#D4B050', '#C9A84C', '#A07830']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Ionicons name="add" size={28} color="#080F1E" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PurchaseOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);

  const { data: raw, isLoading, isFetching, refetch } = usePurchaseOrders();
  const createPO = useCreatePurchaseOrder();

  const pos = useMemo(() => {
    const list = raw?.items || raw?.data?.items || raw?.data || raw || [];
    return Array.isArray(list) ? list : [];
  }, [raw]);

  // ── Summary stats ──────────────────────────────────────────────────────────
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

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleMarkReceived = useCallback((po) => {
    Alert.alert(
      'Mark as Received',
      `Mark ${po.po_number || 'this PO'} as received?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              const api = (await import('../../src/lib/api')).default;
              await api.patch(`/purchase-orders/${po.id}`, { status: 'received' });
              refetch();
            } catch (e) {
              Alert.alert('Error', e?.message || 'Failed to update');
            }
          },
        },
      ]
    );
  }, [refetch]);

  const handleCancel = useCallback((po) => {
    Alert.alert(
      'Cancel PO',
      `Cancel ${po.po_number || 'this PO'}? This cannot be undone.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel PO',
          style: 'destructive',
          onPress: async () => {
            try {
              const api = (await import('../../src/lib/api')).default;
              await api.patch(`/purchase-orders/${po.id}`, { status: 'cancelled' });
              refetch();
            } catch (e) {
              Alert.alert('Error', e?.message || 'Failed to cancel');
            }
          },
        },
      ]
    );
  }, [refetch]);

  const handleCreate = useCallback(async (data) => {
    await createPO.mutateAsync(data);
  }, [createPO]);

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item, index }) => (
    <POCard
      po={item}
      index={index}
      onMarkReceived={handleMarkReceived}
      onCancel={handleCancel}
    />
  ), [handleMarkReceived, handleCancel]);

  const keyExtractor = useCallback((item) => String(item.id || item.po_number || Math.random()), []);

  const ListHeader = useMemo(() => (
    <View style={styles.statsRow}>
      <StatCard
        label="Pending POs"
        value={String(stats.pendingCount)}
        icon="time-outline"
        accent={T.warning}
      />
      <StatCard
        label="Month Spend"
        value={`₹${stats.monthSpend >= 1000
          ? (stats.monthSpend / 1000).toFixed(1) + 'K'
          : stats.monthSpend.toFixed(0)}`}
        icon="wallet-outline"
        accent={T.gold}
      />
      <StatCard
        label="Pending Delivery"
        value={String(stats.pendingDelivery)}
        icon="cube-outline"
        accent={T.indigo}
      />
    </View>
  ), [stats]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#0F2040', '#0A1628', '#080F1E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View>
          <Text style={styles.headerTitle}>Purchase Orders</Text>
          <Text style={styles.headerSub}>Manage your supplier orders</Text>
        </View>
        {totalPending > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeLabel}>Pending</Text>
            <Text style={styles.pendingBadgeAmount}>
              ₹{totalPending >= 1000
                ? (totalPending / 1000).toFixed(1) + 'K'
                : totalPending.toFixed(0)}
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* ── Content ────────────────────────────────────────────────────────── */}
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
          estimatedItemSize={140}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={<EmptyState />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={T.gold}
              colors={[T.gold]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <FAB onPress={() => setModalVisible(true)} />

      {/* ── Create PO Modal ─────────────────────────────────────────────────── */}
      <CreatePOModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreate={handleCreate}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.bg,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: T.text1,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSub: {
    color: T.text3,
    fontSize: 12,
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: '#3D280A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.warning + '40',
  },
  pendingBadgeLabel: {
    color: T.warning,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pendingBadgeAmount: {
    color: T.warning,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },

  // Summary stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: T.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  statValue: {
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

  // Card
  card: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.border,
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
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  supplierName: {
    color: T.text2,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemPreview: {
    color: T.text3,
    fontSize: 12,
    fontWeight: '500',
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
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Skeleton
  skeletonLine: {
    backgroundColor: T.surf2,
    borderRadius: 6,
  },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
  },
  emptyTitle: {
    color: T.text2,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    color: T.text3,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // FAB
  fabWrap: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    shadowColor: T.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 12,
  },
  fabTouch: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal / Sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kvWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '90%',
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

  // Form inputs
  inputLabel: {
    color: T.text2,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: T.surf2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: T.text1,
    fontSize: 14,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 0,
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
    color: T.gold,
    fontSize: 13,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: T.border,
    marginTop: 6,
    marginBottom: 16,
  },
  totalLabel: {
    color: T.text2,
    fontSize: 14,
    fontWeight: '600',
  },
  totalValue: {
    color: T.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  submitBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  submitGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#080F1E',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
