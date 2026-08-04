/**
 * Demo Leads — the sales pipeline.
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated · FlashList 2
 *
 * Demo / sales requests captured from the marketing website, shown as a
 * platform-level pipeline (NOT outlet-scoped): browse leads with per-status
 * counts, search by name / restaurant / email, open a lead to see its full
 * detail, call or email the contact, and move it through the pipeline
 * (new → contacted → demo_booked → won / lost). Data + pure transforms live in
 * src/hooks/useLeads.js. The list + status writes need a platform role — a 403
 * is surfaced kindly. Mirrors the web LeadsPage.
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
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { EmptyState } from '../../src/components/EmptyState';
import {
  useLeads,
  filterLeads,
  leadStatusMeta,
  formatLeadDate,
  LEAD_STATUSES,
} from '../../src/hooks/useLeads';

function apiErrorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.message;
  if (err?.response?.status === 403) return "You don't have access to sales leads. Ask a platform admin.";
  return msg || fallback;
}

async function openUrl(url) {
  try {
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url);
    else Alert.alert('Not available', 'This action is not supported on your device.');
  } catch (_) {
    Alert.alert('Not available', 'Could not open that link.');
  }
}

// ─── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ status, s }) {
  const meta = leadStatusMeta(status);
  return (
    <View style={[s.pill, { backgroundColor: meta.color + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: meta.color }]} />
      <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

// ─── One row ────────────────────────────────────────────────────────────────
function LeadRow({ lead, colors, s, onOpen }) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(lead)}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardTop}>
            <Text style={s.name} numberOfLines={1}>{lead.name || 'Unknown'}</Text>
            <StatusPill status={lead.status} s={s} />
          </View>
          {lead.restaurant ? <Text style={s.restaurant} numberOfLines={1}>{lead.restaurant}</Text> : null}
          <View style={s.metaRow}>
            <Ionicons name="mail-outline" size={13} color={colors.textMuted} />
            <Text style={s.metaText} numberOfLines={1}>{lead.email}</Text>
          </View>
          <View style={s.tagRow}>
            {lead.region ? (
              <View style={s.tag}><Text style={s.tagText}>{lead.region}</Text></View>
            ) : null}
            {lead.outlets ? (
              <View style={s.tag}><Text style={s.tagText}>{lead.outlets} outlets</Text></View>
            ) : null}
            <Text style={s.date}>{formatLeadDate(lead.created_at)}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Detail + status modal ──────────────────────────────────────────────────
function DetailModal({ lead, colors, s, onClose, onSetStatus, isUpdating }) {
  return (
    <Modal visible={!!lead} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          {lead ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle} numberOfLines={2}>{lead.name}</Text>
                  {lead.restaurant ? <Text style={s.sheetSub}>{lead.restaurant}</Text> : null}
                </View>
                <StatusPill status={lead.status} s={s} />
              </View>

              {/* Contact actions */}
              <View style={s.actionRow}>
                {lead.email ? (
                  <TouchableOpacity style={s.actionBtn} onPress={() => openUrl(`mailto:${lead.email}`)} activeOpacity={0.85}>
                    <Ionicons name="mail-outline" size={17} color={colors.accent} />
                    <Text style={s.actionBtnText}>Email</Text>
                  </TouchableOpacity>
                ) : null}
                {lead.phone ? (
                  <TouchableOpacity style={s.actionBtn} onPress={() => openUrl(`tel:${lead.phone}`)} activeOpacity={0.85}>
                    <Ionicons name="call-outline" size={17} color={colors.accent} />
                    <Text style={s.actionBtnText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={s.detailRows}>
                <DetailRow label="Email" value={lead.email} s={s} />
                {lead.phone ? <DetailRow label="Phone" value={lead.phone} s={s} /> : null}
                {lead.region ? <DetailRow label="Region" value={lead.region} s={s} /> : null}
                {lead.outlets ? <DetailRow label="Outlets" value={String(lead.outlets)} s={s} /> : null}
                {lead.current_system ? <DetailRow label="Current system" value={lead.current_system} s={s} /> : null}
                {lead.source ? <DetailRow label="Source" value={lead.source} s={s} /> : null}
                <DetailRow label="Received" value={formatLeadDate(lead.created_at)} s={s} />
              </View>

              {lead.message ? (
                <View style={s.msgBox}>
                  <Text style={s.msgLabel}>Message</Text>
                  <Text style={s.msgText}>{lead.message}</Text>
                </View>
              ) : null}

              {/* Pipeline status selector */}
              <Text style={s.statusHead}>Update status</Text>
              <View style={s.statusGrid}>
                {LEAD_STATUSES.map((st) => {
                  const active = lead.status === st.id;
                  return (
                    <TouchableOpacity
                      key={st.id}
                      style={[
                        s.statusChip,
                        { borderColor: st.color },
                        active && { backgroundColor: st.color },
                      ]}
                      disabled={isUpdating || active}
                      onPress={() => onSetStatus(lead.id, st.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.statusChipText, { color: active ? '#fff' : st.color }]}>{st.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isUpdating ? (
                <View style={s.updatingRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={s.updatingText}>Updating…</Text>
                </View>
              ) : null}

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

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function LeadsScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    leads, counts, total, isLoading, isError, isRefetching, refetch,
    updateStatus, isUpdating,
  } = useLeads();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => filterLeads(leads, { q: query, status }), [leads, query, status]);

  const onSetStatus = useCallback(async (id, next) => {
    try {
      await updateStatus(id, next);
      setSelected((prev) => (prev && prev.id === id ? { ...prev, status: next } : prev));
    } catch (err) {
      Alert.alert('Could not update', apiErrorMessage(err, 'Please try again.'));
    }
  }, [updateStatus]);

  const ListHeader = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 4 }}>
      <View style={s.filterRow}>
        <TouchableOpacity
          style={[s.filterChip, status === 'all' && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          onPress={() => setStatus('all')}
          activeOpacity={0.85}
        >
          <Text style={[s.filterChipText, status === 'all' && { color: '#fff' }]}>
            All{total ? ` (${total})` : ''}
          </Text>
        </TouchableOpacity>
        {LEAD_STATUSES.map((st) => {
          const active = status === st.id;
          const n = counts[st.id];
          return (
            <TouchableOpacity
              key={st.id}
              style={[s.filterChip, active && { backgroundColor: st.color, borderColor: st.color }]}
              onPress={() => setStatus(st.id)}
              activeOpacity={0.85}
            >
              <Text style={[s.filterChipText, active && { color: '#fff' }]}>
                {st.label}{n ? ` (${n})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>SALES · CRM</Text>
            <Text style={s.title}>Demo Leads</Text>
            <Text style={s.subtitle} numberOfLines={1}>Requests from the marketing website</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="megaphone-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{total}</Text>
          </View>
        </View>

        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search name, restaurant, email…"
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
        <EmptyState icon="⚠️" title="Couldn't load leads" subtitle="Something went wrong, or you don't have access. Pull to refresh or retry." action={{ label: 'Retry', onPress: refetch }} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(l) => String(l.id)}
          estimatedItemSize={112}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            leads.length === 0 ? (
              <EmptyState icon="📨" title="No leads yet" subtitle="Demo requests from the website will appear here." />
            ) : (
              <EmptyState icon="🔍" title="No matches" subtitle="No leads match your search or filter." />
            )
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <LeadRow lead={item} colors={colors} s={s} onOpen={setSelected} />
            </View>
          )}
        />
      )}

      <DetailModal
        lead={selected}
        colors={colors}
        s={s}
        onClose={() => setSelected(null)}
        onSetStatus={onSetStatus}
        isUpdating={isUpdating}
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

    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    filterChip: { paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Row card
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.2, flexShrink: 1 },
    restaurant: { fontSize: 13, color: c.textSecondary, marginTop: 4, fontWeight: '600' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
    metaText: { fontSize: 12.5, color: c.textMuted, flexShrink: 1 },
    tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.pillBg },
    tagText: { fontSize: 11, fontWeight: '700', color: c.textSecondary },
    date: { fontSize: 11.5, color: c.textMuted, fontWeight: '600' },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

    // Bottom sheet
    sheetOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '88%' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontWeight: '500' },

    actionRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    actionBtnText: { color: c.accent, fontWeight: '800', fontSize: 14.5 },

    detailRows: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    detailLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    detailValue: { fontSize: 13.5, color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

    msgBox: { marginTop: 14, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14 },
    msgLabel: { fontSize: 12, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    msgText: { fontSize: 13.5, color: c.textSecondary, lineHeight: 20 },

    statusHead: { fontSize: 13, fontWeight: '800', color: c.text, marginTop: 18, marginBottom: 10 },
    statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusChip: { paddingHorizontal: 14, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    statusChipText: { fontSize: 13.5, fontWeight: '800' },
    updatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    updatingText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },

    closeBtn: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.pillBg, marginTop: 20 },
    closeBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 14.5 },
  });
}
