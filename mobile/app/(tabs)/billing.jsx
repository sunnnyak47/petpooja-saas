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
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useOpenOrders, useSettleOrder } from '../../src/hooks/useBilling';
import { useOutlet } from '../../src/context/OutletContext';
import { printReceipt } from '../../src/lib/printer';
import { useCurrency } from '../../src/hooks/useCurrency';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESTAURANT_NAME = 'MS Restaurant';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso, locale) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString(locale || 'en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(iso, locale) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString(locale || 'en-IN', { hour: '2-digit', minute: '2-digit' });
}

function orderLabel(order) {
  return order.tableNumber != null
    ? `Table ${order.tableNumber}`
    : (order.orderType || 'order').replace(/_/g, ' ');
}

function formatWhatsAppBill({ order, symbol, locale, methodLabel, isAU }) {
  const sym = symbol || '';
  const loc = locale || 'en-IN';
  const itemLines = order.items
    .map((i) => `  • ${i.name} x${i.qty}  ${sym}${i.total.toLocaleString(loc)}`)
    .join('\n');
  return encodeURIComponent(
    `🍽 *${RESTAURANT_NAME}*\n` +
    `${orderLabel(order)} | Order #${order.orderNumber}\n` +
    `${fmtDateTime(order.createdAt, loc)}\n\n` +
    `*Items:*\n${itemLines}\n\n` +
    `Subtotal: ${sym}${order.subtotal.toLocaleString(loc)}\n` +
    (order.discount > 0 ? `Discount: -${sym}${order.discount.toFixed(2)}\n` : '') +
    (order.cgst > 0 ? `CGST: ${sym}${order.cgst.toFixed(2)}\n` : '') +
    (order.sgst > 0 ? `SGST: ${sym}${order.sgst.toFixed(2)}\n` : '') +
    (order.igst > 0 ? `${isAU ? 'GST' : 'IGST'}: ${sym}${order.igst.toFixed(2)}\n` : '') +
    `*GRAND TOTAL: ${sym}${order.grandTotal.toFixed(2)}*\n` +
    (methodLabel ? `Payment: ${methodLabel}\n` : '') +
    `\nThank you for dining with us! 🙏`
  );
}

