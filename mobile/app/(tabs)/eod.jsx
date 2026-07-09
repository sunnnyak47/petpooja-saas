/**
 * End of Day (EOD) Summary Screen — PetPooja ERP
 * Phase 4: Connected to real /reports/eod API
 * Expo SDK 54 · Expo Router 6 · Reanimated v4 · JSX
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Linking,
  Share,
  Platform,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { T, R, FS, FW } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useEOD, useCloseDay } from '../../src/hooks/useApi';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 40;
const CHART_H = 120;
const HOURS   = ['10', '11', '12', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Gold accent — not in T.* because it's loyalty/highlight colour, not brand
const GOLD = '#f59e0b';

// ─── Field normaliser ────────────────────────────────────────────────────────
/**
 * Maps both real API shape (cash_system, top_items[].qty, etc.)
 * and the MOCK_EOD shape (cash_sales, top_items[].count, etc.)
 * to a single consistent UI shape.
 */
function normalizeEOD(raw) {
  if (!raw) return null;

  const totalOrders  = raw.total_orders ?? 0;
  const totalRevenue = raw.total_revenue ?? raw.revenue ?? 0;
  const cashPay      = raw.cash_system  ?? raw.cash_sales  ?? 0;
  const cardPay      = raw.card_system  ?? raw.card_sales  ?? 0;
  const upiPay       = raw.upi_system   ?? raw.upi_sales   ?? 0;
  const onlinePay    = raw.other_system ?? raw.online_sales ?? 0;

  const topItems = (raw.top_items || []).slice(0, 5).map(i => ({
    name:    i.name    ?? '',
    qty:     i.qty     ?? i.count ?? 0,
    revenue: i.revenue ?? 0,
  }));

  // staff_on_duty is a string[] in MOCK; real API may return object[]
  const rawStaff = raw.staff_on_duty ?? raw.staff ?? [];
  const AVATAR_COLORS = [T.accent, GOLD, T.success, T.danger, '#7c3aed', T.warning];
  const staff = rawStaff.map((s, i) =>
    typeof s === 'string'
      ? {
          name:     s,
          initials: s.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
          hours:    null,
          color:    AVATAR_COLORS[i % AVATAR_COLORS.length],
        }
      : {
          name:     s.name     ?? s.full_name  ?? '',
          initials: (s.initials ?? (s.name ?? '').split(' ').map(p => p[0]).join('').slice(0, 2)).toUpperCase(),
          hours:    s.hours    ?? s.total_hours ?? null,
          color:    s.color    ?? AVATAR_COLORS[i % AVATAR_COLORS.length],
        }
  );

  return {
    revenue:     totalRevenue,
    orders:      totalOrders,
    avgOrderValue: totalOrders > 0
      ? Math.round(totalRevenue / totalOrders)
      : (raw.avg_order_value ?? 0),

    payments: { cash: cashPay, card: cardPay, upi: upiPay, zomato: onlinePay },

    topItems,
    bottomItems:   raw.bottom_items    ?? [],
    staff,
    hourlyRevenue: raw.hourly_revenue  ?? [],
    waste:         raw.waste           ?? [],

    // Financial extras
    voids:     raw.void_amount     ?? 0,
    refunds:   raw.refund_amount   ?? 0,
    discounts: raw.total_discount  ?? 0,

    // Order-type breakdown (only real API provides these)
    dineInOrders:    raw.dine_in_orders    ?? 0,
    dineInRevenue:   raw.dine_in_revenue   ?? 0,
    takeawayOrders:  raw.takeaway_orders   ?? 0,
    takeawayRevenue: raw.takeaway_revenue  ?? 0,
    deliveryOrders:  raw.delivery_orders   ?? 0,
    deliveryRevenue: raw.delivery_revenue  ?? 0,

    status: raw.status ?? 'open',
  };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function displayDate(d) {
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function offsetDate(d, days) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon, color }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: color + '1a' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function PaymentRow({ label, icon, amount, total, color }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <View style={styles.paymentRow}>
      <View style={styles.paymentLeft}>
        <View style={[styles.paymentIconWrap, { backgroundColor: color + '1a' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <View>
          <Text style={styles.paymentLabel}>{label}</Text>
          <Text style={styles.paymentPct}>{pct.toFixed(1)}% of total</Text>
        </View>
      </View>
      <View style={styles.paymentRight}>
        <Text style={styles.paymentAmount}>₹{amount.toLocaleString('en-IN')}</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

function OrderTypeRow({ label, icon, orders, revenue, color }) {
  return (
    <View style={styles.orderTypeRow}>
      <View style={[styles.orderTypeIcon, { backgroundColor: color + '1a' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={styles.orderTypeLabel}>{label}</Text>
      <Text style={styles.orderTypeOrders}>{orders} orders</Text>
      <Text style={styles.orderTypeRevenue}>₹{revenue.toLocaleString('en-IN')}</Text>
    </View>
  );
}

function HourlyChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartBars}>
        {data.map((val, i) => {
          const barH = (val / max) * (CHART_H - 24);
          return (
            <View key={i} style={styles.chartBarCol}>
              <View style={styles.chartBarWrapper}>
                <View style={[styles.chartBar, { height: barH }]} />
              </View>
              <Text style={styles.chartLabel}>{HOURS[i] ?? (10 + i)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CompareRow({ label, today, yesterday }) {
  const diff = today - yesterday;
  const pct  = yesterday > 0 ? ((diff / yesterday) * 100).toFixed(1) : '0.0';
  const up   = diff >= 0;
  return (
    <View style={styles.compareRow}>
      <Text style={styles.compareLabel}>{label}</Text>
      <View style={styles.compareRight}>
        <Text style={styles.compareVal}>
          {typeof today === 'number' && today > 999
            ? '₹' + today.toLocaleString('en-IN')
            : today}
        </Text>
        <View style={[styles.compareBadge, { backgroundColor: up ? T.successBg : T.dangerBg }]}>
          <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? T.success : T.danger} />
          <Text style={[styles.comparePct, { color: up ? T.success : T.danger }]}>{Math.abs(pct)}%</Text>
        </View>
      </View>
    </View>
  );
}

function LoadingSection() {
  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color={T.accent} />
      <Text style={styles.loadingText}>Loading report…</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EODScreen() {
  const insets        = useSafeAreaInsets();
  const { user }      = useAuth();
  const outletId      = user?.outlet_id;

  const todayDate     = new Date();
  const todayStr      = toDateStr(todayDate);

  const [currentDate,    setCurrentDate]    = useState(todayDate);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [autoEmail,      setAutoEmail]      = useState(false);

  const currentStr = toDateStr(currentDate);
  const prevStr    = toDateStr(offsetDate(currentDate, -1));
  const isToday    = currentStr === todayStr;

  // ── Data fetching ──────────────────────────────────────────────────────────
  const {
    data: rawCurrent,
    isLoading,
    isRefetching,
    refetch,
  } = useEOD(isToday ? undefined : currentStr, outletId);

  const { data: rawPrev } = useEOD(prevStr, outletId);

  const data     = normalizeEOD(rawCurrent);
  const prevData = normalizeEOD(rawPrev);

  const closeDayMutation = useCloseDay();
  const isClosed = data?.status === 'closed' || closeDayMutation.isSuccess;
  const isClosing = closeDayMutation.isPending;

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalPayments = data
    ? Object.values(data.payments).reduce((a, b) => a + b, 0)
    : 0;

  const hasOrderTypeData = data && (
    data.dineInOrders > 0 || data.takeawayOrders > 0 || data.deliveryOrders > 0
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  const buildShareText = useCallback(() => {
    if (!data) return '';
    return (
      `*MS-RM EOD Report — ${displayDate(currentDate)}*\n\n` +
      `Revenue: ₹${data.revenue.toLocaleString('en-IN')}\n` +
      `Orders: ${data.orders}\n` +
      `Avg Order: ₹${data.avgOrderValue}\n\n` +
      `*Payments*\n` +
      `Cash: ₹${data.payments.cash.toLocaleString('en-IN')}\n` +
      `Card: ₹${data.payments.card.toLocaleString('en-IN')}\n` +
      `UPI: ₹${data.payments.upi.toLocaleString('en-IN')}\n` +
      `Online: ₹${data.payments.zomato.toLocaleString('en-IN')}\n\n` +
      `Top Item: ${data.topItems[0]?.name ?? '-'} (${data.topItems[0]?.qty ?? 0} sold)`
    );
  }, [currentDate, data]);

  const handleWhatsApp = useCallback(() => {
    const text = encodeURIComponent(buildShareText());
    Linking.openURL(`whatsapp://send?text=${text}`).catch(() =>
      Linking.openURL(`https://wa.me/?text=${text}`)
    );
  }, [buildShareText]);

  const handleExport = useCallback(async () => {
    try { await Share.share({ message: buildShareText(), title: 'EOD Report' }); } catch {}
  }, [buildShareText]);

  async function handleCloseDay() {
    try {
      await closeDayMutation.mutateAsync({ outlet_id: outletId, date: currentStr });
    } catch (err) {
      // mutation error handled by React Query — refetch will update status
    } finally {
      setShowCloseModal(false);
    }
  }

  const enter = Platform.OS !== 'web';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>End of Day</Text>
          <Text style={styles.headerSub}>{displayDate(currentDate)}</Text>
        </View>
        <View style={styles.dateNav}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setCurrentDate(d => offsetDate(d, -1))}
          >
            <Ionicons name="chevron-back" size={18} color={T.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, isToday && styles.navBtnDisabled]}
            onPress={() => { if (!isToday) setCurrentDate(d => offsetDate(d, 1)); }}
            disabled={isToday}
          >
            <Ionicons name="chevron-forward" size={18} color={isToday ? T.border : T.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={T.accent}
            colors={[T.accent]}
          />
        }
      >
        {/* ── Close Day CTA ── */}
        {isToday && (
          <Animated.View entering={enter ? FadeInDown.delay(0).springify() : undefined}>
            <TouchableOpacity
              style={[styles.closeDayBtn, isClosed && styles.closeDayBtnDone]}
              onPress={() => !isClosed && setShowCloseModal(true)}
              activeOpacity={0.85}
              disabled={isClosed || isClosing}
            >
              {isClosing
                ? <ActivityIndicator color="#ffffff" style={{ marginRight: 10 }} />
                : <Ionicons
                    name={isClosed ? 'checkmark-circle' : 'moon'}
                    size={22}
                    color="#ffffff"
                    style={{ marginRight: 10 }}
                  />
              }
              <Text style={styles.closeDayText}>
                {isClosed ? 'Day Closed — Reports Finalized' : 'Close Day & Finalize Reports'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Loading ── */}
        {isLoading ? (
          <LoadingSection />
        ) : !data ? null : (
          <>
            {/* Summary Cards */}
            <Animated.View
              entering={enter ? FadeInDown.delay(60).springify() : undefined}
              style={styles.summaryRow}
            >
              <SummaryCard
                label="Revenue"
                value={'₹' + (data.revenue / 1000).toFixed(1) + 'K'}
                icon="cash-outline"
                color={T.accent}
              />
              <SummaryCard
                label="Orders"
                value={String(data.orders)}
                icon="receipt-outline"
                color={GOLD}
              />
              <SummaryCard
                label="Avg Order"
                value={'₹' + data.avgOrderValue}
                icon="trending-up-outline"
                color={T.success}
              />
            </Animated.View>

            {/* Order Type Breakdown — only when API provides it */}
            {hasOrderTypeData && (
              <Animated.View entering={enter ? FadeInDown.delay(100).springify() : undefined}>
                <Text style={styles.sectionTitle}>Order Types</Text>
                <View style={styles.card}>
                  {data.dineInOrders > 0 && (
                    <OrderTypeRow
                      label="Dine-In"
                      icon="restaurant-outline"
                      orders={data.dineInOrders}
                      revenue={data.dineInRevenue}
                      color={T.accent}
                    />
                  )}
                  {data.takeawayOrders > 0 && (
                    <>
                      <View style={styles.divider} />
                      <OrderTypeRow
                        label="Takeaway"
                        icon="bag-handle-outline"
                        orders={data.takeawayOrders}
                        revenue={data.takeawayRevenue}
                        color={GOLD}
                      />
                    </>
                  )}
                  {data.deliveryOrders > 0 && (
                    <>
                      <View style={styles.divider} />
                      <OrderTypeRow
                        label="Delivery"
                        icon="bicycle-outline"
                        orders={data.deliveryOrders}
                        revenue={data.deliveryRevenue}
                        color={T.success}
                      />
                    </>
                  )}
                </View>
              </Animated.View>
            )}

            {/* Payment Breakdown */}
            <Animated.View entering={enter ? FadeInDown.delay(120).springify() : undefined}>
              <Text style={styles.sectionTitle}>Payment Breakdown</Text>
              <View style={styles.card}>
                <PaymentRow
                  label="Cash" icon="cash-outline"
                  amount={data.payments.cash} total={totalPayments} color={T.success}
                />
                <View style={styles.divider} />
                <PaymentRow
                  label="Card" icon="card-outline"
                  amount={data.payments.card} total={totalPayments} color={T.accent}
                />
                <View style={styles.divider} />
                <PaymentRow
                  label="UPI" icon="phone-portrait-outline"
                  amount={data.payments.upi} total={totalPayments} color={GOLD}
                />
                <View style={styles.divider} />
                <PaymentRow
                  label="Online / Zomato" icon="bicycle-outline"
                  amount={data.payments.zomato} total={totalPayments} color={T.danger}
                />
              </View>
            </Animated.View>

            {/* Top 5 Items */}
            {data.topItems.length > 0 && (
              <Animated.View entering={enter ? FadeInDown.delay(180).springify() : undefined}>
                <Text style={styles.sectionTitle}>Top Selling Items</Text>
                <View style={styles.card}>
                  {data.topItems.map((item, i) => (
                    <View key={i}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.rankRow}>
                        <View style={[
                          styles.rankBadge,
                          { backgroundColor: i === 0 ? GOLD + '20' : T.surfaceMuted },
                        ]}>
                          <Text style={[styles.rankNum, { color: i === 0 ? GOLD : T.textMuted }]}>
                            #{i + 1}
                          </Text>
                        </View>
                        <Text style={styles.rankName}>{item.name}</Text>
                        <View style={styles.rankMeta}>
                          <Text style={styles.rankQty}>{item.qty} sold</Text>
                          <Text style={styles.rankRev}>₹{item.revenue.toLocaleString('en-IN')}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Bottom 5 Items */}
            {data.bottomItems.length > 0 && (
              <Animated.View entering={enter ? FadeInDown.delay(220).springify() : undefined}>
                <Text style={styles.sectionTitle}>
                  Bottom Items <Text style={styles.sectionHint}>(Menu Optimization)</Text>
                </Text>
                <View style={styles.card}>
                  {data.bottomItems.map((item, i) => (
                    <View key={i}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.rankRow}>
                        <View style={[styles.rankBadge, { backgroundColor: T.dangerBg }]}>
                          <Ionicons name="arrow-down" size={12} color={T.danger} />
                        </View>
                        <Text style={styles.rankName}>{item.name}</Text>
                        <View style={styles.rankMeta}>
                          <Text style={[styles.rankQty, { color: T.danger }]}>{item.qty} sold</Text>
                          <Text style={styles.rankRev}>₹{item.revenue.toLocaleString('en-IN')}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Staff Present */}
            {data.staff.length > 0 && (
              <Animated.View entering={enter ? FadeInDown.delay(260).springify() : undefined}>
                <Text style={styles.sectionTitle}>Staff Present Today</Text>
                <View style={styles.card}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.staffRow}>
                      {data.staff.map((s, i) => (
                        <View key={i} style={styles.staffItem}>
                          <View style={[styles.avatar, { backgroundColor: s.color }]}>
                            <Text style={styles.avatarText}>{s.initials}</Text>
                          </View>
                          <Text style={styles.staffName}>{s.name}</Text>
                          {s.hours !== null && (
                            <Text style={styles.staffHours}>{s.hours}h</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </Animated.View>
            )}

            {/* Hourly Revenue Chart */}
            {data.hourlyRevenue.length > 0 && (
              <Animated.View entering={enter ? FadeInDown.delay(300).springify() : undefined}>
                <Text style={styles.sectionTitle}>Hourly Revenue</Text>
                <View style={styles.card}>
                  <HourlyChart data={data.hourlyRevenue} />
                  <View style={styles.chartFooter}>
                    <Text style={styles.chartFootNote}>10 AM — 9 PM</Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Waste Logged */}
            <Animated.View entering={enter ? FadeInDown.delay(340).springify() : undefined}>
              <Text style={styles.sectionTitle}>Waste Logged Today</Text>
              <View style={styles.card}>
                {data.waste.length === 0 ? (
                  <Text style={styles.emptySmall}>No waste recorded</Text>
                ) : (
                  <>
                    {data.waste.map((w, i) => (
                      <View key={i}>
                        {i > 0 && <View style={styles.divider} />}
                        <View style={styles.wasteRow}>
                          <Ionicons name="trash-outline" size={16} color={T.danger} style={{ marginRight: 10 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.wasteName}>{w.item}</Text>
                            <Text style={styles.wasteQty}>{w.qty}</Text>
                          </View>
                          <Text style={styles.wasteCost}>₹{w.cost}</Text>
                        </View>
                      </View>
                    ))}
                    <View style={styles.wasteTotalRow}>
                      <Text style={styles.wasteTotalLabel}>Total Waste Cost</Text>
                      <Text style={styles.wasteTotalVal}>
                        ₹{data.waste.reduce((a, w) => a + w.cost, 0)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </Animated.View>

            {/* vs Yesterday */}
            {prevData && (
              <Animated.View entering={enter ? FadeInDown.delay(380).springify() : undefined}>
                <Text style={styles.sectionTitle}>vs Yesterday</Text>
                <View style={styles.card}>
                  <CompareRow label="Revenue"         today={data.revenue}       yesterday={prevData.revenue} />
                  <View style={styles.divider} />
                  <CompareRow label="Orders"          today={data.orders}        yesterday={prevData.orders} />
                  <View style={styles.divider} />
                  <CompareRow label="Avg Order Value" today={data.avgOrderValue} yesterday={prevData.avgOrderValue} />
                </View>
              </Animated.View>
            )}

            {/* Actions */}
            <Animated.View entering={enter ? FadeInDown.delay(420).springify() : undefined}>
              <Text style={styles.sectionTitle}>Actions</Text>
              <View style={styles.card}>
                <View style={styles.actionRow}>
                  <View style={styles.actionLeft}>
                    <Ionicons name="mail-outline" size={20} color={T.accent} style={{ marginRight: 12 }} />
                    <View>
                      <Text style={styles.actionLabel}>Auto Email Report</Text>
                      <Text style={styles.actionSub}>Sent to owner daily at 11 PM</Text>
                    </View>
                  </View>
                  <Switch
                    value={autoEmail}
                    onValueChange={setAutoEmail}
                    trackColor={{ false: T.border, true: T.accentSoft }}
                    thumbColor={autoEmail ? T.accent : '#ffffff'}
                  />
                </View>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.actionRow} onPress={handleWhatsApp} activeOpacity={0.7}>
                  <View style={styles.actionLeft}>
                    <Ionicons name="logo-whatsapp" size={20} color={T.success} style={{ marginRight: 12 }} />
                    <Text style={styles.actionLabel}>Send via WhatsApp</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.actionRow} onPress={handleExport} activeOpacity={0.7}>
                  <View style={styles.actionLeft}>
                    <Ionicons name="share-outline" size={20} color={GOLD} style={{ marginRight: 12 }} />
                    <Text style={styles.actionLabel}>Print / Export</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Close Day Confirmation Modal */}
      <Modal
        visible={showCloseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCloseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 28 }]}>
            <View style={styles.modalHandle} />
            <Ionicons
              name="moon"
              size={40}
              color={T.textPrimary}
              style={{ alignSelf: 'center', marginBottom: 12 }}
            />
            <Text style={styles.modalTitle}>Close Day?</Text>
            <Text style={styles.modalBody}>
              This will finalize today's reports and lock all entries for{' '}
              {displayDate(currentDate)}. This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowCloseModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, isClosing && { opacity: 0.65 }]}
                onPress={handleCloseDay}
                disabled={isClosing}
              >
                {isClosing
                  ? <ActivityIndicator color="#ffffff" />
                  : <Text style={styles.modalConfirmText}>Yes, Close Day</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.pageBg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },

  // Loading
  loadingWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: FS.sm, color: T.textMuted },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: T.pageBg,
  },
  headerTitle: { fontSize: FS['2xl'], fontWeight: FW.bold, color: T.textPrimary },
  headerSub:   { fontSize: FS.sm, color: T.textMuted, marginTop: 2 },
  dateNav:     { flexDirection: 'row', gap: 8 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  navBtnDisabled: { opacity: 0.4 },

  // Close Day CTA
  closeDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderRadius: R['2xl'],
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: T.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  closeDayBtnDone: { backgroundColor: T.success },
  closeDayText:    { color: '#ffffff', fontSize: FS.base, fontWeight: FW.bold },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  summaryValue: { fontSize: FS.lg, fontWeight: FW.bold, color: T.textPrimary, marginBottom: 2 },
  summaryLabel: { fontSize: FS.xs, color: T.textMuted, textAlign: 'center' },

  // Section
  sectionTitle: {
    fontSize: FS.base,
    fontWeight: FW.bold,
    color: T.textPrimary,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHint: { fontSize: FS.sm, fontWeight: FW.normal, color: T.textMuted },

  // Card
  card: {
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  divider: { height: 1, backgroundColor: T.border, marginVertical: 10 },

  // Order type breakdown
  orderTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  orderTypeIcon: {
    width: 30,
    height: 30,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderTypeLabel:   { flex: 1, fontSize: FS.sm, fontWeight: FW.semibold, color: T.textPrimary },
  orderTypeOrders:  { fontSize: 12, color: T.textMuted },
  orderTypeRevenue: { fontSize: FS.sm, fontWeight: FW.bold, color: T.textPrimary, minWidth: 80, textAlign: 'right' },

  // Payment breakdown
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  paymentLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentLabel:  { fontSize: 14, fontWeight: FW.semibold, color: T.textPrimary },
  paymentPct:    { fontSize: 11, color: T.textMuted, marginTop: 1 },
  paymentRight:  { alignItems: 'flex-end', minWidth: 110 },
  paymentAmount: { fontSize: 14, fontWeight: FW.bold, color: T.textPrimary, marginBottom: 5 },
  barBg:  { width: 90, height: 6, borderRadius: 3, backgroundColor: T.border },
  barFill: { height: 6, borderRadius: 3 },

  // Rank items
  rankRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNum:  { fontSize: 12, fontWeight: FW.bold },
  rankName: { flex: 1, fontSize: 14, color: T.textPrimary, fontWeight: FW.medium },
  rankMeta: { alignItems: 'flex-end' },
  rankQty:  { fontSize: 12, color: T.textMuted },
  rankRev:  { fontSize: FS.sm, fontWeight: FW.bold, color: T.textPrimary },

  // Staff
  staffRow: { flexDirection: 'row', gap: 20, paddingBottom: 4 },
  staffItem: { alignItems: 'center', gap: 6 },
  avatar:    { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: '#ffffff', fontWeight: FW.bold, fontSize: 15 },
  staffName:   { fontSize: 11, color: T.textSecondary, fontWeight: FW.medium, textAlign: 'center', maxWidth: 56 },
  staffHours:  { fontSize: 11, color: T.textMuted },

  // Hourly chart
  chartContainer: { paddingTop: 8 },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_H,
    gap: 4,
  },
  chartBarCol:     { flex: 1, alignItems: 'center' },
  chartBarWrapper: { flex: 1, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  chartBar:        { width: '80%', borderRadius: 4, backgroundColor: T.accent },
  chartLabel:      { fontSize: 9, color: T.textMuted, marginTop: 4 },
  chartFooter:     { marginTop: 8 },
  chartFootNote:   { fontSize: 11, color: T.textMuted, textAlign: 'center' },

  // Waste
  wasteRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  wasteName:      { fontSize: 14, color: T.textPrimary, fontWeight: FW.medium },
  wasteQty:       { fontSize: 12, color: T.textMuted, marginTop: 1 },
  wasteCost:      { fontSize: 14, fontWeight: FW.bold, color: T.danger },
  wasteTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  wasteTotalLabel: { fontSize: 14, fontWeight: FW.semibold, color: T.textPrimary },
  wasteTotalVal:   { fontSize: 14, fontWeight: FW.bold, color: T.danger },

  // Comparison
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  compareLabel: { fontSize: 14, color: T.textSecondary },
  compareRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compareVal:   { fontSize: 14, fontWeight: FW.bold, color: T.textPrimary },
  compareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.full,
    gap: 2,
  },
  comparePct: { fontSize: 12, fontWeight: FW.bold },

  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  actionLeft:  { flexDirection: 'row', alignItems: 'center' },
  actionLabel: { fontSize: 14, fontWeight: FW.semibold, color: T.textPrimary },
  actionSub:   { fontSize: 12, color: T.textMuted, marginTop: 1 },

  emptySmall: { color: T.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: T.cardBg,
    borderTopLeftRadius: R['3xl'],
    borderTopRightRadius: R['3xl'],
    padding: 28,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle:       { fontSize: FS['2xl'], fontWeight: FW.bold, color: T.textPrimary, textAlign: 'center', marginBottom: 10 },
  modalBody:        { fontSize: 14, color: T.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalActions:     { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: T.border,
    borderRadius: R.xl,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText:  { fontSize: 15, fontWeight: FW.semibold, color: T.textSecondary },
  modalConfirm: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: R.xl,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: 15, fontWeight: FW.bold, color: '#ffffff' },
});
