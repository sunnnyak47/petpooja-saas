import React, { useState } from 'react';
import { View, Image, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

/**
 * FoodImage — food/menu item image with fade-in load animation
 *
 * Props:
 *   uri           — image URL (optional, shows placeholder if absent)
 *   width         — number
 *   height        — number
 *   borderRadius  — number (default 12)
 *   fallbackColor — placeholder background color (default '#F0F0F0')
 *   fallbackEmoji — emoji shown when no image (default '🍽️')
 */
export function FoodImage({
  uri,
  width,
  height,
  borderRadius = 12,
  fallbackColor = '#F0F0F0',
  fallbackEmoji = '🍽️',
}) {
  const opacity = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  function handleLoad() {
    opacity.value = withTiming(1, { duration: 300 });
  }

  return (
    <View
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: fallbackColor,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Fallback always underneath */}
      <Text style={{ fontSize: Math.min(width, height) * 0.4 }}>{fallbackEmoji}</Text>

      {/* Image fades in on load */}
      {uri ? (
        <Animated.Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { width, height, borderRadius }, animStyle]}
          onLoad={handleLoad}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

export default FoodImage;
