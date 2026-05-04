import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../src/lib/api';
import { Colors } from '../../src/constants/colors';

const STATUS_CONFIG = {
  active:    { color: Colors.success,  bg: Colors.successLight, label: 'Active' },
  pending:   { color: Colors.warning,  bg: Colors.warningLight, label: 'Pending' },
  completed: { color: Colors.indigo,   bg: Colors.infoLight,    label: 'Completed' },
  cancelled: { color: Colors.error,    bg: Colors.errorLight,   label: 'Cancelled' },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function OrderCard({ order }) {
  const total = parseFloat(order.total_amount || 0).toFixed(2);
  const date = new Date(order.created_at).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.orderNum}>#{order.order_number || order.id?.slice(0, 8)}</Text>
        <StatusPill status={order.status} />
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.tableInfo}>
          {order.table_number ? `Table ${order.table_number}` : order.order_type || 'Dine-in'}
        </Text>
        <Text style={styles.amount}>₹{total}</Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.itemCount}>{order.items?.length || 0} items</Text>
        <Text style={styles.dateText}>{date}</Text>
      </View>
    </View>
  );
}

const FILTERS = ['All', 'Active', 'Pending', 'Completed'];

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (pageNum = 1, reset = true) => {
    try {
      const status = filter === 'All' ? '' : `&status=${filter.toLowerCase()}`;
      const res = await api.get(`/orders?page=${pageNum}&limit=20${status}`);
      const items = res.data?.items || res.data || [];
      const total = res.data?.total || items.length;
      if (reset) {
        setOrders(items);
      } else {
        setOrders(prev => [...prev, ...items]);
      }
      setHasMore(pageNum * 20 < total);
    } catch (e) {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { setPage(1); load(1, true); }, [load]);

  const onRefresh = () => { setRefreshing(true); setPage(1); load(1, true); };
  const onEndReached = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    load(next, false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <Ionicons name="refresh-outline" size={22} color={Colors.gold} onPress={onRefresh} />
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && page === 1 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="receipt-outline" size={48} color={Colors.placeholder} />
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? <ActivityIndicator color={Colors.gold} style={{ marginVertical: 12 }} /> : null
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { color: Colors.white, fontSize: 20, fontWeight: '800' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: Colors.white },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 15, marginTop: 12 },

  card: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    marginBottom: 10, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNum: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillText: { fontSize: 11, fontWeight: '700' },
  tableInfo: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  amount: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  itemCount: { fontSize: 12, color: Colors.textMuted },
  dateText: { fontSize: 12, color: Colors.textMuted },
});
