/**
 * Fraud & Risk — owner staff-risk monitoring.
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * Surfaces the fraud-detection engine (backend modules/fraud) for the SELECTED
 * outlet: a stats strip (total / unread / severity mix), per-staff risk scores,
 * and a colour-coded list of risk ALERTS (excessive cancels, KOT-without-bill,
 * discount / void abuse, quick-cancel, late-night, refund patterns). Tap an
 * alert to read the detail and act on it — mark read, dismiss, or resolve.
 * Data + pure transforms live in src/hooks/useFraud.js + src/lib/fraud.js; every
 * request is outlet-scoped.
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
  Alert,
  ScrollView,
  TextInput,
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
import { useFraud } from '../../src/hooks/useFraud';
import {
  filterAlerts,
  sortAlerts,
  severityColor,
  severityLabel,
  alertTypeLabel,
  alertTypeIcon,
  alertAmount,
  alertStaffName,
  alertTime,
  isUnread,
  severityBreakdown,
  unreadCount,
  riskLevelColor,
  riskLevelLabel,
  timeAgo,
} from '../../src/lib/fraud';

function apiErrorMessage(err, fallback) {
  const msg = err?.message;
  if (String(msg || '').toLowerCase().includes('permission') || err?.response?.status === 403) {
    return "You don't have permission to do that. Ask an owner or manager.";
  }
  return msg || fallback;
}

// ─── Severity pill ──────────────────────────────────────────────────────────
function SeverityPill({ severity, s }) {
  const tone = severityColor(severity);
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{severityLabel(severity)}</Text>
    </View>
  );
}

// ─── One alert row ────────────────────────────────────────────────────────────
function AlertRow({ alert, colors, s, fmt, onOpen }) {
  const tone = severityColor(alert.severity);
  const amount = alertAmount(alert);
  const unread = isUnread(alert);
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={[s.card, { borderLeftColor: tone, borderLeftWidth: 3 }]} activeOpacity={0.85} onPress={() => onOpen(alert)}>
        <View style={[s.typeIcon, { backgroundColor: tone + '18' }]}>
          <Ionicons name={alertTypeIcon(alert.alert_type)} size={18} color={tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.typeText} numberOfLines={1}>{alertTypeLabel(alert.alert_type)}</Text>
            {unread ? <View style={[s.unreadDot, { backgroundColor: colors.accent }]} /> : null}
          </View>
          <Text style={s.alertTitle} numberOfLines={2}>{alert.title || alertStaffName(alert)}</Text>
          <View style={s.metaRow}>
            <SeverityPill severity={alert.severity} s={s} />
            <Text style={s.metaDot}>·</Text>
            <Text style={s.metaText} numberOfLines={1}>{alertStaffName(alert)}</Text>
            <Text style={s.metaDot}>·</Text>
            <Text style={s.metaText}>{timeAgo(alertTime(alert))}</Text>
          </View>
        </View>
        {amount != null ? (
          <View style={s.amountBox}>
            <Text style={[s.amount, { color: tone }]}>{fmt(amount)}</Text>
            <Text style={s.amountLabel}>at risk</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Staff-risk chip (horizontal strip) ──────────────────────────────────────
function StaffChip({ staff, s }) {
  const tone = riskLevelColor(staff.risk_level);
  return (
    <View style={[s.staffChip, { borderColor: tone + '55', backgroundColor: tone + '10' }]}>
      <View style={s.staffChipTop}>
        <Text style={s.staffName} numberOfLines={1}>{staff.full_name || 'Unknown'}</Text>
        <View style={[s.scoreBadge, { backgroundColor: tone }]}>
          <Text style={s.scoreText}>{Number(staff.max_risk_score) || 0}</Text>
        </View>
      </View>
      <Text style={[s.staffLevel, { color: tone }]}>{riskLevelLabel(staff.risk_level)}</Text>
      <Text style={s.staffMeta}>{staff.role || 'staff'} · {staff.alert_count || 0} alert{(staff.alert_count || 0) === 1 ? '' : 's'}</Text>
    </View>
  );
}

// ─── Detail + actions modal ──────────────────────────────────────────────────
function DetailModal({ alert, colors, s, fmt, onClose, actions }) {
  const [note, setNote] = useState('');
  const { onMarkRead, onDismiss, onResolve, isMarkingRead, isDismissing, isResolving } = actions;
  const busy = isMarkingRead || isDismissing || isResolving;

  const close = () => { setNote(''); onClose(); };
  const amount = alert ? alertAmount(alert) : null;
  const unread = alert ? isUnread(alert) : false;

  return (
    <Modal visible={!!alert} transparent animationType="slide" onRequestClose={close}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          {alert ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={[s.typeIcon, { backgroundColor: severityColor(alert.severity) + '18', width: 40, height: 40 }]}>
                  <Ionicons name={alertTypeIcon(alert.alert_type)} size={20} color={severityColor(alert.severity)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle} numberOfLines={2}>{alertTypeLabel(alert.alert_type)}</Text>
                  <Text style={s.sheetSub}>{alertStaffName(alert)} · {timeAgo(alertTime(alert))}</Text>
                </View>
                <SeverityPill severity={alert.severity} s={s} />
              </View>

              {amount != null ? (
                <Text style={[s.sheetAmount, { color: severityColor(alert.severity) }]}>{fmt(amount)}<Text style={s.sheetAmountLabel}>  at risk</Text></Text>
              ) : null}

              {alert.title ? <Text style={s.sheetAlertTitle}>{alert.title}</Text> : null}
              {alert.description ? <Text style={s.sheetDesc}>{alert.description}</Text> : null}

              <View style={s.detailRows}>
                <DetailRow label="Risk score" value={String(Number(alert.risk_score) || 0)} s={s} />
                <DetailRow label="Severity" value={severityLabel(alert.severity)} s={s} />
                <DetailRow label="Status" value={alert.is_resolved ? 'Resolved' : unread ? 'Unread' : 'Read'} s={s} />
              </View>

              <Text style={s.noteLabel}>Resolution note (optional)</Text>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="e.g. reviewed with staff — genuine"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <View style={s.actionsCol}>
                <TouchableOpacity
                  style={[s.resolveBtn, busy && { opacity: 0.6 }]}
                  onPress={() => onResolve(alert.id, note.trim())}
                  disabled={busy}
                  activeOpacity={0.88}
                >
                  {isResolving ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={s.resolveBtnText}>Resolve</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={s.actionRow}>
                  {unread ? (
                    <TouchableOpacity style={[s.ghostBtn, busy && { opacity: 0.6 }]} onPress={() => onMarkRead(alert.id)} disabled={busy} activeOpacity={0.85}>
                      {isMarkingRead ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
                        <>
                          <Ionicons name="mail-open-outline" size={16} color={colors.textSecondary} />
                          <Text style={s.ghostBtnText}>Mark read</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={[s.dismissBtn, busy && { opacity: 0.6 }]} onPress={() => onDismiss(alert.id)} disabled={busy} activeOpacity={0.85}>
                    {isDismissing ? <ActivityIndicator size="small" color={colors.error} /> : (
                      <>
                        <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                        <Text style={[s.ghostBtnText, { color: colors.error }]}>Dismiss</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={s.closeBtn} onPress={close} activeOpacity={0.85}>
                  <Text style={s.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
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

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function FraudScreen() {
  const { colors, isDark } = useTheme();
  const { currentOutlet } = useOutlet();
  const { fmt, isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [selected, setSelected] = useState(null);

  const {
    alerts, stats, staffRisks,
    isLoading, isError, isRefetching, refetch,
    markRead, isMarkingRead,
    dismissAlert, isDismissing,
    resolveAlert, isResolving,
    hasOutlet,
  } = useFraud(filter);

  const visible = useMemo(() => sortAlerts(filterAlerts(alerts, filter)), [alerts, filter]);
  const sevBreakdown = useMemo(() => severityBreakdown(stats), [stats]);
  const unread = unreadCount(stats, alerts);

  const onMarkRead = useCallback(async (id) => {
    try { await markRead(id); setSelected(null); }
    catch (err) { Alert.alert('Could not mark read', apiErrorMessage(err, 'Please try again.')); }
  }, [markRead]);

  const onDismiss = useCallback(async (id) => {
    try { await dismissAlert(id); setSelected(null); }
    catch (err) { Alert.alert('Could not dismiss', apiErrorMessage(err, 'Please try again.')); }
  }, [dismissAlert]);

  const onResolve = useCallback(async (id, note) => {
    try { await resolveAlert(id, note); setSelected(null); Alert.alert('Alert resolved', 'This alert has been marked resolved.'); }
    catch (err) { Alert.alert('Could not resolve', apiErrorMessage(err, 'Please try again.')); }
  }, [resolveAlert]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      {/* Stats strip */}
      <View style={s.statsCard}>
        <View style={s.statCol}>
          <Text style={s.statValue}>{stats.total}</Text>
          <Text style={s.statLabel}>Alerts</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statCol}>
          <Text style={[s.statValue, { color: unread > 0 ? colors.accent : colors.textMuted }]}>{unread}</Text>
          <Text style={s.statLabel}>Unread</Text>
        </View>
        <View style={s.statDivider} />
        <View style={[s.statCol, { flex: 1.4 }]}>
          {sevBreakdown.length > 0 ? (
            <View style={s.sevWrap}>
              {sevBreakdown.map((r) => (
                <View key={r.severity} style={s.sevTag}>
                  <View style={[s.sevDot, { backgroundColor: r.color }]} />
                  <Text style={[s.sevCount, { color: r.color }]}>{r.count}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[s.statValue, { color: colors.success, fontSize: 18 }]}>All clear</Text>
          )}
          <Text style={s.statLabel}>By severity</Text>
        </View>
      </View>

      {/* Staff risk strip */}
      {staffRisks.length > 0 ? (
        <View style={s.staffSection}>
          <Text style={s.sectionTitle}>Staff risk scores</Text>
          <ScrollView horizontal
        style={{ flexGrow: 0, flexShrink: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
            {staffRisks.map((st) => <StaffChip key={st.id} staff={st} s={s} />)}
          </ScrollView>
        </View>
      ) : null}

      {/* Filter */}
      <View style={s.filterRow}>
        {[{ k: 'all', label: 'All alerts' }, { k: 'unread', label: `Unread${unread > 0 ? ` (${unread})` : ''}` }].map(({ k, label }) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, filter === k && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => setFilter(k)}
            activeOpacity={0.85}
          >
            <Text style={[s.filterChipText, filter === k && { color: '#fff' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Fraud & Risk</Text>
            <Text style={s.subtitle} numberOfLines={1}>Risk monitoring · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: (unread > 0 ? colors.error : colors.accent) + '18' }]}>
            <Ionicons name="shield-checkmark-outline" size={13} color={unread > 0 ? colors.error : colors.accent} />
            <Text style={[s.headerBadgeText, { color: unread > 0 ? colors.error : colors.accent }]}>{unread}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its risk alerts." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load risk alerts" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={visible}
          keyExtractor={(a) => String(a.id)}
          estimatedItemSize={112}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          ListEmptyComponent={
            filter === 'unread' ? (
              <EmptyState icon="✅" title="Nothing unread" subtitle="You're all caught up on risk alerts." />
            ) : (
              <EmptyState icon="🛡️" title="No risk alerts" subtitle="No suspicious staff activity detected for this outlet." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <AlertRow alert={item} colors={colors} s={s} fmt={fmt} onOpen={setSelected} />
            </View>
          )}
        />
      )}

      <DetailModal
        alert={selected}
        colors={colors}
        s={s}
        fmt={fmt}
        onClose={() => setSelected(null)}
        actions={{ onMarkRead, onDismiss, onResolve, isMarkingRead, isDismissing, isResolving }}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 4 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    // Stats strip
    statsCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16 },
    statCol: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    statDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    statValue: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    statLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },
    sevWrap: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 24 },
    sevTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    sevDot: { width: 8, height: 8, borderRadius: 4 },
    sevCount: { fontSize: 15, fontWeight: '800' },

    // Staff strip
    staffSection: { marginTop: 14 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
    staffChip: { width: 150, borderRadius: 14, borderWidth: 1, padding: 12 },
    staffChipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    staffName: { fontSize: 14, fontWeight: '800', color: c.text, flexShrink: 1 },
    scoreBadge: { minWidth: 26, paddingHorizontal: 6, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    scoreText: { fontSize: 12, fontWeight: '800', color: '#fff' },
    staffLevel: { fontSize: 12, fontWeight: '800', marginTop: 6 },
    staffMeta: { fontSize: 11, color: c.textMuted, marginTop: 2, fontWeight: '600' },

    // Filter
    filterRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Alert row
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    typeText: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 1 },
    unreadDot: { width: 7, height: 7, borderRadius: 4 },
    alertTitle: { fontSize: 14.5, fontWeight: '700', color: c.text, marginTop: 3, letterSpacing: -0.2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
    metaText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    metaDot: { fontSize: 12, color: c.textMuted },
    amountBox: { alignItems: 'flex-end' },
    amount: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
    amountLabel: { fontSize: 10, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // Bottom sheet
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '90%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    sheetAmount: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 8, marginBottom: 6 },
    sheetAmountLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted, letterSpacing: 0 },
    sheetAlertTitle: { fontSize: 15.5, fontWeight: '800', color: c.text, marginTop: 6, letterSpacing: -0.2 },
    sheetDesc: { fontSize: 14, color: c.textSecondary, lineHeight: 21, marginTop: 8, fontWeight: '500' },

    detailRows: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4, marginTop: 16 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    detailLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    detailValue: { fontSize: 13.5, color: c.text, fontWeight: '700', flexShrink: 1, textAlign: 'right' },

    noteLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginTop: 18, marginBottom: 8 },
    noteInput: { minHeight: 60, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, fontSize: 14, color: c.text, backgroundColor: c.card, textAlignVertical: 'top' },

    actionsCol: { marginTop: 18, gap: 10 },
    resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 52, borderRadius: 13, backgroundColor: c.success },
    resolveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    actionRow: { flexDirection: 'row', gap: 10 },
    ghostBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14 },
    dismissBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 13, borderWidth: 1, borderColor: c.error + '55', backgroundColor: c.error + '10' },
    closeBtn: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 2 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
