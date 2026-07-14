/**
 * Central Kitchen — "Indents & supply".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * Monitor + fulfil central-kitchen indents (stock moving between a branch and
 * its commissary): pending → approved → dispatched → received (or rejected).
 * Two views: "My requests" (this branch confirms receipt) and "Incoming" (this
 * outlet acting as the CK approves / dispatches / rejects). Creating a new
 * requisition needs a multi-item picker and stays on the web dashboard.
 * Data + pure transforms live in src/hooks/useCentralKitchen.js.
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
  useCentralKitchen,
  filterIndents,
  summarizeIndents,
  nextActions,
  indentNumber,
  itemCount,
  itemName,
  itemUnit,
  CK_STATUS,
} from '../../src/hooks/useCentralKitchen';

const STATUS_TONE = {
  [CK_STATUS.PENDING]: '#f59e0b',
  [CK_STATUS.APPROVED]: '#3b82f6',
  [CK_STATUS.DISPATCHED]: '#6366f1',
  [CK_STATUS.RECEIVED]: '#22c55e',
  [CK_STATUS.REJECTED]: '#ef4444',
};
const STATUS_LABEL = {
  [CK_STATUS.PENDING]: 'Pending',
  [CK_STATUS.APPROVED]: 'Approved',
  [CK_STATUS.DISPATCHED]: 'Dispatched',
  [CK_STATUS.RECEIVED]: 'Received',
  [CK_STATUS.REJECTED]: 'Rejected',
};
const ACTION_META = {
  approve: { label: 'Approve', icon: 'checkmark-circle', tone: '#22c55e', danger: false },
  dispatch: { label: 'Dispatch', icon: 'send', tone: '#6366f1', danger: false },
  receive: { label: 'Mark received', icon: 'checkmark-done-circle', tone: '#22c55e', danger: false },
  reject: { label: 'Reject', icon: 'close-circle', tone: '#ef4444', danger: true },
};

const toneOf = (status) => STATUS_TONE[status] || '#94a3b8';
const labelOf = (status) => STATUS_LABEL[status] || String(status || '');

function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (_) { return ''; }
}
function apiErrorMessage(err, fallback) {
  if (err?.response?.status === 403) return "You don't have permission to do that.";
  return err?.response?.data?.message || err?.message || fallback;
}

function StatusPill({ status, s }) {
  const tone = toneOf(status);
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{labelOf(status)}</Text>
    </View>
  );
}

// ─── Indent row ─────────────────────────────────────────────────────────────
function IndentRow({ indent, colors, s, onOpen }) {
  const from = indent.requesting_outlet?.name || 'Branch';
  const to = indent.ck_outlet?.name || 'Central kitchen';
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(indent)}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.cnNo} numberOfLines={1}>{indentNumber(indent)}</Text>
            <StatusPill status={indent.status} s={s} />
          </View>
          <View style={s.routeRow}>
            <Text style={s.routeText} numberOfLines={1}>{from}</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
            <Text style={s.routeText} numberOfLines={1}>{to}</Text>
          </View>
          <Text style={s.date}>{itemCount(indent)} item{itemCount(indent) === 1 ? '' : 's'} · {fmtDate(indent.created_at)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Detail + actions ───────────────────────────────────────────────────────
function DetailModal({ indent, view, colors, s, onClose, onAct, isActing }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const close = () => { setRejecting(false); setReason(''); onClose(); };

  const actions = indent ? nextActions(indent.status, view) : [];

  const doReject = () => {
    const r = reason.trim();
    if (r.length < 3) { Alert.alert('Add a reason', 'Please give a short reason (at least 3 characters).'); return; }
    onAct('reject', indent, r);
  };

  return (
    <Modal visible={!!indent} transparent animationType="slide" onRequestClose={close}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          {indent ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{indentNumber(indent)}</Text>
                  <Text style={s.sheetSub}>{fmtDate(indent.created_at)}</Text>
                </View>
                <StatusPill status={indent.status} s={s} />
              </View>

              <View style={s.routeBox}>
                <Text style={s.routeName} numberOfLines={1}>{indent.requesting_outlet?.name || 'Branch'}</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.textMuted} />
                <Text style={s.routeName} numberOfLines={1}>{indent.ck_outlet?.name || 'Central kitchen'}</Text>
              </View>

              {indent.notes ? <Text style={s.notes}>“{indent.notes}”</Text> : null}
              {indent.status === CK_STATUS.REJECTED && (indent.reject_reason || indent.rejection_reason) ? (
                <Text style={[s.notes, { color: '#ef4444' }]}>Rejected: {indent.reject_reason || indent.rejection_reason}</Text>
              ) : null}

              <View style={s.linesBox}>
                <Text style={s.linesTitle}>Items</Text>
                {(indent.items || []).map((l) => (
                  <View key={l.id} style={s.lineRow}>
                    <Text style={s.lineDesc} numberOfLines={1}>{itemName(l)}</Text>
                    <Text style={s.lineQty}>
                      {Number(l.requested_quantity) || 0}{itemUnit(l) ? ` ${itemUnit(l)}` : ''}
                      {l.approved_quantity != null ? `  ·  ${Number(l.approved_quantity)} appr` : ''}
                      {l.dispatched_quantity != null ? `  ·  ${Number(l.dispatched_quantity)} disp` : ''}
                    </Text>
                  </View>
                ))}
              </View>

              {rejecting ? (
                <View style={s.cancelBox}>
                  <Text style={s.cancelLabel}>Reason for rejecting</Text>
                  <TextInput
                    style={s.cancelInput}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="e.g. out of stock at the kitchen"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                  <View style={s.sheetActions}>
                    <TouchableOpacity style={s.ghostBtn} onPress={() => setRejecting(false)} activeOpacity={0.85}>
                      <Text style={s.ghostBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.dangerBtn, isActing && { opacity: 0.6 }]} onPress={doReject} disabled={isActing} activeOpacity={0.88}>
                      {isActing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.dangerBtnText}>Confirm reject</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : actions.length > 0 ? (
                <View style={s.actionCol}>
                  {actions.map((a) => {
                    const m = ACTION_META[a];
                    return (
                      <TouchableOpacity
                        key={a}
                        style={[s.actionBtn, { backgroundColor: m.tone }, isActing && { opacity: 0.6 }]}
                        onPress={() => (a === 'reject' ? setRejecting(true) : onAct(a, indent))}
                        disabled={isActing}
                        activeOpacity={0.88}
                      >
                        {isActing ? <ActivityIndicator size="small" color="#fff" /> : (
                          <>
                            <Ionicons name={m.icon} size={17} color="#fff" />
                            <Text style={s.actionBtnText}>{m.label}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })}
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

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function CentralKitchenScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [view, setView] = useState('mine'); // 'mine' | 'incoming'
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const {
    indents, isLoading, isError, isRefetching, refetch,
    approve, dispatch, receive, reject, isActing, hasOutlet,
  } = useCentralKitchen(view);

  const summary = useMemo(() => summarizeIndents(indents), [indents]);
  const filtered = useMemo(() => filterIndents(indents, statusFilter), [indents, statusFilter]);

  const onAct = useCallback(async (action, indent, reason) => {
    const run = { approve, dispatch, receive };
    try {
      if (action === 'reject') await reject(indent, reason);
      else await run[action](indent);
      setSelected(null);
      Alert.alert('Done', action === 'reject' ? 'Indent rejected.' : `Indent ${action}${action.endsWith('e') ? 'd' : 'ed'}.`);
    } catch (err) {
      Alert.alert('Could not update', apiErrorMessage(err, 'Please try again.'));
    }
  }, [approve, dispatch, receive, reject]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      {/* View toggle */}
      <View style={s.toggle}>
        {[['mine', 'My requests'], ['incoming', 'Incoming']].map(([k, label]) => (
          <TouchableOpacity key={k} style={[s.toggleBtn, view === k && { backgroundColor: colors.accent }]} onPress={() => { setView(k); setStatusFilter('all'); }} activeOpacity={0.85}>
            <Text style={[s.toggleText, view === k && { color: '#fff' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={s.summaryCard}>
        <View style={s.summaryStat}><Text style={[s.summaryValue, { color: STATUS_TONE.pending }]}>{summary.pending}</Text><Text style={s.summaryLabel}>Pending</Text></View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}><Text style={[s.summaryValue, { color: STATUS_TONE.dispatched }]}>{summary.inTransit}</Text><Text style={s.summaryLabel}>In transit</Text></View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}><Text style={[s.summaryValue, { color: STATUS_TONE.received }]}>{summary.received}</Text><Text style={s.summaryLabel}>Received</Text></View>
      </View>

      {/* Status filter */}
      <View style={s.filterRow}>
        {['all', 'pending', 'approved', 'dispatched', 'received', 'rejected'].map((k) => (
          <TouchableOpacity key={k} style={[s.filterChip, statusFilter === k && { backgroundColor: colors.accent, borderColor: colors.accent }]} onPress={() => setStatusFilter(k)} activeOpacity={0.85}>
            <Text style={[s.filterChipText, statusFilter === k && { color: '#fff' }]}>{k === 'all' ? 'All' : labelOf(k)}</Text>
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
            <Text style={s.title}>Central Kitchen</Text>
            <Text style={s.subtitle} numberOfLines={1}>Indents & supply · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="business-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{summary.total}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its central-kitchen indents." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load indents" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(i) => i.id}
          estimatedItemSize={96}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          ListEmptyComponent={
            indents.length === 0 ? (
              <EmptyState icon="📦" title={view === 'mine' ? 'No requests yet' : 'Nothing incoming'} subtitle={view === 'mine' ? 'Create a requisition on the web dashboard; it will appear here to track.' : 'Indents directed to this outlet as the central kitchen will show here.'} />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No indents match this filter." />
            )
          }
          ListFooterComponent={<Text style={s.footerNote}>Create new requisitions on the MS-RM web dashboard. Approve, dispatch and receive from here.</Text>}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <IndentRow indent={item} colors={colors} s={s} onOpen={setSelected} />
            </View>
          )}
        />
      )}

      <DetailModal indent={selected} view={view} colors={colors} s={s} onClose={() => setSelected(null)} onAct={onAct} isActing={isActing} />
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

    toggle: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 4, gap: 4, marginBottom: 12 },
    toggleBtn: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
    toggleText: { fontSize: 13.5, fontWeight: '700', color: c.textSecondary },

    summaryCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16 },
    summaryStat: { flex: 1, alignItems: 'center' },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    filterChip: { paddingHorizontal: 13, height: 32, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },

    card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cnNo: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
    routeText: { fontSize: 12.5, color: c.textSecondary, fontWeight: '600', flexShrink: 1, maxWidth: '45%' },
    date: { fontSize: 11.5, color: c.textMuted, marginTop: 5, fontWeight: '600' },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    footerNote: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 24, lineHeight: 18 },

    // Sheet
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '88%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },

    routeBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12 },
    routeName: { fontSize: 14, fontWeight: '700', color: c.text, flexShrink: 1 },
    notes: { fontSize: 13.5, color: c.textSecondary, fontStyle: 'italic', marginTop: 12, lineHeight: 19 },

    linesBox: { marginTop: 14 },
    linesTitle: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    lineDesc: { fontSize: 14, color: c.text, fontWeight: '600', flexShrink: 1 },
    lineQty: { fontSize: 12.5, color: c.textSecondary, fontWeight: '600' },

    actionCol: { gap: 10, marginTop: 18 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 13 },
    actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    cancelBox: { marginTop: 18 },
    cancelLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 8 },
    cancelInput: { minHeight: 64, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, fontSize: 14, color: c.text, backgroundColor: c.card, textAlignVertical: 'top' },
    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    ghostBtn: { paddingHorizontal: 18, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
    dangerBtn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#ef4444' },
    dangerBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 12 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
