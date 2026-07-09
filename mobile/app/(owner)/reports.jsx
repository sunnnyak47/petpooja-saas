import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, G, Text as SvgText, Line } from 'react-native-svg';

import { LC } from '../../src/constants/colors';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import SparkLine from '../../src/components/SparkLine';
import {
  useRevenueOverTime,
  useCategorySales,
  useTopItems,
  usePaymentBreakdown,
  useTaxSummary,
} from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';
import { ShareButton } from '../../src/components/ShareButton';
import { exportReportPdf, shareFile } from '../../src/utils/exportReport';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const CONTENT_W = Math.min(SCREEN_W, 480);

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'mtd', label: 'This Month' },
];

const CHART_PALETTE = ['#2563eb', '#00B341', '#F5A623', '#EE0000', '#888888'];


// ─── Helpers ────────────────────────────────────────────────────────────────────


function pad(d) {
  return String(d).padStart(2, '0');
}

function toYMD(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getDateRange(rangeKey) {
  const now = new Date();
  const today = toYMD(now);

  switch (rangeKey) {
    case 'today':
      return { from: today, to: today };
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: toYMD(d), to: today };
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: toYMD(d), to: today };
    }
    case 'mtd': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toYMD(d), to: today };
    }
    default:
      return { from: today, to: today };
  }
}

function shortDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ─── Animated Counter Hook ──────────────────────────────────────────────────────

function useAnimatedCounter(targetValue, duration = 800) {
  const animValue = useRef(new RNAnimated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    animValue.setValue(0);
    const anim = RNAnimated.timing(animValue, {
      toValue: targetValue,
      duration,
      useNativeDriver: false,
    });
    const listenerId = animValue.addListener(({ value }) => {
      setDisplay(Math.round(value));
    });
    anim.start();
    return () => {
      animValue.removeListener(listenerId);
    };
  }, [targetValue]);

  return display;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────────

function DateRangePills({ selected, onSelect, colors }) {
  return (
    <View style={s.pillRow}>
      {RANGES.map((r) => {
        const active = r.key === selected;
        return (
          <PressCard
            key={r.key}
            style={[s.pill, { backgroundColor: colors.pillBg }, active && { backgroundColor: colors.pillActiveBg }]}
            onPress={() => onSelect(r.key)}
          >
            <Text style={[s.pillText, { color: colors.pillText }, active && { color: colors.pillActiveText }]}>{r.label}</Text>
          </PressCard>
        );
      })}
    </View>
  );
}

function SkeletonCard({ height = 160 }) {
  return (
    <View style={s.card}>
      <SkeletonBox width="40%" height={14} style={{ marginBottom: 12, backgroundColor: '#E0E0E0' }} />
      <SkeletonBox width="60%" height={24} style={{ marginBottom: 16, backgroundColor: '#E0E0E0' }} />
      <SkeletonBox width="100%" height={height - 80} style={{ backgroundColor: '#E0E0E0' }} />
    </View>
  );
}

// ─── Revenue Bar Chart ──────────────────────────────────────────────────────────

