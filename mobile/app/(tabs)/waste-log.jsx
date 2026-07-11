import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  FadeIn,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import {
  useWasteLog,
  useStockItems,
  useRecordWaste,
  groupWasteByDay,
  computeTodaySummary,
  timeLabel,
  reasonMeta,
  WASTE_REASONS,
} from '../../src/hooks/useWasteLog';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#f8fafc',
  surface: '#ffffff',
  surface2: '#f8fafc',
  border: '#e2e8f0',
  indigo: '#2563eb',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  text1: '#0f172a',
  text2: '#475569',
  text3: '#94a3b8',
};

// FlashList works on a flat array; we flatten grouped data into header + entry rows.
const ROW_HEADER = 'header';
const ROW_ENTRY = 'entry';

function flattenGroups(groups) {
  const out = [];
  for (const g of groups) {
    out.push({ type: ROW_HEADER, key: `h-${g.key}`, group: g });
    for (const e of g.entries) out.push({ type: ROW_ENTRY, key: `e-${e.id}`, entry: e });
  }
  return out;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function WasteSkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 4 }}>
        <SkeletonBox width="48%" height={92} borderRadius={16} color="#f1f5f9" />
        <SkeletonBox width="48%" height={92} borderRadius={16} color="#f1f5f9" />
      </View>
      <SkeletonBox width={120} height={20} borderRadius={6} color="#f1f5f9" />
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBox key={i} width="100%" height={72} borderRadius={16} color="#f1f5f9" />
      ))}
    </View>
  );
}

