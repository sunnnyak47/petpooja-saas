/**
 * Festival Mode — "Festivals & surge".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated
 *
 * Festival / surge configs for the SELECTED outlet: see the currently-active mode,
 * every saved config (name · date range · surcharge/uplift · window status) and
 * flip any config on/off with a Switch — activating one deactivates the rest, so
 * the active config is highlighted. A read-only master catalogue lists the soonest
 * upcoming festivals for reference. Data + pure transforms live in
 * src/hooks/useFestival.js + src/lib/festival.js; every request is outlet-scoped.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import { useFestival } from '../../src/hooks/useFestival';
import {
  configId,
  festivalName,
  festivalEmoji,
  configDateRange,
  formatOfferValue,
  offerHeadline,
  offerOf,
  isConfigActive,
  festivalStatus,
  statusMeta,
  timeUntil,
  countActive,
  upcomingFromMaster,
} from '../../src/lib/festival';

function toneColor(tone, colors) {
  if (tone === 'success') return colors.success;
  if (tone === 'accent') return colors.accent;
  return colors.textMuted;
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status, colors, s }) {
  const meta = statusMeta(status);
  if (!meta.label) return null;
  const tone = toneColor(meta.tone, colors);
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{meta.label}</Text>
    </View>
  );
}

// ─── Active banner ──────────────────────────────────────────────────────────
function ActiveBanner({ active, colors, s, fmt }) {
  const offer = offerOf(active);
  const badge = formatOfferValue(active);
  const headline = offerHeadline(active);
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={s.activeBanner}>
      <View style={s.activeTopRow}>
        <View style={s.activeLive}>
          <View style={s.liveDot} />
          <Text style={s.activeLiveText}>ACTIVE NOW</Text>
        </View>
        <Text style={s.activeEmoji}>{festivalEmoji(active)}</Text>
      </View>
      <Text style={s.activeName} numberOfLines={2}>{festivalName(active)}</Text>
      <Text style={s.activeMeta} numberOfLines={1}>
        {configDateRange(active) || 'No dates set'}
      </Text>
      {headline || badge ? (
        <View style={s.activeOfferRow}>
          {badge ? <Text style={s.activeBadge}>{badge}</Text> : null}
          <Text style={s.activeOfferText} numberOfLines={1}>
            {headline}
            {offer?.minOrder ? `  ·  min ${fmt(offer.minOrder)}` : ''}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

// ─── Config row (with toggle) ────────────────────────────────────────────────
function ConfigRow({ config, colors, s, fmt, onToggle, isBusy, index }) {
  const on = isConfigActive(config);
  const status = festivalStatus(config);
  const badge = formatOfferValue(config);
  const headline = offerHeadline(config);
  const offer = offerOf(config);

  return (
    <Animated.View entering={FadeInDown.duration(220).delay(Math.min(index, 6) * 40)}>
      <View style={[s.card, on && s.cardActive]}>
        <View style={s.cardAvatar}>
          <Text style={s.cardEmoji}>{festivalEmoji(config)}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.cardName} numberOfLines={1}>{festivalName(config)}</Text>
            <StatusPill status={status} colors={colors} s={s} />
          </View>

          <Text style={s.cardDates} numberOfLines={1}>
            {configDateRange(config) || 'No dates set'}
          </Text>

          <View style={s.cardOfferRow}>
            {badge ? (
              <View style={s.upliftChip}>
                <Ionicons name="trending-up" size={11} color={colors.warning} />
                <Text style={s.upliftText}>{badge}</Text>
              </View>
            ) : null}
            {headline ? (
              <Text style={s.cardOffer} numberOfLines={1}>
                {headline}
                {offer?.minOrder ? `  ·  min ${fmt(offer.minOrder)}` : ''}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.switchBox}>
          {isBusy ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Switch
              value={on}
              onValueChange={() => onToggle(config)}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#fff"
              ios_backgroundColor={colors.border}
            />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Master (catalogue) row — read only ──────────────────────────────────────
function CatalogueRow({ def, colors, s }) {
  return (
    <View style={s.catRow}>
      <Text style={s.catEmoji}>{festivalEmoji(def)}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.catName} numberOfLines={1}>{festivalName(def)}</Text>
        <Text style={s.catDates} numberOfLines={1}>{configDateRange(def)}</Text>
      </View>
      <Text style={s.catUntil}>{timeUntil(def?.start ?? def?.start_date)}</Text>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function FestivalScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { fmt, isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    active, configs, master,
    isLoading, isError, isRefetching, refetch,
    toggleConfig, togglingId, hasOutlet,
  } = useFestival();

  const [pendingId, setPendingId] = useState(null);

  const onToggle = useCallback(async (config) => {
    const id = configId(config);
    if (!id) return;
    setPendingId(id);
    try {
      await toggleConfig(id);
    } catch (err) {
      const msg = err?.response?.status === 403
        ? "You don't have permission to change festival mode. Ask an owner or manager."
        : (err?.message || 'Please try again.');
      Alert.alert('Could not update', msg);
    } finally {
      setPendingId(null);
    }
  }, [toggleConfig]);

  const activeCount = useMemo(() => countActive(configs), [configs]);
  const upcoming = useMemo(() => upcomingFromMaster(master, Date.now(), 6), [master]);
  const outletName = currentOutlet?.name || 'Selected outlet';

  const busyId = pendingId || togglingId;

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Festival Mode</Text>
            <Text style={s.subtitle} numberOfLines={1}>Festivals & surge · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="sparkles-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{activeCount}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its festival configs." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load festival mode"
          subtitle="Something went wrong. Pull to refresh or retry."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {active ? <ActiveBanner active={active} colors={colors} s={s} fmt={fmt} /> : null}

          <Text style={s.sectionLabel}>Your festival configs</Text>
          {configs.length === 0 ? (
            <View style={s.emptyBox}>
              <EmptyState
                icon="🎊"
                title="No festival configs yet"
                subtitle="Configure a festival on the web dashboard and it will appear here to switch on."
              />
            </View>
          ) : (
            configs.map((c, i) => (
              <View key={configId(c) || String(i)} style={{ marginBottom: 10 }}>
                <ConfigRow
                  config={c}
                  colors={colors}
                  s={s}
                  fmt={fmt}
                  index={i}
                  isBusy={busyId != null && String(busyId) === configId(c)}
                  onToggle={onToggle}
                />
              </View>
            ))
          )}

          {upcoming.length > 0 ? (
            <>
              <Text style={[s.sectionLabel, { marginTop: 22 }]}>Festival calendar</Text>
              <View style={s.catCard}>
                {upcoming.map((def, i) => (
                  <View key={(def?.key || def?.festival_key || i) + '-cat'}>
                    {i > 0 ? <View style={s.catDivider} /> : null}
                    <CatalogueRow def={def} colors={colors} s={s} />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg, gap: 6 },
    backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 4 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    sectionLabel: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    emptyBox: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border },

    // Active banner
    activeBanner: { backgroundColor: c.accent, borderRadius: 18, padding: 16, marginBottom: 20 },
    activeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    activeLive: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff26', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
    activeLiveText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
    activeEmoji: { fontSize: 26 },
    activeName: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 12 },
    activeMeta: { color: '#ffffffcc', fontSize: 13.5, fontWeight: '600', marginTop: 3 },
    activeOfferRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    activeBadge: { color: c.accent, backgroundColor: '#fff', fontSize: 13, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
    activeOfferText: { color: '#ffffffdd', fontSize: 13, fontWeight: '600', flexShrink: 1 },

    // Config row card
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardActive: { borderColor: c.accent, borderWidth: 1.5, backgroundColor: c.accent + '0d' },
    cardAvatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: c.pillBg, alignItems: 'center', justifyContent: 'center' },
    cardEmoji: { fontSize: 22 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardName: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    cardDates: { fontSize: 12.5, color: c.textSecondary, marginTop: 4, fontWeight: '600' },
    cardOfferRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    upliftChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.warning + '1e', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
    upliftText: { fontSize: 11.5, fontWeight: '800', color: c.warning },
    cardOffer: { fontSize: 12, color: c.textMuted, fontWeight: '600', flexShrink: 1 },
    switchBox: { width: 52, alignItems: 'flex-end', justifyContent: 'center' },

    // Status pill
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // Catalogue
    catCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    catDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    catEmoji: { fontSize: 20, width: 26, textAlign: 'center' },
    catName: { fontSize: 14, fontWeight: '700', color: c.text },
    catDates: { fontSize: 12, color: c.textMuted, marginTop: 2, fontWeight: '600' },
    catUntil: { fontSize: 12, color: c.textSecondary, fontWeight: '700' },
  });
}
