/**
 * Support — Owner App
 * FAQ, contact, system diagnostics
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import api from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { PressCard } from '../../src/components/PressCard';

const FAQ = [
  { q: 'How do I void an order?', a: 'On the POS terminal, open the order → tap "..." → select "Void". This requires manager/owner approval.' },
  { q: 'How do I process a refund?', a: 'Go to Orders → find the order → tap "Refund". You can do partial or full refund. The amount is returned to the original payment method.' },
  { q: 'How do alerts work?', a: 'The system monitors for voids, refunds above thresholds, low stock, late clock-ins, and cash variances. You receive push notifications and can review them in the Alerts tab.' },
  { q: 'Can I change menu prices from the app?', a: 'Menu prices can only be changed from the web dashboard. The owner app provides read-only menu visibility.' },
  { q: 'How is EOD reconciliation done?', a: 'At end of day, the cashier counts cash and enters the actual amount. The system compares with expected cash and flags any variance.' },
  { q: 'What does the cost percentage mean?', a: 'Labour cost percentage = (total staff wages / total revenue) × 100. Industry standard is 25-35% for restaurants.' },
];

export default function SupportScreen() {
  const [expandedIdx, setExpandedIdx] = useState(null);
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Contact Cards */}
        <View style={s.contactGrid}>
          <PressCard
            style={[s.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => Linking.openURL('tel:+919876543210')}
          >
            <View style={[s.contactIcon, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="call" size={22} color="#16a34a" />
            </View>
            <Text style={[s.contactLabel, { color: colors.text }]}>Call Support</Text>
            <Text style={[s.contactSub, { color: colors.textMuted }]}>24/7 helpline</Text>
          </PressCard>

          <PressCard
            style={[s.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => Linking.openURL('mailto:support@ms-rm.com')}
          >
            <View style={[s.contactIcon, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="mail" size={22} color="#2563eb" />
            </View>
            <Text style={[s.contactLabel, { color: colors.text }]}>Email Us</Text>
            <Text style={[s.contactSub, { color: colors.textMuted }]}>support@ms-rm.com</Text>
          </PressCard>
        </View>

        {/* FAQ */}
        <Text style={[s.sectionTitle, { color: colors.text }]}>Frequently Asked Questions</Text>
        {FAQ.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={[s.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setExpandedIdx(expandedIdx === i ? null : i)}
          >
            <View style={s.faqHeader}>
              <Text style={[s.faqQ, { color: colors.text }]}>{item.q}</Text>
              <Ionicons
                name={expandedIdx === i ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </View>
            {expandedIdx === i && (
              <Text style={[s.faqA, { color: colors.textSecondary }]}>{item.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* System Info */}
        <Text style={[s.sectionTitle, { color: colors.text }]}>System Info</Text>
        <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label: 'App Version', value: Constants.expoConfig?.version || '—' },
            { label: 'Expo SDK', value: Constants.expoConfig?.sdkVersion?.split('.')[0] || '54' },
            { label: 'Backend', value: (api.defaults.baseURL || '').replace(/^https?:\/\//, '').replace(/\/api\/?$/, '') || '—' },
          ].map(row => (
            <View key={row.label} style={[s.infoRow, { borderBottomColor: colors.borderLight }]}>
              <Text style={[s.infoLabel, { color: colors.textMuted }]}>{row.label}</Text>
              <Text style={[s.infoValue, { color: colors.text }, row.color && { color: row.color }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  scroll: { padding: 16, gap: 14 },
  contactGrid: { flexDirection: 'row', gap: 12 },
  contactCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  contactLabel: { ...TYPE.bodyMed, color: '#0f172a' },
  contactSub: { ...TYPE.caption, color: '#94a3b8', marginTop: 2 },
  sectionTitle: { ...TYPE.bodyMed, color: '#0f172a', marginTop: 8 },
  faqCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQ: { ...TYPE.bodyMed, color: '#0f172a', flex: 1, marginRight: 10 },
  faqA: { ...TYPE.small, color: '#475569', marginTop: 10, lineHeight: 20 },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  infoLabel: { ...TYPE.small, color: '#94a3b8' },
  infoValue: { ...TYPE.smallMed, color: '#0f172a' },
});
