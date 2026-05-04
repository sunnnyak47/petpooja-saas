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
  FadeInDown,
  SlideInRight,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInventory, useUpdateInventory } from '../../src/hooks/useApi';

// ─── Design Tokens ──────────────────────────────────────────────────────────
const C = {
  bg: '#080F1E',
  surface: '#0F1D35',
  surface2: '#162840',
  border: '#1E3A5F',
  gold: '#C9A84C',
  indigo: '#5B5EF4',
  success: '#10C98A',
  warning: '#F5A623',
  error: '#F05252',
  text1: '#F0F4FF',
  text2: '#A8B8D0',
  text3: '#5A7090',
};

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Category Config ─────────────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'All', color: C.indigo },
  { label: 'Vegetables', color: '#4CAF82' },
  { label: 'Grains', color: '#C9A84C' },
  { label: 'Dairy', color: '#5BC0F4' },
  { label: 'Spices', color: '#E07843' },
  { label: 'Beverages', color: '#9B59B6' },
  { label: 'Others', color: C.text3 },
];

const CATEGORY_COLOR_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.label.toLowerCase(), c.color])
);

function getCategoryColor(cat) {
  if (!cat) return C.text3;
  return CATEGORY_COLOR_MAP[cat.toLowerCase()] ?? C.text3;
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow({ index }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withDelay(
      index * 80,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0, { duration: 800 })
        ),
        -1
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.65]),
  }));

  return (
    <Animated.View style={[styles.skeletonRow, animStyle]}>
      <View style={styles.skeletonDot} />
      <View style={{ flex: 1, gap: 7 }}>
        <View style={[styles.skeletonBar, { width: '55%' }]} />
        <View style={[styles.skeletonBar, { width: '35%', height: 10 }]} />
      </View>
      <View style={[styles.skeletonBar, { width: 48 }]} />
    </Animated.View>
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
  const barColor = isCritical ? C.error : isLow ? C.warning : C.success;

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
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function InventoryRow({ item, index, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const expandH = useSharedValue(0);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(30);

  // Entrance animation
  useEffect(() => {
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
    <Animated.View style={[rowAnim, styles.rowWrapper, isLow && styles.rowLowBorder]}>
      <TouchableOpacity
        style={styles.rowInner}
        onPress={toggleExpand}
        activeOpacity={0.75}
      >
        {/* Left: color dot */}
        <View style={[styles.catDot, { backgroundColor: catColor }]} />

        {/* Center: name + category tag + stock bar */}
        <View style={{ flex: 1, marginHorizontal: 10 }}>
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
          </View>
          <StockBar current={current} minQty={minQty} maxQty={maxQty} />
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
      </TouchableOpacity>

      {/* Expandable edit controls */}
      <Animated.View style={expandStyle}>
        <View style={styles.editBar}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleQtyChange(-1)}
          >
            <Ionicons name="remove" size={18} color={C.text1} />
          </TouchableOpacity>
          <Text style={styles.editQtyLabel}>
            {current} {item.unit ?? 'pcs'}
          </Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleQtyChange(1)}
          >
            <Ionicons name="add" size={18} color={C.text1} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editReorderBtn}
            onPress={() => handleQtyChange(minQty - current)}
          >
            <Text style={styles.editReorderText}>Reorder</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress, bottomOffset }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(300, withSpring(1, { damping: 10, stiffness: 160 }));
  }, []);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fab, { bottom: 24 + bottomOffset }, fabStyle]}>
      <TouchableOpacity onPress={onPress} style={styles.fabInner} activeOpacity={0.85}>
        <LinearGradient
          colors={['#D4A843', C.gold, '#A8862E']}
          style={styles.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="add" size={28} color="#000" />
        </LinearGradient>
      </TouchableOpacity>
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

  const { data: rawData, isLoading, refetch, isRefetching } = useInventory();
  const { mutate: updateInventory } = useUpdateInventory();

  // Normalise API response — could be array or { data: [...] }
  const allItems = useMemo(() => {
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    if (Array.isArray(rawData.data)) return rawData.data;
    return [];
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

  const renderItem = useCallback(
    ({ item, index }) => (
      <InventoryRow item={item} index={index} onUpdate={handleUpdate} />
    ),
    [handleUpdate]
  );

  const keyExtractor = useCallback(
    (item) => String(item.id ?? item._id ?? item.name),
    []
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* ── Gradient Header ───────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#0D1F3C', '#0A1628', C.bg]}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Inventory</Text>
            {lowStockItems.length > 0 && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.alertBadge}>
                <Ionicons name="warning" size={12} color={C.warning} />
                <Text style={styles.alertText}>
                  {lowStockItems.length} low stock
                </Text>
              </Animated.View>
            )}
          </View>
          <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={20} color={C.text2} />
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

        {/* Category pills */}
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
                    backgroundColor: cat.color + '28',
                    borderColor: cat.color,
                  },
                ]}
                onPress={() => setActiveCategory(cat.label)}
                activeOpacity={0.75}
              >
                {isActive && (
                  <View style={[styles.catActiveDot, { backgroundColor: cat.color }]} />
                )}
                <Text
                  style={[
                    styles.catPillText,
                    isActive && { color: cat.color, fontWeight: '700' },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </LinearGradient>

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
          value={lowStockItems.length}
          color={lowStockItems.length > 0 ? C.warning : C.text3}
          icon="alert-circle-outline"
          pulse={lowStockItems.length > 0}
        />
        <SummaryCard
          label="Total Value"
          value={`₹${totalValue >= 1000 ? (totalValue / 1000).toFixed(1) + 'k' : totalValue.toFixed(0)}`}
          color={C.gold}
          icon="wallet-outline"
          pulse={false}
        />
      </View>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} index={i} />
          ))}
        </View>
      ) : (
        <FlashList
          data={filteredItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          estimatedItemSize={72}
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingTop: 8,
            paddingBottom: 100 + insets.bottom,
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
            <View style={styles.emptyBox}>
              <Ionicons name="layers-outline" size={52} color={C.border} />
              <Text style={styles.emptyTitle}>No items found</Text>
              <Text style={styles.emptySubtitle}>
                {search ? 'Try a different search term' : 'Add your first inventory item'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── FAB ──────────────────────────────────────────────────────────── */}
      <FAB
        onPress={() => {
          // TODO: navigate to add item screen
        }}
        bottomOffset={insets.bottom}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: C.text1,
    letterSpacing: 0.3,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.warning,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: C.surface2,
    marginTop: 2,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.text1,
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
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    gap: 5,
  },
  catActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text2,
  },

  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  summaryRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text1,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.text3,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Skeleton
  skeletonContainer: {
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  skeletonDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.surface2,
  },
  skeletonBar: {
    height: 13,
    borderRadius: 6,
    backgroundColor: C.surface2,
  },

  // Inventory rows
  rowWrapper: {
    backgroundColor: C.surface,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  rowLowBorder: {
    borderLeftWidth: 3,
    borderLeftColor: C.warning,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text1,
    flex: 1,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  catTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catTagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  rowRight: {
    alignItems: 'flex-end',
    minWidth: 52,
  },
  rowQty: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text1,
  },
  rowUnit: {
    fontSize: 10,
    color: C.text3,
    fontWeight: '500',
    marginTop: 1,
  },
  rowPrice: {
    fontSize: 11,
    color: C.gold,
    fontWeight: '600',
    marginTop: 2,
  },

  // Stock bar
  stockBarBg: {
    height: 3,
    backgroundColor: C.surface2,
    borderRadius: 2,
  },
  stockBarFill: {
    height: 3,
    borderRadius: 2,
  },

  // Edit controls
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface2,
    gap: 12,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editQtyLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: C.text1,
  },
  editReorderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.indigo + '33',
    borderWidth: 1,
    borderColor: C.indigo,
  },
  editReorderText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.indigo,
  },

  // Empty state
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text2,
  },
  emptySubtitle: {
    fontSize: 13,
    color: C.text3,
    textAlign: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
  },
  fabInner: {
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
