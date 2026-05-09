/**
 * Alert Settings — Owner App
 * Configure alert thresholds and notification preferences
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { useAlertPreferences, useUpdateAlertPreferences } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

const ALERT_CATEGORIES = [
  {
    key: 'voids',
    label: 'Void Alerts',
    desc: 'When an order is voided',
    icon: 'close-circle',
    color: '#EE0000',
  },
  {
    key: 'refunds',
    label: 'Refund Alerts',
    desc: 'When a refund is processed',
    icon: 'return-down-back',
    color: '#F5A623',
  },
  {
    key: 'discounts',
    label: 'Discount Alerts',
    desc: 'When discount exceeds policy limit',
    icon: 'pricetag',
    color: '#F5A623',
  },
  {
    key: 'low_stock',
    label: 'Low Stock Alerts',
    desc: 'When inventory falls below minimum',
    icon: 'warning',
    color: '#EE0000',
  },
  {
    key: 'staff_late',
    label: 'Late Clock-in',
    desc: 'When staff clocks in late',
    icon: 'time',
    color: '#F5A623',
  },
  {
    key: 'no_sale',
    label: 'No-Sale Alert',
    desc: 'Cash drawer opened without transaction',
    icon: 'cash',
    color: '#EE0000',
  },
  {
    key: 'cash_variance',
    label: 'Cash Variance',
    desc: 'When actual cash differs from expected',
    icon: 'wallet',
    color: '#EE0000',
  },
  {
    key: 'system',
    label: 'System Alerts',
    desc: 'Printer offline, connection issues',
    icon: 'information-circle',
    color: '#0070F3',
  },
];

const defaultPrefs = {
  push_enabled: true,
  voids: true,
  refunds: true,
  discounts: true,
  low_stock: true,
  staff_late: true,
  no_sale: true,
  cash_variance: true,
  system: true,
  sound: true,
  vibrate: true,
};

export default function AlertSettingsScreen() {
  const { outletId } = useOutlet();
  const { colors } = useTheme();
  const { data: prefsData, isLoading, isError, refetch } = useAlertPreferences(outletId);
  const updatePrefs = useUpdateAlertPreferences();

  const [prefs, setPrefs] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const current = prefs || (prefsData && Object.keys(prefsData).length ? prefsData : null) || defaultPrefs;

  const toggle = (key) => {
    const updated = { ...current, [key]: !current[key] };
    setPrefs(updated);
    updatePrefs.mutate({
      outlet_id: outletId,
      section: 'alert_preferences',
      data: updated,
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPrefs(null);
    await refetch();
    setRefreshing(false);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Alert Settings</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Alert Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {/* Master Toggle */}
        <View style={[s.masterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.masterLeft}>
            <Ionicons name="notifications" size={22} color={colors.text} />
            <View>
              <Text style={[s.masterLabel, { color: colors.text }]}>Push Notifications</Text>
              <Text style={[s.masterDesc, { color: colors.textMuted }]}>Enable all push notifications</Text>
            </View>
          </View>
          <Switch
            value={current.push_enabled}
            onValueChange={() => toggle('push_enabled')}
            trackColor={{ false: colors.pillBg, true: colors.switchTrack }}
            thumbColor="#FFF"
          />
        </View>

        {/* Alert Categories */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>ALERT TYPES</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {ALERT_CATEGORIES.map((cat) => (
            <View key={cat.key} style={[s.row, { borderBottomColor: colors.borderLight }]}>
              <View style={[s.rowIcon, { backgroundColor: cat.color + '15' }]}>
                <Ionicons name={cat.icon} size={18} color={cat.color} />
              </View>
              <View style={s.rowText}>
                <Text style={[s.rowLabel, { color: colors.text }]}>{cat.label}</Text>
                <Text style={[s.rowDesc, { color: colors.textMuted }]}>{cat.desc}</Text>
              </View>
              <Switch
                value={current[cat.key]}
                onValueChange={() => toggle(cat.key)}
                trackColor={{ false: colors.pillBg, true: colors.switchTrack }}
                thumbColor="#FFF"
                disabled={!current.push_enabled}
              />
            </View>
          ))}
        </View>

        {/* Sound & Vibration */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>NOTIFICATION STYLE</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
            <View style={[s.rowIcon, { backgroundColor: colors.pillBg }]}>
              <Ionicons name="volume-high" size={18} color={colors.text} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Sound</Text>
            </View>
            <Switch
              value={current.sound}
              onValueChange={() => toggle('sound')}
              trackColor={{ false: colors.pillBg, true: colors.switchTrack }}
              thumbColor="#FFF"
            />
          </View>
          <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
            <View style={[s.rowIcon, { backgroundColor: colors.pillBg }]}>
              <Ionicons name="phone-portrait" size={18} color={colors.text} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Vibration</Text>
            </View>
            <Switch
              value={current.vibrate}
              onValueChange={() => toggle('vibrate')}
              trackColor={{ false: colors.pillBg, true: colors.switchTrack }}
              thumbColor="#FFF"
            />
          </View>
        </View>

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
  scroll: { paddingBottom: 20 },
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    margin: 16,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  masterLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  masterLabel: { ...TYPE.bodyMed, color: '#000' },
  masterDesc: { ...TYPE.caption, color: '#888', marginTop: 2 },
  sectionLabel: {
    ...TYPE.label,
    color: '#888',
    paddingHorizontal: 20,
    paddingTop: 16,
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
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { ...TYPE.body, color: '#000' },
  rowDesc: { ...TYPE.caption, color: '#888', marginTop: 2 },
});
