import React, { createContext, useContext, useEffect, useState } from 'react';
import { Storage } from '../lib/storage';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // MMKV is synchronous — restore session instantly, no async needed
    try {
      const storedToken = Storage.getString('auth_token');
      const storedUser = Storage.getString('auth_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { login: email, password });
    const { accessToken: t, user: u } = res.data;
    Storage.set('auth_token', t);
    Storage.set('auth_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    Storage.delete('auth_token');
    Storage.delete('auth_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