const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'card', label: 'Card', icon: 'card-outline' },
  { id: 'upi', label: 'UPI', icon: 'qr-code-outline' },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
        {[0, 1, 2].map(i => (
          <SkeletonBox key={i} width="30%" height={72} borderRadius={16} color="#f1f5f9" />
        ))}
      </View>
      {[0, 1, 2, 4].map(i => (
        <SkeletonBox key={i} width="100%" height={100} borderRadius={16} color="#f1f5f9" />
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

// ─── Open Bill Card (real unpaid order) ───────────────────────────────────────

function OpenBillCard({ order, onPress }) {
  const { symbol, locale } = useCurrency();
  const circleLabel = order.tableNumber != null
    ? `T-${order.tableNumber}`
    : `#${String(order.orderNumber).slice(-4)}`;
  return (
    <PressCard scaleDown={0.97} onPress={() => onPress(order)} style={styles.tableCard}>
      <View style={styles.tableCardLeft}>
        <View style={styles.tableCircle}>
          <Text style={styles.tableCircleText}>{circleLabel}</Text>
        </View>
      </View>
      <View style={styles.tableCardBody}>
        <Text style={styles.subtotalText}>{symbol}{order.grandTotal.toLocaleString(locale)}</Text>
        <Text style={styles.tableTitle}>{orderLabel(order)}</Text>
        <Text style={styles.tableWaiter}>
          #{order.orderNumber}{order.waiter ? ` · ${order.waiter}` : ''}
        </Text>
        <View style={styles.tableMetaRow}>
          <View style={styles.metaBadge}>
            <Ionicons name="restaurant-outline" size={12} color="#94a3b8" />
            <Text style={styles.metaText}>{order.items.length} items</Text>
          </View>
          {order.createdAt ? (
            <View style={styles.metaBadge}>
              <Ionicons name="time-outline" size={12} color="#94a3b8" />
              <Text style={styles.metaText}>{fmtTime(order.createdAt, locale)}</Text>
            </View>
          ) : null}
          <View style={styles.metaBadge}>
            <Ionicons name="pricetag-outline" size={12} color="#94a3b8" />
            <Text style={styles.metaText}>{order.status}</Text>
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

// ─── Settled Bill Row (in-session) ────────────────────────────────────────────

function SettledBillRow({ bill }) {
  const modeColor = bill.payMode === 'UPI' ? '#2563eb' : bill.payMode === 'Card' ? '#2563eb' : '#16a34a';
  const { symbol, locale } = useCurrency();
  return (
    <View style={styles.settledRow}>
      <View style={styles.settledLeft}>
        <View style={styles.settledCircle}>
          <Ionicons name="checkmark" size={14} color="#16a34a" />
        </View>
        <View>
          <Text style={styles.settledTable}>{bill.label}</Text>
          <Text style={styles.settledMeta}>{bill.meta}</Text>
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

// ─── Bill / Settle Modal (operates on a REAL order) ───────────────────────────

function BillModal({ order, visible, onClose, onSettle, isSettling }) {
  const insets = useSafeAreaInsets();
  const { symbol, locale, isAU } = useCurrency();
  const [paymentMode, setPaymentMode] = useState('cash');
  const [amountTendered, setAmountTendered] = useState('');

  useEffect(() => {
    if (order) {
      setPaymentMode('cash');
      setAmountTendered('');
    }
  }, [order?.id]);

  if (!order) return null;

  const grandTotal = order.grandTotal;
  const change = Math.max(0, (parseFloat(amountTendered) || 0) - grandTotal);

  const handleSettle = () => {
    Alert.alert(
      'Settle Bill',
      `Record ${symbol}${grandTotal.toFixed(2)} (${paymentMode.toUpperCase()}) for order #${order.orderNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'default', onPress: () => onSettle(order, paymentMode) },
      ]
    );
  };

  const handleWhatsApp = () => {
    const text = formatWhatsAppBill({ order, symbol, locale, isAU, methodLabel: paymentMode.toUpperCase() });
    Linking.openURL(`whatsapp://send?text=${text}`).catch(() =>
      Alert.alert('WhatsApp not available', 'Please install WhatsApp to share the bill.')
    );
  };

  const handlePrintReceipt = () => {
    printReceipt({
      outletName: RESTAURANT_NAME,
      table: order.tableNumber != null ? `Table ${order.tableNumber}` : null,
      items: order.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      subtotal: order.subtotal,
      tax: order.tax,
      discount: order.discount > 0 ? order.discount : null,
      total: order.grandTotal,
      paymentMode: paymentMode.toUpperCase(),
      orderId: order.invoiceNumber || order.orderNumber,
    }).catch((err) => {
      console.warn('[Printer] Receipt print failed:', err?.message);
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS !== 'web' ? 'padding' : undefined}>
        <View style={[styles.modalContainer, { paddingBottom: insets.bottom }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalRestaurant}>{RESTAURANT_NAME}</Text>
              <Text style={styles.modalTitle}>{orderLabel(order)} · Bill</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Bill Info strip */}
            <View style={styles.billInfoStrip}>
              <View style={styles.billInfoItem}>
                <Ionicons name="receipt-outline" size={13} color="#94a3b8" />
                <Text style={styles.billInfoText}>#{order.orderNumber}</Text>
              </View>
              <View style={styles.billInfoItem}>
                <Ionicons name="calendar-outline" size={13} color="#94a3b8" />
                <Text style={styles.billInfoText}>{fmtDateTime(order.createdAt, locale)}</Text>
              </View>
            </View>
            <View style={styles.billInfoStrip}>
              <View style={styles.billInfoItem}>
                <Ionicons name="person-outline" size={13} color="#94a3b8" />
                <Text style={styles.billInfoText}>
                  {order.waiter ? `Waiter: ${order.waiter}` : (order.customerName || 'Walk-in')}
                </Text>
              </View>
              <View style={styles.billInfoItem}>
                <Ionicons name="pricetag-outline" size={13} color="#94a3b8" />
                <Text style={styles.billInfoText}>{order.status}{order.invoiceNumber ? ` · ${order.invoiceNumber}` : ''}</Text>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Order Items (read-only — sourced from the real order) */}
            <Text style={styles.sectionHeading}>Order Items</Text>
            {order.items.length === 0 ? (
              <View style={styles.emptyItems}>
                <Ionicons name="cart-outline" size={28} color="#cbd5e1" />
                <Text style={styles.emptyItemsText}>This order has no items.</Text>
              </View>
            ) : (
              order.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemUnitPrice}>{symbol}{item.price} × {item.qty}</Text>
                  </View>
                  <Text style={styles.itemTotal}>{symbol}{item.total.toLocaleString(locale)}</Text>
                </View>
              ))
            )}

            <View style={styles.separator} />

            {/* Tax & Total (all figures from the backend order) */}
            <Text style={styles.sectionHeading}>Tax & Total</Text>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Subtotal</Text>
              <Text style={styles.calcValue}>{symbol}{order.subtotal.toLocaleString(locale)}</Text>
            </View>
            {order.discount > 0 && (
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: '#16a34a' }]}>Discount</Text>
                <Text style={[styles.calcValue, { color: '#16a34a' }]}>−{symbol}{order.discount.toFixed(2)}</Text>
              </View>
            )}
            {order.cgst > 0 && (
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>CGST</Text>
                <Text style={styles.calcValue}>{symbol}{order.cgst.toFixed(2)}</Text>
              </View>
            )}
            {order.sgst > 0 && (
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>SGST</Text>
                <Text style={styles.calcValue}>{symbol}{order.sgst.toFixed(2)}</Text>
              </View>
            )}
            {order.igst > 0 && (
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>{isAU ? 'GST' : 'IGST'}</Text>
                <Text style={styles.calcValue}>{symbol}{order.igst.toFixed(2)}</Text>
              </View>
            )}
            {order.roundOff !== 0 && (
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>Round Off</Text>
                <Text style={styles.calcValue}>{symbol}{order.roundOff.toFixed(2)}</Text>
              </View>
            )}
            {order.alreadyPaid > 0 && (
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: '#2563eb' }]}>Already Paid</Text>
                <Text style={[styles.calcValue, { color: '#2563eb' }]}>−{symbol}{order.alreadyPaid.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>
                {order.alreadyPaid > 0 ? 'BALANCE DUE' : 'GRAND TOTAL'}
              </Text>
              <Text style={styles.grandTotalValue}>
                {symbol}{(order.balanceDue > 0 ? order.balanceDue : order.grandTotal).toFixed(2)}
              </Text>
            </View>

            <View style={styles.separator} />

            {/* Payment Mode */}
            <Text style={styles.sectionHeading}>Payment Mode</Text>
            <View style={styles.payGrid}>
              {PAYMENT_MODES.map((pm) => (
                <TouchableOpacity
                  key={pm.id}
                  style={[styles.payPill, paymentMode === pm.id && styles.payPillSelected]}
                  activeOpacity={0.75}
                  onPress={() => setPaymentMode(pm.id)}
                >
                  <Ionicons name={pm.icon} size={18} color={paymentMode === pm.id ? '#FFF' : '#475569'} />
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
                    placeholderTextColor="#94a3b8"
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
                <Ionicons name="qr-code" size={48} color="#cbd5e1" />
                <Text style={styles.qrBoxText}>Show QR to customer</Text>
                <Text style={styles.qrBoxSub}>Scan &amp; Pay {symbol}{grandTotal.toFixed(2)}</Text>
              </View>
            )}

            <View style={styles.separator} />

            {/* Action Buttons */}
            <PressCard
              scaleDown={0.97}
              onPress={handleSettle}
              style={[styles.actionBtnPrimary, isSettling && { opacity: 0.6 }]}
              disabled={isSettling}
            >
              {isSettling ? (
                <Text style={styles.actionBtnPrimaryText}>Recording Payment…</Text>
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.actionBtnPrimaryText}>Settle &amp; Pay</Text>
                </>
              )}
            </PressCard>

            <PressCard scaleDown={0.97} onPress={handleWhatsApp} style={styles.actionBtnWhatsapp}>
              <Ionicons name="logo-whatsapp" size={18} color="#FFF" />
              <Text style={styles.actionBtnWhatsappText}>Share on WhatsApp</Text>
            </PressCard>

            <TouchableOpacity style={styles.actionBtnPrint} onPress={handlePrintReceipt} activeOpacity={0.8}>
              <Ionicons name="print-outline" size={18} color="#2563eb" />
              <Text style={styles.actionBtnPrintText}>Print Receipt</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const { outletId } = useOutlet();
  const { symbol, locale } = useCurrency();

  const {
    data: openOrders = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useOpenOrders(outletId);
  const settleMutation = useSettleOrder(outletId);

  // Settled bills accumulate in-session as orders are paid (handleSettle).
  const [settledBills, setSettledBills] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading) {
      if (Platform.OS !== 'web') {
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      } else {
        fadeAnim.setValue(1);
      }
    }
  }, [isLoading]);

  const totalRevenue = useMemo(
    () => settledBills.reduce((s, b) => s + b.total, 0),
    [settledBills]
  );
  const outstandingAmt = useMemo(
    () => openOrders.reduce((s, o) => s + o.grandTotal, 0),
    [openOrders]
  );

  const openBill = useCallback((order) => {
    setSelectedOrder(order);
    setModalVisible(true);
  }, []);

  const closeBill = useCallback(() => {
    setModalVisible(false);
    setSelectedOrder(null);
  }, []);

  const handleSettle = useCallback(async (order, method) => {
    try {
      await settleMutation.mutateAsync({ order, method });
      const paid = order.balanceDue > 0 ? order.balanceDue : order.grandTotal;
      setSettledBills((prev) => [
        {
          id: `b-${order.id}`,
          label: orderLabel(order),
          meta: `${order.orderNumber} · ${new Date().toLocaleTimeString(locale || 'en-IN', { hour: '2-digit', minute: '2-digit' })}`,
          total: Math.round(paid),
          payMode: method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : 'Cash',
        },
        ...prev,
      ]);
      setModalVisible(false);
      setSelectedOrder(null);
      Alert.alert('Payment Recorded', `Order #${order.orderNumber} settled (${symbol}${paid.toFixed(2)}).`);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to record payment';
      Alert.alert('Payment Failed', msg);
    }
  }, [settleMutation, symbol, locale]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Billing</Text>
          <Text style={styles.headerSubtitle}>Settle open bills &amp; record payments</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{openOrders.length} open</Text>
        </View>
      </View>

      {isLoading ? (
        <BillingSkeleton />
      ) : (
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563eb" />
            }
          >
            {/* Quick Stats */}
            <View style={styles.statsRow}>
              <StatCard label="Session Revenue" value={`${symbol}${totalRevenue.toLocaleString(locale)}`} accent="#16a34a" />
              <StatCard label="Bills Settled" value={String(settledBills.length)} accent="#2563eb" />
              <StatCard label="Outstanding" value={`${symbol}${Math.round(outstandingAmt).toLocaleString(locale)}`} accent="#d97706" />
            </View>

            {/* Open Bills */}
            <Text style={styles.listSectionTitle}>Open Bills</Text>
            {isError ? (
              <View style={styles.emptyTablesCard}>
                <Ionicons name="cloud-offline-outline" size={36} color="#d97706" />
                <Text style={styles.emptyTablesTitle}>Couldn't load orders</Text>
                <Text style={styles.emptyTablesSub}>Pull down to retry</Text>
              </View>
            ) : openOrders.length === 0 ? (
              <View style={styles.emptyTablesCard}>
                <Ionicons name="checkmark-circle" size={36} color="#16a34a" />
                <Text style={styles.emptyTablesTitle}>All settled up!</Text>
                <Text style={styles.emptyTablesSub}>No open bills waiting for payment</Text>
              </View>
            ) : (
              openOrders.map((order) => (
                <OpenBillCard key={order.id} order={order} onPress={openBill} />
              ))
            )}

            {/* Settled Bills */}
            <Text style={[styles.listSectionTitle, { marginTop: 24 }]}>
              Settled This Session
              <Text style={styles.listSectionCount}> ({settledBills.length})</Text>
            </Text>
            {settledBills.length === 0 ? (
              <Text style={styles.noSettledText}>No bills settled yet.</Text>
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
        order={selectedOrder}
        visible={modalVisible}
        onClose={closeBill}
        onSettle={handleSettle}
        isSettling={settleMutation.isPending}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
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
    borderColor: '#e2e8f0',
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
    color: '#0f172a',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 9,
    color: '#94a3b8',
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
    color: '#0f172a',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  listSectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },

  // Table Card
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    backgroundColor: '#eff6ff',
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
    color: '#0f172a',
    letterSpacing: -0.6,
    marginBottom: 1,
  },
  tableTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  tableWaiter: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
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
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metaText: { fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' },
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
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  emptyTablesTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 12 },
  emptyTablesSub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },

  // Settled Bills
  settledCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settledTable: { fontSize: 14, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  settledMeta: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  settledRight: { alignItems: 'flex-end', gap: 4 },
  settledTotal: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  payModePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  payModePillText: { fontSize: 10, fontWeight: '700' },
  settledDivider: { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 16 },
  noSettledText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },

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
    borderBottomColor: '#e2e8f0',
  },
  modalRestaurant: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginTop: 2, textTransform: 'capitalize' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f8fafc',
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
  billInfoText: { fontSize: 12, color: '#94a3b8' },

  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 14,
  },

  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
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
  emptyItemsText: { fontSize: 13, color: '#94a3b8' },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  itemName: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  itemUnitPrice: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 28, height: 28,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  qtyText: {
    width: 28, textAlign: 'center',
    fontSize: 13, fontWeight: '700', color: '#0f172a',
  },
  itemTotal: {
    fontSize: 14, fontWeight: '800', color: '#0f172a',
    width: 80, textAlign: 'right',
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
    backgroundColor: '#f8fafc',
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
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
  },
  discountModeTabActive: { backgroundColor: '#2563eb' },
  discountModeTabText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  discountModeTabTextActive: { color: '#FFF' },
  discountInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  discountTextInput: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
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
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  discountAppliedLabel: { fontSize: 13, fontWeight: '700', color: '#16a34a' },

  // Calc rows
  calcRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  calcLabel: { fontSize: 13, color: '#475569' },
  calcValue: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
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
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  splitBillBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#2563eb' },

  // Payment
  payGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14,
  },
  payPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  payPillSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  payPillLabel: { fontSize: 13, fontWeight: '700', color: '#475569' },
  payPillLabelSelected: { color: '#FFFFFF' },

  // Cash change
  cashRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-end', marginBottom: 10,
  },
  cashLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600', marginBottom: 4 },
  cashInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#0f172a',
  },
  changeBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  changeLabel: { fontSize: 10, color: '#16a34a', fontWeight: '700', textTransform: 'uppercase' },
  changeValue: { fontSize: 16, fontWeight: '800', color: '#16a34a', marginTop: 2 },

  // QR box
  qrBox: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 16, borderStyle: 'dashed',
    paddingVertical: 28, marginBottom: 10, gap: 8,
  },
  qrBoxText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  qrBoxSub: { fontSize: 12, color: '#94a3b8' },

  // Extra payments
  extraPayBox: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 10, gap: 6, marginBottom: 10,
  },
  extraPayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  extraPayLabel: { flex: 1, fontSize: 13, color: '#475569', fontWeight: '600' },
  extraPayAmt: { fontSize: 13, fontWeight: '700', color: '#0f172a' },

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
    backgroundColor: '#eff6ff', borderRadius: 14, minHeight: 52, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#2563eb',
  },
  actionBtnPrintText: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  actionBtnHold: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 14, minHeight: 52,
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  actionBtnHoldText: { fontSize: 15, fontWeight: '700', color: '#475569' },

  // ── ITEM PICKER MODAL ───────────────────────────────────────────────────────

  pickerContainer: {
    flex: 1, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  pickerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginVertical: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  pickerItemName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  pickerItemCat: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  pickerItemPrice: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginRight: 8 },
  pickerAddBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#eff6ff',
    justifyContent: 'center', alignItems: 'center',
  },

  // ── SPLIT BILL MODAL ────────────────────────────────────────────────────────

  splitLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8 },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginBottom: 16, alignSelf: 'flex-start',
  },
  stepperBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    justifyContent: 'center', alignItems: 'center',
  },
  stepperVal: { fontSize: 22, fontWeight: '800', color: '#0f172a', minWidth: 30, textAlign: 'center' },
  splitModeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  splitModeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 999,
    backgroundColor: '#e2e8f0', alignItems: 'center',
  },
  splitModeBtnActive: { backgroundColor: '#2563eb' },
  splitModeBtnText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  splitModeBtnTextActive: { color: '#FFF' },
  equalSplitBox: { gap: 6 },
  equalSplitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
  },
  personBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#eff6ff',
    justifyContent: 'center', alignItems: 'center',
  },
  personBadgeText: { fontSize: 12, fontWeight: '800', color: '#2563eb' },
  personName: { flex: 1, fontSize: 14, color: '#0f172a', fontWeight: '600' },
  personAmount: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  customSplitItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  customSplitItemName: { flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '600' },
  assignBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    justifyContent: 'center', alignItems: 'center',
  },
  assignBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  assignBtnText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  assignBtnTextActive: { color: '#FFF' },
});
