/**
 * Integrations Hub — "Connect & sync".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * A single console for the outlet's third-party connections, grouped by type:
 *   • Delivery aggregators — region-aware (IN Swiggy/Zomato · AU Uber Eats/
 *     DoorDash/Menulog), each with a CONNECTED / NOT-CONNECTED pill, last menu
 *     -sync time, a per-channel "Sync menu" action, plus a "Push menu to all".
 *   • Accounting — Xero (AU, live status + in-app OAuth launch), MYOB (AU) and
 *     Tally (IN) as web-configured connectors.
 *
 * Data + pure transforms live in src/hooks/useIntegrations.js. Region follows
 * the SELECTED outlet via useCurrency().isAU; every fetch is outlet-scoped.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
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
  useIntegrations,
  useXeroConnectUrl,
  formatRelativeTime,
  summarizePushResult,
  INTEGRATION_TYPES,
} from '../../src/hooks/useIntegrations';

// Flatten grouped sections into a single [header, ...rows] list for FlashList.
function toRows(sections) {
  const rows = [];
  for (const s of sections) {
    rows.push({ _type: 'header', key: `h:${s.key}`, section: s });
    for (const card of s.data) rows.push({ _type: 'card', key: `c:${card.type}:${card.id}`, card });
  }
  return rows;
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ card, colors, s }) {
  const connected = card.connected;
  const tone = connected ? colors.success : colors.textMuted;
  const label = connected ? 'Connected' : card.configured ? 'Paused' : 'Not connected';
  return (
    <View style={[s.pill, { backgroundColor: tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: tone }]} />
      <Text style={[s.pillText, { color: tone }]}>{label}</Text>
    </View>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────
function IntegrationCard({ card, colors, s, onSync, onConnect, onView, syncingId, connectingId }) {
  const isAggregator = card.type === INTEGRATION_TYPES.AGGREGATOR;
  const lastSync = formatRelativeTime(card.lastSync);
  const syncing = syncingId === card.id;
  const connecting = connectingId === card.id;

  // Sub-line: commission for aggregators, org / message for accounting.
  let sub = null;
  if (isAggregator) {
    if (card.commission != null) sub = `${Math.round(card.commission * 100)}% commission`;
    if (card.storeId) sub = sub ? `${sub} · Store ${card.storeId}` : `Store ${card.storeId}`;
  } else if (card.orgName) {
    sub = card.orgName;
  } else if (card.webConfigured) {
    sub = 'Configure on web';
  } else if (card.statusMessage) {
    sub = card.statusMessage;
  }

  return (
    <Animated.View entering={FadeIn.duration(220)} style={s.card}>
      <View style={s.cardTop}>
        <View style={[s.logo, { backgroundColor: card.color + '1c' }]}>
          <Ionicons name={card.icon} size={20} color={card.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.cardName} numberOfLines={1}>{card.name}</Text>
          {sub ? <Text style={s.cardSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <StatusPill card={card} colors={colors} s={s} />
      </View>

      {(lastSync || (!isAggregator && card.connected && card.invoicesExported > 0)) ? (
        <View style={s.metaRow}>
          {lastSync ? (
            <View style={s.metaItem}>
              <Ionicons name="sync-outline" size={13} color={colors.textMuted} />
              <Text style={s.metaText}>Synced {lastSync}</Text>
            </View>
          ) : null}
          {!isAggregator && card.invoicesExported > 0 ? (
            <View style={s.metaItem}>
              <Ionicons name="receipt-outline" size={13} color={colors.textMuted} />
              <Text style={s.metaText}>{card.invoicesExported} invoices exported</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={s.cardActions}>
        {isAggregator ? (
          card.connected ? (
            <TouchableOpacity
              style={[s.actionBtn, s.actionPrimary]}
              onPress={() => onSync(card)}
              disabled={syncing}
              activeOpacity={0.85}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                  <Text style={s.actionPrimaryText}>Sync menu</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.actionBtn, s.actionGhost]} onPress={() => onConnect(card)} activeOpacity={0.8}>
              <Ionicons name="link-outline" size={15} color={colors.accent} />
              <Text style={s.actionGhostText}>Connect on web</Text>
            </TouchableOpacity>
          )
        ) : card.connected ? (
          <TouchableOpacity style={[s.actionBtn, s.actionGhost]} onPress={() => onView(card)} activeOpacity={0.8}>
            <Ionicons name="open-outline" size={15} color={colors.accent} />
            <Text style={s.actionGhostText}>View connection</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.actionBtn, s.actionGhost]}
            onPress={() => onConnect(card)}
            disabled={connecting}
            activeOpacity={0.8}
          >
            {connecting ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <Ionicons name="link-outline" size={15} color={colors.accent} />
                <Text style={s.actionGhostText}>{card.webConfigured ? 'Connect on web' : `Connect ${card.name}`}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ section, colors, s }) {
  return (
    <View style={s.sectionHead}>
      <View style={[s.sectionIcon, { backgroundColor: colors.accent + '16' }]}>
        <Ionicons name={section.icon} size={16} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{section.title}</Text>
        <Text style={s.sectionSub} numberOfLines={1}>{section.subtitle}</Text>
      </View>
      <Text style={s.sectionCount}>{section.data.length}</Text>
    </View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function IntegrationsSkeleton({ s }) {
  return (
    <View style={{ padding: 16 }}>
      <View style={s.skelSummary} />
      {[0, 1].map((g) => (
        <View key={g}>
          <View style={s.skelSectionHead}>
            <View style={s.skelIcon} />
            <View style={{ flex: 1 }}>
              <View style={[s.skelBar, { width: '45%' }]} />
              <View style={[s.skelBar, { width: '65%', marginTop: 8, height: 10 }]} />
            </View>
          </View>
          {[0, 1, 2].map((i) => (
            <View key={i} style={s.skelCard}>
              <View style={s.skelLogo} />
              <View style={{ flex: 1 }}>
                <View style={[s.skelBar, { width: '50%' }]} />
                <View style={[s.skelBar, { width: '35%', marginTop: 8, height: 10 }]} />
              </View>
              <View style={s.skelPill} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function IntegrationsScreen() {
  const { colors } = useTheme();
  const { currentOutlet } = useOutlet();
  const { isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    sections,
    summary,
    pushMenu,
    isLoading,
    isRefetching,
    isError,
    refetch,
    hasOutlet,
  } = useIntegrations({ isAU });

  const xeroConnect = useXeroConnectUrl();
  const [syncingId, setSyncingId] = useState(null);
  const [connectingId, setConnectingId] = useState(null);
  const [pushingAll, setPushingAll] = useState(false);

  const rows = useMemo(() => toRows(sections), [sections]);
  const onRefresh = useCallback(() => refetch(), [refetch]);

  // Per-platform menu sync.
  const onSync = useCallback(
    (card) => {
      setSyncingId(card.id);
      pushMenu.mutate(card.id, {
        onSuccess: () => Alert.alert('Menu synced', `Your live menu was pushed to ${card.name}.`),
        onError: (err) => Alert.alert('Sync failed', err?.message || 'Could not push the menu. Try again.'),
        onSettled: () => setSyncingId(null),
      });
    },
    [pushMenu],
  );

  // Push to every enabled aggregator.
  const onPushAll = useCallback(() => {
    if (pushingAll) return;
    setPushingAll(true);
    pushMenu.mutate(undefined, {
      onSuccess: (res) => {
        const r = summarizePushResult(res);
        Alert.alert('Push menu to all', r.message);
      },
      onError: (err) => Alert.alert('Push failed', err?.message || 'Could not push the menu. Try again.'),
      onSettled: () => setPushingAll(false),
    });
  }, [pushMenu, pushingAll]);

  // Connect action — Xero launches OAuth in the browser; everything else points
  // the operator at the web dashboard (mobile OAuth for these is out of scope).
  const onConnect = useCallback(
    (card) => {
      if (card.type === INTEGRATION_TYPES.ACCOUNTING && card.id === 'xero') {
        setConnectingId(card.id);
        xeroConnect.mutate(undefined, {
          onSuccess: async (url) => {
            if (url) {
              try {
                await Linking.openURL(url);
              } catch {
                Alert.alert('Connect Xero', 'Open the MS-RM web dashboard to finish connecting Xero.');
              }
            } else {
              Alert.alert('Connect Xero', 'Open the MS-RM web dashboard to finish connecting Xero.');
            }
          },
          onError: () =>
            Alert.alert('Connect Xero', 'Open the MS-RM web dashboard → Settings → Integrations to connect Xero.'),
          onSettled: () => setConnectingId(null),
        });
        return;
      }
      Alert.alert(
        `Connect ${card.name}`,
        card.type === INTEGRATION_TYPES.AGGREGATOR
          ? `Adding your ${card.name} store credentials is done on the MS-RM web dashboard → Settings → Aggregators. Once connected, sync your menu right here.`
          : `Set up ${card.name} on the MS-RM web dashboard → Settings → Integrations. Its status will appear here.`,
      );
    },
    [xeroConnect],
  );

  const onView = useCallback((card) => {
    const bits = [];
    if (card.orgName) bits.push(`Organisation: ${card.orgName}`);
    const rel = formatRelativeTime(card.lastSync);
    if (rel) bits.push(`Last sync: ${rel}`);
    if (card.invoicesExported) bits.push(`${card.invoicesExported} invoices exported`);
    Alert.alert(`${card.name} connection`, bits.length ? bits.join('\n') : 'Connected and syncing.');
  }, []);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(280)} style={{ marginBottom: 4 }}>
      <View style={s.summaryCard}>
        <View style={s.summaryStat}>
          <Text style={s.summaryValue}>{summary.connected}</Text>
          <Text style={s.summaryLabel}>Connected</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.textMuted }]}>{summary.notConnected}</Text>
          <Text style={s.summaryLabel}>Available</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryStat}>
          <Text style={[s.summaryValue, { color: colors.accent }]}>{summary.total}</Text>
          <Text style={s.summaryLabel}>Total</Text>
        </View>
      </View>

      {summary.syncable > 0 ? (
        <TouchableOpacity style={s.pushAllBtn} onPress={onPushAll} disabled={pushingAll} activeOpacity={0.88}>
          {pushingAll ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={17} color="#fff" />
              <Text style={s.pushAllText}>Push menu to all channels</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>Integrations</Text>
            <Text style={s.subtitle} numberOfLines={1}>Connect & sync · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="git-network-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{summary.connected}/{summary.total}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to manage its integrations." />
      ) : isLoading ? (
        <IntegrationsSkeleton s={s} />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load integrations"
          subtitle="Something went wrong fetching your connections. Pull to refresh or retry."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : rows.length === 0 ? (
        <FlashList
          data={[]}
          keyExtractor={() => 'x'}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="🔌"
              title="No integrations available"
              subtitle="No delivery or accounting connectors are available for this region yet."
            />
          }
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.key}
          estimatedItemSize={132}
          getItemType={(r) => r._type}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderItem={({ item }) =>
            item._type === 'header' ? (
              <SectionHeader section={item.section} colors={colors} s={s} />
            ) : (
              <View style={{ marginBottom: 10 }}>
                <IntegrationCard
                  card={item.card}
                  colors={colors}
                  s={s}
                  onSync={onSync}
                  onConnect={onConnect}
                  onView={onView}
                  syncingId={syncingId}
                  connectingId={connectingId}
                />
              </View>
            )
          }
          ListFooterComponent={
            <Text style={s.footerNote}>
              Store credentials and OAuth are managed on the MS-RM web dashboard. Menu sync runs from here.
            </Text>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      backgroundColor: c.headerBg,
    },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    // Summary strip
    summaryCard: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 16,
    },
    summaryStat: { flex: 1, alignItems: 'center' },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    summaryValue: { fontSize: 22, fontWeight: '800', color: c.success, letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    pushAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.accent,
      height: 50,
      borderRadius: 14,
      marginTop: 12,
    },
    pushAllText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // Section header
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 10 },
    sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    sectionSub: { fontSize: 12, color: c.textMuted, marginTop: 1 },
    sectionCount: {
      fontSize: 12,
      fontWeight: '800',
      color: c.textMuted,
      backgroundColor: c.pillBg,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: 'hidden',
    },

    // Card
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logo: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardName: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    cardSub: { fontSize: 12.5, color: c.textSecondary, marginTop: 2 },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },

    cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      height: 44,
      borderRadius: 12,
    },
    actionPrimary: { backgroundColor: c.accent },
    actionPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    actionGhost: { borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg },
    actionGhostText: { color: c.accent, fontWeight: '700', fontSize: 14 },

    footerNote: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 24, lineHeight: 18 },

    // Skeleton
    skelSummary: { height: 82, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, marginBottom: 4 },
    skelSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 10 },
    skelIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: c.border },
    skelCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10,
    },
    skelLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.border },
    skelPill: { width: 74, height: 24, borderRadius: 999, backgroundColor: c.border },
    skelBar: { height: 13, borderRadius: 6, backgroundColor: c.border },
  });
}
