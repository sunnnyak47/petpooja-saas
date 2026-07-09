export const Colors = {
  // Core Brand (MS-RM slate — used as dark theme)
  primary:       '#0f172a',   // slate-900
  primaryMid:    '#1e293b',   // slate-800
  primaryLight:  '#334155',   // slate-700

  // Backgrounds (dark theme)
  bg:            '#0f172a',   // slate-900
  surface:       '#1e293b',   // slate-800
  surface2:      '#334155',   // slate-700
  border:        '#334155',   // slate-700

  // Accent (legacy "gold" keys — re-pointed to MS-RM blue)
  gold:          '#2563eb',   // blue-600
  goldBright:    '#3b82f6',   // blue-500
  goldLight:     '#93c5fd',   // blue-300
  goldDim:       '#1e40af',   // blue-800

  // Blue accent (legacy "indigo" keys — re-pointed to MS-RM blue)
  indigo:        '#2563eb',   // blue-600
  indigoLight:   '#60a5fa',   // blue-400
  indigoDim:     '#1e40af',   // blue-800

  // Semantic
  success:       '#16a34a',   // green-600
  successDim:    '#15803d',   // green-700
  successBg:     'rgba(22,163,74,0.15)',
  warning:       '#d97706',   // amber-600
  warningDim:    '#b45309',   // amber-700
  warningBg:     'rgba(217,119,6,0.15)',
  error:         '#dc2626',   // red-600
  errorDim:      '#b91c1c',   // red-700
  errorBg:       'rgba(220,38,38,0.15)',
  info:          '#3b82f6',   // blue-500
  infoBg:        'rgba(59,130,246,0.15)',

  // Text (on dark surfaces)
  text1:         '#f1f5f9',   // slate-100
  text2:         '#94a3b8',   // slate-400
  text3:         '#64748b',   // slate-500
  text4:         '#475569',   // slate-600
  textWhite:     '#FFFFFF',
  textGold:      '#60a5fa',   // blue-400 — accent text on dark

  // Chart palette
  chart1:        '#2563eb',   // blue-600
  chart2:        '#16a34a',   // green-600
  chart3:        '#d97706',   // amber-600
  chart4:        '#dc2626',   // red-600
  chart5:        '#0891b2',   // cyan-600

  // Legacy
  white:         '#FFFFFF',
  card:          '#1e293b',   // slate-800
  cardDark:      '#0f172a',   // slate-900
  borderDark:    '#334155',   // slate-700
};

// Gradient presets — pass directly to LinearGradient colors prop
export const Gradients = {
  gold:    ['#2563eb', '#3b82f6'],
  indigo:  ['#1e40af', '#2563eb'],
  success: ['#15803d', '#16a34a'],
  surface: ['#1e293b', '#334155'],
  header:  ['#0f172a', '#1e293b'],
};

// ─── Light Theme (MS-RM slate/blue — matches web themes.js) ──────────────────
export const LC = {
  // Backgrounds
  bg:           '#f8fafc',   // slate-50 — page background
  bg2:          '#f1f5f9',   // slate-100
  bg3:          '#e2e8f0',   // slate-200
  card:         '#ffffff',
  cardBorder:   '#e2e8f0',   // slate-200
  cardShadow:   'rgba(15,23,42,0.06)',

  // Text
  text1:        '#0f172a',   // slate-900
  text2:        '#475569',   // slate-600
  text3:        '#64748b',   // slate-500
  text4:        '#94a3b8',   // slate-400

  // Accent (MS-RM blue-600)
  accent:       '#2563eb',
  accentLight:  '#eff6ff',   // blue-50
  accentDark:   '#1d4ed8',   // blue-700

  // Status
  success:      '#16a34a',   // green-600
  successBg:    '#f0fdf4',   // green-50
  successText:  '#15803d',   // green-700
  warning:      '#d97706',   // amber-600
  warningBg:    '#fffbeb',   // amber-50
  warningText:  '#b45309',   // amber-700
  error:        '#dc2626',   // red-600
  errorBg:      '#fef2f2',   // red-50
  errorText:    '#b91c1c',   // red-700
  info:         '#2563eb',   // blue-600
  infoBg:       '#eff6ff',   // blue-50

  // Tab bar
  tabBg:        '#ffffff',
  tabBorder:    '#e2e8f0',
  tabActive:    '#2563eb',
  tabInactive:  '#94a3b8',

  // Separator
  separator:    '#e2e8f0',
  overlay:      'rgba(15,23,42,0.04)',
};

// Glass effect helpers — rgba values for transparent/frosted UI layers
export const Glass = {
  card:      'rgba(30, 41, 59, 0.72)',    // slate-800 semi-transparent surface
  border:    'rgba(51, 65, 85, 0.55)',    // slate-700 frosted border
  highlight: 'rgba(255, 255, 255, 0.06)', // top-edge gloss sheen
};

// ─── Theme System — Light / Dark ──────────────────────────────────────────────
// Values below are aligned 1:1 with the web app's CSS variables
// (frontend/src/themes/themes.js). Keys are unchanged so every screen using
// useTheme().colors re-skins to the web look with no screen-code changes.

export const LightColors = {
  bg: '#f8fafc',            // slate-50  — page background
  card: '#ffffff',          // white     — cards, inputs, modals
  text: '#0f172a',          // slate-900 — headings/primary
  textSecondary: '#475569', // slate-600 — body/labels
  textMuted: '#94a3b8',     // slate-400 — hints/placeholders
  border: '#e2e8f0',        // slate-200
  borderLight: '#f1f5f9',   // slate-100 — soft dividers
  accent: '#2563eb',        // blue-600  — dashboard primary (tenant-overridable)
  success: '#16a34a',       // green-600
  warning: '#d97706',       // amber-600
  error: '#dc2626',         // red-600
  headerBg: '#ffffff',
  tabBar: '#ffffff',
  tabInactive: '#94a3b8',
  tabActive: '#2563eb',
  pillBg: '#f1f5f9',
  pillActiveBg: '#2563eb',
  pillText: '#475569',
  pillActiveText: '#ffffff',
  inputBg: '#ffffff',
  switchTrack: '#2563eb',
  overlay: 'rgba(15,23,42,0.5)',
};

export const DarkColors = {
  bg: '#0f172a',            // slate-900 — page background
  card: '#1e293b',          // slate-800 — cards
  text: '#f1f5f9',          // slate-100 — primary
  textSecondary: '#94a3b8', // slate-400 — body
  textMuted: '#64748b',     // slate-500 — hints
  border: '#334155',        // slate-700
  borderLight: '#1e293b',
  headerBg: '#0f172a',
  tabBar: '#0f172a',
  tabInactive: '#94a3b8',
  tabActive: '#3b82f6',
  accent: '#3b82f6',        // blue-500  — dark accent (tenant-overridable)
  success: '#22c55e',       // green-500
  warning: '#f59e0b',       // amber-500
  error: '#ef4444',         // red-500
  pillBg: '#334155',
  pillActiveBg: '#3b82f6',
  pillText: '#94a3b8',
  pillActiveText: '#ffffff',
  inputBg: '#1e293b',
  switchTrack: '#3b82f6',
  overlay: 'rgba(0,0,0,0.6)',
};
