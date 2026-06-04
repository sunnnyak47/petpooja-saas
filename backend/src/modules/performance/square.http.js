/**
 * @fileoverview Shared Square REST helpers used by the Phase-2 analytics
 * fetcher modules (catalog, inventory, order economics, staff, RFM, cash
 * drawer). Keeping these in one place lets each fetcher be a self-contained,
 * single-responsibility file that simply imports what it needs.
 *
 * All Square money amounts arrive in CENTS; use toDollars() to normalise.
 * @module modules/performance/square.http
 */

// Pagination safety cap — never loop more than this many pages per call.
const MAX_PAGES = 25;

/** Standard Square auth/version headers from an API context. */
function sqHeaders(ctx) {
  return {
    Authorization: `Bearer ${ctx.accessToken}`,
    'Square-Version': ctx.version,
    'Content-Type': 'application/json',
  };
}

/** GET a Square REST path → parsed JSON. Throws on a non-2xx response. */
async function sqGet(ctx, path) {
  const res = await fetch(`${ctx.apiBase}${path}`, { method: 'GET', headers: sqHeaders(ctx) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Square GET ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** POST a Square REST path with a JSON body → parsed JSON. Throws on non-2xx. */
async function sqPost(ctx, path, body) {
  const res = await fetch(`${ctx.apiBase}${path}`, {
    method: 'POST',
    headers: sqHeaders(ctx),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Square POST ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Cents (integer) → dollars (number, 2 dp). */
function toDollars(cents) {
  return Math.round((Number(cents) || 0)) / 100;
}

/** UTC `YYYY-MM-DD` for an ISO/Date-ish value. Returns null if unparseable. */
function dateKey(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

module.exports = { MAX_PAGES, sqHeaders, sqGet, sqPost, toDollars, dateKey };
