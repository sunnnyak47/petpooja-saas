import axios from 'axios';
import Constants from 'expo-constants';
import { getAccessToken, getRefreshToken, setAccessToken, clearTokens } from './tokenStore';

// Resolve the API base URL. Precedence:
//   1. EXPO_PUBLIC_API_URL env var (per-build override)
//   2. app.json expo.extra.apiUrl (configurable default)
//   3. Hardcoded Render production URL (final fallback)
// Lets the app target a local/staging backend for testing without a code change.
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'https://petpooja-saas.onrender.com/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Render free tier sleeps after ~15 min idle and cold-starts in ~30-60s, longer
// than the 15s request timeout. Ping /health (root, not /api) with a long timeout
// to wake it — call on the login screen so it's warm by the time the user submits.
const ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
export function warmup() {
  return axios.get(`${ORIGIN}/health`, { timeout: 60000 }).then(() => true).catch(() => false);
}

// Attach the access token to every request.
api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Single-flight refresh ─────────────────────────────────────────────────
// The backend rotates refresh tokens: two concurrent refreshes with the same
// token → the second gets 401 and forces logout. So all 401s funnel through
// ONE in-flight refresh promise; every waiting request retries with the new
// access token once it resolves.
let refreshPromise = null;
// Callback the app can register (AuthContext) to clear session state on a
// hard refresh failure. Avoids a circular import.
let onAuthFailure = null;
export function setAuthFailureHandler(fn) { onAuthFailure = fn; }

async function runRefresh() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');
  // Bare axios (not `api`) so this call doesn't recurse through interceptors.
  const { data } = await axios.post(
    `${BASE_URL}/auth/refresh-token`,
    { refresh_token: refreshToken },
    { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
  );
  const payload = data?.data || data;
  const newAccess = payload?.accessToken;
  const newRefresh = payload?.refreshToken;
  if (!newAccess) throw new Error('Refresh returned no access token');
  await setAccessToken(newAccess);
  if (newRefresh) {
    const { setTokens } = require('./tokenStore');
    await setTokens({ refreshToken: newRefresh });
  }
  return newAccess;
}

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;

    if (status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = runRefresh().finally(() => { refreshPromise = null; });
        }
        const newAccess = await refreshPromise;
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newAccess}` };
        return api.request(original); // returns unwrapped .data via this interceptor
      } catch (refreshErr) {
        await clearTokens();
        try { onAuthFailure?.(); } catch (_) {}
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
    }

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
