import React from 'react';
import { TouchableOpacity, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

/**
 * PressCard — spring-animated pressable wrapper
 *
 * Replaces bare TouchableOpacity on all tappable cards/rows.
 * Gives Zomato-style press-down + spring-back feel.
 *
 * Props:
 *   children    — content inside
 *   style       — style for the Animated.View wrapper
 *   onPress     — tap handler
 *   scaleDown   — how far to scale on press (default 0.97)
 *   disabled    — disables press effect + handler
 */
export function PressCard({ children, style, onPress, scaleDown = 0.97, disabled = false }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    if (disabled) return;
    scale.value = withSpring(scaleDown, { damping: 20, stiffness: 300, mass: 0.8 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 18, stiffness: 250, mass: 0.8 });
  }

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View style={[style, animStyle]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default PressCard;
