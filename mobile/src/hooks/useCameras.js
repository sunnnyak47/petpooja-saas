/**
 * useCameras — per-outlet CCTV camera manager backed by AsyncStorage.
 *
 * There is NO backend for the CCTV feature. Each outlet keeps its own list of
 * cameras persisted locally, keyed by outletId, so switching outlets shows a
 * different camera set. A camera is a plain record:
 *
 *   { id, name, streamUrl, snapshotUrl, createdAt }
 *
 *   - streamUrl   : RTSP / HTTP(S) / HLS live stream opened for "Live" playback.
 *   - snapshotUrl : optional still-image or MJPEG URL polled for the tile preview.
 *
 * The pure transforms below (storageKey / makeCamera / validateCamera /
 * upsertCamera / removeCamera / bustCache) are exported separately so they can
 * be unit-tested without React or AsyncStorage.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'cctv_cameras_v1:';

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** AsyncStorage key for a given outlet. Falls back to a shared bucket. */
export function storageKey(outletId) {
  const id = outletId == null || outletId === '' ? 'default' : String(outletId);
  return `${STORAGE_PREFIX}${id}`;
}

/** Generate a stable-enough unique id without extra deps. */
function genId() {
  return `cam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const URL_RE = /^(rtsp|rtsps|http|https):\/\/.+/i;

/** True when a string looks like a supported stream/snapshot URL. */
export function isValidUrl(url) {
  return typeof url === 'string' && URL_RE.test(url.trim());
}

/**
 * Validate raw form input. Returns { valid, errors: { field: message } }.
 * Name and a valid streamUrl are required; snapshotUrl is optional but, if
 * present, must be a valid URL.
 */
export function validateCamera(input = {}) {
  const errors = {};
  const name = (input.name ?? '').trim();
  const streamUrl = (input.streamUrl ?? '').trim();
  const snapshotUrl = (input.snapshotUrl ?? '').trim();

  if (!name) errors.name = 'Camera name is required';
  if (!streamUrl) errors.streamUrl = 'Stream URL is required';
  else if (!isValidUrl(streamUrl))
    errors.streamUrl = 'Use an rtsp:// or http(s):// URL';
  if (snapshotUrl && !isValidUrl(snapshotUrl))
    errors.snapshotUrl = 'Snapshot must be an http(s):// URL';

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Build a normalized camera record from raw input (trims + assigns id). */
export function makeCamera(input = {}) {
  return {
    id: input.id || genId(),
    name: (input.name ?? '').trim(),
    streamUrl: (input.streamUrl ?? '').trim(),
    snapshotUrl: (input.snapshotUrl ?? '').trim() || null,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

/**
 * Insert or update a camera in a list (immutably). If a record with the same
 * id exists it is replaced (preserving createdAt); otherwise appended.
 */
export function upsertCamera(list = [], camera) {
  const safe = Array.isArray(list) ? list : [];
  const idx = safe.findIndex((c) => c.id === camera.id);
  if (idx === -1) return [...safe, camera];
  const next = safe.slice();
  next[idx] = { ...safe[idx], ...camera, createdAt: safe[idx].createdAt };
  return next;
}

/** Remove a camera by id (immutably). */
export function removeCamera(list = [], id) {
  const safe = Array.isArray(list) ? list : [];
  return safe.filter((c) => c.id !== id);
}

/**
 * Append a cache-busting query param so <Image> re-fetches a snapshot/MJPEG
 * frame instead of serving the cached one. Returns null for empty input.
 */
export function bustCache(url, ts = Date.now()) {
  if (!url) return null;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_t=${ts}`;
}

/** Safely parse a persisted JSON blob into an array of cameras. */
export function parseCameras(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * useCameras(outletId)
 *
 * Returns:
 *   cameras     — array of camera records for the outlet
 *   isLoading   — true until the first AsyncStorage read resolves
 *   error       — last persistence error (string | null)
 *   addCamera(input)    -> Promise<{ ok, errors?, camera? }>
 *   editCamera(id,input)-> Promise<{ ok, errors?, camera? }>
 *   removeCamera(id)    -> Promise<void>
 *   reload()            -> Promise<void>
 */
export function useCameras(outletId) {
  const [cameras, setCameras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const key = useMemo(() => storageKey(outletId), [outletId]);

  // Guard against writing a stale outlet's list after a fast outlet switch.
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await AsyncStorage.getItem(key);
      setCameras(parseCameras(raw));
    } catch (e) {
      setError(e?.message || 'Failed to load cameras');
      setCameras([]);
    } finally {
      setIsLoading(false);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (next) => {
      // Optimistic in-memory update, then write-through to storage.
      setCameras(next);
      try {
        await AsyncStorage.setItem(keyRef.current, JSON.stringify(next));
        setError(null);
      } catch (e) {
        setError(e?.message || 'Failed to save cameras');
      }
    },
    []
  );

  const addCamera = useCallback(
    async (input) => {
      const { valid, errors } = validateCamera(input);
      if (!valid) return { ok: false, errors };
      const camera = makeCamera(input);
      await persist(upsertCamera(cameras, camera));
      return { ok: true, camera };
    },
    [cameras, persist]
  );

  const editCamera = useCallback(
    async (id, input) => {
      const { valid, errors } = validateCamera(input);
      if (!valid) return { ok: false, errors };
      const camera = makeCamera({ ...input, id });
      await persist(upsertCamera(cameras, camera));
      return { ok: true, camera };
    },
    [cameras, persist]
  );

  const remove = useCallback(
    async (id) => {
      await persist(removeCamera(cameras, id));
    },
    [cameras, persist]
  );

  return {
    cameras,
    isLoading,
    error,
    addCamera,
    editCamera,
    removeCamera: remove,
    reload: load,
  };
}

export default useCameras;
