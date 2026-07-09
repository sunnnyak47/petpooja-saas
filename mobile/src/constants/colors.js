export const Colors = {
  // Core Brand (dark navy — used as dark theme)
  primary:       '#0A1628',
  primaryMid:    '#0F2040',
  primaryLight:  '#162D55',

  // Backgrounds (dark theme)
  bg:            '#080F1E',
  surface:       '#0F1D35',
  surface2:      '#162840',
  border:        '#1E3A5F',

  // Gold Accent
  gold:          '#C9A84C',
  goldBright:    '#F0C040',
  goldLight:     '#F5E6B8',
  goldDim:       '#8A6F2E',

  // Indigo
  indigo:        '#5B5EF4',
  indigoLight:   '#8B8EF8',
  indigoDim:     '#2D2F8A',

  // Semantic
  success:       '#10C98A',
  successDim:    '#0A6E4A',
  successBg:     '#0D3D2A',
  warning:       '#F5A623',
  warningDim:    '#7A5010',
  warningBg:     '#3D280A',
  error:         '#F05252',
  errorDim:      '#7A1818',
  errorBg:       '#3D0D0D',
  info:          '#38B2F5',
  infoBg:        '#0D2A3D',

  // Text
  text1:         '#F0F4FF',
  text2:         '#A8B8D0',
  text3:         '#5A7090',
  text4:         '#3A5070',
  textWhite:     '#FFFFFF',
  textGold:      '#C9A84C',

  // Chart palette
  chart1:        '#5B5EF4',
  chart2:        '#10C98A',
  chart3:        '#F5A623',
  chart4:        '#F05252',
  chart5:        '#38B2F5',

  // Legacy
  white:         '#FFFFFF',
  card:          '#0F1D35',
  cardDark:      '#0F2040',
  borderDark:    '#1E3A5F',
};

// Gradient presets — pass directly to LinearGradient colors prop
export const Gradients = {
  gold:    ['#C9A84C', '#F0C040'],
  indigo:  ['#2D2F8A', '#5B5EF4'],
  success: ['#0A6E4A', '#10C98A'],
  surface: ['#0F1D35', '#162840'],
  header:  ['#0A1628', '#0F2040'],
};

// ─── Light Theme (Vercel × Apple) ─────────────────────────────────────────────
export const LC = {
  // Backgrounds
  bg:           '#FFFFFF',
  bg2:          '#F7F7F7',
  bg3:          '#F0F0F0',
  card:         '#FFFFFF',
  cardBorder:   '#EAEAEA',
  cardShadow:   'rgba(0,0,0,0.06)',

  // Text
  text1:        '#000000',
  text2:        '#444444',
  text3:        '#888888',
  text4:        '#BBBBBB',

  // Accent (Vercel signature blue)
  accent:       '#0070F3',
  accentLight:  '#EBF4FF',
  accentDark:   '#0051B5',

  // Status
  success:      '#00B341',
  successBg:    '#EDFBF3',
  successText:  '#007A2E',
  warning:      '#F5A623',
  warningBg:    '#FFF8EB',
  warningText:  '#7A5010',
  error:        '#EE0000',
  errorBg:      '#FFF0F0',
  errorText:    '#8B0000',
  info:         '#0070F3',
  infoBg:       '#EBF4FF',

  // Tab bar
  tabBg:        '#FFFFFF',
  tabBorder:    '#EAEAEA',
  tabActive:    '#000000',
  tabInactive:  '#999999',

  // Separator
  separator:    '#EAEAEA',
  overlay:      'rgba(0,0,0,0.04)',
};

// Glass effect helpers — rgba values for transparent/frosted UI layers
export const Glass = {
  card:      'rgba(15, 29, 53, 0.72)',   // semi-transparent surface bg
  border:    'rgba(30, 58, 95, 0.55)',   // subtle frosted border
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
