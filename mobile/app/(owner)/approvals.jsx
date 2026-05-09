/**
 * Approvals — Owner App
 * Pending discount/void/override requests requiring owner action
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { LC } from '../../src/constants/colors';
import { TYPE } from '../../src/constants/typography';
import { useTheme } from '../../src/context/ThemeContext';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import {
  useApprovals,
  useApproveRequest,
  useRejectRequest,
} from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

// ─── Types ──────────────────────────────────────────────────────────────────
const APPROVAL_TYPES = {
  discount: { icon: 'pricetag', color: '#F5A623', bg: '#FFF8EB', label: 'Discount' },
  void: { icon: 'close-circle', color: '#EE0000', bg: '#FFF0F0', label: 'Void' },
  refund: { icon: 'return-down-back', color: '#EE0000', bg: '#FFF0F0', label: 'Refund' },
  price_override: { icon: 'create', color: '#0070F3', bg: '#EBF4FF', label: 'Price Override' },
  comp: { icon: 'gift', color: '#00B341', bg: '#EDFBF3', label: 'Complimentary' },
};


const FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

export default function ApprovalsScreen() {
  const { outletId } = useOutlet();
  const { colors } = useTheme();
  const { data: approvalsData, isLoading, isError, refetch } = useApprovals(outletId);
  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();

  const [filter, setFilter] = useState('All');
  const [localStatuses, setLocalStatuses] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const approvals = approvalsData || [];

  const filtered = useMemo(() => {
    return approvals
      .map((a) => ({ ...a, status: localStatuses[a.id] || a.status }))
      .filter((a) => {
        if (filter === 'All') return true;
        return a.status === filter.toLowerCase();
      });
  }, [approvals, filter, localStatuses]);

  const pendingCount = approvals.filter(
    (a) => (localStatuses[a.id] || a.status) === 'pending'
  ).length;

  const handleApprove = useCallback((item) => {
    Alert.alert(
      'Approve Request',
      `Approve ${item.title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            setLocalStatuses((s) => ({ ...s, [item.id]: 'approved' }));
            approveMutation.mutate({ approvalId: item.id, data: { status: 'approved' } });
          },
        },
      ]
    );
  }, []);

  const handleReject = useCallback((item) => {
    Alert.alert(
      'Reject Request',
      `Reject ${item.title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => {
            setLocalStatuses((s) => ({ ...s, [item.id]: 'rejected' }));
            rejectMutation.mutate({ approvalId: item.id, data: { status: 'rejected' } });
          },
        },
      ]
    );
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLocalStatuses({});
    await refetch();
    setRefreshing(false);
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
        <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Approvals</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
          <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>Unable to load data</Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.text, borderRadius: 8 }}>
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Approvals</Text>
        <View style={s.pendingBadge}>
          <Text style={s.pendingBadgeText}>{pendingCount}</Text>
        </View>
      </View>

      {/* Filter Pills */}
      <View style={[s.filterRow, { backgroundColor: colors.headerBg }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.pill, { backgroundColor: colors.pillBg }, filter === f && { backgroundColor: colors.pillActiveBg }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.pillText, { color: colors.pillText }, filter === f && { color: colors.pillActiveText }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={s.card}>
              <SkeletonBox width="50%" height={18} borderRadius={4} />
              <SkeletonBox width="80%" height={14} borderRadius={4} style={{ marginTop: 8 }} />
              <SkeletonBox width="100%" height={40} borderRadius={8} style={{ marginTop: 12 }} />
            </View>
          ))
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="checkmark-done-circle" size={56} color={colors.success} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>
              {filter === 'All' ? 'No requests' : `No ${filter.toLowerCase()} requests`}
            </Text>
            <Text style={[s.emptyDesc, { color: colors.textMuted }]}>You're all caught up</Text>
          </View>
        ) : (
          filtered.map((item) => {
            const type = APPROVAL_TYPES[item.type] || APPROVAL_TYPES.discount;
            const isPending = item.status === 'pending';
            const isApproved = item.status === 'approved';
            const isRejected = item.status === 'rejected';

            return (
              <PressCard
                key={item.id}
                style={[
                  s.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isApproved && s.cardApproved,
                  isRejected && s.cardRejected,
                ]}
              >
                {/* Top: Type badge + time */}
                <View style={s.cardTop}>
                  <View style={[s.typeBadge, { backgroundColor: type.bg }]}>
                    <Ionicons name={type.icon} size={14} color={type.color} />
                    <Text style={[s.typeLabel, { color: type.color }]}>{type.label}</Text>
                  </View>
                  <Text style={[s.cardTime, { color: colors.textMuted }]}>{item.time}</Text>
                </View>

                {/* Title + description */}
                <Text style={[s.cardTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[s.cardDesc, { color: colors.textMuted }]}>{item.description}</Text>

                {/* Amount + Staff */}
                <View style={s.cardMeta}>
                  <View style={s.amountBadge}>
                    <Text style={s.amountText}>₹{item.amount?.toLocaleString('en-IN')}</Text>
                  </View>
                  {item.staff && (
                    <View style={s.staffBadge}>
                      <Ionicons name="person" size={12} color="#0070F3" />
                      <Text style={s.staffText}>{item.staff}</Text>
                    </View>
                  )}
                </View>

                {/* Action buttons */}
                {isPending ? (
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={s.rejectBtn}
                      onPress={() => handleReject(item)}
                    >
                      <Ionicons name="close" size={16} color="#EE0000" />
                      <Text style={s.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.approveBtn}
                      onPress={() => handleApprove(item)}
                    >
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                      <Text style={s.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.statusRow}>
                    <Ionicons
                      name={isApproved ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={isApproved ? '#00B341' : '#EE0000'}
                    />
                    <Text style={[s.statusText, { color: isApproved ? '#00B341' : '#EE0000' }]}>
                      {isApproved ? 'Approved' : 'Rejected'}
                    </Text>
                  </View>
                )}
              </PressCard>
            );
          })
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
    gap: 12,
  },
  headerTitle: { ...TYPE.h2, color: '#000', flex: 1 },
  pendingBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EE0000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pendingBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFF',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  pillActive: { backgroundColor: '#000' },
  pillText: { ...TYPE.smallMed, color: '#888' },
  pillTextActive: { color: '#FFF' },
  scroll: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  cardApproved: { borderLeftWidth: 3, borderLeftColor: '#00B341' },
  cardRejected: { borderLeftWidth: 3, borderLeftColor: '#EE0000', opacity: 0.7 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeLabel: { ...TYPE.caption, fontWeight: '700' },
  cardTime: { ...TYPE.caption, color: '#888' },
  cardTitle: { ...TYPE.bodyMed, color: '#000', marginBottom: 4 },
  cardDesc: { ...TYPE.small, color: '#888', lineHeight: 18 },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  amountBadge: {
    backgroundColor: '#FFF0F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  amountText: { ...TYPE.smallMed, color: '#EE0000' },
  staffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBF4FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  staffText: { ...TYPE.caption, color: '#0070F3', fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EE0000',
    backgroundColor: '#FFF',
  },
  rejectBtnText: { ...TYPE.smallMed, color: '#EE0000' },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#00B341',
  },
  approveBtnText: { ...TYPE.smallMed, color: '#FFF' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  statusText: { ...TYPE.smallMed },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: { ...TYPE.h3, color: '#000' },
  emptyDesc: { ...TYPE.small, color: '#888' },
});
