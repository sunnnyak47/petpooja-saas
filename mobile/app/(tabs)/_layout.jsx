import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { Colors } from '../../src/constants/colors';
import { useRealtimeOrders } from '../../src/hooks/useRealtimeOrders';
import { useNotifications } from '../../src/hooks/useNotifications';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';

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
  const scale = useSharedValue(1);

  useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.18, { damping: 10, stiffness: 300 }, () => {
        scale.value = withSpring(1, { damping: 14, stiffness: 280 });
      });
    }
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.iconWrap, focused && styles.iconWrapActive, animStyle]}>
      <Ionicons name={focused ? focusedName : name} size={22} color={color} />
    </Animated.View>
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
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);
  if (!user) return null;

  // On phones with a home indicator / nav bar: add inset so labels never
  // overlap the system gesture zone. Minimum 8 px even on flat-bottomed devices.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const TAB_HEIGHT = 60 + bottomInset;

  return (
    <>
      <RealtimeBridge />
      <NotificationBridge />
      <SyncStatusBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: (props) => <HapticTabButton {...props} />,
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#EAEAEA',
            borderTopWidth: 1,
            height: TAB_HEIGHT,
            paddingBottom: bottomInset + 6,
            paddingTop: 8,
            elevation: 0,
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
          },
          tabBarActiveTintColor: '#000000',
          tabBarInactiveTintColor: '#AAAAAA',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.3,
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
          name="tables"
          options={{
            title: 'TABLES',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="restaurant-outline"
                focusedName="restaurant"
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
          name="menu-items"
          options={{
            title: 'MENU',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="fast-food-outline"
                focusedName="fast-food"
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
          name="more"
          options={{
            title: 'MORE',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="ellipsis-horizontal-circle-outline"
                focusedName="ellipsis-horizontal-circle"
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        {/* Hidden screens — registered but not shown in tab bar */}
        <Tabs.Screen
          name="pos"
          options={{
            title: 'POS',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="billing"
          options={{
            title: 'BILLING',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="purchase-orders"
          options={{
            title: 'PURCHASE',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'REPORTS',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="kot"
          options={{
            title: 'KOT',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="staff"
          options={{
            title: 'STAFF',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="reservations"
          options={{
            title: 'RESERVATIONS',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="customers"
          options={{
            title: 'CUSTOMERS',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="delivery-orders"
          options={{
            title: 'DELIVERY',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="expenses"
          options={{
            title: 'EXPENSES',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="eod"
          options={{
            title: 'EOD',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="offers"
          options={{
            title: 'OFFERS',
            tabBarButton: () => null,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 32,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: {
    backgroundColor: '#F0F0F0',
  },
});
