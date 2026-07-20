/**
 * Devices & Security — manage the signed-in devices for your account (web parity
 * with DevicesSecurityPage). Expo 54 · RN 0.81 · expo-router 6 · React 19.
 *
 * Shows your active sessions (with the current one flagged), lets you sign out a
 * single device or every OTHER device, and lists recent login history. Data +
 * pure transforms live in src/hooks/useDevices.js / src/lib/devices.js.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';

import { useTheme } from '../../src/context/ThemeContext';
import { EmptyState } from '../../src/components/EmptyState';
import { useDevices } from '../../src/hooks/useDevices';
import {
  otherSessionsCount, deviceLabel, deviceIconName,
  sessionTime, historyTime, actionLabel, timeAgo,
} from '../../src/lib/devices';

export default function DevicesSecurityScreen() {
  const { colors, isDark } = useTheme();
  const {
    sessions, history, lastLogin, isLoading, isError, refetch,
    revoke, revoking, logoutOthers, loggingOut,
  } = useDevices();

  const others = otherSessionsCount(sessions);

  const confirmRevoke = useCallback((s) => {
    Alert.alert('Sign out device?', `${deviceLabel(s)} will be signed out.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => revoke(s.sid) },
    ]);
  }, [revoke]);

  const confirmLogoutOthers = useCallback(() => {
    Alert.alert('Sign out other devices?', `This signs out ${others} other device${others === 1 ? '' : 's'}. This one stays signed in.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out others', style: 'destructive', onPress: () => logoutOthers() },
    ]);
  }, [others, logoutOthers]);

  const s = styles(colors);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.headerBg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Devices &amp; Security</Text>
          <Text style={s.headerSub}>Where your account is signed in</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <View style={s.center}>
          <EmptyState icon="cloud-offline-outline" title="Couldn't load devices" message="Check your connection and try again." />
          <TouchableOpacity style={s.retryBtn} onPress={refetch}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.accent} />}
        >
          {/* Summary */}
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Ionicons name="time-outline" size={18} color={colors.accent} />
              <Text style={s.summaryValue}>{lastLogin ? timeAgo(lastLogin) : '—'}</Text>
              <Text style={s.summaryLabel}>Last login</Text>
            </View>
            <View style={s.summaryCard}>
              <Ionicons name="phone-portrait-outline" size={18} color={colors.accent} />
              <Text style={s.summaryValue}>{sessions.length}</Text>
              <Text style={s.summaryLabel}>Active device{sessions.length === 1 ? '' : 's'}</Text>
            </View>
          </View>

          {/* Sign out others */}
          {others > 0 && (
            <TouchableOpacity style={s.logoutAllBtn} onPress={confirmLogoutOthers} disabled={loggingOut} activeOpacity={0.85}>
              {loggingOut
                ? <ActivityIndicator size="small" color={colors.error} />
                : <Ionicons name="log-out-outline" size={18} color={colors.error} />}
              <Text style={s.logoutAllText}>Sign out {others} other device{others === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          )}

          {/* Active sessions */}
          <Text style={s.sectionTitle}>Active sessions</Text>
          {sessions.length === 0 ? (
            <Text style={s.muted}>No active sessions found.</Text>
          ) : (
            sessions.map((sess, i) => (
              <Animated.View key={sess.sid || i} entering={FadeInDown.delay(i * 30).duration(180)} style={s.sessionCard}>
                <View style={s.deviceIcon}>
                  <Ionicons name={deviceIconName(sess.device_type)} size={20} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.sessionTopRow}>
                    <Text style={s.deviceLabel} numberOfLines={1}>{deviceLabel(sess)}</Text>
                    {sess.is_current && <View style={s.currentPill}><Text style={s.currentPillText}>This device</Text></View>}
                  </View>
                  <Text style={s.sessionMeta} numberOfLines={1}>
                    {[sess.ip, sessionTime(sess) ? timeAgo(sessionTime(sess)) : null].filter(Boolean).join(' · ') || 'Active'}
                  </Text>
                </View>
                {!sess.is_current && sess.sid && (
                  <TouchableOpacity style={s.revokeBtn} onPress={() => confirmRevoke(sess)} disabled={revoking} hitSlop={8}>
                    <Text style={s.revokeText}>Sign out</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            ))
          )}

          {/* Login history */}
          <Text style={[s.sectionTitle, { marginTop: 22 }]}>Recent login activity</Text>
          {history.length === 0 ? (
            <Text style={s.muted}>No recent activity.</Text>
          ) : (
            <View style={s.historyCard}>
              {history.map((h, i) => (
                <View key={h.id || i} style={[s.historyRow, i > 0 && s.historyRowBorder]}>
                  <Ionicons name={deviceIconName(h.device_type)} size={16} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyLabel} numberOfLines={1}>{actionLabel(h.action)} · {deviceLabel(h)}</Text>
                    <Text style={s.historyMeta} numberOfLines={1}>{[h.ip, historyTime(h) ? timeAgo(historyTime(h)) : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={s.footNote}>See a device you don’t recognise? Sign it out, then change your password.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = (c) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    header: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: c.headerBg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    },
    backBtn: { padding: 4, marginRight: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    headerSub: { fontSize: 12, color: c.textMuted, marginTop: 1 },

    body: { padding: 16, paddingBottom: 32 },

    summaryRow: { flexDirection: 'row', gap: 12 },
    summaryCard: {
      flex: 1, backgroundColor: c.card, borderRadius: 14, padding: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
    },
    summaryValue: { fontSize: 20, fontWeight: '800', color: c.text, marginTop: 8 },
    summaryLabel: { fontSize: 12, color: c.textMuted, marginTop: 2 },

    logoutAllBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 14, paddingVertical: 12, borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.error, backgroundColor: c.errorBg || 'transparent',
    },
    logoutAllText: { color: c.error, fontWeight: '700', fontSize: 14 },

    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
    muted: { color: c.textMuted, fontSize: 14 },

    sessionCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
    },
    deviceIcon: {
      width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.pillBg,
    },
    sessionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    deviceLabel: { fontSize: 15, fontWeight: '600', color: c.text, flexShrink: 1 },
    sessionMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    currentPill: { backgroundColor: c.pillActiveBg || c.pillBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    currentPillText: { fontSize: 10, fontWeight: '700', color: c.accent },
    revokeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    revokeText: { fontSize: 13, fontWeight: '600', color: c.error },

    historyCard: { backgroundColor: c.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden' },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
    historyRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    historyLabel: { fontSize: 13, fontWeight: '500', color: c.text },
    historyMeta: { fontSize: 11, color: c.textMuted, marginTop: 1 },

    retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.accent },
    retryText: { color: '#fff', fontWeight: '600' },
    footNote: { fontSize: 12, color: c.textMuted, marginTop: 20, lineHeight: 18 },
  });
