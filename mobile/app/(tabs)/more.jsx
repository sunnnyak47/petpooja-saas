import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PressCard } from '../../src/components/PressCard';

// ─── Feature Definitions ────────────────────────────────────────────────────

const SECTIONS = [
  {
    title: 'Assistant',
    data: [
      {
        icon: 'sparkles',
        color: '#2563eb',
        title: 'Ask MS-RM',
        desc: 'AI answers about your business',
        route: '/(tabs)/assistant',
      },
    ],
  },
  {
    title: 'Analytics',
    data: [
      {
        icon: 'bar-chart',
        color: '#2563eb',
        title: 'Reports',
        desc: 'Revenue & analytics',
        route: '/(tabs)/reports',
      },
      {
        icon: 'calculator',
        color: '#7C3AED',
        title: 'EOD Summary',
        desc: 'End-of-day close',
        route: '/(tabs)/eod',
      },
      {
        icon: 'wallet',
        color: '#059669',
        title: 'Expenses',
        desc: 'Track spend & costs',
        route: '/(tabs)/expenses',
      },
    ],
  },
  {
    title: 'Operations',
    data: [
      {
        icon: 'flame',
        color: '#EF4444',
        title: 'KOT Screen',
        desc: 'Kitchen order tickets',
        route: '/(tabs)/kot',
      },
      {
        icon: 'people',
        color: '#9B59B6',
        title: 'Staff',
        desc: 'Manage your team',
        route: '/(tabs)/staff',
      },
      {
        icon: 'calendar',
        color: '#E74C3C',
        title: 'Reservations',
        desc: 'Table bookings',
        route: '/(tabs)/reservations',
      },
      {
        icon: 'cart',
        color: '#F5A623',
        title: 'Purchase Orders',
        desc: 'Supplier management',
        route: '/(tabs)/purchase-orders',
      },
    ],
  },
  {
    title: 'Growth',
    data: [
      {
        icon: 'star',
        color: '#F39C12',
        title: 'Customers',
        desc: 'CRM & loyalty',
        route: '/(tabs)/customers',
      },
      {
        icon: 'pricetag',
        color: '#10B981',
        title: 'Offers & Discounts',
        desc: 'Promotions & coupons',
        route: '/(tabs)/offers',
      },
      {
        icon: 'bicycle',
        color: '#1ABC9C',
        title: 'Delivery Orders',
        desc: 'Online & delivery ops',
        route: '/(tabs)/delivery-orders',
      },
    ],
  },
  {
    title: 'Tools & More',
    data: [
      {
        icon: 'bar-chart',
        color: '#2563eb',
        title: 'Menu Analytics',
        desc: 'Item performance',
        route: '/(tabs)/menu-analytics',
      },
      {
        icon: 'gift',
        color: '#ec4899',
        title: 'Loyalty & CRM',
        desc: 'Rewards & campaigns',
        route: '/(tabs)/loyalty-crm',
      },
      {
        icon: 'book',
        color: '#6366F1',
        title: 'Recipe Manager',
        desc: 'Standard recipes',
        route: '/(tabs)/recipe-manager',
      },
      {
        icon: 'git-branch',
        color: '#0EA5E9',
        title: 'Multi-Branch',
        desc: 'Manage all outlets',
        route: '/(tabs)/multi-branch',
      },
      {
        icon: 'document-text',
        color: '#F59E0B',
        title: 'GST & BAS',
        desc: 'Tax filings & returns',
        route: '/(tabs)/gst-reports',
      },
      {
        icon: 'videocam',
        color: '#EF4444',
        title: 'CCTV Feed',
        desc: 'Live camera access',
        route: '/(tabs)/cctv-feed',
      },
      {
        icon: 'trash',
        color: '#8B5CF6',
        title: 'Waste Log',
        desc: 'Track food wastage',
        route: '/(tabs)/waste-log',
      },
      {
        icon: 'chatbubbles',
        color: '#06B6D4',
        title: 'Staff Chat',
        desc: 'Internal messaging',
        route: '/(tabs)/staff-chat',
      },
      {
        icon: 'folder',
        color: '#78716C',
        title: 'Documents',
        desc: 'Licenses & files',
        route: '/(tabs)/documents',
      },
      {
        icon: 'qr-code',
        color: '#0ea5e9',
        title: 'QR Codes',
        desc: 'Table ordering QR',
        route: '/(tabs)/qr-codes',
      },
      {
        icon: 'receipt',
        color: '#dc2626',
        title: 'Credit Notes',
        desc: 'Refunds & credits',
        route: '/(tabs)/credit-notes',
      },
      {
        icon: 'git-network',
        color: '#7c3aed',
        title: 'Integrations',
        desc: 'Connect & sync',
        route: '/(tabs)/integrations',
      },
      {
        icon: 'swap-horizontal',
        color: '#059669',
        title: 'Payout Recon',
        desc: 'Delivery payouts',
        route: '/(tabs)/aggregator-reconciliation',
      },
      {
        icon: 'business',
        color: '#d97706',
        title: 'Central Kitchen',
        desc: 'Indents & supply',
        route: '/(tabs)/central-kitchen',
      },
    ],
  },
];

