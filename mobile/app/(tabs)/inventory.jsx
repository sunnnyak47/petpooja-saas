import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  Dimensions,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInventory, useUpdateInventory, useCreateInventoryItem } from '../../src/hooks/useApi';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';

// ─── Design Tokens ──────────────────────────────────────────────────────────
const C = {
  bg: '#F7F7F7',
  surface: '#FFFFFF',
  surface2: '#FAFAFA',
  border: '#EAEAEA',
  gold: '#F5A623',
  indigo: '#2563eb',
  success: '#00B341',
  warning: '#F5A623',
  error: '#EE0000',
  text1: '#0f172a',
  text2: '#444444',
  text3: '#888888',
};

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Category Config ─────────────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'All', color: '#2563eb' },
  { label: 'Vegetables', color: '#4CAF82' },
  { label: 'Grains', color: '#D4A027' },
  { label: 'Dairy', color: '#2196F3' },
  { label: 'Spices', color: '#E07843' },
  { label: 'Beverages', color: '#9B59B6' },
  { label: 'Others', color: '#888888' },
];

const MOCK_INVENTORY = [
  { id: '1', name: 'Tomatoes', category: 'Vegetables', current_stock: 2.5, unit: 'kg', reorder_point: 5, price: 40, status: 'low' },
  { id: '2', name: 'Chicken', category: 'Proteins', current_stock: 15, unit: 'kg', reorder_point: 10, price: 280, status: 'ok' },
  { id: '3', name: 'Basmati Rice', category: 'Grains', current_stock: 8, unit: 'kg', reorder_point: 5, price: 120, status: 'ok' },
  { id: '4', name: 'Butter', category: 'Dairy', current_stock: 0.5, unit: 'kg', reorder_point: 2, price: 480, status: 'critical' },
  { id: '5', name: 'Paneer', category: 'Dairy', current_stock: 3, unit: 'kg', reorder_point: 3, price: 320, status: 'ok' },
  { id: '6', name: 'Onions', category: 'Vegetables', current_stock: 12, unit: 'kg', reorder_point: 8, price: 35, status: 'ok' },
];

const CATEGORY_COLOR_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.label.toLowerCase(), c.color])
);

function getCategoryColor(cat) {
  if (!cat) return C.text3;
  return CATEGORY_COLOR_MAP[cat.toLowerCase()] ?? C.text3;
}

// ─── Inventory Skeleton (Phase 3) ────────────────────────────────────────────
function InventorySkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {[0, 1, 2].map((i) => (
          <SkeletonBox key={i} width={80} height={36} borderRadius={999} color="#F0F0F0" />
        ))}
      </View>
      {[0, 1, 2, 3, 4].map((i) => (
        <SkeletonBox key={i} width="100%" height={88} borderRadius={16} color="#F0F0F0" />
      ))}
    </View>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, color, icon, pulse }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (pulse) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1
      );
    }
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: color,
  }));

  return (
    <View style={styles.summaryCard}>
      <Animated.View style={[styles.summaryRing, ringStyle]}>
        <Ionicons name={icon} size={18} color={color} />
      </Animated.View>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ─── Stock Bar ────────────────────────────────────────────────────────────────
function StockBar({ current, minQty, maxQty }) {
  const max = maxQty > 0 ? maxQty : Math.max(minQty * 3, 1);
  const pct = Math.min(Math.max(current / max, 0), 1);
  const isLow = current <= minQty;
  const isCritical = current <= minQty * 0.5;
  const barColor = isCritical ? '#EE0000' : isLow ? '#F5A623' : '#00B341';

  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(pct, { duration: 600 });
  }, [pct]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
    backgroundColor: barColor,
  }));

  return (
    <View style={styles.stockBarBg}>
      <Animated.View style={[styles.stockBarFill, fillStyle]} />
    </View>
  );
}

