import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { LC } from '../../src/constants/colors';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useOutlet } from '../../src/context/OutletContext';
import {
  useWhoIsIn,
  useLabourCost,
  useStaffTimesheets,
} from '../../src/hooks/useOwnerApi';
import { ShareButton } from '../../src/components/ShareButton';
import { exportReportPdf, shareFile } from '../../src/utils/exportReport';


// ─── Role Colors ────────────────────────────────────────────────────────────

const ROLE_COLORS = {
  Manager: '#2563eb',
  Cashier: '#00B341',
  Chef: '#F5A623',
  Waiter: '#888888',
  default: '#BBBBBB',
};

function getRoleColor(role) {
  return ROLE_COLORS[role] || ROLE_COLORS.default;
}

// ─── Helpers ────────────────────────────────────────────────────────────────


/** Parse "09:02 AM" style time and return hours on floor from now */
function hoursOnFloor(clockedInAt) {
  if (!clockedInAt) return 0;
  const now = new Date();
  const match = clockedInAt.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const clockIn = new Date(now);
  clockIn.setHours(hours, mins, 0, 0);
  const diff = (now - clockIn) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
}

function formatHoursOnFloor(clockedInAt) {
  const h = hoursOnFloor(clockedInAt);
  if (h < 1) return `${Math.round(h * 60)}m on floor`;
  return `${h.toFixed(1)} hrs on floor`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function StaffScreen() {
  const { outletId, currentOutlet } = useOutlet();
  const { colors } = useTheme();
  const { symbol, locale, dateLocale, fmt, fmtFull } = useCurrency();

  // Active tab
  const [activeTab, setActiveTab] = useState('whosIn');

  // Expanded timesheet card
  const [expandedId, setExpandedId] = useState(null);

  // Animated tab indicator
  const tabOffset = useSharedValue(0);
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabOffset.value }],
  }));

  // API hooks
  const {
    data: whoIsInData,
    isLoading: whoIsInLoading,
    isError: whoIsInError,
    refetch: refetchWhoIsIn,
  } = useWhoIsIn(outletId);

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const {
    data: labourData,
    isLoading: labourLoading,
    isError: labourError,
    refetch: refetchLabour,
  } = useLabourCost(outletId, today, today);

  const {
    data: timesheetData,
    isLoading: timesheetLoading,
    isError: timesheetError,
    refetch: refetchTimesheets,
  } = useStaffTimesheets(outletId, 'current');

  // Use API data with safe defaults
  const staffIn = whoIsInData || [];
  const labour = labourData || { totalCost: 0, staffCount: 0, avgHourly: 0, costPercentage: 0, breakdown: [] };
  const timesheets = timesheetData || [];

  // Refresh handler
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchWhoIsIn(), refetchLabour(), refetchTimesheets()]);
    setRefreshing(false);
  }, [refetchWhoIsIn, refetchLabour, refetchTimesheets]);

  // Tab switching
  const switchTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      tabOffset.value = withTiming(tab === 'whosIn' ? 0 : 1, { duration: 250 });
    },
    [tabOffset],
  );

  // Max cost for bar width calculation
  const maxCost = useMemo(() => {
    const items = labour.breakdown || [];
    return items.reduce((max, b) => Math.max(max, b.cost), 1);
  }, [labour]);

  // ─── Loading Skeletons ──────────────────────────────────────────────────

  const isLoading =
    activeTab === 'whosIn' ? whoIsInLoading : labourLoading || timesheetLoading;

  const isError =
    activeTab === 'whosIn' ? whoIsInError : labourError && timesheetError;

  if (isError && !refreshing) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <Ionicons name="people" size={22} color={colors.text} />
          <Text style={[s.headerTitle, { color: colors.text }]}>Staff & Labour</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
          <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => onRefresh()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: 8 }}>
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <Ionicons name="people" size={22} color={colors.text} />
          <Text style={[s.headerTitle, { color: colors.text }]}>Staff & Labour</Text>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          <View style={s.skeletonRow}>
            <SkeletonBox width="48%" height={44} borderRadius={22} />
            <SkeletonBox width="48%" height={44} borderRadius={22} />
          </View>
          {[1, 2, 3, 4].map((k) => (
            <SkeletonBox
              key={k}
              width="100%"
              height={80}
              borderRadius={14}
              style={{ marginBottom: 12 }}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <Ionicons name="people" size={22} color={colors.text} />
        <Text style={[s.headerTitle, { color: colors.text, flex: 1 }]}>Staff & Labour</Text>
        <ShareButton
          color={colors.text}
          onPress={async () => {
            const uri = await exportReportPdf({
              title: 'Staff Report',
              subtitle: `${new Date().toLocaleDateString(dateLocale)}`,
              outletName: currentOutlet?.name || 'MS-RM',
              sections: [
                {
                  heading: `On Floor (${staffIn.length} staff)`,
                  rows: staffIn.length > 0
                    ? staffIn.map(st => ({
                        label: `${st.name} (${st.role})`,
                        value: `Clocked in ${st.clockedInAt} • ${formatHoursOnFloor(st.clockedInAt)}`,
                      }))
                    : [{ label: 'No staff on floor', value: '--' }],
                },
                {
                  heading: 'Labour Cost Summary',
                  rows: [
                    { label: 'Total Labour Cost', value: `${symbol}${(labour.totalCost || 0).toLocaleString(locale)}` },
                    { label: 'Staff Count', value: `${labour.staffCount || 0}` },
                    { label: 'Avg Hourly Rate', value: `${symbol}${(labour.avgHourly || 0).toLocaleString(locale)}` },
                    { label: 'Cost % of Revenue', value: `${labour.costPercentage || 0}%` },
                  ],
                },
              ],
              tableData: (labour.breakdown || []).length > 0 ? {
                title: 'Cost Breakdown by Staff',
                headers: ['Name', 'Hours', 'Cost'],
                rows: (labour.breakdown || []).map(b => [
                  b.name,
                  `${b.hours}`,
                  `${symbol}${(b.cost || 0).toLocaleString(locale)}`,
                ]),
              } : undefined,
            });
            await shareFile(uri, 'Share Staff Report');
          }}
        />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Tab Selector */}
        <View style={[s.tabRow, { backgroundColor: colors.border }]}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'whosIn' && { backgroundColor: colors.pillActiveBg }]}
            onPress={() => switchTab('whosIn')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color={activeTab === 'whosIn' ? colors.pillActiveText : colors.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[s.tabText, { color: colors.textMuted }, activeTab === 'whosIn' && { color: colors.pillActiveText }]}
            >
              Who's In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tab, activeTab === 'labour' && { backgroundColor: colors.pillActiveBg }]}
            onPress={() => switchTab('labour')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="cash-outline"
              size={16}
              color={activeTab === 'labour' ? colors.pillActiveText : colors.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[s.tabText, { color: colors.textMuted }, activeTab === 'labour' && { color: colors.pillActiveText }]}
            >
              Labour & Timesheets
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: Who's In */}
        {activeTab === 'whosIn' && (
          <View>
            {/* Active Staff Badge */}
            <View style={s.badgeRow}>
              <View style={s.badge}>
                <View style={s.greenDot} />
                <Text style={s.badgeText}>
                  {staffIn.length} staff on floor
                </Text>
              </View>
            </View>

            {/* Staff List */}
            {staffIn.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons
                  name="person-outline"
                  size={56}
                  color={colors.textMuted}
                />
                <Text style={[s.emptyTitle, { color: colors.textSecondary }]}>No staff on floor</Text>
                <Text style={[s.emptyDesc, { color: colors.textMuted }]}>
                  No one has clocked in yet today.
                </Text>
              </View>
            ) : (
              staffIn.map((staff) => (
                <PressCard
                  key={staff.id}
                  style={[s.staffCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => {}}
                >
                  <View style={s.staffRow}>
                    {/* Avatar */}
                    <View
                      style={[
                        s.avatar,
                        { backgroundColor: getRoleColor(staff.role) },
                      ]}
                    >
                      <Text style={s.avatarLetter}>
                        {staff.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    {/* Info */}
                    <View style={s.staffInfo}>
                      <View style={s.staffNameRow}>
                        <Text style={[s.staffName, { color: colors.text }]} numberOfLines={1}>
                          {staff.name}
                        </Text>
                        <View style={s.activeDot} />
                      </View>
                      <Text style={[s.staffRole, { color: colors.textMuted }]}>{staff.role}</Text>
                    </View>

                    {/* Clock-in */}
                    <View style={s.clockCol}>
                      <View style={s.clockRow}>
                        <Ionicons
                          name="time-outline"
                          size={13}
                          color={colors.textMuted}
                        />
                        <Text style={[s.clockTime, { color: colors.textSecondary }]}>{staff.clockedInAt}</Text>
                      </View>
                      <Text style={[s.onFloor, { color: colors.textMuted }]}>
                        {formatHoursOnFloor(staff.clockedInAt)}
                      </Text>
                    </View>
                  </View>
                </PressCard>
              ))
            )}
          </View>
        )}

        {/* TAB 2: Labour & Timesheets */}
        {activeTab === 'labour' && (
          <View>
            {/* Labour Summary Cards */}
            <View style={s.metricsRow}>
              <View style={[s.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.metricLabel, { color: colors.textMuted }]}>Total Cost</Text>
                <Text style={[s.metricValue, { color: colors.text }]}>{fmtFull(labour.totalCost)}</Text>
              </View>
              <View style={[s.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.metricLabel, { color: colors.textMuted }]}>Staff Count</Text>
                <Text style={[s.metricValue, { color: colors.text }]}>{labour.staffCount}</Text>
              </View>
              <View style={[s.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.metricLabel, { color: colors.textMuted }]}>Cost %</Text>
                <Text style={[s.metricValue, { color: colors.text }]}>
                  {labour.costPercentage}%
                  <Text style={[s.metricSub, { color: colors.textMuted }]}> of revenue</Text>
                </Text>
              </View>
            </View>

            {/* Cost Breakdown */}
            <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.sectionHeader}>
                <Ionicons name="bar-chart-outline" size={18} color={colors.text} />
                <Text style={[s.sectionTitle, { color: colors.text }]}>Cost Breakdown</Text>
              </View>

              {(labour.breakdown || []).length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="bar-chart-outline" size={36} color="#CCC" />
                  <Text style={{ fontSize: 13, color: '#888', marginTop: 6 }}>No cost data yet</Text>
                </View>
              )}
              {(labour.breakdown || []).map((item, idx) => (
                <View
                  key={item.name}
                  style={[
                    s.breakdownRow,
                    { borderBottomColor: colors.border },
                    idx === (labour.breakdown || []).length - 1 && {
                      borderBottomWidth: 0,
                    },
                  ]}
                >
                  <View style={s.breakdownInfo}>
                    <Text style={[s.breakdownName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[s.breakdownMeta, { color: colors.textMuted }]}>
                      {item.hours} hrs · {fmtFull(item.cost)}
                    </Text>
                  </View>
                  <View style={[s.barTrack, { backgroundColor: colors.pillBg }]}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${(item.cost / maxCost) * 100}%`, backgroundColor: colors.accent },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>

            {/* Weekly Timesheets */}
            <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.sectionHeader}>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.text}
                />
                <Text style={[s.sectionTitle, { color: colors.text }]}>Weekly Timesheets</Text>
              </View>

              {timesheets.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="calendar-outline" size={36} color="#CCC" />
                  <Text style={{ fontSize: 13, color: '#888', marginTop: 6 }}>No timesheet data yet</Text>
                </View>
              )}

              {timesheets.map((person, pIdx) => {
                const isExpanded = expandedId === person.name;
                return (
                  <View
                    key={person.name}
                    style={[
                      s.timesheetCard,
                      { borderBottomColor: colors.border },
                      pIdx === timesheets.length - 1 && {
                        borderBottomWidth: 0,
                        marginBottom: 0,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() =>
                        setExpandedId(isExpanded ? null : person.name)
                      }
                      style={s.timesheetHeader}
                    >
                      <View
                        style={[
                          s.avatarSmall,
                          { backgroundColor: getRoleColor(person.role) },
                        ]}
                      >
                        <Text style={s.avatarLetterSmall}>
                          {person.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>

                      <View style={s.timesheetInfo}>
                        <Text style={[s.timesheetName, { color: colors.text }]} numberOfLines={1}>
                          {person.name}
                        </Text>
                        <Text style={[s.timesheetRole, { color: colors.textMuted }]}>{person.role}</Text>
                      </View>

                      <View style={s.timesheetRight}>
                        <Text style={[s.timesheetHours, { color: colors.text }]}>
                          {person.totalHours} hrs
                        </Text>
                        {person.overtime > 0 && (
                          <View style={s.otBadge}>
                            <Text style={s.otText}>
                              +{person.overtime} OT
                            </Text>
                          </View>
                        )}
                      </View>

                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                        style={{ marginLeft: 8 }}
                      />
                    </TouchableOpacity>

                    {/* Expanded shift table */}
                    {isExpanded && (
                      <View style={[s.shiftTable, { backgroundColor: colors.pillBg }]}>
                        {/* Table header */}
                        <View style={s.shiftRow}>
                          <Text
                            style={[
                              s.shiftCell,
                              s.shiftCellHeader,
                              s.cellDay,
                            ]}
                          >
                            Day
                          </Text>
                          <Text
                            style={[
                              s.shiftCell,
                              s.shiftCellHeader,
                              s.cellTime,
                            ]}
                          >
                            In
                          </Text>
                          <Text
                            style={[
                              s.shiftCell,
                              s.shiftCellHeader,
                              s.cellTime,
                            ]}
                          >
                            Out
                          </Text>
                          <Text
                            style={[
                              s.shiftCell,
                              s.shiftCellHeader,
                              s.cellHours,
                            ]}
                          >
                            Hours
                          </Text>
                        </View>

                        {/* Table body */}
                        {(person.shifts || []).map((shift) => (
                          <View key={shift.date} style={s.shiftRow}>
                            <Text style={[s.shiftCell, s.cellDay, { color: colors.textSecondary }]}>
                              {shift.date}
                            </Text>
                            <Text style={[s.shiftCell, s.cellTime, { color: colors.textSecondary }]}>
                              {shift.in}
                            </Text>
                            <Text style={[s.shiftCell, s.cellTime, { color: colors.textSecondary }]}>
                              {shift.out}
                            </Text>
                            <Text
                              style={[
                                s.shiftCell,
                                s.cellHours,
                                { color: colors.textSecondary },
                                shift.hours > 8 && { color: LC.warning },
                              ]}
                            >
                              {shift.hours}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: LC.card,
    borderBottomWidth: 1,
    borderBottomColor: LC.cardBorder,
  },
  headerTitle: {
    ...TYPE.h2,
    color: LC.text1,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Skeleton
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#EAEAEA',
    borderRadius: 22,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    ...TYPE.smallMed,
    color: LC.text3,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // Badge
  badgeRow: {
    marginBottom: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: LC.successBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LC.success,
  },
  badgeText: {
    ...TYPE.smallMed,
    color: LC.successText,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    ...TYPE.h3,
    color: LC.text2,
  },
  emptyDesc: {
    ...TYPE.small,
    color: LC.text3,
    textAlign: 'center',
  },

  // Staff card
  staffCard: {
    backgroundColor: LC.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    padding: 14,
    marginBottom: 10,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    ...TYPE.bodyBold,
    color: '#FFFFFF',
    fontSize: 18,
  },
  staffInfo: {
    flex: 1,
    marginLeft: 12,
  },
  staffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  staffName: {
    ...TYPE.bodyBold,
    color: LC.text1,
    flexShrink: 1,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: LC.success,
  },
  staffRole: {
    ...TYPE.small,
    color: LC.text3,
    marginTop: 2,
  },
  clockCol: {
    alignItems: 'flex-end',
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clockTime: {
    ...TYPE.smallMed,
    color: LC.text2,
  },
  onFloor: {
    ...TYPE.caption,
    color: LC.text3,
    marginTop: 2,
  },

  // Metrics row
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: LC.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  metricLabel: {
    ...TYPE.caption,
    color: LC.text3,
    marginBottom: 6,
  },
  metricValue: {
    ...TYPE.amount,
    color: LC.text1,
  },
  metricSub: {
    ...TYPE.caption,
    color: LC.text3,
    fontWeight: '400',
  },

  // Section card
  sectionCard: {
    backgroundColor: LC.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    ...TYPE.h3,
    color: LC.text1,
  },

  // Cost breakdown
  breakdownRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: LC.cardBorder,
  },
  breakdownInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakdownName: {
    ...TYPE.bodyMed,
    color: LC.text1,
    flex: 1,
  },
  breakdownMeta: {
    ...TYPE.small,
    color: LC.text3,
  },
  barTrack: {
    height: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    backgroundColor: LC.accent,
    borderRadius: 3,
  },

  // Timesheet
  timesheetCard: {
    borderBottomWidth: 1,
    borderBottomColor: LC.cardBorder,
    paddingBottom: 12,
    marginBottom: 12,
  },
  timesheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetterSmall: {
    ...TYPE.smallMed,
    color: '#FFFFFF',
    fontSize: 14,
  },
  timesheetInfo: {
    flex: 1,
    marginLeft: 10,
  },
  timesheetName: {
    ...TYPE.bodyMed,
    color: LC.text1,
  },
  timesheetRole: {
    ...TYPE.caption,
    color: LC.text3,
  },
  timesheetRight: {
    alignItems: 'flex-end',
  },
  timesheetHours: {
    ...TYPE.bodyBold,
    color: LC.text1,
  },
  otBadge: {
    backgroundColor: LC.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  otText: {
    ...TYPE.caption,
    color: LC.warningText,
    fontWeight: '700',
  },

  // Shift table
  shiftTable: {
    marginTop: 10,
    marginLeft: 44,
    backgroundColor: '#F7F7F7',
    borderRadius: 10,
    padding: 10,
  },
  shiftRow: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  shiftCell: {
    ...TYPE.small,
    color: LC.text2,
  },
  shiftCellHeader: {
    ...TYPE.caption,
    color: LC.text3,
    fontWeight: '700',
  },
  cellDay: {
    width: 44,
  },
  cellTime: {
    flex: 1,
    textAlign: 'center',
  },
  cellHours: {
    width: 50,
    textAlign: 'right',
    fontWeight: '600',
  },
});
