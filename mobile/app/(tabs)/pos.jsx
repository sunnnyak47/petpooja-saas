/**
 * POS Terminal Screen — Phase 1
 *
 * The core missing piece: staff can browse the menu, add items to a cart,
 * and place a new order (dine-in / takeaway / delivery).
 *
 * Works 100% offline — order is written to SQLite first, then synced
 * to the server when back online via the sync engine.
 *
 * Navigation params (all optional):
 *   table_id     — pre-select a table for dine-in
 *   table_name   — display name of the table (e.g. "T3")
 *   order_type   — pre-set order type: 'dine_in' | 'takeaway' | 'delivery'
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  FadeIn,
  FadeInDown,
  SlideInDown,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

import { useAuth } from '../../src/context/AuthContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { useOfflineMenu } from '../../src/hooks/useOfflineMenu';
import { useOfflineTables } from '../../src/hooks/useOfflineTables';
import { useCreateOfflineOrder } from '../../src/hooks/useCreateOfflineOrder';
import { T, R, FS, FW } from '../../src/constants/theme';
import { printKot, getPrinterSettings } from '../../src/lib/printer';
import QRScanner from '../../src/components/QRScanner';

// ─── Safe haptics import ──────────────────────────────────────────────────────
let Haptics = null;
try { Haptics = require('expo-haptics'); } catch (_) {}
function hapticLight() {
  try { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
}
function hapticMedium() {
  try { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ORDER_TYPES = [
  { key: 'dine_in',   label: 'Dine-In',   icon: 'restaurant-outline' },
  { key: 'takeaway',  label: 'Takeaway',  icon: 'bag-handle-outline' },
  { key: 'delivery',  label: 'Delivery',  icon: 'bicycle-outline' },
];

// GST estimate rates shown to staff (server recalculates the real tax).
// AU outlets: 10% GST; default (IN): 5% GST.
const TAX_RATE_DEFAULT = 0.05;
const TAX_RATE_AU = 0.10;

// ─── Food type indicator ──────────────────────────────────────────────────────
function FoodTypeDot({ type }) {
  const color =
    type === 'non_veg' ? T.nonVeg
    : type === 'egg'   ? T.egg
    :                    T.veg;
  return (
    <View style={[styles.foodDotWrap, { borderColor: color }]}>
      <View style={[styles.foodDotInner, { backgroundColor: color }]} />
    </View>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonItem() {
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    const interval = setInterval(() => {
      opacity.value = withSequence(
        withTiming(0.9, { duration: 700 }),
        withTiming(0.4, { duration: 700 }),
      );
    }, 200);
    return () => clearInterval(interval);
  }, []);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.skeletonItem, anim]}>
      <View style={styles.skeletonThumb} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '55%' }]} />
      </View>
    </Animated.View>
  );
}

// ─── Quantity badge on items ──────────────────────────────────────────────────
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function ItemCard({ item, qty, onAdd, onRemove }) {
  const { symbol } = useCurrency();
  const price = item.price ?? item.selling_price ?? 0;
  const scale = useSharedValue(1);

  const handleAdd = () => {
    scale.value = withSequence(withSpring(1.12, { damping: 6 }), withSpring(1));
    hapticLight();
    onAdd(item);
  };

  const handleRemove = () => {
    hapticLight();
    onRemove(item.id);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.itemCard}>
      <View style={styles.itemCardTop}>
        <FoodTypeDot type={item.food_type} />
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name || item.item_name}
        </Text>
        <Text style={styles.itemPrice}>{symbol}{price}</Text>
      </View>

      {qty > 0 ? (
        <Animated.View style={[styles.qtyRow, animStyle]}>
          <TouchableOpacity style={styles.qtyBtn} onPress={handleRemove} activeOpacity={0.7}>
            <Ionicons name="remove" size={16} color={T.accentDark} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={handleAdd} activeOpacity={0.7}>
            <Ionicons name="add" size={16} color={T.accentDark} />
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.7}>
          <Ionicons name="add" size={20} color={T.textOnDark} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Cart item row ────────────────────────────────────────────────────────────
function CartItemRow({ item, onAdd, onRemove, onRemoveAll }) {
  const { symbol } = useCurrency();
  const price = item.price ?? 0;
  return (
    <View style={styles.cartItemRow}>
      <FoodTypeDot type={item.food_type} />
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>{symbol}{price} × {item.qty}</Text>
      </View>
      <View style={styles.cartQtyRow}>
        <TouchableOpacity
          style={styles.cartQtyBtn}
          onPress={() => onRemove(item.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={item.qty === 1 ? 'trash-outline' : 'remove'}
            size={15}
            color={item.qty === 1 ? T.dangerDark : T.textSecondary}
          />
        </TouchableOpacity>
        <Text style={styles.cartQtyNum}>{item.qty}</Text>
        <TouchableOpacity
          style={styles.cartQtyBtn}
          onPress={() => onAdd(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={15} color={T.textSecondary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cartItemTotal}>{symbol}{price * item.qty}</Text>
    </View>
  );
}

// ─── Table picker modal ───────────────────────────────────────────────────────
function TablePickerModal({ visible, tables, selectedId, onSelect, onClose, onQRScan }) {
  const available = tables.filter(
    (t) => !['occupied', 'bill_pending'].includes(t.status?.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose} />
      <Animated.View entering={SlideInDown} style={styles.pickerSheet}>
        <View style={styles.pickerHandle} />
        <Text style={styles.pickerTitle}>Select Table</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
          {/* QR scan shortcut */}
          {onQRScan && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#eff6ff', marginHorizontal: 16, marginBottom: 8 }}
              onPress={() => { onClose(); onQRScan(); }}
            >
              <Ionicons name="qr-code-outline" size={20} color="#2563eb" />
              <Text style={{ color: '#2563eb', fontWeight: '600', fontSize: 14 }}>Scan Table QR</Text>
            </TouchableOpacity>
          )}
          {available.length === 0 ? (
            <Text style={styles.pickerEmpty}>No available tables right now.</Text>
          ) : (
            available.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.pickerRow,
                  selectedId === t.id && styles.pickerRowActive,
                ]}
                onPress={() => { hapticLight(); onSelect(t); onClose(); }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="restaurant-outline"
                  size={18}
                  color={selectedId === t.id ? T.accentDark : T.textMuted}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.pickerRowLabel,
                    selectedId === t.id && { color: T.accentDark, fontWeight: FW.bold },
                  ]}>
                    {t.name || `Table ${t.id}`}
                  </Text>
                  {t.section ? (
                    <Text style={styles.pickerRowSub}>{t.section} • {t.capacity} seats</Text>
                  ) : (
                    <Text style={styles.pickerRowSub}>{t.capacity} seats</Text>
                  )}
                </View>
                {selectedId === t.id && (
                  <Ionicons name="checkmark-circle" size={20} color={T.accent} />
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
        <TouchableOpacity style={styles.pickerClose} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.pickerCloseText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { outletId } = useOutlet();
  const { symbol, isAU } = useCurrency();
  const estTaxRate = isAU ? TAX_RATE_AU : TAX_RATE_DEFAULT;
  const estTaxLabel = isAU ? 'Est. Tax (10% GST)' : 'Est. Tax (5% GST)';

  // Menu + tables offline data
  const { categories, items, isLoading: menuLoading, refresh: refreshMenu } = useOfflineMenu(outletId);
  const { tables, isLoading: tablesLoading, updateStatus: setTableStatus } = useOfflineTables(outletId);
  const { createOrder, isCreating } = useCreateOfflineOrder();

  // ── State ──────────────────────────────────────────────────────────────────
  const [orderType, setOrderType] = useState(params.order_type || 'dine_in');
  const [selectedTable, setSelectedTable] = useState(
    params.table_id
      ? { id: params.table_id, name: params.table_name || 'Table' }
      : null
  );
  const [selectedCategory, setSelectedCategory] = useState(null); // null = All
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]); // [{ id, name, price, qty, food_type }]
  const [orderNotes, setOrderNotes] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const searchRef = useRef(null);
  const [autoPrintKot, setAutoPrintKot] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  // QR scanner handler — finds scanned table and auto-selects it
  const handleQRScan = useCallback((tableId) => {
    const found = tables?.find((t) => t.id === tableId);
    if (found) {
      setSelectedTable({ id: found.id, name: found.name || `T${found.id.slice(-2)}` });
      setOrderType('dine_in');
    }
  }, [tables]);

  // Load printer settings on mount
  useEffect(() => {
    getPrinterSettings().then((s) => {
      if (s.autoPrintKot) setAutoPrintKot(true);
    });
  }, []);

  // ── Computed values ────────────────────────────────────────────────────────
  const cartCount = useMemo(
    () => cart.reduce((s, i) => s + i.qty, 0),
    [cart]
  );
  const cartSubtotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.qty, 0),
    [cart]
  );
  const cartTax = useMemo(
    () => Math.round(cartSubtotal * estTaxRate),
    [cartSubtotal, estTaxRate]
  );
  const cartTotal = cartSubtotal + cartTax;

  const displayItems = useMemo(() => {
    let list = selectedCategory
      ? items.filter((i) => i.category_id === selectedCategory)
      : items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          (i.name || i.item_name || '').toLowerCase().includes(q)
      );
    }
    // Available items first
    return list.sort((a, b) => {
      const aAvail = a.is_available !== false ? 0 : 1;
      const bAvail = b.is_available !== false ? 0 : 1;
      return aAvail - bAvail;
    });
  }, [items, selectedCategory, searchQuery]);

  // ── Cart operations ────────────────────────────────────────────────────────
  const addItem = useCallback((item) => {
    const price = item.price ?? item.selling_price ?? 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.id === item.id ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [
        ...prev,
        {
          id: item.id,
          name: item.name || item.item_name,
          price,
          qty: 1,
          food_type: item.food_type,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((itemId) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === itemId);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter((c) => c.id !== itemId);
      return prev.map((c) =>
        c.id === itemId ? { ...c, qty: c.qty - 1 } : c
      );
    });
  }, []);

  const getItemQty = useCallback(
    (itemId) => cart.find((c) => c.id === itemId)?.qty || 0,
    [cart]
  );

  const clearCart = useCallback(() => setCart([]), []);

  // ── Place order ────────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add at least one item to place an order.');
      return;
    }
    if (orderType === 'dine_in' && !selectedTable) {
      setShowCart(false);
      setTimeout(() => setShowTablePicker(true), 200);
      return;
    }

    hapticMedium();

    try {
      const order = await createOrder({
        outlet_id: outletId,
        order_type: orderType,
        table_id: selectedTable?.id || null,
        notes: orderNotes.trim() || null,
        created_by: user?.id,
        items: cart.map((c) => ({
          menu_item_id: c.id,
          item_name: c.name,
          quantity: c.qty,
          unit_price: c.price,
          notes: null,
        })),
      });

      setShowCart(false);

      // The order was punched live to the backend (punch-kot created the order +
      // KOT and already seized the table server-side). Reflect that occupancy in
      // the POS picker + Tables screen right away: updateStatus does an optimistic
      // in-memory + SQLite write and a PATCH /orders/tables/:id/status round-trip.
      if (order?._online && orderType === 'dine_in' && selectedTable?.id) {
        try {
          const res = setTableStatus(selectedTable.id, 'occupied');
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } catch (_) {
          // Non-critical — table cache corrects on next pull.
        }
      }

      // Auto-print KOT if enabled
      if (autoPrintKot) {
        printKot({
          table: selectedTable?.name || null,
          orderType: orderType,
          items: cart.map((c) => ({ name: c.name, qty: c.qty, variant: c.variant || null })),
          notes: orderNotes.trim() || null,
          outletName: null,
          orderId: order.id || order.local_id,
        });
      }

      clearCart();
      setOrderNotes('');

      // Brief success feedback
      Alert.alert(
        'Order Placed',
        `Order #${String(order.id).slice(-6).toUpperCase()} sent to kitchen.`,
        [
          {
            text: 'New Order',
            onPress: () => {
              setSelectedTable(null);
              setSelectedCategory(null);
            },
          },
          {
            text: 'View Orders',
            style: 'default',
            onPress: () => router.push('/orders'),
          },
        ]
      );
    } catch (err) {
      Alert.alert('Failed to Place Order', err?.message || 'Please try again.');
    }
  };

  // ── Search toggle ──────────────────────────────────────────────────────────
  const handleSearchToggle = () => {
    if (searchActive) {
      setSearchQuery('');
      setSearchActive(false);
    } else {
      setSearchActive(true);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  const isLoading = menuLoading && items.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={T.textPrimary} />
        </TouchableOpacity>

        {searchActive ? (
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search menu items…"
            placeholderTextColor={T.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
        ) : (
          <Text style={styles.headerTitle}>New Order</Text>
        )}

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleSearchToggle}
            activeOpacity={0.7}
          >
            <Ionicons
              name={searchActive ? 'close' : 'search-outline'}
              size={22}
              color={T.textPrimary}
            />
          </TouchableOpacity>

          {cartCount > 0 && (
            <TouchableOpacity
              style={styles.cartHeaderBtn}
              onPress={() => { hapticLight(); setShowCart(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="cart-outline" size={22} color={T.textPrimary} />
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Order Type Selector ── */}
      <View style={styles.orderTypeRow}>
        {ORDER_TYPES.map((ot) => (
          <TouchableOpacity
            key={ot.key}
            style={[
              styles.orderTypeBtn,
              orderType === ot.key && styles.orderTypeBtnActive,
            ]}
            onPress={() => {
              hapticLight();
              setOrderType(ot.key);
              if (ot.key !== 'dine_in') setSelectedTable(null);
            }}
            activeOpacity={0.75}
          >
            <Ionicons
              name={ot.icon}
              size={15}
              color={orderType === ot.key ? T.textOnDark : T.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.orderTypeTxt,
                orderType === ot.key && styles.orderTypeTxtActive,
              ]}
            >
              {ot.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Table selector (dine-in only) ── */}
      {orderType === 'dine_in' && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.tableRow}>
          <Ionicons name="restaurant-outline" size={16} color={T.textMuted} style={{ marginRight: 8 }} />
          <TouchableOpacity
            style={[
              styles.tablePickerBtn,
              selectedTable && styles.tablePickerBtnActive,
            ]}
            onPress={() => { hapticLight(); setShowTablePicker(true); }}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.tablePickerTxt,
                selectedTable && styles.tablePickerTxtActive,
              ]}
            >
              {selectedTable ? selectedTable.name : 'Select Table'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={selectedTable ? T.accentDark : T.textMuted}
            />
          </TouchableOpacity>
          {selectedTable && (
            <TouchableOpacity
              style={styles.tableClearBtn}
              onPress={() => setSelectedTable(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={18} color={T.textMuted} />
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* ── Category Tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
        <TouchableOpacity
          style={[
            styles.categoryChip,
            selectedCategory === null && styles.categoryChipActive,
          ]}
          onPress={() => { hapticLight(); setSelectedCategory(null); }}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.categoryChipTxt,
              selectedCategory === null && styles.categoryChipTxtActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryChip,
              selectedCategory === cat.id && styles.categoryChipActive,
            ]}
            onPress={() => { hapticLight(); setSelectedCategory(cat.id); }}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.categoryChipTxt,
                selectedCategory === cat.id && styles.categoryChipTxtActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── Item Grid ── */}
      {isLoading ? (
        <ScrollView
          contentContainerStyle={styles.skeletonGrid}
          showsVerticalScrollIndicator={false}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonItem key={i} />
          ))}
        </ScrollView>
      ) : displayItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="fast-food-outline" size={52} color={T.borderStrong} />
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No items match your search' : 'No items in this category'}
          </Text>
          {searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Text style={styles.emptyClear}>Clear search</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[
            styles.itemGrid,
            { paddingBottom: 100 + insets.bottom },
          ]}
          columnWrapperStyle={styles.itemRow}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              qty={getItemQty(item.id)}
              onAdd={addItem}
              onRemove={removeItem}
            />
          )}
        />
      )}

      {/* ── Sticky Cart Bar ── */}
      {cartCount > 0 && (
        <Animated.View
          entering={FadeInDown.duration(300).springify()}
          style={[styles.cartBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <View style={styles.cartBarLeft}>
            <View style={styles.cartBarBadge}>
              <Text style={styles.cartBarBadgeText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBarItems}>
              {cartCount === 1 ? '1 item' : `${cartCount} items`}
            </Text>
            <Text style={styles.cartBarDot}>•</Text>
            <Text style={styles.cartBarTotal}>{symbol}{cartSubtotal}</Text>
          </View>
          <TouchableOpacity
            style={styles.cartBarBtn}
            onPress={() => { hapticLight(); setShowCart(true); }}
            activeOpacity={0.85}
          >
            <Text style={styles.cartBarBtnText}>View Cart</Text>
            <Ionicons name="chevron-forward" size={16} color={T.textOnDark} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Cart Bottom Sheet ── */}
      <Modal
        visible={showCart}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowCart(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCart(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.cartSheet}
        >
          <View style={styles.cartHandle} />

          {/* Cart header */}
          <View style={styles.cartHeader}>
            <View>
              <Text style={styles.cartTitle}>Order Summary</Text>
              <Text style={styles.cartSubtitle}>
                {orderType === 'dine_in' && selectedTable
                  ? `${selectedTable.name} • Dine-In`
                  : orderType === 'dine_in'
                  ? '⚠ No table selected'
                  : orderType === 'takeaway'
                  ? 'Takeaway'
                  : 'Delivery'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cartClearBtn}
              onPress={() => {
                Alert.alert('Clear Cart', 'Remove all items?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => { clearCart(); setShowCart(false); },
                  },
                ]);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cartClearTxt}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cartDivider} />

          {/* Cart items */}
          <ScrollView
            style={styles.cartItemList}
            showsVerticalScrollIndicator={false}
          >
            {cart.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                onAdd={addItem}
                onRemove={removeItem}
              />
            ))}

            {/* Notes */}
            <View style={styles.notesSection}>
              <Ionicons
                name="create-outline"
                size={16}
                color={T.textMuted}
                style={{ marginRight: 8, marginTop: 1 }}
              />
              <TextInput
                style={styles.notesInput}
                placeholder="Add order notes (optional)…"
                placeholderTextColor={T.textMuted}
                value={orderNotes}
                onChangeText={setOrderNotes}
                multiline
                maxLength={200}
              />
            </View>
          </ScrollView>

          <View style={styles.cartDivider} />

          {/* KOT auto-print toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 }}>
            <Text style={{ fontSize: 14, color: '#475569' }}>Auto-print KOT</Text>
            <TouchableOpacity
              onPress={() => setAutoPrintKot((v) => !v)}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: autoPrintKot ? '#2563eb' : '#e2e8f0', justifyContent: 'center', paddingHorizontal: 2 }}
              activeOpacity={0.8}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', transform: [{ translateX: autoPrintKot ? 18 : 0 }] }} />
            </TouchableOpacity>
          </View>

          <View style={styles.cartDivider} />

          {/* Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{symbol}{cartSubtotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{estTaxLabel}</Text>
              <Text style={styles.totalValue}>{symbol}{cartTax}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalGrandRow]}>
              <Text style={styles.totalGrandLabel}>Total</Text>
              <Text style={styles.totalGrandValue}>{symbol}{cartTotal}</Text>
            </View>
          </View>

          {/* Place Order button */}
          <View style={[styles.placeOrderWrap, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity
              style={[
                styles.placeOrderBtn,
                isCreating && { opacity: 0.7 },
              ]}
              onPress={handlePlaceOrder}
              activeOpacity={0.85}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color={T.textOnDark} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color={T.textOnDark} style={{ marginRight: 8 }} />
                  <Text style={styles.placeOrderTxt}>Place Order</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Table Picker Modal ── */}
      <TablePickerModal
        visible={showTablePicker}
        tables={tables}
        selectedId={selectedTable?.id}
        onSelect={(t) => setSelectedTable({ id: t.id, name: t.name || `T${t.id.slice(-2)}` })}
        onClose={() => setShowTablePicker(false)}
        onQRScan={() => setShowQRScanner(true)}
      />

      {/* QR Table Scanner */}
      <QRScanner
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Web-app matched: slate-50 page bg, blue-600 accent, slate-900 text,
// rounded-xl/-2xl borders, Inter-like system font, slate-200 borders.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.pageBg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: T.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: R.xl,
    backgroundColor: T.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: FS.lg,
    fontWeight: FW.bold,
    color: T.textPrimary,
    letterSpacing: -0.3,
  },
  searchInput: {
    flex: 1,
    fontSize: FS.base,
    color: T.textPrimary,
    fontWeight: FW.medium,
    paddingVertical: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: R.xl,
    backgroundColor: T.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: R.xl,
    backgroundColor: T.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: T.accent,
    borderRadius: R.full,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: T.cardBg,
  },
  cartBadgeText: {
    color: T.textOnDark,
    fontSize: 10,
    fontWeight: FW.extrabold,
  },

  // Order type row
  orderTypeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: T.pageBg,
  },
  orderTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: R.xl,
    backgroundColor: T.cardBg,
    borderWidth: 1,
    borderColor: T.border,
  },
  orderTypeBtnActive: {
    backgroundColor: T.accent,
    borderColor: T.accent,
  },
  orderTypeTxt: {
    fontSize: FS.sm,
    fontWeight: FW.semibold,
    color: T.textSecondary,
    letterSpacing: 0.2,
  },
  orderTypeTxtActive: {
    color: T.textOnDark,
  },

  // Table row
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: T.pageBg,
  },
  tablePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.cardBg,
    gap: 6,
    flex: 1,
  },
  tablePickerBtnActive: {
    borderColor: T.accent,
    backgroundColor: T.accentSoft,
  },
  tablePickerTxt: {
    flex: 1,
    fontSize: FS.sm,
    fontWeight: FW.semibold,
    color: T.textMuted,
  },
  tablePickerTxtActive: {
    color: T.accentDark,
  },
  tableClearBtn: {
    marginLeft: 8,
    padding: 2,
  },

  // Categories
  categoryScroll: {
    backgroundColor: T.pageBg,
    maxHeight: 54,
  },
  categoryScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: R.full,
    backgroundColor: T.cardBg,
    borderWidth: 1,
    borderColor: T.border,
  },
  categoryChipActive: {
    backgroundColor: T.accentBlue,
    borderColor: T.accentBlue,
  },
  categoryChipTxt: {
    fontSize: FS.sm,
    fontWeight: FW.semibold,
    color: T.textSecondary,
    letterSpacing: 0.1,
  },
  categoryChipTxtActive: {
    color: T.textOnDark,
  },

  divider: {
    height: 1,
    backgroundColor: T.border,
    marginHorizontal: 0,
  },

  // Item grid
  itemGrid: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  itemRow: {
    gap: 10,
    marginBottom: 10,
  },
  itemCard: {
    flex: 1,
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 14,
    borderWidth: 1,
    borderColor: T.border,
    minHeight: 120,
    justifyContent: 'space-between',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  itemCardTop: {
    flex: 1,
    marginBottom: 8,
  },
  itemName: {
    fontSize: FS.sm,
    fontWeight: FW.semibold,
    color: T.textPrimary,
    marginTop: 8,
    marginBottom: 6,
    lineHeight: 18,
  },
  itemPrice: {
    fontSize: FS.base,
    fontWeight: FW.bold,
    color: T.textPrimary,
    letterSpacing: -0.3,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: R.lg,
    backgroundColor: T.accent,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    shadowColor: T.accent,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: T.accentSoft,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: T.accent,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: FS.sm,
    fontWeight: FW.bold,
    color: T.accentDark,
    minWidth: 22,
    textAlign: 'center',
  },

  // Food type dot — square indicator like real Indian POS
  foodDotWrap: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  foodDotInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  // Skeleton
  skeletonGrid: {
    padding: 12,
    gap: 10,
  },
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: T.border,
  },
  skeletonThumb: {
    width: 56,
    height: 56,
    borderRadius: R.lg,
    backgroundColor: T.skeletonBg,
  },
  skeletonLine: {
    height: 12,
    width: '80%',
    borderRadius: R.sm,
    backgroundColor: T.skeletonBg,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: FS.base,
    fontWeight: FW.semibold,
    color: T.textMuted,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyClear: {
    fontSize: FS.sm,
    fontWeight: FW.bold,
    color: T.accent,
    marginTop: 12,
  },

  // Cart bar — sticky bottom, slate-900 dark bar with indigo CTA
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: T.textPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  cartBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartBarBadge: {
    backgroundColor: T.accent,
    borderRadius: R.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 26,
    alignItems: 'center',
  },
  cartBarBadgeText: {
    color: T.textOnDark,
    fontSize: FS.xs,
    fontWeight: FW.extrabold,
  },
  cartBarItems: {
    color: T.textOnDark,
    fontSize: FS.sm,
    fontWeight: FW.medium,
  },
  cartBarDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FS.sm,
  },
  cartBarTotal: {
    color: T.textOnDark,
    fontSize: FS.base,
    fontWeight: FW.bold,
    letterSpacing: -0.3,
  },
  cartBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: R.xl,
    gap: 4,
  },
  cartBarBtnText: {
    color: T.textOnDark,
    fontSize: FS.sm,
    fontWeight: FW.bold,
    letterSpacing: 0.1,
  },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },

  // Cart sheet
  cartSheet: {
    backgroundColor: T.cardBg,
    borderTopLeftRadius: R['3xl'],
    borderTopRightRadius: R['3xl'],
    maxHeight: '85%',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  cartHandle: {
    width: 44,
    height: 5,
    backgroundColor: T.borderStrong,
    borderRadius: R.full,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cartTitle: {
    fontSize: FS.lg,
    fontWeight: FW.bold,
    color: T.textPrimary,
    letterSpacing: -0.3,
  },
  cartSubtitle: {
    fontSize: FS.sm,
    color: T.textMuted,
    fontWeight: FW.medium,
    marginTop: 2,
  },
  cartClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: R.md,
    backgroundColor: T.dangerBg,
  },
  cartClearTxt: {
    color: T.dangerText,
    fontSize: FS.sm,
    fontWeight: FW.semibold,
  },
  cartDivider: {
    height: 1,
    backgroundColor: T.separator,
    marginHorizontal: 0,
  },
  cartItemList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: 280,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.separator,
  },
  cartItemName: {
    fontSize: FS.sm,
    fontWeight: FW.semibold,
    color: T.textPrimary,
  },
  cartItemPrice: {
    fontSize: FS.xs,
    color: T.textMuted,
    marginTop: 2,
    fontWeight: FW.medium,
  },
  cartItemTotal: {
    fontSize: FS.sm,
    fontWeight: FW.bold,
    color: T.textPrimary,
    minWidth: 56,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  cartQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cartQtyBtn: {
    width: 28,
    height: 28,
    borderRadius: R.md,
    backgroundColor: T.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  cartQtyNum: {
    fontSize: FS.sm,
    fontWeight: FW.bold,
    color: T.textPrimary,
    minWidth: 22,
    textAlign: 'center',
  },

  // Notes
  notesSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingBottom: 6,
  },
  notesInput: {
    flex: 1,
    fontSize: FS.sm,
    color: T.textPrimary,
    fontWeight: FW.medium,
    maxHeight: 60,
  },

  // Totals
  totalsSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: FS.sm,
    color: T.textSecondary,
    fontWeight: FW.medium,
  },
  totalValue: {
    fontSize: FS.sm,
    color: T.textPrimary,
    fontWeight: FW.semibold,
  },
  totalGrandRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
    marginBottom: 0,
  },
  totalGrandLabel: {
    fontSize: FS.base,
    color: T.textPrimary,
    fontWeight: FW.bold,
  },
  totalGrandValue: {
    fontSize: FS.xl,
    color: T.textPrimary,
    fontWeight: FW.extrabold,
    letterSpacing: -0.5,
  },

  // Place order button — indigo brand, web-style large CTA
  placeOrderWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  placeOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.accent,
    borderRadius: R.xl,
    paddingVertical: 16,
    gap: 6,
    shadowColor: T.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  placeOrderTxt: {
    color: T.textOnDark,
    fontSize: FS.base,
    fontWeight: FW.bold,
    letterSpacing: 0.2,
  },

  // Table picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  pickerSheet: {
    backgroundColor: T.cardBg,
    borderTopLeftRadius: R['3xl'],
    borderTopRightRadius: R['3xl'],
    paddingTop: 8,
    paddingBottom: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  pickerHandle: {
    width: 44,
    height: 5,
    backgroundColor: T.borderStrong,
    borderRadius: R.full,
    alignSelf: 'center',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: FS.lg,
    fontWeight: FW.bold,
    color: T.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  pickerEmpty: {
    fontSize: FS.sm,
    color: T.textMuted,
    textAlign: 'center',
    paddingVertical: 30,
    fontWeight: FW.medium,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.separator,
  },
  pickerRowActive: {
    backgroundColor: T.accentSoft,
  },
  pickerRowLabel: {
    fontSize: FS.base,
    fontWeight: FW.semibold,
    color: T.textPrimary,
  },
  pickerRowSub: {
    fontSize: FS.xs,
    color: T.textMuted,
    marginTop: 2,
    fontWeight: FW.medium,
  },
  pickerClose: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: R.xl,
    backgroundColor: T.surfaceMuted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  pickerCloseText: {
    fontSize: FS.base,
    fontWeight: FW.semibold,
    color: T.textSecondary,
  },
});