// ─── Inventory Row ────────────────────────────────────────────────────────────
function InventoryRow({ item, index, onUpdate, onEdit }) {
  const isWeb = Platform.OS === 'web';
  const [expanded, setExpanded] = useState(false);
  const expandH = useSharedValue(0);
  const opacity = useSharedValue(isWeb ? 1 : 0);
  const translateX = useSharedValue(isWeb ? 0 : 30);

  // Entrance animation (native only)
  useEffect(() => {
    if (isWeb) return;
    const delay = Math.min(index * 40, 400);
    opacity.value = withDelay(delay, withTiming(1, { duration: 350 }));
    translateX.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 120 }));
  }, []);

  const rowAnim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const expandStyle = useAnimatedStyle(() => ({
    height: expandH.value,
    overflow: 'hidden',
  }));

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      expandH.value = withSpring(next ? 64 : 0, { damping: 16, stiffness: 140 });
      return next;
    });
  }, []);

  const current = parseFloat(item.current_stock ?? item.quantity ?? 0);
  const minQty = parseFloat(item.reorder_point ?? item.min_quantity ?? 0);
  const maxQty = parseFloat(item.max_quantity ?? 0);
  const isLow = current <= minQty;
  const isCritical = current <= minQty * 0.5;
  const catColor = getCategoryColor(item.category);

  const handleQtyChange = useCallback(
    (delta) => {
      const newQty = Math.max(0, current + delta);
      onUpdate({ itemId: item.id ?? item._id, data: { current_stock: newQty } });
    },
    [current, item, onUpdate]
  );

  return (
    <Animated.View style={[rowAnim, styles.rowWrapper, isCritical && styles.rowCriticalBorder, !isCritical && isLow && styles.rowLowBorder]}>
      {/* Phase 2: PressCard wrapping the row inner */}
      <PressCard
        style={styles.rowInner}
        onPress={toggleExpand}
        scaleDown={0.98}
      >
        {/* Long press handled separately via Pressable wrapping — kept as onLongPress on the PressCard via a wrapper */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onLongPress={() => onEdit && onEdit(item)}
        />

        {/* Left: color dot */}
        <View style={[styles.catDot, { backgroundColor: catColor }]} />

        {/* Center: name + category tag + stock bar */}
        <View style={{ flex: 1, marginHorizontal: 14 }}>
          <View style={styles.rowNameRow}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            {isLow && (
              <Ionicons
                name="warning"
                size={13}
                color={isCritical ? C.error : C.warning}
                style={{ marginLeft: 5 }}
              />
            )}
          </View>
          <View style={styles.rowMeta}>
            {item.category ? (
              <View style={[styles.catTag, { backgroundColor: catColor + '22' }]}>
                <Text style={[styles.catTagText, { color: catColor }]}>
                  {item.category}
                </Text>
              </View>
            ) : null}
            {isLow && (
              <Text style={styles.lowStockLabel}>
                {isCritical ? 'Critical' : 'Low stock'}
              </Text>
            )}
          </View>
          <StockBar current={current} minQty={minQty} maxQty={maxQty} />
          {minQty > 0 && (
            <Text style={styles.minStockLabel}>Min: {minQty} {item.unit ?? 'pcs'}</Text>
          )}
        </View>

        {/* Right: qty + unit + price */}
        <View style={styles.rowRight}>
          <Text style={[styles.rowQty, isLow && { color: isCritical ? C.error : C.warning }]}>
            {current}
          </Text>
          <Text style={styles.rowUnit}>{item.unit ?? 'pcs'}</Text>
          {item.price != null && (
            <Text style={styles.rowPrice}>₹{parseFloat(item.price).toFixed(0)}</Text>
          )}
        </View>
      </PressCard>

      {/* Expandable edit controls */}
      <Animated.View style={expandStyle}>
        <View style={styles.editBar}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleQtyChange(-1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="remove" size={18} color={C.text1} />
          </TouchableOpacity>
          <Text style={styles.editQtyLabel}>
            {current} {item.unit ?? 'pcs'}
          </Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleQtyChange(1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={18} color={C.text1} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editReorderBtn}
            onPress={() => handleQtyChange(minQty - current)}
          >
            <Text style={styles.editReorderText}>Reorder</Text>
          </TouchableOpacity>
          {/* Phase 2: Edit button uses PressCard scaleDown=0.95 */}
          <PressCard
            style={styles.editItemBtn}
            onPress={() => onEdit && onEdit(item)}
            scaleDown={0.95}
          >
            <Ionicons name="create-outline" size={15} color="#000" />
            <Text style={styles.editItemText}>Edit</Text>
          </PressCard>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Item Categories for Modal ───────────────────────────────────────────────
const ITEM_CATEGORIES = ['Vegetables', 'Grains', 'Dairy', 'Proteins', 'Spices', 'Beverages', 'Oils', 'Others'];

// ─── EditItemModal ────────────────────────────────────────────────────────────
function EditItemModal({ visible, item, onClose, onSave, isSaving }) {
  const isEdit = !!item;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [price, setPrice] = useState('');

  // Populate fields when item changes (edit mode) or reset for add mode
  useEffect(() => {
    if (visible) {
      if (item) {
        setName(item.name ?? '');
        setCategory(item.category ?? '');
        setStock(String(item.current_stock ?? item.quantity ?? ''));
        setUnit(item.unit ?? '');
        setReorderPoint(String(item.reorder_point ?? item.min_quantity ?? ''));
        setPrice(String(item.price ?? item.cost_per_unit ?? ''));
      } else {
        setName('');
        setCategory('');
        setStock('');
        setUnit('');
        setReorderPoint('');
        setPrice('');
      }
    }
  }, [visible, item]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Item name is required.');
      return;
    }
    onSave({
      name: name.trim(),
      category,
      current_stock: parseFloat(stock) || 0,
      unit: unit.trim(),
      reorder_point: parseFloat(reorderPoint) || 0,
      price: parseFloat(price) || 0,
    });
  }, [name, category, stock, unit, reorderPoint, price, onSave]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Sheet — Phase 1: borderTopLeftRadius/borderTopRightRadius → 24 */}
        <View style={modalStyles.sheet}>
          {/* Handle bar */}
          <View style={modalStyles.handleBar} />

          {/* Header */}
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>
              {isEdit ? 'Edit Item' : 'New Item'}
            </Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color="#000" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={modalStyles.scrollContent}
          >
            {/* Item Name */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Item Name</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="e.g. Basmati Rice"
                placeholderTextColor="#AAAAAA"
                value={name}
                onChangeText={setName}
                returnKeyType="next"
              />
            </View>

            {/* Category pills */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Category</Text>
              <View style={modalStyles.pillsRow}>
                {ITEM_CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[modalStyles.categoryPill, active && modalStyles.categoryPillActive]}
                      onPress={() => setCategory(cat)}
                      activeOpacity={0.75}
                    >
                      <Text style={[modalStyles.categoryPillText, active && modalStyles.categoryPillTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Stock + Unit row */}
            <View style={modalStyles.twoCol}>
              <View style={[modalStyles.fieldGroup, { flex: 2 }]}>
                <Text style={modalStyles.fieldLabel}>Current Stock</Text>
                <TextInput
                  style={modalStyles.input}
                  placeholder="0"
                  placeholderTextColor="#AAAAAA"
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={[modalStyles.fieldGroup, { flex: 1 }]}>
                <Text style={modalStyles.fieldLabel}>Unit</Text>
                <TextInput
                  style={modalStyles.input}
                  placeholder="kg"
                  placeholderTextColor="#AAAAAA"
                  value={unit}
                  onChangeText={setUnit}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Reorder point + Price row */}
            <View style={modalStyles.twoCol}>
              <View style={[modalStyles.fieldGroup, { flex: 1 }]}>
                <Text style={modalStyles.fieldLabel}>Min Stock</Text>
                <TextInput
                  style={modalStyles.input}
                  placeholder="0"
                  placeholderTextColor="#AAAAAA"
                  value={reorderPoint}
                  onChangeText={setReorderPoint}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={[modalStyles.fieldGroup, { flex: 1 }]}>
                <Text style={modalStyles.fieldLabel}>Price / Unit (₹)</Text>
                <TextInput
                  style={modalStyles.input}
                  placeholder="0"
                  placeholderTextColor="#AAAAAA"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[modalStyles.saveBtn, isSaving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              <Text style={modalStyles.saveBtnText}>
                {isSaving ? 'Saving…' : 'Save Item'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress, bottomOffset }) {
  const scale = useSharedValue(Platform.OS === 'web' ? 1 : 0);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    scale.value = withDelay(300, withSpring(1, { damping: 10, stiffness: 160 }));
  }, []);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fab, { bottom: 24 + bottomOffset }, fabStyle]}>
      {/* Phase 2: FAB uses PressCard scaleDown=0.90 */}
      <PressCard onPress={onPress} style={styles.fabInner} scaleDown={0.90}>
        <View style={styles.fabGradient}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </View>
      </PressCard>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchFocused, setSearchFocused] = useState(false);

  const searchWidth = useSharedValue(0);
  const searchAnimStyle = useAnimatedStyle(() => ({
    width: interpolate(searchWidth.value, [0, 1], [40, SCREEN_W - 80], Extrapolation.CLAMP),
  }));

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // null = add mode

  const { data: rawData, isLoading, refetch, isRefetching } = useInventory();
  const { mutate: updateInventory, isPending: isPatching } = useUpdateInventory();
  const { mutate: createInventoryItem, isPending: isCreating } = useCreateInventoryItem();
  const isSaving = isCreating || isPatching;

  // Normalise API response — could be array or { data: [...] }
  // Fall back to mock data when API returns empty (web dev / offline)
  const allItems = useMemo(() => {
    let items = [];
    if (rawData) {
      if (Array.isArray(rawData)) items = rawData;
      else if (Array.isArray(rawData.data)) items = rawData.data;
    }
    return items.length > 0 ? items : MOCK_INVENTORY;
  }, [rawData]);

  const lowStockItems = useMemo(
    () =>
      allItems.filter(
        (i) =>
          parseFloat(i.current_stock ?? i.quantity ?? 0) <=
          parseFloat(i.reorder_point ?? i.min_quantity ?? 0)
      ),
    [allItems]
  );

  const lowStockCount = lowStockItems.length;

  const totalValue = useMemo(
    () =>
      allItems.reduce(
        (sum, i) =>
          sum +
          parseFloat(i.current_stock ?? i.quantity ?? 0) *
            parseFloat(i.price ?? 0),
        0
      ),
    [allItems]
  );

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (activeCategory !== 'All') {
      list = list.filter(
        (i) => i.category?.toLowerCase() === activeCategory.toLowerCase()
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allItems, activeCategory, search]);

  const handleUpdate = useCallback(
    ({ itemId, data }) => {
      updateInventory({ itemId, data });
    },
    [updateInventory]
  );

  const openAddModal = useCallback(() => {
    setEditingItem(null);
    setModalVisible(true);
  }, []);

  const openEditModal = useCallback((item) => {
    setEditingItem(item);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingItem(null);
  }, []);

  const handleModalSave = useCallback(
    (formData) => {
      if (editingItem) {
        const itemId = editingItem.id ?? editingItem._id;
        updateInventory(
          { itemId, data: formData },
          {
            onSuccess: closeModal,
            onError: (err) => {
              Alert.alert('Error', err?.message ?? 'Failed to update item.');
            },
          }
        );
      } else {
        createInventoryItem(formData, {
          onSuccess: closeModal,
          onError: (err) => {
            Alert.alert('Error', err?.message ?? 'Failed to create item.');
          },
        });
      }
    },
    [editingItem, updateInventory, createInventoryItem, closeModal]
  );

  const renderItem = useCallback(
    ({ item, index }) => (
      <InventoryRow item={item} index={index} onUpdate={handleUpdate} onEdit={openEditModal} />
    ),
    [handleUpdate, openEditModal]
  );

  const keyExtractor = useCallback(
    (item) => String(item.id ?? item._id ?? item.name),
    []
  );

  // Phase 3: replace spinner with InventorySkeleton
  if (isLoading) {
    return (
      <View style={styles.screen}>
        <InventorySkeleton />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Inventory</Text>
            {lowStockCount > 0 && (
              <Animated.View entering={Platform.OS !== 'web' ? FadeIn.duration(400) : undefined} style={styles.alertBadge}>
                <Ionicons name="warning" size={12} color={C.warning} />
                <Text style={styles.alertText}>
                  {lowStockCount} low stock
                </Text>
              </Animated.View>
            )}
          </View>
          <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={20} color={C.text3} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={C.text3} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items…"
            placeholderTextColor={C.text3}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={C.text3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category pills — Phase 1: borderRadius → 999 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScroll}
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.label;
            return (
              <TouchableOpacity
                key={cat.label}
                style={[
                  styles.catPill,
                  isActive && {
                    backgroundColor: '#2563eb',
                    borderColor: '#e2e8f0',
                  },
                ]}
                onPress={() => setActiveCategory(cat.label)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.catPillText,
                    isActive && { color: '#FFFFFF', fontWeight: '700' },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <View style={styles.summaryRow}>
        <SummaryCard
          label="Total Items"
          value={allItems.length}
          color={C.indigo}
          icon="layers-outline"
          pulse={false}
        />
        <SummaryCard
          label="Low Stock"
          value={lowStockCount}
          color={lowStockCount > 0 ? C.warning : C.text3}
          icon="alert-circle-outline"
          pulse={lowStockCount > 0}
        />
        <SummaryCard
          label="Total Value"
          value={`₹${totalValue >= 1000 ? (totalValue / 1000).toFixed(1) + 'k' : totalValue.toFixed(0)}`}
          color={C.gold}
          icon="wallet-outline"
          pulse={false}
        />
      </View>

      {/* ── Phase 3: Low-stock summary banner ─────────────────────────────── */}
      {lowStockCount > 0 && (
        <View style={styles.lowStockBanner}>
          <Text style={styles.lowStockBannerText}>
            ⚠️ {lowStockCount} item{lowStockCount > 1 ? 's' : ''} running low on stock
          </Text>
        </View>
      )}

      {/* ── List ──────────────────────────────────────────────────────────── */}
      <FlashList
        data={filteredItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        estimatedItemSize={72}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 120 + insets.bottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={C.gold}
            colors={[C.gold]}
          />
        }
        ListEmptyComponent={
          /* Phase 3: EmptyState component */
          <EmptyState
            icon="📦"
            title="No items found"
            subtitle="Add ingredients to track your stock levels"
            action={{ label: 'Add Item', onPress: openAddModal }}
          />
        }
      />

      {/* ── FAB ──────────────────────────────────────────────────────────── */}
      <FAB
        onPress={openAddModal}
        bottomOffset={insets.bottom}
      />

      {/* ── Add / Edit Item Modal ─────────────────────────────────────── */}
      <EditItemModal
        visible={modalVisible}
        item={editingItem}
        onClose={closeModal}
        onSave={handleModalSave}
        isSaving={isSaving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.3,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: '#FFF8EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  alertText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F5A623',
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    marginTop: 2,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#000000',
    padding: 0,
  },

  // Category pills
  pillsScroll: {
    gap: 8,
    paddingRight: 8,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    backgroundColor: '#FFFFFF',
    gap: 5,
  },
  catActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  catPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
  },

  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    backgroundColor: '#F7F7F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Phase 3: Low-stock banner
  lowStockBanner: {
    backgroundColor: '#FFF8E6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F5A623',
  },
  lowStockBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A4F00',
  },

  // Inventory rows
  rowWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  rowLowBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#F5A623',
  },
  rowCriticalBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#EE0000',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    minHeight: 88,
  },
  catDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.2,
    flex: 1,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  catTag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  catTagText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  lowStockLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E57300',
  },
  minStockLabel: {
    fontSize: 12,
    color: '#888888',
    marginTop: 5,
  },
  rowRight: {
    alignItems: 'flex-end',
    minWidth: 64,
    marginLeft: 12,
  },
  rowQty: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
  },
  rowUnit: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  rowPrice: {
    fontSize: 12,
    color: '#444444',
    fontWeight: '600',
    marginTop: 3,
  },

  // Stock bar
  stockBarBg: {
    height: 5,
    backgroundColor: '#F0F0F0',
    borderRadius: 3,
  },
  stockBarFill: {
    height: 5,
    borderRadius: 3,
  },

  // Edit controls
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
    backgroundColor: '#FAFAFA',
    gap: 12,
  },
  // Phase 4: icon buttons padding 10, hitSlop via TouchableOpacity prop
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  editQtyLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  editReorderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,112,243,0.08)',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  editReorderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  editItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  editItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },

  // FAB — Phase 1: borderRadius 28, Phase 4: width/height 56
  fab: {
    position: 'absolute',
    right: 20,
  },
  fabInner: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  // Phase 1: bottom sheet borderTopLeft/Right → 24
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: '#EAEAEA',
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
    borderBottomColor: '#EAEAEA',
  },
  // Phase 4: section header
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 36,
  },
  fieldGroup: {
    gap: 4,
  },
  // Phase 4: modal input labels
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444444',
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#000000',
    backgroundColor: '#FFFFFF',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Phase 1: category pill borderRadius → 999
  categoryPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    backgroundColor: '#FFFFFF',
  },
  categoryPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#e2e8f0',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 12,
  },
  saveBtn: {
    height: 48,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
