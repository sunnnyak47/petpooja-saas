export const themes = [
  {
    id: 'light',
    name: 'Light',
    isDark: false,
    colors: {
      '--bg-primary':    '#f8fafc',
      '--bg-secondary':  '#ffffff',
      '--bg-card':       '#ffffff',
      '--bg-hover':      '#f1f5f9',
      '--border':        '#e2e8f0',
      '--text-primary':  '#0f172a',
      '--text-secondary':'#475569',
      '--accent':        '#2563eb',
      '--accent-hover':  '#1d4ed8',
      '--accent-text':   '#ffffff',
      '--success':       '#16a34a',
      '--warning':       '#d97706',
      '--danger':        '#dc2626',
      '--sidebar-bg':    '#ffffff',
      '--sidebar-text':  '#475569',
      '--sidebar-active':'#2563eb',
      '--button-primary':'#2563eb',
      '--kot-bg':        '#f8fafc',
    }
  },
  {
    id: 'dark',
    name: 'Dark',
    isDark: true,
    colors: {
      '--bg-primary':    '#0f172a',
      '--bg-secondary':  '#1e293b',
      '--bg-card':       '#1e293b',
      '--bg-hover':      '#334155',
      '--border':        '#334155',
      '--text-primary':  '#f1f5f9',
      '--text-secondary':'#94a3b8',
      '--accent':        '#3b82f6',
      '--accent-hover':  '#2563eb',
      '--accent-text':   '#ffffff',
      '--success':       '#22c55e',
      '--warning':       '#f59e0b',
      '--danger':        '#ef4444',
      '--sidebar-bg':    '#0f172a',
      '--sidebar-text':  '#94a3b8',
      '--sidebar-active':'#3b82f6',
      '--button-primary':'#3b82f6',
      '--kot-bg':        '#1e293b',
    }
  },
]

export const DEFAULT_THEME = 'light'

export const getTheme = (id) =>
  themes.find(t => t.id === id) || themes[0]
