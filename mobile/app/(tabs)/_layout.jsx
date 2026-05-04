import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Colors } from '../../src/constants/colors';
import { useRealtimeOrders } from '../../src/hooks/useRealtimeOrders';
import { useNotifications } from '../../src/hooks/useNotifications';

// Safe haptics import — gracefully degrades when expo-haptics is absent
let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch (_) {}

function triggerHapticLight() {
  try {
    if (Haptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (_) {}
}

// Wraps each tab button so we can fire haptics on press
function HapticTabButton(props) {
  const { onPress, children, style, accessibilityState } = props;
  return (
    <TouchableOpacity
      style={style}
      onPress={(e) => {
        triggerHapticLight();
        if (onPress) onPress(e);
      }}
      activeOpacity={0.75}
      accessibilityState={accessibilityState}
    >
      {children}
    </TouchableOpacity>
  );
}

function TabIcon({ name, focusedName, color, focused }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={focused ? focusedName : name} size={20} color={color} />
    </View>
  );
}

function RealtimeBridge() {
  useRealtimeOrders(); // WebSocket — silently reconnects, invalidates queries on events
  return null;
}

function NotificationBridge() {
  useNotifications(); // Registers push token, sets up notification listeners
  return null;
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);
  if (!user) return null;

  return (
    <>
      <RealtimeBridge />
      <NotificationBridge />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: (props) => <HapticTabButton {...props} />,
          tabBarStyle: {
            backgroundColor: '#080F1E',
            borderTopColor: 'rgba(255,255,255,0.07)',
            borderTopWidth: 1,
            height: 68,
            paddingBottom: 10,
            paddingTop: 6,
            elevation: 24,
            shadowColor: '#000',
            shadowOpacity: 0.6,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -4 },
          },
          tabBarActiveTintColor: Colors.goldBright,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.20)',
          tabBarLabelStyle: {
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 0.6,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'DASHBOARD',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="grid-outline"
                focusedName="grid"
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'ORDERS',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="receipt-outline"
                focusedName="receipt"
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="purchase-orders"
          options={{
            title: 'PURCHASE',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="cart-outline"
                focusedName="cart"
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: 'INVENTORY',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="layers-outline"
                focusedName="layers"
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'REPORTS',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="bar-chart-outline"
                focusedName="bar-chart"
                color={color}
                focused={focused}
              />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: {
    // Gold pill: semi-transparent gold background behind active icon
    backgroundColor: 'rgba(240,192,64,0.13)',
    // Subtle gold border ring
    borderWidth: 1,
    borderColor: 'rgba(240,192,64,0.18)',
  },
});
