import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setAuthFailureHandler } from '../lib/api';
import { getAccessToken, setTokens, clearTokens } from '../lib/tokenStore';

const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const lastActivityRef = useRef(Date.now());
  // Track the current user id in a ref so logout stays a stable callback while
  // still able to clear that user's scoped app_mode key.
  const userIdRef = useRef(null);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user]);

  // Update activity timestamp on any user interaction
  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const logout = useCallback(async () => {
    // Best-effort server-side logout (token blacklist). Route exists at
    // POST /api/auth/logout; run it BEFORE clearing tokens so the auth header
    // is still attached. Never let a network/timeout error block local logout.
    try { await api.post('/auth/logout', {}, { timeout: 8000 }); } catch (_) {}
    await clearTokens();
    await AsyncStorage.removeItem('auth_user').catch(() => {});
    // Clear this user's scoped app_mode so a different account on the same
    // device isn't routed to the previous user's surface. (Key format mirrors
    // AppModeContext.appModeKey — kept inline to avoid a circular import.)
    const uid = userIdRef.current;
    if (uid) await AsyncStorage.removeItem(`app_mode:${uid}`).catch(() => {});
    setToken(null);
    setUser(null);
  }, []);

  // Let the API layer clear session state when a token refresh fails hard.
  useEffect(() => {
    setAuthFailureHandler(() => { logout(); });
    return () => setAuthFailureHandler(null);
  }, [logout]);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getAccessToken();
        const storedUser = await AsyncStorage.getItem('auth_user');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // Check timeout on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user) {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed > SESSION_TIMEOUT) {
          setIsLocked(true);
        }
      }
      if (state === 'active') {
        lastActivityRef.current = Date.now();
      }
    });
    return () => subscription?.remove();
  }, [user]);

  const login = async (email, password) => {
    // Longer timeout: the backend may still be cold-starting (Render free tier).
    const res = await api.post('/auth/login', { login: email, password }, { timeout: 60000 });
    const { accessToken: t, refreshToken: rt, user: u } = res.data;
    await setTokens({ accessToken: t, refreshToken: rt });
    await AsyncStorage.setItem('auth_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return u;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isLocked, setIsLocked, touchActivity }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
