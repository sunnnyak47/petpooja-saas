/**
 * Cash Reconciliation / EOD — Owner App
 * Expected vs actual cash, payment breakdown, EOD history
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LC } from '../../src/constants/colors';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useEODPreview, useEODHistory } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';
import { ShareButton } from '../../src/components/ShareButton';
import { exportReportPdf, shareFile } from '../../src/utils/exportReport';

const { width: SCREEN_W } = Dimensions.get('window');
const CONTENT_W = Math.min(SCREEN_W, 480);



function StatusDot({ status }) {
  const colors = {
    open: '#0070F3',
    closed: '#888',
    balanced: '#00B341',
    short: '#EE0000',
    over: '#F5A623',
  };
  return (
    <View style={[st.dot, { backgroundColor: colors[status] || '#888' }]} />
  );
}

export default function CashReconScreen() {
  const { outletId, currentOutlet } = useOutlet();
  const { colors } = useTheme();
  const { symbol, locale, dateLocale, fmt, fmtFull } = useCurrency();
  const { data: previewData, isLoading: loadingPreview, isError: errorPreview, refetch: refetchPreview } = useEODPreview(outletId);
  const { data: historyData, isLoading: loadingHistory, isError: errorHistory, refetch: refetchHistory } = useEODHistory(outletId);

  const [tab, setTab] = useState('today'); // 'today' | 'history'
  const [refreshing, setRefreshing] = useState(false);

  const preview = previewData || { status: 'open', openedAt: '--', openingCash: 0, expectedCash: 0, actualCash: null, cashSales: 0, upiSales: 0, cardSales: 0, onlineSales: 0, totalSales: 0, totalOrders: 0, voids: 0, refunds: 0, discounts: 0, tips: 0 };
  const history = historyData || [];

  const isLoading = loadingPreview || loadingHistory;
  const isError = errorPreview && errorHistory;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchPreview(), refetchHistory()]);
    setRefreshing(false);
  }, []);

  // Payment split data for progress bars
  const payments = useMemo(() => {
    const total = preview.totalSales || 1;
    return [
      { label: 'Cash', amount: preview.cashSales || 0, icon: 'cash', color: '#00B341' },
      { label: 'UPI', amount: preview.upiSales || 0, icon: 'phone-portrait', color: '#0070F3' },
      { label: 'Card', amount: preview.cardSales || 0, icon: 'card', color: '#F5A623' },
      { label: 'Online', amount: preview.onlineSales || 0, icon: 'globe', color: '#888' },
    ].map((p) => ({ ...p, pct: Math.round((p.amount / total) * 100) }));
  }, [preview]);

  if (isError) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Cash & EOD</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
          <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => onRefresh()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.text, borderRadius: 8 }}>
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Cash & EOD</Text>
        <ShareButton
          color={colors.text}
          onPress={async () => {
            const p = preview || {};
            const uri = await exportReportPdf({
              title: 'Cash Reconciliation',
              subtitle: `Today's Session • ${new Date().toLocaleDateString(dateLocale)}`,
              outletName: currentOutlet?.name || 'PetPooja',
              sections: [
                {
                  heading: 'Session Overview',
                  rows: [
                    { label: 'Status', value: p.status === 'open' ? 'Active' : 'Closed' },
                    { label: 'Opened At', value: p.openedAt || '--' },
                    { label: 'Opening Cash', value: `${symbol}${(p.openingCash || 0).toLocaleString(locale)}` },
                    { label: 'Total Sales', value: `${symbol}${(p.totalSales || 0).toLocaleString(locale)}` },
                    { label: 'Total Orders', value: `${p.totalOrders || 0}` },
                    { label: 'Expected Cash', value: `${symbol}${(p.expectedCash || 0).toLocaleString(locale)}` },
                  ],
                },
                {
                  heading: 'Payment Breakdown',
                  rows: payments.map(pay => ({
                    label: pay.label,
                    value: `${symbol}${(pay.amount || 0).toLocaleString(locale)} (${pay.pct}%)`,
                  })),
                },
                {
                  heading: 'Deductions',
                  rows: [
                    { label: 'Voids', value: `-${symbol}${(p.voids || 0).toLocaleString(locale)}` },
                    { label: 'Refunds', value: `-${symbol}${(p.refunds || 0).toLocaleString(locale)}` },
                    { label: 'Discounts', value: `-${symbol}${(p.discounts || 0).toLocaleString(locale)}` },
                    { label: 'Tips Collected', value: `+${symbol}${(p.tips || 0).toLocaleString(locale)}` },
                  ],
                },
              ],
            });
            await shareFile(uri, 'Share Cash Report');
          }}
        />
      </View>

      {/* Tab bar */}
      <View style={[s.tabBar, { backgroundColor: colors.headerBg }]}>
        {['today', 'history'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, { backgroundColor: colors.pillBg }, tab === t && { backgroundColor: colors.pillActiveBg }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, { color: colors.pillText }, tab === t && { color: colors.pillActiveText }]}>
              {t === 'today' ? "Today's Session" : 'EOD History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={s.card}>
              <SkeletonBox width="40%" height={16} borderRadius={4} />
              <SkeletonBox width="60%" height={28} borderRadius={6} style={{ marginTop: 10 }} />
              <SkeletonBox width="100%" height={12} borderRadius={4} style={{ marginTop: 12 }} />
            </View>
          ))
        ) : tab === 'today' && !previewData ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Ionicons name="cash-outline" size={48} color="#CCC" />
            <Text style={{ fontSize: 15, color: '#888', marginTop: 8 }}>No session data yet</Text>
          </View>
        ) : tab === 'today' ? (
          <>
            {/* Status Badge */}
            <View style={[s.statusCard, { borderLeftColor: preview.status === 'open' ? '#0070F3' : '#00B341', backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.statusRow}>
                <StatusDot status={preview.status} />
                <Text style={[s.statusLabel, { color: colors.text }]}>
                  {preview.status === 'open' ? 'Session Active' : 'Session Closed'}
                </Text>
              </View>
              <Text style={[s.statusMeta, { color: colors.textMuted }]}>
                Opened at {preview.openedAt} · Opening cash: {fmtFull(preview.openingCash)}
              </Text>
            </View>

            {/* Revenue Hero */}
            <PressCard style={[s.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.heroEyebrow, { color: colors.textMuted }]}>TOTAL SALES TODAY</Text>
              <Text style={[s.heroAmount, { color: colors.text }]}>{fmtFull(preview.totalSales)}</Text>
              <View style={s.heroMeta}>
                <Text style={[s.heroMetaItem, { color: colors.textSecondary }]}>{preview.totalOrders} orders</Text>
                <View style={[s.heroDivider, { backgroundColor: colors.border }]} />
                <Text style={[s.heroMetaItem, { color: colors.textSecondary }]}>
                  Expected cash: {fmtFull(preview.expectedCash)}
                </Text>
              </View>
            </PressCard>

            {/* Payment Breakdown */}
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Payment Breakdown</Text>
              {payments.map((p) => (
                <View key={p.label} style={s.payRow}>
                  <View style={s.payLeft}>
                    <Ionicons name={p.icon} size={18} color={p.color} />
                    <Text style={[s.payLabel, { color: colors.text }]}>{p.label}</Text>
                  </View>
                  <View style={[s.payBarWrap, { backgroundColor: colors.pillBg }]}>
                    <View style={[s.payBar, { width: `${p.pct}%`, backgroundColor: p.color }]} />
                  </View>
                  <Text style={[s.payAmount, { color: colors.text }]}>{fmt(p.amount)}</Text>
                  <Text style={[s.payPct, { color: colors.textMuted }]}>{p.pct}%</Text>
                </View>
              ))}
            </View>

            {/* Deductions */}
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Deductions</Text>
              {[
                { label: 'Voids', val: preview.voids, icon: 'close-circle', color: '#EE0000' },
                { label: 'Refunds', val: preview.refunds, icon: 'return-down-back', color: '#F5A623' },
                { label: 'Discounts', val: preview.discounts, icon: 'pricetag', color: '#F5A623' },
                { label: 'Tips Collected', val: preview.tips, icon: 'heart', color: '#00B341' },
              ].map((d) => (
                <View key={d.label} style={[s.deductRow, { borderBottomColor: colors.borderLight }]}>
                  <View style={s.deductLeft}>
                    <Ionicons name={d.icon} size={16} color={d.color} />
                    <Text style={[s.deductLabel, { color: colors.text }]}>{d.label}</Text>
                  </View>
                  <Text style={[s.deductVal, { color: d.color }]}>
                    {d.label === 'Tips Collected' ? '+' : '-'}{fmtFull(d.val)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            {/* History cards */}
            {history.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="document-text-outline" size={48} color="#CCC" />
                <Text style={{ fontSize: 15, color: '#888', marginTop: 8 }}>No EOD history yet</Text>
              </View>
            )}
            {history.map((day) => {
              const isShort = day.variance < 0;
              const isOver = day.variance > 0;
              const isBalanced = day.variance === 0;

              return (
                <PressCard key={day.id} style={[s.histCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={s.histTop}>
                    <Text style={[s.histDate, { color: colors.text }]}>{day.date}</Text>
                    <View style={[s.histBadge, {
                      backgroundColor: isBalanced ? '#EDFBF3' : isShort ? '#FFF0F0' : '#FFF8EB',
                    }]}>
                      <StatusDot status={day.status} />
                      <Text style={[s.histBadgeText, {
                        color: isBalanced ? '#007A2E' : isShort ? '#EE0000' : '#F5A623',
                      }]}>
                        {isBalanced ? 'Balanced' : isShort ? `Short ${symbol}${Math.abs(day.variance)}` : `Over ${symbol}${day.variance}`}
                      </Text>
                    </View>
                  </View>

                  <View style={s.histRow}>
                    <View style={s.histCol}>
                      <Text style={[s.histLabel, { color: colors.textMuted }]}>Total Sales</Text>
                      <Text style={[s.histVal, { color: colors.text }]}>{fmt(day.totalSales)}</Text>
                    </View>
                    <View style={s.histCol}>
                      <Text style={[s.histLabel, { color: colors.textMuted }]}>Cash Expected</Text>
                      <Text style={[s.histVal, { color: colors.text }]}>{fmtFull(day.cashExpected)}</Text>
                    </View>
                    <View style={s.histCol}>
                      <Text style={[s.histLabel, { color: colors.textMuted }]}>Cash Actual</Text>
                      <Text style={[s.histVal, { color: colors.text }]}>{fmtFull(day.cashActual)}</Text>
                    </View>
                  </View>

                  <View style={[s.histFooter, { borderTopColor: colors.borderLight }]}>
                    <Text style={[s.histClosedBy, { color: colors.textMuted }]}>Closed by {day.closedBy}</Text>
                    <Text style={[s.histClosedAt, { color: colors.textMuted }]}>{day.closedAt}</Text>
                  </View>
                </PressCard>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  headerTitle: { ...TYPE.h2, color: '#000' },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFF',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#000' },
  tabText: { ...TYPE.smallMed, color: '#888' },
  tabTextActive: { color: '#FFF' },
  scroll: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  statusCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderLeftWidth: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusLabel: { ...TYPE.bodyMed, color: '#000' },
  statusMeta: { ...TYPE.small, color: '#888', marginTop: 6 },
  heroCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  heroEyebrow: { ...TYPE.label, color: '#888' },
  heroAmount: { ...TYPE.amountXl, color: '#000', marginTop: 4 },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  heroMetaItem: { ...TYPE.small, color: '#444' },
  heroDivider: { width: 1, height: 14, backgroundColor: '#EAEAEA' },
  sectionTitle: { ...TYPE.bodyMed, color: '#000', marginBottom: 14 },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  payLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 80,
  },
  payLabel: { ...TYPE.small, color: '#000' },
  payBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  payBar: { height: 8, borderRadius: 4 },
  payAmount: { ...TYPE.smallMed, color: '#000', width: 52, textAlign: 'right' },
  payPct: { ...TYPE.caption, color: '#888', width: 30, textAlign: 'right' },
  deductRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
  },
  deductLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deductLabel: { ...TYPE.body, color: '#000' },
  deductVal: { ...TYPE.bodyMed },
  histCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  histTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  histDate: { ...TYPE.bodyMed, color: '#000' },
  histBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  histBadgeText: { ...TYPE.caption, fontWeight: '700' },
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  histCol: { alignItems: 'center', flex: 1 },
  histLabel: { ...TYPE.caption, color: '#888', marginBottom: 4 },
  histVal: { ...TYPE.smallMed, color: '#000' },
  histFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  histClosedBy: { ...TYPE.caption, color: '#888' },
  histClosedAt: { ...TYPE.caption, color: '#888' },
});
