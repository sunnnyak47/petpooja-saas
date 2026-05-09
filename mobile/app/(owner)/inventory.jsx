/**
 * Inventory — Owner App
 * Low stock alerts, stock search, wastage logs
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LC } from '../../src/constants/colors';
import { TYPE } from '../../src/constants/typography';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useLowStock, useWastageLogs } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

const { width: SCREEN_W } = Dimensions.get('window');


function getSeverity(current, min) {
  const ratio = current / min;
  if (ratio <= 0.3) return { label: 'Critical', color: LC.error, bg: '#FFF0F0' };
  if (ratio <= 0.6) return { label: 'Low', color: LC.warning, bg: '#FFF8EB' };
  return { label: 'Warning', color: '#F5A623', bg: '#FFF8EB' };
}

export default function InventoryScreen() {
  const { outletId } = useOutlet();
  const { data: lowStockData, isLoading: loadingStock, isError: errorStock, refetch: refetchStock } = useLowStock(outletId);
  const { data: wastageData, isLoading: loadingWastage, isError: errorWastage, refetch: refetchWastage } = useWastageLogs(outletId);

  const [tab, setTab] = useState('stock'); // 'stock' | 'wastage'
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const lowStock = lowStockData || [];
  const wastage = wastageData || [];

  const filteredStock = useMemo(() => {
    if (!search.trim()) return lowStock;
    const q = search.toLowerCase();
    return lowStock.filter(i => i.name.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
  }, [lowStock, search]);

  const totalWastageCost = useMemo(() => wastage.reduce((s, w) => s + (w.cost || 0), 0), [wastage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStock(), refetchWastage()]);
    setRefreshing(false);
  }, []);

  const isLoading = loadingStock || loadingWastage;
  const isError = errorStock && errorWastage;

  if (isError) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Inventory</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color="#CCC" />
          <Text style={{ fontSize: 16, color: '#888', marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => onRefresh()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#000', borderRadius: 8 }}>
            <Text style={{ color: '#FFF', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Inventory</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {['stock', 'wastage'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'stock' ? `Low Stock (${lowStock.length})` : 'Wastage Log'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {tab === 'stock' ? (
          <>
            {/* Search */}
            <View style={s.searchWrap}>
              <Ionicons name="search" size={18} color="#888" />
              <TextInput
                style={s.searchInput}
                placeholder="Search items..."
                placeholderTextColor="#BBB"
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#BBB" />
                </TouchableOpacity>
              )}
            </View>

            {/* Summary Badge */}
            <View style={s.summaryBadge}>
              <Ionicons name="warning" size={16} color={LC.error} />
              <Text style={s.summaryText}>
                <Text style={{ fontWeight: '800' }}>{lowStock.filter(i => i.currentQty / i.minQty <= 0.3).length}</Text> critical,{' '}
                <Text style={{ fontWeight: '800' }}>{lowStock.length}</Text> items below minimum
              </Text>
            </View>

            {/* Loading */}
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={s.card}>
                  <SkeletonBox width="60%" height={16} borderRadius={4} />
                  <SkeletonBox width="40%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
                  <SkeletonBox width="100%" height={6} borderRadius={3} style={{ marginTop: 12 }} />
                </View>
              ))
            ) : filteredStock.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="checkmark-circle" size={48} color="#00B341" />
                <Text style={s.emptyTitle}>All stocked up!</Text>
                <Text style={s.emptyDesc}>No items below minimum level</Text>
              </View>
            ) : (
              filteredStock.map((item) => {
                const sev = getSeverity(item.currentQty, item.minQty);
                const ratio = Math.min(item.currentQty / item.minQty, 1);
                return (
                  <PressCard key={item.id || item.name} style={s.card}>
                    <View style={s.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.itemName}>{item.name}</Text>
                        <Text style={s.itemCategory}>{item.category || 'General'}</Text>
                      </View>
                      <View style={[s.severityBadge, { backgroundColor: sev.bg }]}>
                        <Text style={[s.severityText, { color: sev.color }]}>{sev.label}</Text>
                      </View>
                    </View>
                    {/* Qty bar */}
                    <View style={s.qtyRow}>
                      <Text style={s.qtyText}>
                        {item.currentQty} / {item.minQty} {item.unit}
                      </Text>
                    </View>
                    <View style={s.barBg}>
                      <View style={[s.barFill, { width: `${ratio * 100}%`, backgroundColor: sev.color }]} />
                    </View>
                  </PressCard>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* Wastage Summary */}
            <View style={s.wastageSummary}>
              <Text style={s.wastageLabel}>Today's Wastage Cost</Text>
              <Text style={s.wastageAmount}>₹{totalWastageCost.toLocaleString('en-IN')}</Text>
            </View>

            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={s.card}>
                  <SkeletonBox width="50%" height={16} borderRadius={4} />
                  <SkeletonBox width="70%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
                </View>
              ))
            ) : wastage.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="leaf" size={48} color="#00B341" />
                <Text style={s.emptyTitle}>No wastage recorded</Text>
                <Text style={s.emptyDesc}>Great job minimizing waste!</Text>
              </View>
            ) : (
              wastage.map((w) => (
                <PressCard key={w.id} style={s.card}>
                  <View style={s.cardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemName}>{w.item}</Text>
                      <Text style={s.itemCategory}>
                        {w.qty} {w.unit} — {w.reason}
                      </Text>
                    </View>
                    <Text style={s.wastageCost}>₹{w.cost}</Text>
                  </View>
                  <View style={s.wastageFooter}>
                    <Text style={s.wastageTime}>{w.date}</Text>
                    {w.staff && <Text style={s.wastageStaff}>{w.staff}</Text>}
                  </View>
                </PressCard>
              ))
            )}
          </>
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFF',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#000' },
  tabText: { ...TYPE.smallMed, color: '#888' },
  tabTextActive: { color: '#FFF' },
  scroll: { padding: 16, gap: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryText: { ...TYPE.small, color: '#444' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  itemName: { ...TYPE.bodyMed, color: '#000' },
  itemCategory: { ...TYPE.small, color: '#888', marginTop: 2 },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  severityText: { ...TYPE.caption, fontWeight: '700' },
  qtyRow: { marginTop: 10 },
  qtyText: { ...TYPE.small, color: '#444' },
  barBg: {
    height: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3 },
  wastageSummary: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  wastageLabel: { ...TYPE.caption, color: '#888', letterSpacing: 1 },
  wastageAmount: { ...TYPE.amountLg, color: LC.error, marginTop: 4 },
  wastageCost: { ...TYPE.amount, color: LC.error },
  wastageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  wastageTime: { ...TYPE.caption, color: '#888' },
  wastageStaff: { ...TYPE.caption, color: '#0070F3' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: { ...TYPE.h3, color: '#000' },
  emptyDesc: { ...TYPE.small, color: '#888' },
});
