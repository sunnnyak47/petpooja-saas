import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

import { LC } from '../../src/constants/colors';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useOutlet } from '../../src/context/OutletContext';
import {
  useOwnerAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useDismissAlert,
  useAlertBadges,
} from '../../src/hooks/useOwnerApi';

// ─── Alert type config ──────────────────────────────────────────────────────
const ALERT_TYPES = {
  void:           { icon: 'close-circle',       color: '#EE0000', bg: '#FFF0F0', label: 'Void' },
  refund:         { icon: 'return-down-back',    color: '#F5A623', bg: '#FFF8EB', label: 'Refund' },
  discount:       { icon: 'pricetag',            color: '#F5A623', bg: '#FFF8EB', label: 'Discount' },
  low_stock:      { icon: 'warning',             color: '#EE0000', bg: '#FFF0F0', label: 'Low Stock' },
  late_clock:     { icon: 'time',                color: '#F5A623', bg: '#FFF8EB', label: 'Late Clock-in' },
  no_sale:        { icon: 'cash',                color: '#EE0000', bg: '#FFF0F0', label: 'No Sale' },
  price_override: { icon: 'create',              color: '#F5A623', bg: '#FFF8EB', label: 'Price Override' },
  cash_variance:  { icon: 'wallet',              color: '#EE0000', bg: '#FFF0F0', label: 'Cash Variance' },
  system:         { icon: 'information-circle',  color: '#2563eb', bg: '#EBF4FF', label: 'System' },
};


// ─── Filter tab definitions ─────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',    label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'voids',  label: 'Voids' },
  { key: 'stock',  label: 'Stock' },
  { key: 'staff',  label: 'Staff' },
];

