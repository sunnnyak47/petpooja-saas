/**
 * tokenStore — single source of truth for auth tokens.
 *
 * Prefers expo-secure-store (Keychain / Keystore-backed) but expo-secure-store
 * enforces a ~2KB per-item limit. An owner / super_admin JWT (long permissions
 * array + logo_url) can EXCEED that limit and silently fail to persist, which
 * left the app with no token on cold start and bounced the user to /login.
 *
 * FIX: every write tries SecureStore first, but if the value is too large
 * (> SAFE_LIMIT bytes) or SecureStore throws, we transparently fall back to
 * AsyncStorage and record WHICH store holds the value under a small location
 * flag. Reads consult the flag (and, defensively, both stores) so the token is
 * always recovered. Nothing is silently swallowed — failures log a warning.
 *
 * Access token stays under the legacy key 'auth_token' so existing readers keep
 * working; the refresh token is new.
 *
 * All functions are async and never throw — on failure they degrade to null /
 * no-op so auth flows can't be bricked by a storage error.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ACCESS_KEY = 'auth_token';       // legacy key — kept for back-compat
const REFRESH_KEY = 'refresh_token';

// expo-secure-store warns above 2048 bytes; stay comfortably under it.
const SAFE_LIMIT = 1800;

// Per-key flag (kept in AsyncStorage — always small & reliable) recording which
// backing store actually holds the value: 'secure' | 'async'.
const locKey = (key) => `${key}__loc`;

let SecureStore = null;
if (Platform.OS !== 'web') {
  try { SecureStore = require('expo-secure-store'); } catch (_) { SecureStore = null; }
}

// UTF-8 byte length (SecureStore's limit is in bytes, not chars).
function byteLength(str) {
  try { return unescape(encodeURIComponent(str)).length; }
  catch (_) { return String(str).length; }
}

async function _getLoc(key) {
  try { return await AsyncStorage.getItem(locKey(key)); } catch (_) { return null; }
}
async function _setLoc(key, loc) {
  try { await AsyncStorage.setItem(locKey(key), loc); } catch (_) { /* non-fatal */ }
}
async function _delLoc(key) {
  try { await AsyncStorage.removeItem(locKey(key)); } catch (_) { /* non-fatal */ }
}

async function _get(key) {
  // 1) Honour the recorded location first.
  const loc = await _getLoc(key);
  if (loc === 'async') {
    try {
      const v = await AsyncStorage.getItem(key);
      if (v != null) return v;
    } catch (_) {}
  } else if (loc === 'secure' && SecureStore) {
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v != null) return v;
    } catch (e) { console.warn(`[tokenStore] SecureStore read failed for ${key}:`, e?.message || e); }
  }

  // 2) No flag (or flag miss) — check both stores defensively and self-heal.
  if (SecureStore) {
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v != null) { await _setLoc(key, 'secure'); return v; }
    } catch (_) {}
  }
  try {
    const v = await AsyncStorage.getItem(key);
    if (v != null) { await _setLoc(key, 'async'); return v; }
  } catch (_) {}

  return null;
}

async function _set(key, value) {
  if (value == null) return _del(key);
  const str = String(value);
  const fits = byteLength(str) <= SAFE_LIMIT;

  // Prefer SecureStore only when the value comfortably fits its item limit.
  if (SecureStore && fits) {
    try {
      await SecureStore.setItemAsync(key, str);
      await _setLoc(key, 'secure');
      // Drop any stale AsyncStorage copy from a prior fallback write.
      await AsyncStorage.removeItem(key).catch(() => {});
      return;
    } catch (e) {
      console.warn(`[tokenStore] SecureStore write failed for ${key}, falling back to AsyncStorage:`, e?.message || e);
    }
  } else if (SecureStore && !fits) {
    console.warn(`[tokenStore] ${key} is ${byteLength(str)} bytes (> ${SAFE_LIMIT}); using AsyncStorage fallback.`);
  }

  // Fallback / web path: AsyncStorage.
  try {
    await AsyncStorage.setItem(key, str);
    await _setLoc(key, 'async');
    // Clear any SecureStore copy so the two stores never disagree.
    if (SecureStore) await SecureStore.deleteItemAsync(key).catch(() => {});
  } catch (e) {
    console.warn(`[tokenStore] AsyncStorage write failed for ${key}:`, e?.message || e);
  }
}

async function _del(key) {
  if (SecureStore) await SecureStore.deleteItemAsync(key).catch(() => {});
  await AsyncStorage.removeItem(key).catch(() => {});
  await _delLoc(key);
}

export const getAccessToken  = () => _get(ACCESS_KEY);
export const getRefreshToken = () => _get(REFRESH_KEY);

export async function setTokens({ accessToken, refreshToken } = {}) {
  if (accessToken !== undefined)  await _set(ACCESS_KEY, accessToken);
  if (refreshToken !== undefined) await _set(REFRESH_KEY, refreshToken);
}

export async function setAccessToken(token) { await _set(ACCESS_KEY, token); }

export async function clearTokens() {
  await _del(ACCESS_KEY);
  await _del(REFRESH_KEY);
}
