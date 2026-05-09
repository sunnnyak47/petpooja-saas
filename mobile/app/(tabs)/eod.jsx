/**
 * End of Day (EOD) Summary Screen
 * Expo 54 · RN 0.81 · Reanimated 4 · JSX
 */

import React, { useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import PressCard from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import EmptyState from '../../src/components/EmptyState';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 40;
const CHART_H = 120;

// ─── Mock Data ────────────────────────────────────────────────────────────────

const TODAY = new Date(2026, 4, 7); // May 7 2026

const DAILY_DATA = {
  '2026-05-07': {
    revenue: 42860,
    orders: 137,
    avgOrderValue: 312,
    payments: {
      cash: 12400,
      card: 18200,
      upi: 9860,
      zomato: 2400,
    },
    topItems: [
      { name: 'Butter Chicken', qty: 48, revenue: 9120 },
      { name: 'Paneer Tikka', qty: 41, revenue: 7380 },
      { name: 'Garlic Naan', qty: 98, revenue: 3920 },
      { name: 'Dal Makhani', qty: 37, revenue: 5550 },
      { name: 'Mango Lassi', qty: 62, revenue: 3100 },
    ],
    bottomItems: [
      { name: 'Sabudana Khichdi', qty: 2, revenue: 280 },
      { name: 'Thandai', qty: 3, revenue: 270 },
      { name: 'Methi Thepla', qty: 4, revenue: 360 },
      { name: 'Rajgira Puri', qty: 4, revenue: 480 },
      { name: 'Kadhi Pakora', qty: 5, revenue: 625 },
    ],
    staff: [
      { name: 'Ramesh K.', initials: 'RK', hours: 8.5, color: '#0070F3' },
      { name: 'Priya S.', initials: 'PS', hours: 9, color: '#F5A623' },
      { name: 'Ankit V.', initials: 'AV', hours: 7.5, color: '#00B341' },
      { name: 'Sunita M.', initials: 'SM', hours: 8, color: '#EE0000' },
      { name: 'Deepak R.', initials: 'DR', hours: 6.5, color: '#9B59B6' },
    ],
    hourlyRevenue: [800, 1200, 2100, 3400, 4800, 5200, 4600, 6100, 5800, 4200, 3100, 1560],
    waste: [
      { item: 'Coriander Leaves', qty: '200g', cost: 40 },
      { item: 'Tomatoes', qty: '1 kg', cost: 60 },
      { item: 'Paneer', qty: '300g', cost: 120 },
      { item: 'Bread Rolls', qty: '6 pcs', cost: 30 },
    ],
  },
  '2026-05-06': {
    revenue: 38140,
    orders: 121,
    avgOrderValue: 315,
    payments: { cash: 11200, card: 16800, upi: 8140, zomato: 2000 },
    topItems: [],
    bottomItems: [],
    staff: [],
    hourlyRevenue: [700, 1100, 1900, 3100, 4400, 4900, 4200, 5600, 5300, 3800, 2800, 1240],
    waste: [],
  },
};

const HOURS = ['10', '11', '12', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function displayDate(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
      <View style={[styles.summaryIcon, { backgroundColor: color + '18' }]}>
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
        <View style={[styles.paymentIconWrap, { backgroundColor: color + '18' }]}>
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

function HourlyChart({ data }) {
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
              <Text style={styles.chartLabel}>{HOURS[i]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CompareRow({ label, today, yesterday }) {
  const diff = today - yesterday;
  const pct = yesterday > 0 ? ((diff / yesterday) * 100).toFixed(1) : '0.0';
  const up = diff >= 0;
  return (
    <View style={styles.compareRow}>
      <Text style={styles.compareLabel}>{label}</Text>
      <View style={styles.compareRight}>
        <Text style={styles.compareVal}>
          {typeof today === 'number' && today > 999
            ? '₹' + today.toLocaleString('en-IN')
            : today}
        </Text>
        <View style={[styles.compareBadge, { backgroundColor: up ? '#00B34118' : '#EE000018' }]}>
          <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? '#00B341' : '#EE0000'} />
          <Text style={[styles.comparePct, { color: up ? '#00B341' : '#EE0000' }]}>{Math.abs(pct)}%</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EODScreen() {
  const insets = useSafeAreaInsets();
  const [currentDate, setCurrentDate] = useState(TODAY);
  const [dayClosed, setDayClosed] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [autoEmail, setAutoEmail] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);

  const dateKey = formatDate(currentDate);
  const prevDateKey = formatDate(offsetDate(currentDate, -1));
  const data = DAILY_DATA[dateKey] || DAILY_DATA['2026-05-07'];
  const prevData = DAILY_DATA[prevDateKey] || DAILY_DATA['2026-05-06'];

  const totalPayments = Object.values(data.payments).reduce((a, b) => a + b, 0);
  const isToday = formatDate(currentDate) === formatDate(TODAY);

  const buildShareText = useCallback(() => {
    return (
      `*PetPooja EOD Report — ${displayDate(currentDate)}*\n\n` +
      `Revenue: ₹${data.revenue.toLocaleString('en-IN')}\n` +
      `Orders: ${data.orders}\n` +
      `Avg Order: ₹${data.avgOrderValue}\n\n` +
      `*Payments*\n` +
      `Cash: ₹${data.payments.cash.toLocaleString('en-IN')}\n` +
      `Card: ₹${data.payments.card.toLocaleString('en-IN')}\n` +
      `UPI: ₹${data.payments.upi.toLocaleString('en-IN')}\n` +
      `Zomato Pay: ₹${data.payments.zomato.toLocaleString('en-IN')}\n\n` +
      `Top Item: ${data.topItems[0]?.name || '-'} (${data.topItems[0]?.qty || 0} sold)`
    );
  }, [currentDate, data]);

  const handleWhatsApp = useCallback(() => {
    const text = encodeURIComponent(buildShareText());
    Linking.openURL(`whatsapp://send?text=${text}`).catch(() =>
      Linking.openURL(`https://wa.me/?text=${text}`)
    );
  }, [buildShareText]);

  const handleExport = useCallback(async () => {
    try {
      await Share.share({ message: buildShareText(), title: 'EOD Report' });
    } catch (e) {}
  }, [buildShareText]);

  const handleCloseDay = useCallback(() => {
    setDayClosed(true);
    setShowCloseModal(false);
  }, []);

  const enter = Platform.OS !== 'web';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>End of Day</Text>
          <Text style={styles.headerSub}>{displayDate(currentDate)}</Text>
        </View>
        <View style={styles.dateNav}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setCurrentDate(d => offsetDate(d, -1))}>
            <Ionicons name="chevron-back" size={18} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => {
              if (!isToday) setCurrentDate(d => offsetDate(d, 1));
            }}
            disabled={isToday}>
            <Ionicons name="chevron-forward" size={18} color={isToday ? '#ccc' : '#000'} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Close Day CTA */}
        {isToday && (
          <Animated.View entering={enter ? FadeInDown.delay(0).springify() : undefined}>
            <TouchableOpacity
              style={[styles.closeDayBtn, dayClosed && styles.closeDayBtnDone]}
              onPress={() => !dayClosed && setShowCloseModal(true)}
              activeOpacity={0.85}>
              <Ionicons
                name={dayClosed ? 'checkmark-circle' : 'moon'}
                size={22}
                color="#fff"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.closeDayText}>
                {dayClosed ? 'Day Closed — Reports Finalized' : 'Close Day & Finalize Reports'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Summary Cards */}
        <Animated.View
          entering={enter ? FadeInDown.delay(60).springify() : undefined}
          style={styles.summaryRow}>
          <SummaryCard
            label="Revenue"
            value={'₹' + (data.revenue / 1000).toFixed(1) + 'K'}
            icon="cash-outline"
            color="#0070F3"
          />
          <SummaryCard
            label="Orders"
            value={String(data.orders)}
            icon="receipt-outline"
            color="#F5A623"
          />
          <SummaryCard
            label="Avg Order"
            value={'₹' + data.avgOrderValue}
            icon="trending-up-outline"
            color="#00B341"
          />
        </Animated.View>

        {/* Payment Breakdown */}
        <Animated.View entering={enter ? FadeInDown.delay(120).springify() : undefined}>
          <Text style={styles.sectionTitle}>Payment Breakdown</Text>
          <View style={styles.card}>
            <PaymentRow label="Cash" icon="cash-outline" amount={data.payments.cash} total={totalPayments} color="#00B341" />
            <View style={styles.divider} />
            <PaymentRow label="Card" icon="card-outline" amount={data.payments.card} total={totalPayments} color="#0070F3" />
            <View style={styles.divider} />
            <PaymentRow label="UPI" icon="phone-portrait-outline" amount={data.payments.upi} total={totalPayments} color="#F5A623" />
            <View style={styles.divider} />
            <PaymentRow label="Zomato Pay" icon="bicycle-outline" amount={data.payments.zomato} total={totalPayments} color="#EE0000" />
          </View>
        </Animated.View>

        {/* Top 5 Items */}
        <Animated.View entering={enter ? FadeInDown.delay(180).springify() : undefined}>
          <Text style={styles.sectionTitle}>Top 5 Selling Items</Text>
          <View style={styles.card}>
            {data.topItems.map((item, i) => (
              <View key={i}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.rankRow}>
                  <View style={[styles.rankBadge, { backgroundColor: i === 0 ? '#F5A62318' : '#F7F7F7' }]}>
                    <Text style={[styles.rankNum, { color: i === 0 ? '#F5A623' : '#888' }]}>#{i + 1}</Text>
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

        {/* Bottom 5 Items */}
        <Animated.View entering={enter ? FadeInDown.delay(220).springify() : undefined}>
          <Text style={styles.sectionTitle}>Bottom 5 Items <Text style={styles.sectionHint}>(Menu Optimization)</Text></Text>
          <View style={styles.card}>
            {data.bottomItems.map((item, i) => (
              <View key={i}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.rankRow}>
                  <View style={styles.rankBadge}>
                    <Ionicons name="arrow-down" size={12} color="#EE0000" />
                  </View>
                  <Text style={styles.rankName}>{item.name}</Text>
                  <View style={styles.rankMeta}>
                    <Text style={[styles.rankQty, { color: '#EE0000' }]}>{item.qty} sold</Text>
                    <Text style={styles.rankRev}>₹{item.revenue.toLocaleString('en-IN')}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Staff Present */}
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
                    <Text style={styles.staffHours}>{s.hours}h</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </Animated.View>

        {/* Hourly Revenue Chart */}
        <Animated.View entering={enter ? FadeInDown.delay(300).springify() : undefined}>
          <Text style={styles.sectionTitle}>Hourly Revenue</Text>
          <View style={styles.card}>
            <HourlyChart data={data.hourlyRevenue} />
            <View style={styles.chartFooter}>
              <Text style={styles.chartFootNote}>10 AM — 9 PM  ·  Peak: 5–7 PM</Text>
            </View>
          </View>
        </Animated.View>

        {/* Waste Logged */}
        <Animated.View entering={enter ? FadeInDown.delay(340).springify() : undefined}>
          <Text style={styles.sectionTitle}>Waste Logged Today</Text>
          <View style={styles.card}>
            {data.waste.length === 0 ? (
              <Text style={styles.emptySmall}>No waste recorded</Text>
            ) : (
              data.waste.map((w, i) => (
                <View key={i}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.wasteRow}>
                    <Ionicons name="trash-outline" size={16} color="#EE0000" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.wasteName}>{w.item}</Text>
                      <Text style={styles.wasteQty}>{w.qty}</Text>
                    </View>
                    <Text style={styles.wasteCost}>₹{w.cost}</Text>
                  </View>
                </View>
              ))
            )}
            {data.waste.length > 0 && (
              <View style={styles.wasteTotalRow}>
                <Text style={styles.wasteTotalLabel}>Total Waste Cost</Text>
                <Text style={styles.wasteTotalVal}>
                  ₹{data.waste.reduce((a, w) => a + w.cost, 0)}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Comparison with Yesterday */}
        <Animated.View entering={enter ? FadeInDown.delay(380).springify() : undefined}>
          <Text style={styles.sectionTitle}>vs Yesterday</Text>
          <View style={styles.card}>
            <CompareRow label="Revenue" today={data.revenue} yesterday={prevData.revenue} />
            <View style={styles.divider} />
            <CompareRow label="Orders" today={data.orders} yesterday={prevData.orders} />
            <View style={styles.divider} />
            <CompareRow label="Avg Order Value" today={data.avgOrderValue} yesterday={prevData.avgOrderValue} />
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={enter ? FadeInDown.delay(420).springify() : undefined}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.card}>
            {/* Auto Email Toggle */}
            <View style={styles.actionRow}>
              <View style={styles.actionLeft}>
                <Ionicons name="mail-outline" size={20} color="#0070F3" style={{ marginRight: 12 }} />
                <View>
                  <Text style={styles.actionLabel}>Auto Email Report</Text>
                  <Text style={styles.actionSub}>Sent to owner daily at 11 PM</Text>
                </View>
              </View>
              <Switch
                value={autoEmail}
                onValueChange={setAutoEmail}
                trackColor={{ false: '#EAEAEA', true: '#0070F320' }}
                thumbColor={autoEmail ? '#0070F3' : '#fff'}
              />
            </View>
            <View style={styles.divider} />
            {/* WhatsApp Share */}
            <TouchableOpacity style={styles.actionRow} onPress={handleWhatsApp} activeOpacity={0.7}>
              <View style={styles.actionLeft}>
                <Ionicons name="logo-whatsapp" size={20} color="#00B341" style={{ marginRight: 12 }} />
                <Text style={styles.actionLabel}>Send via WhatsApp</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#888" />
            </TouchableOpacity>
            <View style={styles.divider} />
            {/* Export */}
            <TouchableOpacity style={styles.actionRow} onPress={handleExport} activeOpacity={0.7}>
              <View style={styles.actionLeft}>
                <Ionicons name="share-outline" size={20} color="#F5A623" style={{ marginRight: 12 }} />
                <Text style={styles.actionLabel}>Print / Export</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#888" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Close Day Confirmation Modal */}
      <Modal
        visible={showCloseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCloseModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Ionicons name="moon" size={40} color="#000" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.modalTitle}>Close Day?</Text>
            <Text style={styles.modalBody}>
              This will finalize today's reports and lock all entries for{' '}
              {displayDate(currentDate)}. This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowCloseModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleCloseDay}>
                <Text style={styles.modalConfirmText}>Yes, Close Day</Text>
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
  root: { flex: 1, backgroundColor: '#F7F7F7' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: '#F7F7F7',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#000' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  dateNav: { flexDirection: 'row', gap: 8 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  closeDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  closeDayBtnDone: { backgroundColor: '#00B341' },
  closeDayText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
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
  summaryValue: { fontSize: 18, fontWeight: '700', color: '#000', marginBottom: 2 },
  summaryLabel: { fontSize: 11, color: '#888', textAlign: 'center' },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHint: { fontSize: 13, fontWeight: '400', color: '#888' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  divider: { height: 1, backgroundColor: '#EAEAEA', marginVertical: 10 },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentLabel: { fontSize: 14, fontWeight: '600', color: '#000' },
  paymentPct: { fontSize: 11, color: '#888', marginTop: 1 },
  paymentRight: { alignItems: 'flex-end', minWidth: 110 },
  paymentAmount: { fontSize: 14, fontWeight: '700', color: '#000', marginBottom: 5 },
  barBg: { width: 90, height: 6, borderRadius: 3, backgroundColor: '#EAEAEA' },
  barFill: { height: 6, borderRadius: 3 },

  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNum: { fontSize: 12, fontWeight: '700' },
  rankName: { flex: 1, fontSize: 14, color: '#000', fontWeight: '500' },
  rankMeta: { alignItems: 'flex-end' },
  rankQty: { fontSize: 12, color: '#888' },
  rankRev: { fontSize: 13, fontWeight: '700', color: '#000' },

  staffRow: { flexDirection: 'row', gap: 20, paddingBottom: 4 },
  staffItem: { alignItems: 'center', gap: 6 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  staffName: { fontSize: 11, color: '#444', fontWeight: '500', textAlign: 'center', maxWidth: 56 },
  staffHours: { fontSize: 11, color: '#888' },

  chartContainer: { paddingTop: 8 },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_H,
    gap: 4,
  },
  chartBarCol: { flex: 1, alignItems: 'center' },
  chartBarWrapper: { flex: 1, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  chartBar: { width: '80%', borderRadius: 4, backgroundColor: '#0070F3' },
  chartLabel: { fontSize: 9, color: '#888', marginTop: 4 },
  chartFooter: { marginTop: 8 },
  chartFootNote: { fontSize: 11, color: '#888', textAlign: 'center' },

  wasteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  wasteName: { fontSize: 14, color: '#000', fontWeight: '500' },
  wasteQty: { fontSize: 12, color: '#888', marginTop: 1 },
  wasteCost: { fontSize: 14, fontWeight: '700', color: '#EE0000' },
  wasteTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
  },
  wasteTotalLabel: { fontSize: 14, fontWeight: '600', color: '#000' },
  wasteTotalVal: { fontSize: 14, fontWeight: '700', color: '#EE0000' },

  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  compareLabel: { fontSize: 14, color: '#444' },
  compareRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compareVal: { fontSize: 14, fontWeight: '700', color: '#000' },
  compareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    gap: 2,
  },
  comparePct: { fontSize: 12, fontWeight: '700' },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#000' },
  actionSub: { fontSize: 12, color: '#888', marginTop: 1 },

  emptySmall: { color: '#888', fontSize: 14, textAlign: 'center', paddingVertical: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EAEAEA',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#000', textAlign: 'center', marginBottom: 10 },
  modalBody: { fontSize: 14, color: '#444', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#EAEAEA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#444' },
  modalConfirm: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
