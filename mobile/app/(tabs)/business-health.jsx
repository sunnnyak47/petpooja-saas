/**
 * Business Health — combined Square × Xero performance dashboard (mobile).
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated
 *
 * A read-only health snapshot for the SELECTED outlet: a hero "health" tile
 * (true net profit + net margin), key-metric cards, plain-language insights,
 * payment mix, top items, Xero financials and payout reconciliation. Data +
 * pure transforms live in src/hooks/useBusinessHealth.js; every request is
 * outlet-scoped. "Refresh" pulls the latest Square figures via the real
 * POST /performance/refresh endpoint.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import {
  useBusinessHealth,
  healthStatus,
  shortDate,
  num,
  pct,
} from '../../src/hooks/useBusinessHealth';

const RANGES = [
  { key: 7, label: '7D' },
  { key: 30, label: '30D' },
  { key: 90, label: '90D' },
];

// Alert level → tone + icon.
function alertTone(level, colors) {
  if (level === 'good') return { color: colors.success, icon: 'checkmark-circle' };
  if (level === 'warn') return { color: colors.warning, icon: 'alert-circle' };
  return { color: colors.textMuted, icon: 'information-circle' };
}

// ─── Small presentational pieces ────────────────────────────────────────────
function StatusDot({ label, connected, colors, s }) {
  return (
    <View style={s.statusDot}>
      <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.textMuted, opacity: connected ? 1 : 0.5 }]} />
      <Text style={s.statusLabel}>{label}</Text>
      <Text style={[s.statusValue, { color: connected ? colors.success : colors.textMuted }]}>
        {connected ? 'Connected' : 'Not connected'}
      </Text>
    </View>
  );
}

function MetricCard({ label, value, sub, icon, colors, s }) {
  return (
    <View style={s.metricCard}>
      <View style={s.metricTop}>
        <Text style={s.metricLabel} numberOfLines={1}>{label}</Text>
        {icon ? <Ionicons name={icon} size={15} color={colors.textMuted} /> : null}
      </View>
      <Text style={s.metricValue} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={s.metricSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function BarRow({ label, right, fillPct, colors, s }) {
  return (
    <View style={s.barRow}>
      <View style={s.barHead}>
        <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={s.barRight} numberOfLines={1}>{right}</Text>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.max(2, Math.min(100, fillPct))}%`, backgroundColor: colors.accent }]} />
      </View>
    </View>
  );
}

function Section({ title, right, children, s }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right ? <Text style={s.sectionRight}>{right}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function BusinessHealthScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU, fmtFull } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [rangeDays, setRangeDays] = useState(30);

  const {
    period, currency, headline,
    squareConnected, xeroConnected,
    square, xero, kpis, reconciliation,
    alerts, trends,
    isLoading, isError, isRefetching, refetch,
    refresh, isRefreshing, hasOutlet,
  } = useBusinessHealth(rangeDays);

  const money = useCallback((v) => fmtFull(Number(v) || 0), [fmtFull]);

  const onRefresh = useCallback(async () => {
    try {
      const res = await refresh();
      const days = res?.data?.days_pulled ?? res?.days_pulled;
      Alert.alert('Refreshed', days != null ? `Pulled ${days} day(s) of Square data.` : 'Square data refreshed.');
    } catch (err) {
      Alert.alert('Could not refresh', err?.message || 'Please try again.');
    }
  }, [refresh]);

  const status = healthStatus(kpis.margin_pct);
  const statusColor = status.tone === 'good' ? colors.success : status.tone === 'ok' ? colors.accent : colors.warning;

  const paymentMix = Array.isArray(square.payment_mix) ? square.payment_mix : [];
  const topItems = Array.isArray(square.top_items) ? square.top_items : [];
  const trendMax = Math.max(...trends.map((t) => Number(t.gross_sales || 0)), 1);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const header = (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
          <Text style={s.title}>Business Health</Text>
          <Text style={s.subtitle} numberOfLines={1}>Square × Xero · {outletName}</Text>
        </View>
        <TouchableOpacity
          style={[s.refreshBtn, isRefreshing && { opacity: 0.6 }]}
          onPress={onRefresh}
          disabled={isRefreshing}
          activeOpacity={0.85}
        >
          {isRefreshing
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Ionicons name="refresh" size={18} color={colors.accent} />}
        </TouchableOpacity>
      </View>

      {hasOutlet ? (
        <View style={s.rangeRow}>
          {RANGES.map((r) => {
            const active = rangeDays === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[s.rangeChip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                onPress={() => setRangeDays(r.key)}
                activeOpacity={0.85}
              >
                <Text style={[s.rangeChipText, active && { color: '#fff' }]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </SafeAreaView>
  );

  if (!hasOutlet) {
    return (
      <View style={s.root}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {header}
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its business health." />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={s.root}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {header}
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.root}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {header}
        <EmptyState icon="⚠️" title="Couldn't load business health" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      {header}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {/* Connection + period */}
        <View style={s.statusBar}>
          <View style={s.statusGroup}>
            <StatusDot label="Square" connected={squareConnected} colors={colors} s={s} />
            <StatusDot label="Xero" connected={xeroConnected} colors={colors} s={s} />
          </View>
          {period ? (
            <Text style={s.periodText}>{shortDate(period.from)}–{shortDate(period.to)} · {period.days}d · {currency}</Text>
          ) : null}
        </View>

        {!squareConnected ? (
          <Animated.View entering={FadeInDown.duration(240)} style={s.connectCard}>
            <View style={[s.connectIcon, { borderColor: colors.border }]}>
              <Ionicons name="card-outline" size={22} color={colors.textSecondary} />
            </View>
            <Text style={s.connectTitle}>Connect Square to begin</Text>
            <Text style={s.connectBody}>
              Once connected, payments, payouts, labour and loyalty are pulled automatically and combined with your Xero
              financials to compute true profit, margins and cash flow.
            </Text>
          </Animated.View>
        ) : (
          <>
            {/* Hero health tile */}
            <Animated.View entering={FadeInDown.duration(260)} style={s.hero}>
              <View style={s.heroTopRow}>
                <Text style={s.heroLabel}>True Net Profit</Text>
                <View style={[s.healthPill, { backgroundColor: statusColor + '22' }]}>
                  <View style={[s.dot, { backgroundColor: statusColor }]} />
                  <Text style={[s.healthPillText, { color: statusColor }]}>{status.label}</Text>
                </View>
              </View>
              <Text style={s.heroValue}>{money(kpis.true_net_profit)}</Text>
              <Text style={[s.heroSub, { color: statusColor }]}>{pct(kpis.margin_pct)} net margin</Text>
              {headline ? <Text style={s.heroHeadline}>{headline}</Text> : null}
            </Animated.View>

            {/* Key metric cards */}
            <View style={s.metricGrid}>
              <MetricCard label="Gross Sales" value={money(square.gross_sales)} sub={`${num(square.payments_count)} txns`} icon="receipt-outline" colors={colors} s={s} />
              <MetricCard label="Card Fees" value={money(square.fees)} sub={`${pct(kpis.fee_leakage_pct)} of profit`} icon="pricetags-outline" colors={colors} s={s} />
              <MetricCard label="Avg Ticket" value={money(square.avg_ticket)} icon="card-outline" colors={colors} s={s} />
              <MetricCard label="Cash Forecast" value={money(kpis.cash_forecast)} sub={kpis.break_even_daily != null ? `B/E ${money(kpis.break_even_daily)}/day` : undefined} icon="wallet-outline" colors={colors} s={s} />
              <MetricCard label="Labour Cost" value={kpis.labor_pct != null ? pct(kpis.labor_pct) : '—'} sub={square.labor_hours != null ? `${num(square.labor_hours)} hrs` : undefined} icon="time-outline" colors={colors} s={s} />
              <MetricCard label="Loyalty" value={num(square.loyalty_members)} sub={square.customers_count != null ? `${num(square.customers_count)} customers` : undefined} icon="people-outline" colors={colors} s={s} />
              <MetricCard label="Gift Cards" value={money(square.giftcard_outstanding)} sub="outstanding" icon="gift-outline" colors={colors} s={s} />
              <MetricCard label="Tips" value={money(square.tips)} icon="cash-outline" colors={colors} s={s} />
            </View>

            {/* Insights */}
            {alerts.length > 0 ? (
              <Section title="Insights" s={s}>
                <View style={s.card}>
                  {alerts.map((a, i) => {
                    const t = alertTone(a?.level, colors);
                    return (
                      <View key={i} style={[s.insightRow, i > 0 && s.rowDivider]}>
                        <Ionicons name={t.icon} size={17} color={t.color} style={{ marginTop: 1 }} />
                        <Text style={s.insightText}>{a?.text}</Text>
                      </View>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            {/* Payment mix */}
            <Section title="Payment Mix" s={s}>
              <View style={s.card}>
                {paymentMix.length === 0 ? (
                  <Text style={s.emptyLine}>No payment breakdown available.</Text>
                ) : (
                  paymentMix.map((p, i) => (
                    <BarRow
                      key={i}
                      label={p.brand || 'Other'}
                      right={`${money(p.amount)} · ${pct(p.pct)}`}
                      fillPct={Number(p.pct || 0)}
                      colors={colors}
                      s={s}
                    />
                  ))
                )}
              </View>
            </Section>

            {/* Top items */}
            <Section title="Top Items" s={s}>
              <View style={s.card}>
                {topItems.length === 0 ? (
                  <Text style={s.emptyLine}>No itemised data — this merchant may use Square for payments only.</Text>
                ) : (
                  topItems.map((it, i) => (
                    <View key={i} style={[s.itemRow, i > 0 && s.rowDivider]}>
                      <Text style={s.itemRank}>{i + 1}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.itemName} numberOfLines={1}>{it.name || 'Item'}</Text>
                        <Text style={s.itemSub}>{num(it.qty)} sold</Text>
                      </View>
                      <Text style={s.itemAmt}>{money(it.gross)}</Text>
                    </View>
                  ))
                )}
              </View>
            </Section>

            {/* Gross sales trend */}
            {trends.length > 0 ? (
              <Section title="Gross Sales Trend" right={`Peak ${money(trendMax)}`} s={s}>
                <View style={s.card}>
                  <View style={s.trendChart}>
                    {trends.map((t, i) => {
                      const h = Math.max((Number(t.gross_sales || 0) / trendMax) * 100, 3);
                      return <View key={i} style={[s.trendBar, { height: `${h}%`, backgroundColor: colors.accent }]} />;
                    })}
                  </View>
                  <View style={s.trendAxis}>
                    <Text style={s.axisText}>{shortDate(trends[0]?.date)}</Text>
                    <Text style={s.axisText}>{shortDate(trends[trends.length - 1]?.date)}</Text>
                  </View>
                </View>
              </Section>
            ) : null}
          </>
        )}

        {/* Xero financials */}
        {xero ? (
          <Section title="Xero Financials" right={xero.cash != null ? `Cash ${money(xero.cash)}` : undefined} s={s}>
            <View style={s.statGrid}>
              {[
                ['Revenue', xero.revenue],
                ['Expenses', xero.expenses],
                ['COGS', xero.cogs],
                ['Net Profit', xero.net_profit],
                ['Bills Due', xero.bills_due],
                ['GST Est.', xero.gst_estimate],
              ].map(([label, val], i) => (
                <View key={i} style={s.statCell}>
                  <Text style={s.statLabel}>{label}</Text>
                  <Text style={s.statValue}>{money(val)}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : squareConnected ? (
          <Animated.View entering={FadeInDown.duration(240)} style={s.connectCardRow}>
            <View style={[s.connectIcon, { borderColor: colors.border }]}>
              <Ionicons name="business-outline" size={20} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.connectTitle}>Connect Xero for true profit</Text>
              <Text style={s.connectBodySm}>Reconcile Square payouts against bank deposits for real margins, expenses and GST.</Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Reconciliation */}
        {reconciliation ? (
          <Section
            title="Payout Reconciliation"
            right={reconciliation.match ? 'Matched' : 'Mismatch'}
            s={s}
          >
            <View style={s.statGrid}>
              {[
                ['Square Payouts', reconciliation.square_payouts, colors.text],
                ['Xero Deposits', reconciliation.xero_bank_deposits, colors.text],
                ['Difference', reconciliation.diff, reconciliation.match ? colors.success : colors.error],
              ].map(([label, val, color], i) => (
                <View key={i} style={[s.statCell, { flexBasis: '33.33%' }]}>
                  <Text style={s.statLabel}>{label}</Text>
                  <Text style={[s.statValue, { color }]}>{money(val)}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    refreshBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent + '18' },

    rangeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    rangeChip: { paddingHorizontal: 16, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    rangeChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    statusGroup: { flexDirection: 'row', gap: 14 },
    statusDot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    statusValue: { fontSize: 12, fontWeight: '600' },
    periodText: { fontSize: 11.5, color: c.textMuted, fontWeight: '600' },

    // Connect empty cards
    connectCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 18, alignItems: 'flex-start' },
    connectCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, marginTop: 16 },
    connectIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    connectTitle: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    connectBody: { fontSize: 13, color: c.textSecondary, marginTop: 6, lineHeight: 19 },
    connectBodySm: { fontSize: 12.5, color: c.textSecondary, marginTop: 4, lineHeight: 18 },

    // Hero
    hero: { backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 18 },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, color: c.textMuted, textTransform: 'uppercase' },
    healthPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    healthPillText: { fontSize: 12, fontWeight: '800' },
    heroValue: { fontSize: 34, fontWeight: '800', color: c.text, letterSpacing: -1, marginTop: 10 },
    heroSub: { fontSize: 14, fontWeight: '700', marginTop: 4 },
    heroHeadline: { fontSize: 13, color: c.textSecondary, marginTop: 12, lineHeight: 19 },

    // Metric grid
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
    metricCard: { flexBasis: '47.8%', flexGrow: 1, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14 },
    metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    metricLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: c.textMuted, textTransform: 'uppercase', flexShrink: 1 },
    metricValue: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.5, marginTop: 8 },
    metricSub: { fontSize: 11.5, color: c.textSecondary, marginTop: 4, fontWeight: '600' },

    // Section
    section: { marginTop: 20 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: c.text, letterSpacing: 0.2, textTransform: 'uppercase' },
    sectionRight: { fontSize: 12, fontWeight: '700', color: c.textMuted },

    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    emptyLine: { fontSize: 12.5, color: c.textMuted, textAlign: 'center', paddingVertical: 10, lineHeight: 18 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, marginTop: 12, paddingTop: 12 },

    insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    insightText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 19, fontWeight: '500' },

    // Bars
    barRow: { marginBottom: 14 },
    barHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    barLabel: { fontSize: 13, fontWeight: '700', color: c.text, flexShrink: 1 },
    barRight: { fontSize: 12.5, color: c.textSecondary, fontWeight: '600' },
    barTrack: { height: 7, borderRadius: 4, backgroundColor: c.bg, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },

    // Items
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    itemRank: { fontSize: 12, fontWeight: '800', color: c.textMuted, width: 16, textAlign: 'center' },
    itemName: { fontSize: 14, fontWeight: '700', color: c.text },
    itemSub: { fontSize: 11.5, color: c.textMuted, marginTop: 2, fontWeight: '600' },
    itemAmt: { fontSize: 14, fontWeight: '800', color: c.text },

    // Trend
    trendChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, paddingBottom: 2 },
    trendBar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 3, opacity: 0.9 },
    trendAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    axisText: { fontSize: 11, color: c.textMuted, fontWeight: '600' },

    // Stat grid (Xero / reconciliation)
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    statCell: { flexBasis: '33.33%', flexGrow: 1, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    statLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3, color: c.textMuted, textTransform: 'uppercase' },
    statValue: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3, marginTop: 6 },
  });
}
