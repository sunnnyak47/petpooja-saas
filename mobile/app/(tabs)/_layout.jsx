import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Colors } from '../../src/constants/colors';

function TabIcon({ name, color, focused }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={20} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading]);
  if (!user) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.primary,
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 20,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 20,
        },
        tabBarActiveTintColor: Colors.goldBright,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.3)',
        tabBarLabelStyle: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'DASHBOARD',
        tabBarIcon: ({ color, focused }) => <TabIcon name="grid" color={color} focused={focused} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'ORDERS',
        tabBarIcon: ({ color, focused }) => <TabIcon name="receipt" color={color} focused={focused} /> }} />
      <Tabs.Screen name="purchase-orders" options={{ title: 'PURCHASE',
        tabBarIcon: ({ color, focused }) => <TabIcon name="cart" color={color} focused={focused} /> }} />
      <Tabs.Screen name="inventory" options={{ title: 'INVENTORY',
        tabBarIcon: ({ color, focused }) => <TabIcon name="layers" color={color} focused={focused} /> }} />
      <Tabs.Screen name="reports" options={{ title: 'REPORTS',
        tabBarIcon: ({ color, focused }) => <TabIcon name="bar-chart" color={color} focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: 'rgba(201,168,76,0.15)' },
});
