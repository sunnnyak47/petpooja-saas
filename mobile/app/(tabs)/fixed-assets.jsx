/**
 * Fixed Assets — "Asset register & depreciation".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * The fixed-asset register for the SELECTED outlet: totals (cost / accumulated
 * depreciation / net book value), a per-asset list with a depreciation progress
 * bar, add an asset, dispose or delete one, and run the monthly straight-line
 * depreciation batch for a 'YYYY-MM' period. Data + pure transforms live in
 * src/hooks/useFixedAssets.js; every request is outlet-scoped. Writes require
 * MANAGE_INVENTORY — a 403 is surfaced kindly.
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
  useFixedAssets,
  filterAssets,
  summarizeAssets,
  depreciationProgress,
  usefulLifeLabel,
  formatMoney,
  buildCreatePayload,
  currentPeriod,
  isValidPeriod,
} from '../../src/hooks/useFixedAssets';

const DISPOSED_TONE = '#ef4444';

function fmtDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return ''; }
}

function apiErrorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.message;
  if (err?.response?.status === 403) return "You don't have permission to do that. Ask an owner or manager.";
  return msg || fallback;
}

// ─── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ disposed, colors, s }) {
  const tone = disposed ? DISPOSED_TONE : colors.success;
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{disposed ? 'Disposed' : 'Active'}</Text>
    </View>
  );
}

// ─── One row ────────────────────────────────────────────────────────────────
function AssetRow({ asset, currency, colors, s, onOpen }) {
  const progress = depreciationProgress(asset);
  const pct = Math.round(progress * 100);
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(asset)}>
        <View style={s.cardTop}>
          <Text style={s.assetName} numberOfLines={1}>{asset.name}</Text>
          <StatusPill disposed={asset.is_disposed} colors={colors} s={s} />
        </View>
        <View style={s.metaRow}>
          {asset.category ? <Text style={s.metaChip} numberOfLines={1}>{asset.category}</Text> : null}
          <Text style={s.metaMuted}>{fmtDate(asset.purchase_date)}</Text>
        </View>

        <View style={s.valueRow}>
          <View style={s.valueCol}>
            <Text style={s.valueLabel}>Book value</Text>
            <Text style={[s.valueBig, asset.is_disposed && { color: colors.textMuted }]}>
              {formatMoney(currency, asset.book_value)}
            </Text>
          </View>
          <View style={[s.valueCol, { alignItems: 'flex-end' }]}>
            <Text style={s.valueLabel}>Cost</Text>
            <Text style={s.valueSmall}>{formatMoney(currency, asset.cost)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
        </View>

        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
        </View>
        <Text style={s.progressText}>{pct}% depreciated · {formatMoney(currency, asset.accumulated_depreciation)}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────
function DetailModal({ asset, currency, colors, s, onClose, onDispose, isDisposing, onDelete, isDeleting }) {
  if (!asset) return null;
  const confirmDispose = () => {
    Alert.alert('Mark as disposed?', `"${asset.name}" will stop depreciating and move to Disposed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dispose', style: 'destructive', onPress: () => onDispose(asset.id) },
    ]);
  };
  const confirmDelete = () => {
    Alert.alert('Delete asset?', `"${asset.name}" will be removed from the register. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(asset.id) },
    ]);
  };

  return (
    <Modal visible={!!asset} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{asset.name}</Text>
                <Text style={s.sheetSub}>{asset.category || 'Uncategorised'} · {fmtDate(asset.purchase_date)}</Text>
              </View>
              <StatusPill disposed={asset.is_disposed} colors={colors} s={s} />
            </View>

            <Text style={s.sheetAmount}>{formatMoney(currency, asset.book_value)}</Text>
            <Text style={s.sheetAmountLabel}>Net book value</Text>

            <View style={s.detailRows}>
              <DetailRow label="Cost" value={formatMoney(currency, asset.cost)} s={s} />
              <DetailRow label="Accumulated depreciation" value={formatMoney(currency, asset.accumulated_depreciation)} s={s} />
              <DetailRow label="Method" value={String(asset.method || 'straight_line').replace('_', ' ')} s={s} />
              <DetailRow label="Useful life" value={usefulLifeLabel(asset.useful_life_months)} s={s} />
              <DetailRow label="Purchased" value={fmtDate(asset.purchase_date)} s={s} />
            </View>

            {!asset.is_disposed ? (
              <TouchableOpacity style={[s.warnBtn, isDisposing && { opacity: 0.6 }]} onPress={confirmDispose} disabled={isDisposing} activeOpacity={0.85}>
                {isDisposing ? <ActivityIndicator size="small" color={DISPOSED_TONE} /> : (
                  <>
                    <Ionicons name="archive-outline" size={17} color={DISPOSED_TONE} />
                    <Text style={s.warnBtnText}>Mark as disposed</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={[s.dangerGhostBtn, isDeleting && { opacity: 0.6 }]} onPress={confirmDelete} disabled={isDeleting} activeOpacity={0.85}>
              {isDeleting ? <ActivityIndicator size="small" color={DISPOSED_TONE} /> : (
                <>
                  <Ionicons name="trash-outline" size={17} color={DISPOSED_TONE} />
                  <Text style={s.warnBtnText}>Delete from register</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.85}>
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
      <Text style={s.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────
function CreateModal({ visible, colors, s, onClose, onCreate, isCreating }) {
  const empty = { name: '', category: '', purchase_date: currentPeriod() + '-01', cost: '', salvage_value: '', useful_life_months: '60' };
  const [form, setForm] = useState(empty);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => { setForm(empty); onClose(); };

  const submit = () => {
    const r = buildCreatePayload(form);
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
            <Text style={s.sheetTitle}>Add fixed asset</Text>
            <Text style={s.sheetSub}>It will depreciate straight-line each month.</Text>

            <Text style={s.fieldLabel}>Name *</Text>
            <TextInput
              style={s.field}
              value={form.name}
              onChangeText={set('name')}
              placeholder="e.g. Espresso machine"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={s.fieldLabel}>Category</Text>
            <TextInput
              style={s.field}
              value={form.category}
              onChangeText={set('category')}
              placeholder="e.g. Kitchen equipment"
              placeholderTextColor={colors.textMuted}
            />

            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Cost *</Text>
                <TextInput
                  style={s.field}
                  value={form.cost}
                  onChangeText={set('cost')}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Salvage value</Text>
                <TextInput
                  style={s.field}
                  value={form.salvage_value}
                  onChangeText={set('salvage_value')}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Purchase date *</Text>
                <TextInput
                  style={s.field}
                  value={form.purchase_date}
                  onChangeText={set('purchase_date')}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Life (months) *</Text>
                <TextInput
                  style={s.field}
                  value={String(form.useful_life_months)}
                  onChangeText={set('useful_life_months')}
                  placeholder="60"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={s.sheetActions}>
              <TouchableOpacity style={s.ghostBtn} onPress={close} activeOpacity={0.85}>
                <Text style={s.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.primaryBtn, isCreating && { opacity: 0.6 }]} onPress={submit} disabled={isCreating} activeOpacity={0.88}>
                {isCreating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Add asset</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Run depreciation modal ────────────────────────────────────────────────────
function DepreciationModal({ visible, colors, s, onClose, onRun, isRunning }) {
  const [period, setPeriod] = useState(currentPeriod());

  const submit = () => {
    const p = period.trim();
    if (!isValidPeriod(p)) { Alert.alert('Check the period', "Enter the period as YYYY-MM (e.g. 2026-08)."); return; }
    onRun(p);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Run depreciation</Text>
          <Text style={s.sheetSub}>Posts one straight-line entry per active asset for the month. Running the same period twice is safe.</Text>

          <Text style={s.fieldLabel}>Period *</Text>
          <TextInput
            style={s.field}
            value={period}
            onChangeText={setPeriod}
            placeholder="YYYY-MM"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <View style={s.sheetActions}>
            <TouchableOpacity style={s.ghostBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={s.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primaryBtn, isRunning && { opacity: 0.6 }]} onPress={submit} disabled={isRunning} activeOpacity={0.88}>
              {isRunning ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Run</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function FixedAssetsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { currency, isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    assets, totals, isLoading, isError, isRefetching, refetch,
    createAsset, isCreating, disposeAsset, isDisposing, deleteAsset, isDeleting,
    runDepreciation, isRunning, hasOutlet,
  } = useFixedAssets();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDepr, setShowDepr] = useState(false);

  const counts = useMemo(() => summarizeAssets(assets), [assets]);
  const filtered = useMemo(() => filterAssets(assets, { q: query, status }), [assets, query, status]);

  const onCreate = useCallback(async (payload, close) => {
    try {
      await createAsset(payload);
      close();
      Alert.alert('Asset added', `"${payload.name}" is now in the register.`);
    } catch (err) {
      Alert.alert('Could not add', apiErrorMessage(err, 'Please try again.'));
    }
  }, [createAsset]);

  const onDispose = useCallback(async (id) => {
    try {
      await disposeAsset(id);
      setSelected(null);
      Alert.alert('Marked as disposed', 'The asset will no longer depreciate.');
    } catch (err) {
      Alert.alert('Could not update', apiErrorMessage(err, 'Please try again.'));
    }
  }, [disposeAsset]);

  const onDelete = useCallback(async (id) => {
    try {
      await deleteAsset(id);
      setSelected(null);
      Alert.alert('Deleted', 'The asset was removed from the register.');
    } catch (err) {
      Alert.alert('Could not delete', apiErrorMessage(err, 'Please try again.'));
    }
  }, [deleteAsset]);

  const onRun = useCallback(async (period) => {
    try {
      const res = await runDepreciation(period);
      const r = res?.data || res || {};
      setShowDepr(false);
      Alert.alert(
        'Depreciation run',
        `${period}: ${r.assets_depreciated ?? 0} asset(s) depreciated · ${formatMoney(currency, r.total_amount ?? 0)} posted.`
      );
    } catch (err) {
      Alert.alert('Could not run', apiErrorMessage(err, 'Please try again.'));
    }
  }, [runDepreciation, currency]);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(currency, totals.cost)}</Text>
          <Text style={s.summaryLabel}>Cost</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: DISPOSED_TONE }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(currency, totals.accumulated_depreciation)}</Text>
          <Text style={s.summaryLabel}>Depreciation</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.accent }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(currency, totals.book_value)}</Text>
          <Text style={s.summaryLabel}>Book value</Text>
        </View>
      </View>

      <TouchableOpacity style={s.runBtn} onPress={() => setShowDepr(true)} activeOpacity={0.85}>
        <Ionicons name="play-circle-outline" size={18} color={colors.accent} />
        <Text style={s.runBtnText}>Run monthly depreciation</Text>
      </TouchableOpacity>

      <View style={s.filterRow}>
        {[['all', 'All'], ['active', 'Active'], ['disposed', 'Disposed']].map(([k, label]) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, status === k && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => setStatus(k)}
            activeOpacity={0.85}
          >
            <Text style={[s.filterChipText, status === k && { color: '#fff' }]}>{label}</Text>
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
            <Text style={s.title}>Fixed Assets</Text>
            <Text style={s.subtitle} numberOfLines={1}>Register & depreciation · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="cube-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{counts.total}</Text>
          </View>
        </View>

        {hasOutlet ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search name or category…"
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
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its fixed assets." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load assets" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(a) => a.id}
          estimatedItemSize={150}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            assets.length === 0 ? (
              <EmptyState icon="📦" title="No fixed assets yet" subtitle="Add equipment or fit-out and it will appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No assets match your search or filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <AssetRow asset={item} currency={currency} colors={colors} s={s} onOpen={setSelected} />
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
        asset={selected}
        currency={currency}
        colors={colors}
        s={s}
        onClose={() => setSelected(null)}
        onDispose={onDispose}
        isDisposing={isDisposing}
        onDelete={onDelete}
        isDeleting={isDeleting}
      />
      <CreateModal
        visible={showCreate}
        colors={colors}
        s={s}
        onClose={() => setShowCreate(false)}
        onCreate={onCreate}
        isCreating={isCreating}
      />
      <DepreciationModal
        visible={showDepr}
        colors={colors}
        s={s}
        onClose={() => setShowDepr(false)}
        onRun={onRun}
        isRunning={isRunning}
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
    summaryValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
    summaryLabel: { fontSize: 10.5, color: c.textMuted, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.3 },

    runBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, height: 46, borderRadius: 13, borderWidth: 1, borderColor: c.accent + '55', backgroundColor: c.accent + '12' },
    runBtnText: { color: c.accent, fontWeight: '800', fontSize: 14 },

    filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Row card
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    assetName: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.2, flex: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    metaChip: { fontSize: 11.5, color: c.textSecondary, fontWeight: '700', backgroundColor: c.pillBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
    metaMuted: { fontSize: 11.5, color: c.textMuted, fontWeight: '600' },

    valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 12 },
    valueCol: { flex: 1 },
    valueLabel: { fontSize: 10.5, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 },
    valueBig: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    valueSmall: { fontSize: 14, fontWeight: '700', color: c.textSecondary },

    progressTrack: { height: 6, borderRadius: 3, backgroundColor: c.border, marginTop: 12, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3 },
    progressText: { fontSize: 11, color: c.textMuted, fontWeight: '600', marginTop: 6 },

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
    sheetTitle: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    sheetAmount: { fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.8, marginTop: 10 },
    sheetAmountLabel: { fontSize: 12, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 12 },

    detailRows: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    detailLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    detailValue: { fontSize: 13.5, color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'right', textTransform: 'capitalize' },

    warnBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, height: 48, borderRadius: 13, borderWidth: 1, borderColor: DISPOSED_TONE + '55', backgroundColor: DISPOSED_TONE + '12' },
    dangerGhostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, height: 48, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    warnBtnText: { color: DISPOSED_TONE, fontWeight: '800', fontSize: 14.5 },

    fieldRow: { flexDirection: 'row', gap: 12 },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginTop: 14, marginBottom: 6 },
    field: { height: 48, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card, fontWeight: '500' },

    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    ghostBtn: { paddingHorizontal: 18, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
    primaryBtn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: c.accent },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 12 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
