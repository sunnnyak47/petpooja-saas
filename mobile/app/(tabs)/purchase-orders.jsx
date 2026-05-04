import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../src/lib/api';
import { Colors } from '../../src/constants/colors';

const STATUS_CONFIG = {
  draft:     { color: Colors.textSecondary, bg: Colors.background,    label: 'Draft' },
  sent:      { color: Colors.info,          bg: Colors.infoLight,     label: 'Sent' },
  approved:  { color: Colors.warning,       bg: Colors.warningLight,  label: 'Approved' },
  received:  { color: Colors.success,       bg: Colors.successLight,  label: 'Received' },
  cancelled: { color: Colors.error,         bg: Colors.errorLight,    label: 'Cancelled' },
};

function POCard({ po, onApprove, onDownload, onWhatsApp }) {
  const cfg = STATUS_CONFIG[po.status] || STATUS_CONFIG.draft;
  const total = parseFloat(po.total_amount || 0).toFixed(2);
  const date = new Date(po.order_date || po.created_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.poNum}>{po.po_number}</Text>
        <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <Text style={styles.supplier}>{po.supplier?.name || 'Unknown Supplier'}</Text>
      <View style={styles.cardRow}>
        <Text style={styles.dateText}>{date}</Text>
        <Text style={styles.amount}>₹{total}</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {po.status === 'draft' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.successLight }]} onPress={() => onApprove(po)}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
            <Text style={[styles.actionText, { color: Colors.success }]}>Approve</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.infoLight }]} onPress={() => onDownload(po)}>
          <Ionicons name="download-outline" size={16} color={Colors.indigo} />
          <Text style={[styles.actionText, { color: Colors.indigo }]}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#25D36620' }]} onPress={() => onWhatsApp(po)}>
          <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
          <Text style={[styles.actionText, { color: '#25D366' }]}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PurchaseOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [pos, setPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/purchase-orders?limit=50');
      const items = res.data?.items || res.data || [];
      setPOs(items);
    } catch {
      setPOs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (po) => {
    Alert.alert('Approve PO', `Approve ${po.po_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve', onPress: async () => {
          try {
            await api.post(`/purchase-orders/${po.id}/approve`);
            Alert.alert('Success', 'Purchase order approved');
            load();
          } catch (e) {
            Alert.alert('Error', e.message);
          }
        }
      }
    ]);
  };

  const handleDownload = async (po) => {
    // Open PDF in browser (auth token won't be sent this way, but it's a fallback)
    const url = `https://petpooja-saas.onrender.com/api/purchase-orders/${po.id}/pdf`;
    Alert.alert('PDF', 'Opening PDF in browser. You may need to sign in there too.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open', onPress: () => Linking.openURL(url) },
    ]);
  };

  const handleWhatsApp = async (po) => {
    Alert.prompt(
      'Send via WhatsApp',
      `Enter supplier phone number for ${po.po_number}:`,
      async (phone) => {
        if (!phone) return;
        try {
          await api.post(`/purchase-orders/${po.id}/whatsapp`, {
            phone: phone.trim().replace(/\D/g, '')
          });
          Alert.alert('Sent!', 'PO sent via WhatsApp');
        } catch (e) {
          // Fallback: wa.me link
          const supplier = po.supplier?.phone || phone;
          const msg = encodeURIComponent(`PO ${po.po_number} - ₹${parseFloat(po.total_amount || 0).toFixed(2)}`);
          Linking.openURL(`https://wa.me/${supplier.replace(/\D/g, '')}?text=${msg}`);
        }
      },
      'plain-text',
      po.supplier?.phone || ''
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Purchase Orders</Text>
        <Ionicons name="refresh-outline" size={22} color={Colors.gold} onPress={() => { setRefreshing(true); load(); }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      ) : (
        <FlatList
          data={pos}
          keyExtractor={p => p.id}
          renderItem={({ item }) => (
            <POCard
              po={item}
              onApprove={handleApprove}
              onDownload={handleDownload}
              onWhatsApp={handleWhatsApp}
            />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.gold} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cart-outline" size={48} color={Colors.placeholder} />
              <Text style={styles.emptyText}>No purchase orders</Text>
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 15, marginTop: 12 },

  card: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    marginBottom: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  poNum: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  supplier: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginBottom: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 12, color: Colors.textMuted },
  amount: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },

  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
});
