/**
 * Promo Codes — SaaS subscription discount codes.
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * Platform-level promo codes applied at plan checkout (TRIAL / STARTER / PRO /
 * ENTERPRISE) — distinct from the outlet-level Offers & Discounts screen. Browse
 * codes with a usage summary, view a code's detail, toggle it active/inactive,
 * create a new code, and delete one. Data + pure transforms live in
 * src/hooks/usePromoCodes.js. Writes require the sa.promos.manage permission —
 * a 403 is surfaced kindly.
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
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import {
  usePromoCodes,
  filterPromos,
  summarizePromos,
  discountLabel,
  promoStatus,
  PLANS,
  DISCOUNT_TYPES,
  buildCreatePayload,
} from '../../src/hooks/usePromoCodes';

const STATUS_META = {
  active: { label: 'Active', tone: '#16a34a' },
  inactive: { label: 'Inactive', tone: '#94a3b8' },
  expired: { label: 'Expired', tone: '#dc2626' },
  maxed: { label: 'Maxed out', tone: '#d97706' },
};

const PLAN_TONE = { TRIAL: '#64748b', STARTER: '#2563eb', PRO: '#7c3aed', ENTERPRISE: '#16a34a' };

function fmtDate(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return null; }
}

function apiErrorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.message;
  if (err?.response?.status === 403) return "You don't have permission to do that. Ask a platform admin.";
  return msg || fallback;
}

// ─── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ status, s }) {
  const meta = STATUS_META[status] || STATUS_META.inactive;
  return (
    <View style={[s.pill, { backgroundColor: meta.tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: meta.tone }]} />
      <Text style={[s.pillText, { color: meta.tone }]}>{meta.label}</Text>
    </View>
  );
}

// ─── Plan chips ─────────────────────────────────────────────────────────────
function PlanChips({ plans, s }) {
  const list = Array.isArray(plans) ? plans : [];
  if (list.length === 0) return null;
  return (
    <View style={s.planWrap}>
      {list.map((p) => (
        <View key={p} style={[s.planChip, { borderColor: (PLAN_TONE[p] || '#64748b') + '55' }]}>
          <Text style={[s.planChipText, { color: PLAN_TONE[p] || '#64748b' }]}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── One row ────────────────────────────────────────────────────────────────
function PromoRow({ promo, symbol, s, colors, onOpen }) {
  const status = promoStatus(promo);
  const usage = promo.max_uses
    ? `${promo.used_count || 0} / ${promo.max_uses} used`
    : `${promo.used_count || 0} used`;
  const until = fmtDate(promo.valid_until);
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(promo)}>
        <View style={s.cardTop}>
          <Text style={s.code} numberOfLines={1}>{promo.code}</Text>
          <StatusPill status={status} s={s} />
        </View>
        <View style={s.metaRow}>
          <View style={s.discountBadge}>
            <Ionicons
              name={promo.discount_type === 'PERCENT' ? 'pricetag-outline' : 'cash-outline'}
              size={13}
              color={colors.accent}
            />
            <Text style={s.discountText}>{discountLabel(promo, symbol)}</Text>
          </View>
          <Text style={s.usage}>{usage}</Text>
        </View>
        {promo.description ? <Text style={s.desc} numberOfLines={1}>{promo.description}</Text> : null}
        <PlanChips plans={promo.applicable_plans} s={s} />
        {until ? <Text style={s.validUntil}>Valid until {until}</Text> : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Detail sheet (toggle + delete) ─────────────────────────────────────────
function DetailModal({ promo, symbol, s, colors, onClose, onToggle, onDelete, isUpdating, isDeleting }) {
  const status = promo ? promoStatus(promo) : 'inactive';
  const created = promo ? fmtDate(promo.created_at) : null;
  const until = promo ? fmtDate(promo.valid_until) : null;

  const confirmDelete = () => {
    Alert.alert('Delete promo code', `Remove "${promo.code}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(promo.id) },
    ]);
  };

  return (
    <Modal visible={!!promo} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          {promo ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{promo.code}</Text>
                  {created ? <Text style={s.sheetSub}>Created {created}</Text> : null}
                </View>
                <StatusPill status={status} s={s} />
              </View>

              <Text style={s.sheetAmount}>{discountLabel(promo, symbol)}</Text>

              <View style={s.detailRows}>
                <DetailRow label="Type" value={promo.discount_type === 'PERCENT' ? 'Percentage' : 'Flat amount'} s={s} />
                <DetailRow
                  label="Usage"
                  value={promo.max_uses ? `${promo.used_count || 0} of ${promo.max_uses}` : `${promo.used_count || 0} (unlimited)`}
                  s={s}
                />
                {until ? <DetailRow label="Valid until" value={until} s={s} /> : null}
                {promo.description ? <DetailRow label="Description" value={promo.description} s={s} /> : null}
              </View>

              {Array.isArray(promo.applicable_plans) && promo.applicable_plans.length > 0 ? (
                <View style={s.planBlock}>
                  <Text style={s.planBlockTitle}>Applicable plans</Text>
                  <PlanChips plans={promo.applicable_plans} s={s} />
                </View>
              ) : null}

              <TouchableOpacity
                style={[s.toggleBtn, { borderColor: colors.border }, isUpdating && { opacity: 0.6 }]}
                onPress={() => onToggle(promo)}
                disabled={isUpdating}
                activeOpacity={0.85}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Ionicons
                      name={promo.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                      size={18}
                      color={colors.accent}
                    />
                    <Text style={[s.toggleBtnText, { color: colors.accent }]}>
                      {promo.is_active ? 'Deactivate code' : 'Activate code'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.deleteTrigger, isDeleting && { opacity: 0.6 }]}
                onPress={confirmDelete}
                disabled={isDeleting}
                activeOpacity={0.85}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={17} color="#dc2626" />
                    <Text style={s.deleteTriggerText}>Delete this code</Text>
                  </>
                )}
              </TouchableOpacity>

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

function DetailRow({ label, value, s }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Create sheet ───────────────────────────────────────────────────────────
const EMPTY_FORM = {
  code: '',
  discount_type: 'PERCENT',
  discount_value: '10',
  applicable_plans: ['STARTER', 'PRO', 'ENTERPRISE'],
  max_uses: '',
  valid_until: '',
  description: '',
};

function CreateModal({ visible, colors, symbol, s, onClose, onCreate, isCreating }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const close = () => { setForm(EMPTY_FORM); onClose(); };

  const togglePlan = (plan) => setForm((f) => ({
    ...f,
    applicable_plans: f.applicable_plans.includes(plan)
      ? f.applicable_plans.filter((p) => p !== plan)
      : [...f.applicable_plans, plan],
  }));

  const submit = () => {
    const r = buildCreatePayload(form);
    if (!r.ok) { Alert.alert('Check the form', r.error); return; }
    onCreate(r.payload, close);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={s.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>New promo code</Text>
            <Text style={s.sheetSub}>A discount applied at plan checkout.</Text>

            <Text style={s.fieldLabel}>Code *</Text>
            <TextInput
              style={s.field}
              value={form.code}
              onChangeText={(v) => set('code')(v.toUpperCase())}
              placeholder="e.g. LAUNCH20"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
            />

            <Text style={s.fieldLabel}>Discount type</Text>
            <View style={s.segment}>
              {DISCOUNT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.segmentBtn, form.discount_type === t && { backgroundColor: colors.accent }]}
                  onPress={() => set('discount_type')(t)}
                  activeOpacity={0.85}
                >
                  <Text style={[s.segmentText, form.discount_type === t && { color: '#fff' }]}>
                    {t === 'PERCENT' ? 'Percentage %' : `Flat ${symbol}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>
              {form.discount_type === 'PERCENT' ? 'Discount (%) *' : `Discount (${symbol}) *`}
            </Text>
            <TextInput
              style={s.field}
              value={String(form.discount_value)}
              onChangeText={set('discount_value')}
              placeholder={form.discount_type === 'PERCENT' ? '10' : '15'}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={s.fieldLabel}>Applicable plans *</Text>
            <View style={s.planPickWrap}>
              {PLANS.map((p) => {
                const on = form.applicable_plans.includes(p);
                return (
                  <TouchableOpacity
                    key={p}
                    style={[s.planPick, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                    onPress={() => togglePlan(p)}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.planPickText, on && { color: '#fff' }]}>{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>Max uses</Text>
            <TextInput
              style={s.field}
              value={String(form.max_uses)}
              onChangeText={set('max_uses')}
              placeholder="Leave blank for unlimited"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />

            <Text style={s.fieldLabel}>Valid until</Text>
            <TextInput
              style={s.field}
              value={form.valid_until}
              onChangeText={set('valid_until')}
              placeholder="YYYY-MM-DD (optional)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput
              style={s.field}
              value={form.description}
              onChangeText={set('description')}
              placeholder="Optional note"
              placeholderTextColor={colors.textMuted}
            />

            <View style={s.sheetActions}>
              <TouchableOpacity style={s.ghostBtn} onPress={close} activeOpacity={0.85}>
                <Text style={s.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, isCreating && { opacity: 0.6 }]}
                onPress={submit}
                disabled={isCreating}
                activeOpacity={0.88}
              >
                {isCreating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Create code</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function PromoCodesScreen() {
  const { colors } = useTheme();
  const { symbol, isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    rows, isLoading, isError, isRefetching, refetch,
    createPromo, isCreating, toggleActive, isUpdating, deletePromo, isDeleting,
  } = usePromoCodes();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const summary = useMemo(() => summarizePromos(rows), [rows]);
  const filtered = useMemo(() => filterPromos(rows, { q: query, status }), [rows, query, status]);

  const onCreate = useCallback(async (payload, close) => {
    try {
      await createPromo(payload);
      close();
      Alert.alert('Promo code created', `"${payload.code}" is now live.`);
    } catch (err) {
      Alert.alert('Could not create', apiErrorMessage(err, 'Please try again.'));
    }
  }, [createPromo]);

  const onToggle = useCallback(async (promo) => {
    try {
      await toggleActive(promo);
      setSelected((prev) => (prev ? { ...prev, is_active: !prev.is_active } : prev));
    } catch (err) {
      Alert.alert('Could not update', apiErrorMessage(err, 'Please try again.'));
    }
  }, [toggleActive]);

  const onDelete = useCallback(async (id) => {
    try {
      await deletePromo(id);
      setSelected(null);
      Alert.alert('Promo code deleted', 'The code has been removed.');
    } catch (err) {
      Alert.alert('Could not delete', apiErrorMessage(err, 'Please try again.'));
    }
  }, [deletePromo]);

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={s.summaryValue}>{summary.total}</Text>
          <Text style={s.summaryLabel}>Codes</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.accent }]}>{summary.active}</Text>
          <Text style={s.summaryLabel}>Active</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.textMuted }]}>{summary.uses}</Text>
          <Text style={s.summaryLabel}>Total uses</Text>
        </View>
      </View>

      <View style={s.filterRow}>
        {['all', 'active', 'inactive'].map((k) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, status === k && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => setStatus(k)}
            activeOpacity={0.85}
          >
            <Text style={[s.filterChipText, status === k && { color: '#fff' }]}>
              {k === 'all' ? 'All' : k === 'active' ? 'Active' : 'Inactive'}
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
            <Text style={s.eyebrow}>PLATFORM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Promo Codes</Text>
            <Text style={s.subtitle} numberOfLines={1}>Subscription discount codes</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="pricetags-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{summary.total}</Text>
          </View>
        </View>

        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search code or description…"
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
      </SafeAreaView>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load promo codes" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          estimatedItemSize={132}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState icon="🏷️" title="No promo codes yet" subtitle="Create a discount code and it will appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No promo codes match your search or filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <PromoRow promo={item} symbol={symbol} s={s} colors={colors} onOpen={setSelected} />
            </View>
          )}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)} activeOpacity={0.9}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <DetailModal
        promo={selected}
        symbol={symbol}
        s={s}
        colors={colors}
        onClose={() => setSelected(null)}
        onToggle={onToggle}
        onDelete={onDelete}
        isUpdating={isUpdating}
        isDeleting={isDeleting}
      />
      <CreateModal
        visible={showCreate}
        colors={colors}
        symbol={symbol}
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

    filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Row card
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    code: { fontSize: 17, fontWeight: '800', color: c.text, letterSpacing: 0.5, flexShrink: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
    discountBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.accent + '14', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
    discountText: { fontSize: 12.5, fontWeight: '800', color: c.accent },
    usage: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    desc: { fontSize: 12.5, color: c.textSecondary, marginTop: 8 },
    validUntil: { fontSize: 11.5, color: c.textMuted, marginTop: 8, fontWeight: '600' },

    planWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    planChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    planChipText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // FAB
    fab: { position: 'absolute', right: 20, bottom: 26, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },

    // Bottom sheet
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '90%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    sheetAmount: { fontSize: 28, fontWeight: '800', color: c.accent, letterSpacing: -0.6, marginTop: 8, marginBottom: 12 },

    detailRows: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    detailLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    detailValue: { fontSize: 13.5, color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

    planBlock: { marginTop: 16 },
    planBlockTitle: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },

    toggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18, height: 48, borderRadius: 13, borderWidth: 1, backgroundColor: c.card },
    toggleBtnText: { fontWeight: '800', fontSize: 14.5 },
    deleteTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, height: 48, borderRadius: 13, borderWidth: 1, borderColor: '#dc262655', backgroundColor: '#dc262612' },
    deleteTriggerText: { color: '#dc2626', fontWeight: '800', fontSize: 14.5 },

    fieldLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginTop: 14, marginBottom: 6 },
    field: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.text, backgroundColor: c.card, fontWeight: '500' },

    segment: { flexDirection: 'row', gap: 8 },
    segmentBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    segmentText: { fontSize: 13.5, fontWeight: '700', color: c.textSecondary },

    planPickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    planPick: { paddingHorizontal: 14, height: 38, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    planPickText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },

    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
    ghostBtn: { paddingHorizontal: 18, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
    primaryBtn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: c.accent },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 12 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
