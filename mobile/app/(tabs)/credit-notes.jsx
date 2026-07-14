/**
 * Credit Notes — "Refunds & credits".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * The GST document layer for refunds / returns / adjustments in the SELECTED
 * outlet: browse issued/cancelled notes with a value summary, view a note's
 * detail, issue a new credit note, and cancel an issued one (with a reason).
 * Data + pure transforms live in src/hooks/useCreditNotes.js; every request is
 * outlet-scoped. Issue/cancel require MANAGE_PAYMENTS — a 403 is surfaced kindly.
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
  useCreditNotes,
  filterCreditNotes,
  summarizeCounts,
  formatMoney,
  creditNoteNumber,
  buildCreatePayload,
  CN_STATUS,
} from '../../src/hooks/useCreditNotes';

const CANCELLED_TONE = '#ef4444';

const statusTone = (status, colors) => (status === CN_STATUS.ISSUED ? colors.success : CANCELLED_TONE);
const statusLabel = (status) => (status === CN_STATUS.ISSUED ? 'Issued' : status === CN_STATUS.CANCELLED ? 'Cancelled' : String(status || ''));

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
function NoteRow({ note, colors, s, onOpen }) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(note)}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.cnNo} numberOfLines={1}>{creditNoteNumber(note)}</Text>
            <StatusPill status={note.status} colors={colors} s={s} />
          </View>
          <Text style={s.customer} numberOfLines={1}>{note.customer_name || 'Walk-in customer'}</Text>
          {note.reason ? <Text style={s.reason} numberOfLines={1}>{note.reason}</Text> : null}
          <Text style={s.date}>{fmtDate(note.issued_at || note.created_at)}</Text>
        </View>
        <View style={s.amountBox}>
          <Text style={[s.amount, note.status === CN_STATUS.CANCELLED && s.amountVoid]}>
            {formatMoney(note.currency, note.total_amount)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Detail + cancel modal ──────────────────────────────────────────────────
function DetailModal({ note, colors, s, onClose, onCancelNote, isCancelling }) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const close = () => { setCancelling(false); setReason(''); onClose(); };

  const confirmCancel = () => {
    const r = reason.trim();
    if (r.length < 3) { Alert.alert('Add a reason', 'Please give a short reason (at least 3 characters).'); return; }
    onCancelNote(note.id, r);
  };

  return (
    <Modal visible={!!note} transparent animationType="slide" onRequestClose={close}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          {note ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{creditNoteNumber(note)}</Text>
                  <Text style={s.sheetSub}>{fmtDate(note.issued_at || note.created_at)}</Text>
                </View>
                <StatusPill status={note.status} colors={colors} s={s} />
              </View>

              <Text style={s.sheetAmount}>{formatMoney(note.currency, note.total_amount)}</Text>

              <View style={s.detailRows}>
                <DetailRow label="Customer" value={note.customer_name || 'Walk-in'} s={s} />
                {note.customer_phone ? <DetailRow label="Phone" value={note.customer_phone} s={s} /> : null}
                {note.reason ? <DetailRow label="Reason" value={note.reason} s={s} /> : null}
                {note.order_id ? <DetailRow label="Linked order" value={String(note.order_id).slice(0, 8)} s={s} /> : null}
                {typeof note.tax_amount === 'number' ? <DetailRow label="Tax" value={formatMoney(note.currency, note.tax_amount)} s={s} /> : null}
                {note.status === CN_STATUS.CANCELLED && note.cancelled_at ? (
                  <DetailRow label="Cancelled" value={fmtDate(note.cancelled_at)} s={s} />
                ) : null}
              </View>

              {Array.isArray(note.lines) && note.lines.length > 0 ? (
                <View style={s.linesBox}>
                  <Text style={s.linesTitle}>Items</Text>
                  {note.lines.map((l, i) => (
                    <View key={i} style={s.lineRow}>
                      <Text style={s.lineDesc} numberOfLines={1}>{l.description}</Text>
                      <Text style={s.lineAmt}>{formatMoney(note.currency, (Number(l.unit_price) || 0) * (Number(l.quantity) || 1))}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {note.status === CN_STATUS.ISSUED ? (
                cancelling ? (
                  <View style={s.cancelBox}>
                    <Text style={s.cancelLabel}>Reason for cancelling</Text>
                    <TextInput
                      style={s.cancelInput}
                      value={reason}
                      onChangeText={setReason}
                      placeholder="e.g. issued by mistake"
                      placeholderTextColor={colors.textMuted}
                      multiline
                    />
                    <View style={s.sheetActions}>
                      <TouchableOpacity style={s.ghostBtn} onPress={() => setCancelling(false)} activeOpacity={0.85}>
                        <Text style={s.ghostBtnText}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.dangerBtn, isCancelling && { opacity: 0.6 }]} onPress={confirmCancel} disabled={isCancelling} activeOpacity={0.88}>
                        {isCancelling ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.dangerBtnText}>Confirm cancellation</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={s.cancelTrigger} onPress={() => setCancelling(true)} activeOpacity={0.85}>
                    <Ionicons name="close-circle-outline" size={17} color={CANCELLED_TONE} />
                    <Text style={s.cancelTriggerText}>Cancel this credit note</Text>
                  </TouchableOpacity>
                )
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

function DetailRow({ label, value, s }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Create modal ───────────────────────────────────────────────────────────
function CreateModal({ visible, colors, s, onClose, onCreate, isCreating }) {
  const [form, setForm] = useState({ total_amount: '', reason: '', customer_name: '', customer_phone: '' });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const close = () => { setForm({ total_amount: '', reason: '', customer_name: '', customer_phone: '' }); onClose(); };

  const submit = () => {
    const r = buildCreatePayload(form);
    if (!r.ok) { Alert.alert('Check the amount', r.error); return; }
    onCreate(r.payload, close);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>New credit note</Text>
          <Text style={s.sheetSub}>Issue a refund / credit to a customer.</Text>

          <Text style={s.fieldLabel}>Amount *</Text>
          <TextInput
            style={s.field}
            value={form.total_amount}
            onChangeText={set('total_amount')}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />

          <Text style={s.fieldLabel}>Reason</Text>
          <TextInput
            style={s.field}
            value={form.reason}
            onChangeText={set('reason')}
            placeholder="e.g. refund for cancelled order"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={s.fieldLabel}>Customer name</Text>
          <TextInput
            style={s.field}
            value={form.customer_name}
            onChangeText={set('customer_name')}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={s.fieldLabel}>Customer phone</Text>
          <TextInput
            style={s.field}
            value={form.customer_phone}
            onChangeText={set('customer_phone')}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />

          <View style={s.sheetActions}>
            <TouchableOpacity style={s.ghostBtn} onPress={close} activeOpacity={0.85}>
              <Text style={s.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primaryBtn, isCreating && { opacity: 0.6 }]} onPress={submit} disabled={isCreating} activeOpacity={0.88}>
              {isCreating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Issue credit note</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function CreditNotesScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    rows, stats, isLoading, isError, isRefetching, refetch,
    createNote, isCreating, cancelNote, isCancelling, hasOutlet,
  } = useCreditNotes();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const counts = useMemo(() => summarizeCounts(rows), [rows]);
  const filtered = useMemo(() => filterCreditNotes(rows, { q: query, status }), [rows, query, status]);

  const onCreate = useCallback(async (payload, close) => {
    try {
      await createNote(payload);
      close();
      Alert.alert('Credit note issued', `A credit note for ${formatMoney(stats.currency, payload.total_amount)} was issued.`);
    } catch (err) {
      Alert.alert('Could not issue', apiErrorMessage(err, 'Please try again.'));
    }
  }, [createNote, stats.currency]);

  const onCancelNote = useCallback(async (id, reason) => {
    try {
      await cancelNote(id, reason);
      setSelected(null);
      Alert.alert('Credit note cancelled', 'The credit note has been cancelled.');
    } catch (err) {
      Alert.alert('Could not cancel', apiErrorMessage(err, 'Please try again.'));
    }
  }, [cancelNote]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={s.summaryValue}>{stats.count ?? counts.issued}</Text>
          <Text style={s.summaryLabel}>Issued</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.accent, fontSize: 18 }]}>{formatMoney(stats.currency, stats.total_amount)}</Text>
          <Text style={s.summaryLabel}>Value</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.textMuted }]}>{counts.cancelled}</Text>
          <Text style={s.summaryLabel}>Cancelled</Text>
        </View>
      </View>

      <View style={s.filterRow}>
        {['all', 'issued', 'cancelled'].map((k) => (
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
            <Text style={s.title}>Credit Notes</Text>
            <Text style={s.subtitle} numberOfLines={1}>Refunds & credits · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="receipt-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{counts.total}</Text>
          </View>
        </View>

        {hasOutlet ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search number, customer, reason…"
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
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its credit notes." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load credit notes" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(n) => n.id}
          estimatedItemSize={104}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState icon="🧾" title="No credit notes yet" subtitle="Issue a refund or credit and it will appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No credit notes match your search or filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <NoteRow note={item} colors={colors} s={s} onOpen={setSelected} />
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
        note={selected}
        colors={colors}
        s={s}
        onClose={() => setSelected(null)}
        onCancelNote={onCancelNote}
        isCancelling={isCancelling}
      />
      <CreateModal
        visible={showCreate}
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
    summaryValue: { fontSize: 22, fontWeight: '800', color: c.success, letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Row card
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cnNo: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    customer: { fontSize: 13, color: c.textSecondary, marginTop: 4, fontWeight: '600' },
    reason: { fontSize: 12, color: c.textMuted, marginTop: 2 },
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
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '88%' },
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

    cancelTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18, height: 48, borderRadius: 13, borderWidth: 1, borderColor: CANCELLED_TONE + '55', backgroundColor: CANCELLED_TONE + '12' },
    cancelTriggerText: { color: CANCELLED_TONE, fontWeight: '800', fontSize: 14.5 },
    cancelBox: { marginTop: 18 },
    cancelLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 8 },
    cancelInput: { minHeight: 64, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, fontSize: 14, color: c.text, backgroundColor: c.card, textAlignVertical: 'top' },

    fieldLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginTop: 14, marginBottom: 6 },
    field: { height: 48, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card, fontWeight: '500' },

    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    ghostBtn: { paddingHorizontal: 18, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
    primaryBtn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: c.accent },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    dangerBtn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: CANCELLED_TONE },
    dangerBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 12 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
