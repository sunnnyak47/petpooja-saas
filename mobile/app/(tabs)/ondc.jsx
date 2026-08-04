/**
 * ONDC Network — "Sell on India's open commerce network".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * The seller-side ONDC console for the SELECTED outlet: see the store's network
 * status (draft → under review → verified → live) with a go-live toggle, a quick
 * order/revenue summary, and the live ONDC order queue. Tap an order to view its
 * items + delivery details and take the seller action the network expects —
 * accept (with a prep time) / reject a new order, or advance an accepted order
 * through preparing → ready. Data + pure transforms live in src/hooks/useOndc.js;
 * every request is outlet-scoped. ONDC is India-only, so all money is INR.
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
import { EmptyState } from '../../src/components/EmptyState';
import {
  useOndc,
  filterOrders,
  summarizeOrders,
  formatMoney,
  orderStatusLabel,
  sellerStatusLabel,
  nextOrderStatus,
  isPendingOrder,
  orderItemCount,
  SELLER_STATUS,
  ORDER_STATUS,
  ORDER_FILTER_KEYS,
} from '../../src/hooks/useOndc';

function apiErrorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.message;
  if (err?.response?.status === 403) return "You don't have permission to do that. Ask an owner or manager.";
  return msg || fallback;
}

function fmtWhen(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}

// Tone for a seller status.
function sellerTone(status, colors) {
  switch (status) {
    case SELLER_STATUS.LIVE: return colors.success;
    case SELLER_STATUS.VERIFIED: return colors.accent;
    case SELLER_STATUS.UNDER_REVIEW: return colors.warning;
    default: return colors.textMuted;
  }
}

// Tone for an order status.
function orderTone(status, colors) {
  switch (status) {
    case ORDER_STATUS.PENDING: return colors.warning;
    case ORDER_STATUS.ACCEPTED:
    case ORDER_STATUS.PREPARING: return colors.accent;
    case ORDER_STATUS.READY: return colors.success;
    case ORDER_STATUS.PICKED_UP: return colors.textMuted;
    case ORDER_STATUS.REJECTED:
    case ORDER_STATUS.CANCELLED: return colors.error;
    default: return colors.textMuted;
  }
}

// ─── Status pill ────────────────────────────────────────────────────────────
function Pill({ tone, label, s }) {
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{label}</Text>
    </View>
  );
}

// ─── Seller status card ─────────────────────────────────────────────────────
function StatusCard({ profile, colors, s, onToggleLive, isToggling, onSubmit, isSubmitting }) {
  const status = profile?.status;
  const tone = sellerTone(status, colors);
  const isLive = status === SELLER_STATUS.LIVE;
  const canToggle = status === SELLER_STATUS.VERIFIED || status === SELLER_STATUS.LIVE;

  return (
    <View style={s.statusCard}>
      <View style={s.statusTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.statusStore} numberOfLines={1}>{profile?.store_name || 'ONDC store'}</Text>
          {profile?.subscriber_id ? (
            <Text style={s.statusSub} numberOfLines={1}>{profile.subscriber_id}</Text>
          ) : (
            <Text style={s.statusSub} numberOfLines={1}>Not registered on the network yet</Text>
          )}
        </View>
        <Pill tone={tone} label={sellerStatusLabel(status)} s={s} />
      </View>

      <View style={s.statusMetaRow}>
        {profile?.bpp_id ? <MetaChip icon="server-outline" text={profile.bpp_id} colors={colors} s={s} /> : null}
        {profile?.provider_id ? <MetaChip icon="pricetag-outline" text={profile.provider_id} colors={colors} s={s} /> : null}
        {typeof profile?.prep_time_minutes === 'number' ? (
          <MetaChip icon="time-outline" text={`${profile.prep_time_minutes} min prep`} colors={colors} s={s} />
        ) : null}
      </View>

      {canToggle ? (
        <TouchableOpacity
          style={[s.liveBtn, isLive ? s.liveBtnOff : s.liveBtnOn, isToggling && { opacity: 0.6 }]}
          onPress={() => onToggleLive(!isLive)}
          disabled={isToggling}
          activeOpacity={0.88}
        >
          {isToggling ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={isLive ? 'pause-circle-outline' : 'rocket-outline'} size={17} color="#fff" />
              <Text style={s.liveBtnText}>{isLive ? 'Take store offline' : 'Go live on ONDC'}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : status === SELLER_STATUS.UNDER_REVIEW ? (
        <View style={s.noteBox}>
          <Ionicons name="hourglass-outline" size={15} color={colors.warning} />
          <Text style={s.noteText}>Your store is under ONDC review. You'll be verified shortly.</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[s.submitBtn, isSubmitting && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={isSubmitting}
          activeOpacity={0.88}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={17} color="#fff" />
              <Text style={s.liveBtnText}>Submit for review</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function MetaChip({ icon, text, colors, s }) {
  return (
    <View style={s.metaChip}>
      <Ionicons name={icon} size={12} color={colors.textMuted} />
      <Text style={s.metaChipText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// ─── Analytics strip ────────────────────────────────────────────────────────
function AnalyticsStrip({ analytics, colors, s }) {
  const pending = analytics?.status_breakdown?.[ORDER_STATUS.PENDING] || 0;
  return (
    <View style={s.summaryCard}>
      <View style={s.summaryStat}>
        <Text style={s.summaryValue}>{analytics?.total_orders ?? 0}</Text>
        <Text style={s.summaryLabel}>Orders</Text>
      </View>
      <View style={s.summaryDivider} />
      <View style={s.summaryStat}>
        <Text style={[s.summaryValue, { color: colors.accent, fontSize: 17 }]}>{formatMoney(analytics?.total_revenue)}</Text>
        <Text style={s.summaryLabel}>Revenue</Text>
      </View>
      <View style={s.summaryDivider} />
      <View style={s.summaryStat}>
        <Text style={[s.summaryValue, { color: pending > 0 ? colors.warning : colors.textMuted }]}>{pending}</Text>
        <Text style={s.summaryLabel}>New</Text>
      </View>
    </View>
  );
}

// ─── One order row ──────────────────────────────────────────────────────────
function OrderRow({ order, colors, s, onOpen }) {
  const tone = orderTone(order.status, colors);
  const count = orderItemCount(order);
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(order)}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.customer} numberOfLines={1}>{order.customer_name || 'ONDC customer'}</Text>
            <Pill tone={tone} label={orderStatusLabel(order.status)} s={s} />
          </View>
          <Text style={s.meta} numberOfLines={1}>
            {count} item{count === 1 ? '' : 's'}{order.bap_id ? ` · ${order.bap_id}` : ''}
          </Text>
          <Text style={s.date}>{fmtWhen(order.created_at)}</Text>
        </View>
        <View style={s.amountBox}>
          <Text style={s.amount}>{formatMoney(order.grand_total)}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Order detail + actions ─────────────────────────────────────────────────
function OrderModal({ order, colors, s, onClose, actions }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [prep, setPrep] = useState('');

  const close = () => { setRejecting(false); setReason(''); setPrep(''); onClose(); };

  if (!order) return <Modal visible={false} transparent><View /></Modal>;

  const tone = orderTone(order.status, colors);
  const next = nextOrderStatus(order.status);
  const busy = actions.isAccepting || actions.isRejecting || actions.isAdvancing;

  const doAccept = () => {
    const n = parseInt(prep, 10);
    actions.onAccept(order.id, Number.isFinite(n) ? n : undefined);
  };
  const confirmReject = () => {
    const r = reason.trim();
    if (r.length < 3) { Alert.alert('Add a reason', 'Please give a short reason (at least 3 characters).'); return; }
    actions.onReject(order.id, r);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle} numberOfLines={1}>{order.customer_name || 'ONDC customer'}</Text>
                <Text style={s.sheetSub}>{fmtWhen(order.created_at)}</Text>
              </View>
              <Pill tone={tone} label={orderStatusLabel(order.status)} s={s} />
            </View>

            <Text style={s.sheetAmount}>{formatMoney(order.grand_total)}</Text>

            <View style={s.detailRows}>
              {order.customer_phone ? <DetailRow label="Phone" value={order.customer_phone} s={s} /> : null}
              {order.delivery_address ? <DetailRow label="Deliver to" value={order.delivery_address} s={s} /> : null}
              {order.payment_method ? <DetailRow label="Payment" value={`${order.payment_method}${order.payment_status ? ` · ${order.payment_status}` : ''}`} s={s} /> : null}
              {typeof order.delivery_fee === 'number' ? <DetailRow label="Delivery fee" value={formatMoney(order.delivery_fee)} s={s} /> : null}
              {typeof order.taxes === 'number' ? <DetailRow label="Tax" value={formatMoney(order.taxes)} s={s} /> : null}
              {order.ondc_order_id ? <DetailRow label="ONDC ref" value={String(order.ondc_order_id)} s={s} /> : null}
              {order.rejection_reason ? <DetailRow label="Rejected" value={order.rejection_reason} s={s} /> : null}
            </View>

            {Array.isArray(order.items) && order.items.length > 0 ? (
              <View style={s.linesBox}>
                <Text style={s.linesTitle}>Items</Text>
                {order.items.map((it, i) => (
                  <View key={i} style={s.lineRow}>
                    <Text style={s.lineDesc} numberOfLines={1}>{(it.quantity || 1)} × {it.name || 'Item'}</Text>
                    <Text style={s.lineAmt}>{formatMoney((Number(it.price) || 0) * (Number(it.quantity) || 1))}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Seller actions */}
            {isPendingOrder(order) ? (
              rejecting ? (
                <View style={s.actionBox}>
                  <Text style={s.fieldLabel}>Reason for rejection</Text>
                  <TextInput
                    style={s.reasonInput}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="e.g. item out of stock"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                  <View style={s.sheetActions}>
                    <TouchableOpacity style={s.ghostBtn} onPress={() => setRejecting(false)} activeOpacity={0.85}>
                      <Text style={s.ghostBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.dangerBtn, busy && { opacity: 0.6 }]} onPress={confirmReject} disabled={busy} activeOpacity={0.88}>
                      {actions.isRejecting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.dangerBtnText}>Confirm rejection</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={s.actionBox}>
                  <Text style={s.fieldLabel}>Prep time (minutes)</Text>
                  <TextInput
                    style={s.prepInput}
                    value={prep}
                    onChangeText={setPrep}
                    placeholder="30"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <View style={s.sheetActions}>
                    <TouchableOpacity style={[s.dangerGhostBtn, busy && { opacity: 0.6 }]} onPress={() => setRejecting(true)} disabled={busy} activeOpacity={0.85}>
                      <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                      <Text style={s.dangerGhostText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.primaryBtn, busy && { opacity: 0.6 }]} onPress={doAccept} disabled={busy} activeOpacity={0.88}>
                      {actions.isAccepting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Accept order</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )
            ) : next ? (
              <TouchableOpacity
                style={[s.advanceBtn, busy && { opacity: 0.6 }]}
                onPress={() => actions.onAdvance(order.id, next)}
                disabled={busy}
                activeOpacity={0.88}
              >
                {actions.isAdvancing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="arrow-forward-circle-outline" size={17} color="#fff" />
                    <Text style={s.primaryBtnText}>Mark {orderStatusLabel(next).toLowerCase()}</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={s.closeBtn} onPress={close} activeOpacity={0.85}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, s }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={3}>{value}</Text>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function OndcScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    hasOutlet, profile, analytics, rows,
    isLoading, isError, isRefetching, refetch,
    toggleLive, isToggling, submitForReview, isSubmitting,
    acceptOrder, isAccepting, rejectOrder, isRejecting, advanceOrder, isAdvancing,
  } = useOndc();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const counts = useMemo(() => summarizeOrders(rows), [rows]);
  const filtered = useMemo(() => filterOrders(rows, { q: query, status }), [rows, query, status]);

  const onToggleLive = useCallback(async (live) => {
    try {
      await toggleLive(live);
      Alert.alert(live ? 'You are live!' : 'Store offline', live ? 'Your store is now live on ONDC.' : 'Your store has been taken offline.');
    } catch (err) {
      Alert.alert('Could not update', apiErrorMessage(err, 'Please try again.'));
    }
  }, [toggleLive]);

  const onSubmit = useCallback(async () => {
    try {
      await submitForReview();
      Alert.alert('Submitted', 'Your store has been submitted for ONDC review.');
    } catch (err) {
      Alert.alert('Could not submit', apiErrorMessage(err, 'Complete your onboarding details on the web dashboard first.'));
    }
  }, [submitForReview]);

  const onAccept = useCallback(async (id, prepMinutes) => {
    try {
      await acceptOrder(id, prepMinutes);
      setSelected(null);
      Alert.alert('Order accepted', 'The customer has been notified.');
    } catch (err) {
      Alert.alert('Could not accept', apiErrorMessage(err, 'Please try again.'));
    }
  }, [acceptOrder]);

  const onReject = useCallback(async (id, reason) => {
    try {
      await rejectOrder(id, reason);
      setSelected(null);
      Alert.alert('Order rejected', 'The order has been rejected.');
    } catch (err) {
      Alert.alert('Could not reject', apiErrorMessage(err, 'Please try again.'));
    }
  }, [rejectOrder]);

  const onAdvance = useCallback(async (id, next) => {
    try {
      await advanceOrder(id, next);
      setSelected(null);
    } catch (err) {
      Alert.alert('Could not update', apiErrorMessage(err, 'Please try again.'));
    }
  }, [advanceOrder]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      {profile ? (
        <StatusCard
          profile={profile}
          colors={colors}
          s={s}
          onToggleLive={onToggleLive}
          isToggling={isToggling}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
        />
      ) : null}

      <AnalyticsStrip analytics={analytics} colors={colors} s={s} />

      <Text style={s.sectionLabel}>Orders</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        {ORDER_FILTER_KEYS.map((k) => {
          const active = status === k;
          const label = k === 'all' ? 'All' : orderStatusLabel(k);
          const n = counts[k] || 0;
          return (
            <TouchableOpacity
              key={k}
              style={[s.filterChip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => setStatus(k)}
              activeOpacity={0.85}
            >
              <Text style={[s.filterChipText, active && { color: '#fff' }]}>
                {label}{n ? ` ${n}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · ONDC</Text>
            <Text style={s.title}>ONDC Network</Text>
            <Text style={s.subtitle} numberOfLines={1}>Open commerce orders · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="globe-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{counts.all}</Text>
          </View>
        </View>

        {hasOutlet ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search customer, ref, buyer app…"
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
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its ONDC network status." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load ONDC" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(o) => String(o.id)}
          estimatedItemSize={96}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState icon="🛰️" title="No ONDC orders yet" subtitle="Once your store is live, network orders land here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No orders match your search or filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <OrderRow order={item} colors={colors} s={s} onOpen={setSelected} />
            </View>
          )}
        />
      )}

      <OrderModal
        order={selected}
        colors={colors}
        s={s}
        onClose={() => setSelected(null)}
        actions={{ onAccept, isAccepting, onReject, isRejecting, onAdvance, isAdvancing }}
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

    // Seller status card
    statusCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 12 },
    statusTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    statusStore: { fontSize: 17, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    statusSub: { fontSize: 12, color: c.textMuted, marginTop: 3, fontWeight: '500' },
    statusMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.pillBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, maxWidth: '100%' },
    metaChipText: { fontSize: 11, color: c.textSecondary, fontWeight: '600', flexShrink: 1 },

    liveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 13, marginTop: 14 },
    liveBtnOn: { backgroundColor: c.success },
    liveBtnOff: { backgroundColor: c.warning },
    liveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 13, marginTop: 14, backgroundColor: c.accent },
    noteBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: c.warning + '14', borderWidth: 1, borderColor: c.warning + '33' },
    noteText: { flex: 1, fontSize: 12.5, color: c.textSecondary, fontWeight: '600' },

    // Analytics
    summaryCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 16 },
    summaryStat: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    sectionLabel: { fontSize: 13, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 10 },

    filterRow: { gap: 8, paddingRight: 8 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Order row
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    customer: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    meta: { fontSize: 12.5, color: c.textSecondary, marginTop: 4, fontWeight: '600' },
    date: { fontSize: 11.5, color: c.textMuted, marginTop: 4, fontWeight: '600' },
    amountBox: { alignItems: 'flex-end', flexDirection: 'row', gap: 4 },
    amount: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // Bottom sheet
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

    actionBox: { marginTop: 18 },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 8 },
    prepInput: { height: 48, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card, fontWeight: '600' },
    reasonInput: { minHeight: 64, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, fontSize: 14, color: c.text, backgroundColor: c.card, textAlignVertical: 'top' },

    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    ghostBtn: { paddingHorizontal: 18, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
    dangerGhostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, height: 50, borderRadius: 13, borderWidth: 1, borderColor: c.error + '55', backgroundColor: c.error + '12' },
    dangerGhostText: { color: c.error, fontWeight: '800', fontSize: 14.5 },
    primaryBtn: { flex: 1, flexDirection: 'row', gap: 8, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: c.accent },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    advanceBtn: { flexDirection: 'row', gap: 8, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: c.accent, marginTop: 18 },
    dangerBtn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: c.error },
    dangerBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 12 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
