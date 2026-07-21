/**
 * Settlements — "Payouts & reconciliation" (read-only).
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * Payment / aggregator settlement batches for the SELECTED outlet: a summary
 * header (net settled · pending · count), a filterable list (channel, amount,
 * status, date), and a tap-through detail sheet showing header totals + the
 * reconciliation lines. Every request is outlet-scoped. This screen is strictly
 * read-only — importing / reconciling / closing live on the web dashboard
 * (MANAGE_PAYMENTS). Data + pure transforms live in src/hooks/useSettlements.js
 * and src/lib/settlements.js.
 */
import React, { useState, useMemo, useCallback } from 'react';
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
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import { useSettlements, useSettlementDetail } from '../../src/hooks/useSettlements';
import {
  filterSettlements,
  statusMeta,
  matchStatusMeta,
  providerLabel,
  providerIconName,
  settlementAmount,
  settlementDate,
  settlementRef,
  totalSettled,
  pendingCount,
  settlementCount,
  lineTypeLabel,
  fmtDate,
  formatMoney,
} from '../../src/lib/settlements';

const STATUS_FILTERS = ['all', 'open', 'matched', 'variance', 'closed'];

// Map a pure-lib "tone" to an actual theme color.
function toneColor(tone, colors) {
  switch (tone) {
    case 'success': return colors.success;
    case 'warning': return colors.warning;
    case 'error': return colors.error;
    case 'accent': return colors.accent;
    default: return colors.textMuted;
  }
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ status, colors, s }) {
  const { label, tone } = statusMeta(status);
  const c = toneColor(tone, colors);
  return (
    <View style={[s.pill, { backgroundColor: c + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: c }]} />
      <Text style={[s.pillText, { color: c }]}>{label}</Text>
    </View>
  );
}

// ─── One settlement row ──────────────────────────────────────────────────────
function SettlementRow({ item, colors, s, fmtMoney, onOpen }) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(item)}>
        <View style={[s.channelIcon, { backgroundColor: colors.accent + '14' }]}>
          <Ionicons name={providerIconName(item.provider)} size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.channel} numberOfLines={1}>{providerLabel(item.provider)}</Text>
            <StatusPill status={item.status} colors={colors} s={s} />
          </View>
          <Text style={s.ref} numberOfLines={1}>Ref · {settlementRef(item)}</Text>
          <Text style={s.date}>{fmtDate(settlementDate(item))}</Text>
        </View>
        <View style={s.amountBox}>
          <Text style={s.amount} numberOfLines={1}>{fmtMoney(settlementAmount(item))}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Detail sheet ────────────────────────────────────────────────────────────
