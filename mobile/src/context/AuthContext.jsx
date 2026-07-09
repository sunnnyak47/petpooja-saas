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

  // Update activity timestamp on any user interaction
  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    await AsyncStorage.removeItem('auth_user').catch(() => {});
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
