import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Colors } from '../../src/constants/colors';
import { useRealtimeOrders } from '../../src/hooks/useRealtimeOrders';

function TabIcon({ name, color, focused }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={20} color={color} />
    </View>
  );
}

function RealtimeBridge() {
  useRealtimeOrders(); // WebSocket — silently reconnects, invalidates queries on events
  return null;
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading]);
  if (!user) return null;

  return (
    <>
      <RealtimeBridge />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#080F1E',
            borderTopColor: 'rgba(255,255,255,0.07)',
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
            elevation: 20,
            shadowColor: '#000',
            shadowOpacity: 0.5,
            shadowRadius: 20,
          },
          tabBarActiveTintColor: Colors.goldBright,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.25)',
          tabBarLabelStyle: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },
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
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: 'rgba(201,168,76,0.15)' },
});
