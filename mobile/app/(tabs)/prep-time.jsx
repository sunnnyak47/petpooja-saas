/**
 * Prep Time — KDS cook-time analytics (mobile).
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated
 *
 * Read-only kitchen intelligence for the SELECTED outlet: headline KPIs (avg
 * prep time, fastest / slowest KOT, tickets analysed), SLA compliance per
 * station, the slowest & fastest menu items, and per-station cook-time cards.
 * Data + pure transforms live in src/hooks/usePrepTime.js; every request is
 * outlet-scoped. A range switch (1d/7d/30d/90d) re-queries the backend.
 */
import React, { useState, useMemo } from 'react';
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
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import {
  usePrepTime,
  RANGE_OPTIONS,
  stationMeta,
  slaColor,
  slowestItems,
  fastestItems,
} from '../../src/hooks/usePrepTime';

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, tone, s }) {
  return (
    <View style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: tone + '1e' }]}>
        <Ionicons name={icon} size={17} color={tone} />
      </View>
      <Text style={[s.kpiValue, { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

// ─── SLA station card ────────────────────────────────────────────────────────
function SlaCard({ row, s }) {
  const meta = stationMeta(row.station);
  const tone = slaColor(row.compliance_pct);
  const pct = Math.min(100, Math.max(0, Number(row.compliance_pct) || 0));
  return (
    <View style={[s.slaCard, { borderLeftColor: meta.color, borderLeftWidth: 3 }]}>
      <View style={s.slaHead}>
        <Ionicons name={meta.icon} size={14} color={meta.color} />
        <Text style={s.slaStation}>{meta.label}</Text>
      </View>
      <Text style={[s.slaPct, { color: tone }]}>{row.compliance_pct}%</Text>
      <Text style={s.slaTarget}>Within {row.sla_target_fmt} target</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
      <View style={s.slaFoot}>
        <Text style={[s.slaFootText, { color: '#22c55e' }]}>✓ {row.within_sla} on time</Text>
        <Text style={[s.slaFootText, { color: '#ef4444' }]}>✗ {row.breached} late</Text>
      </View>
    </View>
  );
}

// ─── Item bar row ────────────────────────────────────────────────────────────
function ItemRow({ item, maxSecs, tone, s }) {
  const meta = stationMeta(item.station);
  const pct = maxSecs > 0 ? Math.min(100, ((item.avg_secs || 0) / maxSecs) * 100) : 0;
  return (
    <View style={s.itemRow}>
      <View style={s.itemTop}>
        <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
        <View style={s.itemRight}>
          <View style={[s.stationTag, { backgroundColor: meta.color + '1e' }]}>
            <Text style={[s.stationTagText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={[s.itemAvg, { color: tone }]}>{item.avg_fmt}</Text>
        </View>
      </View>
      <View style={s.barTrackThin}>
        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
    </View>
  );
}

// ─── Station cook-time card ──────────────────────────────────────────────────
function StationCard({ row, s }) {
  const meta = stationMeta(row.station);
  return (
    <View style={s.stationCard}>
      <View style={s.stationCardHead}>
        <View style={[s.stationIcon, { backgroundColor: meta.color + '1e' }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.stationTitle}>{meta.label}</Text>
          <Text style={s.stationSub}>{row.kots_completed} KOTs · {row.items_processed} items</Text>
        </View>
      </View>
      <View style={s.stationMetrics}>
        <View style={s.stationMetric}>
          <Text style={s.stationMetricLabel}>Avg total</Text>
          <Text style={s.stationMetricValue}>{row.avg_total_fmt}</Text>
          <Text style={s.stationMetricHint}>open → done</Text>
        </View>
        <View style={s.stationMetricDivider} />
        <View style={s.stationMetric}>
          <Text style={s.stationMetricLabel}>Avg cook</Text>
          <Text style={s.stationMetricValue}>{row.avg_cook_fmt}</Text>
          <Text style={s.stationMetricHint}>start → done</Text>
        </View>
      </View>
    </View>
  );
}

function SectionTitle({ icon, tone, children, s }) {
  return (
    <View style={s.sectionTitleRow}>
      <Ionicons name={icon} size={15} color={tone} />
      <Text style={s.sectionTitle}>{children}</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function PrepTimeScreen() {
  const { colors } = useTheme();
  const { isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [range, setRange] = useState('7d');
  const {
    summary, stations, items, sla, outletName,
    isLoading, isError, isRefetching, refetch, hasOutlet,
  } = usePrepTime(range);

  const slowest = useMemo(() => slowestItems(items, 5), [items]);
  const fastest = useMemo(() => fastestItems(items, 5), [items]);
  const maxItemSecs = items[0]?.avg_secs || 1;
  const hasData = (summary.total_kots ?? 0) > 0;

  const RangeBar = (
    <View style={s.rangeBar}>
      {RANGE_OPTIONS.map((r) => (
        <TouchableOpacity
          key={r}
          style={[s.rangeChip, range === r && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          onPress={() => setRange(r)}
          activeOpacity={0.85}
        >
          <Text style={[s.rangeChipText, range === r && { color: '#fff' }]}>{r}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>KDS · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Prep Time</Text>
            <Text style={s.subtitle} numberOfLines={1}>Cook-time analytics · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="timer-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{summary.total_kots ?? 0}</Text>
          </View>
        </View>
        {hasOutlet ? <View style={s.rangeWrap}>{RangeBar}</View> : null}
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its prep-time analytics." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load analytics" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : !hasData ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        >
          <EmptyState icon="👨‍🍳" title="No completed KOTs" subtitle="No kitchen tickets were completed in this period. Try a wider range." />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        >
          {/* KPI grid */}
          <Animated.View entering={FadeInDown.duration(260)} style={s.kpiGrid}>
            <KpiCard icon="timer-outline"     label="Avg prep time" value={summary.avg_fmt || '—'}     tone={colors.accent} s={s} />
            <KpiCard icon="flash-outline"     label="Fastest KOT"   value={summary.fastest_fmt || '—'} tone="#22c55e"     s={s} />
            <KpiCard icon="flame-outline"     label="Slowest KOT"   value={summary.slowest_fmt || '—'} tone="#ef4444"     s={s} />
            <KpiCard icon="bar-chart-outline" label="KOTs analysed" value={String(summary.total_kots ?? 0)} tone="#f97316" s={s} />
          </Animated.View>

          {/* SLA compliance */}
          {sla.length > 0 ? (
            <View style={s.section}>
              <SectionTitle icon="checkmark-circle-outline" tone={colors.accent} s={s}>SLA compliance by station</SectionTitle>
              <View style={s.slaGrid}>
                {sla.map((row) => <SlaCard key={row.station} row={row} s={s} />)}
              </View>
            </View>
          ) : null}

          {/* Slowest items */}
          {slowest.length > 0 ? (
            <View style={s.section}>
              <SectionTitle icon="flame-outline" tone="#ef4444" s={s}>Slowest items (avg)</SectionTitle>
              <View style={s.card}>
                {slowest.map((item, i) => (
                  <ItemRow key={`sl-${i}`} item={item} maxSecs={maxItemSecs} tone="#ef4444" s={s} />
                ))}
              </View>
            </View>
          ) : null}

          {/* Fastest items */}
          {fastest.length > 0 ? (
            <View style={s.section}>
              <SectionTitle icon="flash-outline" tone="#22c55e" s={s}>Fastest items (avg)</SectionTitle>
              <View style={s.card}>
                {fastest.map((item, i) => (
                  <ItemRow key={`fa-${i}`} item={item} maxSecs={maxItemSecs} tone="#22c55e" s={s} />
                ))}
              </View>
            </View>
          ) : null}

          {/* Station cook-time cards */}
          {stations.length > 0 ? (
            <View style={s.section}>
              <SectionTitle icon="restaurant-outline" tone={colors.accent} s={s}>By kitchen station</SectionTitle>
              {stations.map((row) => <StationCard key={row.station} row={row} s={s} />)}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    rangeWrap: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.headerBg },
    rangeBar: { flexDirection: 'row', gap: 8 },
    rangeChip: { flex: 1, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    rangeChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // KPI grid
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpiCard: { flexGrow: 1, flexBasis: '47%', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    kpiIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    kpiLabel: { fontSize: 11.5, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    section: { marginTop: 22 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2 },

    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, gap: 14 },

    // SLA
    slaGrid: { gap: 10 },
    slaCard: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14 },
    slaHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    slaStation: { fontSize: 13.5, fontWeight: '800', color: c.text },
    slaPct: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
    slaTarget: { fontSize: 11.5, color: c.textMuted, marginBottom: 8, fontWeight: '600' },
    slaFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    slaFootText: { fontSize: 11.5, fontWeight: '700' },

    // bars
    barTrack: { height: 8, borderRadius: 999, backgroundColor: c.pillBg, overflow: 'hidden' },
    barTrackThin: { height: 6, borderRadius: 999, backgroundColor: c.pillBg, overflow: 'hidden', marginTop: 8 },
    barFill: { height: '100%', borderRadius: 999 },

    // item rows
    itemRow: {},
    itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    itemName: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
    itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stationTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    stationTagText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 },
    itemAvg: { fontSize: 14.5, fontWeight: '800', minWidth: 52, textAlign: 'right' },

    // station cards
    stationCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 10 },
    stationCardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    stationIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    stationTitle: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    stationSub: { fontSize: 12, color: c.textMuted, marginTop: 2, fontWeight: '600' },
    stationMetrics: { flexDirection: 'row', backgroundColor: c.pillBg, borderRadius: 12, paddingVertical: 12 },
    stationMetric: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    stationMetricDivider: { width: 1, backgroundColor: c.border, marginVertical: 2 },
    stationMetricLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    stationMetricValue: { fontSize: 19, fontWeight: '800', color: c.text, marginTop: 4, letterSpacing: -0.4 },
    stationMetricHint: { fontSize: 10.5, color: c.textMuted, marginTop: 2, fontWeight: '600' },
  });
}
