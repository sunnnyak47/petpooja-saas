import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/lib/api';
import { Colors } from '../../src/constants/colors';

const PERIODS = ['Today', 'Week', 'Month'];

function MetricCard({ label, value, sub, icon, color, trend }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
      {trend != null && (
        <View style={styles.trend}>
          <Ionicons
            name={trend >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
            size={12}
            color={trend >= 0 ? Colors.success : Colors.error}
          />
          <Text style={[styles.trendText, { color: trend >= 0 ? Colors.success : Colors.error }]}>
            {Math.abs(trend)}%
          </Text>
        </View>
      )}
    </View>
  );
}

function TopItem({ rank, name, qty, amount }) {
  return (
    <View style={styles.topItem}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <Text style={styles.topItemName} numberOfLines={1}>{name}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.topItemAmount}>₹{parseFloat(amount || 0).toFixed(0)}</Text>
        <Text style={styles.topItemQty}>{qty} orders</Text>
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState('Today');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const outletId = user?.outlet_id;
      const now = new Date();
      let from, to = now.toISOString().split('T')[0];

      if (period === 'Today') {
        from = to;
      } else if (period === 'Week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        from = d.toISOString().split('T')[0];
      } else {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        from = d.toISOString().split('T')[0];
      }

      const res = await api.get(`/reports/summary?outlet_id=${outletId}&from=${from}&to=${to}`);
      setData(res.data || res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, period]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n) => {
    if (!n) return '₹0';
    const num = parseFloat(n);
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
    return `₹${num.toFixed(0)}`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.gold} />}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Reports</Text>
        <Ionicons name="refresh-outline" size={22} color={Colors.gold} onPress={() => { setRefreshing(true); load(); }} />
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      ) : (
        <View style={styles.body}>
          {/* Revenue Summary */}
          <Text style={styles.sectionTitle}>Revenue</Text>
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Total Revenue"
              value={fmt(data?.total_revenue)}
              icon="cash-outline"
              color={Colors.success}
            />
            <MetricCard
              label="Orders"
              value={String(data?.total_orders || 0)}
              icon="receipt-outline"
              color={Colors.indigo}
            />
            <MetricCard
              label="Avg Order"
              value={fmt(data?.avg_order_value)}
              icon="trending-up-outline"
              color={Colors.gold}
            />
            <MetricCard
              label="Covers"
              value={String(data?.total_covers || data?.total_orders || 0)}
              icon="people-outline"
              color={Colors.info}
            />
          </View>

          {/* Payment breakdown */}
          {data?.payment_breakdown && (
            <>
              <Text style={styles.sectionTitle}>Payment Methods</Text>
              <View style={styles.breakdownCard}>
                {Object.entries(data.payment_breakdown).map(([method, amount]) => (
                  <View key={method} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{method}</Text>
                    <Text style={styles.breakdownValue}>{fmt(amount)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Top Items */}
          {data?.top_items?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Top Items</Text>
              <View style={styles.topItemsCard}>
                {data.top_items.slice(0, 5).map((item, i) => (
                  <TopItem
                    key={item.id || i}
                    rank={i + 1}
                    name={item.name}
                    qty={item.quantity}
                    amount={item.revenue}
                  />
                ))}
              </View>
            </>
          )}

          {/* Empty state */}
          {!data && (
            <View style={styles.center}>
              <Ionicons name="bar-chart-outline" size={48} color={Colors.placeholder} />
              <Text style={styles.emptyText}>No data for selected period</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTitle: { color: Colors.white, fontSize: 20, fontWeight: '800' },

  periodRow: {
    flexDirection: 'row', backgroundColor: Colors.white, padding: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center', backgroundColor: Colors.background,
  },
  periodActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  periodTextActive: { color: Colors.white },

  body: { padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  metricIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  metricValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  metricLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  metricSub: { fontSize: 11, color: Colors.textMuted },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  trendText: { fontSize: 11, fontWeight: '600' },

  breakdownCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  breakdownLabel: { fontSize: 13, color: Colors.textSecondary, textTransform: 'capitalize' },
  breakdownValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },

  topItemsCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  topItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  rankText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  topItemName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  topItemAmount: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  topItemQty: { fontSize: 11, color: Colors.textMuted },

  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 15, marginTop: 12 },
});