// ─── Summary Stat Card ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Day header row ─────────────────────────────────────────────────────────────
function DayHeader({ group, symbol }) {
  return (
    <View style={styles.dayHeader}>
      <Text style={styles.dayHeaderLabel}>{group.label}</Text>
      <View style={styles.dayHeaderRight}>
        <Text style={styles.dayHeaderCount}>
          {group.entryCount} {group.entryCount === 1 ? 'entry' : 'entries'}
        </Text>
        {group.hasCost && (
          <Text style={styles.dayHeaderCost}>
            {symbol}{group.totalCost.toFixed(group.totalCost >= 100 ? 0 : 2)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Entry row ──────────────────────────────────────────────────────────────────
function EntryRow({ entry, symbol }) {
  const meta = reasonMeta(entry.reason);
  const isWeb = Platform.OS === 'web';
  return (
    <Animated.View
      entering={isWeb ? undefined : FadeIn.duration(220)}
      style={styles.entryRow}
    >
      <View style={[styles.entryIcon, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={styles.entryName} numberOfLines={1}>{entry.itemName}</Text>
        <View style={styles.entryMeta}>
          <View style={[styles.reasonTag, { backgroundColor: meta.color + '14' }]}>
            <Text style={[styles.reasonTagText, { color: meta.color }]}>{entry.reason}</Text>
          </View>
          {entry.createdAt ? (
            <Text style={styles.entryTime}>{timeLabel(entry.createdAt)}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.entryRight}>
        <Text style={styles.entryQty}>
          {entry.quantity}{entry.unit ? ` ${entry.unit}` : ''}
        </Text>
        {entry.hasCost ? (
          <Text style={styles.entryCost}>
            {symbol}{entry.lineCost.toFixed(entry.lineCost >= 100 ? 0 : 2)}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ─── FAB ────────────────────────────────────────────────────────────────────────
function FAB({ onPress, bottomOffset }) {
  const scale = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    scale.value = withDelay(300, withSpring(1, { damping: 10, stiffness: 160 }));
  }, []);
  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.fab, { bottom: 24 + bottomOffset }, fabStyle]}>
      <PressCard onPress={onPress} style={styles.fabInner} scaleDown={0.9}>
        <View style={styles.fabGradient}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </View>
      </PressCard>
    </Animated.View>
  );
}

// ─── Record Waste Modal ──────────────────────────────────────────────────────────
function RecordWasteModal({ visible, onClose, onSubmit, isSaving, items, itemsLoading }) {
  const { symbol } = useCurrency();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) {
      setSearch('');
      setSelected(null);
      setQuantity('');
      setReason('');
    }
  }, [visible]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const estCost = useMemo(() => {
    if (!selected || !quantity) return 0;
    const q = parseFloat(quantity);
    if (!Number.isFinite(q)) return 0;
    return q * (selected.costPerUnit || 0);
  }, [selected, quantity]);

  const handleSubmit = useCallback(() => {
    if (!selected) {
      Alert.alert('Pick an item', 'Select which inventory item was wasted.');
      return;
    }
    const q = parseFloat(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      Alert.alert('Enter a quantity', 'Quantity must be greater than zero.');
      return;
    }
    if (!reason) {
      Alert.alert('Pick a reason', 'Select a reason for the wastage.');
      return;
    }
    onSubmit({ item_id: selected.id, quantity: q, reason });
  }, [selected, quantity, reason, onSubmit]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handleBar} />
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>Record Waste</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={C.text1} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={modalStyles.scrollContent}
          >
            {/* Item picker */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Item</Text>
              {selected ? (
                <TouchableOpacity
                  style={modalStyles.selectedItem}
                  onPress={() => setSelected(null)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.selectedItemName}>{selected.name}</Text>
                    <Text style={modalStyles.selectedItemSub}>
                      In stock: {selected.currentStock}{selected.unit ? ` ${selected.unit}` : ''}
                      {selected.costPerUnit > 0
                        ? `  •  ${symbol}${selected.costPerUnit}/${selected.unit || 'unit'}`
                        : ''}
                    </Text>
                  </View>
                  <Ionicons name="swap-horizontal" size={18} color={C.indigo} />
                </TouchableOpacity>
              ) : (
                <>
                  <View style={modalStyles.searchRow}>
                    <Ionicons name="search-outline" size={16} color={C.text3} />
                    <TextInput
                      style={modalStyles.searchInput}
                      placeholder="Search items…"
                      placeholderTextColor={C.text3}
                      value={search}
                      onChangeText={setSearch}
                    />
                  </View>
                  <View style={modalStyles.itemList}>
                    {itemsLoading ? (
                      <Text style={modalStyles.itemHint}>Loading items…</Text>
                    ) : filtered.length === 0 ? (
                      <Text style={modalStyles.itemHint}>
                        {items.length === 0 ? 'No inventory items yet.' : 'No matches.'}
                      </Text>
                    ) : (
                      <ScrollView
                        style={{ maxHeight: 200 }}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                      >
                        {filtered.slice(0, 40).map((it) => (
                          <TouchableOpacity
                            key={it.id}
                            style={modalStyles.itemOption}
                            onPress={() => { setSelected(it); setSearch(''); }}
                            activeOpacity={0.7}
                          >
                            <Text style={modalStyles.itemOptionName} numberOfLines={1}>{it.name}</Text>
                            <Text style={modalStyles.itemOptionStock}>
                              {it.currentStock}{it.unit ? ` ${it.unit}` : ''}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </>
              )}
            </View>

            {/* Quantity */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>
                Quantity Wasted{selected?.unit ? ` (${selected.unit})` : ''}
              </Text>
              <TextInput
                style={modalStyles.input}
                placeholder="0"
                placeholderTextColor={C.text3}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Reason */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Reason</Text>
              <View style={modalStyles.pillsRow}>
                {WASTE_REASONS.map((r) => {
                  const active = reason === r;
                  const meta = reasonMeta(r);
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[
                        modalStyles.reasonPill,
                        active && { backgroundColor: meta.color, borderColor: meta.color },
                      ]}
                      onPress={() => setReason(r)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={meta.icon}
                        size={13}
                        color={active ? '#fff' : meta.color}
                      />
                      <Text
                        style={[
                          modalStyles.reasonPillText,
                          { color: active ? '#fff' : C.text2 },
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Estimated cost preview */}
            {selected && selected.costPerUnit > 0 && parseFloat(quantity) > 0 ? (
              <View style={modalStyles.costPreview}>
                <Ionicons name="cash-outline" size={16} color={C.warning} />
                <Text style={modalStyles.costPreviewText}>
                  Estimated loss: <Text style={modalStyles.costPreviewValue}>{symbol}{estCost.toFixed(estCost >= 100 ? 0 : 2)}</Text>
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[modalStyles.saveBtn, isSaving && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={17} color="#fff" style={{ marginRight: 8 }} />
              <Text style={modalStyles.saveBtnText}>
                {isSaving ? 'Recording…' : 'Record Waste'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WasteLogScreen() {
  const insets = useSafeAreaInsets();
  const { outletId } = useOutlet();
  const { symbol } = useCurrency();

  const { data: rows = [], isLoading, refetch, isRefetching } = useWasteLog();
  const { data: items = [], isLoading: itemsLoading } = useStockItems();
  const { mutate: recordWaste, isPending: isSaving } = useRecordWaste();

  const [modalVisible, setModalVisible] = useState(false);

  const groups = useMemo(() => groupWasteByDay(rows), [rows]);
  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const today = useMemo(() => computeTodaySummary(rows), [rows]);

  const openModal = useCallback(() => setModalVisible(true), []);
  const closeModal = useCallback(() => setModalVisible(false), []);

  const handleSubmit = useCallback(
    (payload) => {
      if (!outletId) {
        Alert.alert('No outlet', 'Select an outlet before recording waste.');
        return;
      }
      recordWaste(
        { outlet_id: outletId, ...payload },
        {
          onSuccess: () => closeModal(),
          onError: (err) =>
            Alert.alert('Error', err?.message ?? 'Failed to record waste. Try again.'),
        }
      );
    },
    [outletId, recordWaste, closeModal]
  );

  const renderItem = useCallback(
    ({ item }) =>
      item.type === ROW_HEADER ? (
        <DayHeader group={item.group} symbol={symbol} />
      ) : (
        <EntryRow entry={item.entry} symbol={symbol} />
      ),
    [symbol]
  );

  const keyExtractor = useCallback((item) => item.key, []);
  const getItemType = useCallback((item) => item.type, []);

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Waste Log</Text>
          <Text style={styles.headerSub}>Track food wastage</Text>
        </View>
        <WasteSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Waste Log</Text>
            <Text style={styles.headerSub}>
              Track food wastage
              {rows.length > 0 ? `  •  ${rows.length} total` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={20} color={C.text3} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Today summary */}
      <View style={styles.summaryRow}>
        <StatCard
          label="Logged Today"
          value={today.count}
          sub={today.count === 1 ? 'entry' : 'entries'}
          color={C.indigo}
          icon="today-outline"
        />
        <StatCard
          label="Est. Waste Cost"
          value={today.hasCost ? `${symbol}${today.totalCost.toFixed(today.totalCost >= 100 ? 0 : 2)}` : '—'}
          sub={today.hasCost ? 'today' : 'no cost data'}
          color={today.hasCost ? C.warning : C.text3}
          icon="cash-outline"
        />
      </View>

      {/* List */}
      <FlashList
        data={flat}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        estimatedItemSize={72}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 120 + insets.bottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={C.indigo}
            colors={[C.indigo]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="🗑️"
            title="No wastage logged"
            subtitle="Record spoiled, expired or spilled items to keep your stock and costs accurate."
            action={{ label: 'Record Waste', onPress: openModal }}
          />
        }
      />

      <FAB onPress={openModal} bottomOffset={insets.bottom} />

      <RecordWasteModal
        visible={modalVisible}
        onClose={closeModal}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        items={items}
        itemsLoading={itemsLoading}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: C.text1, letterSpacing: 0.3 },
  headerSub: { fontSize: 13, color: C.text3, marginTop: 4, fontWeight: '600' },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 2,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 4,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: C.text1, letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: '700', color: C.text2 },
  statSub: { fontSize: 11, color: C.text3, fontWeight: '600' },

  // Day header
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 8,
  },
  dayHeaderLabel: { fontSize: 14, fontWeight: '800', color: C.text1, letterSpacing: 0.2 },
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayHeaderCount: { fontSize: 12, fontWeight: '600', color: C.text3 },
  dayHeaderCost: {
    fontSize: 12,
    fontWeight: '800',
    color: C.warning,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },

  // Entry row
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryName: { fontSize: 15, fontWeight: '700', color: C.text1, letterSpacing: -0.2 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  reasonTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  reasonTagText: { fontSize: 11, fontWeight: '700' },
  entryTime: { fontSize: 12, color: C.text3, fontWeight: '600' },
  entryRight: { alignItems: 'flex-end', minWidth: 60 },
  entryQty: { fontSize: 16, fontWeight: '800', color: C.text1, letterSpacing: -0.3 },
  entryCost: { fontSize: 12, color: C.warning, fontWeight: '700', marginTop: 3 },

  // FAB
  fab: { position: 'absolute', right: 20 },
  fabInner: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Modal Styles ───────────────────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: 20, gap: 18, paddingBottom: 36 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.text2 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.text1,
    backgroundColor: C.surface,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text1, padding: 0 },
  itemList: { borderRadius: 10 },
  itemHint: { fontSize: 13, color: C.text3, paddingVertical: 10, textAlign: 'center' },
  itemOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemOptionName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text1, marginRight: 10 },
  itemOptionStock: { fontSize: 12, color: C.text3, fontWeight: '600' },
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.indigo,
    backgroundColor: 'rgba(37,99,235,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedItemName: { fontSize: 15, fontWeight: '700', color: C.text1 },
  selectedItemSub: { fontSize: 12, color: C.text2, marginTop: 3, fontWeight: '600' },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  reasonPillText: { fontSize: 12, fontWeight: '700' },
  costPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: C.warning,
  },
  costPreviewText: { fontSize: 13, color: '#92400e', fontWeight: '600' },
  costPreviewValue: { fontWeight: '800', color: '#92400e' },
  saveBtn: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: C.error,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
