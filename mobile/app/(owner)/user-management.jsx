/**
 * User Management — Owner App
 * View staff list, roles, access control (read-only)
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { PressCard } from '../../src/components/PressCard';
import { useStaffList } from '../../src/hooks/useOwnerApi';
import { useOutlet } from '../../src/context/OutletContext';

const ROLE_COLORS = {
  Owner: '#0070F3',
  owner: '#0070F3',
  Manager: '#00B341',
  manager: '#00B341',
  Cashier: '#F5A623',
  cashier: '#F5A623',
  Chef: '#EE0000',
  chef: '#EE0000',
  Waiter: '#888',
  waiter: '#888',
  Delivery: '#0070F3',
  delivery: '#0070F3',
};

export default function UserManagementScreen() {
  const { outletId } = useOutlet();
  const { data: staffData, isLoading, isError, refetch } = useStaffList(outletId);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const staff = staffData || [];

  const roles = useMemo(() => ['All', ...new Set(staff.map(s => s.role).filter(r => r && r !== '—'))], [staff]);

  const filtered = useMemo(() => {
    let list = staff;
    if (selectedRole !== 'All') list = list.filter(s => s.role === selectedRole);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
    }
    return list;
  }, [staff, selectedRole, search]);

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
        <Text style={s.headerTitle}>Users</Text>
        <Text style={s.countBadge}>{staffData?.length || 0}</Text>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search" size={18} color="#888" />
        <TextInput
          style={s.searchInput}
          placeholder="Search staff..."
          placeholderTextColor="#BBB"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Role filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.roleScroll}>
        {roles.map(r => (
          <TouchableOpacity
            key={r}
            style={[s.rolePill, selectedRole === r && s.rolePillActive]}
            onPress={() => setSelectedRole(r)}
          >
            <Text style={[s.roleText, selectedRole === r && s.roleTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {isLoading && !refreshing ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
            <ActivityIndicator size="large" color="#0070F3" />
            <Text style={{ ...TYPE.body, color: '#888' }}>Loading staff...</Text>
          </View>
        ) : isError ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
            <Ionicons name="cloud-offline-outline" size={48} color="#CCC" />
            <Text style={{ ...TYPE.h3, color: '#888' }}>Failed to load staff</Text>
            <TouchableOpacity style={s.retryBtn} onPress={refetch}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
            <Ionicons name="people-outline" size={48} color="#CCC" />
            <Text style={{ ...TYPE.h3, color: '#888' }}>No staff found</Text>
            <Text style={{ ...TYPE.small, color: '#888' }}>{staff.length === 0 ? 'No staff members in this outlet' : 'Try a different search or filter'}</Text>
          </View>
        ) : null}
        {filtered.map(staff => {
          const rc = ROLE_COLORS[staff.role] || '#888';
          return (
            <PressCard key={staff.id} style={s.card}>
              <View style={s.cardRow}>
                <View style={[s.avatar, { backgroundColor: rc + '20' }]}>
                  <Text style={[s.avatarLetter, { color: rc }]}>
                    {staff.name.charAt(0)}
                  </Text>
                </View>
                <View style={s.cardInfo}>
                  <View style={s.nameRow}>
                    <Text style={s.staffName}>{staff.name}</Text>
                    <View style={[s.statusDot, { backgroundColor: staff.active ? '#00B341' : '#CCC' }]} />
                  </View>
                  <View style={[s.roleBadge, { backgroundColor: rc + '15' }]}>
                    <Text style={[s.roleBadgeText, { color: rc }]}>{staff.role}</Text>
                  </View>
                  <Text style={s.staffMeta}>{staff.email}</Text>
                  <Text style={s.staffMeta}>Last login: {staff.lastLogin}</Text>
                </View>
              </View>
            </PressCard>
          );
        })}

        <View style={s.noteCard}>
          <Ionicons name="information-circle" size={18} color="#0070F3" />
          <Text style={s.noteText}>
            To add or remove staff, use the web dashboard.
          </Text>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
    gap: 12,
  },
  headerTitle: { ...TYPE.h2, color: '#000', flex: 1 },
  countBadge: {
    ...TYPE.smallMed,
    color: '#FFF',
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  roleScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  rolePill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  rolePillActive: { backgroundColor: '#000' },
  roleText: { ...TYPE.smallMed, color: '#888' },
  roleTextActive: { color: '#FFF' },
  scroll: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  cardRow: { flexDirection: 'row' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 20, fontWeight: '800' },
  cardInfo: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  staffName: { ...TYPE.bodyMed, color: '#000' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  roleBadgeText: { ...TYPE.caption, fontWeight: '700' },
  staffMeta: { ...TYPE.caption, color: '#888', marginTop: 3 },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    backgroundColor: '#EBF4FF',
    borderRadius: 12,
    marginTop: 8,
  },
  noteText: { ...TYPE.small, color: '#0070F3', flex: 1, lineHeight: 18 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#0070F3',
    borderRadius: 8,
  },
  retryText: { ...TYPE.smallMed, color: '#FFF' },
});
