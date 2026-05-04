import { Platform } from 'react-native';

// Stripe/Linear-inspired type scale — all entries are StyleSheet-compatible objects
export const T = {
  // Display — hero numbers / splash text
  display:    { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },

  // Headings
  h1:         { fontSize: 20, fontWeight: '600' },
  h2:         { fontSize: 16, fontWeight: '600' },
  h3:         { fontSize: 14, fontWeight: '600' },

  // Body
  body:       { fontSize: 14, fontWeight: '400', lineHeight: 22 },
  bodySmall:  { fontSize: 12, fontWeight: '400', lineHeight: 18 },

  // UI labels
  label:      { fontSize: 12, fontWeight: '500' },
  labelSmall: { fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },

  // Caption & metadata
  caption:    { fontSize: 11, fontWeight: '400', color: '#A8B8D0' },

  // Overline / tag / category
  overline:   { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },

  // Numeric — tabular layout for data values
  num:        { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  numSm:      { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  numXs:      { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },

  // Monospace — code / IDs
  mono:       { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
};
