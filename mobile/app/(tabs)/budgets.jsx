/**
 * Budgets — "Plan & track budget vs actual".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * Read-first view of financial-year budgets for the SELECTED outlet: browse the
 * budgets with a count summary, then tap one to see its budget-vs-actual as a
 * set of paired bars (target vs actual) per account, with per-line + total
 * variance. Data + pure transforms live in src/hooks/useBudgets.js; every
 * request is outlet-scoped. Creating/editing budgets stays on the web app
 * (multi-line chart-of-accounts form); mobile is the on-the-go tracking view.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
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
  useBudgets,
  useBudgetVsActual,
  filterBudgets,
  formatMoney,
  maxLineValue,
  pctOf,
  varianceIsFavourable,
} from '../../src/hooks/useBudgets';

const FAV_TONE = '#22c55e';
const UNFAV_TONE = '#ef4444';

function fmtDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return ''; }
}

// ─── One budget row ───────────────────────────────────────────────────────────
function BudgetRow({ budget, colors, s, onOpen }) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(budget)}>
        <View style={[s.iconBubble, { backgroundColor: colors.accent + '18' }]}>
          <Ionicons name="pie-chart-outline" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.budgetName} numberOfLines={1}>{budget.name || 'Untitled budget'}</Text>
          <View style={s.metaRow}>
            <View style={[s.fyPill, { backgroundColor: colors.accent + '14' }]}>
              <Text style={[s.fyPillText, { color: colors.accent }]}>FY {budget.fy_year}</Text>
            </View>
            <Text style={s.lineCount}>
              {Number(budget.line_count) || 0} {(Number(budget.line_count) || 0) === 1 ? 'account' : 'accounts'}
            </Text>
          </View>
          {budget.created_at ? <Text style={s.created}>Created {fmtDate(budget.created_at)}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── A single account's budget-vs-actual bars ─────────────────────────────────
function VsActualLine({ line, scale, currency, colors, s }) {
  const favourable = varianceIsFavourable(line.variance);
  const tone = favourable ? FAV_TONE : UNFAV_TONE;
  const budgetPct = pctOf(line.budget, scale);
  const actualPct = pctOf(line.actual, scale);

  return (
    <View style={s.lineBlock}>
      <View style={s.lineHead}>
        <Text style={s.lineName} numberOfLines={1}>
          <Text style={{ color: colors.textMuted }}>{line.account_code} </Text>
          {line.account_name || ''}
        </Text>
        <View style={[s.varChip, { backgroundColor: tone + '1e' }]}>
          <Ionicons name={favourable ? 'trending-up' : 'trending-down'} size={12} color={tone} />
          <Text style={[s.varChipText, { color: tone }]}>
            {line.variance_pct != null ? `${Number(line.variance_pct).toFixed(1)}%` : formatMoney(currency, line.variance)}
          </Text>
        </View>
      </View>

      <View style={s.barRow}>
        <Text style={s.barLabel}>Budget</Text>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${budgetPct}%`, backgroundColor: colors.textMuted }]} />
        </View>
        <Text style={s.barValue}>{formatMoney(currency, line.budget)}</Text>
      </View>

      <View style={s.barRow}>
        <Text style={s.barLabel}>Actual</Text>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${actualPct}%`, backgroundColor: tone }]} />
        </View>
        <Text style={[s.barValue, { color: tone }]}>{formatMoney(currency, line.actual)}</Text>
      </View>
    </View>
  );
}

// ─── Detail sheet: budget-vs-actual for one budget ────────────────────────────
function DetailModal({ budget, currency, colors, s, onClose }) {
  const { lines, totals, from, to, isLoading, isError, refetch } = useBudgetVsActual(budget);
  const scale = useMemo(() => maxLineValue(lines), [lines]);
  const totalsFav = varianceIsFavourable(totals?.variance);

  return (
    <Modal visible={!!budget} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          {budget ? (
            <>
              <View style={s.sheetHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.sheetTitle} numberOfLines={1}>{budget.name}</Text>
                  <Text style={s.sheetSub}>FY {budget.fy_year} · {from} → {to}</Text>
                </View>
              </View>

              {isLoading ? (
                <View style={s.sheetCenter}><ActivityIndicator size="large" color={colors.accent} /></View>
              ) : isError ? (
                <View style={s.sheetCenter}>
                  <EmptyState icon="⚠️" title="Couldn't load" subtitle="Budget vs actual failed to load." action={{ label: 'Retry', onPress: refetch }} />
                </View>
              ) : lines.length === 0 ? (
                <View style={s.sheetCenter}>
                  <EmptyState icon="📊" title="No data yet" subtitle="This budget has no account lines to compare." />
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                  <View style={s.totalsCard}>
                    <View style={s.totalsStat}>
                      <Text style={s.totalsValue}>{formatMoney(currency, totals.budget)}</Text>
                      <Text style={s.totalsLabel}>Budget</Text>
                    </View>
                    <View style={s.totalsDivider} />
                    <View style={s.totalsStat}>
                      <Text style={s.totalsValue}>{formatMoney(currency, totals.actual)}</Text>
                      <Text style={s.totalsLabel}>Actual</Text>
                    </View>
                    <View style={s.totalsDivider} />
                    <View style={s.totalsStat}>
                      <Text style={[s.totalsValue, { color: totalsFav ? FAV_TONE : UNFAV_TONE }]}>
                        {formatMoney(currency, totals.variance)}
                      </Text>
                      <Text style={s.totalsLabel}>Variance</Text>
                    </View>
                  </View>

                  {lines.map((line, i) => (
                    <VsActualLine key={line.account_code || i} line={line} scale={scale} currency={currency} colors={colors} s={s} />
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function BudgetsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU, currency } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const { rows, stats, isLoading, isError, isRefetching, refetch, hasOutlet } = useBudgets();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => filterBudgets(rows, query), [rows, query]);
  const outletName = currentOutlet?.name || 'Selected outlet';

  const openBudget = useCallback((b) => setSelected(b), []);

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={s.summaryValue}>{stats.count}</Text>
          <Text style={s.summaryLabel}>Budgets</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.accent }]}>{stats.lines}</Text>
          <Text style={s.summaryLabel}>Account lines</Text>
        </View>
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
            <Text style={s.title}>Budgets</Text>
            <Text style={s.subtitle} numberOfLines={1}>Plan & track vs actual · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="pie-chart-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{stats.count}</Text>
          </View>
        </View>

        {hasOutlet ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search by name or FY…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its budgets." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load budgets" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(b) => String(b.id)}
          estimatedItemSize={96}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState icon="🎯" title="No budgets yet" subtitle="Create a budget on the web app and track it here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No budgets match your search." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <BudgetRow budget={item} colors={colors} s={s} onOpen={openBudget} />
            </View>
          )}
        />
      )}

      <DetailModal
        budget={selected}
        currency={currency}
        colors={colors}
        s={s}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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

    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, height: 42, borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    searchInput: { flex: 1, fontSize: 14, color: c.text, padding: 0, fontWeight: '500' },

    summaryCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16, marginBottom: 12 },
    summaryStat: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    // Budget row card
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    iconBubble: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    budgetName: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
    fyPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    fyPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
    lineCount: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    created: { fontSize: 11.5, color: c.textMuted, marginTop: 4, fontWeight: '500' },

    // Bottom sheet
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '88%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 12.5, color: c.textMuted, marginTop: 2, fontWeight: '600' },
    sheetCenter: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },

    // Totals card in sheet
    totalsCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 14, marginBottom: 16 },
    totalsStat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    totalsDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    totalsValue: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    totalsLabel: { fontSize: 10.5, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    // vs-actual line bars
    lineBlock: { marginBottom: 18 },
    lineHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    lineName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: c.text },
    varChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    varChipText: { fontSize: 11.5, fontWeight: '800' },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    barLabel: { width: 46, fontSize: 11, color: c.textMuted, fontWeight: '700' },
    barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: c.border, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 5, minWidth: 2 },
    barValue: { width: 88, textAlign: 'right', fontSize: 12, color: c.text, fontWeight: '700' },

    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 14 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
