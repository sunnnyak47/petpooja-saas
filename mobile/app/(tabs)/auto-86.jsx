/**
 * 86 Board — live menu-item availability across delivery channels.
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * The mobile 86 board for the SELECTED outlet: every active menu item with its
 * stock status and limiting ingredient, a manual availability toggle per item
 * (fans out to every connected aggregator), a "re-sync vs stock" action, and an
 * Auto-86 switch that pauses items automatically when they run out of stock.
 * Data + pure transforms live in src/hooks/useAuto86.js; every request is
 * outlet-scoped. Toggle / sync / config need MANAGE_MENU — a 403 is surfaced kindly.
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
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { EmptyState } from '../../src/components/EmptyState';
import {
  useAuto86,
  filterItems,
  pillStatusFor,
  stockLine,
  STATUS_META,
} from '../../src/hooks/useAuto86';

const OUT_TONE = '#ef4444';
const LOW_TONE = '#f59e0b';

/** Resolve a status/tone key to a concrete colour against the theme. */
function toneColor(key, colors) {
  if (key === 'out') return OUT_TONE;
  if (key === 'low') return LOW_TONE;
  if (key === 'ok') return colors.success;
  return colors.textMuted; // 'muted'
}

function apiErrorMessage(err, fallback) {
  const msg = err?.message;
  if (msg && /permission|denied|forbidden/i.test(msg)) {
    return "You don't have permission to do that. Ask an owner or manager.";
  }
  return msg || fallback;
}

// ─── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ statusKey, colors, s }) {
  const meta = STATUS_META[statusKey] || STATUS_META.ok;
  const tone = toneColor(statusKey, colors);
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{meta.label}</Text>
    </View>
  );
}

// ─── One item row ───────────────────────────────────────────────────────────
function ItemRow({ item, colors, s, onToggle, disabled }) {
  const statusKey = pillStatusFor(item);
  const stock = stockLine(item);
  const off = !item.is_available;
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View style={[s.card, off && { opacity: 0.65 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.itemName} numberOfLines={1}>{item.name || '—'}</Text>
            <StatusPill statusKey={statusKey} colors={colors} s={s} />
          </View>
          <Text style={[s.stockText, { color: toneColor(stock.tone, colors) }]} numberOfLines={1}>
            {stock.text}
          </Text>
        </View>
        <Switch
          value={!!item.is_available}
          disabled={disabled}
          onValueChange={(next) => onToggle(item, next)}
          trackColor={{ false: colors.border, true: colors.success }}
          thumbColor="#fff"
          ios_backgroundColor={colors.border}
        />
      </View>
    </Animated.View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function Auto86Screen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    items, summary, autoEnabled,
    isLoading, isError, isRefetching, refetch,
    toggleItem, resync, isSyncing, setAutoEnabled, isSavingConfig,
    hasOutlet,
  } = useAuto86();

  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState(null);

  const filtered = useMemo(() => filterItems(items, query), [items, query]);
  const outletName = currentOutlet?.name || 'Selected outlet';

  const onToggle = useCallback(async (item, next) => {
    setPendingId(item.id);
    try {
      await toggleItem(item.id, next);
    } catch (err) {
      Alert.alert('Could not update item', apiErrorMessage(err, 'Please try again.'));
    } finally {
      setPendingId(null);
    }
  }, [toggleItem]);

  const onResync = useCallback(async () => {
    try {
      const res = await resync();
      const changed = Array.isArray(res?.changed) ? res.changed.length : 0;
      Alert.alert(
        'Re-sync complete',
        changed === 0 ? 'Everything is already in sync.' : `Updated ${changed} item${changed === 1 ? '' : 's'}.`
      );
    } catch (err) {
      Alert.alert('Sync failed', apiErrorMessage(err, 'Please try again.'));
    }
  }, [resync]);

  const onToggleAuto = useCallback(async (next) => {
    try {
      await setAutoEnabled(next);
    } catch (err) {
      Alert.alert('Could not update setting', apiErrorMessage(err, 'Please try again.'));
    }
  }, [setAutoEnabled]);

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={s.summaryValue}>{summary.total ?? items.length}</Text>
          <Text style={s.summaryLabel}>Total</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: OUT_TONE }]}>{summary.out ?? 0}</Text>
          <Text style={s.summaryLabel}>86'd</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: LOW_TONE }]}>{summary.low ?? 0}</Text>
          <Text style={s.summaryLabel}>Low</Text>
        </View>
      </View>

      {/* Auto-86 config */}
      <View style={s.autoCard}>
        <View style={[s.autoIcon, { backgroundColor: (autoEnabled ? colors.success : colors.textMuted) + '18' }]}>
          <Ionicons name="power" size={17} color={autoEnabled ? colors.success : colors.textMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.autoTitle}>Auto-86</Text>
          <Text style={s.autoSub} numberOfLines={2}>Auto-pause items when stock runs out</Text>
        </View>
        <Switch
          value={autoEnabled}
          disabled={isSavingConfig}
          onValueChange={onToggleAuto}
          trackColor={{ false: colors.border, true: colors.success }}
          thumbColor="#fff"
          ios_backgroundColor={colors.border}
        />
      </View>

      {/* Re-sync */}
      <TouchableOpacity
        style={[s.resyncBtn, isSyncing && { opacity: 0.6 }]}
        onPress={onResync}
        disabled={isSyncing}
        activeOpacity={0.85}
      >
        {isSyncing
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Ionicons name="sync" size={17} color={colors.accent} />}
        <Text style={s.resyncText}>{isSyncing ? 'Re-syncing…' : 'Re-sync now'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MENU · AVAILABILITY</Text>
            <Text style={s.title}>86 Board</Text>
            <Text style={s.subtitle} numberOfLines={1}>Pause items across channels · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: OUT_TONE + '18' }]}>
            <Ionicons name="remove-circle-outline" size={13} color={OUT_TONE} />
            <Text style={[s.headerBadgeText, { color: OUT_TONE }]}>{summary.out ?? 0}</Text>
          </View>
        </View>

        {hasOutlet ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search items…"
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
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its 86 board." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Couldn't load the 86 board" subtitle="Something went wrong. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          estimatedItemSize={84}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            items.length === 0 ? (
              <EmptyState icon="🍽️" title="No menu items yet" subtitle="Active menu items will appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No items match your search." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <ItemRow
                item={item}
                colors={colors}
                s={s}
                onToggle={onToggle}
                disabled={pendingId === item.id}
              />
            </View>
          )}
        />
      )}
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

    autoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginTop: 12 },
    autoIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    autoTitle: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    autoSub: { fontSize: 12.5, color: c.textSecondary, marginTop: 2, fontWeight: '500' },

    resyncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, height: 46, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    resyncText: { color: c.accent, fontWeight: '800', fontSize: 14.5 },

    // Item card
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    itemName: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    stockText: { fontSize: 12.5, marginTop: 4, fontWeight: '600' },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  });
}
