/**
 * Mobile theme — matches the web app design language exactly.
 *
 * Web app uses:
 *   --bg-primary:     #f8fafc  (slate-50, page background)
 *   --bg-secondary:   #ffffff  (cards, inputs)
 *   --text-primary:   #0f172a  (slate-900, headings)
 *   --text-secondary: #475569  (slate-600, body)
 *   --accent:         #2563eb  (blue-600, dashboard primary)
 *   --success:        #16a34a  (green-600)
 *   --warning:        #d97706  (amber-600)
 *   --danger:         #dc2626  (red-600)
 *
 * All mobile screens should use these tokens so the visual identity
 * stays consistent across web ↔ mobile.
 */

export const T = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  pageBg:        '#f8fafc',   // slate-50 — page/container background
  cardBg:        '#ffffff',   // pure white — cards, inputs, modals
  cardBgHover:   '#f1f5f9',   // slate-100 — hover state, chip backgrounds
  surfaceMuted:  '#f1f5f9',   // slate-100 — secondary surfaces

  // ── Borders ──────────────────────────────────────────────────────────────
  border:        '#e2e8f0',   // slate-200 — standard borders
  borderStrong:  '#cbd5e1',   // slate-300 — pronounced borders
  separator:     '#f1f5f9',   // slate-100 — soft dividers

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary:   '#0f172a',   // slate-900 — headings, main content
  textSecondary: '#475569',   // slate-600 — body, labels
  textMuted:     '#94a3b8',   // slate-400 — placeholders, hints
  textOnDark:    '#ffffff',   // text on solid dark/accent buttons

  // ── Accents ──────────────────────────────────────────────────────────────
  accent:        '#2563eb',   // blue-600 — MS-RM primary
  accentDark:    '#1d4ed8',   // blue-700 — pressed/hover
  accentSoft:    '#eff6ff',   // blue-50 — soft background tint
  accentBlue:    '#2563eb',   // blue-600 — dashboard primary (alias)

  // ── Status ───────────────────────────────────────────────────────────────
  success:       '#16a34a',   // green-600
  successDark:   '#15803d',   // green-700
  successBg:     '#dcfce7',   // green-100
  successText:   '#15803d',   // green-700

  warning:       '#d97706',   // amber-600
  warningDark:   '#b45309',   // amber-700
  warningBg:     '#fef3c7',   // amber-100
  warningText:   '#b45309',   // amber-700

  danger:        '#dc2626',   // red-600
  dangerDark:    '#b91c1c',   // red-700
  dangerBg:      '#fee2e2',   // red-100
  dangerText:    '#b91c1c',   // red-700

  info:          '#3b82f6',   // blue-500
  infoBg:        '#dbeafe',   // blue-100

  // Veg / non-veg / egg indicators (used at item level)
  veg:           '#16a34a',   // green-600
  egg:           '#d97706',   // amber-600
  nonVeg:        '#dc2626',   // red-600

  // ── Shadows ──────────────────────────────────────────────────────────────
  shadow:        'rgba(15, 23, 42, 0.04)',
  shadowMedium:  'rgba(15, 23, 42, 0.08)',
  shadowStrong:  'rgba(15, 23, 42, 0.12)',

  // ── Skeleton / loading ───────────────────────────────────────────────────
  skeletonBg:    '#e2e8f0',
  skeletonShine: '#f1f5f9',
};

// ── Radius scale (matches web's rounded-lg / -xl / -2xl) ───────────────────
export const R = {
  sm:   6,    // small chips
  md:   8,    // inputs, small buttons
  lg:   10,   // standard buttons
  xl:   12,   // primary buttons, pills
  '2xl': 16,  // cards, modals
  '3xl': 20,  // bottom sheets, hero cards
  full: 999,  // full circle / pill
};

// ── Spacing scale (matches Tailwind: 1=4px, 2=8px, 3=12px, etc.) ──────────
export const S = {
  '0.5': 2,
  '1':   4,
  '1.5': 6,
  '2':   8,
  '2.5': 10,
  '3':   12,
  '4':   16,
  '5':   20,
  '6':   24,
  '8':   32,
  '10':  40,
  '12':  48,
  '16':  64,
};

// ── Font sizes (matches web's text-xs/-sm/-base/-lg/-xl/-2xl) ──────────────
export const FS = {
  xs:   11,   // labels, badges
  sm:   13,   // body, button text
  base: 15,   // standard text
  lg:   17,   // titles
  xl:   20,   // section headers
  '2xl': 24,  // page titles
  '3xl': 30,  // hero numbers
};

// ── Font weights ──────────────────────────────────────────────────────────
export const FW = {
  normal:   '400',
  medium:   '500',
  semibold: '600',
  bold:     '700',
  extrabold:'800',
  black:    '900',
};

// ── Fonts (match web: Inter for UI, JetBrains Mono for numbers) ────────────
// Weight-specific families loaded via @expo-google-fonts/* in app/_layout.jsx.
export const fonts = {
  regular:   'Inter_400Regular',
  medium:    'Inter_500Medium',
  semibold:  'Inter_600SemiBold',
  bold:      'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  mono:      'JetBrainsMono_500Medium',
};

// Map a React Native fontWeight to the matching Inter family (RN doesn't
// synthesize weight for custom fonts on Android — pick the right family).
export const fontForWeight = (w) => ({
  '400': fonts.regular, '500': fonts.medium, '600': fonts.semibold,
  '700': fonts.bold, '800': fonts.extrabold, '900': fonts.extrabold,
  normal: fonts.regular, bold: fonts.bold,
}[String(w ?? '400')] || fonts.regular);

// ── Status colour maps (extracted 1:1 from web) ────────────────────────────
export const tableStatus = {
  available: { border: '#22c55e', bg: 'rgba(34,197,94,0.12)',  text: '#22c55e', label: 'Free' },
  occupied:  { border: '#3b82f6', bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', label: 'Busy' },
  reserved:  { border: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', text: '#7dd3fc', label: 'Reserved' },
  blocked:   { border: '#52525b', bg: 'rgba(82,82,91,0.15)',   text: '#71717a', label: 'Inactive' },
  held:      { border: '#eab308', bg: 'rgba(234,179,8,0.12)',  text: '#facc15', label: 'Held' },
  part_paid: { border: '#f97316', bg: 'rgba(249,115,22,0.12)', text: '#fb923c', label: 'Part Paid' },
  dirty:     { border: '#ef4444', bg: 'rgba(239,68,68,0.10)',  text: '#f87171', label: 'Dirty' },
};

// Pill: bg = base @ 15% alpha, border = base @ 30% alpha, text = the light shade.
export const orderStatus = {
  pending:   { base: '#eab308', text: '#fde047' },
  confirmed: { base: '#3b82f6', text: '#93c5fd' },
  preparing: { base: '#f97316', text: '#fdba74' },
  ready:     { base: '#10b981', text: '#6ee7b7' },
  served:    { base: '#64748b', text: '#cbd5e1' },
  billed:    { base: '#06b6d4', text: '#67e8f9' },
  paid:      { base: '#22c55e', text: '#86efac' },
  cancelled: { base: '#ef4444', text: '#fca5a5' },
};

export const kotStatus = { pending: '#fbbf24', preparing: '#60a5fa', ready: '#10b981' };

export const chartColors = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#64748b', '#06b6d4'];

export default T;
