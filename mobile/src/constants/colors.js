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

export const LightColors = {
  bg: '#F7F7F7',
  card: '#FFFFFF',
  text: '#000000',
  textSecondary: '#444444',
  textMuted: '#888888',
  border: '#EAEAEA',
  borderLight: '#F7F7F7',
  accent: '#0070F3',
  success: '#00B341',
  warning: '#F5A623',
  error: '#EE0000',
  headerBg: '#FFFFFF',
  tabBar: '#FFFFFF',
  tabInactive: '#888888',
  tabActive: '#000000',
  pillBg: '#F0F0F0',
  pillActiveBg: '#000000',
  pillText: '#888888',
  pillActiveText: '#FFFFFF',
  inputBg: '#FFFFFF',
  switchTrack: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
};

export const DarkColors = {
  bg: '#0A0A0A',
  card: '#1A1A1A',
  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textMuted: '#888888',
  border: '#2A2A2A',
  borderLight: '#1F1F1F',
  headerBg: '#111111',
  tabBar: '#111111',
  tabInactive: '#666666',
  tabActive: '#FFFFFF',
  accent: '#4A9EFF',
  success: '#00D44B',
  warning: '#FFB84D',
  error: '#FF4444',
  pillBg: '#2A2A2A',
  pillActiveBg: '#FFFFFF',
  pillText: '#888888',
  pillActiveText: '#000000',
  inputBg: '#1A1A1A',
  switchTrack: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.7)',
};
