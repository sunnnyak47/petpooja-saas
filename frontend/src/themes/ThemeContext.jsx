import { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';
import { DEFAULT_THEME, getTheme, themes } from './themes';

const ThemeContext = createContext();

/**
 * Applies a theme's CSS variables to the document root immediately.
 * @param {string} themeId
 */
function applyTheme(themeId) {
  const theme = getTheme(themeId);
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export const ThemeProvider = ({ children }) => {
  const [activeThemeId, setActiveThemeId] = useState(() => {
    const saved = localStorage.getItem('petpooja_theme');
    return saved || DEFAULT_THEME;
  });

  // useLayoutEffect fires synchronously before paint — eliminates flicker
  useLayoutEffect(() => {
    applyTheme(activeThemeId);
  }, [activeThemeId]);

  const handleSetTheme = (id) => {
    setActiveThemeId(id);
    localStorage.setItem('petpooja_theme', id);
    applyTheme(id); // Apply immediately without waiting for re-render
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
 * @returns {{ activeThemeId: string, setActiveThemeId: Function, activeTheme: object, themes: object[] }}
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