function RevenueBarChart({ data, chartWidth }) {
  const chartHeight = 120;
  const barPadding = 4;
  const maxValue = Math.max(...data.map((d) => d.revenue), 1);
  const barCount = data.length;
  const barWidth = Math.max(
    8,
    (chartWidth - barPadding * (barCount + 1)) / barCount,
  );

  return (
    <Svg width={chartWidth} height={chartHeight + 28}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const y = chartHeight - frac * chartHeight;
        return (
          <Line
            key={`grid-${i}`}
            x1={0}
            y1={y}
            x2={chartWidth}
            y2={y}
            stroke="#EAEAEA"
            strokeWidth={0.5}
            strokeDasharray="4,4"
          />
        );
      })}

      {/* Bars */}
      <G>
        {data.map((d, i) => {
          const barH = (d.revenue / maxValue) * chartHeight;
          const x = barPadding + i * (barWidth + barPadding);
          const y = chartHeight - barH;
          const isLast = i === data.length - 1;
          return (
            <G key={d.date}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={4}
                fill={isLast ? '#2563eb' : '#D0E3FF'}
              />
              {/* Date label */}
              <SvgText
                x={x + barWidth / 2}
                y={chartHeight + 16}
                fontSize={9}
                fill="#888888"
                textAnchor="middle"
              >
                {shortDate(d.date)}
              </SvgText>
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

// ─── Stacked Horizontal Bar ─────────────────────────────────────────────────────

function StackedBar({ data, width }) {
  const barHeight = 14;
  let xOffset = 0;

  return (
    <Svg width={width} height={barHeight}>
      {data.map((item, i) => {
        const w = (item.percentage / 100) * width;
        const x = xOffset;
        xOffset += w;
        return (
          <Rect
            key={item.category}
            x={x}
            y={0}
            width={Math.max(w, 1)}
            height={barHeight}
            rx={i === 0 ? 7 : 0}
            ry={i === 0 ? 7 : 0}
            fill={CHART_PALETTE[i % CHART_PALETTE.length]}
          />
        );
      })}
      {/* Round right side of last bar */}
      {data.length > 0 && (
        <Rect
          x={width - 1}
          y={0}
          width={1}
          height={barHeight}
          rx={7}
          fill={CHART_PALETTE[(data.length - 1) % CHART_PALETTE.length]}
        />
      )}
    </Svg>
  );
}

// ─── Memoized list-item components ──────────────────────────────────────────────

const CategoryRow = React.memo(({ cat, index, colors }) => {
  const { fmt } = useCurrency();
  return (
  <View style={s.catRow}>
    <View
      style={[
        s.catDot,
        { backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] },
      ]}
    />
    <Text style={[s.catName, { color: colors.text }]} numberOfLines={1}>
      {cat.category}
    </Text>
    <Text style={[s.catRevenue, { color: colors.text }]}>{fmt(cat.revenue)}</Text>
    <Text style={[s.catPct, { color: colors.textMuted }]}>{cat.percentage}%</Text>
  </View>
  );
});

const TopSellerRow = React.memo(({ item, index, maxItemRevenue, colors }) => {
  const { fmt } = useCurrency();
  return (
  <View style={s.topRow}>
    <View style={[s.topRank, { backgroundColor: colors.pillBg }]}>
      <Text style={[s.topRankText, { color: colors.textSecondary }]}>#{index + 1}</Text>
    </View>
    <View style={s.topInfo}>
      <View style={s.topHeader}>
        <Text style={[s.topName, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[s.topRevenue, { color: colors.text }]}>{fmt(item.revenue)}</Text>
      </View>
      <View style={s.topMeta}>
        <Text style={[s.topQty, { color: colors.textMuted }]}>{item.qty} sold</Text>
      </View>
      <View style={[s.topBarBg, { backgroundColor: colors.pillBg }]}>
        <View
          style={[
            s.topBarFill,
            {
              width: `${(item.revenue / maxItemRevenue) * 100}%`,
              backgroundColor:
                index === 0 ? colors.accent : index === 1 ? colors.success : colors.pillBg,
            },
          ]}
        />
      </View>
    </View>
  </View>
  );
});

const PaymentRow = React.memo(({ payment, colors }) => {
  const { fmt } = useCurrency();
  return (
  <View style={s.payRow}>
    <View style={s.payLabelRow}>
      <Ionicons
        name={
          payment.method === 'UPI'
            ? 'phone-portrait-outline'
            : payment.method === 'Cash'
            ? 'cash-outline'
            : payment.method === 'Card'
            ? 'card-outline'
            : 'globe-outline'
        }
        size={16}
        color={colors.textMuted}
      />
      <Text style={[s.payMethod, { color: colors.text }]}>{payment.method}</Text>
      <Text style={[s.payAmount, { color: colors.text }]}>{fmt(payment.amount)}</Text>
      <Text style={[s.payPct, { color: colors.textMuted }]}>{payment.percentage}%</Text>
    </View>
    <View style={[s.payBarBg, { backgroundColor: colors.pillBg }]}>
      <View
        style={[
          s.payBarFill,
          { width: `${payment.percentage}%`, backgroundColor: colors.accent },
        ]}
      />
    </View>
  </View>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { outletId, currentOutlet } = useOutlet();
  const { colors } = useTheme();
  const { symbol, locale, dateLocale, fmt, fmtFull } = useCurrency();
  const [range, setRange] = useState('7d');
  const [refreshing, setRefreshing] = useState(false);

  const { from, to } = useMemo(() => getDateRange(range), [range]);

  // Data hooks
  const revenueQuery = useRevenueOverTime(outletId, from, to);
  const categoryQuery = useCategorySales(outletId, from, to);
  const topItemsQuery = useTopItems(outletId, from, to);
  const paymentQuery = usePaymentBreakdown(outletId, from, to);
  const taxQuery = useTaxSummary(outletId, from, to);

  // Use API data with safe defaults
  const revenueData = revenueQuery.data || [];
  const categoryData = categoryQuery.data || [];
  const topItems = topItemsQuery.data || [];
  const payments = paymentQuery.data || [];
  const taxData = taxQuery.data || { cgst: 0, sgst: 0, total: 0, taxableAmount: 0 };

  const isLoading =
    revenueQuery.isLoading ||
    categoryQuery.isLoading ||
    topItemsQuery.isLoading ||
    paymentQuery.isLoading ||
    taxQuery.isLoading;

  const isError =
    revenueQuery.isError &&
    categoryQuery.isError &&
    topItemsQuery.isError &&
    paymentQuery.isError &&
    taxQuery.isError;

  // Derived values
  const totalRevenue = useMemo(
    () => revenueData.reduce((sum, d) => sum + d.revenue, 0),
    [revenueData],
  );

  const totalOrders = useMemo(() => {
    return topItems.reduce((sum, d) => sum + d.qty, 0);
  }, [topItems]);

  const avgOrderValue = useMemo(() => {
    if (!totalOrders) return 0;
    return Math.round(totalRevenue / totalOrders);
  }, [totalRevenue, totalOrders]);

  const maxItemRevenue = useMemo(
    () => Math.max(...topItems.map((d) => d.revenue), 1),
    [topItems],
  );

  // Animated counter
  const animatedRevenue = useAnimatedCounter(totalRevenue);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      revenueQuery.refetch(),
      categoryQuery.refetch(),
      topItemsQuery.refetch(),
      paymentQuery.refetch(),
      taxQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [revenueQuery, categoryQuery, topItemsQuery, paymentQuery, taxQuery]);

  // Chart dimensions
  const cardPadding = 16;
  const chartWidth = CONTENT_W - 32 - cardPadding * 2;

  // ─── Error State ────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <Ionicons name="bar-chart" size={22} color={colors.text} />
          <Text style={[s.headerTitle, { color: colors.text }]}>Sales Reports</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
          <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => onRefresh()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: 8 }}>
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <Ionicons name="bar-chart" size={22} color={colors.text} />
        <Text style={[s.headerTitle, { color: colors.text, flex: 1 }]}>Sales Reports</Text>
        <ShareButton
          color={colors.text}
          onPress={async () => {
            const revenue = revenueData || [];
            const categories = categoryData || [];
            const items = topItems || [];
            const pays = payments || [];
            const tax = taxData || { cgst: 0, sgst: 0, total: 0 };

            const selectedRange = RANGES.find(r => r.key === range)?.label || range;

            const uri = await exportReportPdf({
              title: 'Sales Report',
              subtitle: `${selectedRange} • ${new Date().toLocaleDateString(dateLocale)}`,
              outletName: currentOutlet?.name || 'MS-RM',
              sections: [
                {
                  heading: 'Revenue Summary',
                  rows: [
                    { label: 'Total Revenue', value: `${symbol}${revenue.reduce((s, r) => s + (r.revenue || 0), 0).toLocaleString(locale)}` },
                    { label: 'Total Orders', value: `${totalOrders}` },
                    { label: 'Avg Order Value', value: `${symbol}${avgOrderValue.toLocaleString(locale)}` },
                  ],
                },
                {
                  heading: 'Payment Breakdown',
                  rows: pays.map(p => ({
                    label: p.method || p.name,
                    value: `${symbol}${(p.amount || 0).toLocaleString(locale)} (${p.percentage || 0}%)`,
                  })),
                },
                {
                  heading: 'Tax Summary',
                  rows: [
                    { label: 'CGST', value: `${symbol}${(tax.cgst || 0).toLocaleString(locale)}` },
                    { label: 'SGST', value: `${symbol}${(tax.sgst || 0).toLocaleString(locale)}` },
                    { label: 'Total Tax', value: `${symbol}${(tax.total || 0).toLocaleString(locale)}` },
                  ],
                },
              ],
              tableData: items.length > 0 ? {
                title: 'Top Selling Items',
                headers: ['#', 'Item', 'Qty', 'Revenue'],
                rows: items.slice(0, 10).map((item, i) => [
                  `${i + 1}`,
                  item.name,
                  `${item.qty}`,
                  `${symbol}${(item.revenue || 0).toLocaleString(locale)}`,
                ]),
              } : undefined,
            });
            await shareFile(uri, 'Share Sales Report');
          }}
        />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LC.accent} />
        }
      >
        {/* Date Range Pills */}
        <DateRangePills selected={range} onSelect={setRange} colors={colors} />

        {/* Revenue Summary Card */}
        {isLoading ? (
          <SkeletonCard height={240} />
        ) : revenueData.length === 0 ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardLabel, { color: colors.textMuted }]}>Total Revenue</Text>
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.textMuted} />
              <Text style={{ fontSize: 15, color: colors.textMuted, marginTop: 8 }}>No revenue data yet</Text>
            </View>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardLabel, { color: colors.textMuted }]}>Total Revenue</Text>
            <Text style={[s.revenueAmount, { color: colors.text }]}>{fmtFull(animatedRevenue)}</Text>

            {/* Sparkline preview */}
            <View style={s.sparkWrap}>
              <SparkLine
                data={revenueData.map((d) => d.revenue)}
                color={LC.accent}
                width={chartWidth}
                height={32}
                filled
              />
            </View>

            {/* Bar Chart */}
            <View style={s.chartWrap}>
              <RevenueBarChart data={revenueData} chartWidth={chartWidth} />
            </View>

            {/* Stats row */}
            <View style={[s.statsRow, { borderTopColor: colors.border }]}>
              <View style={s.statItem}>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>Orders</Text>
                <Text style={[s.statValue, { color: colors.text }]}>{totalOrders}</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>Avg Order</Text>
                <Text style={[s.statValue, { color: colors.text }]}>{fmt(avgOrderValue)}</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>Peak Day</Text>
                <Text style={[s.statValue, { color: colors.text }]}>
                  {fmt(Math.max(...revenueData.map((d) => d.revenue)))}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Category Breakdown */}
        {isLoading ? (
          <SkeletonCard height={200} />
        ) : categoryData.length === 0 ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Category Sales</Text>
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <Ionicons name="pie-chart-outline" size={40} color={colors.textMuted} />
              <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>No category data yet</Text>
            </View>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Category Sales</Text>

            {/* Stacked bar */}
            <View style={s.stackedBarWrap}>
              <StackedBar data={categoryData} width={chartWidth} />
            </View>

            {/* Category list */}
            {categoryData.map((cat, i) => (
              <CategoryRow key={cat.category} cat={cat} index={i} colors={colors} />
            ))}
          </View>
        )}

        {/* Top 5 Items */}
        {isLoading ? (
          <SkeletonCard height={220} />
        ) : topItems.length === 0 ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Top Sellers</Text>
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <Ionicons name="trophy-outline" size={40} color={colors.textMuted} />
              <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>No sales data yet</Text>
            </View>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Top Sellers</Text>

            {topItems.slice(0, 5).map((item, i) => (
              <TopSellerRow key={item.name} item={item} index={i} maxItemRevenue={maxItemRevenue} colors={colors} />
            ))}
          </View>
        )}

        {/* Payment Methods */}
        {isLoading ? (
          <SkeletonCard height={180} />
        ) : payments.length === 0 ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Payment Split</Text>
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <Ionicons name="card-outline" size={40} color={colors.textMuted} />
              <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>No payment data yet</Text>
            </View>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Payment Split</Text>

            {payments.map((p) => (
              <PaymentRow key={p.method} payment={p} colors={colors} />
            ))}
          </View>
        )}

        {/* Tax Summary */}
        {isLoading ? (
          <SkeletonCard height={120} />
        ) : (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Tax Summary</Text>

            <View style={s.taxRow}>
              <Text style={[s.taxLabel, { color: colors.textSecondary }]}>Taxable Amount</Text>
              <Text style={[s.taxValue, { color: colors.text }]}>{fmtFull(taxData.taxableAmount)}</Text>
            </View>
            <View style={s.taxRow}>
              <Text style={[s.taxLabel, { color: colors.textSecondary }]}>CGST</Text>
              <Text style={[s.taxValue, { color: colors.text }]}>{fmtFull(taxData.cgst)}</Text>
            </View>
            <View style={s.taxRow}>
              <Text style={[s.taxLabel, { color: colors.textSecondary }]}>SGST</Text>
              <Text style={[s.taxValue, { color: colors.text }]}>{fmtFull(taxData.sgst)}</Text>
            </View>
            <View style={[s.taxDivider, { backgroundColor: colors.border }]} />
            <View style={s.taxRow}>
              <Text style={[s.taxTotalLabel, { color: colors.text }]}>Total Tax</Text>
              <Text style={[s.taxTotalValue, { color: colors.text }]}>{fmtFull(taxData.total)}</Text>
            </View>
          </View>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: LC.bg2,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: LC.card,
    borderBottomWidth: 1,
    borderBottomColor: LC.cardBorder,
  },
  headerTitle: {
    ...TYPE.h2,
    color: LC.text1,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: (SCREEN_W - CONTENT_W) / 2 + 16,
    paddingTop: 16,
  },

  // Date Range Pills
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  pillActive: {
    backgroundColor: '#2563eb',
  },
  pillText: {
    ...TYPE.smallMed,
    color: '#888888',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },

  // Card
  card: {
    backgroundColor: LC.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardLabel: {
    ...TYPE.label,
    color: LC.text3,
    marginBottom: 4,
  },
  cardTitle: {
    ...TYPE.h3,
    color: LC.text1,
    marginBottom: 14,
  },

  // Revenue
  revenueAmount: {
    ...TYPE.amountXl,
    color: LC.text1,
    marginBottom: 12,
  },
  sparkWrap: {
    marginBottom: 8,
  },
  chartWrap: {
    marginBottom: 12,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: LC.separator,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...TYPE.caption,
    color: LC.text3,
    marginBottom: 2,
  },
  statValue: {
    ...TYPE.amount,
    color: LC.text1,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: LC.separator,
  },

  // Category
  stackedBarWrap: {
    marginBottom: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  catName: {
    ...TYPE.body,
    color: LC.text1,
    flex: 1,
  },
  catRevenue: {
    ...TYPE.bodyMed,
    color: LC.text1,
    marginRight: 8,
  },
  catPct: {
    ...TYPE.small,
    color: LC.text3,
    width: 36,
    textAlign: 'right',
  },

  // Top Items
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  topRank: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: LC.bg3,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  topRankText: {
    ...TYPE.smallMed,
    color: LC.text2,
  },
  topInfo: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  topName: {
    ...TYPE.bodyMed,
    color: LC.text1,
    flex: 1,
    marginRight: 8,
  },
  topRevenue: {
    ...TYPE.amount,
    color: LC.text1,
  },
  topMeta: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  topQty: {
    ...TYPE.small,
    color: LC.text3,
  },
  topBarBg: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
  },
  topBarFill: {
    height: 5,
    borderRadius: 3,
  },

  // Payments
  payRow: {
    marginBottom: 14,
  },
  payLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  payMethod: {
    ...TYPE.bodyMed,
    color: LC.text1,
    flex: 1,
  },
  payAmount: {
    ...TYPE.bodyMed,
    color: LC.text1,
    marginRight: 8,
  },
  payPct: {
    ...TYPE.small,
    color: LC.text3,
    width: 32,
    textAlign: 'right',
  },
  payBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
  },
  payBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: LC.accent,
  },

  // Tax
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  taxLabel: {
    ...TYPE.body,
    color: LC.text2,
  },
  taxValue: {
    ...TYPE.bodyMed,
    color: LC.text1,
  },
  taxDivider: {
    height: 1,
    backgroundColor: LC.separator,
    marginVertical: 4,
  },
  taxTotalLabel: {
    ...TYPE.h3,
    color: LC.text1,
  },
  taxTotalValue: {
    ...TYPE.amount,
    color: LC.text1,
  },
});
