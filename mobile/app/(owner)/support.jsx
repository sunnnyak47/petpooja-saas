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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
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

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Contact Cards */}
        <View style={s.contactGrid}>
          <PressCard
            style={s.contactCard}
            onPress={() => Linking.openURL('tel:+919876543210')}
          >
            <View style={[s.contactIcon, { backgroundColor: '#EDFBF3' }]}>
              <Ionicons name="call" size={22} color="#00B341" />
            </View>
            <Text style={s.contactLabel}>Call Support</Text>
            <Text style={s.contactSub}>24/7 helpline</Text>
          </PressCard>

          <PressCard
            style={s.contactCard}
            onPress={() => Linking.openURL('mailto:support@petpooja.com')}
          >
            <View style={[s.contactIcon, { backgroundColor: '#EBF4FF' }]}>
              <Ionicons name="mail" size={22} color="#0070F3" />
            </View>
            <Text style={s.contactLabel}>Email Us</Text>
            <Text style={s.contactSub}>support@petpooja.com</Text>
          </PressCard>
        </View>

        {/* FAQ */}
        <Text style={s.sectionTitle}>Frequently Asked Questions</Text>
        {FAQ.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={s.faqCard}
            activeOpacity={0.7}
            onPress={() => setExpandedIdx(expandedIdx === i ? null : i)}
          >
            <View style={s.faqHeader}>
              <Text style={s.faqQ}>{item.q}</Text>
              <Ionicons
                name={expandedIdx === i ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#888"
              />
            </View>
            {expandedIdx === i && (
              <Text style={s.faqA}>{item.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* System Info */}
        <Text style={s.sectionTitle}>System Info</Text>
        <View style={s.infoCard}>
          {[
            { label: 'App Version', value: '1.0.0' },
            { label: 'Expo SDK', value: '54' },
            { label: 'Backend', value: 'petpooja-saas.onrender.com' },
            { label: 'API Status', value: 'Connected', color: '#00B341' },
          ].map(row => (
            <View key={row.label} style={s.infoRow}>
              <Text style={s.infoLabel}>{row.label}</Text>
              <Text style={[s.infoValue, row.color && { color: row.color }]}>{row.value}</Text>
            </View>
          ))}
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
  scroll: { padding: 16, gap: 14 },
  contactGrid: { flexDirection: 'row', gap: 12 },
  contactCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  contactLabel: { ...TYPE.bodyMed, color: '#000' },
  contactSub: { ...TYPE.caption, color: '#888', marginTop: 2 },
  sectionTitle: { ...TYPE.bodyMed, color: '#000', marginTop: 8 },
  faqCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQ: { ...TYPE.bodyMed, color: '#000', flex: 1, marginRight: 10 },
  faqA: { ...TYPE.small, color: '#444', marginTop: 10, lineHeight: 20 },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
  },
  infoLabel: { ...TYPE.small, color: '#888' },
  infoValue: { ...TYPE.smallMed, color: '#000' },
});
