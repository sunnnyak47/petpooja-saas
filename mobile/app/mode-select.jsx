import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useAppMode } from '../src/context/AppModeContext';
import { LC } from '../src/constants/colors';

const modes = [
  {
    key: 'pos',
    title: 'POS Terminal',
    subtitle: 'Take orders, billing, kitchen display',
    icon: 'tablet-landscape',
    route: '/(tabs)/dashboard',
    color: '#000',
    bg: '#F7F7F7',
  },
  {
    key: 'owner',
    title: 'Owner Dashboard',
    subtitle: 'Reports, alerts, staff, approvals',
    icon: 'business',
    route: '/(owner)/home',
    color: LC.accent,
    bg: LC.accentLight,
  },
];

export default function ModeSelectScreen() {
  const { user, logout } = useAuth();
  const { setMode } = useAppMode();

  const handleSelect = (m) => {
    setMode(m.key);
    router.replace(m.route);
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.greeting}>Welcome back,</Text>
        <Text style={s.name}>{user?.name || 'Owner'}</Text>
        <Text style={s.role}>{user?.role?.replace('_', ' ').toUpperCase()}</Text>
      </View>

      {/* Mode Cards */}
      <View style={s.cards}>
        <Text style={s.pick}>Choose your mode</Text>
        {modes.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={s.card}
            activeOpacity={0.8}
            onPress={() => handleSelect(m)}
          >
            <View style={[s.iconWrap, { backgroundColor: m.bg }]}>
              <Ionicons name={m.icon} size={32} color={m.color} />
            </View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>{m.title}</Text>
              <Text style={s.cardSub}>{m.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#CCC" />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color={LC.error} />
        <Text style={s.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: LC.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 16,
    color: LC.text3,
    fontWeight: '500',
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: LC.text1,
    marginTop: 4,
  },
  role: {
    fontSize: 12,
    fontWeight: '600',
    color: LC.accent,
    marginTop: 6,
    letterSpacing: 1,
  },
  cards: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  pick: {
    fontSize: 14,
    fontWeight: '600',
    color: LC.text3,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LC.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: LC.cardBorder,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LC.text1,
  },
  cardSub: {
    fontSize: 13,
    color: LC.text3,
    marginTop: 3,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 'auto',
    marginBottom: 30,
    paddingVertical: 14,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: LC.error,
  },
});
