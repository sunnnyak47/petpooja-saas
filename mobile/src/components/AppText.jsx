/**
 * AppText — Text that renders in Inter (web-parity font), picking the right
 * Inter weight-family from the style's fontWeight. React Native does not
 * synthesize weight for custom fonts on Android, so we map weight → family.
 *
 * Drop-in for <Text>. Adopt screen-by-screen; existing <Text> keeps working.
 */
import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fontForWeight } from '../constants/theme';

export default function AppText({ style, mono, children, ...rest }) {
  const flat = StyleSheet.flatten(style) || {};
  const family = mono ? 'JetBrainsMono_500Medium' : fontForWeight(flat.fontWeight);
  return (
    <Text {...rest} style={[style, { fontFamily: family }]}>
      {children}
    </Text>
  );
}
