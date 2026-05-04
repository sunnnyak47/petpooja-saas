import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../lib/api';

const PUSH_TOKEN_KEY = 'push_token';

// Configure how notifications are presented when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Maps a notification data.type to its target tab route.
 * Returns null when there is no defined navigation target.
 */
function resolveRoute(type) {
  switch (type) {
    case 'NEW_ORDER':
      return '/(tabs)/orders';
    case 'LOW_STOCK':
      return '/(tabs)/inventory';
    default:
      return null;
  }
}

/**
 * Requests push-notification permissions and registers the Expo push token with
 * the backend. Sets up foreground + response listeners and handles deep navigation
 * when the user taps a notification.
 *
 * @returns {{ hasPermission: boolean, pushToken: string | null }}
 */
export function useNotifications() {
  const [hasPermission, setHasPermission] = useState(false);
  const [pushToken, setPushToken] = useState(null);

  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  // ─── Register token ────────────────────────────────────────────────────────

  const registerForPushNotifications = useCallback(async () => {
    // Push tokens are only available on real hardware
    if (!Device.isDevice) return;

    // On Android, a notification channel is required (Expo SDK ≥ 44)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C9A84C',
      });
    }

    // Check existing permission status before requesting
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

    // Retrieve the Expo push token (project ID is read from app.json automatically)
    let token;
    try {
      const result = await Notifications.getExpoPushTokenAsync();
      token = result.data;
    } catch (err) {
      // Could fail if projectId is not configured — degrade gracefully
      return;
    }

    if (!token) return;

    // Persist locally so callers can read it without another async call
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    setPushToken(token);

    // Register with backend — silently swallow errors (endpoint may not exist yet)
    try {
      await api.post('/notifications/register', {
        token,
        device: Platform.OS,
      });
    } catch (_) {
      // Backend registration is best-effort; local token is still usable
    }
  }, []);

  // ─── Notification response handler ────────────────────────────────────────

  const handleNotificationResponse = useCallback((response) => {
    try {
      const data = response?.notification?.request?.content?.data ?? {};
      const route = resolveRoute(data.type);
      if (route) {
        // Use a short delay so navigation happens after any in-progress transitions
        setTimeout(() => {
          router.push(route);
        }, 300);
      }
    } catch (_) {
      // Navigation errors should never crash the app
    }
  }, []);

  // ─── Mount / unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    registerForPushNotifications();

    // Listener: notification arrives while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((_notification) => {
        // No-op by default — the notification handler above already shows it.
        // Extend here to update in-app state (e.g. badge count) if needed.
      });

    // Listener: user taps the notification (foreground or background)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [registerForPushNotifications, handleNotificationResponse]);

  return { hasPermission, pushToken };
}
