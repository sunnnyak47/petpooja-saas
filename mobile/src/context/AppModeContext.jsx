import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_MODE_KEY = 'app_mode';

const AppModeContext = createContext(null);

export function AppModeProvider({ children }) {
  const [mode, setModeState] = useState(null); // null | 'pos' | 'owner'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(APP_MODE_KEY);
        if (stored === 'pos' || stored === 'owner') {
          setModeState(stored);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const setMode = async (newMode) => {
    try {
      await AsyncStorage.setItem(APP_MODE_KEY, newMode);
    } catch (_) {}
    setModeState(newMode);
  };

  return (
    <AppModeContext.Provider value={{ mode, setMode, loading }}>
      {children}
    </AppModeContext.Provider>
  );
}

export const useAppMode = () => {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error('useAppMode must be used within AppModeProvider');
  return ctx;
};
