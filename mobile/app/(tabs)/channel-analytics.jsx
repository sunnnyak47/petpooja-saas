/**
 * Channel Analytics — "Sales by channel".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated.
 *
 * Read-only performance breakdown for the SELECTED outlet across every sales
 * channel: delivery aggregators (Uber Eats / DoorDash / Menulog / Swiggy /
 * Zomato) plus Dine-in, QR, Takeaway and Direct/Online. Shows headline KPIs
 * (orders / gross / commission / net), a per-channel card list with a gross-share
 * bar, a daily gross trend strip, and top-selling items scoped to a channel.
 * Data + pure transforms live in src/hooks/useChannelAnalytics.js; every request
 * is outlet-scoped.
 */
import React, { useMemo, useCallback } from 'react';
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
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import {
  useChannelAnalytics,
  CA_RANGES,
  channelColor,
  monogram,
  dailyTotals,
  num,
} from '../../src/hooks/useChannelAnalytics';

const COST_TONE = '#ef4444';

const fmtPct = (v) => `${num(v).toFixed(1)}%`;
const fmtInt = (v) => Math.round(num(v)).toLocaleString();

// ─── Channel avatar (monogram tile) ───────────────────────────────────────────
function ChannelDot({ channel, label, size = 30, s }) {
  const color = channelColor(channel);
  return (
    <View style={[s.dot, { width: size, height: size, borderRadius: size / 3, backgroundColor: color + '22' }]}>
      <Text style={[s.dotText, { color, fontSize: size * 0.42 }]}>{monogram(label || channel)}</Text>
    </View>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, icon, tone, s }) {
  return (
    <View style={s.kpi}>
      <View style={[s.kpiIcon, { backgroundColor: tone + '18' }]}>
        <Ionicons name={icon} size={16} color={tone} />
      </View>
      <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {sub ? <Text style={s.kpiSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

// ─── One channel card ─────────────────────────────────────────────────────────
function ChannelCard({ row, maxGross, totalGross, fmtFull, colors, s }) {
  const gross = num(row.gross);
  const barPct = Math.max(2, (gross / Math.max(1, maxGross)) * 100);
  const share = totalGross ? (gross / totalGross) * 100 : 0;
  const color = channelColor(row.channel);

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <ChannelDot channel={row.channel} label={row.label} s={s} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.chName} numberOfLines={1}>{row.label || row.channel}</Text>
          <Text style={s.chMeta} numberOfLines={1}>
            {fmtInt(row.orders)} orders · {fmtFull(row.aov)} AOV
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.chGross} numberOfLines={1}>{fmtFull(gross)}</Text>
          <Text style={s.chShare}>{share.toFixed(0)}% of gross</Text>
        </View>
      </View>

      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${barPct}%`, backgroundColor: color }]} />
      </View>

      <View style={s.chStats}>
        <Stat
          icon="close-circle-outline"
          label="Cancel"
          value={fmtPct(row.cancel_rate)}
          tone={num(row.cancel_rate) > 0 ? COST_TONE : colors.textSecondary}
          s={s}
        />
        <Stat icon="time-outline" label="Prep" value={`${Math.round(num(row.avg_prep_min))}m`} tone={colors.textSecondary} s={s} />
        <Stat
          icon="pricetag-outline"
          label="Comm"
          value={num(row.commission_amount) > 0 ? `-${fmtFull(row.commission_amount)}` : fmtFull(0)}
          tone={num(row.commission_amount) > 0 ? COST_TONE : colors.textSecondary}
          s={s}
        />
        <Stat icon="wallet-outline" label="Net" value={fmtFull(row.net)} tone={colors.success} s={s} />
      </View>
    </View>
  );
}

function Stat({ icon, label, value, tone, s }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={13} color={tone} style={{ marginBottom: 3 }} />
      <Text style={[s.statValue, { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Daily gross trend strip ──────────────────────────────────────────────────
function TrendStrip({ trend, fmtFull, colors, s }) {
  const { days, totals, peak, sum, max } = useMemo(() => dailyTotals(trend), [trend]);
  if (!days.length) {
    return <Text style={s.mutedNote}>No trend data for this range.</Text>;
  }
  return (
    <View>
      <View style={s.trendBars}>
        {totals.map((v, i) => (
          <View key={days[i] || i} style={s.trendCol}>
            <View style={[s.trendBar, { height: `${Math.max(3, (v / max) * 100)}%`, backgroundColor: colors.accent }]} />
          </View>
        ))}
      </View>
      <View style={s.trendAxis}>
        <Text style={s.trendAxisText}>{days[0]}</Text>
        <Text style={s.trendAxisText}>{days[days.length - 1]}</Text>
      </View>
      <View style={s.trendFooter}>
        <View style={s.trendFooterItem}>
          <Text style={s.trendFooterLabel}>Peak day</Text>
          <Text style={s.trendFooterValue}>{fmtFull(peak)}</Text>
        </View>
        <View style={s.trendFooterItem}>
          <Text style={s.trendFooterLabel}>Period total</Text>
          <Text style={s.trendFooterValue}>{fmtFull(sum)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ChannelAnalyticsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { fmtFull, isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    hasOutlet, rangeKey, setRangeKey,
    channel, setChannel,
    rows, totals, trend, topItems,
    isLoading, isError, isRefetching, refetch,
    isTrendLoading, isItemsLoading, isItemsError,
  } = useChannelAnalytics();

  const maxGross = useMemo(() => Math.max(1, ...rows.map((r) => num(r.gross))), [rows]);
  const outletName = currentOutlet?.name || 'Selected outlet';

  const onSelectChannel = useCallback((key) => setChannel((c) => (c === key ? 'all' : key)), [setChannel]);

  const Header = (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>CHANNELS · {isAU ? 'AU' : 'IN'}</Text>
          <Text style={s.title}>Channel Analytics</Text>
          <Text style={s.subtitle} numberOfLines={1}>Sales by channel · {outletName}</Text>
        </View>
        <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
          <Ionicons name="git-branch-outline" size={13} color={colors.accent} />
          <Text style={[s.headerBadgeText, { color: colors.accent }]}>{rows.length}</Text>
        </View>
      </View>

      <View style={s.rangeRow}>
        {CA_RANGES.map((r) => {
          const active = rangeKey === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[s.rangeChip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => setRangeKey(r.key)}
              activeOpacity={0.85}
            >
              <Text style={[s.rangeChipText, active && { color: '#fff' }]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );

  // Non-list states get the header + a centered message.
  if (!hasOutlet) {
    return (
      <View style={s.root}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {Header}
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its channel analytics." />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      {Header}

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load analytics" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {/* KPIs */}
          <Animated.View entering={FadeInDown.duration(240)} style={s.kpiGrid}>
            <Kpi label="Total Orders" value={fmtInt(totals.orders)} sub={`${rows.length} channels`} icon="bag-handle-outline" tone={colors.accent} s={s} />
            <Kpi label="Gross Sales" value={fmtFull(totals.gross)} icon="trending-up-outline" tone={colors.accent} s={s} />
            <Kpi label="Commission" value={fmtFull(totals.commission_amount)} sub="aggregator fees" icon="pricetags-outline" tone={COST_TONE} s={s} />
            <Kpi label="Net Revenue" value={fmtFull(totals.net)} sub="after commission" icon="wallet-outline" tone={colors.success} s={s} />
          </Animated.View>

          {rows.length === 0 ? (
            <EmptyState icon="📊" title="No channel data" subtitle="No orders in this range. Try a wider window above." />
          ) : (
            <>
              {/* Per-channel cards */}
              <Text style={s.sectionTitle}>Performance by Channel</Text>
              {rows.map((row) => (
                <Animated.View key={row.channel} entering={FadeInDown.duration(220)} style={{ marginBottom: 10 }}>
                  <ChannelCard row={row} maxGross={maxGross} totalGross={num(totals.gross)} fmtFull={fmtFull} colors={colors} s={s} />
                </Animated.View>
              ))}

              {/* Trend */}
              <Text style={s.sectionTitle}>Daily Gross Trend</Text>
              <View style={s.panel}>
                {isTrendLoading ? (
                  <ActivityIndicator color={colors.accent} style={{ paddingVertical: 24 }} />
                ) : (
                  <TrendStrip trend={trend} fmtFull={fmtFull} colors={colors} s={s} />
                )}
              </View>

              {/* Top items */}
              <Text style={s.sectionTitle}>Top Items</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.itemChips}
                style={{ marginBottom: 10 }}
              >
                <TouchableOpacity
                  style={[s.itemChip, channel === 'all' && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => setChannel('all')}
                  activeOpacity={0.85}
                >
                  <Text style={[s.itemChipText, channel === 'all' && { color: '#fff' }]}>All</Text>
                </TouchableOpacity>
                {rows.map((row) => {
                  const active = channel === row.channel;
                  return (
                    <TouchableOpacity
                      key={row.channel}
                      style={[s.itemChip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                      onPress={() => onSelectChannel(row.channel)}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.itemChipText, active && { color: '#fff' }]} numberOfLines={1}>{row.label || row.channel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={s.panel}>
                {isItemsLoading ? (
                  <ActivityIndicator color={colors.accent} style={{ paddingVertical: 24 }} />
                ) : isItemsError ? (
                  <Text style={s.mutedNote}>Couldn't load items.</Text>
                ) : topItems.length === 0 ? (
                  <Text style={s.mutedNote}>No items for this selection.</Text>
                ) : (
                  topItems.map((item, i) => (
                    <View key={`${item.name}-${i}`} style={[s.itemRow, i > 0 && s.itemRowBorder]}>
                      <Text style={s.itemRank}>{i + 1}</Text>
                      <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.itemQty}>{fmtInt(item.qty)} sold</Text>
                      <Text style={s.itemRevenue}>{fmtFull(item.revenue)}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, paddingBottom: 96 },

    header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    rangeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    rangeChip: { paddingHorizontal: 16, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    rangeChipText: { fontSize: 13, fontWeight: '800', color: c.textSecondary, letterSpacing: 0.3 },

    // KPI grid
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
    kpi: { flexGrow: 1, flexBasis: '46%', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    kpiIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    kpiValue: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    kpiLabel: { fontSize: 12.5, fontWeight: '700', color: c.text, marginTop: 2 },
    kpiSub: { fontSize: 11, color: c.textMuted, marginTop: 1, fontWeight: '600' },

    sectionTitle: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },

    // Channel card
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dot: { alignItems: 'center', justifyContent: 'center' },
    dotText: { fontWeight: '800' },
    chName: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    chMeta: { fontSize: 12, color: c.textSecondary, marginTop: 2, fontWeight: '600' },
    chGross: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    chShare: { fontSize: 11, color: c.textMuted, marginTop: 2, fontWeight: '600' },

    barTrack: { height: 8, borderRadius: 999, backgroundColor: c.pillBg, overflow: 'hidden', marginTop: 12 },
    barFill: { height: '100%', borderRadius: 999 },

    chStats: { flexDirection: 'row', marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 12 },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 12.5, fontWeight: '800', letterSpacing: -0.2 },
    statLabel: { fontSize: 10, color: c.textMuted, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

    // Panels
    panel: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16 },
    mutedNote: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 16, fontWeight: '600' },

    // Trend
    trendBars: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 3 },
    trendCol: { flex: 1, justifyContent: 'flex-end', height: '100%' },
    trendBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 3 },
    trendAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    trendAxisText: { fontSize: 10.5, color: c.textMuted, fontWeight: '600' },
    trendFooter: { flexDirection: 'row', gap: 24, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 12 },
    trendFooterItem: {},
    trendFooterLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    trendFooterValue: { fontSize: 15, fontWeight: '800', color: c.text, marginTop: 3, letterSpacing: -0.3 },

    // Top-item chips + rows
    itemChips: { gap: 8, paddingRight: 8 },
    itemChip: { paddingHorizontal: 14, height: 32, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', maxWidth: 160 },
    itemChipText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    itemRank: { width: 20, fontSize: 12, fontWeight: '800', color: c.textMuted, textAlign: 'center' },
    itemName: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    itemQty: { fontSize: 11.5, color: c.textMuted, fontWeight: '600' },
    itemRevenue: { fontSize: 14, fontWeight: '800', color: c.text, letterSpacing: -0.2, minWidth: 64, textAlign: 'right' },
  });
}
