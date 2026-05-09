/**
 * Outlet Settings — Owner App
 * Business info, tax config, operating hours (read-only view with key info)
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { useOutletDetails } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

function InfoRow({ icon, label, value }) {
  return (
    <View style={s.row}>
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={16} color="#888" />
      </View>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export default function OutletSettingsScreen() {
  const { outletId } = useOutlet();
  const { data: outletData, isLoading, isError, refetch } = useOutletDetails(outletId);
  const outlet = outletData || {};

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Outlet Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={s.centerState}>
          <ActivityIndicator size="large" color="#0070F3" />
          <Text style={s.stateText}>Loading outlet details...</Text>
        </View>
      ) : isError ? (
        <View style={s.centerState}>
          <Ionicons name="cloud-offline-outline" size={48} color="#CCC" />
          <Text style={s.stateText}>Failed to load outlet details</Text>
          <TouchableOpacity style={s.retryBtn} onPress={refetch}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {/* Outlet Info */}
        <View style={s.outletCard}>
          <View style={s.outletIcon}>
            <Ionicons name="storefront" size={28} color="#0070F3" />
          </View>
          <Text style={s.outletName}>{outlet.name || 'Outlet'}</Text>
          <Text style={s.outletAddr}>{outlet.address || '—'}</Text>
        </View>

        <Text style={s.sectionLabel}>CONTACT</Text>
        <View style={s.section}>
          <InfoRow icon="call" label="Phone" value={outlet.phone || '—'} />
          <InfoRow icon="mail" label="Email" value={outlet.email || '—'} />
        </View>

        <Text style={s.sectionLabel}>BUSINESS</Text>
        <View style={s.section}>
          <InfoRow icon="document-text" label="GSTIN" value={outlet.gstin || '—'} />
          <InfoRow icon="shield-checkmark" label="FSSAI" value={outlet.fssai || '—'} />
          <InfoRow icon="globe" label="Currency" value={outlet.currency || '—'} />
          <InfoRow icon="time" label="Timezone" value={outlet.timezone || '—'} />
        </View>

        <Text style={s.sectionLabel}>OPERATING HOURS</Text>
        <View style={s.section}>
          <InfoRow icon="sunny" label="Opens" value={outlet.openTime || '—'} />
          <InfoRow icon="moon" label="Closes" value={outlet.closeTime || '—'} />
        </View>

        <Text style={s.sectionLabel}>TAX CONFIGURATION</Text>
        <View style={s.section}>
          <InfoRow icon="calculator" label="CGST" value={outlet.cgst || '—'} />
          <InfoRow icon="calculator" label="SGST" value={outlet.sgst || '—'} />
          <InfoRow icon="card" label="Service Charge" value={outlet.serviceCharge || '—'} />
        </View>

        <Text style={s.sectionLabel}>INFRASTRUCTURE</Text>
        <View style={s.section}>
          <InfoRow icon="grid" label="Tables" value={`${outlet.tables || 0}`} />
          <InfoRow icon="tablet-landscape" label="POS Terminals" value={`${outlet.terminals || 0}`} />
        </View>

        <View style={s.noteCard}>
          <Ionicons name="information-circle" size={18} color="#0070F3" />
          <Text style={s.noteText}>
            To modify outlet settings, use the web dashboard or contact support.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      )}
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
  scroll: { paddingBottom: 20 },
  outletCard: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  outletIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  outletName: { ...TYPE.h3, color: '#000', textAlign: 'center' },
  outletAddr: { ...TYPE.small, color: '#888', textAlign: 'center', marginTop: 4 },
  sectionLabel: {
    ...TYPE.label,
    color: '#888',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EAEAEA',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
  },
  rowIcon: { width: 28, alignItems: 'center' },
  rowLabel: { ...TYPE.body, color: '#000', flex: 1, marginLeft: 8 },
  rowValue: { ...TYPE.smallMed, color: '#444' },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    margin: 16,
    padding: 14,
    backgroundColor: '#EBF4FF',
    borderRadius: 12,
  },
  noteText: { ...TYPE.small, color: '#0070F3', flex: 1, lineHeight: 18 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  stateText: { ...TYPE.body, color: '#888', textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#0070F3',
    borderRadius: 8,
  },
  retryText: { ...TYPE.smallMed, color: '#FFF' },
});
