import { Tabs, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { LC } from '../../src/constants/colors';
import { useTheme } from '../../src/context/ThemeContext';
import { useRealtimeOwner } from '../../src/hooks/useRealtimeOwner';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useOutlet } from '../../src/context/OutletContext';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { analytics } from '../../src/lib/analytics';

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
  const { outletId } = useOutlet();
  useRealtimeOwner(outletId); // WebSocket — owner-specific events, invalidates owner queries
  return null;
}

function NotificationBridge() {
  useNotifications(); // Registers push token, sets up notification listeners
  return null;
}

export default function OwnerLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);

  // Poll unread alert count — lightweight badge refresh
  useEffect(() => {
    if (!user) return;

    let active = true;
    const fetchCount = async () => {
      try {
        const api = require('../../src/lib/api').default;
        const res = await api.get('/notifications/unread-count');
        if (active) setUnreadAlerts(res.data?.count ?? 0);
      } catch (_) {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => { active = false; clearInterval(interval); };
  }, [user]);

  // Flush any locally-stored analytics events on mount
  useEffect(() => { analytics.flushStored(); }, []);

  if (!user) return null;

  // On phones with a home indicator / nav bar: add inset so labels never
  // overlap the system gesture zone. Minimum 8 px even on flat-bottomed devices.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const TAB_HEIGHT = 60 + bottomInset;

  return (
    <>
      <RealtimeBridge />
      <NotificationBridge />
      <OfflineBanner />
      <Tabs
        screenListeners={{
          focus: (e) => {
            analytics.screenView(e.target?.split('-')[0] || 'unknown');
          },
        }}
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
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
          },
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
        {/* ── Visible tabs ── */}
        <Tabs.Screen
          name="home"
          options={{
            title: 'HOME',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="home-outline"
                focusedName="home"
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
        <Tabs.Screen
          name="alerts"
          options={{
            title: 'ALERTS',
            tabBarIcon: ({ color, focused }) => (
              <View>
                <TabIcon
                  name="notifications-outline"
                  focusedName="notifications"
                  color={color}
                  focused={focused}
                />
                {unreadAlerts > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadAlerts > 99 ? '99+' : unreadAlerts}
                    </Text>
                  </View>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="staff"
          options={{
            title: 'STAFF',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="people-outline"
                focusedName="people"
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

        {/* ── Hidden screens — registered but not shown in tab bar ── */}
        <Tabs.Screen
          name="inventory"
          options={{ title: 'INVENTORY', href: null }}
        />
        <Tabs.Screen
          name="cash-recon"
          options={{ title: 'CASH RECON', href: null }}
        />
        <Tabs.Screen
          name="approvals"
          options={{ title: 'APPROVALS', href: null }}
        />
        <Tabs.Screen
          name="menu-overview"
          options={{ title: 'MENU OVERVIEW', href: null }}
        />
        <Tabs.Screen
          name="outlet-settings"
          options={{ title: 'OUTLET SETTINGS', href: null }}
        />
        <Tabs.Screen
          name="user-management"
          options={{ title: 'USER MANAGEMENT', href: null }}
        />
        <Tabs.Screen
          name="goals"
          options={{ title: 'GOALS', href: null }}
        />
        <Tabs.Screen
          name="activity-log"
          options={{ title: 'ACTIVITY LOG', href: null }}
        />
        <Tabs.Screen
          name="support"
          options={{ title: 'SUPPORT', href: null }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'PROFILE', href: null }}
        />
        <Tabs.Screen
          name="alert-settings"
          options={{ title: 'ALERT SETTINGS', href: null }}
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
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: LC.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
