import { createContext, useContext, useState, useLayoutEffect } from 'react';
import { DEFAULT_THEME, getTheme, themes } from './themes';

const ThemeContext = createContext();

/**
 * Generates a <style> block that overrides key structural CSS properties
 * using the active theme's color values. This approach bypasses Tailwind's
 * color system entirely, which cannot handle CSS variable opacity modifiers.
 * @param {object} colors - The theme colors map
 * @returns {string} CSS string
 */
function buildThemeCSS(colors) {
  const bg      = colors['--bg-primary'];
  const bgCard  = colors['--bg-card'];
  const bgHover = colors['--bg-hover'];
  const border  = colors['--border'];
  const textPri = colors['--text-primary'];
  const textSec = colors['--text-secondary'];
  const accent  = colors['--accent'];
  const accentH = colors['--accent-hover'];
  const sidebar = colors['--sidebar-bg'];
  const success = colors['--success'];
  const warning = colors['--warning'];

  return `
    /* ── Petpooja Theme Override ── */
    body, #root {
      background-color: ${bg} !important;
      color: ${textPri} !important;
    }
    /* Main layout wrappers */
    .h-screen, .flex.bg-surface-900, [class*="bg-surface-900"] {
      background-color: ${bg} !important;
    }
    /* Cards, panels, modals */
    [class*="bg-surface-800"], [class*="bg-surface-700"] {
      background-color: ${bgCard} !important;
    }
    /* Sidebar */
    aside, [class*="bg-surface-800/50"] {
      background-color: ${sidebar} !important;
    }
    /* Borders */
    [class*="border-surface"] {
      border-color: ${border} !important;
    }
    /* Accent color (buttons, active states, badges) */
    [class*="bg-brand-5"], [class*="bg-brand-6"],
    .btn-primary, [class*="bg-brand-500"], [class*="bg-brand-600"] {
      background-color: ${accent} !important;
    }
    [class*="text-brand-4"], [class*="text-brand-5"] {
      color: ${accent} !important;
    }
    [class*="border-brand"] {
      border-color: ${accent} !important;
    }
    /* Active nav item */
    [class*="bg-brand-500/15"], [class*="bg-brand-500/20"] {
      background-color: ${accent}22 !important;
    }
    /* Text colors */
    [class*="text-surface-100"], [class*="text-surface-200"] {
      color: ${textPri} !important;
    }
    [class*="text-surface-300"], [class*="text-surface-400"],
    [class*="text-surface-500"] {
      color: ${textSec} !important;
    }
    /* Logo gradient override */
    [class*="from-brand-500"] { --tw-gradient-from: ${accent} !important; }
    [class*="to-brand-600"], [class*="to-brand-700"] { --tw-gradient-to: ${accentH} !important; }
    /* Hover states */
    [class*="hover:bg-surface-700"]:hover,
    [class*="hover:bg-surface-800"]:hover {
      background-color: ${bgHover} !important;
    }
    /* Focus ring */
    [class*="focus:ring-brand"] {
      --tw-ring-color: ${accent} !important;
    }
    /* Input fields */
    input.input, select.input, textarea.input,
    [class~="input"] {
      background-color: ${bgCard} !important;
      border-color: ${border} !important;
      color: ${textPri} !important;
    }
    /* Success / Warning tokens */
    [class*="text-success"] { color: ${success} !important; }
    [class*="bg-success-5"], [class*="bg-success-6"] { background-color: ${success} !important; }
    [class*="text-warning"] { color: ${warning} !important; }
    [class*="bg-warning-5"], [class*="bg-warning-6"] { background-color: ${warning} !important; }
  `;
}

/**
 * Applies the theme by injecting/updating a <style> element in <head>.
 * @param {string} themeId
 */
function applyTheme(themeId) {
  const theme = getTheme(themeId);
  if (!theme) return;

  let styleEl = document.getElementById('petpooja-theme');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'petpooja-theme';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildThemeCSS(theme.colors);
}

export const ThemeProvider = ({ children }) => {
  const [activeThemeId, setActiveThemeId] = useState(() => {
    return localStorage.getItem('petpooja_theme') || DEFAULT_THEME;
  });

  // useLayoutEffect fires synchronously before paint — zero flicker
  useLayoutEffect(() => {
    applyTheme(activeThemeId);
  }, [activeThemeId]);

  const handleSetTheme = (id) => {
    setActiveThemeId(id);
    localStorage.setItem('petpooja_theme', id);
    applyTheme(id); // instant — no re-render wait
  };

  const value = {
    activeThemeId,
    setActiveThemeId: handleSetTheme,
    activeTheme: getTheme(activeThemeId),
    themes,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to consume the theme context.
 */
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
