import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useRealtimeOrders } from '../../src/hooks/useRealtimeOrders';
import { useNotifications } from '../../src/hooks/useNotifications';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { NotificationBanner } from '../../src/components/NotificationBanner';

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

// Soft accent-tinted background for the active tab icon (theme + tenant-brand
// aware — mirrors the web app's indigo-50 hover/active state).
function softTint(hex, alpha = 0.12) {
  let h = String(hex || '#6366f1').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Wraps each tab button so we can fire haptics on press
function HapticTabButton(props) {
  const { onPress, children, style, accessibilityState } = props;
  return (
    <TouchableOpacity
      // flex:1 makes each tab share the bar width evenly. Without it the button
      // shrinks to its content and all tabs cram into the left.
      style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, style]}
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
  const { colors } = useTheme();
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
    <Animated.View
      style={[
        styles.iconWrap,
        focused && { backgroundColor: softTint(colors.accent) },
        animStyle,
      ]}
    >
      <Ionicons name={focused ? focusedName : name} size={22} color={color} />
    </Animated.View>
  );
}

function RealtimeBridge() {
  useRealtimeOrders(); // WebSocket — silently reconnects, invalidates queries on events
  return null;
}

function NotificationBridge() {
  const { foregroundNotification, dismissNotification } = useNotifications();
  return (
    <NotificationBanner
      notification={foregroundNotification}
      onDismiss={dismissNotification}
    />
  );
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
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
          // NOTE: no custom tabBarButton — react-navigation's default button
          // distributes tabs evenly (flex:1 each). A custom TouchableOpacity
          // button collapsed each tab to content width and crammed them left.
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: TAB_HEIGHT,
            paddingBottom: bottomInset + 6,
            paddingTop: 8,
            elevation: 0,
            shadowColor: colors.text,
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
          },
          // Brand accent (tenant-overridable) drives the active tab tint.
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
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
            href: null,
          }}
        />
        <Tabs.Screen
          name="billing"
          options={{
            title: 'BILLING',
            href: null,
          }}
        />
        <Tabs.Screen
          name="purchase-orders"
          options={{
            title: 'PURCHASE',
            href: null,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'REPORTS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="kot"
          options={{
            title: 'KOT',
            href: null,
          }}
        />
        <Tabs.Screen
          name="staff"
          options={{
            title: 'STAFF',
            href: null,
          }}
        />
        <Tabs.Screen
          name="reservations"
          options={{
            title: 'RESERVATIONS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="customers"
          options={{
            title: 'CUSTOMERS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="delivery-orders"
          options={{
            title: 'DELIVERY',
            href: null,
          }}
        />
        <Tabs.Screen
          name="expenses"
          options={{
            title: 'EXPENSES',
            href: null,
          }}
        />
        <Tabs.Screen
          name="eod"
          options={{
            title: 'EOD',
            href: null,
          }}
        />
        <Tabs.Screen
          name="offers"
          options={{
            title: 'OFFERS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="recipe-manager"
          options={{
            title: 'RECIPE MANAGER',
            href: null,
          }}
        />
        <Tabs.Screen
          name="multi-branch"
          options={{
            title: 'MULTI-BRANCH',
            href: null,
          }}
        />
        <Tabs.Screen
          name="gst-reports"
          options={{
            title: 'GST REPORTS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="cctv-feed"
          options={{
            title: 'CCTV FEED',
            href: null,
          }}
        />
        <Tabs.Screen
          name="waste-log"
          options={{
            title: 'WASTE LOG',
            href: null,
          }}
        />
        <Tabs.Screen
          name="staff-chat"
          options={{
            title: 'STAFF CHAT',
            href: null,
          }}
        />
        <Tabs.Screen
          name="documents"
          options={{
            title: 'DOCUMENTS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="menu-analytics"
          options={{
            title: 'MENU ANALYTICS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="loyalty-crm"
          options={{
            title: 'LOYALTY & CRM',
            href: null,
          }}
        />
        <Tabs.Screen
          name="qr-codes"
          options={{
            title: 'QR CODES',
            href: null,
          }}
        />
        <Tabs.Screen
          name="credit-notes"
          options={{
            title: 'CREDIT NOTES',
            href: null,
          }}
        />
        <Tabs.Screen
          name="integrations"
          options={{
            title: 'INTEGRATIONS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="aggregator-reconciliation"
          options={{
            title: 'PAYOUT RECON',
            href: null,
          }}
        />
        <Tabs.Screen
          name="central-kitchen"
          options={{
            title: 'CENTRAL KITCHEN',
            href: null,
          }}
        />
        <Tabs.Screen
          name="assistant"
          options={{
            title: 'ASSISTANT',
            href: null,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 34,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
