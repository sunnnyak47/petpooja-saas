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

/**
 * Fire-and-forget ping to wake the (free-tier) backend, which spins down after
 * ~15 min idle and can take up to ~50s to cold-start. Calling this when the
 * login screen mounts means the server is usually warm by the time the user
 * submits credentials — avoiding the "first attempt always times out" problem.
 * Any HTTP response (even 404) proves the dyno is awake; errors are ignored.
 */
export function warmupBackend() {
  return api.get('/health', { timeout: 60000 }).catch(() => {});
}

/** True when an axios error looks like a cold-start (timeout / network / gateway 5xx), not an auth failure. */
export function isColdStartError(error) {
  // Timeout or network blip with no HTTP response — the classic cold-start abort.
  if (
    error?.code === 'ECONNABORTED' ||
    /timeout/i.test(error?.message || '') ||
    (!error?.response && /network/i.test(error?.message || ''))
  ) {
    return true;
  }
  // Render's edge returns a gateway 5xx while the free-tier dyno spins up.
  // 502/503/504 mean the app server isn't reachable yet → always a cold-start.
  // A 500 is only treated as a cold-start when the body is NOT our API's
  // structured JSON error ({ success:false }) — so genuine app 500s still surface.
  const status = error?.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
  if (status === 500 && error?.response?.data?.success !== false) return true;
  return false;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Concurrent refresh lock ──────────────────────────────────────────────────
// Prevents multiple 401 responses from triggering parallel refresh calls.
let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb) {
  refreshSubscribers.push(cb);
}

function handleLogout() {
  store.dispatch(logout());
  // Use proper hash-based routing — navigate within the SPA, don't full-reload
  if (window.location.hash !== '#/login') {
    window.location.hash = '#/login';
  }
}

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config || {};

    // ── Cold-start recovery ──────────────────────────────────────────────────
    // Free-tier Render spins the backend down after ~15 min idle; the first
    // request then aborts (~20s timeout) while the dyno takes ~50s to wake. Wake
    // it via /health (up to 60s) and retry the original request once with a long
    // timeout — turning "first request errors out" into "first request is slow".
    // Skip for the warmup ping itself to avoid recursion.
    const reqUrl = typeof originalRequest.url === 'string' ? originalRequest.url : '';
    if (!originalRequest._coldRetry && !reqUrl.includes('/health') && isColdStartError(error)) {
      originalRequest._coldRetry = true;
      await warmupBackend();
      originalRequest.timeout = 60000;
      return api(originalRequest);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        handleLogout();
        return Promise.reject(error);
      }

      // If already refreshing, queue this request to retry after refresh completes
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addRefreshSubscriber((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, { refresh_token: refreshToken });
        const newAccessToken = data.data.accessToken;
        const newRefreshToken = data.data.refreshToken;

        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        // Bridge the refreshed token to the Electron main process. Without this,
        // SettingsDB('token') keeps the ORIGINAL login token and every syncEngine
        // request 401s ~15 min into the shift. Token-only: outletId is left
        // unchanged (the main handler no-ops undefined fields). No-op on web.
        if (typeof window !== 'undefined' && window.electron?.setAuth) {
          try { window.electron.setAuth({ token: newAccessToken }); } catch (_) {}
        }

        // Notify all queued requests
        onRefreshed(newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        refreshSubscribers = [];
        handleLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    const message = error.response?.data?.message || error.message || 'Something went wrong';
    // Preserve the HTTP context on the rejected error so callers can surface the real
    // backend message/status. Previously a bare `new Error(message)` stripped `.response`,
    // so any caller reading `e.response.data.message` got undefined and fell back to a
    // generic toast — hiding clean 409/400/404 messages (e.g. "phone already exists").
    const err = new Error(message);
    err.status = error.response?.status;
    err.data = error.response?.data;
    err.response = error.response;
    return Promise.reject(err);
  }
);

export default api;
