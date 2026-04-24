import axios from 'axios';
import { store } from '../store';
import { logout } from '../store/slices/authSlice';

// Safe Electron detection — must use typeof guard at module scope.
const isElectron = typeof window !== 'undefined' && window.location?.protocol === 'file:';

// In Electron relative URLs resolve to file:///api — use absolute backend URL instead.
// On web use VITE_API_URL (set at build time) or fall back to /api (Vite dev proxy).
const BASE_URL = import.meta.env.VITE_API_URL
  || (isElectron ? 'https://petpooja-saas.onrender.com/api' : '/api');

const api = axios.create({
  baseURL: BASE_URL,
  timeout: isElectron ? 90000 : 15000,
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
