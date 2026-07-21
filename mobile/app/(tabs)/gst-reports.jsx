/**
 * GST Reports — "Tax filings & reports" (region-aware).
 *
 * AU outlets  → a BAS (Business Activity Statement): GST on sales / purchases,
 *               net GST payable, with a period picker + KPI tiles + breakdown.
 * IN outlets  → GSTR-1 / GSTR-3B / Summary tabs (rate-wise + HSN breakdown).
 *
 * Data + region routing live in useGstReports(). Currency symbols always come
 * from useCurrency (never hardcoded). Every fetch is scoped to the selected
 * outlet. Export shares the active report as CSV via the native Share sheet.
 *
 * Expo 54 · RN 0.81 · Reanimated · FlashList not needed here (small tables).
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Share,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import {
  useGstReports,
  periodRange,
  periodLabel,
  PERIOD_PRESETS,
  buildExport,
  num,
} from '../../src/hooks/useGstReports';

const IN_TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'gstr1', label: 'GSTR-1' },
  { key: 'gstr3b', label: 'GSTR-3B' },
];

export default function GstReportsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { symbol, fmtFull, isAU } = useCurrency();

  const [preset, setPreset] = useState('this_month');
  const [inTab, setInTab] = useState('summary');

  const range = useMemo(() => periodRange(preset, isAU), [preset, isAU]);
  const gst = useGstReports(range, inTab);

  const money = useCallback((v) => fmtFull(num(v)), [fmtFull]);

  const onExport = useCallback(async () => {
    try {
      const { filename, csv } = buildExport(
        gst.region,
        gst.activeTab,
        gst.data,
        range,
        periodLabel(preset)
      );
      const heading = `${gst.region === 'AU' ? 'BAS Statement' : gst.activeTab.toUpperCase()} · ${currentOutlet?.name || 'Outlet'}\nPeriod: ${range.from} to ${range.to}\n\n`;
      await Share.share({ title: filename, message: heading + csv });
    } catch (_) {
      /* user dismissed the sheet — no-op */
    }
  }, [gst.region, gst.activeTab, gst.data, range, preset, currentOutlet]);

  const s = useMemo(() => makeStyles(colors), [colors]);
  const canExport = !gst.isLoading && !gst.isError && !gst.isEmpty && !!gst.data;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* ── Header ── */}
      <LinearGradient
        colors={isAU ? ['#1d4ed8', '#2563eb'] : ['#1d4ed8', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>GST Reports</Text>
            <Text style={s.headerSub}>
              {isAU ? 'BAS — tax filings & statements' : 'GSTR filings & tax summary'}
              {currentOutlet?.name ? ` · ${currentOutlet.name}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.exportBtn, !canExport && s.exportBtnDisabled]}
            onPress={onExport}
            disabled={!canExport}
            accessibilityLabel="Export report"
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={s.exportBtnTxt}>Export</Text>
          </TouchableOpacity>
        </View>

        {/* Period pills */}
        <ScrollView
          horizontal
        style={{ flexGrow: 0, flexShrink: 0 }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillRow}
        >
          {PERIOD_PRESETS.map((p) => {
            const on = p.key === preset;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPreset(p.key)}
                style={[s.pill, on && s.pillOn]}
              >
                <Text style={[s.pillTxt, on && s.pillTxtOn]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Text style={s.rangeLabel}>
          {range.from} → {range.to}
        </Text>
      </LinearGradient>

      {/* IN region tabs */}
      {!isAU && (
        <View style={s.tabBar}>
          {IN_TABS.map((t) => {
            const on = t.key === inTab;
            return (
              <TouchableOpacity
                key={t.key}
                style={[s.tab, on && s.tabOn]}
                onPress={() => setInTab(t.key)}
              >
                <Text style={[s.tabTxt, on && s.tabTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            refreshing={gst.isRefetching && !gst.isLoading}
            onRefresh={gst.refetch}
            tintColor={colors.accent}
          />
        }
      >
        {gst.isLoading ? (
          <Skeleton s={s} colors={colors} />
        ) : gst.isError ? (
          <ErrorState s={s} colors={colors} onRetry={gst.refetch} msg={gst.error?.message} />
        ) : gst.isEmpty ? (
          <EmptyState s={s} colors={colors} period={periodLabel(preset)} />
        ) : isAU ? (
          <BasView s={s} colors={colors} money={money} data={gst.data} symbol={symbol} />
        ) : inTab === 'gstr1' ? (
          <Gstr1View s={s} colors={colors} money={money} data={gst.data} />
        ) : inTab === 'gstr3b' ? (
          <Gstr3bView s={s} colors={colors} money={money} data={gst.data} />
        ) : (
          <SummaryView s={s} colors={colors} money={money} data={gst.data} />
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── KPI tile ──────────────────────────────────────────────────────────────
function Tile({ s, label, value, icon, tint, index = 0 }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60)} style={s.tile}>
      <View style={[s.tileIcon, { backgroundColor: (tint || '#2563eb') + '18' }]}>
        <Ionicons name={icon} size={16} color={tint || '#2563eb'} />
      </View>
      <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.tileLabel}>{label}</Text>
    </Animated.View>
  );
}

// ─── AU: BAS ─────────────────────────────────────────────────────────────────
function BasView({ s, colors, money, data }) {
  const netPositive = num(data.net_gst_payable) >= 0;
  return (
    <Animated.View entering={FadeIn}>
      <View style={s.tileGrid}>
        <Tile s={s} index={0} label="G1 Total Sales (incl GST)" icon="cash-outline" tint="#2563eb" value={money(data.g1_total_sales_incl_gst)} />
        <Tile s={s} index={1} label="1A GST on Sales" icon="trending-up-outline" tint="#16a34a" value={money(data.gst_collected)} />
        <Tile s={s} index={2} label="1B GST on Purchases" icon="trending-down-outline" tint="#d97706" value={money(data.gst_paid_on_purchases)} />
        <Tile s={s} index={3} label={netPositive ? 'Net GST Payable' : 'Net GST Refund'} icon="calculator-outline" tint={netPositive ? '#dc2626' : '#16a34a'} value={money(Math.abs(num(data.net_gst_payable)))} />
      </View>

      <SectionCard s={s} title="BAS Breakdown" subtitle="Business Activity Statement">
        <Row s={s} label="G1 · Total sales (incl GST)" value={money(data.g1_total_sales_incl_gst)} />
        <Row s={s} label="Net sales (excl GST)" value={money(data.net_sales_excl_gst)} />
        <Divider s={s} />
        <Row s={s} label="1A · GST on sales" value={money(data.gst_collected)} tint="#16a34a" />
        <Row s={s} label="1B · GST on purchases" value={money(data.gst_paid_on_purchases)} tint="#d97706" />
        <Divider s={s} />
        <Row s={s} label="Net GST payable to ATO" value={money(data.net_gst_payable)} bold tint="#dc2626" />
        <Row s={s} label="Orders in period" value={String(num(data.order_count))} muted />
      </SectionCard>

      <Text style={s.note}>
        GST is calculated at 10% (1/11 of GST-inclusive sales). Net = 1A − 1B.
      </Text>
    </Animated.View>
  );
}

// ─── IN: GSTR-1 ──────────────────────────────────────────────────────────────
function Gstr1View({ s, colors, money, data }) {
  const t = data.totals || {};
  const b2cs = data.b2cs || [];
  const hsn = data.hsn || [];
  return (
    <Animated.View entering={FadeIn}>
      {!!data.gstin && <Text style={s.gstin}>GSTIN · {data.gstin}</Text>}
      <View style={s.tileGrid}>
        <Tile s={s} index={0} label="Taxable Value" icon="receipt-outline" tint="#2563eb" value={money(t.taxable_value)} />
        <Tile s={s} index={1} label="CGST" icon="git-branch-outline" tint="#16a34a" value={money(t.cgst)} />
        <Tile s={s} index={2} label="SGST" icon="git-branch-outline" tint="#d97706" value={money(t.sgst)} />
        <Tile s={s} index={3} label="Total Tax" icon="calculator-outline" tint="#dc2626" value={money(t.total_tax)} />
      </View>

      <SectionCard s={s} title="B2C Small (rate-wise)" subtitle={`${b2cs.length} rate slab${b2cs.length === 1 ? '' : 's'}`}>
        <TableHead s={s} cols={['Rate', 'Taxable', 'CGST', 'SGST']} />
        {b2cs.length === 0 ? (
          <Text style={s.tableEmpty}>No outward supplies in this period.</Text>
        ) : (
          b2cs.map((r, i) => (
            <TableRow key={i} s={s} cells={[`${num(r.rate)}%`, money(r.taxable_value), money(r.cgst), money(r.sgst)]} />
          ))
        )}
      </SectionCard>

      {hsn.length > 0 && (
        <SectionCard s={s} title="HSN Summary (Table 12)" subtitle={`${hsn.length} item${hsn.length === 1 ? '' : 's'}`}>
          <TableHead s={s} cols={['HSN', 'Qty', 'Taxable', 'Tax']} />
          {hsn.map((h, i) => (
            <TableRow
              key={i}
              s={s}
              cells={[h.hsn_code || '—', String(num(h.total_qty)), money(h.taxable_value), money(num(h.cgst) + num(h.sgst) + num(h.igst))]}
            />
          ))}
        </SectionCard>
      )}

      <SectionCard s={s} title="Document Summary">
        <Row s={s} label="Invoices" value={String(num(data.docs?.invoices_count))} />
        <Row s={s} label="Total value (incl tax)" value={money(data.docs?.total_value)} bold />
      </SectionCard>
    </Animated.View>
  );
}

// ─── IN: GSTR-3B ─────────────────────────────────────────────────────────────
function Gstr3bView({ s, colors, money, data }) {
  const a = data.section_3_1_a || {};
  const c = data.section_3_1_c;
  const itc = data.section_4_itc || {};
  const tp = data.tax_payable || {};
  return (
    <Animated.View entering={FadeIn}>
      {!!data.gstin && <Text style={s.gstin}>GSTIN · {data.gstin}</Text>}
      <View style={s.tileGrid}>
        <Tile s={s} index={0} label="3.1(a) Taxable" icon="receipt-outline" tint="#2563eb" value={money(a.taxable_value)} />
        <Tile s={s} index={1} label="CGST Payable" icon="git-branch-outline" tint="#16a34a" value={money(tp.cgst)} />
        <Tile s={s} index={2} label="SGST Payable" icon="git-branch-outline" tint="#d97706" value={money(tp.sgst)} />
        <Tile s={s} index={3} label="Total Payable" icon="calculator-outline" tint="#dc2626" value={money(tp.total)} />
      </View>

      <SectionCard s={s} title="3.1 Outward Supplies">
        <Row s={s} label="3.1(a) Taxable value" value={money(a.taxable_value)} />
        <Row s={s} label="  IGST" value={money(a.igst)} muted />
        <Row s={s} label="  CGST" value={money(a.cgst)} muted />
        <Row s={s} label="  SGST" value={money(a.sgst)} muted />
        {c && <Divider s={s} />}
        {c && <Row s={s} label="3.1(c) Nil-rated / exempt" value={money(c.taxable_value)} />}
      </SectionCard>

      <SectionCard s={s} title="4. Input Tax Credit (ITC)">
        <Row s={s} label="IGST" value={money(itc.igst)} muted />
        <Row s={s} label="CGST" value={money(itc.cgst)} muted />
        <Row s={s} label="SGST" value={money(itc.sgst)} muted />
      </SectionCard>

      <SectionCard s={s} title="Tax Payable" subtitle="Output tax − ITC">
        <Row s={s} label="IGST" value={money(tp.igst)} />
        <Row s={s} label="CGST" value={money(tp.cgst)} />
        <Row s={s} label="SGST" value={money(tp.sgst)} />
        <Divider s={s} />
        <Row s={s} label="Total tax payable" value={money(tp.total)} bold tint="#dc2626" />
      </SectionCard>

      {Array.isArray(data.notes) && data.notes.length > 0 && (
        <View style={s.notesCard}>
          {data.notes.map((n, i) => (
            <View key={i} style={s.noteLine}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
              <Text style={s.noteTxt}>{n}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── IN: Summary (gstDetailed) ───────────────────────────────────────────────
function SummaryView({ s, colors, money, data }) {
  const t = data.totals || {};
  const byRate = data.by_rate || [];
  const daily = data.daily || [];
  return (
    <Animated.View entering={FadeIn}>
      <View style={s.tileGrid}>
        <Tile s={s} index={0} label="Taxable Value" icon="receipt-outline" tint="#2563eb" value={money(t.taxable)} />
        <Tile s={s} index={1} label="CGST" icon="git-branch-outline" tint="#16a34a" value={money(t.cgst)} />
        <Tile s={s} index={2} label="SGST" icon="git-branch-outline" tint="#d97706" value={money(t.sgst)} />
        <Tile s={s} index={3} label="Total Tax" icon="calculator-outline" tint="#dc2626" value={money(t.total_tax)} />
      </View>

      <SectionCard s={s} title="Rate-wise Breakdown" subtitle={`${num(t.order_count)} orders`}>
        <TableHead s={s} cols={['Rate', 'Taxable', 'CGST', 'SGST']} />
        {byRate.length === 0 ? (
          <Text style={s.tableEmpty}>No taxed sales in this period.</Text>
        ) : (
          byRate.map((r, i) => (
            <TableRow key={i} s={s} cells={[`${num(r.rate)}%`, money(r.taxable), money(r.cgst), money(r.sgst)]} />
          ))
        )}
      </SectionCard>

      {daily.length > 0 && (
        <SectionCard s={s} title="Daily GST Register" subtitle={`${daily.length} day${daily.length === 1 ? '' : 's'}`}>
          <TableHead s={s} cols={['Date', 'Taxable', 'Tax', 'Total']} />
          {daily.map((d, i) => (
            <TableRow key={i} s={s} cells={[d.date, money(d.taxable), money(d.total_tax), money(d.grand_total)]} />
          ))}
        </SectionCard>
      )}
    </Animated.View>
  );
}

// ─── Shared building blocks ──────────────────────────────────────────────────
function SectionCard({ s, title, subtitle, children }) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        {!!subtitle && <Text style={s.cardSub}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function Row({ s, label, value, bold, muted, tint }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, muted && s.rowLabelMuted]} numberOfLines={2}>{label}</Text>
      <Text style={[s.rowValue, bold && s.rowValueBold, tint && { color: tint }]}>{value}</Text>
    </View>
  );
}

function Divider({ s }) {
  return <View style={s.divider} />;
}

function TableHead({ s, cols }) {
  return (
    <View style={s.tHeadRow}>
      {cols.map((c, i) => (
        <Text key={i} style={[s.tHead, i === 0 ? s.tColFirst : s.tColRight]}>{c}</Text>
      ))}
    </View>
  );
}

function TableRow({ s, cells }) {
  return (
    <View style={s.tRow}>
      {cells.map((c, i) => (
        <Text key={i} style={[s.tCell, i === 0 ? s.tColFirst : s.tColRight]} numberOfLines={1}>{c}</Text>
      ))}
    </View>
  );
}

// ─── States ──────────────────────────────────────────────────────────────────
function Skeleton({ s, colors }) {
  return (
    <View>
      <View style={s.tileGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[s.tile, s.skelTile]} />
        ))}
      </View>
      {[0, 1].map((i) => (
        <View key={i} style={[s.card, { height: 160 }]}>
          <View style={s.skelLine} />
          <View style={[s.skelLine, { width: '70%' }]} />
          <View style={[s.skelLine, { width: '85%' }]} />
        </View>
      ))}
      <ActivityIndicator style={{ marginTop: 8 }} color={colors.accent} />
    </View>
  );
}

function EmptyState({ s, colors, period }) {
  return (
    <Animated.View entering={FadeIn} style={s.centerState}>
      <View style={s.emptyIcon}>
        <Ionicons name="document-text-outline" size={40} color={colors.accent} />
      </View>
      <Text style={s.emptyTitle}>No filings for {period}</Text>
      <Text style={s.emptyBody}>
        There were no taxable sales in this period. Pick another period above, or
        record some orders to generate a return.
      </Text>
    </Animated.View>
  );
}

function ErrorState({ s, colors, onRetry, msg }) {
  return (
    <Animated.View entering={FadeIn} style={s.centerState}>
      <View style={[s.emptyIcon, { backgroundColor: '#fef2f2' }]}>
        <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
      </View>
      <Text style={s.emptyTitle}>Couldn’t load report</Text>
      <Text style={s.emptyBody}>{msg || 'Something went wrong fetching your GST data.'}</Text>
      <TouchableOpacity style={s.retryBtn} onPress={onRetry}>
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={s.retryTxt}>Retry</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    headerSub: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, marginTop: 2 },
    exportBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 10,
    },
    exportBtnDisabled: { opacity: 0.4 },
    exportBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
    pillRow: { gap: 8, paddingTop: 14, paddingRight: 8 },
    pill: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    pillOn: { backgroundColor: '#fff' },
    pillTxt: { color: 'rgba(255,255,255,0.9)', fontWeight: '600', fontSize: 13 },
    pillTxtOn: { color: '#1d4ed8', fontWeight: '800' },
    rangeLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginTop: 10, fontWeight: '600' },

    tabBar: {
      flexDirection: 'row', backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabOn: { borderBottomColor: c.accent },
    tabTxt: { color: c.textMuted, fontWeight: '600', fontSize: 13.5 },
    tabTxtOn: { color: c.accent, fontWeight: '800' },

    body: { padding: 16 },

    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
    tile: {
      width: '47.5%', flexGrow: 1, backgroundColor: c.card, borderRadius: 14,
      padding: 13, borderWidth: 1, borderColor: c.border,
    },
    tileIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
    tileValue: { color: c.text, fontSize: 18.5, fontWeight: '800', letterSpacing: -0.4 },
    tileLabel: { color: c.textSecondary, fontSize: 11.5, marginTop: 3, fontWeight: '500' },
    skelTile: { height: 96, backgroundColor: c.border, opacity: 0.5 },

    card: {
      backgroundColor: c.card, borderRadius: 16, padding: 16, marginTop: 14,
      borderWidth: 1, borderColor: c.border,
    },
    cardHead: { marginBottom: 8 },
    cardTitle: { color: c.text, fontSize: 15.5, fontWeight: '800' },
    cardSub: { color: c.textMuted, fontSize: 12, marginTop: 1 },

    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
    rowLabel: { color: c.textSecondary, fontSize: 13.5, flex: 1, paddingRight: 10 },
    rowLabelMuted: { color: c.textMuted, fontSize: 12.5 },
    rowValue: { color: c.text, fontSize: 14, fontWeight: '700' },
    rowValueBold: { fontSize: 16, fontWeight: '800' },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 6 },

    tHeadRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border, marginTop: 4 },
    tHead: { color: c.textMuted, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    tRow: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderLight },
    tCell: { color: c.text, fontSize: 13, fontWeight: '500' },
    tColFirst: { flex: 1.3, textAlign: 'left' },
    tColRight: { flex: 1, textAlign: 'right' },
    tableEmpty: { color: c.textMuted, fontSize: 13, paddingVertical: 14, textAlign: 'center' },

    gstin: { color: c.textSecondary, fontSize: 12.5, fontWeight: '700', marginBottom: 10, letterSpacing: 0.4 },
    note: { color: c.textMuted, fontSize: 12, marginTop: 12, lineHeight: 17 },
    notesCard: { backgroundColor: c.card, borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: c.border, gap: 8 },
    noteLine: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
    noteTxt: { color: c.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },

    skelLine: { height: 12, borderRadius: 6, backgroundColor: c.border, opacity: 0.5, marginBottom: 12, width: '100%' },

    centerState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
    emptyIcon: {
      width: 84, height: 84, borderRadius: 42, backgroundColor: c.accent + '14',
      alignItems: 'center', justifyContent: 'center', marginBottom: 18,
    },
    emptyTitle: { color: c.text, fontSize: 17, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
    emptyBody: { color: c.textSecondary, fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent,
      paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, marginTop: 20,
    },
    retryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  });
}
