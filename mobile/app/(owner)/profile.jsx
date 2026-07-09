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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPE } from '../../src/constants/typography';
import { useAuth } from '../../src/context/AuthContext';
import { useAppMode } from '../../src/context/AppModeContext';
import { useBiometric } from '../../src/hooks/useBiometric';
import { useTheme } from '../../src/context/ThemeContext';

const ROLE_COLORS = {
  owner: '#2563eb',
  super_admin: '#d97706',
  manager: '#16a34a',
  cashier: '#94a3b8',
};

function SettingsRow({ icon, label, value, onPress, danger, chevron = true, colors }) {
  return (
    <TouchableOpacity style={[s.row, { borderBottomColor: colors.borderLight }]} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <View style={[s.rowIcon, { backgroundColor: danger ? '#fef2f2' : colors.pillBg }]}>
        <Ionicons name={icon} size={18} color={danger ? colors.error : colors.text} />
      </View>
      <Text style={[s.rowLabel, { color: colors.text }, danger && { color: colors.error }]}>{label}</Text>
      {value && <Text style={[s.rowValue, { color: colors.textMuted }]}>{value}</Text>}
      {chevron && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useAppMode();
  const { isAvailable, isEnabled, toggleBiometric } = useBiometric();
  const { isDark, colors, preference, setTheme } = useTheme();

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

  const roleColor = ROLE_COLORS[user?.role] || '#94a3b8';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Avatar Card */}
        <View style={[s.avatarCard, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={[s.avatar, { backgroundColor: roleColor + '20' }]}>
            <Text style={[s.avatarLetter, { color: roleColor }]}>
              {(user?.full_name || 'O').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[s.userName, { color: colors.text }]}>{user?.full_name || 'Owner'}</Text>
          <Text style={[s.userEmail, { color: colors.textMuted }]}>{user?.email || 'owner@ms-rm.com'}</Text>
          <View style={[s.roleBadge, { backgroundColor: roleColor + '15' }]}>
            <Text style={[s.roleText, { color: roleColor }]}>
              {(user?.role || 'owner').replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Account Section */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>ACCOUNT</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow icon="person" label="Name" value={user?.full_name || '—'} chevron={false} colors={colors} />
          <SettingsRow icon="mail" label="Email" value={user?.email || '—'} chevron={false} colors={colors} />
          <SettingsRow icon="call" label="Phone" value={user?.phone || '—'} chevron={false} colors={colors} />
        </View>

        {/* App Section */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>APP</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="tablet-landscape"
            label="Switch to POS Mode"
            onPress={handleSwitchToPOS}
            colors={colors}
          />
          <SettingsRow
            icon="swap-horizontal"
            label="Mode Picker"
            onPress={() => { setMode(null); router.replace('/mode-select'); }}
            colors={colors}
          />
          <SettingsRow icon="notifications" label="Notifications" onPress={() => router.push('/(owner)/alert-settings')} colors={colors} />
          <SettingsRow icon="settings" label="Outlet Settings" onPress={() => router.push('/(owner)/outlet-settings')} colors={colors} />
          {/* Theme Toggle */}
          <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
            <View style={[s.rowIcon, { backgroundColor: colors.pillBg }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={18} color={colors.text} />
            </View>
            <Text style={[s.rowLabel, { color: colors.text }]}>Theme</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {['light', 'dark', 'system'].map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTheme(t)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
                    backgroundColor: preference === t ? colors.pillActiveBg : colors.pillBg,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: preference === t ? colors.pillActiveText : colors.pillText, textTransform: 'capitalize' }}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {isAvailable && (
            <View style={[s.row, { borderBottomColor: colors.borderLight }]}>
              <View style={[s.rowIcon, { backgroundColor: colors.pillBg }]}>
                <Ionicons name="finger-print" size={18} color={colors.text} />
              </View>
              <Text style={[s.rowLabel, { flex: 1, color: colors.text }]}>Biometric Login</Text>
              <Switch
                value={isEnabled}
                onValueChange={(val) => toggleBiometric(val)}
                trackColor={{ false: '#e2e8f0', true: colors.switchTrack }}
                thumbColor="#FFF"
              />
            </View>
          )}
        </View>

        {/* Info Section */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>INFO</Text>
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow icon="information-circle" label="App Version" value="1.0.0" chevron={false} colors={colors} />
          <SettingsRow icon="help-circle" label="Help & Support" onPress={() => router.push('/(owner)/support')} colors={colors} />
        </View>

        {/* Danger Zone */}
        <View style={[s.section, { marginTop: 20, backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow icon="log-out" label="Sign Out" onPress={handleLogout} danger colors={colors} />
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
  scroll: { paddingBottom: 20 },
  avatarCard: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '800' },
  userName: { ...TYPE.h2, color: '#0f172a', marginTop: 12 },
  userEmail: { ...TYPE.small, color: '#94a3b8', marginTop: 4 },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 8,
  },
  roleText: { ...TYPE.caption, fontWeight: '700', letterSpacing: 1 },
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
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...TYPE.body, color: '#0f172a', flex: 1 },
  rowValue: { ...TYPE.small, color: '#94a3b8' },
});
