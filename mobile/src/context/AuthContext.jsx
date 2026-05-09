import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';

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

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem('auth_token');
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
    const res = await api.post('/auth/login', { login: email, password });
    const { accessToken: t, user: u } = res.data;
    await AsyncStorage.setItem('auth_token', t);
    await AsyncStorage.setItem('auth_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    setToken(null);
    setUser(null);
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
