import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useSyncStatus } from '../hooks/useSyncStatus';

/**
 * SyncStatusBar — a compact status bar for POS screens.
 *
 * Shows the current sync state:
 *   - Green dot + "Synced" when online and no pending orders
 *   - Orange dot + "X orders pending sync" when offline or has pending
 *   - Spinning indicator + "Syncing..." when actively syncing
 *   - Red dot + "Sync failed" with retry button when error
 *
 * Tappable to trigger manual sync.
 */
export function SyncStatusBar() {
  const { colors } = useTheme();
  const { isSyncing, pendingCount, lastError, syncNow, isOnline } =
    useSyncStatus();

  const handlePress = useCallback(() => {
    if (!isSyncing && isOnline) {
      syncNow();
    }
  }, [isSyncing, isOnline, syncNow]);

  // Determine display state
  const state = getDisplayState({ isSyncing, pendingCount, lastError, isOnline });

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={[styles.container, { backgroundColor: colors.surface || '#0F1D35' }]}
    >
      <View style={styles.content}>
        {/* Status indicator */}
        {state.showSpinner ? (
          <ActivityIndicator
            size="small"
            color={colors.info || '#38B2F5'}
            style={styles.indicator}
          />
        ) : (
          <View
            style={[styles.dot, { backgroundColor: state.dotColor }]}
          />
        )}

        {/* Status text */}
        <Text
          style={[styles.text, { color: colors.text2 || '#A8B8D0' }]}
          numberOfLines={1}
        >
          {state.message}
        </Text>

        {/* Retry button (shown only on error and online) */}
        {state.showRetry && (
          <TouchableOpacity
            onPress={syncNow}
            style={[styles.retryBtn, { borderColor: colors.error || '#F05252' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.retryText, { color: colors.error || '#F05252' }]}>
              Retry
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Determine which visual state to display.
 */
function getDisplayState({ isSyncing, pendingCount, lastError, isOnline }) {
  // Actively syncing
  if (isSyncing) {
    return {
      dotColor: null,
      showSpinner: true,
      message: 'Syncing...',
      showRetry: false,
    };
  }

  // Error state
  if (lastError) {
    return {
      dotColor: '#F05252',
      showSpinner: false,
      message: 'Sync failed',
      showRetry: isOnline,
    };
  }

  // Offline or has pending orders
  if (!isOnline || pendingCount > 0) {
    const count = pendingCount || 0;
    const noun = count === 1 ? 'order' : 'orders';
    const message = !isOnline
      ? `Offline — ${count} ${noun} pending`
      : `${count} ${noun} pending sync`;

    return {
      dotColor: '#F5A623',
      showSpinner: false,
      message,
      showRetry: false,
    };
  }

  // All synced and online
  return {
    dotColor: '#10C98A',
    showSpinner: false,
    message: 'Synced',
    showRetry: false,
  };
}

const styles = StyleSheet.create({
  container: {
    height: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  indicator: {
    marginRight: 8,
    transform: [{ scale: 0.7 }],
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
