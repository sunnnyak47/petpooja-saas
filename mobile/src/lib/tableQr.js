/**
 * tableQr — parse a scanned table QR into { outletId, tableId }.
 *
 * Pure + unit-tested (no React / camera / RN imports). Handles BOTH QR formats
 * that exist in the wild:
 *
 *   1. Legacy deep-link scheme:  petpooja://table/<outletId>/<tableId>
 *   2. The web ordering URL this very app + the web dashboard generate:
 *      https://…/#/order?outlet=<outletId>&table=<tableId>
 *      (hash-routed, so the query lives AFTER the `#`).
 *
 * Before this, the scanner only recognised the legacy scheme — so scanning a
 * table QR printed by MS-RM itself was rejected as "not an MS-RM code". Both
 * are now accepted. Returns null for anything that isn't a table QR.
 */

/**
 * @param {string} raw - the decoded QR payload
 * @returns {{ outletId: string, tableId: string } | null}
 */
export function parseTableQr(raw) {
  const data = String(raw || '').trim();
  if (!data) return null;

  // 1) Legacy scheme: petpooja://table/<outletId>/<tableId>
  const legacy = data.match(/^petpooja:\/\/table\/([^/]+)\/([^/?#]+)/i);
  if (legacy) {
    return { outletId: safeDecode(legacy[1]), tableId: safeDecode(legacy[2]) };
  }

  // 2) Ordering URL — the params can sit after a `?` or after the `#/order?`
  //    hash, so pull them out of the raw string wherever they appear.
  const outlet = data.match(/[?&]outlet=([^&#]+)/i);
  const table = data.match(/[?&]table=([^&#]+)/i);
  if (outlet && table) {
    const outletId = safeDecode(outlet[1]);
    const tableId = safeDecode(table[1]);
    if (outletId && tableId) return { outletId, tableId };
  }

  return null;
}

function safeDecode(v) {
  try {
    return decodeURIComponent(String(v).trim());
  } catch (_) {
    return String(v).trim();
  }
}
