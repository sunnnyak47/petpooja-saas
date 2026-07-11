/**
 * Outlet Settings — Owner App
 * Business info, tax config, operating hours (read-only view with key info)
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrencyConfigForOutlet } from '../../src/utils/currency';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { useOutletDetails } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';
import {
  getPrinterSettings,
  savePrinterSettings,
  discoverBluetoothPrinters,
  printKot,
} from '../../src/lib/printer';

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
  // Region drives which tax fields make sense: AU = ABN + single 10% GST;
  // IN = GSTIN + FSSAI + CGST/SGST.
  const isAU = getCurrencyConfigForOutlet(outlet).region === 'AU';

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Printer settings state ─────────────────────────────────────────────────
  const [printerSettings, setPrinterSettings] = useState({
    enabled: false,
    type: 'none',
    device: null,
    autoPrintKot: false,
  });

  useEffect(() => {
    getPrinterSettings().then(setPrinterSettings);
  }, []);

  const updatePrinterSettings = useCallback(async (patch) => {
    const next = { ...printerSettings, ...patch };
    setPrinterSettings(next);
    await savePrinterSettings(next);
  }, [printerSettings]);

  const handleTestPrint = useCallback(async () => {
    try {
      await printKot({
        outletName: outlet.name || 'MS-RM',
        table: 'T1',
        items: [{ name: 'Test Item', qty: 1 }],
        notes: 'Printer test',
      });
    } catch (err) {
      Alert.alert('Print Failed', err.message || 'Could not complete test print.');
    }
  }, [outlet]);

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
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: colors.accent }]} onPress={refetch}>
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
          {isAU ? (
            <InfoRow icon="document-text" label="ABN" value={outlet.abn || '—'} colors={colors} />
          ) : (
            <>
              <InfoRow icon="document-text" label="GSTIN" value={outlet.gstin || '—'} colors={colors} />
              <InfoRow icon="shield-checkmark" label="FSSAI" value={outlet.fssai || '—'} colors={colors} />
            </>
          )}
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
          {isAU ? (
            <InfoRow icon="calculator" label="GST" value={outlet.gst || outlet.cgst || '10%'} colors={colors} />
          ) : (
            <>
              <InfoRow icon="calculator" label="CGST" value={outlet.cgst || '—'} colors={colors} />
              <InfoRow icon="calculator" label="SGST" value={outlet.sgst || '—'} colors={colors} />
            </>
          )}
          <InfoRow icon="card" label="Service Charge" value={outlet.serviceCharge || '—'} colors={colors} />
        </View>

        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>INFRASTRUCTURE</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow icon="grid" label="Tables" value={`${outlet.tables || 0}`} colors={colors} />
          <InfoRow icon="tablet-landscape" label="POS Terminals" value={`${outlet.terminals || 0}`} colors={colors} />
        </View>

        {/* ── Printer Section ── */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>PRINTER</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Current printer type badge */}
          <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
            <View style={s.rowIcon}>
              <Ionicons name="print-outline" size={16} color={colors.textMuted} />
            </View>
            <Text style={[s.rowLabel, { color: colors.text }]}>Status</Text>
            <View style={[s.printerBadge, { backgroundColor: printerSettings.enabled ? '#dcfce7' : '#f1f5f9' }]}>
              <Text style={[s.printerBadgeText, { color: printerSettings.enabled ? '#16a34a' : '#94a3b8' }]}>
                {printerSettings.enabled
                  ? printerSettings.type === 'bluetooth' ? 'Bluetooth' : 'AirPrint'
                  : 'Disabled'}
              </Text>
            </View>
          </View>

          {/* Enable Printing toggle */}
          <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
            <View style={s.rowIcon}>
              <Ionicons name="power-outline" size={16} color={colors.textMuted} />
            </View>
            <Text style={[s.rowLabel, { color: colors.text }]}>Enable Printing</Text>
            <TouchableOpacity
              onPress={() => updatePrinterSettings({ enabled: !printerSettings.enabled })}
              style={[
                s.pillToggle,
                { backgroundColor: printerSettings.enabled ? '#2563eb' : '#e2e8f0' },
              ]}
              activeOpacity={0.8}
            >
              <View style={[
                s.pillThumb,
                { transform: [{ translateX: printerSettings.enabled ? 18 : 0 }] },
              ]} />
            </TouchableOpacity>
          </View>

          {/* Auto-print KOT toggle — only shown when enabled */}
          {printerSettings.enabled && (
            <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
              <View style={s.rowIcon}>
                <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
              </View>
              <Text style={[s.rowLabel, { color: colors.text }]}>Auto-print KOT</Text>
              <TouchableOpacity
                onPress={() => updatePrinterSettings({ autoPrintKot: !printerSettings.autoPrintKot })}
                style={[
                  s.pillToggle,
                  { backgroundColor: printerSettings.autoPrintKot ? '#2563eb' : '#e2e8f0' },
                ]}
                activeOpacity={0.8}
              >
                <View style={[
                  s.pillThumb,
                  { transform: [{ translateX: printerSettings.autoPrintKot ? 18 : 0 }] },
                ]} />
              </TouchableOpacity>
            </View>
          )}

          {/* Printer Type selector */}
          {printerSettings.enabled && (
            <View style={[s.row, { borderBottomColor: colors.borderLight, flexWrap: 'wrap', gap: 6 }]}>
              <View style={s.rowIcon}>
                <Ionicons name="options-outline" size={16} color={colors.textMuted} />
              </View>
              <Text style={[s.rowLabel, { color: colors.text }]}>Printer Type</Text>
              <View style={s.typeRow}>
                {['airprint', 'bluetooth', 'none'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => updatePrinterSettings({ type: t })}
                    style={[
                      s.typeChip,
                      printerSettings.type === t && s.typeChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      s.typeChipText,
                      printerSettings.type === t && s.typeChipTextActive,
                    ]}>
                      {t === 'airprint' ? 'AirPrint' : t === 'bluetooth' ? 'Bluetooth' : 'None'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Test Print button */}
          {printerSettings.enabled && (
            <TouchableOpacity
              style={s.testPrintBtn}
              onPress={handleTestPrint}
              activeOpacity={0.8}
            >
              <Ionicons name="print-outline" size={16} color="#2563eb" style={{ marginRight: 6 }} />
              <Text style={s.testPrintText}>Test Print</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.noteCard}>
          <Ionicons name="information-circle" size={18} color="#2563eb" />
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
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { ...TYPE.h2, color: '#0f172a' },
  scroll: { paddingBottom: 20 },
  outletCard: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  outletIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  outletName: { ...TYPE.h3, color: '#0f172a', textAlign: 'center' },
  outletAddr: { ...TYPE.small, color: '#94a3b8', textAlign: 'center', marginTop: 4 },
  sectionLabel: {
    ...TYPE.label,
    color: '#94a3b8',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  rowIcon: { width: 28, alignItems: 'center' },
  rowLabel: { ...TYPE.body, color: '#0f172a', flex: 1, marginLeft: 8 },
  rowValue: { ...TYPE.smallMed, color: '#475569' },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    margin: 16,
    padding: 14,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
  },
  noteText: { ...TYPE.small, color: '#2563eb', flex: 1, lineHeight: 18 },

  // Printer section
  printerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  printerBadgeText: {
    ...TYPE.smallMed,
    fontWeight: '700',
  },
  pillToggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  pillThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 1,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  typeChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  typeChipText: {
    ...TYPE.small,
    color: '#475569',
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#FFF',
  },
  testPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  testPrintText: {
    ...TYPE.smallMed,
    color: '#2563eb',
    fontWeight: '700',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  stateText: { ...TYPE.body, color: '#94a3b8', textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  retryText: { ...TYPE.smallMed, color: '#FFF' },
});