// ─── Animated Alert Card ────────────────────────────────────────────────────
function AlertCard({ alert, index, onMarkRead, onDismiss }) {
  const { colors } = useTheme();
  const { symbol, locale } = useCurrency();
  const typeCfg = ALERT_TYPES[alert.type] || ALERT_TYPES.system;
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  React.useEffect(() => {
    const delay = index * 60;
    opacity.value = withTiming(1, { duration: 350 + delay });
    translateY.value = withTiming(0, { duration: 350 + delay });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <PressCard
        style={[
          s.alertCard,
          { backgroundColor: colors.card, borderColor: colors.border },
          !alert.read && s.alertCardUnread,
        ]}
        onPress={() => {
          if (!alert.read) onMarkRead(alert.id);
        }}
      >
        {/* Left accent border for unread */}
        {!alert.read && <View style={s.unreadBar} />}

        <View style={s.alertRow}>
          {/* Icon circle */}
          <View style={[s.iconCircle, { backgroundColor: typeCfg.bg }]}>
            <Ionicons name={typeCfg.icon} size={20} color={typeCfg.color} />
          </View>

          {/* Content */}
          <View style={s.alertContent}>
            <View style={s.alertTitleRow}>
              <Text style={[TYPE.bodyMed, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {alert.title}
              </Text>
              {!alert.read && <View style={s.unreadDot} />}
            </View>

            <Text style={[TYPE.small, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={2}>
              {alert.description}
            </Text>

            <View style={s.alertMeta}>
              <Text style={[TYPE.caption, { color: colors.textMuted }]}>{alert.time}</Text>

              {alert.amount != null && (
                <View style={[s.amountBadge, { backgroundColor: typeCfg.bg }]}>
                  <Text style={[TYPE.caption, { color: typeCfg.color, fontWeight: '700' }]}>
                    {symbol}{alert.amount.toLocaleString(locale)}
                  </Text>
                </View>
              )}

              {alert.staff && (
                <View style={s.staffTag}>
                  <Ionicons name="person-circle-outline" size={12} color={colors.textMuted} />
                  <Text style={[TYPE.caption, { color: colors.textMuted, marginLeft: 2 }]}>
                    {alert.staff}
                  </Text>
                </View>
              )}

              {/* Spacer + dismiss button */}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => onDismiss(alert.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={s.dismissBtn}
              >
                <Text style={[TYPE.caption, { color: colors.textMuted }]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </PressCard>
    </Animated.View>
  );
}

// ─── Skeleton loader ────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <View style={[s.alertCard, { padding: 16 }]}>
      <View style={s.alertRow}>
        <SkeletonBox width={40} height={40} borderRadius={20} style={{ backgroundColor: '#EAEAEA' }} />
        <View style={[s.alertContent, { gap: 8 }]}>
          <SkeletonBox width="70%" height={14} borderRadius={4} style={{ backgroundColor: '#EAEAEA' }} />
          <SkeletonBox width="100%" height={12} borderRadius={4} style={{ backgroundColor: '#EAEAEA' }} />
          <SkeletonBox width="40%" height={10} borderRadius={4} style={{ backgroundColor: '#EAEAEA' }} />
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function AlertsScreen() {
  const router = useRouter();
  const { outletId } = useOutlet();
  const { colors } = useTheme();
  const [activeFilter, setActiveFilter] = useState('all');
  const [localAlerts, setLocalAlerts] = useState(null);

  const { data, isLoading, isError, refetch } = useOwnerAlerts(outletId);
  const { data: badges } = useAlertBadges(outletId);
  const markAlertRead    = useMarkAlertRead();
  const markAllRead      = useMarkAllAlertsRead();
  const dismissAlert     = useDismissAlert();

  // Use API data with safe defaults
  const sourceAlerts = data || [];

  // Use local state for optimistic updates, seed from source
  const alerts = useMemo(() => {
    if (localAlerts) return localAlerts;
    return sourceAlerts;
  }, [localAlerts, sourceAlerts]);

  // Re-seed local state when source changes
  React.useEffect(() => {
    setLocalAlerts(sourceAlerts);
  }, [sourceAlerts]);

  // Badge counts — prefer API, fallback to computed
  const badgeCounts = useMemo(() => {
    if (badges?.totalAlerts != null) return badges;
    return {
      totalAlerts: alerts.length,
      voids: alerts.filter((a) => a.type === 'void' || a.type === 'refund').length,
      refunds: alerts.filter((a) => a.type === 'refund').length,
      lowStock: alerts.filter((a) => a.type === 'low_stock').length,
    };
  }, [badges, alerts]);

  // Filter logic
  const filteredAlerts = useMemo(() => {
    switch (activeFilter) {
      case 'unread':
        return alerts.filter((a) => !a.read);
      case 'voids':
        return alerts.filter((a) => a.type === 'void' || a.type === 'refund');
      case 'stock':
        return alerts.filter((a) => a.type === 'low_stock');
      case 'staff':
        return alerts.filter((a) => a.type === 'late_clock');
      default:
        return alerts;
    }
  }, [alerts, activeFilter]);

  // Mark single alert as read — optimistic update
  const handleMarkRead = useCallback(
    (alertId) => {
      setLocalAlerts((prev) =>
        (prev || []).map((a) => (a.id === alertId ? { ...a, read: true } : a)),
      );
      markAlertRead.mutate({ alertId });
    },
    [markAlertRead],
  );

  // Dismiss an alert — remove from list optimistically
  const handleDismiss = useCallback(
    (alertId) => {
      setLocalAlerts((prev) => (prev || []).filter((a) => a.id !== alertId));
      dismissAlert.mutate({ alertId, outletId });
    },
    [dismissAlert, outletId],
  );

  // Mark all visible unread as read — optimistic update
  const handleMarkAllRead = useCallback(() => {
    setLocalAlerts((prev) => (prev || []).map((a) => ({ ...a, read: true })));
    markAllRead.mutate({ outletId });
  }, [markAllRead, outletId]);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Stats bar pills (memoized to avoid re-creating array each render)
  const statPills = useMemo(() => [
    { label: 'Total', count: badgeCounts.totalAlerts, color: LC.accent, bg: LC.accentLight, filterKey: 'all' },
    { label: 'Voids', count: badgeCounts.voids, color: LC.error, bg: LC.errorBg, filterKey: 'voids' },
    { label: 'Refunds', count: badgeCounts.refunds, color: LC.warning, bg: LC.warningBg, filterKey: null },
    { label: 'Low Stock', count: badgeCounts.lowStock, color: LC.error, bg: LC.errorBg, filterKey: 'stock' },
  ], [badgeCounts]);

  // ── Error State ─────────────────────────────────────────────────────────
  if (isError) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <Text style={[TYPE.h2, { color: colors.text, flex: 1 }]}>Alerts</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
          <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>Unable to load alerts</Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: 8 }}>
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <View style={s.headerLeft}>
          <Text style={[TYPE.h2, { color: colors.text }]}>Alerts</Text>
          {alerts.filter((a) => !a.read).length > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>
                {alerts.filter((a) => !a.read).length}
              </Text>
            </View>
          )}
        </View>
        <View style={s.headerActions}>
          {alerts.filter((a) => !a.read).length > 0 && (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              style={s.markAllBtn}
              disabled={markAllRead.isPending}
            >
              <Text style={s.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push('/(owner)/alert-settings')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LC.accent} />
        }
      >
        {/* Stats Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statsRow}
        >
          {statPills.map((pill) => (
            <TouchableOpacity
              key={pill.label}
              style={[s.statPill, { backgroundColor: pill.bg }]}
              activeOpacity={0.7}
              onPress={() => pill.filterKey && setActiveFilter(pill.filterKey)}
            >
              <Text style={[TYPE.amountLg, { color: pill.color, fontSize: 18 }]}>
                {pill.count ?? 0}
              </Text>
              <Text style={[TYPE.caption, { color: pill.color, marginTop: 1 }]}>
                {pill.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  s.filterTab,
                  { backgroundColor: isActive ? colors.pillActiveBg : colors.pillBg },
                ]}
                activeOpacity={0.7}
                onPress={() => setActiveFilter(tab.key)}
              >
                <Text
                  style={[
                    TYPE.smallMed,
                    { color: isActive ? colors.pillActiveText : colors.pillText },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Loading skeletons */}
        {isLoading && (
          <View style={s.listContainer}>
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        )}

        {/* Alert List */}
        {!isLoading && filteredAlerts.length > 0 && (
          <View style={s.listContainer}>
            {filteredAlerts.map((alert, idx) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                index={idx}
                onMarkRead={handleMarkRead}
                onDismiss={handleDismiss}
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {!isLoading && filteredAlerts.length === 0 && (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <Ionicons name="checkmark-circle" size={56} color={LC.success} />
            </View>
            <Text style={[TYPE.h3, { color: colors.text, marginTop: 16 }]}>All clear!</Text>
            <Text style={[TYPE.small, { color: colors.textMuted, marginTop: 6, textAlign: 'center' }]}>
              No alerts matching this filter right now.
            </Text>
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
    backgroundColor: LC.bg2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: LC.card,
    borderBottomWidth: 1,
    borderBottomColor: LC.cardBorder,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Stats bar
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  statPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 80,
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterTabActive: {
    backgroundColor: '#2563eb',
  },
  filterTabInactive: {
    backgroundColor: '#F0F0F0',
  },

  // Alert list
  listContainer: {
    paddingHorizontal: 16,
    gap: 10,
  },
  alertCard: {
    backgroundColor: LC.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LC.cardBorder,
  },
  // Note: alertCard bg/border is overridden at runtime via useTheme colors
  alertCardUnread: {
    backgroundColor: '#F8FBFF',
    borderColor: LC.accent,
    borderLeftWidth: 3,
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: LC.accent,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertContent: {
    flex: 1,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LC.accent,
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  amountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  staffTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Header
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerBadge: {
    backgroundColor: LC.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  markAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: LC.accentLight,
  },
  markAllText: {
    color: LC.accent,
    fontSize: 12,
    fontWeight: '600',
  },

  // Dismiss button inside alert card
  dismissBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: LC.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
