import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../lib/api';

// expo-notifications / expo-device are not supported on web
let Notifications = null;
let Device = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (_) {
    // silently degrade
  }
}

const PUSH_TOKEN_KEY = 'push_token';

const DEEP_LINK_ROUTES = {
  // Owner-app deep link targets
  alert: '/(owner)/alerts',
  approval: '/(owner)/approvals',
  order: '/(owner)/home',
  stock: '/(owner)/inventory',
  eod: '/(owner)/cash-recon',
  staff: '/(owner)/staff',
  void: '/(owner)/alerts',
  refund: '/(owner)/alerts',
  // Legacy POS notification types (keep backward compat)
  NEW_ORDER: '/(tabs)/orders',
  LOW_STOCK: '/(tabs)/inventory',
};

function resolveRoute(data) {
  const type = data?.type || data?.screen;
  if (!type) return null;
  return DEEP_LINK_ROUTES[type] || '/(owner)/home';
}

export function useNotifications() {
  const [hasPermission, setHasPermission] = useState(false);
  const [pushToken, setPushToken] = useState(null);

  const notificationListener = useRef(null);
  const responseListener = useRef(null);
  const isWeb = Platform.OS === 'web';

  const registerForPushNotifications = useCallback(async () => {
    if (isWeb || !Notifications || !Device) return;
    if (!Device.isDevice) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0070F3',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') { setHasPermission(false); return; }
    setHasPermission(true);

    let token;
    try {
      const result = await Notifications.getExpoPushTokenAsync();
      token = result.data;
    } catch (_) { return; }
    if (!token) return;

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    setPushToken(token);

    try {
      await api.post('/notifications/register', { token, device: Platform.OS });
    } catch (_) {}
  }, [isWeb]);

  const handleNotificationResponse = useCallback((response) => {
    try {
      const data = response?.notification?.request?.content?.data ?? {};
      const route = resolveRoute(data);
      if (route) setTimeout(() => router.push(route), 300);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (isWeb || !Notifications) return;

    registerForPushNotifications();

    notificationListener.current =
      Notifications.addNotificationReceivedListener(() => {});

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
  }, [isWeb, registerForPushNotifications, handleNotificationResponse]);

  return { hasPermission, pushToken };
}
