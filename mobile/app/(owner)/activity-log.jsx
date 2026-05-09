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
import SkeletonBox from '../../src/components/SkeletonBox';
import { useAuditLogs } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

const ACTION_TYPES = {
  login: { icon: 'log-in', color: '#0070F3', label: 'Login' },
  logout: { icon: 'log-out', color: '#888', label: 'Logout' },
  void: { icon: 'close-circle', color: '#EE0000', label: 'Void' },
  refund: { icon: 'return-down-back', color: '#F5A623', label: 'Refund' },
  discount: { icon: 'pricetag', color: '#F5A623', label: 'Discount' },
  price_change: { icon: 'create', color: '#0070F3', label: 'Price Change' },
  settings: { icon: 'settings', color: '#888', label: 'Settings' },
  order: { icon: 'receipt', color: '#00B341', label: 'Order' },
  stock: { icon: 'layers', color: '#F5A623', label: 'Stock' },
  clock: { icon: 'time', color: '#0070F3', label: 'Clock' },
};


const FILTERS = ['All', 'Voids', 'Financial', 'Staff', 'System'];

export default function ActivityLogScreen() {
  const { outletId } = useOutlet();
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
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Activity Log</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color="#CCC" />
          <Text style={{ fontSize: 16, color: '#888', marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#000', borderRadius: 8 }}>
            <Text style={{ color: '#FFF', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Activity Log</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.pill, filter === f && s.pillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.pillText, filter === f && s.pillTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
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
            <Ionicons name="document-text-outline" size={48} color="#DDD" />
            <Text style={s.emptyTitle}>No activity found</Text>
            <Text style={s.emptyDesc}>Try a different filter</Text>
          </View>
        ) : (
          grouped.map(([date, items]) => (
            <View key={date}>
              <Text style={s.dateHeader}>{date}</Text>
              {items.map((log) => {
                const act = ACTION_TYPES[log.action] || ACTION_TYPES.order;
                return (
                  <View key={log.id} style={s.logItem}>
                    <View style={[s.iconCircle, { backgroundColor: act.color + '15' }]}>
                      <Ionicons name={act.icon} size={18} color={act.color} />
                    </View>
                    <View style={s.logContent}>
                      <View style={s.logTop}>
                        <Text style={s.logUser}>{log.user}</Text>
                        <Text style={s.logTime}>{log.time}</Text>
                      </View>
                      <Text style={s.logDesc}>{log.description}</Text>
                      <View style={[s.actionBadge, { backgroundColor: act.color + '15' }]}>
                        <Text style={[s.actionBadgeText, { color: act.color }]}>{act.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  headerTitle: { ...TYPE.h2, color: '#000' },
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
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  pillActive: { backgroundColor: '#000' },
  pillText: { ...TYPE.smallMed, color: '#888' },
  pillTextActive: { color: '#FFF' },
  scroll: { padding: 16 },
  dateHeader: {
    ...TYPE.label,
    color: '#888',
    marginTop: 16,
    marginBottom: 10,
  },
  logItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
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
  logUser: { ...TYPE.bodyMed, color: '#000' },
  logTime: { ...TYPE.caption, color: '#888' },
  logDesc: { ...TYPE.small, color: '#444', marginTop: 2 },
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
  emptyTitle: { ...TYPE.h3, color: '#000' },
  emptyDesc: { ...TYPE.small, color: '#888' },
});
