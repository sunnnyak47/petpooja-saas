// Global typography scale for MS-RM app
// Matches Vercel × Apple light theme

export const TYPE = {
  // Headings
  h1: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  h3: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },

  // Body
  body:     { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodyMed:  { fontSize: 15, fontWeight: '600' },
  bodyBold: { fontSize: 15, fontWeight: '700' },

  // Small
  small:    { fontSize: 13, fontWeight: '400' },
  smallMed: { fontSize: 13, fontWeight: '600' },

  // Captions / labels
  caption: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
  label:   { fontSize: 10, fontWeight: '700', letterSpacing: 1.0, textTransform: 'uppercase' },

  // Amounts / numbers
  amount:   { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  amountLg: { fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
  amountXl: { fontSize: 32, fontWeight: '900', letterSpacing: -1.2 },
};
