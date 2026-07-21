/**
 * Rostering — "Staff shift rosters" (VIEW-focused).
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated
 *
 * The current / this-week roster for the SELECTED outlet: shifts grouped by day
 * with each staff member's name, role and start/end time, a small summary, and a
 * "who's available today" section. Owners/managers can publish a draft roster
 * (the one safe write) — everything else is read-only. Data + pure transforms
 * live in src/hooks/useRostering.js + src/lib/rostering.js; every request is
 * outlet-scoped.
 */
import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { EmptyState } from '../../src/components/EmptyState';
import { useRostering } from '../../src/hooks/useRostering';
import {
  pickCurrentRoster,
  groupAssignmentsByDay,
  summarizeRoster,
  assignmentsOf,
  formatDateRange,
  formatDayLabel,
  formatShift,
  staffName,
  roleLabel,
  personName,
  preferredWindow,
  rosterStatusMeta,
  canPublish,
  availableOnly,
  initials,
} from '../../src/lib/rostering';

function apiErrorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.message;
  if (err?.response?.status === 403) return "You don't have permission to do that. Ask an owner or manager.";
  return msg || fallback;
}

// ─── Avatar chip ─────────────────────────────────────────────────────────────
function Avatar({ name, colors, s }) {
  return (
    <View style={s.avatar}>
      <Text style={s.avatarText}>{initials(name)}</Text>
    </View>
  );
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ status, s }) {
  const meta = rosterStatusMeta(status);
  return (
    <View style={[s.pill, { backgroundColor: meta.tone + '1e' }]}>
      <View style={[s.pillDot, { backgroundColor: meta.tone }]} />
      <Text style={[s.pillText, { color: meta.tone }]}>{meta.label}</Text>
    </View>
  );
}

