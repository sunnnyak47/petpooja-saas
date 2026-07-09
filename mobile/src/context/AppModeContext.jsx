import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

// Legacy, un-scoped key from earlier builds. Migrated to the per-user key once.
const LEGACY_APP_MODE_KEY = 'app_mode';

// app_mode is scoped per-user so that logging in as a different account on the
// same device does NOT inherit the previous user's chosen surface.
export const appModeKey = (userId) => `app_mode:${userId}`;

const AppModeContext = createContext(null);

export function AppModeProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [mode, setModeState] = useState(null); // null | 'pos' | 'owner'
  const [loading, setLoading] = useState(true);

  // (Re)load the saved mode whenever the signed-in user changes. When there is
  // no user (logged out), reset to null so the next account starts clean.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!userId) {
        if (!cancelled) { setModeState(null); setLoading(false); }
        return;
      }
      try {
        const key = appModeKey(userId);
        let stored = await AsyncStorage.getItem(key);
        // One-time migration of a legacy global preference to this user.
        if (stored == null) {
          const legacy = await AsyncStorage.getItem(LEGACY_APP_MODE_KEY);
          if (legacy === 'pos' || legacy === 'owner') {
            stored = legacy;
            await AsyncStorage.setItem(key, legacy).catch(() => {});
          }
          await AsyncStorage.removeItem(LEGACY_APP_MODE_KEY).catch(() => {});
        }
        if (!cancelled) {
          setModeState(stored === 'pos' || stored === 'owner' ? stored : null);
        }
      } catch (_) {
        if (!cancelled) setModeState(null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const setMode = async (newMode) => {
    setModeState(newMode);
    if (userId) {
      try { await AsyncStorage.setItem(appModeKey(userId), newMode); } catch (_) {}
    }
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