// ─── Feature Card ────────────────────────────────────────────────────────────

function FeatureCard({ item, comingSoon }) {
  const handlePress = () => {
    if (item.route) {
      router.push(item.route);
    }
  };

  return (
    <PressCard
      scaleDown={comingSoon ? 0.98 : 0.95}
      onPress={handlePress}
      disabled={comingSoon}
      style={[
        styles.card,
        comingSoon ? styles.cardComingSoon : styles.cardActive,
      ]}
    >
      {/* Soon badge */}
      {comingSoon && (
        <View style={styles.soonBadge}>
          <Text style={styles.soonBadgeText}>Soon</Text>
        </View>
      )}

      {/* Icon */}
      <View style={styles.iconContainer}>
        <View
          style={[
            styles.iconBg,
            comingSoon
              ? { backgroundColor: item.color + '20' }
              : { backgroundColor: item.color + '18' },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={26}
            color={comingSoon ? item.color + '80' : item.color}
          />
        </View>
      </View>

      {/* Text */}
      <Text
        style={[styles.cardTitle, comingSoon && styles.cardTitleDimmed]}
        numberOfLines={1}
      >
        {item.title}
      </Text>
      <Text style={styles.cardDesc} numberOfLines={2}>
        {item.desc}
      </Text>

      {/* Chevron — only on active */}
      {!comingSoon && (
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={14} color="#CCCCCC" />
        </View>
      )}
    </PressCard>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F7" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>More</Text>
          <Text style={styles.headerSubtitle}>All features in one place</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 24, 32) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.comingSoon && (
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>
                    {section.data.length} features
                  </Text>
                </View>
              )}
            </View>

            {/* 2-column grid */}
            <View style={styles.grid}>
              {section.data.map((item, idx) => {
                const isLastOdd =
                  idx === section.data.length - 1 &&
                  section.data.length % 2 !== 0;
                return (
                  <View
                    key={item.title}
                    style={[styles.cardWrapper, isLastOdd && styles.cardWrapperHalf]}
                  >
                    <FeatureCard
                      item={item}
                      comingSoon={!!section.comingSoon}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.6,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 2,
    fontWeight: '500',
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionBadge: {
    backgroundColor: '#FFF3CD',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.3,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardWrapper: {
    width: '47.5%',
  },
  cardWrapperHalf: {
    width: '47.5%',
  },

  // Card base
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    minHeight: 138,
    position: 'relative',
  },
  cardActive: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardComingSoon: {
    borderWidth: 1,
    borderColor: '#EAEAEA',
    opacity: 0.5,
  },

  // Soon badge
  soonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FFF3CD',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    zIndex: 1,
  },
  soonBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.3,
  },

  // Icon
  iconContainer: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  iconBg: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Card text
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
    letterSpacing: -0.1,
  },
  cardTitleDimmed: {
    color: '#999999',
  },
  cardDesc: {
    fontSize: 12,
    color: '#888888',
    lineHeight: 16,
  },

  // Chevron
  chevronWrap: {
    position: 'absolute',
    bottom: 14,
    right: 14,
  },
});
