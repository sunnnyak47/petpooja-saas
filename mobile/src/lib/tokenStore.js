/**
 * tokenStore — single source of truth for auth tokens.
 *
 * Prefers expo-secure-store (Keychain / Keystore-backed) and falls back to
 * AsyncStorage when SecureStore is unavailable (e.g. web). Access token stays
 * under the legacy key 'auth_token' so existing readers keep working; the
 * refresh token is new.
 *
 * All functions are async and never throw — on failure they degrade to null /
 * no-op so auth flows can't be bricked by a storage error.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ACCESS_KEY = 'auth_token';       // legacy key — kept for back-compat
const REFRESH_KEY = 'refresh_token';

let SecureStore = null;
if (Platform.OS !== 'web') {
  try { SecureStore = require('expo-secure-store'); } catch (_) { SecureStore = null; }
}

async function _get(key) {
  try {
    if (SecureStore) {
      const v = await SecureStore.getItemAsync(key);
      if (v != null) return v;
      // Migration: value may still live in AsyncStorage from an older build.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) { await _set(key, legacy); await AsyncStorage.removeItem(key).catch(() => {}); }
      return legacy;
    }
    return await AsyncStorage.getItem(key);
  } catch (_) { return null; }
}

async function _set(key, value) {
  try {
    if (value == null) return _del(key);
    if (SecureStore) return SecureStore.setItemAsync(key, String(value));
    return AsyncStorage.setItem(key, String(value));
  } catch (_) { /* ignore */ }
}

async function _del(key) {
  try {
    if (SecureStore) await SecureStore.deleteItemAsync(key).catch(() => {});
    await AsyncStorage.removeItem(key).catch(() => {});
  } catch (_) { /* ignore */ }
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
