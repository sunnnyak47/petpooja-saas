import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet } from 'react-native';

/**
 * AnimatedCounter
 * Counts up from 0 to `value` on mount using a JS-driven interval.
 *
 * Props:
 *   value       (number)  – target value
 *   prefix      (string)  – e.g. '₹'
 *   suffix      (string)  – e.g. 'k'
 *   style       (object)  – additional Text style
 *   duration    (number)  – animation duration in ms (default 1200)
 */
export default function AnimatedCounter({
  value = 0,
  prefix = '',
  suffix = '',
  style,
  duration = 1200,
}) {
  const [display, setDisplay] = useState(0);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }

    const startValue = 0;
    const endValue = value;

    // Use requestAnimationFrame for smooth animation on RN web / Expo Go
    // Falls back to a setInterval-based approach for native targets
    const isWeb = typeof requestAnimationFrame !== 'undefined';

    if (isWeb) {
      const animate = (timestamp) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startValue + (endValue - startValue) * eased;

        setDisplay(Number.isInteger(endValue) ? Math.round(current) : parseFloat(current.toFixed(2)));

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };

      startTimeRef.current = null;
      rafRef.current = requestAnimationFrame(animate);

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    } else {
      // Native fallback with setInterval
      const steps = 60;
      const stepDuration = duration / steps;
      let step = 0;

      const timer = setInterval(() => {
        step += 1;
        const progress = step / steps;
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startValue + (endValue - startValue) * eased;

        setDisplay(Number.isInteger(endValue) ? Math.round(current) : parseFloat(current.toFixed(2)));

        if (step >= steps) clearInterval(timer);
      }, stepDuration);

      return () => clearInterval(timer);
    }
  }, [value, duration]);

  const formattedDisplay = Number.isInteger(value)
    ? display.toLocaleString('en-IN')
    : display.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Text style={[styles.text, style]}>
      {prefix}{formattedDisplay}{suffix}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: '#F0F4FF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
