/**
 * Goals — Owner App
 * Revenue targets, weekly comparisons, progress tracking
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { TYPE } from '../../src/constants/typography';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useGoals, useOwnerDashboard } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

const { width: SCREEN_W } = Dimensions.get('window');

const DEFAULT_GOALS = {
  daily: { target: 0, current: 0 },
  weekly: { target: 0, current: 0 },
  monthly: { target: 0, current: 0 },
};

function fmt(v) {
  const n = parseFloat(v);
  if (!n || isNaN(n)) return '₹0';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

function ProgressRing({ progress, size = 120, strokeWidth = 10, color = '#0070F3' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));
  const center = size / 2;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#F0F0F0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: '#000' }}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
    </View>
  );
}

export default function GoalsScreen() {
  const { outletId } = useOutlet();
  const { data: goalsData, isLoading, isError, refetch } = useGoals(outletId);
  const { data: dashData } = useOwnerDashboard(outletId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeGoal, setActiveGoal] = useState('daily');

  const goals = goalsData?.daily ? goalsData : DEFAULT_GOALS;
  const currentRevenue = dashData?.todayRevenue || 0;

  // Override daily.current with live data
  const liveGoals = useMemo(() => ({
    ...goals,
    daily: { ...goals.daily, current: currentRevenue },
  }), [goals, currentRevenue]);

  const goal = liveGoals[activeGoal];
  const progress = goal.target > 0 ? goal.current / goal.target : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const goalColor = progress >= 1 ? '#00B341' : progress >= 0.7 ? '#0070F3' : progress >= 0.4 ? '#F5A623' : '#EE0000';

  if (isError) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Goals</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color="#CCC" />
          <Text style={{ fontSize: 16, color: '#888', marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#000', borderRadius: 8 }}>
            <Text style={{ color: '#FFF', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Goals</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Period Toggle */}
      <View style={s.periodRow}>
        {['daily', 'weekly', 'monthly'].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.periodPill, activeGoal === p && s.periodPillActive]}
            onPress={() => setActiveGoal(p)}
          >
            <Text style={[s.periodText, activeGoal === p && s.periodTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {isLoading ? (
          <>
            <View style={s.heroCard}>
              <SkeletonBox width={120} height={120} borderRadius={60} />
              <SkeletonBox width="50%" height={20} borderRadius={6} style={{ marginTop: 16 }} />
            </View>
            <View style={s.card}>
              <SkeletonBox width="40%" height={16} borderRadius={4} />
              <SkeletonBox width="100%" height={40} borderRadius={8} style={{ marginTop: 12 }} />
            </View>
          </>
        ) : (
          <>
            {/* Main Progress Ring */}
            <PressCard style={s.heroCard}>
              <ProgressRing progress={progress} size={140} strokeWidth={12} color={goalColor} />

              <Text style={s.heroLabel}>
                {activeGoal === 'daily' ? "Today's" : activeGoal === 'weekly' ? 'This Week' : 'This Month'} Target
              </Text>

              <View style={s.heroNumbers}>
                <View style={s.heroCol}>
                  <Text style={s.heroValue}>{fmt(goal.current)}</Text>
                  <Text style={s.heroSub}>Achieved</Text>
                </View>
                <View style={s.heroDivider} />
                <View style={s.heroCol}>
                  <Text style={s.heroValue}>{fmt(goal.target)}</Text>
                  <Text style={s.heroSub}>Target</Text>
                </View>
                <View style={s.heroDivider} />
                <View style={s.heroCol}>
                  <Text style={[s.heroValue, { color: goalColor }]}>{fmt(Math.max(goal.target - goal.current, 0))}</Text>
                  <Text style={s.heroSub}>Remaining</Text>
                </View>
              </View>

              {progress >= 1 && (
                <View style={s.achievedBadge}>
                  <Ionicons name="trophy" size={16} color="#F5A623" />
                  <Text style={s.achievedText}>Target achieved!</Text>
                </View>
              )}
            </PressCard>

            {/* Weekly Comparison */}
            {goalsData?.comparison && goalsData.comparison.length > 0 && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Weekly Comparison</Text>
                {goalsData.comparison.map((w, i) => {
                  const maxVal = Math.max(...goalsData.comparison.map(c => c.value), 1);
                  const pct = (w.value / maxVal) * 100;
                  return (
                    <View key={w.label} style={s.compRow}>
                      <Text style={s.compLabel}>{w.label}</Text>
                      <View style={s.compBarWrap}>
                        <View style={[s.compBar, {
                          width: `${pct}%`,
                          backgroundColor: i === 0 ? '#0070F3' : '#E0E0E0',
                        }]} />
                      </View>
                      <Text style={s.compVal}>{fmt(w.value)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* All Goals Summary */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>All Targets</Text>
              {['daily', 'weekly', 'monthly'].map(p => {
                const g = liveGoals[p];
                const pct = g.target > 0 ? Math.min(g.current / g.target, 1) : 0;
                return (
                  <View key={p} style={s.targetRow}>
                    <View style={s.targetLeft}>
                      <Text style={s.targetName}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                      <Text style={s.targetMeta}>{fmt(g.current)} / {fmt(g.target)}</Text>
                    </View>
                    <View style={s.targetBarWrap}>
                      <View style={[s.targetBar, {
                        width: `${pct * 100}%`,
                        backgroundColor: pct >= 1 ? '#00B341' : pct >= 0.7 ? '#0070F3' : '#F5A623',
                      }]} />
                    </View>
                    <Text style={s.targetPct}>{Math.round(pct * 100)}%</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

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
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFF',
  },
  periodPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  periodPillActive: { backgroundColor: '#000' },
  periodText: { ...TYPE.smallMed, color: '#888' },
  periodTextActive: { color: '#FFF' },
  scroll: { padding: 16, gap: 14 },
  heroCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  heroLabel: {
    ...TYPE.bodyMed,
    color: '#888',
    marginTop: 16,
  },
  heroNumbers: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  heroCol: { alignItems: 'center', flex: 1 },
  heroValue: { ...TYPE.amount, color: '#000' },
  heroSub: { ...TYPE.caption, color: '#888', marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: '#F0F0F0', alignSelf: 'stretch' },
  achievedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: '#FFF8EB',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  achievedText: { ...TYPE.smallMed, color: '#F5A623' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  sectionTitle: { ...TYPE.bodyMed, color: '#000', marginBottom: 14 },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  compLabel: { ...TYPE.small, color: '#444', width: 80 },
  compBarWrap: {
    flex: 1,
    height: 10,
    backgroundColor: '#F0F0F0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  compBar: { height: 10, borderRadius: 5 },
  compVal: { ...TYPE.smallMed, color: '#000', width: 50, textAlign: 'right' },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
    gap: 10,
  },
  targetLeft: { width: 90 },
  targetName: { ...TYPE.smallMed, color: '#000' },
  targetMeta: { ...TYPE.caption, color: '#888', marginTop: 2 },
  targetBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  targetBar: { height: 8, borderRadius: 4 },
  targetPct: { ...TYPE.smallMed, color: '#000', width: 36, textAlign: 'right' },
});
