/**
 * QR Codes — "Table ordering QR".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * A wall of scannable QR codes, one per dine-in table in the SELECTED outlet.
 * A guest scans a table's code to open the web ordering page pre-scoped to this
 * outlet + table and order from their seat. Tables come from the offline SQLite
 * cache (useOfflineTables via useQrCodes), so this screen works offline and is
 * always outlet-scoped. Tap a code to enlarge it for scanning; Share sends the
 * printable link (the OS sheet includes Copy).
 *
 * The deep-link math is pure + unit-tested in src/hooks/useQrCodes.js — it
 * mirrors the web QR generator exactly (hash route + table_id).
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
  Share,
  Modal,
  Pressable,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import { useQrCodes } from '../../src/hooks/useQrCodes';

// QR codes must always render dark-on-white to stay scannable, regardless of
// the app theme.
const QR_FG = '#0f172a';
const QR_BG = '#ffffff';

async function shareCard(card) {
  try {
    await Share.share({
      message: `Scan to order at ${card.name}:\n${card.url}`,
      url: card.url, // iOS uses this; Android uses message
    });
  } catch (err) {
    Alert.alert('Could not share', err?.message || 'Please try again.');
  }
}

// ─── One QR card in the grid ────────────────────────────────────────────────
function QrCard({ card, qrSize, colors, s, onOpen }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={s.cardWrap}>
      <View style={s.card}>
        <Pressable onPress={() => onOpen(card)} style={s.qrBox} android_ripple={{ color: '#00000010' }}>
          <QRCode value={card.url} size={qrSize} color={QR_FG} backgroundColor={QR_BG} />
        </Pressable>

        <Text style={s.cardName} numberOfLines={1}>{card.name}</Text>
        <View style={s.sectionPill}>
          <Ionicons name="location-outline" size={11} color={colors.textMuted} />
          <Text style={s.sectionText} numberOfLines={1}>{card.section}</Text>
        </View>

        <TouchableOpacity style={s.shareBtn} onPress={() => shareCard(card)} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={15} color={colors.accent} />
          <Text style={s.shareText}>Share</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Enlarged QR modal (for showing a guest / printing) ─────────────────────
function QrModal({ card, colors, s, onClose }) {
  const big = 240;
  return (
    <Modal visible={!!card} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.modalCard} onPress={() => {}}>
          {card ? (
            <>
              <View style={s.modalQrBox}>
                <QRCode value={card.url} size={big} color={QR_FG} backgroundColor={QR_BG} />
              </View>
              <Text style={s.modalName}>{card.name}</Text>
              <Text style={s.modalSection}>{card.section}</Text>
              <Text style={s.modalUrl} numberOfLines={2} selectable>{card.url}</Text>

              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalShareBtn} onPress={() => shareCard(card)} activeOpacity={0.88}>
                  <Ionicons name="share-outline" size={17} color="#fff" />
                  <Text style={s.modalShareText}>Share link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalCloseBtn} onPress={onClose} activeOpacity={0.85}>
                  <Text style={s.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function QrCodesScreen() {
  const { colors } = useTheme();
  const { outletId, currentOutlet } = useOutlet();
  const { isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();

  const { cards, totalCount, query, setQuery, isLoading, refresh, hasOutlet } = useQrCodes(outletId);

  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  // Responsive QR size for a 2-column grid.
  const qrSize = Math.max(96, Math.min(150, Math.floor((width - 32 - 12 - 28) / 2)));
  const outletName = currentOutlet?.name || 'Selected outlet';

  const ListHeader = (
    <View style={s.hint}>
      <Ionicons name="scan-outline" size={16} color={colors.accent} />
      <Text style={s.hintText}>
        Guests scan a table&apos;s code to open your menu and order from their seat. Tap a code to enlarge or share.
      </Text>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · {isAU ? 'AU' : 'IN'}</Text>
            <Text style={s.title}>QR Codes</Text>
            <Text style={s.subtitle} numberOfLines={1}>Table ordering · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="qr-code-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{cards.length}</Text>
          </View>
        </View>

        {hasOutlet && totalCount > 0 ? (
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search table or section…"
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
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its table ordering QR codes." />
      ) : isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : totalCount === 0 ? (
        <EmptyState
          icon="🍽️"
          title="No tables yet"
          subtitle="Add dine-in tables for this outlet, then their ordering QR codes appear here."
          action={{ label: 'Refresh', onPress: onRefresh }}
        />
      ) : (
        <FlashList
          data={cards}
          numColumns={2}
          keyExtractor={(c) => c.id}
          estimatedItemSize={qrSize + 96}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="🔍"
              title="No matches"
              subtitle={`No tables match “${query}”. Try a different search.`}
            />
          }
          renderItem={({ item }) => (
            <QrCard card={item} qrSize={qrSize} colors={colors} s={s} onOpen={setSelected} />
          )}
        />
      )}

      <QrModal card={selected} colors={colors} s={s} onClose={() => setSelected(null)} />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.text, padding: 0, fontWeight: '500' },

    hint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: c.accent + '12',
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    hintText: { flex: 1, fontSize: 12.5, color: c.textSecondary, lineHeight: 18, fontWeight: '500' },

    // Grid card
    cardWrap: { flex: 1, padding: 6 },
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      alignItems: 'center',
    },
    qrBox: { backgroundColor: QR_BG, borderRadius: 12, padding: 10 },
    cardName: { fontSize: 14.5, fontWeight: '800', color: c.text, marginTop: 10, letterSpacing: -0.2, maxWidth: '100%' },
    sectionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: c.pillBg,
      maxWidth: '100%',
    },
    sectionText: { fontSize: 11, fontWeight: '700', color: c.textMuted },

    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      height: 38,
      alignSelf: 'stretch',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.pillBg,
    },
    shareText: { fontSize: 13, fontWeight: '700', color: c.accent },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center', padding: 28 },
    modalCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: c.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      padding: 22,
      alignItems: 'center',
    },
    modalQrBox: { backgroundColor: QR_BG, borderRadius: 16, padding: 16 },
    modalName: { fontSize: 19, fontWeight: '800', color: c.text, marginTop: 16, letterSpacing: -0.3 },
    modalSection: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginTop: 2 },
    modalUrl: { fontSize: 11.5, color: c.textMuted, marginTop: 12, textAlign: 'center', lineHeight: 16 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
    modalShareBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: 13,
      backgroundColor: c.accent,
    },
    modalShareText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    modalCloseBtn: {
      paddingHorizontal: 20,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.pillBg,
    },
    modalCloseText: { color: c.textSecondary, fontWeight: '700', fontSize: 14 },
  });
}
