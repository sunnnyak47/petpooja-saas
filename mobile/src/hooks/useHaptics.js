let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch (_) {
  // expo-haptics not available on this device/platform — all methods become no-ops
}

export const useHaptics = () => ({
  light: () => {
    try {
      if (Haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (_) {}
  },
  medium: () => {
    try {
      if (Haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (_) {}
  },
  success: () => {
    try {
      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (_) {}
  },
  error: () => {
    try {
      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (_) {}
  },
});
