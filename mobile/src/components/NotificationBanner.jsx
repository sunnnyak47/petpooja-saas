/**
 * NotificationBanner — animated slide-in banner for foreground push notifications.
 *
 * Renders at the top of the screen (respects safe-area insets), slides in from
 * above, holds for 4 seconds, then slides out.  Tapping navigates to the
 * relevant route and dismisses immediately.
 *
 * Usage:
 *   <NotificationBanner notification={foregroundNotification} onDismiss={dismissNotification} />
 *
 * `notification` shape: { title, body, type, route }  — pass null to hide.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, R, FS, FW } from '../constants/theme';

// ── Per-type accent colour + icon ────────────────────────────────────────────
const TYPE_META = {
  NEW_ORDER:        { color: T.accent,   bg: T.accentSoft, icon: 'receipt-outline'          },
  ORDER_READY:      { color: T.success,  bg: T.successBg,  icon: 'checkmark-circle-outline'  },
  LOW_STOCK:        { color: T.warning,  bg: T.warningBg,  icon: 'warning-outline'           },
  APPROVAL_REQUEST: { color: T.danger,   bg: T.dangerBg,   icon: 'alert-circle-outline'      },
  EOD_REMINDER:     { color: T.info,     bg: T.infoBg,     icon: 'moon-outline'              },
  NEW_KOT:          { color: T.accent,   bg: T.accentSoft, icon: 'flame-outline'             },
};
const DEFAULT_META = { color: T.textSecondary, bg: T.surfaceMuted, icon: 'notifications-outline' };

const BANNER_HEIGHT    = 80;   // generous enough for two body lines
const AUTO_DISMISS_MS  = 4000;

export function NotificationBanner({ notification, onDismiss }) {
  const insets  = useSafeAreaInsets();
  const slideY  = useRef(new Animated.Value(-(BANNER_HEIGHT + 40))).current;
  const timerRef = useRef(null);

  // Track which notification is currently animating
  const lastNotifRef = useRef(null);

  useEffect(() => {
    if (!notification) return;
    if (lastNotifRef.current === notification) return; // guard double-fire
    lastNotifRef.current = notification;

    // Kill pending timer from previous notification
    if (timerRef.current) clearTimeout(timerRef.current);

    // Reset to off-screen, then slide in
    slideY.setValue(-(BANNER_HEIGHT + 40));
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 260,
    }).start();

    timerRef.current = setTimeout(slideOut, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification]); // eslint-disable-line react-hooks/exhaustive-deps

  const slideOut = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(slideY, {
      toValue: -(BANNER_HEIGHT + 40),
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      lastNotifRef.current = null;
      onDismiss?.();
    });
  };

  const handlePress = () => {
    const route = notification?.route;
    slideOut();
    if (route) setTimeout(() => router.push(route), 320);
  };

  if (!notification) return null;

  const typeKey = (notification.type ?? '').toUpperCase();
  const meta    = TYPE_META[typeKey] ?? DEFAULT_META;
  const topGap  = insets.top + (Platform.OS === 'android' ? 6 : 2);

  return (
    <Animated.View
      style={[styles.wrapper, { top: topGap, transform: [{ translateY: slideY }] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: meta.color }]}
        onPress={handlePress}
        activeOpacity={0.92}
      >
        {/* Left icon badge */}
        <View style={[styles.iconBadge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>

        {/* Text area */}
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {notification.title || 'Notification'}
          </Text>
          {!!notification.body && (
            <Text style={styles.body} numberOfLines={2}>
              {notification.body}
            </Text>
          )}
        </View>

        {/* Dismiss ✕ */}
        <TouchableOpacity
          onPress={slideOut}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={15} color={T.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position:  'absolute',
    left:      12,
    right:     12,
    zIndex:    9999,
    elevation: 20,
  },
  card: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: T.cardBg,
    borderRadius:   R['2xl'],
    borderLeftWidth: 4,
    paddingVertical:  10,
    paddingRight:     10,
    paddingLeft:      10,
    gap:             10,
    // Shadow
    shadowColor:    T.shadowStrong,
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.18,
    shadowRadius:   12,
    elevation:      8,
  },
  iconBadge: {
    width:         38,
    height:        38,
    borderRadius:  R.xl,
    justifyContent: 'center',
    alignItems:    'center',
    flexShrink:    0,
  },
  textWrap: {
    flex:   1,
    gap:    2,
  },
  title: {
    fontSize:   FS?.sm ?? 13,
    fontWeight: FW?.bold ?? '700',
    color:      T.textPrimary,
    lineHeight: 18,
  },
  body: {
    fontSize:   FS?.xs ?? 12,
    fontWeight: FW?.regular ?? '400',
    color:      T.textSecondary,
    lineHeight: 16,
  },
  closeBtn: {
    padding:   4,
    flexShrink: 0,
  },
});
