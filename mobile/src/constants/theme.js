/**
 * Mobile theme — matches the web app design language exactly.
 *
 * Web app uses:
 *   --bg-primary:     #f8fafc  (slate-50, page background)
 *   --bg-secondary:   #ffffff  (cards, inputs)
 *   --text-primary:   #0f172a  (slate-900, headings)
 *   --text-secondary: #475569  (slate-600, body)
 *   --accent:         #2563eb  (blue-600, dashboard primary)
 *   --brand:          #6366f1  (indigo-500, POS / brand color)
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
  accent:        '#6366f1',   // indigo-500 — POS / brand primary
  accentDark:    '#4f46e5',   // indigo-600 — pressed/hover
  accentSoft:    '#eef2ff',   // indigo-50 — soft background tint
  accentBlue:    '#2563eb',   // blue-600 — dashboard primary (legacy)

  // ── Status ───────────────────────────────────────────────────────────────
  success:       '#10b981',   // emerald-500
  successDark:   '#059669',   // emerald-600
  successBg:     '#d1fae5',   // emerald-100
  successText:   '#047857',   // emerald-700

  warning:       '#f59e0b',   // amber-500
  warningDark:   '#d97706',   // amber-600
  warningBg:     '#fef3c7',   // amber-100
  warningText:   '#b45309',   // amber-700

  danger:        '#ef4444',   // red-500
  dangerDark:    '#dc2626',   // red-600
  dangerBg:      '#fee2e2',   // red-100
  dangerText:    '#b91c1c',   // red-700

  info:          '#3b82f6',   // blue-500
  infoBg:        '#dbeafe',   // blue-100

  // Veg / non-veg / egg indicators (used at item level)
  veg:           '#16a34a',   // green-600
  egg:           '#f59e0b',   // amber-500
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

export default T;