function DetailSheet({ base, colors, s, fmtMoney, onClose }) {
  const { settlement, isLoading, isError } = useSettlementDetail(base?.id);
  const data = settlement || base; // show list-known fields instantly, enrich with lines
  const lines = Array.isArray(settlement?.lines) ? settlement.lines : [];
  const cur = data?.currency;

  return (
    <Modal visible={!!base} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          {data ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{providerLabel(data.provider)}</Text>
                  <Text style={s.sheetSub}>{fmtDate(settlementDate(data))} · Ref {settlementRef(data)}</Text>
                </View>
                <StatusPill status={data.status} colors={colors} s={s} />
              </View>

              <Text style={s.sheetAmount}>{fmtMoney(settlementAmount(data))}</Text>
              <Text style={s.sheetAmountCaption}>Net settled</Text>

              <View style={s.detailRows}>
                {data.gross_amount != null ? <DetailRow label="Gross" value={formatMoney(cur, data.gross_amount)} s={s} /> : null}
                {data.fees != null ? <DetailRow label="Fees" value={formatMoney(cur, data.fees)} s={s} /> : null}
                {data.tax_on_fees != null ? <DetailRow label="Tax on fees" value={formatMoney(cur, data.tax_on_fees)} s={s} /> : null}
                {data.net_amount != null ? <DetailRow label="Net" value={formatMoney(cur, data.net_amount)} s={s} /> : null}
                {data.variance_amount != null ? (
                  <DetailRow
                    label="Variance"
                    value={formatMoney(cur, data.variance_amount)}
                    valueColor={Math.abs(Number(data.variance_amount) || 0) > 0.01 ? colors.error : colors.textSecondary}
                    s={s}
                  />
                ) : null}
                {data.line_count != null ? (
                  <DetailRow label="Lines" value={`${data.matched_count ?? 0} matched · ${data.unmatched_count ?? 0} unmatched`} s={s} />
                ) : null}
                {data.reconciled_at ? <DetailRow label="Reconciled" value={fmtDate(data.reconciled_at)} s={s} /> : null}
                {data.notes ? <DetailRow label="Notes" value={String(data.notes)} s={s} /> : null}
              </View>

              {isLoading ? (
                <View style={s.linesLoading}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={s.linesLoadingText}>Loading lines…</Text>
                </View>
              ) : isError ? (
                <Text style={s.linesError}>Couldn't load reconciliation lines.</Text>
              ) : lines.length > 0 ? (
                <View style={s.linesBox}>
                  <Text style={s.linesTitle}>Reconciliation lines · {lines.length}</Text>
                  {lines.map((l, i) => {
                    const meta = matchStatusMeta(l.match_status);
                    const c = toneColor(meta.tone, colors);
                    return (
                      <View key={l.id || i} style={s.lineRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.lineDesc} numberOfLines={1}>
                            {lineTypeLabel(l.type)}{l.transaction_id ? ` · ${l.transaction_id}` : ''}
                          </Text>
                          <Text style={[s.lineMeta, { color: c }]}>{meta.label}</Text>
                        </View>
                        <Text style={s.lineAmt}>{formatMoney(cur, l.amount)}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={s.linesEmpty}>No individual lines on this settlement.</Text>
              )}

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

function DetailRow({ label, value, valueColor, s }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, valueColor && { color: valueColor }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function SettlementsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU, fmt, fmtFull } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    rows, stats, isLoading, isError, isRefetching, refetch, hasOutlet,
  } = useSettlements();

  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => filterSettlements(rows, { status }), [rows, status]);

  const outletName = currentOutlet?.name || 'Selected outlet';
  const settled = totalSettled(stats);
  const pending = pendingCount(stats);
  const count = settlementCount(stats);

  const onOpen = useCallback((row) => setSelected(row), []);

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.success }]} numberOfLines={1}>{fmt(settled)}</Text>
          <Text style={s.summaryLabel}>Net settled</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.warning }]}>{pending}</Text>
          <Text style={s.summaryLabel}>Pending</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.text }]}>{count}</Text>
          <Text style={s.summaryLabel}>Settlements</Text>
        </View>
      </View>

      {Math.abs(Number(stats?.total_variance) || 0) > 0.01 ? (
        <View style={s.varianceChip}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
          <Text style={s.varianceText}>Open variance of {fmtFull(stats.total_variance)} across the period.</Text>
        </View>
      ) : null}

      <View style={s.filterRow}>
        {STATUS_FILTERS.map((k) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, status === k && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => setStatus(k)}
            activeOpacity={0.85}
          >
            <Text style={[s.filterChipText, status === k && { color: '#fff' }]}>
              {k === 'all' ? 'All' : statusMeta(k).label}
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
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Settlements</Text>
            <Text style={s.subtitle} numberOfLines={1}>Payouts & reconciliation · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="swap-horizontal-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{count}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its settlements." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load settlements" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={96}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState icon="🧾" title="No settlements yet" subtitle="Provider payout batches will appear here once imported." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No settlements match this filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <SettlementRow item={item} colors={colors} s={s} fmtMoney={fmtFull} onOpen={onOpen} />
            </View>
          )}
        />
      )}

      <DetailSheet
        base={selected}
        colors={colors}
        s={s}
        fmtMoney={fmtFull}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg, gap: 4 },
    backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, marginTop: 2 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 2 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    summaryCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16 },
    summaryStat: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    varianceChip: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: c.errorBg, borderWidth: 1, borderColor: c.error + '33' },
    varianceText: { flex: 1, fontSize: 12.5, color: c.error, fontWeight: '600' },

    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Row card
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    channelIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    channel: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    ref: { fontSize: 12.5, color: c.textSecondary, marginTop: 4, fontWeight: '600' },
    date: { fontSize: 11.5, color: c.textMuted, marginTop: 3, fontWeight: '600' },
    amountBox: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    amount: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.3 },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // Bottom sheet (detail)
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '88%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    sheetAmount: { fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.8, marginTop: 8 },
    sheetAmountCaption: { fontSize: 12, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 },

    detailRows: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    detailLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    detailValue: { fontSize: 13.5, color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

    linesBox: { marginTop: 16 },
    linesTitle: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
    lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    lineDesc: { fontSize: 13.5, color: c.text, fontWeight: '600' },
    lineMeta: { fontSize: 11.5, fontWeight: '700', marginTop: 2 },
    lineAmt: { fontSize: 13.5, color: c.text, fontWeight: '700' },
    linesLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
    linesLoadingText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    linesError: { fontSize: 13, color: c.error, fontWeight: '600', textAlign: 'center', marginTop: 18 },
    linesEmpty: { fontSize: 13, color: c.textMuted, fontWeight: '500', textAlign: 'center', marginTop: 18 },

    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 18 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
