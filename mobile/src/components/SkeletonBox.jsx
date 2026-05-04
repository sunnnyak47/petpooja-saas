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
 *   style         (object)          – additional styles
 */
export default function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  style,
}) {
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 700, easing: Easing.inOut(Easing.ease) }),
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
          backgroundColor: '#1E3A5F',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
