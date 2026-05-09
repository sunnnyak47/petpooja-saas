/**
 * Menu Overview — Owner App
 * Read-only view of menu items, prices, availability status
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useMenuOverview } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';


export default function MenuOverviewScreen() {
  const { outletId } = useOutlet();
  const { data, isLoading, isError, refetch } = useMenuOverview(outletId);

  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const items = data || [];

  const categories = useMemo(() => {
    const cats = ['All', ...new Set(items.map(i => i.category))];
    return cats;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (selectedCat !== 'All') list = list.filter(i => i.category === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCat, search]);

  const stats = useMemo(() => ({
    total: items.length,
    available: items.filter(i => i.available).length,
    unavailable: items.filter(i => !i.available).length,
    veg: items.filter(i => i.veg).length,
  }), [items]);

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
          <Text style={s.headerTitle}>Menu Overview</Text>
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
        <Text style={s.headerTitle}>Menu Overview</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Stats Row */}
      <View style={s.statsRow}>
        {[
          { label: 'Total', value: stats.total, color: '#000' },
          { label: 'Active', value: stats.available, color: '#00B341' },
          { label: 'Off', value: stats.unavailable, color: '#EE0000' },
          { label: 'Veg', value: stats.veg, color: '#00B341' },
        ].map(st => (
          <View key={st.label} style={s.statPill}>
            <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

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

      {/* Category Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
        {categories.map(c => (
          <TouchableOpacity
            key={c}
            style={[s.catPill, selectedCat === c && s.catPillActive]}
            onPress={() => setSelectedCat(c)}
          >
            <Text style={[s.catText, selectedCat === c && s.catTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={s.card}>
              <SkeletonBox width="50%" height={16} borderRadius={4} />
              <SkeletonBox width="30%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          ))
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color="#DDD" />
            <Text style={s.emptyTitle}>No items found</Text>
          </View>
        ) : (
          filtered.map(item => (
            <PressCard key={item.id} style={[s.card, !item.available && s.cardDisabled]}>
              <View style={s.cardRow}>
                {/* Veg/Non-veg indicator */}
                <View style={[s.vegDot, { borderColor: item.veg ? '#00B341' : '#EE0000' }]}>
                  <View style={[s.vegDotInner, { backgroundColor: item.veg ? '#00B341' : '#EE0000' }]} />
                </View>
                <View style={s.cardInfo}>
                  <Text style={[s.itemName, !item.available && { color: '#BBB' }]}>{item.name}</Text>
                  <Text style={s.itemCat}>{item.category}</Text>
                </View>
                <View style={s.cardRight}>
                  <Text style={s.itemPrice}>₹{item.price}</Text>
                  <View style={[s.availBadge, {
                    backgroundColor: item.available ? '#EDFBF3' : '#FFF0F0',
                  }]}>
                    <View style={[s.availDot, {
                      backgroundColor: item.available ? '#00B341' : '#EE0000',
                    }]} />
                    <Text style={[s.availText, {
                      color: item.available ? '#007A2E' : '#8B0000',
                    }]}>
                      {item.available ? 'Active' : 'Off'}
                    </Text>
                  </View>
                </View>
              </View>
            </PressCard>
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  statPill: { alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { ...TYPE.caption, color: '#888', marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  catScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  catPillActive: { backgroundColor: '#000' },
  catText: { ...TYPE.smallMed, color: '#888' },
  catTextActive: { color: '#FFF' },
  scroll: { padding: 16, gap: 8 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  cardDisabled: { opacity: 0.6 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  vegDot: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegDotInner: { width: 8, height: 8, borderRadius: 4 },
  cardInfo: { flex: 1, marginLeft: 12 },
  itemName: { ...TYPE.bodyMed, color: '#000' },
  itemCat: { ...TYPE.caption, color: '#888', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  itemPrice: { ...TYPE.amount, color: '#000' },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  availDot: { width: 6, height: 6, borderRadius: 3 },
  availText: { ...TYPE.caption, fontWeight: '600' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: { ...TYPE.h3, color: '#888' },
});
