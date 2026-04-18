import { createContext, useContext, useState, useEffect } from 'react';
import { themes, DEFAULT_THEME, getTheme } from './themes';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [activeThemeId, setActiveThemeId] = useState(() => {
    // Try to get from localStorage, fallback to DEFAULT_THEME
    const saved = localStorage.getItem('petpooja_theme');
    return saved || DEFAULT_THEME;
  });

  useEffect(() => {
    // Apply the active theme colors to the document :root
    const theme = getTheme(activeThemeId);
    if (!theme) return;

    const root = document.documentElement;
    
    // Apply each color variable to the root element
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Save to localStorage
    localStorage.setItem('petpooja_theme', activeThemeId);
  }, [activeThemeId]);

  const value = {
    activeThemeId,
    setActiveThemeId,
    activeTheme: getTheme(activeThemeId),
    themes
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
