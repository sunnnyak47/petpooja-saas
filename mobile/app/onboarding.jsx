import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = 'onboarding_complete';

const SLIDES = [
  {
    icon: 'bar-chart',
    color: '#2563eb',
    title: 'Real-Time Dashboard',
    desc: 'Monitor revenue, orders, and staff activity as it happens. All your key metrics in one glance.',
  },
  {
    icon: 'notifications',
    color: '#dc2626',
    title: 'Smart Alerts',
    desc: 'Get instant notifications for voids, refunds, cash variances, and stock issues. Never miss a red flag.',
  },
  {
    icon: 'document-text',
    color: '#16a34a',
    title: 'Export Reports',
    desc: 'Generate PDF reports for sales, staff, and EOD reconciliation. Share instantly via WhatsApp or email.',
  },
  {
    icon: 'moon',
    color: '#d97706',
    title: 'Built for You',
    desc: 'Dark mode, biometric login, offline support, and multi-outlet switching. Your restaurant, your way.',
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      completeOnboarding();
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/mode-select');
  };

  const renderSlide = ({ item }) => (
    <View style={[styles.slide, { width }]}>
      <View style={[styles.iconCircle, { backgroundColor: item.color + '15' }]}>
        <Ionicons name={item.icon} size={64} color={item.color} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.desc}>{item.desc}</Text>
    </View>
  );

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, currentIndex === i && styles.dotActive]}
          />
        ))}
      </View>

      {/* Bottom button */}
      <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
        <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
        <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={20} color="#FFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  topRow: { alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  skipText: { fontSize: 15, color: '#94a3b8', fontWeight: '600' },
  slide: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  iconCircle: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  desc: { fontSize: 16, color: '#475569', textAlign: 'center', marginTop: 12, lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e2e8f0' },
  dotActive: { backgroundColor: '#2563eb', width: 24 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#2563eb', marginHorizontal: 20, marginBottom: 20,
    paddingVertical: 16, borderRadius: 14,
  },
  nextText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
