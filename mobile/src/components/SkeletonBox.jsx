import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * SkeletonBox
 * Animated skeleton placeholder using Reanimated opacity pulse.
 *
 * Props:
 *   width         (number | string) – box width
 *   height        (number | string) – box height
 *   borderRadius  (number)          – corner radius (default 8)
 *   color         (string)          – fill color (default slate-200 #e2e8f0)
 *   style         (object)          – additional styles
 */
export default function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  color = '#e2e8f0',
  style,
}) {
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.55, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: color,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