// ─── One shift row ───────────────────────────────────────────────────────────
function ShiftRow({ assignment, colors, s }) {
  return (
    <View style={s.shiftRow}>
      <Avatar name={staffName(assignment)} colors={colors} s={s} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.shiftName} numberOfLines={1}>{staffName(assignment)}</Text>
        <Text style={s.shiftRole} numberOfLines={1}>{roleLabel(assignment)}</Text>
      </View>
      <View style={s.timeBox}>
        <Ionicons name="time-outline" size={13} color={colors.textMuted} />
        <Text style={s.shiftTime}>{formatShift(assignment)}</Text>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function RosteringScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { currentOutlet } = useOutlet();
  const { isAU } = useCurrency();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    rosters, availableStaff, isLoading, isError, isRefetching, refetch,
    publishRoster, isPublishing, hasOutlet,
  } = useRostering();

  const roster = useMemo(() => pickCurrentRoster(rosters), [rosters]);
  const summary = useMemo(() => summarizeRoster(roster), [roster]);
  const dayGroups = useMemo(() => groupAssignmentsByDay(assignmentsOf(roster)), [roster]);
  const available = useMemo(() => availableOnly(availableStaff), [availableStaff]);
  const publishable = canPublish(roster);

  const outletName = currentOutlet?.name || 'Selected outlet';

  const onPublish = useCallback(() => {
    if (!roster) return;
    Alert.alert(
      'Publish roster',
      `Publish "${roster.name}"? Staff will be able to see their shifts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            try {
              await publishRoster(roster.id);
              Alert.alert('Roster published', 'The roster is now published.');
            } catch (err) {
              Alert.alert('Could not publish', apiErrorMessage(err, 'Please try again.'));
            }
          },
        },
      ],
    );
  }, [roster, publishRoster]);

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
            <Text style={s.title}>Rostering</Text>
            <Text style={s.subtitle} numberOfLines={1}>Staff shifts · {outletName}</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="calendar-outline" size={13} color={colors.accent} />
            <Text style={[s.headerBadgeText, { color: colors.accent }]}>{summary.shifts}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!hasOutlet ? (
        <EmptyState icon="🏬" title="No outlet selected" subtitle="Choose an outlet to see its roster." />
      ) : isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load the roster"
          subtitle="Something went wrong. Pull to refresh or retry."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {!roster ? (
            <EmptyState icon="🗓️" title="No rosters yet" subtitle="Published shift rosters will appear here." />
          ) : (
            <Animated.View entering={FadeInDown.duration(260)}>
              {/* Roster header card */}
              <View style={s.rosterCard}>
                <View style={s.rosterTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rosterName} numberOfLines={1}>{roster.name}</Text>
                    <Text style={s.rosterRange} numberOfLines={1}>{formatDateRange(roster.start_date, roster.end_date)}</Text>
                  </View>
                  <StatusPill status={roster.status} s={s} />
                </View>

                <View style={s.summaryRow}>
                  <View style={s.summaryStat}>
                    <Text style={s.summaryValue}>{summary.shifts}</Text>
                    <Text style={s.summaryLabel}>Shifts</Text>
                  </View>
                  <View style={s.summaryDivider} />
                  <View style={s.summaryStat}>
                    <Text style={s.summaryValue}>{summary.staff}</Text>
                    <Text style={s.summaryLabel}>Staff</Text>
                  </View>
                  <View style={s.summaryDivider} />
                  <View style={s.summaryStat}>
                    <Text style={s.summaryValue}>{summary.days}</Text>
                    <Text style={s.summaryLabel}>Days</Text>
                  </View>
                </View>

                {publishable ? (
                  <TouchableOpacity
                    style={[s.publishBtn, isPublishing && { opacity: 0.6 }]}
                    onPress={onPublish}
                    disabled={isPublishing}
                    activeOpacity={0.88}
                  >
                    {isPublishing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="megaphone-outline" size={16} color="#fff" />
                        <Text style={s.publishBtnText}>Publish roster</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Day sections */}
              {dayGroups.length === 0 ? (
                <View style={s.softEmpty}>
                  <Text style={s.softEmptyText}>No shifts scheduled in this roster yet.</Text>
                </View>
              ) : (
                dayGroups.map((g) => (
                  <View key={g.key || 'undated'} style={s.daySection}>
                    <View style={s.dayHeader}>
                      <Text style={s.dayLabel}>{formatDayLabel(g.key) || 'Unscheduled'}</Text>
                      <Text style={s.dayCount}>{g.items.length} {g.items.length === 1 ? 'shift' : 'shifts'}</Text>
                    </View>
                    <View style={s.dayCard}>
                      {g.items.map((a, i) => (
                        <View key={a.id || i}>
                          {i > 0 ? <View style={s.rowDivider} /> : null}
                          <ShiftRow assignment={a} colors={colors} s={s} />
                        </View>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </Animated.View>
          )}

          {/* Who's available */}
          <View style={s.availHead}>
            <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
            <Text style={s.availTitle}>Available today</Text>
            <Text style={s.availCount}>{available.length}</Text>
          </View>
          {available.length === 0 ? (
            <View style={s.softEmpty}>
              <Text style={s.softEmptyText}>No availability recorded for today.</Text>
            </View>
          ) : (
            <View style={s.availCard}>
              {available.map((p, i) => (
                <View key={p.id || i}>
                  {i > 0 ? <View style={s.rowDivider} /> : null}
                  <View style={s.shiftRow}>
                    <Avatar name={personName(p)} colors={colors} s={s} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.shiftName} numberOfLines={1}>{personName(p)}</Text>
                      <Text style={s.shiftRole} numberOfLines={1}>Prefers {preferredWindow(p)}</Text>
                    </View>
                    <View style={[s.availDot, { backgroundColor: colors.success }]} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: c.headerBg },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginTop: 2 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 2 },
    headerBadgeText: { fontSize: 12, fontWeight: '800' },

    // Roster card
    rosterCard: { backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 18 },
    rosterTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rosterName: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    rosterRange: { fontSize: 12.5, color: c.textMuted, marginTop: 3, fontWeight: '600' },

    summaryRow: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    summaryStat: { flex: 1, alignItems: 'center' },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 2 },
    summaryValue: { fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

    publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 48, borderRadius: 13, backgroundColor: c.accent, marginTop: 16 },
    publishBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // Day sections
    daySection: { marginBottom: 16 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
    dayLabel: { fontSize: 13, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    dayCount: { fontSize: 11.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    dayCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 },

    shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    shiftName: { fontSize: 15, fontWeight: '700', color: c.text, letterSpacing: -0.2 },
    shiftRole: { fontSize: 12.5, color: c.textSecondary, marginTop: 2, fontWeight: '600' },
    timeBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    shiftTime: { fontSize: 13, fontWeight: '700', color: c.text },
    rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },

    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.pillBg, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 13, fontWeight: '800', color: c.textSecondary, letterSpacing: 0.2 },

    // Availability
    availHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, marginBottom: 10, paddingHorizontal: 4 },
    availTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    availCount: { fontSize: 12, fontWeight: '800', color: c.textMuted },
    availCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 },
    availDot: { width: 8, height: 8, borderRadius: 4 },

    softEmpty: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingVertical: 20, paddingHorizontal: 16, marginBottom: 16, alignItems: 'center' },
    softEmptyText: { fontSize: 13, color: c.textMuted, fontWeight: '600', textAlign: 'center' },

    // Status pill
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  });
}
