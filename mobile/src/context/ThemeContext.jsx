import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors } from '../constants/colors';

const THEME_KEY = 'app_theme'; // 'light' | 'dark' | 'system'

const ThemeContext = createContext(null);

// Accent (and accent-derived) keys get overridden by the tenant's brand color,
// mirroring the web app which overrides --accent from user.primary_color.
const ACCENT_KEYS = ['accent', 'tabActive', 'pillActiveBg', 'switchTrack'];

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState('system'); // 'light' | 'dark' | 'system'
  const [loaded, setLoaded] = useState(false);
  const [accentOverride, setAccentOverride] = useState(null); // tenant primary_color

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') setPreference(val);
      setLoaded(true);
    });
  }, []);

  const isDark = useMemo(() => {
    if (preference === 'system') return systemScheme === 'dark';
    return preference === 'dark';
  }, [preference, systemScheme]);

  const colors = useMemo(() => {
    const base = isDark ? DarkColors : LightColors;
    if (!accentOverride) return base;
    const merged = { ...base };
    for (const k of ACCENT_KEYS) merged[k] = accentOverride;
    return merged;
  }, [isDark, accentOverride]);

  const setTheme = useCallback(async (theme) => {
    setPreference(theme);
    await AsyncStorage.setItem(THEME_KEY, theme).catch(() => {});
  }, []);

  // Called by the app once the user is known (RootContent) to brand the accent.
  const applyBrandColor = useCallback((color) => {
    setAccentOverride(color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : null);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, colors, preference, setTheme, loaded, applyBrandColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
