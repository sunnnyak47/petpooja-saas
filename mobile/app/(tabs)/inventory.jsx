import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/lib/api';
import { Colors } from '../../src/constants/colors';

function StockBar({ current, reorder, max }) {
  const pct = max > 0 ? Math.min(current / max, 1) : 0;
  const isLow = current <= reorder;
  const isCritical = current <= reorder * 0.5;
  const color = isCritical ? Colors.error : isLow ? Colors.warning : Colors.success;
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function InventoryCard({ item }) {
  const isLow = parseFloat(item.current_stock) <= parseFloat(item.reorder_point);
  const isCritical = parseFloat(item.current_stock) <= parseFloat(item.reorder_point) * 0.5;
  const statusColor = isCritical ? Colors.error : isLow ? Colors.warning : Colors.success;
  const statusLabel = isCritical ? 'Critical' : isLow ? 'Low' : 'OK';

  return (
    <View style={[styles.card, isLow && styles.cardAlert]}>
      <View style={styles.cardRow}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={[styles.pill, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.pillText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.stock}>
          {item.current_stock} <Text style={styles.unit}>{item.unit}</Text>
        </Text>
        <Text style={styles.reorder}>Reorder at {item.reorder_point}</Text>
      </View>
      <StockBar
        current={parseFloat(item.current_stock)}
        reorder={parseFloat(item.reorder_point)}
        max={parseFloat(item.reorder_point) * 3}
      />
      {item.category && (
        <Text style={styles.category}>{item.category}</Text>
      )}
    </View>
  );
}

const CATEGORIES = ['All', 'Produce', 'Dairy', 'Meat', 'Pantry', 'Beverages'];

export default function InventoryScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [showLowOnly, setShowLowOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const outletId = user?.outlet_id;
      const res = await api.get(`/inventory/items?outlet_id=${outletId}&limit=200`);
      const data = res.data || res || [];
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let data = [...items];
    if (search) data = data.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    if (category !== 'All') data = data.filter(i => i.category?.toLowerCase() === category.toLowerCase());
    if (showLowOnly) data = data.filter(i => parseFloat(i.current_stock) <= parseFloat(i.reorder_point));
    setFiltered(data);
  }, [items, search, category, showLowOnly]);

  const lowCount = items.filter(i => parseFloat(i.current_stock) <= parseFloat(i.reorder_point)).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Inventory</Text>
          {lowCount > 0 && (
            <Text style={styles.alertBadge}>{lowCount} items need reorder</Text>
          )}
        </View>
        <Ionicons name="refresh-outline" size={22} color={Colors.gold} onPress={() => { setRefreshing(true); load(); }} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          onPress={() => setShowLowOnly(v => !v)}
          style={[styles.filterBtn, showLowOnly && styles.filterBtnActive]}
        >
          <Ionicons name="warning-outline" size={16} color={showLowOnly ? Colors.white : Colors.warning} />
        </TouchableOpacity>
      </View>

      {/* Category tabs */}
      <FlatList
        data={CATEGORIES}
        horizontal
        keyExtractor={c => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
        renderItem={({ item: c }) => (
          <TouchableOpacity
            style={[styles.catPill, category === c && styles.catActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.catText, category === c && styles.catTextActive]}>{c}</Text>
          </TouchableOpacity>
        )}
        style={{ maxHeight: 50, backgroundColor: Colors.white }}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <InventoryCard item={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.gold} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="layers-outline" size={48} color={Colors.placeholder} />
              <Text style={styles.emptyText}>No inventory items</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  headerTitle: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  alertBadge: { color: Colors.warning, fontSize: 12, fontWeight: '600', marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  filterBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.warningLight },
  filterBtnActive: { backgroundColor: Colors.warning },

  catPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  catActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  catTextActive: { color: Colors.white },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 15, marginTop: 12 },

  card: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    marginBottom: 10, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardAlert: { borderLeftWidth: 3, borderLeftColor: Colors.warning },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  pillText: { fontSize: 11, fontWeight: '700' },
  stock: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  unit: { fontSize: 12, fontWeight: '400', color: Colors.textSecondary },
  reorder: { fontSize: 11, color: Colors.textMuted },
  barBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 8 },
  barFill: { height: 4, borderRadius: 2 },
  category: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textTransform: 'capitalize' },
});
