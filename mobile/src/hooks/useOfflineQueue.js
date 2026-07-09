// DEAD PATH — intentionally neutered.
//
// This hook was a second, parallel offline queue that duplicated the
// SyncEngine (src/lib/syncEngine.js). It is imported nowhere in the app
// (verified via grep across app/ and src/). Its UPDATE_ORDER action also
// pointed at a wrong/non-existent route (PATCH /orders/:id instead of
// PATCH /orders/:id/status) and gave the app a second, non-idempotent
// write path that could double-submit orders.
//
// All offline queuing MUST go through the SyncEngine, which owns the single
// idempotent outbox. Do NOT reintroduce a competing queue here.
//
// The export is kept as an inert stub only so any accidental import fails
// safe (no network writes, no AsyncStorage queue) instead of at module load.

export function useOfflineQueue() {
  return {
    isOnline: true,
    // No-op: routes all writes to nowhere. Use the SyncEngine instead.
    addToQueue: async () => null,
    queueLength: 0,
  };
}
