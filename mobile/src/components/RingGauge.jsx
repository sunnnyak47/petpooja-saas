import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * RingGauge
 * Animated SVG ring gauge that fills from 0 → value on mount.
 *
 * Props:
 *   value        (0–1)    – fill ratio
 *   size         (number) – outer diameter (default 80)
 *   strokeWidth  (number) – ring thickness (default 6)
 *   color        (string) – arc color (default gold)
 *   label        (string) – small label below center value
 *   displayValue (string) – text shown in the center (e.g. '87%')
 */
export default function RingGauge({
  value = 0,
  size = 80,
  strokeWidth = 6,
  color = '#C9A84C',
  label,
  displayValue,
}) {
  const clampedValue = Math.min(Math.max(value, 0), 1);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  // Arc progress (strokeDashoffset drives the fill)
  const progress = useSharedValue(0);

  // Glow dot opacity for pulsing effect
  const glowOpacity = useSharedValue(0.6);

  useEffect(() => {
    progress.value = withTiming(clampedValue, {
      duration: 1400,
      easing: Easing.out(Easing.cubic),
    });

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [clampedValue]);

  // Animated arc (dashoffset shrinks as progress grows)
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  // Animated glow dot opacity
  const dotProps = useAnimatedProps(() => ({
    opacity: glowOpacity.value,
  }));

  // The glow dot sits at the tip of the arc
  // Angle = -π/2 + 2π * value  (SVG starts at 3 o'clock, we want 12 o'clock origin)
  const tipAngle = -Math.PI / 2 + 2 * Math.PI * clampedValue;
  const dotX = cx + radius * Math.cos(tipAngle);
  const dotY = cy + radius * Math.sin(tipAngle);

  const centerText = displayValue != null ? String(displayValue) : `${Math.round(clampedValue * 100)}%`;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.9} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Background track */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke="#1E3A5F"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Animated arc */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={arcProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${cx}, ${cy}`}
        />

        {/* Pulsing glow dot at arc tip */}
        <AnimatedCircle
          cx={dotX}
          cy={dotY}
          r={strokeWidth * 0.9}
          fill={color}
          animatedProps={dotProps}
        />
      </Svg>

      {/* Center text overlay */}
      <View style={[styles.centerOverlay, { width: size, height: size }]}>
        <Text style={[styles.valueText, { fontSize: size * 0.2, color }]}>
          {centerText}
        </Text>
        {label ? (
          <Text style={[styles.labelText, { fontSize: size * 0.12 }]}>
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelText: {
    color: '#A8B8D0',
    marginTop: 1,
    letterSpacing: 0.2,
  },
});
