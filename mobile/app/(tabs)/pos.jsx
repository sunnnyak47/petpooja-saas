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
import { useOfflineMenu } from '../../src/hooks/useOfflineMenu';
import { useOfflineTables } from '../../src/hooks/useOfflineTables';
import { useCreateOfflineOrder } from '../../src/hooks/useCreateOfflineOrder';

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

const TAX_RATE = 0.05; // 5% GST flat estimate displayed to staff (server recalculates)

// ─── Food type indicator ──────────────────────────────────────────────────────
function FoodTypeDot({ type }) {
  const color =
    type === 'non_veg' ? '#EE0000'
    : type === 'egg'   ? '#F5A623'
    :                    '#00B341';
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
        <Text style={styles.itemPrice}>₹{price}</Text>
      </View>

      {qty > 0 ? (
        <Animated.View style={[styles.qtyRow, animStyle]}>
          <TouchableOpacity style={styles.qtyBtn} onPress={handleRemove} activeOpacity={0.7}>
            <Ionicons name="remove" size={16} color="#000" />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={handleAdd} activeOpacity={0.7}>
            <Ionicons name="add" size={16} color="#000" />
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.7}>
          <Ionicons name="add" size={18} color="#000" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Cart item row ────────────────────────────────────────────────────────────
function CartItemRow({ item, onAdd, onRemove, onRemoveAll }) {
  const price = item.price ?? 0;
  return (
    <View style={styles.cartItemRow}>
      <FoodTypeDot type={item.food_type} />
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>₹{price} × {item.qty}</Text>
      </View>
      <View style={styles.cartQtyRow}>
        <TouchableOpacity
          style={styles.cartQtyBtn}
          onPress={() => onRemove(item.id)}
          activeOpacity={0.7}
        >
          <Ionicons name={item.qty === 1 ? 'trash-outline' : 'remove'} size={15} color="#444" />
        </TouchableOpacity>
        <Text style={styles.cartQtyNum}>{item.qty}</Text>
        <TouchableOpacity
          style={styles.cartQtyBtn}
          onPress={() => onAdd(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={15} color="#444" />
        </TouchableOpacity>
      </View>
      <Text style={styles.cartItemTotal}>₹{price * item.qty}</Text>
    </View>
  );
}

// ─── Table picker modal ───────────────────────────────────────────────────────
function TablePickerModal({ visible, tables, selectedId, onSelect, onClose }) {
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
                  color={selectedId === t.id ? '#0070F3' : '#888'}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.pickerRowLabel,
                    selectedId === t.id && { color: '#0070F3', fontWeight: '700' },
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
                  <Ionicons name="checkmark-circle" size={20} color="#0070F3" />
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

  // Menu + tables offline data
  const { categories, items, isLoading: menuLoading, refresh: refreshMenu } = useOfflineMenu(outletId);
  const { tables, isLoading: tablesLoading } = useOfflineTables(outletId);
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
    () => Math.round(cartSubtotal * TAX_RATE),
    [cartSubtotal]
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
      clearCart();
      setOrderNotes('');

      // Brief success feedback
      Alert.alert(
        '✅ Order Placed',
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
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>

        {searchActive ? (
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search menu items…"
            placeholderTextColor="#999"
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
              color="#000"
            />
          </TouchableOpacity>

          {cartCount > 0 && (
            <TouchableOpacity
              style={styles.cartHeaderBtn}
              onPress={() => { hapticLight(); setShowCart(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="cart-outline" size={22} color="#000" />
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
              color={orderType === ot.key ? '#fff' : '#555'}
              style={{ marginRight: 5 }}
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
          <Ionicons name="restaurant-outline" size={16} color="#888" style={{ marginRight: 8 }} />
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
              color={selectedTable ? '#0070F3' : '#888'}
            />
          </TouchableOpacity>
          {selectedTable && (
            <TouchableOpacity
              style={styles.tableClearBtn}
              onPress={() => setSelectedTable(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={18} color="#ccc" />
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
          <Ionicons name="fast-food-outline" size={52} color="#ddd" />
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
            <Text style={styles.cartBarTotal}>₹{cartSubtotal}</Text>
          </View>
          <TouchableOpacity
            style={styles.cartBarBtn}
            onPress={() => { hapticLight(); setShowCart(true); }}
            activeOpacity={0.85}
          >
            <Text style={styles.cartBarBtnText}>View Cart</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
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
                color="#888"
                style={{ marginRight: 6, marginTop: 1 }}
              />
              <TextInput
                style={styles.notesInput}
                placeholder="Add order notes (optional)…"
                placeholderTextColor="#bbb"
                value={orderNotes}
                onChangeText={setOrderNotes}
                multiline
                maxLength={200}
              />
            </View>
          </ScrollView>

          <View style={styles.cartDivider} />

          {/* Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>₹{cartSubtotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Est. Tax (5% GST)</Text>
              <Text style={styles.totalValue}>₹{cartTax}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalGrandRow]}>
              <Text style={styles.totalGrandLabel}>Total</Text>
              <Text style={styles.totalGrandValue}>₹{cartTotal}</Text>
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
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
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
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.3,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
    paddingVertical: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#0070F3',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },

  // Order type row
  orderTypeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#fff',
  },
  orderTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  orderTypeBtnActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  orderTypeTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.2,
  },
  orderTypeTxtActive: {
    color: '#fff',
  },

  // Table row
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  tablePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#EAEAEA',
    backgroundColor: '#F9F9F9',
    gap: 6,
    flex: 1,
  },
  tablePickerBtnActive: {
    borderColor: '#0070F3',
    backgroundColor: '#EBF4FF',
  },
  tablePickerTxt: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  tablePickerTxtActive: {
    color: '#0070F3',
  },
  tableClearBtn: {
    marginLeft: 8,
    padding: 2,
  },

  // Categories
  categoryScroll: {
    backgroundColor: '#fff',
    maxHeight: 50,
  },
  categoryScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  categoryChipActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  categoryChipTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.2,
  },
  categoryChipTxtActive: {
    color: '#fff',
  },

  divider: {
    height: 1,
    backgroundColor: '#EAEAEA',
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
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    minHeight: 110,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  itemCardTop: {
    flex: 1,
    marginBottom: 8,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 18,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
    minWidth: 20,
    textAlign: 'center',
  },

  // Food type dot
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
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  skeletonThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#E5E5E5',
  },
  skeletonLine: {
    height: 12,
    width: '80%',
    borderRadius: 6,
    backgroundColor: '#E5E5E5',
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyClear: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0070F3',
    marginTop: 12,
  },

  // Cart bar
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
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
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 24,
    alignItems: 'center',
  },
  cartBarBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },
  cartBarItems: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cartBarDot: {
    color: '#666',
    fontSize: 14,
  },
  cartBarTotal: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  cartBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0070F3',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 4,
  },
  cartBarBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // Cart sheet
  cartSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  cartHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cartTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.3,
  },
  cartSubtitle: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
    marginTop: 2,
  },
  cartClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFF0F0',
  },
  cartClearTxt: {
    color: '#EE0000',
    fontSize: 13,
    fontWeight: '700',
  },
  cartDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
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
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  cartItemPrice: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    fontWeight: '500',
  },
  cartItemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    minWidth: 54,
    textAlign: 'right',
  },
  cartQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cartQtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartQtyNum: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    minWidth: 22,
    textAlign: 'center',
  },

  // Notes
  notesSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingBottom: 4,
  },
  notesInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    maxHeight: 60,
  },

  // Totals
  totalsSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 14,
    color: '#444',
    fontWeight: '700',
  },
  totalGrandRow: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
    marginBottom: 0,
  },
  totalGrandLabel: {
    fontSize: 16,
    color: '#000',
    fontWeight: '800',
  },
  totalGrandValue: {
    fontSize: 18,
    color: '#000',
    fontWeight: '900',
  },

  // Place order button
  placeOrderWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  placeOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 6,
  },
  placeOrderTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Table picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  pickerEmpty: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 30,
    fontWeight: '500',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  pickerRowActive: {
    backgroundColor: '#EBF4FF',
  },
  pickerRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  pickerRowSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    fontWeight: '500',
  },
  pickerClose: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  pickerCloseText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#555',
  },
});
