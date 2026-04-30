import axios from 'axios';
import { store } from '../store';
import { logout } from '../store/slices/authSlice';

// Safe Electron detection — must use typeof guard at module scope.
// Covers: file:// (legacy), app:// (custom protocol), http://127.0.0.1 (local HTTP server mode),
// and window.electron exposed via preload.
const isElectron = typeof window !== 'undefined' &&
  (window.location?.protocol === 'file:' ||
   window.location?.protocol === 'app:' ||
   window.location?.hostname === '127.0.0.1' ||
   typeof window.electron !== 'undefined');

const RENDER_BACKEND = 'https://petpooja-saas.onrender.com';

// API base: Electron & Vercel/web both route HTTP through /api (Vercel proxy or direct)
// Electron uses absolute Render URL; web uses /api (proxied by Vercel → Render)
const BASE_URL = import.meta.env.VITE_API_URL
  || (isElectron ? `${RENDER_BACKEND}/api` : '/api');

// Socket base: MUST be absolute Render URL on both Electron and Vercel
// Vercel can't proxy WebSocket upgrades on free/pro plans
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || RENDER_BACKEND;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: isElectron ? 90000 : 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, { refresh_token: refreshToken });
          localStorage.setItem('accessToken', data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          store.dispatch(logout());
          window.location.hash = '#/login';
          return Promise.reject(refreshError);
        }
      } else {
        store.dispatch(logout());
        window.location.hash = '#/login';
      }
    }

    const message = error.response?.data?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
