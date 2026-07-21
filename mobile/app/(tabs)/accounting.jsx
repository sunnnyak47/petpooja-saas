/**
 * Accounting — read-only owner books snapshot.
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated
 *
 * The five questions an owner actually asks, for the SELECTED outlet: how am I
 * doing (profit / revenue), what tax do I owe (BAS/GST), who owes me
 * (receivables), what do I owe (payables) and where does my money go (expenses).
 * Everything is READ-ONLY — no writes. Data + pure transforms live in
 * src/hooks/useAccounting.js + src/lib/accounting.js; every request is
 * outlet-scoped. VIEW_REPORTS gated on the backend — a 403 is surfaced kindly.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import { useAccounting } from '../../src/hooks/useAccounting';
import {
  buildKpis,
  taxLabel,
  topReceivables,
  receivableSeverity,
  dueInLabel,
  timeAgo,
} from '../../src/lib/accounting';

const toneColor = (tone, c) =>
  tone === 'positive' ? c.success : tone === 'negative' ? c.error : c.accent;

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ kpi, colors, s, fmt }) {
  const tint = toneColor(kpi.tone, colors);
  return (
    <View style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: tint + '1e' }]}>
        <Ionicons name={kpi.icon} size={16} color={tint} />
      </View>
      <Text style={s.kpiLabel} numberOfLines={1}>{kpi.label}</Text>
      <Text style={[s.kpiValue, { color: tint }]} numberOfLines={1}>{fmt(kpi.amount)}</Text>
      {kpi.key === 'profit' ? (
        <Text style={[s.kpiCaption, { color: toneColor(kpi.deltaTone, colors) }]} numberOfLines={1}>
          {kpi.caption === '—' ? 'vs last month' : `${kpi.caption} vs last month`}
        </Text>
      ) : (
        <Text style={s.kpiCaption} numberOfLines={1}>
          {kpi.key === 'bas' && kpi.due ? dueInLabel(kpi.due) : kpi.caption}
        </Text>
      )}
    </View>
  );
}

// ─── Receivable row ──────────────────────────────────────────────────────────
function ReceivableRow({ item, colors, s, fmt }) {
  const sev = receivableSeverity(item.days);
  const tint = toneColor(sev.tone, colors);
  return (
    <View style={s.recRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.recCustomer} numberOfLines={1}>{item.customer}</Text>
        <View style={s.recMeta}>
          {item.ref ? <Text style={s.recRef} numberOfLines={1}>{item.ref}</Text> : null}
          <View style={[s.recPill, { backgroundColor: tint + '1e' }]}>
            <Text style={[s.recPillText, { color: tint }]}>{sev.label}</Text>
          </View>
        </View>
      </View>
      <Text style={s.recAmount} numberOfLines={1}>{fmt(item.amount)}</Text>
    </View>
  );
}

// ─── Small secondary stat ────────────────────────────────────────────────────
function MiniStat({ icon, label, value, colors, s }) {
  return (
    <View style={s.miniStat}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.miniLabel} numberOfLines={1}>{label}</Text>
        <Text style={s.miniValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function AccountingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { fmt, isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    dashboard, receivables, isLoading, isError, error,
    isRefetching, refetch, hasOutlet, outletName,
  } = useAccounting();

  const kpis = useMemo(() => (dashboard ? buildKpis(dashboard) : []), [dashboard]);
  const recList = useMemo(() => topReceivables(receivables?.items || [], 5), [receivables]);

  const isForbidden = error?.message && /permission|forbidden|403/i.test(error.message);
  const outletTitle = outletName || 'Selected outlet';

  const Header = (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'} · READ ONLY</Text>
          <Text style={s.title}>Accounting</Text>
          <Text style={s.subtitle} numberOfLines={1}>Owner books · {outletTitle}</Text>
        </View>
        <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
          <Ionicons name="book-outline" size={13} color={colors.accent} />
        </View>
      </View>
    </SafeAreaView>
  );

  // ── Non-content states ──
  if (!hasOutlet) {
    return (
      <View style={s.root}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {Header}
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its books." />
      </View>
    );
  }
  if (isLoading) {
    return (
      <View style={s.root}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {Header}
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={s.root}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {Header}
        <EmptyState
          icon={isForbidden ? '🔒' : '⚠️'}
          title={isForbidden ? "You can't view the books" : "Couldn't load accounting"}
          subtitle={isForbidden
            ? 'Ask an owner or manager for reports access (VIEW_REPORTS).'
            : 'Something went wrong. Pull to refresh or retry.'}
          action={{ label: 'Retry', onPress: refetch }}
        />
      </View>
    );
  }

  const d = dashboard;
  const noBooks = d && !d.has_data;

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      {Header}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {d?.period?.month_label ? (
          <Text style={s.periodLabel}>{d.period.month_label}</Text>
        ) : null}

        {noBooks ? (
          <View style={s.notice}>
            <Ionicons name="information-circle-outline" size={17} color={colors.accent} />
            <Text style={s.noticeText}>
              No accounting activity yet for this outlet. Figures will fill in once orders and bills post to the ledger.
            </Text>
          </View>
        ) : null}

        {/* KPI grid */}
        <Animated.View entering={FadeInDown.duration(260)} style={s.kpiGrid}>
          {kpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} colors={colors} s={s} fmt={fmt} />
          ))}
        </Animated.View>

        {/* Secondary stats: gross profit, payables, expenses */}
        <Animated.View entering={FadeInDown.duration(300).delay(60)} style={s.miniRow}>
          <MiniStat icon="pricetag-outline" label="Gross profit" value={fmt(d?.profit?.gross_profit)} colors={colors} s={s} />
          <MiniStat icon="arrow-up-circle-outline" label={`I owe (${d?.payables?.count ?? 0})`} value={fmt(d?.payables?.total)} colors={colors} s={s} />
          <MiniStat icon="wallet-outline" label="Expenses" value={fmt(d?.expenses?.total)} colors={colors} s={s} />
        </Animated.View>

        {/* Receivables short list */}
        <Animated.View entering={FadeInDown.duration(320).delay(120)}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Who owes me</Text>
            {receivables?.total ? <Text style={s.sectionTotal}>{fmt(receivables.total)}</Text> : null}
          </View>

          {recList.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={s.emptyCardText}>Nothing outstanding — every order is paid.</Text>
            </View>
          ) : (
            <View style={s.recCard}>
              {recList.map((item, i) => (
                <View key={`${item.ref}-${i}`}>
                  {i > 0 ? <View style={s.recDivider} /> : null}
                  <ReceivableRow item={item} colors={colors} s={s} fmt={fmt} />
                </View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* BAS/GST caption */}
        {d?.tax ? (
          <Animated.View entering={FadeInDown.duration(340).delay(160)} style={s.basCard}>
            <Ionicons name="document-text-outline" size={16} color={colors.textMuted} />
            <Text style={s.basText}>
              {taxLabel(d.tax)} · {d.tax.quarter_label}
              {d.tax.due_date ? ` · ${dueInLabel(d.tax.due_date)}` : ''}
            </Text>
            <Text style={s.basAmount}>{fmt(d.tax.amount)}</Text>
          </Animated.View>
        ) : null}

        {d?.generated_at ? (
          <Text style={s.freshness}>Updated {timeAgo(d.generated_at)}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 2 },

    periodLabel: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },

    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.accent + '12', borderRadius: 12, borderWidth: 1, borderColor: c.accent + '33', padding: 12, marginBottom: 14 },
    noticeText: { flex: 1, fontSize: 12.5, color: c.textSecondary, lineHeight: 18, fontWeight: '500' },

    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpiCard: { width: '48%', flexGrow: 1, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    kpiIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    kpiLabel: { fontSize: 12, color: c.textMuted, fontWeight: '700' },
    kpiValue: { fontSize: 21, fontWeight: '800', letterSpacing: -0.6, marginTop: 3 },
    kpiCaption: { fontSize: 11.5, color: c.textMuted, fontWeight: '600', marginTop: 4 },

    miniRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    miniStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.card, borderRadius: 13, borderWidth: 1, borderColor: c.border, padding: 10 },
    miniLabel: { fontSize: 10.5, color: c.textMuted, fontWeight: '700' },
    miniValue: { fontSize: 14, color: c.text, fontWeight: '800', letterSpacing: -0.3, marginTop: 1 },

    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    sectionTotal: { fontSize: 15, fontWeight: '800', color: c.accent, letterSpacing: -0.3 },

    recCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 },
    recDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
    recCustomer: { fontSize: 14.5, fontWeight: '700', color: c.text, letterSpacing: -0.2 },
    recMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    recRef: { fontSize: 11.5, color: c.textMuted, fontWeight: '600', flexShrink: 1 },
    recPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    recPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 },
    recAmount: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.3 },

    emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16 },
    emptyCardText: { flex: 1, fontSize: 13.5, color: c.textSecondary, fontWeight: '500' },

    basCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 13, marginTop: 18 },
    basText: { flex: 1, fontSize: 12.5, color: c.textSecondary, fontWeight: '600' },
    basAmount: { fontSize: 14.5, fontWeight: '800', color: c.text, letterSpacing: -0.3 },

    freshness: { fontSize: 11, color: c.textMuted, fontWeight: '600', textAlign: 'center', marginTop: 18 },
  });
}
