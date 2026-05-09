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

function resolveRoute(type) {
  switch (type) {
    case 'NEW_ORDER':  return '/(tabs)/orders';
    case 'LOW_STOCK':  return '/(tabs)/inventory';
    default:           return null;
  }
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
      const route = resolveRoute(data.type);
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
