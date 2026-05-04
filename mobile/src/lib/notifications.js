import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Schedules a local notification to fire immediately (0-second trigger).
 *
 * @param {string} title  - Notification title shown in the system tray.
 * @param {string} body   - Notification body text.
 * @param {object} [data] - Arbitrary payload attached to the notification.
 *                          Use `data.type` values like 'NEW_ORDER' | 'LOW_STOCK'
 *                          so `useNotifications` can route on tap.
 * @returns {Promise<string | null>} The notification identifier, or null on error.
 */
export async function scheduleLocalNotification(title, body, data = {}) {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
        // Android-specific: map to the 'default' channel created in useNotifications
        ...(Platform.OS === 'android' && { channelId: 'default' }),
      },
      trigger: null, // null = fire immediately
    });
    return id;
  } catch (_) {
    return null;
  }
}

/**
 * Cancels all pending (scheduled) local notifications.
 *
 * @returns {Promise<void>}
 */
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (_) {
    // Silently ignore — non-critical cleanup
  }
}

/**
 * Sets the app icon badge count.
 *
 * On iOS this updates the red badge on the home-screen icon.
 * On Android the behaviour depends on the launcher; pass 0 to clear.
 *
 * @param {number} count - Badge count. Pass 0 to clear the badge.
 * @returns {Promise<boolean>} Whether the badge was set successfully.
 */
export async function setBadgeCount(count) {
  try {
    const success = await Notifications.setBadgeCountAsync(
      Math.max(0, Math.floor(count)),
    );
    return success;
  } catch (_) {
    return false;
  }
}
