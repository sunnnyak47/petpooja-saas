import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';

const tiles = [
  { label: 'Inventory', icon: 'layers', route: '/(owner)/inventory' },
  { label: 'Cash Recon', icon: 'cash', route: '/(owner)/cash-recon' },
  { label: 'Approvals', icon: 'checkmark-circle', route: '/(owner)/approvals' },
  { label: 'Menu', icon: 'restaurant', route: '/(owner)/menu-overview' },
  { label: 'Settings', icon: 'settings', route: '/(owner)/outlet-settings' },
  { label: 'Users', icon: 'person-add', route: '/(owner)/user-management' },
  { label: 'Goals', icon: 'trophy', route: '/(owner)/goals' },
  { label: 'Activity Log', icon: 'document-text', route: '/(owner)/activity-log' },
  { label: 'Support', icon: 'help-circle', route: '/(owner)/support' },
  { label: 'Profile', icon: 'person-circle', route: '/(owner)/profile' },
];

export default function MoreScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <Ionicons name="grid" size={24} color={colors.text} />
        <Text style={[s.title, { color: colors.text }]}>More</Text>
      </View>
      <ScrollView contentContainerStyle={s.grid}>
        {tiles.map((tile) => (
          <TouchableOpacity
            key={tile.route}
            style={[s.tile, { backgroundColor: colors.card }]}
            activeOpacity={0.7}
            onPress={() => router.push(tile.route)}
          >
            <Ionicons name={tile.icon} size={32} color={colors.text} />
            <Text style={[s.tileLabel, { color: colors.text }]}>{tile.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#000' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  tile: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
});
