/**
 * Payroll — "Pay runs, PAYG & superannuation".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * A mobile viewer for the SELECTED outlet's pay runs: browse each period with its
 * gross / PAYG / super / net totals and payslip count, then tap a run to see the
 * per-employee payslips inside a bottom sheet. Data + pure transforms live in
 * src/hooks/usePayroll.js; every request is outlet-scoped. Read-only — creating &
 * finalising pay runs stays on the web app. PAYG shown here is a simplified
 * estimate, not ATO-lodged.
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
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import {
  usePayroll,
  usePayRunDetail,
  filterPayRuns,
  formatMoney,
  periodLabel,
  payslipCount,
  statusLabel,
  isFinalised,
  sumPayslips,
  PR_STATUS,
} from '../../src/hooks/usePayroll';

const statusTone = (status, colors) => (isFinalised({ status }) ? colors.success : colors.warning);

function fmtDate(ts, locale = 'en-AU') {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

// ─── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ status, colors, s }) {
  const tone = statusTone(status, colors);
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{statusLabel(status)}</Text>
    </View>
  );
}

// ─── Small labelled money stat (used in card + sheet) ───────────────────────
function MiniStat({ label, value, tone, s }) {
  return (
    <View style={s.miniStat}>
      <Text style={s.miniLabel}>{label}</Text>
      <Text style={[s.miniValue, tone && { color: tone }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── One pay-run row ────────────────────────────────────────────────────────
function PayRunRow({ run, colors, currency, locale, s, onOpen }) {
  const count = payslipCount(run);
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(run)}>
        <View style={s.cardTop}>
          <Text style={s.period} numberOfLines={1}>{periodLabel(run, locale)}</Text>
          <StatusPill status={run.status} colors={colors} s={s} />
        </View>
        <View style={s.cardMetaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text style={s.cardMeta} numberOfLines={1}>
            Pay {fmtDate(run.pay_date, locale)} · {count} payslip{count === 1 ? '' : 's'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
        </View>

        <View style={s.miniRow}>
          <MiniStat label="Gross" value={formatMoney(currency, run.gross_total)} s={s} />
          <MiniStat label="PAYG" value={formatMoney(currency, run.paye_total)} tone={colors.error} s={s} />
          <MiniStat label="Super" value={formatMoney(currency, run.super_total)} tone={colors.accent} s={s} />
          <MiniStat label="Net" value={formatMoney(currency, run.net_total)} tone={colors.success} s={s} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── One payslip line ───────────────────────────────────────────────────────
function PayslipRow({ slip, currency, colors, s }) {
  return (
    <View style={s.slipRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.slipName} numberOfLines={1}>{slip.staff_name || 'Employee'}</Text>
        <Text style={s.slipSub} numberOfLines={1}>
          Gross {formatMoney(currency, slip.gross)} · PAYG {formatMoney(currency, slip.paye)} · Super {formatMoney(currency, slip.super_amt)}
        </Text>
      </View>
      <Text style={[s.slipNet, { color: colors.success }]}>{formatMoney(currency, slip.net)}</Text>
    </View>
  );
}

// ─── Detail bottom sheet (payslips) ─────────────────────────────────────────
function DetailSheet({ run, colors, currency, locale, s, onClose }) {
  const { payRun, payslips, isLoading, isError, refetch } = usePayRunDetail(run?.id);
  const view = payRun || run; // fall back to the list row while detail loads
  const totals = useMemo(() => sumPayslips(payslips), [payslips]);

  return (
    <Modal visible={!!run} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          {run ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{periodLabel(view, locale)}</Text>
                  <Text style={s.sheetSub}>Pay date {fmtDate(view.pay_date, locale)}</Text>
                </View>
                <StatusPill status={view.status} colors={colors} s={s} />
              </View>

              <Text style={s.sheetAmount}>{formatMoney(currency, view.net_total)}</Text>
              <Text style={s.sheetAmountLabel}>Net pay this run</Text>

              <View style={s.summaryGrid}>
                <MiniStat label="Gross" value={formatMoney(currency, view.gross_total)} s={s} />
                <MiniStat label="PAYG" value={formatMoney(currency, view.paye_total)} tone={colors.error} s={s} />
                <MiniStat label="Super" value={formatMoney(currency, view.super_total)} tone={colors.accent} s={s} />
              </View>

              <Text style={s.linesTitle}>Payslips</Text>

              {isLoading ? (
                <View style={s.sheetLoading}><ActivityIndicator size="small" color={colors.accent} /></View>
              ) : isError ? (
                <TouchableOpacity style={s.retryInline} onPress={refetch} activeOpacity={0.85}>
                  <Ionicons name="refresh" size={15} color={colors.accent} />
                  <Text style={[s.retryInlineText, { color: colors.accent }]}>Couldn't load payslips — retry</Text>
                </TouchableOpacity>
              ) : payslips.length === 0 ? (
                <Text style={s.emptyLines}>No payslips on this pay run.</Text>
              ) : (
                <View style={s.linesBox}>
                  {payslips.map((p, i) => (
                    <PayslipRow key={p.id || i} slip={p} currency={currency} colors={colors} s={s} />
                  ))}
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>TOTAL</Text>
                    <Text style={[s.totalNet, { color: colors.success }]}>{formatMoney(currency, totals.net)}</Text>
                  </View>
                </View>
              )}

              <Text style={s.disclaimer}>PAYG is a simplified estimate; not ATO-lodged.</Text>

              <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function PayrollScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU, currency, locale } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const cur = currency || 'AUD';
  const loc = locale || 'en-AU';

  const { rows, stats, isLoading, isError, isRefetching, refetch, hasOutlet } = usePayroll();

  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => filterPayRuns(rows, { status }), [rows, status]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={s.summaryValue}>{stats.count}</Text>
          <Text style={s.summaryLabel}>Pay runs</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.text, fontSize: 17 }]}>{formatMoney(cur, stats.gross)}</Text>
          <Text style={s.summaryLabel}>Gross</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.success, fontSize: 17 }]}>{formatMoney(cur, stats.net)}</Text>
          <Text style={s.summaryLabel}>Net paid</Text>
        </View>
      </View>

      <View style={s.filterRow}>
        {['all', PR_STATUS.DRAFT, PR_STATUS.FINALISED].map((k) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, status === k && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => setStatus(k)}
            activeOpacity={0.85}
          >
            <Text style={[s.filterChipText, status === k && { color: '#fff' }]}>
              {k === 'all' ? 'All' : statusLabel(k)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Payroll</Text>
            <Text style={s.subtitle} numberOfLines={1}>Pay runs, PAYG & super · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="cash-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{stats.count}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its pay runs." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load payroll" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(r) => r.id}
          estimatedItemSize={150}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState icon="💸" title="No pay runs yet" subtitle="Create a pay run on the web app and it will appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No pay runs match this filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <PayRunRow run={item} colors={colors} currency={cur} locale={loc} s={s} onOpen={setSelected} />
            </View>
          )}
        />
      )}

      <DetailSheet
        run={selected}
        colors={colors}
        currency={cur}
        locale={loc}
        s={s}
        onClose={() => setSelected(null)}
      />
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
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    summaryCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16 },
    summaryStat: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 22, fontWeight: '800', color: c.accent, letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Pay-run card
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    period: { flex: 1, fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
    cardMeta: { fontSize: 12.5, color: c.textMuted, fontWeight: '600', flexShrink: 1 },

    miniRow: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    miniStat: { flex: 1, minWidth: 0 },
    miniLabel: { fontSize: 10, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    miniValue: { fontSize: 13.5, color: c.text, fontWeight: '800', marginTop: 3, letterSpacing: -0.3 },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // Bottom sheet
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '88%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    sheetTitle: { fontSize: 19, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    sheetAmount: { fontSize: 30, fontWeight: '800', color: c.success, letterSpacing: -0.8, marginTop: 8 },
    sheetAmountLabel: { fontSize: 12, color: c.textMuted, fontWeight: '600', marginTop: 2, marginBottom: 14 },

    summaryGrid: { flexDirection: 'row', gap: 10, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14 },

    linesTitle: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 18, marginBottom: 8 },
    linesBox: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 },
    slipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    slipName: { fontSize: 14.5, fontWeight: '700', color: c.text },
    slipSub: { fontSize: 11.5, color: c.textMuted, marginTop: 3, fontWeight: '500' },
    slipNet: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
    totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
    totalLabel: { fontSize: 12, fontWeight: '800', color: c.text, letterSpacing: 0.4 },
    totalNet: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },

    sheetLoading: { paddingVertical: 24, alignItems: 'center' },
    emptyLines: { fontSize: 13, color: c.textMuted, fontWeight: '500', paddingVertical: 16, textAlign: 'center' },
    retryInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
    retryInlineText: { fontSize: 13.5, fontWeight: '700' },

    disclaimer: { fontSize: 11.5, color: c.textMuted, fontWeight: '500', marginTop: 16, textAlign: 'center' },

    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 14 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
