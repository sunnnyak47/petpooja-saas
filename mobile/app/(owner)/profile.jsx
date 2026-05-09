/**
 * Profile & Security — Owner App
 * Account info, mode switch, logout, app version
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { useAuth } from '../../src/context/AuthContext';
import { useAppMode } from '../../src/context/AppModeContext';

const ROLE_COLORS = {
  owner: '#0070F3',
  super_admin: '#F5A623',
  manager: '#00B341',
  cashier: '#888',
};

function SettingsRow({ icon, label, value, onPress, danger, chevron = true }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <View style={[s.rowIcon, { backgroundColor: danger ? '#FFF0F0' : '#F0F0F0' }]}>
        <Ionicons name={icon} size={18} color={danger ? '#EE0000' : '#000'} />
      </View>
      <Text style={[s.rowLabel, danger && { color: '#EE0000' }]}>{label}</Text>
      {value && <Text style={s.rowValue}>{value}</Text>}
      {chevron && <Ionicons name="chevron-forward" size={16} color="#CCC" />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useAppMode();

  const handleSwitchToPOS = () => {
    setMode('pos');
    router.replace('/(tabs)/dashboard');
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const roleColor = ROLE_COLORS[user?.role] || '#888';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Avatar Card */}
        <View style={s.avatarCard}>
          <View style={[s.avatar, { backgroundColor: roleColor + '20' }]}>
            <Text style={[s.avatarLetter, { color: roleColor }]}>
              {(user?.name || 'O').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={s.userName}>{user?.name || 'Owner'}</Text>
          <Text style={s.userEmail}>{user?.email || 'owner@petpooja.com'}</Text>
          <View style={[s.roleBadge, { backgroundColor: roleColor + '15' }]}>
            <Text style={[s.roleText, { color: roleColor }]}>
              {(user?.role || 'owner').replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Account Section */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.section}>
          <SettingsRow icon="person" label="Name" value={user?.name || '—'} chevron={false} />
          <SettingsRow icon="mail" label="Email" value={user?.email || '—'} chevron={false} />
          <SettingsRow icon="call" label="Phone" value={user?.phone || '—'} chevron={false} />
        </View>

        {/* App Section */}
        <Text style={s.sectionLabel}>APP</Text>
        <View style={s.section}>
          <SettingsRow
            icon="tablet-landscape"
            label="Switch to POS Mode"
            onPress={handleSwitchToPOS}
          />
          <SettingsRow
            icon="swap-horizontal"
            label="Mode Picker"
            onPress={() => { setMode(null); router.replace('/mode-select'); }}
          />
          <SettingsRow icon="notifications" label="Notifications" onPress={() => router.push('/(owner)/alert-settings')} />
          <SettingsRow icon="settings" label="Outlet Settings" onPress={() => router.push('/(owner)/outlet-settings')} />
        </View>

        {/* Info Section */}
        <Text style={s.sectionLabel}>INFO</Text>
        <View style={s.section}>
          <SettingsRow icon="information-circle" label="App Version" value="1.0.0" chevron={false} />
          <SettingsRow icon="help-circle" label="Help & Support" onPress={() => router.push('/(owner)/support')} />
        </View>

        {/* Danger Zone */}
        <View style={[s.section, { marginTop: 20 }]}>
          <SettingsRow icon="log-out" label="Sign Out" onPress={handleLogout} danger />
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
  avatarCard: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '800' },
  userName: { ...TYPE.h2, color: '#000', marginTop: 12 },
  userEmail: { ...TYPE.small, color: '#888', marginTop: 4 },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 8,
  },
  roleText: { ...TYPE.caption, fontWeight: '700', letterSpacing: 1 },
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
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...TYPE.body, color: '#000', flex: 1 },
  rowValue: { ...TYPE.small, color: '#888' },
});
