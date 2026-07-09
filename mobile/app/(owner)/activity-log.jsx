/**
 * Activity / Audit Log — Owner App
 * Tracks all staff actions: logins, voids, refunds, price changes, settings
 */
import React, { useState, useMemo, useCallback } from 'react';
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
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useAuditLogs } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

const ACTION_TYPES = {
  login: { icon: 'log-in', color: '#2563eb', label: 'Login' },
  logout: { icon: 'log-out', color: '#94a3b8', label: 'Logout' },
  void: { icon: 'close-circle', color: '#dc2626', label: 'Void' },
  refund: { icon: 'return-down-back', color: '#d97706', label: 'Refund' },
  discount: { icon: 'pricetag', color: '#d97706', label: 'Discount' },
  price_change: { icon: 'create', color: '#2563eb', label: 'Price Change' },
  settings: { icon: 'settings', color: '#94a3b8', label: 'Settings' },
  order: { icon: 'receipt', color: '#16a34a', label: 'Order' },
  stock: { icon: 'layers', color: '#d97706', label: 'Stock' },
  clock: { icon: 'time', color: '#2563eb', label: 'Clock' },
};


const FILTERS = ['All', 'Voids', 'Financial', 'Staff', 'System'];

const LogItem = React.memo(({ log, colors }) => {
  const act = ACTION_TYPES[log.action] || ACTION_TYPES.order;
  return (
    <View style={[s.logItem, { borderBottomColor: colors.borderLight }]}>
      <View style={[s.iconCircle, { backgroundColor: act.color + '15' }]}>
        <Ionicons name={act.icon} size={18} color={act.color} />
      </View>
      <View style={s.logContent}>
        <View style={s.logTop}>
          <Text style={[s.logUser, { color: colors.text }]}>{log.user}</Text>
          <Text style={[s.logTime, { color: colors.textMuted }]}>{log.time}</Text>
        </View>
        <Text style={[s.logDesc, { color: colors.textSecondary }]}>{log.description}</Text>
        <View style={[s.actionBadge, { backgroundColor: act.color + '15' }]}>
          <Text style={[s.actionBadgeText, { color: act.color }]}>{act.label}</Text>
        </View>
      </View>
    </View>
  );
});

export default function ActivityLogScreen() {
  const { outletId } = useOutlet();
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch } = useAuditLogs(outletId);

  const [filter, setFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const logs = data || [];

  const filtered = useMemo(() => {
    if (filter === 'All') return logs;
    if (filter === 'Voids') return logs.filter(l => l.action === 'void' || l.action === 'refund');
    if (filter === 'Financial') return logs.filter(l => ['void', 'refund', 'discount', 'price_change'].includes(l.action));
    if (filter === 'Staff') return logs.filter(l => ['login', 'logout', 'clock'].includes(l.action));
    if (filter === 'System') return logs.filter(l => ['settings', 'stock'].includes(l.action));
    return logs;
  }, [logs, filter]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(log => {
      const d = log.date || 'Today';
      if (!map[d]) map[d] = [];
      map[d].push(log);
    });
    return Object.entries(map);
  }, [filtered]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Activity Log</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
          <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: 8 }}>
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Activity Log</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.filterScroll, { backgroundColor: colors.headerBg }]}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.pill, { backgroundColor: colors.pillBg }, filter === f && { backgroundColor: colors.pillActiveBg }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.pillText, { color: colors.pillText }, filter === f && { color: colors.pillActiveText }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f172a" />}
      >
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={s.logItem}>
              <SkeletonBox width={36} height={36} borderRadius={18} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <SkeletonBox width="60%" height={14} borderRadius={4} />
                <SkeletonBox width="80%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
            </View>
          ))
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
            <Text style={s.emptyTitle}>No activity found</Text>
            <Text style={s.emptyDesc}>Try a different filter</Text>
          </View>
        ) : (
          grouped.map(([date, items]) => (
            <View key={date}>
              <Text style={[s.dateHeader, { color: colors.textMuted }]}>{date}</Text>
              {items.map((log) => (
                <LogItem key={log.id} log={log} colors={colors} />
              ))}
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { ...TYPE.h2, color: '#0f172a' },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFF',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  pillActive: { backgroundColor: '#2563eb' },
  pillText: { ...TYPE.smallMed, color: '#94a3b8' },
  pillTextActive: { color: '#FFF' },
  scroll: { padding: 16 },
  dateHeader: {
    ...TYPE.label,
    color: '#94a3b8',
    marginTop: 16,
    marginBottom: 10,
  },
  logItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logContent: { flex: 1, marginLeft: 12 },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logUser: { ...TYPE.bodyMed, color: '#0f172a' },
  logTime: { ...TYPE.caption, color: '#94a3b8' },
  logDesc: { ...TYPE.small, color: '#475569', marginTop: 2 },
  actionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  actionBadgeText: { ...TYPE.caption, fontWeight: '700' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: { ...TYPE.h3, color: '#0f172a' },
  emptyDesc: { ...TYPE.small, color: '#94a3b8' },
});
