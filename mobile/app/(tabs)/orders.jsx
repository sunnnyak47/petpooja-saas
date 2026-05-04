import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Animated,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrders, useUpdateOrderStatus } from '../../src/hooks/useApi';
import { Colors } from '../../src/constants/colors';
import { T } from '../../src/constants/typography';

const STATUS_TABS = ['All', 'Pending', 'Preparing', 'Ready', 'Delivered'];
const STATUS_COLORS = {
  pending: Colors.warning,
  preparing: Colors.indigo,
  ready: Colors.success,
  delivered: Colors.text3,
  cancelled: Colors.error,
};
const NEXT_STATUS = { pending: 'preparing', preparing: 'ready', ready: 'delivered' };

function Skeleton({ w, h, radius = 8 }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={{ width: w, height: h, borderRadius: radius, backgroundColor: Colors.surface2, opacity: anim, marginBottom: 12 }} />;
}

const OrderCard = React.memo(function OrderCard({ item: o, onAdvance }) {
  const status = (o.status || 'pending').toLowerCase();
  const color = STATUS_COLORS[status] || Colors.text3;
  const canAdvance = !!NEXT_STATUS[status];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[T.h2, { color: Colors.text1 }]}>
            {o.table_number ? `Table ${o.table_number}` : o.order_type || 'Dine-in'}
          </Text>
          <Text style={[T.caption, { color: Colors.text3, marginTop: 2 }]}>
            #{String(o.id || o._id || '').slice(-8)} · {
              new Date(o.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          </Text>
        </View>
        <Text style={[T.num, { color: Colors.gold }]}>
          ₹{Number(o.total_amount || o.total || 0).toFixed(0)}
        </Text>
      </View>

      {(o.items || []).slice(0, 3).map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <Text style={[T.body, { color: Colors.text2, flex: 1 }]}>
            {item.quantity || item.qty || 1}× {item.name || item.item_name || 'Item'}
          </Text>
          <Text style={[T.body, { color: Colors.text3 }]}>
            ₹{Number(item.price || item.amount || 0).toFixed(0)}
          </Text>
        </View>
      ))}
      {(o.items?.length || 0) > 3 && (
        <Text style={[T.caption, { color: Colors.text3, marginTop: 4 }]}>
          +{o.items.length - 3} more items
        </Text>
      )}

      <View style={styles.cardFooter}>
        <View style={[styles.statusBadge, { borderColor: color + '40', backgroundColor: color + '18' }]}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[T.overline, { color }]}>{status.toUpperCase()}</Text>
        </View>
        {canAdvance && (
          <TouchableOpacity onPress={() => onAdvance(o.id || o._id, status)} style={styles.advanceBtn}>
            <LinearGradient colors={[Colors.indigo, '#4040CC']} style={styles.advanceBtnInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={[T.label, { color: '#fff' }]}>
                Mark {NEXT_STATUS[status].charAt(0).toUpperCase() + NEXT_STATUS[status].slice(1)} →
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

export default function Orders() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  const statusParam = activeTab === 'All' ? undefined : activeTab.toLowerCase();
  const { data, isLoading, refetch, isRefetching } = useOrders(statusParam ? { status: statusParam } : {});
  const { mutate: updateStatus } = useUpdateOrderStatus();

  const orders = data?.data || data?.orders || data || [];
  const filtered = search.trim()
    ? orders.filter((o) => {
        const q = search.toLowerCase();
        return (
          String(o.id || o._id).toLowerCase().includes(q) ||
          (o.order_type || '').toLowerCase().includes(q) ||
          String(o.table_number || '').includes(q)
        );
      })
    : orders;

  const handleAdvance = useCallback((orderId, currentStatus) => {
    updateStatus({ orderId, status: NEXT_STATUS[currentStatus] });
  }, [updateStatus]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={['#0D1F3C', '#0A1628']} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[T.h1, { color: Colors.text1, marginBottom: 14 }]}>Orders</Text>
        <View style={styles.searchBar}>
          <Text style={{ color: Colors.text3, marginRight: 8 }}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Table, order ID..."
            placeholderTextColor={Colors.text3}
            style={[T.body, { flex: 1, color: Colors.text1 }]}
          />
        </View>
        <View style={styles.tabs}>
          {STATUS_TABS.map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}>
              <Text style={[T.label, { color: activeTab === tab ? Colors.gold : Colors.text3 }]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={{ padding: 16 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} w="100%" h={140} />)}
        </View>
      ) : (
        <FlashList
          data={filtered}
          estimatedItemSize={160}
          keyExtractor={(o) => String(o.id || o._id || Math.random())}
          renderItem={({ item }) => <OrderCard item={item} onAdvance={handleAdvance} />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[T.h2, { color: Colors.text3 }]}>No orders</Text>
              <Text style={[T.body, { color: Colors.text3, marginTop: 6 }]}>Pull to refresh</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surface2 },
  tabActive: { backgroundColor: Colors.gold + '22', borderWidth: 1, borderColor: Colors.gold + '40' },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  advanceBtn: { borderRadius: 8, overflow: 'hidden' },
  advanceBtnInner: { paddingHorizontal: 14, paddingVertical: 8 },
  empty: { marginTop: 60, alignItems: 'center' },
});
