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
import { useTheme } from '../../src/context/ThemeContext';
import { useOutletDetails } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

function InfoRow({ icon, label, value, colors }) {
  return (
    <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={16} color={colors.textMuted} />
      </View>
      <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[s.rowValue, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

export default function OutletSettingsScreen() {
  const { outletId } = useOutlet();
  const { colors } = useTheme();
  const { data: outletData, isLoading, isError, refetch } = useOutletDetails(outletId);
  const outlet = outletData || {};

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Outlet Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={s.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[s.stateText, { color: colors.textMuted }]}>Loading outlet details...</Text>
        </View>
      ) : isError ? (
        <View style={s.centerState}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={[s.stateText, { color: colors.textMuted }]}>Failed to load outlet details</Text>
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: colors.text }]} onPress={refetch}>
            <Text style={[s.retryText, { color: colors.bg }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {/* Outlet Info */}
        <View style={[s.outletCard, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={s.outletIcon}>
            <Ionicons name="storefront" size={28} color={colors.accent} />
          </View>
          <Text style={[s.outletName, { color: colors.text }]}>{outlet.name || 'Outlet'}</Text>
          <Text style={[s.outletAddr, { color: colors.textMuted }]}>{outlet.address || '—'}</Text>
        </View>

        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>CONTACT</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow icon="call" label="Phone" value={outlet.phone || '—'} colors={colors} />
          <InfoRow icon="mail" label="Email" value={outlet.email || '—'} colors={colors} />
        </View>

        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>BUSINESS</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow icon="document-text" label="GSTIN" value={outlet.gstin || '—'} colors={colors} />
          <InfoRow icon="shield-checkmark" label="FSSAI" value={outlet.fssai || '—'} colors={colors} />
          <InfoRow icon="globe" label="Currency" value={outlet.currency || '—'} colors={colors} />
          <InfoRow icon="time" label="Timezone" value={outlet.timezone || '—'} colors={colors} />
        </View>

        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>OPERATING HOURS</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow icon="sunny" label="Opens" value={outlet.openTime || '—'} colors={colors} />
          <InfoRow icon="moon" label="Closes" value={outlet.closeTime || '—'} colors={colors} />
        </View>

        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>TAX CONFIGURATION</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow icon="calculator" label="CGST" value={outlet.cgst || '—'} colors={colors} />
          <InfoRow icon="calculator" label="SGST" value={outlet.sgst || '—'} colors={colors} />
          <InfoRow icon="card" label="Service Charge" value={outlet.serviceCharge || '—'} colors={colors} />
        </View>

        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>INFRASTRUCTURE</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow icon="grid" label="Tables" value={`${outlet.tables || 0}`} colors={colors} />
          <InfoRow icon="tablet-landscape" label="POS Terminals" value={`${outlet.terminals || 0}`} colors={colors} />
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
