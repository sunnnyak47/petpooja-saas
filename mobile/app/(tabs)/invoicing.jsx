/**
 * Invoicing — "Tax Invoices".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * Customer (sales) GST tax invoices for the SELECTED outlet: browse invoices
 * with an outstanding / paid value summary, view an invoice's line detail, and
 * drive the lifecycle — create a draft, issue it (posts the AR journal), mark it
 * paid (cash / bank), or void it. Data + pure transforms live in
 * src/hooks/useInvoicing.js; every request is outlet-scoped. Write actions
 * require MANAGE_INVENTORY — a 403 is surfaced kindly.
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
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  useInvoicing,
  filterInvoices,
  formatMoney,
  invoiceNumber,
  computeTotals,
  buildCreatePayload,
  INV_STATUS,
} from '../../src/hooks/useInvoicing';

const VOID_TONE = '#ef4444';
const DRAFT_TONE = '#f59e0b';

const statusTone = (status, colors) => {
  if (status === INV_STATUS.PAID) return colors.success;
  if (status === INV_STATUS.SENT) return colors.accent;
  if (status === INV_STATUS.VOID) return VOID_TONE;
  return DRAFT_TONE; // draft
};
const statusLabel = (status) => {
  switch (status) {
    case INV_STATUS.DRAFT: return 'Draft';
    case INV_STATUS.SENT: return 'Issued';
    case INV_STATUS.PAID: return 'Paid';
    case INV_STATUS.VOID: return 'Void';
    default: return String(status || '');
  }
};

function fmtDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}`;
  } catch (_) { return ''; }
}

function apiErrorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.message;
  if (err?.response?.status === 403) return "You don't have permission to do that. Ask an owner or manager.";
  return msg || fallback;
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

// ─── One row ────────────────────────────────────────────────────────────────
function InvoiceRow({ inv, currency, colors, s, onOpen }) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(inv)}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.invNo} numberOfLines={1}>{invoiceNumber(inv)}</Text>
            <StatusPill status={inv.status} colors={colors} s={s} />
          </View>
          <Text style={s.customer} numberOfLines={1}>{inv.customer_name || 'Walk-in customer'}</Text>
          <Text style={s.date}>{fmtDate(inv.issue_date)}{inv.due_date ? `  ·  due ${fmtDate(inv.due_date)}` : ''}</Text>
        </View>
        <View style={s.amountBox}>
          <Text style={[s.amount, inv.status === INV_STATUS.VOID && s.amountVoid]}>
            {formatMoney(currency, inv.total)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function DetailRow({ label, value, s }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Detail + lifecycle modal ───────────────────────────────────────────────
function DetailModal({ inv, currency, colors, s, onClose, onIssue, onMarkPaid, onVoid, busy }) {
  const [payMethod, setPayMethod] = useState('bank');

  const close = () => { setPayMethod('bank'); onClose(); };

  const confirmVoid = () => {
    Alert.alert('Void this invoice?', 'This cannot be undone. The invoice will be marked void.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Void', style: 'destructive', onPress: () => onVoid(inv.id) },
    ]);
  };

  return (
    <Modal visible={!!inv} transparent animationType="slide" onRequestClose={close}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          {inv ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{invoiceNumber(inv)}</Text>
                  <Text style={s.sheetSub}>{fmtDate(inv.issue_date)}</Text>
                </View>
                <StatusPill status={inv.status} colors={colors} s={s} />
              </View>

              <Text style={s.sheetAmount}>{formatMoney(currency, inv.total)}</Text>

              <View style={s.detailRows}>
                <DetailRow label="Customer" value={inv.customer_name || 'Walk-in'} s={s} />
                {inv.due_date ? <DetailRow label="Due" value={fmtDate(inv.due_date)} s={s} /> : null}
                <DetailRow label="Subtotal" value={formatMoney(currency, inv.subtotal)} s={s} />
                <DetailRow label="GST (10%)" value={formatMoney(currency, inv.gst)} s={s} />
                <DetailRow label="Total" value={formatMoney(currency, inv.total)} s={s} />
                {inv.notes ? <DetailRow label="Notes" value={inv.notes} s={s} /> : null}
              </View>

              {Array.isArray(inv.lines) && inv.lines.length > 0 ? (
                <View style={s.linesBox}>
                  <Text style={s.linesTitle}>Line items</Text>
                  {inv.lines.map((l, i) => (
                    <View key={l.id || i} style={s.lineRow}>
                      <Text style={s.lineDesc} numberOfLines={1}>
                        {l.description || 'Item'}  ×{Number(l.quantity) || 1}
                      </Text>
                      <Text style={s.lineAmt}>{formatMoney(currency, l.amount != null ? l.amount : (Number(l.unit_price) || 0) * (Number(l.quantity) || 1))}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Lifecycle actions */}
              {inv.status === INV_STATUS.DRAFT ? (
                <View style={s.actionBox}>
                  <TouchableOpacity style={[s.primaryBtnFull, busy && { opacity: 0.6 }]} onPress={() => onIssue(inv.id)} disabled={busy} activeOpacity={0.88}>
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                      <><Ionicons name="paper-plane-outline" size={16} color="#fff" /><Text style={s.primaryBtnText}>Issue invoice</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.voidTrigger} onPress={confirmVoid} disabled={busy} activeOpacity={0.85}>
                    <Ionicons name="close-circle-outline" size={16} color={VOID_TONE} />
                    <Text style={s.voidTriggerText}>Void</Text>
                  </TouchableOpacity>
                </View>
              ) : inv.status === INV_STATUS.SENT ? (
                <View style={s.actionBox}>
                  <Text style={s.fieldLabel}>Payment received via</Text>
                  <View style={s.methodRow}>
                    {['bank', 'cash'].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[s.methodChip, payMethod === m && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                        onPress={() => setPayMethod(m)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name={m === 'cash' ? 'cash-outline' : 'card-outline'} size={15} color={payMethod === m ? '#fff' : colors.textSecondary} />
                        <Text style={[s.methodChipText, payMethod === m && { color: '#fff' }]}>{m === 'cash' ? 'Cash' : 'Bank'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={[s.successBtnFull, busy && { opacity: 0.6 }]} onPress={() => onMarkPaid(inv.id, payMethod)} disabled={busy} activeOpacity={0.88}>
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                      <><Ionicons name="checkmark-circle-outline" size={16} color="#fff" /><Text style={s.primaryBtnText}>Mark as paid</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.voidTrigger} onPress={confirmVoid} disabled={busy} activeOpacity={0.85}>
                    <Ionicons name="close-circle-outline" size={16} color={VOID_TONE} />
                    <Text style={s.voidTriggerText}>Void</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity style={s.closeBtn} onPress={close} activeOpacity={0.85}>
                <Text style={s.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ─── Create modal ───────────────────────────────────────────────────────────
const EMPTY_LINE = { description: '', quantity: '1', unit_price: '' };

function CreateModal({ visible, currency, colors, s, onClose, onCreate, isCreating }) {
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);

  const reset = () => { setCustomer(''); setNotes(''); setLines([{ ...EMPTY_LINE }]); };
  const close = () => { reset(); onClose(); };

  const setLine = (idx, key) => (v) =>
    setLines((ls) => ls.map((ln, i) => (i === idx ? { ...ln, [key]: v } : ln)));
  const addLine = () => setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  const removeLine = (idx) => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));

  const totals = useMemo(() => computeTotals(lines), [lines]);

  const submit = () => {
    const r = buildCreatePayload({ customer_name: customer, notes, lines });
    if (!r.ok) { Alert.alert('Check the details', r.error); return; }
    onCreate(r.payload, close);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>New tax invoice</Text>
            <Text style={s.sheetSub}>Creates a draft. Issue it to post the receivable.</Text>

            <Text style={s.fieldLabel}>Customer name</Text>
            <TextInput
              style={s.field}
              value={customer}
              onChangeText={setCustomer}
              placeholder="Optional — walk-in if blank"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={[s.fieldLabel, { marginTop: 16 }]}>Items *</Text>
            {lines.map((ln, idx) => (
              <View key={idx} style={s.lineCard}>
                <View style={s.lineCardTop}>
                  <TextInput
                    style={[s.field, { flex: 1, marginTop: 0 }]}
                    value={ln.description}
                    onChangeText={setLine(idx, 'description')}
                    placeholder="Description"
                    placeholderTextColor={colors.textMuted}
                  />
                  {lines.length > 1 ? (
                    <TouchableOpacity onPress={() => removeLine(idx)} hitSlop={8} style={s.lineRemove}>
                      <Ionicons name="trash-outline" size={18} color={VOID_TONE} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={s.lineQtyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.miniLabel}>Qty</Text>
                    <TextInput
                      style={[s.field, { marginTop: 4 }]}
                      value={String(ln.quantity)}
                      onChangeText={setLine(idx, 'quantity')}
                      placeholder="1"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Text style={s.miniLabel}>Unit price (ex GST)</Text>
                    <TextInput
                      style={[s.field, { marginTop: 4 }]}
                      value={String(ln.unit_price)}
                      onChangeText={setLine(idx, 'unit_price')}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity style={s.addLineBtn} onPress={addLine} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
              <Text style={[s.addLineText, { color: colors.accent }]}>Add another item</Text>
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Notes</Text>
            <TextInput
              style={[s.field, { minHeight: 56, textAlignVertical: 'top', paddingTop: 12 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={s.totalsBox}>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Subtotal</Text>
                <Text style={s.totalsVal}>{formatMoney(currency, totals.subtotal)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>GST (10%)</Text>
                <Text style={s.totalsVal}>{formatMoney(currency, totals.gst)}</Text>
              </View>
              <View style={[s.totalsRow, { marginTop: 4 }]}>
                <Text style={[s.totalsLabel, { color: colors.text, fontWeight: '800' }]}>Total</Text>
                <Text style={[s.totalsVal, { color: colors.text, fontSize: 17, fontWeight: '800' }]}>{formatMoney(currency, totals.total)}</Text>
              </View>
            </View>

            <View style={s.sheetActions}>
              <TouchableOpacity style={s.ghostBtn} onPress={close} activeOpacity={0.85}>
                <Text style={s.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.primaryBtn, isCreating && { opacity: 0.6 }]} onPress={submit} disabled={isCreating} activeOpacity={0.88}>
                {isCreating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Create draft</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function InvoicingScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU, currency } = useCurrency();
  const cur = currency || (isAU ? 'AUD' : 'INR');
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    rows, stats, isLoading, isError, isRefetching, refetch,
    createInvoice, isCreating,
    issueInvoice, isIssuing,
    markPaid, isMarkingPaid,
    voidInvoice, isVoiding,
    hasOutlet,
  } = useInvoicing();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => filterInvoices(rows, { q: query, status }), [rows, query, status]);
  const busy = isIssuing || isMarkingPaid || isVoiding;

  // Keep the open detail sheet in sync with refreshed list data.
  const selectedLive = useMemo(
    () => (selected ? rows.find((r) => r.id === selected.id) || selected : null),
    [selected, rows]
  );

  const onCreate = useCallback(async (payload, close) => {
    try {
      await createInvoice(payload);
      close();
      Alert.alert('Draft created', 'The invoice draft was created. Open it to issue.');
    } catch (err) {
      Alert.alert('Could not create', apiErrorMessage(err, 'Please try again.'));
    }
  }, [createInvoice]);

  const onIssue = useCallback(async (id) => {
    try {
      await issueInvoice(id);
      Alert.alert('Invoice issued', 'The receivable has been posted.');
    } catch (err) {
      Alert.alert('Could not issue', apiErrorMessage(err, 'Please try again.'));
    }
  }, [issueInvoice]);

  const onMarkPaid = useCallback(async (id, method) => {
    try {
      await markPaid(id, method);
      Alert.alert('Marked paid', 'Payment recorded and the receivable cleared.');
    } catch (err) {
      Alert.alert('Could not mark paid', apiErrorMessage(err, 'Please try again.'));
    }
  }, [markPaid]);

  const onVoid = useCallback(async (id) => {
    try {
      await voidInvoice(id);
      setSelected(null);
      Alert.alert('Invoice voided', 'The invoice has been marked void.');
    } catch (err) {
      Alert.alert('Could not void', apiErrorMessage(err, 'Please try again.'));
    }
  }, [voidInvoice]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.accent, fontSize: 18 }]}>{formatMoney(cur, stats.outstanding)}</Text>
          <Text style={s.summaryLabel}>Outstanding</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.success, fontSize: 18 }]}>{formatMoney(cur, stats.paid)}</Text>
          <Text style={s.summaryLabel}>Paid</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: DRAFT_TONE }]}>{stats.draftCount}</Text>
          <Text style={s.summaryLabel}>Drafts</Text>
        </View>
      </View>

      <View style={s.filterRow}>
        {['all', 'draft', 'sent', 'paid', 'void'].map((k) => (
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
            <Text style={s.title}>Tax Invoices</Text>
            <Text style={s.subtitle} numberOfLines={1}>Customer invoices · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="document-text-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{stats.total}</Text>
          </View>
        </View>

        {hasOutlet ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search number, customer, notes…"
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
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its tax invoices." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load invoices" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(inv) => inv.id}
          estimatedItemSize={96}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState icon="🧾" title="No invoices yet" subtitle="Create your first tax invoice and it will appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No invoices match your search or filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <InvoiceRow inv={item} currency={cur} colors={colors} s={s} onOpen={setSelected} />
            </View>
          )}
        />
      )}

      {hasOutlet ? (
        <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)} activeOpacity={0.9}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <DetailModal
        inv={selectedLive}
        currency={cur}
        colors={colors}
        s={s}
        onClose={() => setSelected(null)}
        onIssue={onIssue}
        onMarkPaid={onMarkPaid}
        onVoid={onVoid}
        busy={busy}
      />
      <CreateModal
        visible={showCreate}
        currency={cur}
        colors={colors}
        s={s}
        onClose={() => setShowCreate(false)}
        onCreate={onCreate}
        isCreating={isCreating}
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

    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, height: 42, borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    searchInput: { flex: 1, fontSize: 14, color: c.text, padding: 0, fontWeight: '500' },

    summaryCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16 },
    summaryStat: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    filterRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Row card
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    invNo: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    customer: { fontSize: 13, color: c.textSecondary, marginTop: 4, fontWeight: '600' },
    date: { fontSize: 11.5, color: c.textMuted, marginTop: 4, fontWeight: '600' },
    amountBox: { alignItems: 'flex-end', flexDirection: 'row', gap: 4 },
    amount: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    amountVoid: { color: c.textMuted, textDecorationLine: 'line-through' },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // FAB
    fab: { position: 'absolute', right: 20, bottom: 26, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },

    // Bottom sheet (detail + create)
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '90%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    sheetAmount: { fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.8, marginTop: 8, marginBottom: 12 },

    detailRows: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    detailLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    detailValue: { fontSize: 13.5, color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

    linesBox: { marginTop: 14 },
    linesTitle: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
    lineDesc: { fontSize: 13.5, color: c.textSecondary, flexShrink: 1 },
    lineAmt: { fontSize: 13.5, color: c.text, fontWeight: '700' },

    // Lifecycle actions
    actionBox: { marginTop: 18, gap: 10 },
    primaryBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 13, backgroundColor: c.accent },
    successBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 13, backgroundColor: c.success },
    voidTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, borderRadius: 13, borderWidth: 1, borderColor: VOID_TONE + '55', backgroundColor: VOID_TONE + '12' },
    voidTriggerText: { color: VOID_TONE, fontWeight: '800', fontSize: 14.5 },
    methodRow: { flexDirection: 'row', gap: 10 },
    methodChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    methodChipText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },

    // Create form
    fieldLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginTop: 14, marginBottom: 6 },
    field: { height: 48, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card, fontWeight: '500' },
    miniLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

    lineCard: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 12, marginTop: 10 },
    lineCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lineRemove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    lineQtyRow: { flexDirection: 'row', gap: 10, marginTop: 8 },

    addLineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, marginTop: 12, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.pillBg },
    addLineText: { fontSize: 14, fontWeight: '700' },

    totalsBox: { marginTop: 16, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12 },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
    totalsLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    totalsVal: { fontSize: 14, color: c.textSecondary, fontWeight: '700' },

    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    ghostBtn: { paddingHorizontal: 18, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
    primaryBtn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: c.accent },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 12 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
