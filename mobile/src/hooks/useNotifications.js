/**
 * useNotifications — Expo push notification setup.
 *
 * - Registers the device for push notifications and sends the token to the backend
 * - Handles foreground notifications by surfacing them as state (drives NotificationBanner)
 * - Handles background/tapped notification responses by navigating to the right screen
 *
 * Gracefully degrades on web and simulators (no crash, just no token).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../lib/api';

// expo-notifications + expo-device are unsupported on web
let Notifications = null;
let Device = null;
let Constants = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');
    Constants = require('expo-constants').default;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false, // we show our own in-app banner
        shouldPlaySound: true,
        shouldSetBadge:  true,
      }),
    });
  } catch (_) {
    // silently degrade
  }
}

const PUSH_TOKEN_KEY = 'push_token';

// ── Route map: notification type → Expo Router path ─────────────────────────
const DEEP_LINK_ROUTES = {
  // Canonical uppercase (server-side enum values)
  NEW_ORDER:          '/(tabs)/orders',
  ORDER_READY:        '/(tabs)/orders',
  LOW_STOCK:          '/(owner)/inventory',
  APPROVAL_REQUEST:   '/(owner)/approvals',
  EOD_REMINDER:       '/(tabs)/eod',
  NEW_KOT:            '/(tabs)/kot',
  // Legacy lowercase variants (backward compat)
  new_order:          '/(tabs)/orders',
  order_ready:        '/(tabs)/orders',
  low_stock:          '/(owner)/inventory',
  approval_request:   '/(owner)/approvals',
  eod_reminder:       '/(tabs)/eod',
  new_kot:            '/(tabs)/kot',
  // Short keys used in owner push payloads
  alert:              '/(owner)/alerts',
  approval:           '/(owner)/approvals',
  order:              '/(owner)/home',
  stock:              '/(owner)/inventory',
  eod:                '/(tabs)/eod',
  staff:              '/(owner)/staff',
  void:               '/(owner)/alerts',
  refund:             '/(owner)/alerts',
};

function resolveRoute(data) {
  const type = data?.type || data?.screen || data?.action;
  if (!type) return null;
  return DEEP_LINK_ROUTES[type] ?? DEEP_LINK_ROUTES[type?.toUpperCase?.()] ?? null;
}

function buildForegroundNotification(notification) {
  const content = notification?.request?.content ?? {};
  const data    = content.data ?? {};
  return {
    title: content.title || 'PetPooja',
    body:  content.body  || '',
    type:  data.type     || data.screen || '',
    route: resolveRoute(data),
  };
}

export function useNotifications() {
  const [hasPermission, setHasPermission]               = useState(false);
  const [pushToken, setPushToken]                       = useState(null);
  const [foregroundNotification, setForegroundNotification] = useState(null);

  const notificationListener = useRef(null);
  const responseListener     = useRef(null);
  const isWeb = Platform.OS === 'web';

  // ── Register device & upload token ─────────────────────────────────────────
  const registerForPushNotifications = useCallback(async () => {
    if (isWeb || !Notifications || !Device) return;
    if (!Device.isDevice) return; // simulators can't receive push notifications

    // Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:             'Default',
        importance:       Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor:       '#6366f1',
      });
    }

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      setHasPermission(false);
      return;
    }
    setHasPermission(true);

    // Get Expo push token — projectId required since SDK 48
    let token;
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.manifest2?.extra?.eas?.projectId  ??
        '934fae42-3d3a-4767-8bc1-a13992144aec'; // fallback hardcode from app.json

      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      token = result.data;
    } catch (_) {
      return;
    }
    if (!token) return;

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    setPushToken(token);

    // Upload to backend (fire-and-forget)
    try {
      await api.post('/api/integrations/push-token', {
        token,
        device:   Platform.OS,
        platform: Platform.OS,
      });
    } catch (_) {}
  }, [isWeb]);

  // ── Foreground notification received ────────────────────────────────────────
  const handleForegroundNotification = useCallback((notification) => {
    try {
      setForegroundNotification(buildForegroundNotification(notification));
    } catch (_) {}
  }, []);

  // ── Tapped from background / notification centre ────────────────────────────
  const handleNotificationResponse = useCallback((response) => {
    try {
      const data  = response?.notification?.request?.content?.data ?? {};
      const route = resolveRoute(data);
      if (route) setTimeout(() => router.push(route), 300);
    } catch (_) {}
  }, []);

  // ── Dismiss the in-app banner ───────────────────────────────────────────────
  const dismissNotification = useCallback(() => {
    setForegroundNotification(null);
  }, []);

  // ── Wire everything up ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isWeb || !Notifications) return;

    registerForPushNotifications();

    notificationListener.current =
      Notifications.addNotificationReceivedListener(handleForegroundNotification);

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => {
      try {
        if (notificationListener.current)
          Notifications.removeNotificationSubscription(notificationListener.current);
        if (responseListener.current)
          Notifications.removeNotificationSubscription(responseListener.current);
      } catch (_) {}
    };
  }, [isWeb, registerForPushNotifications, handleForegroundNotification, handleNotificationResponse]);

  return { hasPermission, pushToken, foregroundNotification, dismissNotification };
}
