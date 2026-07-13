/**
 * @fileoverview offlineWrite — the universal offline-write wrapper.
 *
 * Every menu / tables (and future) mutation routes its network call through
 * `offlineWrite`. On the happy path it simply calls the real axios request and
 * returns its data, so the ONLINE PATH IS COMPLETELY UNTOUCHED.
 *
 * Only when the request fails with a genuine NETWORK error (the request never
 * reached the server) AND we're running inside the Electron desktop shell do we
 * divert: the raw request is pushed into the desktop `api_outbox` (SQLite) via
 * `window.electron.outboxEnqueue`, and a synthetic optimistic object is returned
 * so React-Query's success flow proceeds as if the write had succeeded. The
 * syncEngine drains the outbox (FIFO) once connectivity returns.
 *
 * Real HTTP errors (400/403/409/422/…) are NOT diverted — they rethrow so the
 * caller's `onError` handler (validation toasts, rollback) runs as usual.
 */

/**
 * True only for genuine network failures — i.e. the request never got an HTTP
 * response. A 4xx/5xx (which carries `err.response`) is NOT a network error.
 * @param {any} err
 * @returns {boolean}
 */
export function isNetworkError(err) {
  if (!err) return false;
  return (
    !err.response &&
    (err.code === 'ERR_NETWORK' ||
      err.message === 'Network Error' ||
      err.code === 'ECONNABORTED')
  );
}

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

function makeUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Run a write, diverting to the desktop outbox on a network error.
 *
 * @param {object}   opts
 * @param {string}   opts.method   HTTP verb (e.g. 'POST' | 'PATCH' | 'DELETE').
 * @param {string}   opts.url      Axios path (e.g. '/menu/categories'). Stored
 *                                 verbatim; the desktop replay prefixes API_URL.
 * @param {any}      [opts.body]   Request body (object; serialized by the outbox).
 * @param {Function} opts.apiCall  Thunk performing the real axios request.
 * @returns {Promise<any>} the axios data on success, or a synthetic
 *   `{ __offline: true, ...body, id }` object when queued offline.
 */
export async function offlineWrite({ method, url, body, apiCall }) {
  try {
    return await apiCall();
  } catch (err) {
    // Only genuine network failures inside Electron get queued for replay.
    if (
      isNetworkError(err) &&
      IS_ELECTRON &&
      typeof window.electron.outboxEnqueue === 'function'
    ) {
      const uuid = makeUuid();
      // The desktop OutboxDB.enqueue serializes objects itself, so pass through.
      window.electron.outboxEnqueue({ uuid, method, url, body });
      const b = body && typeof body === 'object' ? body : {};
      // Synthetic optimistic result: React-Query onSuccess proceeds as if saved.
      return { __offline: true, ...b, id: b.id || `offline-${uuid}` };
    }
    // Real HTTP errors (400/403/409/422/…) must surface to the caller.
    throw err;
  }
}

export default offlineWrite;
