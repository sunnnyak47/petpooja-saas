import React, { useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * GlassCard
 * Premium glassmorphism card with optional glow border and press-scale animation.
 *
 * Props:
 *   children  (ReactNode) – card content
 *   style     (object)    – additional container styles
 *   onPress   (function)  – if provided, card becomes pressable with spring scale
 *   glow      (string)    – hex color for subtle glow border (e.g. '#C9A84C')
 */
export default function GlassCard({ children, style, onPress, glow }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, []);

  const glowStyle = glow
    ? {
        borderColor: glow + '55',
        shadowColor: glow,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: 8,
      }
    : {
        borderColor: '#1E3A5F',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
      };

  const cardContent = (
    <View style={[styles.card, glowStyle, style]}>
      {/* Top gloss line */}
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.00)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gloss}
        pointerEvents="none"
      />
      {children}
    </View>
  );

  if (onPress) {
    return (
      <AnimatedTouchable
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={animatedStyle}
      >
        {cardContent}
      </AnimatedTouchable>
    );
  }

  return <Animated.View style={animatedStyle}>{cardContent}</Animated.View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0F1D35',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 0,
  },
});
