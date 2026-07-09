import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useCreateOfflineOrder } from '../../src/hooks/useCreateOfflineOrder';
import { useOfflineMenu } from '../../src/hooks/useOfflineMenu';
import { useOfflineTables } from '../../src/hooks/useOfflineTables';
import { useOutlet } from '../../src/context/OutletContext';
import { useAuth } from '../../src/context/AuthContext';
import { printReceipt } from '../../src/lib/printer';
import { useCurrency } from '../../src/hooks/useCurrency';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESTAURANT_NAME = 'MS Restaurant';
const CGST_RATE = 0.025;
const SGST_RATE = 0.025;

const MENU_ITEMS = [
  { id: 'm1', name: 'Paneer Butter Masala', price: 320, category: 'Main' },
  { id: 'm2', name: 'Butter Chicken', price: 360, category: 'Main' },
  { id: 'm3', name: 'Dal Makhani', price: 280, category: 'Main' },
  { id: 'm4', name: 'Chicken Tikka Masala', price: 380, category: 'Main' },
  { id: 'm5', name: 'Chicken Biryani', price: 320, category: 'Rice' },
  { id: 'm6', name: 'Jeera Rice', price: 120, category: 'Rice' },
  { id: 'm7', name: 'Garlic Naan', price: 60, category: 'Bread' },
  { id: 'm8', name: 'Butter Roti', price: 40, category: 'Bread' },
  { id: 'm9', name: 'Masala Chai', price: 40, category: 'Drinks' },
  { id: 'm10', name: 'Mango Lassi', price: 80, category: 'Drinks' },
  { id: 'm11', name: 'Gulab Jamun', price: 80, category: 'Dessert' },
  { id: 'm12', name: 'Samosa (2 pcs)', price: 60, category: 'Starters' },
  { id: 'm13', name: 'Veg Spring Roll', price: 120, category: 'Starters' },
  { id: 'm14', name: 'Chicken 65', price: 220, category: 'Starters' },
  { id: 'm15', name: 'Tandoori Roti', price: 35, category: 'Bread' },
];

