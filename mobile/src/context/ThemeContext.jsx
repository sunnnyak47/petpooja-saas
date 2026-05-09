import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors } from '../constants/colors';

const THEME_KEY = 'app_theme'; // 'light' | 'dark' | 'system'

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState('system'); // 'light' | 'dark' | 'system'
  const [loaded, setLoaded] = useState(false);

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

  const colors = isDark ? DarkColors : LightColors;

  const setTheme = async (theme) => {
    setPreference(theme);
    await AsyncStorage.setItem(THEME_KEY, theme);
  };

  return (
    <ThemeContext.Provider value={{ isDark, colors, preference, setTheme, loaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
