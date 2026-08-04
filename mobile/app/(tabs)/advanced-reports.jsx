/**
 * Advanced Reports — "Revenue analytics" (mobile).
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · react-native-svg
 *
 * The web AdvancedReportsPage / RevenueAnalyticsPage, rebuilt for a phone: a
 * range-scoped deep-dive into the SELECTED outlet — a net-revenue / net-profit
 * hero, the daily-revenue trend, a full profit & loss statement, the category
 * revenue mix, and a 24×7 "peak hours" heatmap. Read-only.
 *
 * Data + pure transforms live in src/hooks/useAdvancedReports.js; the request is
 * outlet-scoped and needs VIEW_REPORTS — a 403 is surfaced as an empty state.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import { chartColors } from '../../src/constants/theme';
import {
  useAdvancedReports,
  AR_RANGES,
  AR_DAY_LABELS,
  hasReportData,
  profitMargin,
  buildHeatmap,
  peakCell,
  maxDaily,
  fmtHour,
  num,
} from '../../src/hooks/useAdvancedReports';

// ─── Range selector ───────────────────────────────────────────────────────────
function RangeTabs({ range, onChange, colors, s }) {
  return (
    <View style={s.rangeRow}>
      {AR_RANGES.map((r) => {
        const active = range === r.key;
        return (
          <TouchableOpacity
            key={r.key}
            style={[s.rangeChip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => onChange(r.key)}
            activeOpacity={0.85}
          >
            <Text style={[s.rangeChipText, active && { color: '#fff' }]}>{r.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Hero KPI card ──────────────────────────────────────────────────────────
function HeroCard({ report, fmtFull, fmt, colors, s }) {
  const pl = report.profit_loss;
  const margin = profitMargin(report);
  const profitPositive = num(pl.net_profit) >= 0;
  const tone = profitPositive ? colors.success : colors.danger;

  return (
    <Animated.View entering={FadeInDown.duration(260)} style={s.hero}>
      <Text style={s.heroLabel}>Net revenue</Text>
      <Text style={s.heroValue}>{fmtFull(pl.net_revenue)}</Text>

      <View style={s.heroRow}>
        <View style={s.heroStat}>
          <Text style={[s.heroStatValue, { color: tone }]}>{fmtFull(pl.net_profit)}</Text>
          <Text style={s.heroStatLabel}>Net profit</Text>
        </View>
        <View style={s.heroDivider} />
        <View style={s.heroStat}>
          <Text style={[s.heroStatValue, { color: tone }]}>{margin}%</Text>
          <Text style={s.heroStatLabel}>Margin</Text>
        </View>
        <View style={s.heroDivider} />
        <View style={s.heroStat}>
          <Text style={s.heroStatValue}>{num(report.total_orders)}</Text>
          <Text style={s.heroStatLabel}>Orders</Text>
        </View>
      </View>

      <View style={s.heroFootRow}>
        <Text style={s.heroFoot}>Gross {fmt(pl.gross_revenue)}</Text>
        <Text style={s.heroFoot}>· Tax {fmt(pl.tax)}</Text>
        <Text style={s.heroFoot}>· Food cost {fmt(pl.food_cost)}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Daily revenue trend (bars) ─────────────────────────────────────────────
function DailyRevenue({ daily, fmt, colors, s }) {
  const max = useMemo(() => maxDaily(daily), [daily]);
  if (!daily.length) return null;
  return (
    <Section title="Daily revenue" icon="bar-chart-outline" colors={colors} s={s}>
      <View style={s.barsRow}>
        {daily.map((d, i) => {
          const v = num(d.v);
          const h = Math.max(4, Math.round((v / max) * 120));
          return (
            <View key={i} style={s.barCol}>
              <View style={s.barTrack}>
                <View style={[s.barFill, { height: h, backgroundColor: colors.accent }]} />
              </View>
              <Text style={s.barLabel} numberOfLines={1}>{d.day || '—'}</Text>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

// ─── Profit & loss statement ────────────────────────────────────────────────
function PnLRow({ label, value, fmt, strong, tone, indent, s }) {
  return (
    <View style={[s.pnlRow, indent && s.pnlIndent]}>
      <Text style={[s.pnlLabel, strong && s.pnlLabelStrong]} numberOfLines={1}>{label}</Text>
      <Text style={[s.pnlValue, strong && s.pnlValueStrong, tone && { color: tone }]}>{fmt(value)}</Text>
    </View>
  );
}

function ProfitLoss({ pl, fmtFull, colors, s }) {
  const profitTone = num(pl.net_profit) >= 0 ? colors.success : colors.danger;
  return (
    <Section title="Profit & loss" icon="calculator-outline" colors={colors} s={s}>
      <View style={s.pnlCard}>
        <PnLRow label="Gross revenue" value={pl.gross_revenue} fmt={fmtFull} s={s} />
        <PnLRow label="Discounts" value={-Math.abs(pl.discounts)} fmt={fmtFull} indent tone={colors.warning} s={s} />
        <PnLRow label="Refunds" value={-Math.abs(pl.refunds)} fmt={fmtFull} indent tone={colors.warning} s={s} />
        <PnLRow label="Net revenue" value={pl.net_revenue} fmt={fmtFull} strong s={s} />

        <View style={s.pnlDivider} />

        <PnLRow label="Food cost" value={-Math.abs(pl.food_cost)} fmt={fmtFull} indent s={s} />
        <PnLRow label="Staff cost" value={-Math.abs(pl.staff_cost)} fmt={fmtFull} indent s={s} />
        <PnLRow label="Overheads" value={-Math.abs(pl.overheads)} fmt={fmtFull} indent s={s} />
        <PnLRow label="Total expenses" value={-Math.abs(pl.total_expenses)} fmt={fmtFull} strong s={s} />
        <PnLRow label="Tax" value={-Math.abs(pl.tax)} fmt={fmtFull} indent s={s} />

        <View style={s.pnlDivider} />

        <PnLRow label="Net profit" value={pl.net_profit} fmt={fmtFull} strong tone={profitTone} s={s} />
      </View>
    </Section>
  );
}

// ─── Category revenue mix ───────────────────────────────────────────────────
function CategoryMix({ cats, fmt, colors, s }) {
  if (!cats.length) return null;
  const top = cats.slice(0, 8);
  const maxRev = Math.max(1, ...top.map((c) => num(c.revenue)));
  return (
    <Section title="Category mix" icon="pie-chart-outline" colors={colors} s={s}>
      <View style={s.catCard}>
        {top.map((c, i) => {
          const rev = num(c.revenue);
          const w = Math.max(3, Math.round((rev / maxRev) * 100));
          const color = chartColors[i % chartColors.length];
          return (
            <View key={c.name + i} style={s.catRow}>
              <View style={s.catTop}>
                <View style={s.catNameWrap}>
                  <View style={[s.catDot, { backgroundColor: color }]} />
                  <Text style={s.catName} numberOfLines={1}>{c.name || 'Uncategorised'}</Text>
                </View>
                <Text style={s.catRev}>{fmt(rev)}</Text>
              </View>
              <View style={s.catTrack}>
                <View style={[s.catFill, { width: `${w}%`, backgroundColor: color }]} />
              </View>
              <Text style={s.catMeta}>{num(c.pct)}% · {num(c.orders)} sold</Text>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

// ─── Peak hours heatmap (7 days × 24 hours) ─────────────────────────────────
function Heatmap({ cells, colors, s }) {
  const { grid, max } = useMemo(() => buildHeatmap(cells), [cells]);
  const peak = useMemo(() => peakCell(cells), [cells]);
  if (max <= 0) return null;

  const cellColor = (n) => {
    if (n <= 0) return colors.border + '55';
    const t = Math.min(1, n / max);
    // Blend from a faint accent tint to full accent as intensity rises.
    const alpha = 0.18 + t * 0.82;
    return withAlpha(colors.accent, alpha);
  };

  return (
    <Section title="Peak hours" icon="flame-outline" colors={colors} s={s}>
      {peak ? (
        <Text style={s.peakNote}>
          Busiest: {AR_DAY_LABELS[peak.day]} · {fmtHour(peak.hour)} ({peak.count} orders)
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
        <View>
          {/* Hour axis (every 3rd hour) */}
          <View style={s.hmAxisRow}>
            <View style={s.hmDayLabel} />
            {Array.from({ length: 24 }).map((_, h) => (
              <View key={h} style={s.hmCellSlot}>
                {h % 3 === 0 ? <Text style={s.hmAxisText}>{h}</Text> : null}
              </View>
            ))}
          </View>
          {grid.map((row, d) => (
            <View key={d} style={s.hmRow}>
              <Text style={s.hmDayLabel}>{AR_DAY_LABELS[d]}</Text>
              {row.map((n, h) => (
                <View key={h} style={s.hmCellSlot}>
                  <View style={[s.hmCell, { backgroundColor: cellColor(n) }]} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={s.hmLegend}>
        <Text style={s.hmLegendText}>Less</Text>
        {[0.18, 0.4, 0.65, 1].map((a, i) => (
          <View key={i} style={[s.hmLegendCell, { backgroundColor: withAlpha(colors.accent, a) }]} />
        ))}
        <Text style={s.hmLegendText}>More</Text>
      </View>
    </Section>
  );
}

// ─── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, icon, colors, s, children }) {
  return (
    <Animated.View entering={FadeIn.duration(240)} style={s.section}>
      <View style={s.sectionHead}>
        <Ionicons name={icon} size={15} color={colors.accent} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

// ─── Colour util: apply an alpha to a #rrggbb hex ───────────────────────────
function withAlpha(hex, alpha) {
  const h = String(hex || '#2563eb').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function AdvancedReportsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU, fmt, fmtFull } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    range, setRange, report, isLoading, isError, isRefetching, refetch, hasOutlet,
  } = useAdvancedReports('week');

  const outletName = currentOutlet?.name || 'Selected outlet';
  const showData = report && hasReportData(report);

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Advanced Reports</Text>
            <Text style={s.subtitle} numberOfLines={1}>Revenue analytics · {outletName}</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={refetch} activeOpacity={0.85} disabled={isRefetching}>
            <Ionicons name="refresh-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>
        {hasOutlet ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <RangeTabs range={range} onChange={setRange} colors={colors} s={s} />
          </View>
        ) : null}
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its revenue analytics." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load reports"
          subtitle="Something went wrong, or you don't have permission. Pull to refresh or retry."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        >
          {!showData ? (
            <View style={{ marginTop: 48 }}>
              <EmptyState
                icon="📊"
                title="No sales in this period"
                subtitle="There's nothing to analyse for the selected range yet."
              />
            </View>
          ) : (
            <>
              <HeroCard report={report} fmtFull={fmtFull} fmt={fmt} colors={colors} s={s} />
              <DailyRevenue daily={report.daily_revenue} fmt={fmt} colors={colors} s={s} />
              <ProfitLoss pl={report.profit_loss} fmtFull={fmtFull} colors={colors} s={s} />
              <CategoryMix cats={report.category_breakdown} fmt={fmt} colors={colors} s={s} />
              <Heatmap cells={report.hourly_heatmap} colors={colors} s={s} />
              {report.period ? (
                <Text style={s.periodNote}>
                  {report.period.from} → {report.period.to}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },

    header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    refreshBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent + '18' },

    rangeRow: { flexDirection: 'row', gap: 8 },
    rangeChip: { flex: 1, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    rangeChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Hero
    hero: { backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 18, marginBottom: 16 },
    heroLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    heroValue: { fontSize: 34, fontWeight: '800', color: c.text, letterSpacing: -1, marginTop: 4 },
    heroRow: { flexDirection: 'row', marginTop: 16, backgroundColor: c.pillBg, borderRadius: 14, paddingVertical: 12 },
    heroStat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    heroStatValue: { fontSize: 17, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    heroStatLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },
    heroDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    heroFootRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
    heroFoot: { fontSize: 12, color: c.textMuted, fontWeight: '600' },

    // Section
    section: { marginBottom: 20 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: c.text, letterSpacing: -0.2 },

    // Daily bars
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, gap: 6, minHeight: 168 },
    barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    barTrack: { height: 120, justifyContent: 'flex-end' },
    barFill: { width: 18, borderRadius: 6 },
    barLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 8 },

    // P&L
    pnlCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, paddingVertical: 8 },
    pnlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
    pnlIndent: { paddingLeft: 12 },
    pnlLabel: { fontSize: 13.5, color: c.textSecondary, fontWeight: '600', flexShrink: 1 },
    pnlLabelStrong: { color: c.text, fontWeight: '800' },
    pnlValue: { fontSize: 13.5, color: c.textSecondary, fontWeight: '700' },
    pnlValueStrong: { color: c.text, fontWeight: '800', fontSize: 15 },
    pnlDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 4 },

    // Category
    catCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, gap: 14 },
    catRow: {},
    catTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 },
    catNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
    catDot: { width: 9, height: 9, borderRadius: 3 },
    catName: { fontSize: 13.5, color: c.text, fontWeight: '700', flexShrink: 1 },
    catRev: { fontSize: 13.5, color: c.text, fontWeight: '800' },
    catTrack: { height: 8, borderRadius: 4, backgroundColor: c.pillBg, overflow: 'hidden' },
    catFill: { height: 8, borderRadius: 4 },
    catMeta: { fontSize: 11.5, color: c.textMuted, fontWeight: '600', marginTop: 5 },

    // Heatmap
    peakNote: { fontSize: 12.5, color: c.textSecondary, fontWeight: '600', marginBottom: 10 },
    hmAxisRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    hmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
    hmDayLabel: { width: 30, fontSize: 10.5, color: c.textMuted, fontWeight: '700' },
    hmCellSlot: { width: 14, alignItems: 'center', justifyContent: 'center' },
    hmCell: { width: 11, height: 11, borderRadius: 2.5 },
    hmAxisText: { fontSize: 8.5, color: c.textMuted, fontWeight: '700' },
    hmLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
    hmLegendText: { fontSize: 10.5, color: c.textMuted, fontWeight: '700' },
    hmLegendCell: { width: 12, height: 12, borderRadius: 3 },

    periodNote: { fontSize: 11.5, color: c.textMuted, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  });
}