const INITIAL_TABLES = [
  {
    id: 't2', number: 2, waiter: 'Rahul', covers: 3, since: '12:45 PM',
    items: [
      { id: 'i1', name: 'Paneer Butter Masala', qty: 2, price: 320 },
      { id: 'i2', name: 'Garlic Naan', qty: 4, price: 60 },
      { id: 'i3', name: 'Masala Chai', qty: 3, price: 40 },
    ],
  },
  {
    id: 't3', number: 3, waiter: 'Priya', covers: 4, since: '12:10 PM',
    items: [
      { id: 'i4', name: 'Butter Chicken', qty: 2, price: 360 },
      { id: 'i5', name: 'Dal Makhani', qty: 1, price: 280 },
      { id: 'i6', name: 'Garlic Naan', qty: 6, price: 60 },
      { id: 'i7', name: 'Mango Lassi', qty: 4, price: 80 },
    ],
  },
  {
    id: 't5', number: 5, waiter: 'Amit', covers: 2, since: '1:05 PM',
    items: [
      { id: 'i8', name: 'Chicken Biryani', qty: 2, price: 320 },
      { id: 'i9', name: 'Masala Chai', qty: 2, price: 40 },
    ],
  },
  {
    id: 't7', number: 7, waiter: 'Rahul', covers: 6, since: '12:30 PM',
    items: [
      { id: 'i10', name: 'Chicken Tikka Masala', qty: 3, price: 380 },
      { id: 'i11', name: 'Paneer Butter Masala', qty: 2, price: 320 },
      { id: 'i12', name: 'Jeera Rice', qty: 3, price: 120 },
      { id: 'i13', name: 'Garlic Naan', qty: 8, price: 60 },
      { id: 'i14', name: 'Gulab Jamun', qty: 4, price: 80 },
    ],
  },
  {
    id: 't9', number: 9, waiter: 'Priya', covers: 2, since: '11:55 AM',
    items: [
      { id: 'i15', name: 'Masala Chai', qty: 4, price: 40 },
      { id: 'i16', name: 'Samosa (2 pcs)', qty: 2, price: 60 },
      { id: 'i17', name: 'Veg Spring Roll', qty: 2, price: 120 },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcSubtotal(items) {
  return items.reduce((sum, i) => sum + i.qty * i.price, 0);
}

function nowBillNumber() {
  const now = new Date();
  return `BILL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

function nowDateTime(locale) {
  return new Date().toLocaleString(locale || 'en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatWhatsAppBill({ table, items, subtotal, cgst, sgst, discountAmt, grandTotal, paymentMode, symbol, locale }) {
  const sym = symbol || '₹';
  const loc = locale || 'en-IN';
  const itemLines = items.map(i => `  • ${i.name} x${i.qty}  ${sym}${(i.qty * i.price).toLocaleString(loc)}`).join('\n');
  return encodeURIComponent(
    `🍽 *${RESTAURANT_NAME}*\n` +
    `Table ${table.number} | ${table.covers} covers | Waiter: ${table.waiter}\n` +
    `${nowDateTime(loc)}\n\n` +
    `*Items:*\n${itemLines}\n\n` +
    `Subtotal: ${sym}${subtotal.toLocaleString(loc)}\n` +
    (discountAmt > 0 ? `Discount: -${sym}${discountAmt.toFixed(2)}\n` : '') +
    `CGST (2.5%): ${sym}${cgst.toFixed(2)}\n` +
    `SGST (2.5%): ${sym}${sgst.toFixed(2)}\n` +
    `*GRAND TOTAL: ${sym}${grandTotal.toFixed(2)}*\n` +
    `Payment: ${paymentMode}\n\n` +
    `Thank you for dining with us! 🙏`
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
        {[0, 1, 2].map(i => (
          <SkeletonBox key={i} width="30%" height={72} borderRadius={16} color="#F0F0F0" />
        ))}
      </View>
      {[0, 1, 2, 4].map(i => (
        <SkeletonBox key={i} width="100%" height={100} borderRadius={16} color="#F0F0F0" />
      ))}
    </View>
  );
}

// ─── Quick Stat Card ──────────────────────────────────────────────────────────

function StatCard({ label, value, accent }) {
  return (
    <View style={[styles.statCard, accent && { borderTopWidth: 3, borderTopColor: accent }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Table Bill Card ──────────────────────────────────────────────────────────

function TableBillCard({ table, onPress }) {
  const subtotal = useMemo(() => calcSubtotal(table.items), [table.items]);
  const { symbol, locale } = useCurrency();
  return (
    <PressCard scaleDown={0.97} onPress={() => onPress(table)} style={styles.tableCard}>
      <View style={styles.tableCardLeft}>
        <View style={styles.tableCircle}>
          <Text style={styles.tableCircleText}>T-{table.number}</Text>
        </View>
      </View>
      <View style={styles.tableCardBody}>
        <Text style={styles.subtotalText}>{symbol}{subtotal.toLocaleString(locale)}</Text>
        <Text style={styles.tableTitle}>Table {table.number}</Text>
        <Text style={styles.tableWaiter}>Waiter: {table.waiter}</Text>
        <View style={styles.tableMetaRow}>
          <View style={styles.metaBadge}>
            <Ionicons name="people-outline" size={12} color="#888" />
            <Text style={styles.metaText}>{table.covers} covers</Text>
          </View>
          <View style={styles.metaBadge}>
            <Ionicons name="time-outline" size={12} color="#888" />
            <Text style={styles.metaText}>Since {table.since}</Text>
          </View>
          <View style={styles.metaBadge}>
            <Ionicons name="restaurant-outline" size={12} color="#888" />
            <Text style={styles.metaText}>{table.items.length} items</Text>
          </View>
        </View>
      </View>
      <View style={styles.generateBtn}>
        <Text style={styles.generateBtnText}>Bill</Text>
        <Ionicons name="arrow-forward" size={14} color="#FFF" />
      </View>
    </PressCard>
  );
}

// ─── Settled Bill Row ─────────────────────────────────────────────────────────

function SettledBillRow({ bill }) {
  const modeColor = bill.payMode === 'UPI' ? '#2563eb' : bill.payMode === 'Card' ? '#7B61FF' : '#00B341';
  const { symbol, locale } = useCurrency();
  return (
    <View style={styles.settledRow}>
      <View style={styles.settledLeft}>
        <View style={styles.settledCircle}>
          <Ionicons name="checkmark" size={14} color="#00B341" />
        </View>
        <View>
          <Text style={styles.settledTable}>Table {bill.tableNumber}</Text>
          <Text style={styles.settledMeta}>{bill.waiter} · {bill.time}</Text>
        </View>
      </View>
      <View style={styles.settledRight}>
        <Text style={styles.settledTotal}>{symbol}{bill.total.toLocaleString(locale)}</Text>
        <View style={[styles.payModePill, { backgroundColor: modeColor + '18' }]}>
          <Text style={[styles.payModePillText, { color: modeColor }]}>{bill.payMode}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Item Picker Modal ────────────────────────────────────────────────────────

function ItemPickerModal({ visible, onClose, onAdd, menuItems }) {
  const [search, setSearch] = useState('');
  const { symbol } = useCurrency();
  const sourceItems = menuItems && menuItems.length > 0 ? menuItems : MENU_ITEMS;
  const filtered = useMemo(
    () => sourceItems.filter(m => m.name.toLowerCase().includes(search.toLowerCase())),
    [search, sourceItems]
  );
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Add Items</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color="#888" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items..."
            placeholderTextColor="#AAA"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#888" />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {filtered.map(item => (
            <TouchableOpacity key={item.id} style={styles.pickerRow} activeOpacity={0.7} onPress={() => { onAdd(item); onClose(); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerItemName}>{item.name}</Text>
                <Text style={styles.pickerItemCat}>{item.category}</Text>
              </View>
              <Text style={styles.pickerItemPrice}>{symbol}{item.price}</Text>
              <View style={styles.pickerAddBtn}>
                <Ionicons name="add" size={18} color="#2563eb" />
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Discount Panel ───────────────────────────────────────────────────────────

function DiscountPanel({ discount, onApply, onRemove }) {
  const [mode, setMode] = useState('flat'); // 'flat' | 'percent' | 'coupon'
  const [flatVal, setFlatVal] = useState('');
  const [pctVal, setPctVal] = useState('');
  const [couponVal, setCouponVal] = useState('');
  const COUPONS = { SAVE50: 50, WELCOME100: 100 };
  const { symbol } = useCurrency();

  const handleApply = () => {
    if (mode === 'flat') {
      const v = parseFloat(flatVal) || 0;
      onApply({ type: 'flat', value: v, label: `Flat ${symbol}${v} off` });
    } else if (mode === 'percent') {
      const v = parseFloat(pctVal) || 0;
      onApply({ type: 'percent', value: Math.min(v, 100), label: `${v}% off` });
    } else {
      const code = couponVal.trim().toUpperCase();
      const off = COUPONS[code];
      if (off) {
        onApply({ type: 'flat', value: off, label: `Coupon ${code}: ${symbol}${off} off` });
      } else {
        Alert.alert('Invalid Coupon', 'Coupon code not recognised.');
      }
    }
  };

  if (discount) {
    return (
      <View style={styles.discountApplied}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="pricetag-outline" size={14} color="#00B341" />
          <Text style={styles.discountAppliedLabel}>{discount.label}</Text>
        </View>
        <TouchableOpacity onPress={onRemove}>
          <Ionicons name="close-circle" size={18} color="#EE0000" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.discountPanel}>
      <View style={styles.discountModeTabs}>
        {['flat', 'percent', 'coupon'].map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.discountModeTab, mode === m && styles.discountModeTabActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.discountModeTabText, mode === m && styles.discountModeTabTextActive]}>
              {m === 'flat' ? `${symbol} Flat` : m === 'percent' ? '% Off' : 'Coupon'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.discountInputRow}>
        {mode === 'flat' && (
          <TextInput
            style={styles.discountTextInput}
            placeholder="Enter amount"
            placeholderTextColor="#AAA"
            keyboardType="numeric"
            value={flatVal}
            onChangeText={setFlatVal}
          />
        )}
        {mode === 'percent' && (
          <TextInput
            style={styles.discountTextInput}
            placeholder="0 – 100 %"
            placeholderTextColor="#AAA"
            keyboardType="numeric"
            value={pctVal}
            onChangeText={setPctVal}
          />
        )}
        {mode === 'coupon' && (
          <TextInput
            style={[styles.discountTextInput, { textTransform: 'uppercase' }]}
            placeholder="e.g. SAVE50"
            placeholderTextColor="#AAA"
            value={couponVal}
            onChangeText={setCouponVal}
            autoCapitalize="characters"
          />
        )}
        <TouchableOpacity style={styles.discountApplyBtn} onPress={handleApply}>
          <Text style={styles.discountApplyBtnText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Split Bill Modal ─────────────────────────────────────────────────────────

function SplitBillModal({ visible, onClose, grandTotal, items }) {
  const [numPeople, setNumPeople] = useState(2);
  const [mode, setMode] = useState('equal'); // 'equal' | 'custom'
  const [assignments, setAssignments] = useState({});
  const { symbol } = useCurrency();

  const equalShare = grandTotal / numPeople;

  const assignItem = (itemId, personIdx) => {
    setAssignments(prev => ({ ...prev, [itemId]: personIdx }));
  };

  const personTotal = (idx) =>
    items
      .filter(i => assignments[i.id] === idx)
      .reduce((s, i) => s + i.qty * i.price, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Split Bill</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color="#000" />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 20 }}>
          {/* People stepper */}
          <Text style={styles.splitLabel}>Number of people</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setNumPeople(p => Math.max(2, p - 1))}
            >
              <Ionicons name="remove" size={20} color="#000" />
            </TouchableOpacity>
            <Text style={styles.stepperVal}>{numPeople}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setNumPeople(p => Math.min(10, p + 1))}
            >
              <Ionicons name="add" size={20} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Mode toggle */}
          <View style={styles.splitModeRow}>
            {['equal', 'custom'].map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.splitModeBtn, mode === m && styles.splitModeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.splitModeBtnText, mode === m && styles.splitModeBtnTextActive]}>
                  {m === 'equal' ? 'Equal Split' : 'Custom Split'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'equal' ? (
            <View style={styles.equalSplitBox}>
              {Array.from({ length: numPeople }).map((_, idx) => (
                <View key={idx} style={styles.equalSplitRow}>
                  <View style={styles.personBadge}>
                    <Text style={styles.personBadgeText}>P{idx + 1}</Text>
                  </View>
                  <Text style={styles.personName}>Person {idx + 1}</Text>
                  <Text style={styles.personAmount}>{symbol}{equalShare.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View>
              <Text style={[styles.splitLabel, { marginTop: 16 }]}>Assign items to each person</Text>
              {items.map(item => (
                <View key={item.id} style={styles.customSplitItemRow}>
                  <Text style={styles.customSplitItemName} numberOfLines={1}>{item.name}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {Array.from({ length: numPeople }).map((_, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.assignBtn,
                            assignments[item.id] === idx && styles.assignBtnActive,
                          ]}
                          onPress={() => assignItem(item.id, idx)}
                        >
                          <Text style={[styles.assignBtnText, assignments[item.id] === idx && styles.assignBtnTextActive]}>
                            P{idx + 1}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))}
              <View style={styles.separator} />
              {Array.from({ length: numPeople }).map((_, idx) => (
                <View key={idx} style={styles.equalSplitRow}>
                  <View style={styles.personBadge}>
                    <Text style={styles.personBadgeText}>P{idx + 1}</Text>
                  </View>
                  <Text style={styles.personName}>Person {idx + 1}</Text>
                  <Text style={styles.personAmount}>{symbol}{personTotal(idx).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Bill Modal ───────────────────────────────────────────────────────────────

function BillModal({ table, visible, onClose, onSettle, createOrder, isCreating, outletId, userId, menuItems }) {
  const insets = useSafeAreaInsets();
  const { symbol, locale } = useCurrency();
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(null);
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [extraPayments, setExtraPayments] = useState([]);
  const [amountTendered, setAmountTendered] = useState('');
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const billNumber = useMemo(() => nowBillNumber(), [visible]);

  useEffect(() => {
    if (table) {
      setItems(table.items.map(i => ({ ...i })));
      setDiscount(null);
      setShowDiscountPanel(false);
      setPaymentMode('cash');
      setExtraPayments([]);
      setAmountTendered('');
    }
  }, [table]);

  const subtotal = useMemo(() => calcSubtotal(items), [items]);

  const discountAmt = useMemo(() => {
    if (!discount) return 0;
    if (discount.type === 'percent') return (subtotal * discount.value) / 100;
    return Math.min(discount.value, subtotal);
  }, [discount, subtotal]);

  const taxBase = subtotal - discountAmt;
  const cgst = taxBase * CGST_RATE;
  const sgst = taxBase * SGST_RATE;
  const grandTotal = taxBase + cgst + sgst;
  const change = Math.max(0, parseFloat(amountTendered || 0) - grandTotal);

  const updateQty = useCallback((id, delta) => {
    setItems(prev =>
      prev
        .map(i => i.id === id ? { ...i, qty: i.qty + delta } : i)
        .filter(i => i.qty > 0)
    );
  }, []);

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const addItem = useCallback((menuItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.name === menuItem.name);
      if (existing) {
        return prev.map(i => i.name === menuItem.name ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: `new-${Date.now()}`, name: menuItem.name, qty: 1, price: menuItem.price }];
    });
  }, []);

  const handleSettle = useCallback(() => {
    Alert.alert(
      'Settle Table',
      `Settle Table ${table.number} for ${symbol}${grandTotal.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              if (createOrder) {
                const orderData = {
                  outlet_id: outletId,
                  order_type: 'dine_in',
                  table_id: table.id || null,
                  source: 'pos',
                  notes: '',
                  items: items.map(item => ({
                    menu_item_id: item.id,
                    item_name: item.name,
                    variant_id: null,
                    variant_name: null,
                    quantity: item.qty,
                    unit_price: item.price,
                    notes: '',
                    addons: [],
                  })),
                  created_by: userId,
                };
                await createOrder(orderData);
              }
              onSettle(table.id, grandTotal);
              Alert.alert('Success', `Table ${table.number} settled successfully!`);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to create order');
            }
          },
        },
      ]
    );
  }, [table, grandTotal, onSettle, createOrder, outletId, userId, items]);

  const handleWhatsApp = useCallback(() => {
    const text = formatWhatsAppBill({
      table, items, subtotal, cgst, sgst,
      discountAmt, grandTotal,
      paymentMode: paymentMode.toUpperCase(),
    });
    Linking.openURL(`whatsapp://send?text=${text}`).catch(() =>
      Alert.alert('WhatsApp not available', 'Please install WhatsApp to share the bill.')
    );
  }, [table, items, subtotal, cgst, sgst, discountAmt, grandTotal, paymentMode]);

  const handlePrintReceipt = useCallback(() => {
    printReceipt({
      outletName: RESTAURANT_NAME,
      table: table?.number ? `Table ${table.number}` : null,
      items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      subtotal,
      tax: cgst + sgst,
      discount: discountAmt > 0 ? discountAmt : null,
      total: grandTotal,
      paymentMode: paymentMode.toUpperCase(),
      orderId: billNumber,
    }).catch((err) => {
      console.warn('[Printer] Receipt print failed:', err?.message);
    });
  }, [table, items, subtotal, cgst, sgst, discountAmt, grandTotal, paymentMode, billNumber]);

  const PAYMENT_MODES = [
    { id: 'cash', label: 'Cash', icon: 'cash-outline' },
    { id: 'card', label: 'Card', icon: 'card-outline' },
    { id: 'upi', label: 'UPI', icon: 'qr-code-outline' },
    { id: 'zomato', label: 'Zomato Pay', icon: 'phone-portrait-outline' },
  ];

  if (!table) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS !== 'web' ? 'padding' : undefined}>
        <View style={[styles.modalContainer, { paddingBottom: insets.bottom }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalRestaurant}>{RESTAURANT_NAME}</Text>
              <Text style={styles.modalTitle}>Table {table.number} · Bill</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#000" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Bill Info strip */}
            <View style={styles.billInfoStrip}>
              <View style={styles.billInfoItem}>
                <Ionicons name="receipt-outline" size={13} color="#888" />
                <Text style={styles.billInfoText}>{billNumber}</Text>
              </View>
              <View style={styles.billInfoItem}>
                <Ionicons name="calendar-outline" size={13} color="#888" />
                <Text style={styles.billInfoText}>{nowDateTime()}</Text>
              </View>
            </View>
            <View style={styles.billInfoStrip}>
              <View style={styles.billInfoItem}>
                <Ionicons name="person-outline" size={13} color="#888" />
                <Text style={styles.billInfoText}>Waiter: {table.waiter}</Text>
              </View>
              <View style={styles.billInfoItem}>
                <Ionicons name="people-outline" size={13} color="#888" />
                <Text style={styles.billInfoText}>{table.covers} covers · Since {table.since}</Text>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Order Items */}
            <Text style={styles.sectionHeading}>Order Items</Text>
            {items.length === 0 ? (
              <View style={styles.emptyItems}>
                <Ionicons name="cart-outline" size={28} color="#CCC" />
                <Text style={styles.emptyItemsText}>No items. Add from menu below.</Text>
              </View>
            ) : (
              items.map(item => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemUnitPrice}>{symbol}{item.price} each</Text>
                  </View>
                  <View style={styles.qtyControl}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, -1)}>
                      <Ionicons name="remove" size={14} color="#444" />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, 1)}>
                      <Ionicons name="add" size={14} color="#444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.itemTotal}>{symbol}{(item.qty * item.price).toLocaleString(locale)}</Text>
                  <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeItemBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={14} color="#EE0000" />
                  </TouchableOpacity>
                </View>
              ))
            )}

            <TouchableOpacity style={styles.addItemsBtn} onPress={() => setShowItemPicker(true)}>
              <Ionicons name="add-circle-outline" size={16} color="#2563eb" />
              <Text style={styles.addItemsBtnText}>Add More Items</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            {/* Discount */}
            <View style={styles.discountHeader}>
              <Text style={styles.sectionHeading} style={{ marginBottom: 0 }}>Discount</Text>
              {!discount && (
                <TouchableOpacity onPress={() => setShowDiscountPanel(p => !p)}>
                  <Text style={styles.addDiscountLink}>{showDiscountPanel ? 'Cancel' : '+ Add Discount'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {(showDiscountPanel || discount) && (
              <DiscountPanel
                discount={discount}
                onApply={(d) => { setDiscount(d); setShowDiscountPanel(false); }}
                onRemove={() => { setDiscount(null); setShowDiscountPanel(false); }}
              />
            )}

            <View style={styles.separator} />

            {/* GST Breakdown */}
            <Text style={styles.sectionHeading}>Tax & Total</Text>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Subtotal</Text>
              <Text style={styles.calcValue}>{symbol}{subtotal.toLocaleString(locale)}</Text>
            </View>
            {discountAmt > 0 && (
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: '#00B341' }]}>Discount</Text>
                <Text style={[styles.calcValue, { color: '#00B341' }]}>−{symbol}{discountAmt.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>CGST (2.5%)</Text>
              <Text style={styles.calcValue}>{symbol}{cgst.toFixed(2)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>SGST (2.5%)</Text>
              <Text style={styles.calcValue}>{symbol}{sgst.toFixed(2)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Total GST</Text>
              <Text style={styles.calcValue}>{symbol}{(cgst + sgst).toFixed(2)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
              <Text style={styles.grandTotalValue}>{symbol}{grandTotal.toFixed(2)}</Text>
            </View>

            <View style={styles.separator} />

            {/* Split Bill */}
            <TouchableOpacity style={styles.splitBillBtn} onPress={() => setShowSplitModal(true)}>
              <Ionicons name="people-outline" size={16} color="#7B61FF" />
              <Text style={styles.splitBillBtnText}>Split Bill</Text>
              <Ionicons name="chevron-forward" size={14} color="#7B61FF" />
            </TouchableOpacity>

            <View style={styles.separator} />

            {/* Payment Mode */}
            <Text style={styles.sectionHeading}>Payment Mode</Text>
            <View style={styles.payGrid}>
              {PAYMENT_MODES.map(pm => (
                <TouchableOpacity
                  key={pm.id}
                  style={[styles.payPill, paymentMode === pm.id && styles.payPillSelected]}
                  activeOpacity={0.75}
                  onPress={() => setPaymentMode(pm.id)}
                >
                  <Ionicons name={pm.icon} size={18} color={paymentMode === pm.id ? '#FFF' : '#444'} />
                  <Text style={[styles.payPillLabel, paymentMode === pm.id && styles.payPillLabelSelected]}>
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cash change */}
            {paymentMode === 'cash' && (
              <View style={styles.cashRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cashLabel}>Amount Tendered</Text>
                  <TextInput
                    style={styles.cashInput}
                    placeholder={`${symbol}${Math.ceil(grandTotal)}`}
                    placeholderTextColor="#AAA"
                    keyboardType="numeric"
                    value={amountTendered}
                    onChangeText={setAmountTendered}
                  />
                </View>
                {parseFloat(amountTendered) > 0 && (
                  <View style={styles.changeBox}>
                    <Text style={styles.changeLabel}>Change</Text>
                    <Text style={styles.changeValue}>{symbol}{change.toFixed(2)}</Text>
                  </View>
                )}
              </View>
            )}

            {/* UPI QR placeholder */}
            {paymentMode === 'upi' && (
              <View style={styles.qrBox}>
                <Ionicons name="qr-code" size={48} color="#CCC" />
                <Text style={styles.qrBoxText}>Show QR to customer</Text>
                <Text style={styles.qrBoxSub}>Scan & Pay ₹{grandTotal.toFixed(2)}</Text>
              </View>
            )}

            {/* Multi-payment info */}
            {extraPayments.length > 0 && (
              <View style={styles.extraPayBox}>
                {extraPayments.map((ep, idx) => (
                  <View key={idx} style={styles.extraPayRow}>
                    <Text style={styles.extraPayLabel}>{ep.label}</Text>
                    <Text style={styles.extraPayAmt}>₹{ep.amount}</Text>
                    <TouchableOpacity onPress={() => setExtraPayments(p => p.filter((_, i) => i !== idx))}>
                      <Ionicons name="close-circle" size={16} color="#EE0000" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.separator} />

            {/* Action Buttons */}
            <PressCard scaleDown={0.97} onPress={handleSettle} style={[styles.actionBtnPrimary, isCreating && { opacity: 0.6 }]} disabled={isCreating}>
              {isCreating ? (
                <Text style={styles.actionBtnPrimaryText}>Creating Order...</Text>
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.actionBtnPrimaryText}>Settle &amp; Print</Text>
                </>
              )}
            </PressCard>

            <PressCard scaleDown={0.97} onPress={handleWhatsApp} style={styles.actionBtnWhatsapp}>
              <Ionicons name="logo-whatsapp" size={18} color="#FFF" />
              <Text style={styles.actionBtnWhatsappText}>Share on WhatsApp</Text>
            </PressCard>

            <TouchableOpacity style={styles.actionBtnPrint} onPress={handlePrintReceipt} activeOpacity={0.8}>
              <Ionicons name="print-outline" size={18} color="#6366f1" />
              <Text style={styles.actionBtnPrintText}>Print Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnHold} activeOpacity={0.8}>
              <Ionicons name="pause-circle-outline" size={18} color="#444" />
              <Text style={styles.actionBtnHoldText}>Hold Bill</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <ItemPickerModal
        visible={showItemPicker}
        onClose={() => setShowItemPicker(false)}
        onAdd={addItem}
        menuItems={menuItems}
      />
      <SplitBillModal
        visible={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        grandTotal={grandTotal}
        items={items}
      />
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const { outletId } = useOutlet();
  const { user } = useAuth();
  const { createOrder, isCreating } = useCreateOfflineOrder();
  const { items: offlineMenuItems } = useOfflineMenu(outletId);
  const { tables: offlineTables } = useOfflineTables(outletId);

  // Use offline data with fallbacks to hardcoded arrays
  const activeTables = offlineTables && offlineTables.length > 0 ? offlineTables : INITIAL_TABLES;
  const activeMenuItems = offlineMenuItems && offlineMenuItems.length > 0
    ? offlineMenuItems.map(item => ({
        id: item.id,
        name: item.name || item.item_name,
        price: item.price || item.unit_price || 0,
        category: item.category || item.category_name || 'Uncategorized',
      }))
    : MENU_ITEMS;

  const [tables, setTables] = useState(INITIAL_TABLES);
  // Settled bills accumulate in-session as tables are settled (handleSettle).
  // No mock seed — starts empty and renders the "no settled bills" empty state.
  const [settledBills, setSettledBills] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  // Update tables state when offline data loads
  useEffect(() => {
    if (offlineTables && offlineTables.length > 0) {
      setTables(offlineTables);
    }
  }, [offlineTables]);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
      if (Platform.OS !== 'web') {
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      } else {
        fadeAnim.setValue(1);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const totalRevenue = useMemo(
    () => settledBills.reduce((s, b) => s + b.total, 0),
    [settledBills]
  );
  const outstandingAmt = useMemo(() => tables.reduce((s, t) => s + calcSubtotal(t.items), 0), [tables]);

  const openBill = useCallback((table) => {
    setSelectedTable(table);
    setModalVisible(true);
  }, []);

  const closeBill = useCallback(() => {
    setModalVisible(false);
    setSelectedTable(null);
  }, []);

  const handleSettle = useCallback((tableId, amount) => {
    const table = tables.find(t => t.id === tableId);
    if (table) {
      setSettledBills(prev => [
        {
          id: `b-${Date.now()}`,
          tableNumber: table.number,
          waiter: table.waiter,
          total: Math.round(amount),
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          payMode: 'Cash',
        },
        ...prev,
      ]);
    }
    setTables(prev => prev.filter(t => t.id !== tableId));
    setModalVisible(false);
    setSelectedTable(null);
  }, [tables]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F7" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Billing</Text>
          <Text style={styles.headerSubtitle}>Manage tables, bills &amp; payments</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{tables.length} open</Text>
        </View>
      </View>

      {loading ? (
        <BillingSkeleton />
      ) : (
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Quick Stats */}
            <View style={styles.statsRow}>
              <StatCard label="Today's Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} accent="#00B341" />
              <StatCard label="Bills Settled" value={String(settledBills.length)} accent="#2563eb" />
              <StatCard label="Outstanding" value={`₹${outstandingAmt.toLocaleString('en-IN')}`} accent="#F5A623" />
            </View>

            {/* Occupied Tables */}
            <Text style={styles.listSectionTitle}>Occupied Tables</Text>
            {tables.length === 0 ? (
              <View style={styles.emptyTablesCard}>
                <Ionicons name="checkmark-circle" size={36} color="#00B341" />
                <Text style={styles.emptyTablesTitle}>All settled up!</Text>
                <Text style={styles.emptyTablesSub}>No tables waiting for a bill</Text>
              </View>
            ) : (
              tables.map(table => (
                <TableBillCard key={table.id} table={table} onPress={openBill} />
              ))
            )}

            {/* Settled Bills */}
            <Text style={[styles.listSectionTitle, { marginTop: 24 }]}>
              Today's Settled Bills
              <Text style={styles.listSectionCount}> ({settledBills.length})</Text>
            </Text>
            {settledBills.length === 0 ? (
              <Text style={styles.noSettledText}>No bills settled yet today.</Text>
            ) : (
              <View style={styles.settledCard}>
                {settledBills.map((bill, idx) => (
                  <View key={bill.id}>
                    <SettledBillRow bill={bill} />
                    {idx < settledBills.length - 1 && <View style={styles.settledDivider} />}
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* Bill Modal */}
      <BillModal
        table={selectedTable}
        visible={modalVisible}
        onClose={closeBill}
        onSettle={handleSettle}
        createOrder={createOrder}
        isCreating={isCreating}
        outletId={outletId}
        userId={user?.id}
        menuItems={activeMenuItems}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888888',
    marginTop: 2,
  },
  headerBadge: {
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // List
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 9,
    color: '#888888',
    marginTop: 3,
    textAlign: 'center',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Section titles
  listSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  listSectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
  },

  // Table Card
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tableCardLeft: { marginRight: 12 },
  tableCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EBF3FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  tableCircleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
    letterSpacing: -0.3,
  },
  tableCardBody: { flex: 1 },
  subtotalText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.6,
    marginBottom: 1,
  },
  tableTitle: { fontSize: 14, fontWeight: '700', color: '#000000' },
  tableWaiter: { fontSize: 12, color: '#888888', marginTop: 1 },
  tableMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F7F7F7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metaText: { fontSize: 11, color: '#888888' },
  generateBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  generateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Empty tables
  emptyTablesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    marginBottom: 12,
  },
  emptyTablesTitle: { fontSize: 16, fontWeight: '700', color: '#000', marginTop: 12 },
  emptyTablesSub: { fontSize: 13, color: '#888', marginTop: 4 },

  // Settled Bills
  settledCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settledLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settledCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E6F9ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settledTable: { fontSize: 14, fontWeight: '700', color: '#000' },
  settledMeta: { fontSize: 12, color: '#888', marginTop: 1 },
  settledRight: { alignItems: 'flex-end', gap: 4 },
  settledTotal: { fontSize: 15, fontWeight: '800', color: '#000' },
  payModePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  payModePillText: { fontSize: 10, fontWeight: '700' },
  settledDivider: { height: 1, backgroundColor: '#F4F4F4', marginHorizontal: 16 },
  noSettledText: { fontSize: 13, color: '#888', textAlign: 'center', paddingVertical: 16 },

  // ── MODAL ──────────────────────────────────────────────────────────────────

  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  modalRestaurant: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#000000', marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F7F7F7',
    justifyContent: 'center', alignItems: 'center',
  },
  modalBody: { flex: 1, paddingHorizontal: 20 },

  // Bill info strip
  billInfoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  billInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  billInfoText: { fontSize: 12, color: '#888888' },

  separator: {
    height: 1,
    backgroundColor: '#EAEAEA',
    marginVertical: 14,
  },

  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },

  // Items
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyItemsText: { fontSize: 13, color: '#AAA' },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F4',
    gap: 8,
  },
  itemName: { fontSize: 14, color: '#000000', fontWeight: '600' },
  itemUnitPrice: { fontSize: 11, color: '#888888', marginTop: 1 },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 28, height: 28,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F7F7F7',
  },
  qtyText: {
    width: 28, textAlign: 'center',
    fontSize: 13, fontWeight: '700', color: '#000',
  },
  itemTotal: {
    fontSize: 14, fontWeight: '800', color: '#000000',
    width: 65, textAlign: 'right',
  },
  removeItemBtn: {
    width: 24, height: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  addItemsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10,
  },
  addItemsBtnText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },

  // Discount
  discountHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  addDiscountLink: { fontSize: 13, fontWeight: '700', color: '#2563eb' },
  discountPanel: {
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  discountModeTabs: {
    flexDirection: 'row', gap: 8,
  },
  discountModeTab: {
    flex: 1, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#EAEAEA',
    alignItems: 'center',
  },
  discountModeTabActive: { backgroundColor: '#2563eb' },
  discountModeTabText: { fontSize: 12, fontWeight: '700', color: '#444' },
  discountModeTabTextActive: { color: '#FFF' },
  discountInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  discountTextInput: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#000',
  },
  discountApplyBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  discountApplyBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  discountApplied: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E6F9ED',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  discountAppliedLabel: { fontSize: 13, fontWeight: '700', color: '#00B341' },

  // Calc rows
  calcRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  calcLabel: { fontSize: 13, color: '#444444' },
  calcValue: { fontSize: 13, fontWeight: '600', color: '#000000' },
  grandTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  grandTotalLabel: {
    fontSize: 13, fontWeight: '800', color: '#FFFFFF',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  grandTotalValue: {
    fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8,
  },

  // Split Bill
  splitBillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F0FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  splitBillBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#7B61FF' },

  // Payment
  payGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14,
  },
  payPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#EAEAEA',
    borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  payPillSelected: { backgroundColor: '#2563eb', borderColor: '#e2e8f0' },
  payPillLabel: { fontSize: 13, fontWeight: '700', color: '#444444' },
  payPillLabelSelected: { color: '#FFFFFF' },

  // Cash change
  cashRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-end', marginBottom: 10,
  },
  cashLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 4 },
  cashInput: {
    backgroundColor: '#F7F7F7',
    borderWidth: 1, borderColor: '#EAEAEA', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#000',
  },
  changeBox: {
    backgroundColor: '#E6F9ED',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  changeLabel: { fontSize: 10, color: '#00B341', fontWeight: '700', textTransform: 'uppercase' },
  changeValue: { fontSize: 16, fontWeight: '800', color: '#00B341', marginTop: 2 },

  // QR box
  qrBox: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#EAEAEA', borderRadius: 16, borderStyle: 'dashed',
    paddingVertical: 28, marginBottom: 10, gap: 8,
  },
  qrBoxText: { fontSize: 14, fontWeight: '700', color: '#444' },
  qrBoxSub: { fontSize: 12, color: '#888' },

  // Extra payments
  extraPayBox: {
    backgroundColor: '#F7F7F7', borderRadius: 12, padding: 10, gap: 6, marginBottom: 10,
  },
  extraPayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  extraPayLabel: { flex: 1, fontSize: 13, color: '#444', fontWeight: '600' },
  extraPayAmt: { fontSize: 13, fontWeight: '700', color: '#000' },

  // Action buttons
  actionBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#2563eb', borderRadius: 14, minHeight: 52, marginBottom: 10,
  },
  actionBtnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  actionBtnWhatsapp: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 14, minHeight: 52, marginBottom: 10,
  },
  actionBtnWhatsappText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  actionBtnPrint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F3F0FF', borderRadius: 14, minHeight: 52, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#6366f1',
  },
  actionBtnPrintText: { fontSize: 15, fontWeight: '700', color: '#6366f1' },
  actionBtnHold: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 14, minHeight: 52,
    borderWidth: 1.5, borderColor: '#EAEAEA',
  },
  actionBtnHoldText: { fontSize: 15, fontWeight: '700', color: '#444444' },

  // ── ITEM PICKER MODAL ───────────────────────────────────────────────────────

  pickerContainer: {
    flex: 1, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#EAEAEA',
  },
  pickerTitle: { fontSize: 18, fontWeight: '800', color: '#000' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginVertical: 12,
    backgroundColor: '#F7F7F7',
    borderRadius: 12, borderWidth: 1, borderColor: '#EAEAEA',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#000' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F4F4F4',
    gap: 10,
  },
  pickerItemName: { fontSize: 14, fontWeight: '600', color: '#000' },
  pickerItemCat: { fontSize: 11, color: '#888', marginTop: 1 },
  pickerItemPrice: { fontSize: 14, fontWeight: '700', color: '#000', marginRight: 8 },
  pickerAddBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#EBF3FF',
    justifyContent: 'center', alignItems: 'center',
  },

  // ── SPLIT BILL MODAL ────────────────────────────────────────────────────────

  splitLabel: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 8 },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginBottom: 16, alignSelf: 'flex-start',
  },
  stepperBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#F7F7F7', borderWidth: 1, borderColor: '#EAEAEA',
    justifyContent: 'center', alignItems: 'center',
  },
  stepperVal: { fontSize: 22, fontWeight: '800', color: '#000', minWidth: 30, textAlign: 'center' },
  splitModeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  splitModeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 999,
    backgroundColor: '#EAEAEA', alignItems: 'center',
  },
  splitModeBtnActive: { backgroundColor: '#7B61FF' },
  splitModeBtnText: { fontSize: 13, fontWeight: '700', color: '#444' },
  splitModeBtnTextActive: { color: '#FFF' },
  equalSplitBox: { gap: 6 },
  equalSplitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
  },
  personBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F3F0FF',
    justifyContent: 'center', alignItems: 'center',
  },
  personBadgeText: { fontSize: 12, fontWeight: '800', color: '#7B61FF' },
  personName: { flex: 1, fontSize: 14, color: '#000', fontWeight: '600' },
  personAmount: { fontSize: 15, fontWeight: '800', color: '#000' },
  customSplitItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F4F4F4',
  },
  customSplitItemName: { flex: 1, fontSize: 13, color: '#000', fontWeight: '600' },
  assignBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F7F7F7', borderWidth: 1, borderColor: '#EAEAEA',
    justifyContent: 'center', alignItems: 'center',
  },
  assignBtnActive: { backgroundColor: '#7B61FF', borderColor: '#7B61FF' },
  assignBtnText: { fontSize: 11, fontWeight: '800', color: '#444' },
  assignBtnTextActive: { color: '#FFF' },
});
