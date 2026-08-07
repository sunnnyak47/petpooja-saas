/**
 * @fileoverview Assistant WRITE actions (Phase 2 — agentic, preview→approve→run).
 *
 * Safety model — the assistant never mutates on the first turn:
 *   1. detectAction() recognises a write intent from the question.
 *   2. The user must hold the SAME RBAC permission the equivalent UI action needs.
 *   3. extract() parses params and resolves entities (item/table) via the real
 *      read services; if it's ambiguous it returns a clarification instead of guessing.
 *   4. plan() builds a human-readable PREVIEW (no mutation) and we mint a short-lived
 *      signed token binding {action, params, outletId, userId}.
 *   5. Only when the user confirms (POST /assistant/act with that token) does
 *      runAction() verify the token + re-check the permission + outlet/user match,
 *      then call the EXISTING validated, tenant-scoped service and audit-log it.
 *
 * So a mutation is impossible without an explicit, permission-checked confirmation
 * of the exact previewed change. Every action goes through a service the UI already
 * uses — the assistant gains no new powers.
 * @module modules/assistant/assistant.actions
 */

const jwt = require('jsonwebtoken');
const appConfig = require('../../config/app');
const logger = require('../../config/logger');
const { getDbClient } = require('../../config/database');

const menu = require('../menu/menu.service');
const customer = require('../customers/customer.service');
const tableSvc = require('../orders/table.service');
const inventory = require('../inventory/inventory.service');
const procurement = require('../inventory/procurement.service');
const reservations = require('../reservations/reservations.service');
const orderSvc = require('../orders/order.service');
const staff = require('../staff/staff.service');
const pricing = require('../pricing/pricing.service');
const discounts = require('../discounts/discount.service');
// Shared, pure tax/pricing engine — the SAME helpers the order controller's
// apply-discount path uses. We reuse them (not reimplement the math) so an
// assistant-applied discount recomputes GST / round-off / grand-total
// byte-identically to POST /orders/:id/apply-discount. There is no service-level
// applyDiscount() to call (the logic lives in order.controller), so execute()
// mirrors that controller path exactly against the same tenant-scoped models.
const { resolveOutletTaxConfig } = require('../../utils/outlet');
const { calculateItemTax } = require('../orders/tax.service');
const { computeGrandTotal } = require('../orders/pricing.service');
const { round2 } = require('../../utils/money');

// ── permission (mirrors rbac.middleware.hasPermission) ───────────────────────
function userHasPermission(userCtx, permKey) {
  if (!permKey) return true;
  if (userCtx.role === 'super_admin' || userCtx.role === 'owner') return true;
  return Array.isArray(userCtx.permissions) && userCtx.permissions.includes(permKey);
}

// ── entity resolvers (read-only) ─────────────────────────────────────────────
/** Resolve a menu item by (fuzzy) name → array of {id,name,base_price,is_available}. */
async function resolveMenuItem(outletId, name) {
  const q = String(name || '').toLowerCase().trim();
  if (!q) return [];
  const r = await menu.listMenuItems(outletId, { limit: 2000, is_active: 'true' });
  const items = (r && r.items) || [];
  const norm = (s) => String(s || '').toLowerCase().trim();
  let m = items.filter((i) => norm(i.name) === q);
  if (!m.length) m = items.filter((i) => norm(i.name).startsWith(q));
  if (!m.length) m = items.filter((i) => norm(i.name).includes(q));
  return m;
}

/** Resolve a table by its number → array of {id, table_number, status}. */
async function resolveTable(outletId, number) {
  const tables = await tableSvc.listTables(outletId, {});
  const list = Array.isArray(tables) ? tables : [];
  return list.filter((t) => String(t.table_number) === String(number).trim());
}

// ── extraction helpers ───────────────────────────────────────────────────────
function extractPrice(q) {
  const to = q.match(/(?:to|=|at|:|be)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (to) return Number(to[1]);
  const any = q.match(/\$\s*(\d+(?:\.\d{1,2})?)|\b(\d+(?:\.\d{1,2})?)\s*(?:dollars|rupees|rs|aud|inr)?\b/i);
  return any ? Number(any[1] || any[2]) : null;
}
/**
 * Work out a NEW price from the question + the item's CURRENT price. Handles
 * absolute ("to 8.50"), percentage ("by 10%", "up 10%", "down 5%") and flat
 * relative ("up by $2", "increase by 3") changes. Returns null if unspecified.
 */
function computeNewPrice(q, oldPrice) {
  const s = String(q || '').toLowerCase();
  const down = /\b(down|decrease|decreased|lower|lowered|reduce|reduced|less|cut|drop|dropped|discount|cheaper)\b/.test(s);
  const pct = s.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per\s?cent|pct)/);
  if (pct) { const p = Number(pct[1]); return down ? oldPrice * (1 - p / 100) : oldPrice * (1 + p / 100); }
  const toAbs = s.match(/\b(?:to|at|=|be|@)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (toAbs) return Number(toAbs[1]);
  const up = /\b(up|increase|increased|raise|raised|add|added|more|higher|bump|bumped|hike|hiked|by)\b/.test(s);
  if (up || down) {
    const amt = s.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    if (amt) return down ? oldPrice - Number(amt[1]) : oldPrice + Number(amt[1]);
  }
  return extractPrice(q);
}
function extractPhone(q) {
  const m = String(q).replace(/[^\d+]/g, ' ').match(/(\+?\d[\d ]{7,14}\d)/);
  return m ? m[1].replace(/\s/g, '') : null;
}
function extractTableNumber(q) {
  const m = q.match(/table\s*#?\s*([a-z]?\d+[a-z]?)/i) || q.match(/\b(?:no\.?|number)\s*([a-z]?\d+)/i);
  return m ? m[1] : null;
}
/** Parse a discount from NL → { discount_type:'percentage'|'flat', discount_value }, or null. */
function extractDiscount(q) {
  const s = String(q || '');
  // Percentage wins if a % / "percent" is present ("10% off", "10 percent").
  let m = s.match(/(\d+(?:\.\d+)?)\s*%/) || s.match(/(\d+(?:\.\d+)?)\s*per\s?cent/i);
  if (m) return { discount_type: 'percentage', discount_value: Number(m[1]) };
  // Flat amount: "$5", "5 dollars/rupees/off", "flat 5", "by 5", "of 5". A bare
  // trailing number with NO unit word is NOT treated as money (so "order 42" and
  // "for 4 people" are never mistaken for a $42 / $4 discount).
  m = s.match(/\$\s*(\d+(?:\.\d{1,2})?)/)
    || s.match(/\b(?:flat|by|of|off)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/i)
    || s.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:dollars?|rupees?|rs|aud|inr|off|flat)\b/i);
  if (m) return { discount_type: 'flat', discount_value: Number(m[1]) };
  return null;
}
/** Pull an order-number hint ("order 42", "bill #A12", "#7") — must contain a digit. */
function extractOrderNumber(q) {
  const s = String(q || '');
  let m = s.match(/\b(?:order|bill|invoice|ticket|tab|check)\s*(?:no\.?|number)?\s*#?\s*([a-z0-9][a-z0-9-]*)/i);
  if (m && /\d/.test(m[1])) return m[1];
  m = s.match(/#\s*([a-z0-9-]*\d[a-z0-9-]*)/i);
  return m ? m[1] : null;
}
/** Optional discount reason — prefer a quoted phrase, then "reason:/because". */
function extractReason(q) {
  const quoted = String(q).match(/["“'](.+?)["”']/);
  if (quoted) return quoted[1].trim().slice(0, 200);
  const m = String(q).match(/\b(?:reason(?:\s*:)?|because|as a)\s+(.+)$/i);
  return m ? m[1].trim().replace(/^["']|["']$/g, '').slice(0, 200) : null;
}
// Statuses on which a discount may still be applied (mirrors the apply-discount controller).
const DISCOUNTABLE_STATUSES = ['created', 'confirmed', 'held'];
/** Strip command/stop words to isolate an item name. */
function isolateName(q, extraStop = []) {
  const STOP = new Set([
    '86', 'eighty-six', 'un-86', 'un86', 'mark', 'make', 'set', 'turn', 'on', 'off', 'the', 'a', 'an',
    'as', 'item', 'dish', 'please', 'available', 'unavailable', 'sold', 'out', 'disable', 'enable',
    'stop', 'selling', 'sell', 'back', 'to', 'now', 'change', 'update', 'adjust', 'price', 'of', 'for',
    'cost', 'new', 'again', 'and', 'is', 'be', 'my', 'our', 'this', 'that', 'it', 'from', 'raise', 'lower',
    ...extraStop,
  ]);
  return String(q)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+(\.\d+)?$/.test(w))
    .join(' ')
    .trim();
}
// Extra stop words for isolating an item name out of a PRICE command ("increase
// the <item> price by 10%") — verbs/qualifiers that surround the name. Shared by
// adjust_price.extract and the multi-turn history scan so both isolate names the
// same way.
const PRICE_STOPWORDS = ['increase', 'increased', 'decrease', 'decreased', 'reduce', 'reduced', 'reprice', 'revise', 'revised', 'by', 'up', 'down', 'percent', 'per', 'cent', 'pct', 'pc', 'add', 'more', 'less', 'bump', 'hike', 'higher', 'cheaper', 'discount', 'put', 'make', 'bring', 'move'];

// ── staff (new hire) helpers ─────────────────────────────────────────────────
// Words that name a ROLE, not a person — so "add a waiter Jane" / "as manager"
// never get mistaken for the staff member's name.
const STAFF_ROLE_WORDS = new Set(['manager', 'cashier', 'waiter', 'server', 'chef', 'cook', 'kitchen', 'delivery', 'rider', 'captain', 'host', 'staff', 'employee', 'member', 'team']);
// Normalize a spoken role to one the staff service maps to a seeded role
// (manager/cashier/waiter/chef/delivery/captain). Unknown → null (service defaults cashier).
const STAFF_ROLE_SYNONYMS = { manager: 'manager', cashier: 'cashier', waiter: 'waiter', server: 'waiter', chef: 'chef', cook: 'chef', kitchen: 'chef', delivery: 'delivery', rider: 'delivery', captain: 'captain', host: 'cashier' };

/** Pull a staff role out of a hire request → a service-friendly role, or null. */
function extractStaffRole(q) {
  const m = String(q).toLowerCase().match(/\b(manager|cashier|waiter|server|chef|cook|kitchen|delivery|rider|captain|host)\b/);
  return m ? (STAFF_ROLE_SYNONYMS[m[1]] || null) : null;
}

/**
 * Isolate the new staff member's name from a hire request. Unlike isolateName it
 * PRESERVES hyphens/digits (e.g. "test-1") and separates the name from a role
 * ("Jane as manager" → "Jane"). Prefers an explicit "named/called X"; then an
 * "as X" that isn't a role; then the token(s) right after staff/employee/member.
 * Returns the trimmed name, or null when none can be found.
 */
function extractStaffName(q) {
  const raw = String(q || '').trim();
  const CAP = "([A-Za-z][\\w.'-]*(?:\\s+[A-Za-z0-9][\\w.'-]*){0,3})";
  let m = raw.match(new RegExp(`\\b(?:named|called)\\s+${CAP}`, 'i'));
  if (!m) {
    const asM = raw.match(new RegExp(`\\bas\\s+(?:an?\\s+)?${CAP}`, 'i'));
    if (asM && !STAFF_ROLE_WORDS.has(asM[1].toLowerCase().split(/\s+/)[0])) m = asM;
  }
  if (!m) m = raw.match(new RegExp(`\\b(?:staff|employee|team\\s*member|member|user|waiter|cashier|manager|chef|cook|server|host|rider)\\s+(?:member\\s+)?${CAP}`, 'i'));
  if (!m) return null;
  // Cut the capture off at a contact/role boundary and drop trailing phone digits,
  // so "Priya Sharma phone 0412…" → "Priya Sharma" and "Jane as manager" → "Jane".
  let cand = m[1]
    .replace(/\s+(?:phone|email|number|mobile|contact|ph|mob|as|role|with|and)\b[\s\S]*$/i, '')
    .replace(/\s+\d[\d\s()+-]*$/, '');
  const TAIL = /^(name|named|role|as|with|the|a|an|and|phone|email|number|mobile|please|manager|cashier|waiter|server|chef|cook|kitchen|delivery|rider|captain|host|staff|employee|member|team)$/i;
  const toks = cand.trim().split(/\s+/);
  while (toks.length && TAIL.test(toks[toks.length - 1])) toks.pop();
  while (toks.length && TAIL.test(toks[0])) toks.shift();
  const name = toks.join(' ').trim();
  return name || null;
}

// ── reservation date/time + campaign helpers ────────────────────────────────
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parse a reservation date from NL → YMD, or null. `now` injectable for tests. */
function parseReservationDate(q, now = new Date()) {
  const s = String(q).toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  if (/\btoday\b|\btonight\b/.test(s)) return ymd(today);
  if (/\btomorrow\b/.test(s)) return ymd(at(1));
  const dn = DAYS.findIndex((d) => new RegExp(`\\b(next\\s+)?${d}\\b`).test(s));
  if (dn >= 0) {
    let add = (dn - today.getDay() + 7) % 7;
    if (add === 0 || /\bnext\b/.test(s)) add = add === 0 ? 7 : add;
    return ymd(at(add));
  }
  let m = s.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/);
  if (m) { const mo = MON3.findIndex((x) => m[2].startsWith(x)); if (mo >= 0) return ymd(new Date(now.getFullYear(), mo, parseInt(m[1], 10))); }
  m = s.match(/\b([a-z]{3,9})\s+(\d{1,2})\b/);
  if (m) { const mo = MON3.findIndex((x) => m[1].startsWith(x)); if (mo >= 0) return ymd(new Date(now.getFullYear(), mo, parseInt(m[2], 10))); }
  m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Parse a time → 'HH:MM' (24h), or null. */
function parseReservationTime(q) {
  let m = q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) { let h = parseInt(m[1], 10) % 12; if (/pm/i.test(m[3])) h += 12; return `${String(h).padStart(2, '0')}:${m[2] || '00'}`; }
  m = q.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : null;
}

function extractPartySize(q) {
  const m = q.match(/\b(?:for|party of|table for|group of|of)\s+(\d{1,2})\b/i) || q.match(/\b(\d{1,2})\s*(?:people|guests|pax|persons?|covers?)\b/i);
  return m ? parseInt(m[1], 10) : null;
}
function detectChannel(q) { if (/whatsapp/i.test(q)) return 'whatsapp'; if (/\bemail\b/i.test(q)) return 'email'; return 'sms'; }
function detectSegment(q) {
  if (/\bvip/i.test(q)) return 'vip';
  if (/\bregular/i.test(q)) return 'regular';
  if (/\bnew\b/i.test(q)) return 'new';
  if (/\blapsed|inactive|win.?back/i.test(q)) return 'lapsed';
  return 'all';
}
function extractMessage(q) {
  let m = q.match(/["“'](.+?)["”']/);
  if (m) return m[1].trim();
  m = q.match(/\b(?:saying|message|that says|tell them|text[:]?)\s+(.+)$/i);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

/** Count the customers a campaign to `segment` would reach (mirrors createCampaign's where). */
async function countCampaignRecipients(outletId, segment) {
  const where = { is_deleted: false };
  if (outletId) where.orders = { some: { outlet_id: outletId, is_deleted: false } };
  if (segment && segment !== 'all') where.segment = segment;
  try { return await getDbClient().customer.count({ where }); } catch (_) { return 0; }
}

/**
 * Resolve WHICH open order a discount applies to — never guesses.
 *   • explicit "order #N" / "bill #N"  → match that running order (else clarify)
 *   • "table N"                        → the open order on that table (else clarify)
 *   • otherwise                        → the SINGLE open order, or clarify if 0 / many
 * @returns {Promise<{order:object} | {error:string}>}
 */
async function resolveDiscountOrder(ctx, q) {
  let candidates = [];
  try {
    const r = await orderSvc.listOrders(ctx.outletId, { running: 'true', limit: 200 });
    candidates = (r && r.orders) || [];
  } catch (_) { candidates = []; }

  const orderNo = extractOrderNumber(q);
  if (orderNo) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = norm(orderNo);
    let m = candidates.filter((o) => norm(o.order_number) === key);
    if (!m.length) m = candidates.filter((o) => norm(o.order_number).endsWith(key) && key.length >= 2);
    if (!m.length) return { error: `I couldn't find an open order matching "${orderNo}". Check the order number and try again.` };
    if (m.length > 1) return { error: `"${orderNo}" matched ${m.length} open orders. Tell me the exact order number.` };
    if (!DISCOUNTABLE_STATUSES.includes(m[0].status)) return { error: `Order ${m[0].order_number} is '${m[0].status}' — a discount can only be applied before it's billed or paid.` };
    return { order: m[0] };
  }

  if (/\btable\b/i.test(q)) {
    const tnum = extractTableNumber(q);
    if (tnum) {
      const tbl = await resolveTable(ctx.outletId, tnum);
      if (!tbl.length) return { error: `I couldn't find table ${tnum}.` };
      const m = candidates.filter((o) => o.table_id === tbl[0].id && DISCOUNTABLE_STATUSES.includes(o.status));
      if (!m.length) return { error: `There's no open order on table ${tnum} to discount.` };
      if (m.length > 1) return { error: `Table ${tnum} has ${m.length} open orders — tell me the order number.` };
      return { order: m[0] };
    }
  }

  const open = candidates.filter((o) => DISCOUNTABLE_STATUSES.includes(o.status));
  if (!open.length) return { error: 'There is no open order to apply a discount to right now.' };
  if (open.length > 1) {
    const few = open.slice(0, 4).map((o) => `#${o.order_number}`).join(', ');
    return { error: `There are ${open.length} open orders (${few}). Which one? Tell me the order number or table.` };
  }
  return { order: open[0] };
}

/**
 * Recompute an order's tax / round-off / grand-total on a discounted base — a
 * faithful copy of order.controller.recomputeOrderWithDiscount (which is not
 * exported) using the identical shared helpers, so an assistant discount produces
 * byte-identical numbers to the UI's apply-discount endpoint. Reads only.
 */
async function computeDiscountedTotals(tx, orderId, outlet, requestedDiscount, loyaltyDiscount) {
  const taxConfig = resolveOutletTaxConfig(outlet);
  const items = await tx.orderItem.findMany({ where: { order_id: orderId, is_deleted: false } });

  let subtotalPaise = 0;
  for (const oi of items) subtotalPaise += Math.round(Number(oi.item_total) * 100);
  const subtotal = subtotalPaise / 100;

  const discount = Math.min(Math.max(Number(requestedDiscount) || 0, 0), subtotal);
  const loyalty = Math.min(Math.max(Number(loyaltyDiscount) || 0, 0), Math.max(subtotal - discount, 0));
  const reduction = discount + loyalty;
  const factor = subtotal > 0 ? Math.max(subtotal - reduction, 0) / subtotal : 0;

  let cgstPaise = 0; let sgstPaise = 0; let igstPaise = 0; let totalTaxPaise = 0;
  for (const oi of items) {
    const qty = Number(oi.quantity) || 1;
    const gstRate = Number(oi.gst_rate) || taxConfig.default_gst_rate || 0;
    const discountedUnitBase = (Number(oi.item_total) * factor) / qty;
    const tax = calculateItemTax(
      { base_price: discountedUnitBase, quantity: qty, gst_rate: gstRate, is_inclusive: taxConfig.gst_inclusive },
      { country_code: taxConfig.country_code, state: taxConfig.state },
    );
    cgstPaise += Math.round(tax.cgst * 100);
    sgstPaise += Math.round(tax.sgst * 100);
    igstPaise += Math.round(tax.igst * 100);
    totalTaxPaise += Math.round(tax.total_tax * 100);
  }

  const totalTax = totalTaxPaise / 100;
  const discountedSubtotal = round2(Math.max(subtotal - reduction, 0));
  const totalAmount = taxConfig.gst_inclusive ? discountedSubtotal : round2(discountedSubtotal + totalTax);
  const { grandTotal, roundOff } = computeGrandTotal(totalAmount, taxConfig.country_code);

  return {
    subtotal,
    discount_amount: round2(discount),
    cgst: cgstPaise / 100,
    sgst: sgstPaise / 100,
    igst: igstPaise / 100,
    total_tax: totalTax,
    total_amount: totalAmount,
    grand_total: grandTotal,
    round_off: roundOff,
  };
}

// ── inventory (stock / wastage / PO) helpers ─────────────────────────────────
// Unit vocabulary shared by the quantity parser and the name isolator. Longer,
// multi-char units come first so the regex prefers "grams" over a bare "g", etc.
const INV_UNIT = 'kgs?|kilograms?|kilos?|grams?|gms?|g|litres?|liters?|ltrs?|ltr|mls?|l|pcs?|pieces?|packs?|packets?|pkts?|units?|nos?|dozen|trays?|boxes|box|bottles?|cans?|crates?|bunch(?:es)?';
// Words that are NOT part of an inventory item's name (verbs/qualifiers around it).
const INV_BASE_STOP = new Set([
  'a', 'an', 'the', 'of', 'to', 'by', 'into', 'from', 'for', 'in', 'on', 'off', 'and', 'some', 'it',
  'is', 'was', 'be', 'that', 'this', 'there', 'we', 'i', 'our', 'my', 'please', 'now', 'up', 'down',
  'level', 'levels', 'quantity', 'qty', 'stock', 'inventory', 'item', 'items', 'material', 'raw',
  'ingredient', 'count', 'log', 'logged', 'logging', 'record', 'recorded', 'mark', 'marked', 'make',
  'set', 'add', 'added', 'adding', 'adjust', 'adjusted', 'increase', 'increased', 'decrease',
  'decreased', 'reduce', 'reduced', 'remove', 'removed', 'deduct', 'subtract', 'update', 'updated',
  'top', 'restock', 'received', 'receive', 'threw', 'throw', 'thrown', 'throwing', 'chuck', 'chucked',
  'bin', 'binned', 'dump', 'dumped', 'trash', 'trashed', 'wrote', 'write', 'wasted', 'wasting',
  'wastage', 'waste', 'spoiled', 'spoilt', 'spoil', 'expired', 'damaged', 'broken', 'burnt', 'burned',
  'spill', 'spillage', 'rotten', 'stale', 'contaminated', 'because', 'reason', 'new', 'away', 'out',
  'order', 'purchase', 'po', 'grn', 'delivered', 'deliver', 'create', 'created', 'correct',
]);
// Unit tokens that survive after number stripping ("2 pieces" → "pieces") — drop them too.
const INV_UNIT_WORDS = new Set([
  'kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos', 'g', 'gm', 'gms', 'gram', 'grams', 'l', 'ltr',
  'ltrs', 'litre', 'liter', 'litres', 'liters', 'ml', 'mls', 'pc', 'pcs', 'piece', 'pieces', 'pack',
  'packs', 'packet', 'packets', 'pkt', 'pkts', 'unit', 'units', 'no', 'nos', 'dozen', 'tray', 'trays',
  'box', 'boxes', 'bottle', 'bottles', 'can', 'cans', 'crate', 'crates', 'bunch', 'bunches',
]);

/**
 * Parse a quantity (+ optional unit) from NL. Normalizes g→kg and ml→l (÷1000)
 * since inventory items are usually stored in kg/l; the numeric value is what the
 * service records, and the item's own `unit` is used for display (the preview is
 * the guardrail — a mismatched unit shows visibly wrong before the owner confirms).
 */
function invExtractQty(q) {
  const s = String(q || '');
  const withUnit = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${INV_UNIT})\\b`, 'i'));
  let value = null;
  let rawUnit = null;
  if (withUnit) {
    value = Number(withUnit[1]);
    rawUnit = String(withUnit[2] || '').toLowerCase();
  } else {
    const bare = s.match(/(\d+(?:\.\d+)?)/);
    if (bare) value = Number(bare[1]);
  }
  if (value == null || Number.isNaN(value) || !(value >= 0)) return null;
  let unit = null;
  if (rawUnit) {
    if (/^(g|gm|gms|gram|grams)$/.test(rawUnit)) { value /= 1000; unit = 'kg'; }
    else if (/^(ml|mls)$/.test(rawUnit)) { value /= 1000; unit = 'l'; }
    else if (/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(rawUnit)) unit = 'kg';
    else if (/^(l|ltr|ltrs|litre|liter|litres|liters)$/.test(rawUnit)) unit = 'l';
    else if (/^(pc|pcs|piece|pieces)$/.test(rawUnit)) unit = 'pcs';
    else unit = rawUnit;
  }
  return { quantity: round2(value), unit };
}

/** Strip qty/unit/PO tokens + stop words to isolate an inventory item's name. */
function invIsolateItemName(q, extraStop = []) {
  const extra = new Set(extraStop.map((w) => String(w).toLowerCase()));
  return String(q || '')
    .toLowerCase()
    .replace(new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*(?:${INV_UNIT})\\b`, 'ig'), ' ')
    .replace(/\bpo[-\s]?[a-z0-9-]*\d[a-z0-9-]*/ig, ' ')
    .replace(/#\s*[a-z0-9-]*\d[a-z0-9-]*/ig, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w
      && !INV_BASE_STOP.has(w)
      && !INV_UNIT_WORDS.has(w)
      && !extra.has(w)
      && !/^\d+(\.\d+)?$/.test(w))
    .join(' ')
    .trim();
}

/** Pull a wastage reason from NL → a short phrase (caller defaults when null). */
function invExtractWastageReason(q) {
  const s = String(q || '');
  const m = s.match(/\b(expired|out of date|spoil(?:ed|t)?|rotten|gone off|damaged|broken|burnt|burned|over-?cook(?:ed)?|over-?portion(?:ed)?|spill(?:age|ed|t)?|contaminated|mould(?:y)?|stale|dropped|returned|theft|infested)\b/i);
  if (m) return m[1].toLowerCase().replace(/\s+/g, ' ').trim();
  const quoted = s.match(/["'](.+?)["']/);
  if (quoted) return quoted[1].trim().slice(0, 200);
  const because = s.match(/\b(?:because|reason(?:\s*:)?|due to)\s+(.+)$/i);
  return because ? because[1].trim().replace(/^["']|["']$/g, '').slice(0, 200) : null;
}

/** set | add | reduce — which kind of stock adjustment the phrasing asks for. */
function invExtractStockMode(q) {
  const s = String(q || '').toLowerCase();
  if (/\b(reduce|reduced|decrease|decreased|remove|removed|deduct|subtract|minus|lower|lowered|drop|dropped|used|consume|consumed|take\s+(?:out|off|away))\b/.test(s)) return 'reduce';
  if (/\b(add|added|increase|increased|top\s*up|topped\s*up|restock|restocked|plus|more)\b/.test(s)) return 'add';
  return 'set';
}

/** Pull a PO identifier hint from NL ("PO-000123", "PO #123", "order 45", "#7"). */
function invExtractPoHint(q) {
  const s = String(q || '');
  let m = s.match(/\bpo[-\s]?([a-z0-9][a-z0-9-]*)/i);
  if (m && /\d/.test(m[0])) return m[0].trim();
  m = s.match(/\b(?:purchase order|order|bill|grn)\s*(?:no\.?|number|#)?\s*#?\s*([a-z0-9][a-z0-9-]*)/i);
  if (m && /\d/.test(m[1])) return m[1];
  m = s.match(/#\s*([a-z0-9-]*\d[a-z0-9-]*)/i);
  if (m) return m[1];
  m = s.match(/\b(\d{2,})\b/);
  return m ? m[1] : null;
}

/** Item name for a create request ("add inventory item Paneer, unit kg" → "Paneer"). */
function invExtractNewItemName(q) {
  const s = String(q || '');
  const BOUND = '(?=\\s*(?:,|;|\\bunit\\b|\\bunits\\b|\\bcategory\\b|\\bsku\\b|\\bcost(?:s|ing)?\\b|\\bprice\\b|\\brate\\b|\\bwith\\b|\\bat\\b|\\bin\\b|\\bof\\b|$))';
  const m = s.match(new RegExp(`\\b(?:item|material|ingredient|product|called|named)\\s+([A-Za-z][A-Za-z0-9 '&-]*?)${BOUND}`, 'i'));
  let name = m ? m[1].trim() : '';
  if (!name) name = invIsolateItemName(s, ['product']);
  name = name.replace(/\s+/g, ' ').trim();
  return name || null;
}

/** The item's canonical unit for a create request ("unit kg", "measured in l"). */
function invExtractUnit(q) {
  const s = String(q || '');
  const m = s.match(new RegExp(`\\bunits?\\s+(?:of\\s+|is\\s+|in\\s+|:\\s*)?(${INV_UNIT})\\b`, 'i'))
    || s.match(new RegExp(`\\b(?:measured in|in)\\s+(${INV_UNIT})\\b`, 'i'));
  if (!m) return null;
  const u = m[1].toLowerCase();
  if (/^(g|gm|gms|gram|grams)$/.test(u)) return 'g';
  if (/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(u)) return 'kg';
  if (/^(l|ltr|ltrs|litre|liter|litres|liters)$/.test(u)) return 'l';
  if (/^(ml|mls)$/.test(u)) return 'ml';
  if (/^(pc|pcs|piece|pieces)$/.test(u)) return 'pcs';
  return u;
}

/** Optional category for a create request ("category Dairy"). */
function invExtractCategory(q) {
  const m = String(q || '').match(/\bcategor(?:y|ies)\s+(?:of\s+|is\s+|:\s*)?([A-Za-z][A-Za-z &]*?)(?=\s*(?:,|;|\bunit\b|\bsku\b|\bcost\b|\bprice\b|\brate\b|$))/i);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

/** Optional cost/unit for a create request ("cost 320", "@ $5"). Defaults to 0. */
function invExtractCostPerUnit(q) {
  const s = String(q || '');
  const m = s.match(/\b(?:cost|costs|price|rate|@)\s*(?:of\s+|is\s+|:\s*)?\$?\s*(\d+(?:\.\d+)?)/i)
    || s.match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? round2(Number(m[1])) : 0;
}

/** Resolve an inventory item by (fuzzy) name → matches ({id,name,unit,…}). */
async function invResolveInventoryItem(outletId, name) {
  const q = String(name || '').toLowerCase().trim();
  if (!q) return [];
  const r = await inventory.listInventoryItems(outletId, { search: q, limit: 500, page: 1 });
  const items = (r && r.items) || [];
  const norm = (s) => String(s || '').toLowerCase().trim();
  let m = items.filter((i) => norm(i.name) === q);
  if (!m.length) m = items.filter((i) => norm(i.name).startsWith(q));
  if (!m.length) m = items.filter((i) => norm(i.name).includes(q));
  return m;
}

/** Resolve a PO by number hint → matches ({id,po_number,status,…}). receivePurchaseOrder
 *  needs the UUID but owners say the po_number, and listPurchaseOrders has no number
 *  filter, so page a batch and match on an alnum-normalized key (exact→endsWith→includes). */
async function invResolvePurchaseOrder(outletId, hint) {
  const key = String(hint || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!key) return [];
  const r = await procurement.listPurchaseOrders(outletId, { limit: 500, page: 1 });
  const items = (r && r.items) || [];
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let m = items.filter((o) => norm(o.po_number) === key);
  if (!m.length && key.length >= 2) m = items.filter((o) => norm(o.po_number).endsWith(key));
  if (!m.length && key.length >= 2) m = items.filter((o) => norm(o.po_number).includes(key));
  return m;
}

// ── menu-setup helpers ───────────────────────────────────────────────────────
// Command/filler words to strip when isolating a menu-setup name (layered on top
// of isolateName's own STOP set).
const MENU_STOP = [
  'add', 'added', 'create', 'created', 'new', 'make', 'made', 'set', 'setup', 'up',
  'menu', 'item', 'items', 'dish', 'dishes', 'category', 'categories', 'combo', 'combos',
  'called', 'named', 'under', 'into', 'in', 'to', 'please', 'priced', 'price', 'for',
];

/** All non-deleted categories for an outlet, ordered by display_order (real service). */
async function menuListCategories(outletId) {
  const r = await menu.listCategories(outletId, {});
  return (r && r.categories) || [];
}

/** Resolve a category by (fuzzy) name → matches ({id,name,…}); exact→prefix→substring. */
async function menuResolveCategory(outletId, name) {
  const q = String(name || '').toLowerCase().trim();
  if (!q) return [];
  const cats = await menuListCategories(outletId);
  const norm = (s) => String(s || '').toLowerCase().trim();
  let m = cats.filter((c) => norm(c.name) === q);
  if (!m.length) m = cats.filter((c) => norm(c.name).startsWith(q));
  if (!m.length) m = cats.filter((c) => norm(c.name).includes(q));
  return m;
}

/** Split a "new item" phrase into { categoryName, remainder }, peeling a trailing
 *  "in/under/into <Category>" clause so the leftover yields the item name + price. */
function menuParseItemCategory(q) {
  const s = String(q || '');
  const m = s.match(/\b(?:in|under|into)\s+(?:the\s+)?(?:category\s+)?(?:["'“]([^"'”]+)["'”]|([a-z][\w &'/-]*?))(?:\s+category)?\s*$/i);
  if (!m) return { categoryName: null, remainder: s };
  const categoryName = String(m[1] || m[2] || '').trim();
  return { categoryName: categoryName || null, remainder: s.slice(0, m.index) };
}

/** Isolate a menu-setup name — a quoted phrase verbatim (keeps casing), else strip
 *  command words via isolateName and Title-Case. Returns '' when nothing remains. */
function menuExtractName(q, extraStop = []) {
  const quoted = String(q || '').match(/["'“]([^"'”]+)["'”]/);
  if (quoted && quoted[1].trim()) return quoted[1].trim();
  const n = isolateName(q, [...MENU_STOP, ...extraStop]);
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

// ── staff update / attendance / roster helpers ───────────────────────────────
const STF_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const STF_DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const STF_SHIFT_PERIODS = ['breakfast', 'brunch', 'lunch', 'dinner', 'supper', 'morning', 'afternoon', 'evening', 'night', 'opening', 'closing', 'mid', 'split', 'late', 'early', 'day', 'graveyard'];

/** Resolve an existing staff member by (fuzzy) name for THIS outlet → matches (each with .user). */
async function stfResolveStaff(outletId, name) {
  const q = String(name || '').toLowerCase().trim();
  if (!outletId || !q) return [];
  let r;
  try { r = await staff.listStaff(outletId, { limit: 500 }); } catch (_) { r = null; }
  const list = (r && r.staff) || [];
  const nameOf = (sp) => String((sp && sp.user && sp.user.full_name) || '').toLowerCase().trim();
  let m = list.filter((sp) => nameOf(sp) === q);
  if (!m.length) m = list.filter((sp) => nameOf(sp).startsWith(q));
  if (!m.length) m = list.filter((sp) => nameOf(sp).split(/\s+/).includes(q)); // first/last name token
  if (!m.length) m = list.filter((sp) => nameOf(sp).includes(q));
  return m;
}

/** userId out of a resolved StaffProfile (user_id column, or nested user.id). */
function stfUserId(sp) {
  return (sp && (sp.user_id || (sp.user && sp.user.id))) || null;
}

/** Strip leading/trailing command, role and filler words to leave a person name. */
function stfCleanName(cand) {
  const STOP = /^(a|an|the|to|as|is|be|now|please|role|pin|passcode|code|password|manager|cashier|waiter|server|chef|cook|kitchen|delivery|rider|captain|host|staff|employee|member|team|and|set|make|change|update|promote|move|give|assign|reassign|turn|new)$/i;
  const toks = String(cand || '').replace(/['’]s\b/i, '').trim().split(/\s+/).filter((w) => w && !/^\d+$/.test(w));
  while (toks.length && STOP.test(toks[toks.length - 1])) toks.pop();
  while (toks.length && STOP.test(toks[0])) toks.shift();
  const name = toks.join(' ').trim();
  return name || null;
}

/** Isolate the TARGET staff member's name from an update command (possessive or verb-led). */
function stfExtractStaffName(q) {
  const raw = String(q || '').trim();
  let m = raw.match(/\b([a-z][a-z .'’-]*?)['’]s\b/i);
  if (m) { const n = stfCleanName(m[1]); if (n) return n; }
  m = raw.match(/\b(?:make|set|change|update|promote|move|give|assign|reassign)\s+(?:the\s+)?([a-z][\w.'’-]*(?:\s+[a-z][\w.'’-]*){0,2})/i);
  if (m) { const n = stfCleanName(m[1]); if (n) return n; }
  return null;
}

/** Pull a 4–6 digit PIN — preferring digits that follow pin/passcode/code. */
function stfExtractPin(q) {
  const s = String(q || '');
  let m = s.match(/\b(?:pin|passcode|pass\s?code|code)\b\D{0,10}(\d{4,6})\b/i);
  if (m) return m[1];
  m = s.match(/\b(\d{4,6})\b/);
  return m ? m[1] : null;
}

/** Isolate the person named in a clock command ("clock in Priya" → "priya"). */
function stfClockName(q) {
  const name = isolateName(q, [
    'clock', 'clocked', 'clocking', 'punch', 'punched', 'punching', 'in', 'out',
    'for', 'attendance', 'shift', 'time', 'start', 'starting', 'started', 'begin',
    'end', 'ends', 'finish', 'staff', 'member',
  ]);
  return name || null;
}

/** The staff member's currently-open (not clocked-out) attendance log, or null. */
async function stfOpenAttendance(outletId, userId) {
  if (!outletId || !userId) return null;
  try {
    return await getDbClient().attendanceLog.findFirst({
      where: { user_id: userId, outlet_id: outletId, clock_out: null, is_deleted: false },
      orderBy: { clock_in: 'desc' },
    });
  } catch (_) { return null; }
}

/** Parse a shift time range → { start:'HH:MM', end:'HH:MM' } (24h), or null. */
function stfParseTimeRange(q) {
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until|til|till|thru|through)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const m = String(q || '').match(re);
  if (!m) return null;
  const h1 = parseInt(m[1], 10); const min1 = m[2] ? parseInt(m[2], 10) : 0; let mer1 = m[3] ? m[3].toLowerCase() : null;
  const h2 = parseInt(m[4], 10); const min2 = m[5] ? parseInt(m[5], 10) : 0; let mer2 = m[6] ? m[6].toLowerCase() : null;
  if (!mer1 && mer2) mer1 = mer2;
  if (!mer2 && mer1) mer2 = mer1;
  const to24 = (h, mer) => (mer === 'pm' ? (h % 12) + 12 : mer === 'am' ? h % 12 : h);
  const H1 = to24(h1, mer1); const H2 = to24(h2, mer2);
  if (!(H1 >= 0 && H1 <= 23) || !(H2 >= 0 && H2 <= 23) || min1 > 59 || min2 > 59) return null;
  const fmt = (H, M) => `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
  return { start: fmt(H1, min1), end: fmt(H2, min2) };
}

/** Build a human shift name from a day + period ("Friday dinner" → "Friday Dinner"). */
function stfShiftName(q) {
  const s = String(q || '').toLowerCase();
  let day = STF_DAYS.find((d) => new RegExp(`\\b${d}\\b`).test(s));
  if (!day) { const ab = s.match(/\b(sun|mon|tue|wed|thu|fri|sat)\b/); if (ab) day = STF_DAYS[STF_DAY_ABBR.indexOf(ab[1])]; }
  const period = STF_SHIFT_PERIODS.find((p) => new RegExp(`\\b${p}\\b`).test(s));
  const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '');
  const name = [cap(day), cap(period)].filter(Boolean).join(' ').trim();
  return name || null;
}

// ── promotions & pricing helpers ─────────────────────────────────────────────
const PROMO_DAY_MATCHERS = [
  ['sun', /\bsun(?:day)?s?\b/],
  ['mon', /\bmon(?:day)?s?\b/],
  ['tue', /\btue(?:s|sday)?s?\b/],
  ['wed', /\bwed(?:nesday)?s?\b/],
  ['thu', /\bthu(?:r|rs|rsday)?s?\b/],
  ['fri', /\bfri(?:day)?s?\b/],
  ['sat', /\bsat(?:urday)?s?\b/],
];
const PROMO_DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const PROMO_DAY_LABEL = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

/** Parse a day-of-week set → array of 'mon'..'sun' (Joi vocab). weekdays→Mon-Fri, weekends→Sat/Sun. */
function promoParseDays(q) {
  const s = String(q || '').toLowerCase();
  const hasWeekdays = /\bweek\s?days?\b/.test(s);
  const hasWeekends = /\bweek\s?ends?\b/.test(s);
  if (hasWeekdays && !hasWeekends) return { days: ['mon', 'tue', 'wed', 'thu', 'fri'], label: 'weekdays (Mon–Fri)' };
  if (hasWeekends && !hasWeekdays) return { days: ['sat', 'sun'], label: 'weekends (Sat & Sun)' };
  const found = new Set();
  for (const [code, re] of PROMO_DAY_MATCHERS) if (re.test(s)) found.add(code);
  const days = PROMO_DAY_ORDER.filter((d) => found.has(d));
  if (!days.length) return { days: [], label: 'every day' };
  return { days, label: days.map((d) => PROMO_DAY_LABEL[d]).join(', ') };
}

/** Parse a start–end time window → { time_start:'HH:MM', time_end:'HH:MM' } (24h) or null. */
function promoParseTimeWindow(q) {
  const s = String(q || '').toLowerCase();
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|till|until|thru|through|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/;
  const m = s.match(re);
  if (!m) return null;
  let h1 = parseInt(m[1], 10); const min1 = m[2] || '00'; let ap1 = m[3];
  let h2 = parseInt(m[4], 10); const min2 = m[5] || '00'; let ap2 = m[6];
  if (!ap1 && ap2) ap1 = ap2;
  if (!ap2 && ap1) ap2 = ap1;
  const to24 = (h, ap) => { if (!ap) return h; let hh = h % 12; if (ap === 'pm') hh += 12; return hh; };
  h1 = to24(h1, ap1); h2 = to24(h2, ap2);
  const fmt = (h, mm) => `${String(h).padStart(2, '0')}:${mm}`;
  const start = fmt(h1, min1); const end = fmt(h2, min2);
  const ok = (t) => /^[0-2][0-9]:[0-5][0-9]$/.test(t) && Number(t.slice(0, 2)) <= 23;
  if (!ok(start) || !ok(end)) return null;
  return { time_start: start, time_end: end };
}

/** Pull the noun the promo is "off/on" (a candidate category name), or null. */
function promoIsolateCategory(q) {
  const s = String(q || '').toLowerCase();
  const m = s.match(/\b(?:off|on)\s+((?:[a-z]+\s*){1,3})/);
  if (!m) return null;
  const STOP = new Set(['all', 'everything', 'the', 'a', 'an', 'menu', 'items', 'item', 'between', 'from',
    'during', 'for', 'every', 'everyday', 'daily', 'weekday', 'weekdays', 'weekend', 'weekends',
    'happy', 'hour', 'am', 'pm', 'on', 'off', 'to', 'and', 'today', 'tonight', 'week', 'entire', 'whole']);
  const DAYSET = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun']);
  const toks = m[1].trim().split(/\s+/).filter((w) => w && !STOP.has(w) && !DAYSET.has(w) && !/\d/.test(w));
  const name = toks.join(' ').trim();
  return name || null;
}

/** Resolve a category name → { id, name } (single hit only) or null. */
async function promoResolveCategory(outletId, name) {
  const q = String(name || '').toLowerCase().trim();
  if (!q) return null;
  let list = [];
  try {
    const r = await menu.listCategories(outletId, { search: name });
    list = (r && r.categories) || [];
  } catch (_) { list = []; }
  const norm = (x) => String(x || '').toLowerCase().trim();
  let m = list.filter((c) => norm(c.name) === q);
  if (!m.length) m = list.filter((c) => norm(c.name).startsWith(q));
  if (!m.length) m = list.filter((c) => norm(c.name).includes(q));
  return m.length === 1 ? m[0] : null;
}

/** Resolve a pricing rule's item target → { item_target, target_ids?, target_tag?, label, note? }. */
async function promoResolveTarget(ctx, q) {
  const s = String(q || '').toLowerCase();
  if (/\bbest[\s-]?sellers?\b|\btop[\s-]?sellers?\b|\bpopular items?\b/.test(s)) return { item_target: 'bestsellers', label: 'bestsellers' };
  if (/\bslow[\s-]?movers?\b|\bslow[\s-]?moving\b/.test(s)) return { item_target: 'slow_movers', label: 'slow movers' };
  const tagM = s.match(/\b(?:tag(?:ged)?|with tag|label(?:led|ed)?)\s+["']?([a-z0-9_]+)["']?/);
  if (tagM) return { item_target: 'tag', target_tag: tagM[1], label: `items tagged "${tagM[1]}"` };
  if (/\ball items?\b|\beverything\b|\bwhole menu\b|\bentire menu\b|\bthe menu\b/.test(s)) return { item_target: 'all', label: 'all items' };
  const catName = promoIsolateCategory(q);
  if (catName) {
    const cat = await promoResolveCategory(ctx.outletId, catName);
    if (cat) return { item_target: 'category', target_ids: [cat.id], label: `the "${cat.name}" category` };
    return { item_target: 'all', label: 'all items', note: `couldn't find a "${catName}" category, so this applies to ALL items` };
  }
  return { item_target: 'all', label: 'all items' };
}

/** Extract a coupon/discount code (uppercased) from NL, or null. */
function promoExtractCode(q) {
  const s = String(q || '');
  let m = s.match(/\b(?:code|coupon|voucher|promo\s*code)\s+["']?([A-Za-z0-9][A-Za-z0-9_-]{1,19})["']?/i);
  if (m) return m[1].toUpperCase();
  m = s.match(/\b(?:discount|promo|promotion|offer)\s+["']?([A-Za-z][A-Za-z0-9_-]{1,19})["']?/i);
  if (m && !/^(code|for|of|the|a|an|off|flat|on|all|to|is|and|percent|rule|named?|called|coupon)$/i.test(m[1])) return m[1].toUpperCase();
  m = s.match(/\b([A-Z][A-Z0-9]{3,19})\b/);
  if (m && !/^(SMS|VIP|POS|QR|EMAIL|WHATSAPP|AUD|INR|OFF|ALL|BOGO)$/.test(m[1])) return m[1];
  return null;
}

/** Signed loyalty-points delta from NL, or null. */
function promoExtractPoints(q) {
  const s = String(q || '').toLowerCase();
  const neg = /\b(deduct|deducted|remove|removed|take|taken|subtract|minus|reduce|reduced|revoke|revoked|dock|docked|claw\s?back)\b/.test(s);
  let m = s.match(/(-?\d{1,7})\s*(?:loyalty\s*)?(?:points?|pts?)\b/);
  if (!m) m = s.match(/\b(?:loyalty\s*)?(?:points?|pts?)\s*(?:of|:)?\s*(-?\d{1,7})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n < 0) return n;
  return neg ? -n : n;
}

/** Isolate a customer name (no phone) from a points command → name or null. */
function promoIsolateCustomerName(q) {
  const n = isolateName(q, ['give', 'given', 'add', 'added', 'adjust', 'points', 'point', 'pts', 'loyalty',
    'customer', 'take', 'remove', 'deduct', 'subtract', 'credit', 'award', 'grant', 'reward', 'bonus',
    'revoke', 'minus', 'plus', 'to', 'from', 'member', 'their', 'her', 'his', 'account']);
  return n || null;
}

/** Human label for a resolved customer. */
function promoCustomerLabel(c) {
  if (!c) return 'the customer';
  return c.full_name ? `${c.full_name} (${c.phone})` : c.phone;
}

/** Resolve the customer a loyalty adjustment targets → { customer } | { error }. Never guesses. */
async function promoResolveCustomer(ctx, q) {
  const caller = { role: ctx.role, head_office_id: ctx.headOfficeId || null };
  const phone = extractPhone(q);
  if (phone) {
    const c = await customer.findByPhone(phone, caller);
    if (!c) return { error: `I couldn't find a customer with phone ${phone}.` };
    return { customer: c };
  }
  const name = promoIsolateCustomerName(q);
  if (!name) return { error: 'Which customer? Give me their phone number or name (e.g. "give 0412345678 50 points").' };
  let list = [];
  try {
    const r = await customer.listCustomers(ctx.outletId, { search: name, limit: 10 }, caller);
    list = (r && r.customers) || [];
  } catch (_) { list = []; }
  if (!list.length) return { error: `I couldn't find a customer matching "${name}".` };
  const norm = (x) => String(x || '').toLowerCase().trim();
  let m = list.filter((c) => norm(c.full_name) === norm(name));
  if (!m.length) m = list;
  if (m.length > 1) return { error: `"${name}" matched ${m.length} customers. Tell me their phone number.` };
  return { customer: m[0] };
}

// ── ACTION REGISTRY ──────────────────────────────────────────────────────────
// extract(ctx, q) → { params } | { error } (clarification/not-found)
// plan(ctx, params) → { summary }
// execute(ctx, params) → { message, entity_type?, entity_id? }
const ACTIONS = [
  {
    name: '86_item',
    label: '86 / un-86 a menu item',
    permission: 'MANAGE_MENU',
    keywords: ['86', 'mark unavailable', 'make unavailable', 'sold out', 'disable item', 'disable the', 'turn off item', 'stop selling', 'un-86', 'un86', 'make available', 'turn on item', 'enable item', 'put back on', 'available again', 'take off the menu'],
    async extract(ctx, q) {
      const s = q.toLowerCase();
      const turnOn = /(un[- ]?86|make .*available|turn .*on|enable|put back|available again|back on the menu)/.test(s) && !/unavailable/.test(s);
      const name = isolateName(q);
      if (!name) return { error: 'Which menu item? Tell me the item to 86 (e.g. "86 the paneer tikka").' };
      const matches = await resolveMenuItem(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find a menu item matching "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} items (${matches.slice(0, 4).map((m) => m.name).join(', ')}). Which one exactly?` };
      const item = matches[0];
      return { params: { item_id: item.id, item_name: item.name, is_available: turnOn } };
    },
    plan(ctx, p) {
      return { summary: p.is_available ? `Put "${p.item_name}" back on the menu (mark available)` : `86 "${p.item_name}" (mark it unavailable)` };
    },
    async execute(ctx, p) {
      await menu.updateMenuItem(p.item_id, ctx.outletId, { is_available: !!p.is_available });
      return { message: `Done — "${p.item_name}" is now ${p.is_available ? 'available' : "86'd (unavailable)"}.`, entity_type: 'menu_item', entity_id: p.item_id };
    },
  },

  {
    name: 'adjust_price',
    label: "change a menu item's price",
    permission: 'MANAGE_MENU',
    keywords: ['change price', 'change the price', 'update price', 'set price', 'adjust price', 'new price', 'reprice', 'change cost', 'set the price', 'price to', 'update the price'],
    // Catches "update <item> price", "change <item>'s price to 12", "increase the
    // <item> price by 10%" — where the item name sits between the verb and "price".
    match: /(\b(update|updated|updating|change|changing|set|adjust|adjusting|revise|reprice|increase|increasing|decrease|decreasing|raise|lower|reduce|drop|bump|hike|markup|mark up)\b[\s\S]{0,40}\b(price|cost)\b)|(\b(price|cost)\b[\s\S]{0,20}\b(to|by|=|@)\b\s*\$?\d)/i,
    async extract(ctx, q) {
      // Resolve the item FIRST — a relative change ("by 10%") needs its current price.
      const name = isolateName(q, PRICE_STOPWORDS);
      if (!name) return { error: 'Which item’s price should I change?' };
      const matches = await resolveMenuItem(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find a menu item matching "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} items (${matches.slice(0, 4).map((m) => m.name).join(', ')}). Which one?` };
      const item = matches[0];
      const oldPrice = Number(item.base_price) || 0;
      const newPrice = computeNewPrice(q, oldPrice);
      if (newPrice == null || !(newPrice >= 0)) {
        return { error: `What should "${item.name}"'s new price be? e.g. "set ${item.name} to 8.50" or "increase it by 10%".` };
      }
      return { params: { item_id: item.id, item_name: item.name, old_price: oldPrice, new_price: round2(newPrice) } };
    },
    plan(ctx, p) {
      return { summary: `Change the price of "${p.item_name}" from ${money(ctx.currency, p.old_price)} to ${money(ctx.currency, p.new_price)}` };
    },
    async execute(ctx, p) {
      await menu.updateMenuItem(p.item_id, ctx.outletId, { base_price: p.new_price });
      return { message: `Done — "${p.item_name}" is now priced ${money(ctx.currency, p.new_price)}.`, entity_type: 'menu_item', entity_id: p.item_id };
    },
  },

  {
    name: 'set_table_status',
    label: 'set a table’s status',
    permission: 'MANAGE_POS',
    keywords: ['mark table', 'set table', 'table clean', 'clean table', 'free table', 'free up table', 'table available', 'table occupied', 'occupy table', 'reserve table', 'table reserved', 'table is', 'mark the table', 'block table'],
    async extract(ctx, q) {
      const s = q.toLowerCase();
      const number = extractTableNumber(q);
      if (!number) return { error: 'Which table? Tell me the table number (e.g. "mark table 5 clean").' };
      let status = null;
      if (/(clean|cleaning|dirty|needs cleaning)/.test(s)) status = 'dirty';
      else if (/(free|available|empty|clear|ready|vacant)/.test(s)) status = 'available';
      else if (/(occupied|occupy|seated|in use|busy)/.test(s)) status = 'occupied';
      else if (/(reserve|reserved|booking)/.test(s)) status = 'reserved';
      else if (/(block|blocked|out of service)/.test(s)) status = 'blocked';
      if (!status) return { error: 'What status? e.g. clean, free, occupied, reserved or blocked.' };
      const matches = await resolveTable(ctx.outletId, number);
      if (!matches.length) return { error: `I couldn't find table ${number}.` };
      const table = matches[0];
      const LABEL = { dirty: 'cleaning', available: 'free/available', occupied: 'occupied', reserved: 'reserved', blocked: 'blocked' };
      return { params: { table_id: table.id, table_number: table.table_number, status, status_label: LABEL[status] } };
    },
    plan(ctx, p) {
      return { summary: `Set table ${p.table_number} to ${p.status_label}` };
    },
    async execute(ctx, p) {
      await tableSvc.updateTableStatus(p.table_id, p.status);
      return { message: `Done — table ${p.table_number} is now ${p.status_label}.`, entity_type: 'table', entity_id: p.table_id };
    },
  },

  {
    name: 'create_customer',
    label: 'add a customer',
    permission: 'MANAGE_CUSTOMERS',
    keywords: ['add customer', 'create customer', 'new customer', 'add a customer', 'register customer', 'save customer', 'add contact', 'add a new customer', 'enter customer'],
    async extract(ctx, q) {
      const phone = extractPhone(q);
      if (!phone) return { error: 'I need a phone number to add a customer (e.g. "add customer John Smith 0412345678").' };
      const name = isolateName(q, ['add', 'create', 'new', 'customer', 'register', 'save', 'contact', 'enter', 'named', 'name', 'phone', 'number', 'mobile', 'with']);
      const full_name = name ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
      return { params: { phone, full_name } };
    },
    plan(ctx, p) {
      return { summary: `Add a new customer${p.full_name ? ` "${p.full_name}"` : ''} with phone ${p.phone}` };
    },
    async execute(ctx, p) {
      const created = await customer.createCustomer(
        { phone: p.phone, full_name: p.full_name, head_office_id: ctx.headOfficeId || null },
        { head_office_id: ctx.headOfficeId || null },
      );
      return { message: `Done — added ${p.full_name || 'the customer'} (${p.phone}).`, entity_type: 'customer', entity_id: created && created.id };
    },
  },

  {
    name: 'create_staff',
    label: 'add a staff member',
    permission: 'MANAGE_STAFF',
    // Unambiguous staff keywords only. Role-word hires ("add a waiter", "add a
    // chef") are handled by `match` below, which guards against menu phrasings like
    // "add a chef special" that a bare 'add a chef' keyword would wrongly catch.
    keywords: ['add staff', 'add a staff', 'add new staff', 'add a new staff', 'create staff', 'new staff', 'new staff member', 'add staff member', 'add employee', 'add an employee', 'new employee', 'register staff', 'onboard staff', 'add a team member', 'add team member', 'hire'],
    // Catches role-based hires whose words aren't a contiguous keyword — "add a new
    // waiter named …", "onboard employee …", "hire a manager". The negative lookahead
    // avoids menu/report/permission phrasings ("add a chef special", "manager report").
    match: /\b(?:add|create|hire|onboard|register|set\s?up)\b[\s\S]{0,20}\b(?:staff|employee|team\s*member|new\s+hire|waiter|cashier|manager|chef|cook|barista|server|rider)\b(?!\s+(?:special|item|dish|combo|menu|report|role|permission|discount|shift|schedule|section|to\s+(?:section|table|floor|area|zone)))/i,
    async extract(ctx, q) {
      const name = extractStaffName(q);
      if (!name) return { error: 'What is the staff member’s name? e.g. "add staff John Smith as cashier".' };
      const role = extractStaffRole(q); // manager|cashier|waiter|chef|delivery|captain, or null
      const phone = extractPhone(q);
      const em = String(q).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      const full_name = name.replace(/\b\w/g, (c) => c.toUpperCase());
      return { params: { full_name, role: role || null, phone: phone || null, email: em ? em[0] : null } };
    },
    plan(ctx, p) {
      const extras = [];
      if (p.phone) extras.push(`phone ${p.phone}`);
      if (p.email) extras.push(p.email);
      const tail = extras.length ? ` (${extras.join(', ')})` : '';
      // Call out the default password so the owner knows how the new hire signs in.
      return { summary: `Add a new staff member "${p.full_name}" as ${p.role || 'cashier'}${tail}. They can sign in with the default password Staff@123 — change it and set a PIN in Staff Management.` };
    },
    async execute(ctx, p) {
      const created = await staff.createStaffWithUser(ctx.outletId, {
        full_name: p.full_name,
        role: p.role || 'cashier',
        phone: p.phone || null,
        email: p.email || null,
      });
      const entityId = (created && (created.user_id || (created.user && created.user.id) || created.id)) || null;
      return {
        message: `Done — added ${p.full_name} as ${p.role || 'cashier'}. Default password is Staff@123 (ask them to change it); set their PIN and any extra details in Staff Management.`,
        entity_type: 'staff',
        entity_id: entityId,
      };
    },
  },

  {
    name: 'draft_po',
    label: 'draft a purchase order for low-stock items',
    permission: 'MANAGE_INVENTORY',
    keywords: ['draft po', 'draft a po', 'draft purchase order', 'create a purchase order', 'create po', 'raise a po', 'raise po', 'order what', 'order low stock', 'reorder low', 'reorder stock', 'restock order', 'purchase order for low', 'order supplies', 'make a po', 'order everything low'],
    async extract(ctx) {
      const low = await inventory.getLowStock(ctx.outletId);
      const items = (Array.isArray(low) ? low : []).filter((i) => i && i.id);
      if (!items.length) return { error: 'Nothing is running low right now — no purchase order needed.' };
      const lines = items.map((i) => {
        const cur = Number(i.current_stock) || 0;
        const min = Number(i.min_threshold) || 0;
        const qty = Number(i.reorder_qty) > 0 ? Number(i.reorder_qty) : Math.max(1, Math.ceil(min - cur) || 1);
        return { inventory_item_id: i.id, item_name: i.name, quantity: qty, unit: i.unit || 'unit', unit_price: Number(i.cost_per_unit) || 0 };
      });
      const est = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
      return { params: { lines, count: lines.length, est } };
    },
    plan(ctx, p) {
      return { summary: `Draft a purchase order for ${p.count} low-stock item${p.count === 1 ? '' : 's'} (estimated ${money(ctx.currency, p.est)})` };
    },
    async execute(ctx, p) {
      const po = await procurement.createPurchaseOrder(ctx.outletId, { items: p.lines }, ctx.id);
      const num = po && po.po_number ? ` #${po.po_number}` : '';
      return { message: `Drafted purchase order${num} with ${p.count} item${p.count === 1 ? '' : 's'} — review and approve it in Inventory → Purchase Orders.`, entity_type: 'purchase_order', entity_id: po && po.id };
    },
  },

  {
    name: 'record_wastage',
    label: 'log wastage for an inventory item',
    permission: 'MANAGE_INVENTORY',
    keywords: ['record wastage', 'log wastage', 'log waste', 'wastage', 'wasted', 'threw out', 'throw out', 'thrown out', 'threw away', 'write off', 'wrote off', 'write-off', 'binned', 'spoiled', 'spoilt', 'expired stock', 'chucked out', 'gone off'],
    // Catches "we threw out 2kg paneer", "chucked the tomatoes". Lone "expired" is
    // deliberately NOT a keyword (it would catch reads like "what expired today").
    match: /\b(threw|throw|thrown|chuck(?:ed)?|bin(?:ned)?|dump(?:ed)?|trash(?:ed)?|wasted|wastage|write[- ]?off|wrote\s+off)\b/i,
    async extract(ctx, q) {
      const qty = invExtractQty(q);
      if (!qty || !(qty.quantity > 0)) return { error: 'How much was wasted? e.g. "log 2kg paneer wasted, expired".' };
      const name = invIsolateItemName(q);
      if (!name) return { error: 'Which item was wasted? Name the inventory item, e.g. "threw out 2kg paneer".' };
      const matches = await invResolveInventoryItem(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find an inventory item matching "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} inventory items (${matches.slice(0, 4).map((m) => m.name).join(', ')}). Which one exactly?` };
      const item = matches[0];
      const reason = invExtractWastageReason(q) || 'wastage';
      const unit = item.unit || qty.unit || 'unit';
      return { params: { item_id: item.id, item_name: item.name, quantity: qty.quantity, unit, reason } };
    },
    plan(ctx, p) {
      return { summary: `Log ${p.quantity} ${p.unit} of "${p.item_name}" as wastage (${p.reason}) and deduct it from stock` };
    },
    async execute(ctx, p) {
      await inventory.recordWastage(ctx.outletId, [{ item_id: p.item_id, quantity: p.quantity, reason: p.reason }], ctx.id);
      return { message: `Done — logged ${p.quantity} ${p.unit} of "${p.item_name}" as wastage (${p.reason}) and deducted it from stock.`, entity_type: 'inventory_item', entity_id: p.item_id };
    },
  },

  {
    name: 'adjust_stock',
    label: "adjust an inventory item's stock",
    permission: 'MANAGE_INVENTORY',
    keywords: ['set stock', 'adjust stock', 'stock adjustment', 'add stock', 'reduce stock', 'increase stock', 'decrease stock', 'update stock', 'correct stock', 'stock count', 'set the stock'],
    // "set tomatoes to 5kg", "add 10kg onions", "reduce paneer by 2kg" — an adjust
    // verb followed (within 40 chars) by "stock" OR a <number><unit> quantity. The
    // unit sits right after the digits ("5kg"), so anchor on the number.
    match: /\b(set|add|adjust|increase|decrease|reduce|update|correct)\b[\s\S]{0,40}(?:\bstock\b|\d+(?:\.\d+)?\s*(?:kgs?|grams?|g|litres?|liters?|l|ml|pcs?|pieces?|units?|dozen|packs?|packets?|trays?|boxes|bottles?|crates?)\b)/i,
    async extract(ctx, q) {
      const name = invIsolateItemName(q);
      if (!name) return { error: 'Which item’s stock should I change? e.g. "set tomatoes to 5kg".' };
      const qty = invExtractQty(q);
      if (!qty || !(qty.quantity >= 0)) return { error: `How much? e.g. "set ${name} to 5kg", "add 10kg ${name}" or "reduce ${name} by 2kg".` };
      const matches = await invResolveInventoryItem(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find an inventory item matching "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} inventory items (${matches.slice(0, 4).map((m) => m.name).join(', ')}). Which one?` };
      const item = matches[0];
      const mode = invExtractStockMode(q);
      const unit = item.unit || qty.unit || 'unit';
      return { params: { item_id: item.id, item_name: item.name, mode, quantity: qty.quantity, unit } };
    },
    plan(ctx, p) {
      if (p.mode === 'add') return { summary: `Add ${p.quantity} ${p.unit} to "${p.item_name}" stock` };
      if (p.mode === 'reduce') return { summary: `Reduce "${p.item_name}" stock by ${p.quantity} ${p.unit}` };
      return { summary: `Set "${p.item_name}" stock to ${p.quantity} ${p.unit}` };
    },
    async execute(ctx, p) {
      const reason = `Assistant stock ${p.mode}`;
      let delta;
      if (p.mode === 'add') delta = p.quantity;
      else if (p.mode === 'reduce') delta = -p.quantity;
      else {
        // 'set' — adjustStock takes a DELTA (increment), so compute target minus the
        // LIVE current level (re-read at execute time, never the preview snapshot).
        let current = 0;
        try {
          const s = await inventory.getStock(ctx.outletId, { search: p.item_name, limit: 200 });
          const row = ((s && s.items) || []).find((it) => it.id === p.item_id);
          if (row && row.current_stock != null) current = Number(row.current_stock) || 0;
        } catch (_) { current = 0; }
        delta = round2(p.quantity - current);
      }
      const stock = await inventory.adjustStock(ctx.outletId, p.item_id, delta, reason, ctx.id);
      const newLevel = stock && stock.current_stock != null ? Number(stock.current_stock)
        : (p.mode === 'set' ? p.quantity : null);
      let message;
      if (p.mode === 'set') message = `Done — "${p.item_name}" stock is now ${newLevel != null ? newLevel : p.quantity} ${p.unit}.`;
      else if (p.mode === 'add') message = `Done — added ${p.quantity} ${p.unit} to "${p.item_name}"${newLevel != null ? ` (now ${newLevel} ${p.unit})` : ''}.`;
      else message = `Done — reduced "${p.item_name}" by ${p.quantity} ${p.unit}${newLevel != null ? ` (now ${newLevel} ${p.unit})` : ''}.`;
      return { message, entity_type: 'inventory_item', entity_id: p.item_id };
    },
  },

  {
    name: 'receive_po',
    label: 'mark a purchase order received',
    permission: 'MANAGE_INVENTORY',
    keywords: ['receive po', 'receive purchase order', 'po received', 'received po', 'received the po', 'mark po received', 'mark received', 'goods received', 'received the order', 'receive the order', 'mark the order', 'po delivered', 'delivered po', 'mark delivered'],
    match: /\b(receive|received|receiving)\b[\s\S]{0,20}\b(po|p\.?o\.?|purchase order|order|delivery|goods)\b|\bpo[-\s]?\d/i,
    async extract(ctx, q) {
      const hint = invExtractPoHint(q);
      if (!hint) return { error: 'Which purchase order? Tell me the PO number, e.g. "receive PO-000123".' };
      const matches = await invResolvePurchaseOrder(ctx.outletId, hint);
      if (!matches.length) return { error: `I couldn't find a purchase order matching "${hint}".` };
      if (matches.length > 1) return { error: `"${hint}" matched ${matches.length} purchase orders (${matches.slice(0, 4).map((m) => m.po_number).join(', ')}). Which PO number exactly?` };
      const po = matches[0];
      if (String(po.status) === 'received') return { error: `Purchase order ${po.po_number} has already been received.` };
      return { params: { po_id: po.id, po_number: po.po_number } };
    },
    plan(ctx, p) {
      return { summary: `Mark purchase order #${p.po_number} as received and add its ordered items to stock` };
    },
    async execute(ctx, p) {
      // Empty body → service receives every PO line at its ordered quantity.
      const grn = await procurement.receivePurchaseOrder(ctx.outletId, p.po_id, {}, ctx.id);
      const g = grn && grn.grn_number ? ` (GRN ${grn.grn_number})` : '';
      return { message: `Done — received PO #${p.po_number}${g} and added its items to stock.`, entity_type: 'purchase_order', entity_id: p.po_id };
    },
  },

  {
    name: 'create_inventory_item',
    label: 'add an inventory item',
    permission: 'MANAGE_INVENTORY',
    keywords: ['add inventory item', 'create inventory item', 'new inventory item', 'add a raw material', 'add raw material', 'new raw material', 'add ingredient', 'add an ingredient', 'new ingredient', 'add stock item', 'add a stock item', 'create a raw material'],
    match: /\b(add|create|new|set\s?up)\b[\s\S]{0,24}\b(inventory item|raw material|ingredient|stock item)\b/i,
    async extract(ctx, q) {
      const name = invExtractNewItemName(q);
      if (!name) return { error: 'What should the item be called? e.g. "add inventory item Paneer, unit kg".' };
      const dup = await invResolveInventoryItem(ctx.outletId, name);
      if (dup.some((m) => String(m.name).toLowerCase() === name.toLowerCase())) {
        return { error: `There's already an inventory item called "${name}".` };
      }
      const unit = invExtractUnit(q) || 'kg'; // schema default is also "kg"
      const category = invExtractCategory(q) || null;
      const cost_per_unit = invExtractCostPerUnit(q);
      const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
      return { params: { name: title, unit, category, cost_per_unit } };
    },
    plan(ctx, p) {
      const bits = [`unit ${p.unit}`];
      if (p.category) bits.push(`category ${p.category}`);
      if (p.cost_per_unit) bits.push(`cost ${p.cost_per_unit}/${p.unit}`);
      return { summary: `Create inventory item "${p.name}" (${bits.join(', ')}). It starts at 0 ${p.unit} stock.` };
    },
    async execute(ctx, p) {
      const created = await inventory.createInventoryItem(ctx.outletId, {
        name: p.name, unit: p.unit, category: p.category, cost_per_unit: p.cost_per_unit,
      });
      return { message: `Done — added inventory item "${p.name}" (${p.unit}). Set its opening stock with "set ${p.name} to …" or by receiving a PO.`, entity_type: 'inventory_item', entity_id: created && created.id };
    },
  },

  {
    name: 'create_menu_item',
    label: 'add a menu item',
    permission: 'MANAGE_MENU',
    keywords: [
      'add dish', 'add a dish', 'new dish', 'add new dish', 'create dish',
      'add item', 'add an item', 'add a item', 'new item', 'add new item',
      'add menu item', 'new menu item', 'create menu item', 'create item', 'menu item',
      'add a menu item', 'add to the menu', 'add to menu', 'put on the menu',
    ],
    // "create a new dish called X", "put a menu item on …" — requires the strong noun
    // so it never fires on category/combo phrasings.
    match: /\b(?:add|create|new|put)\b[\s\S]{0,24}\b(?:dish|menu\s*item)\b/i,
    async extract(ctx, q) {
      const { categoryName, remainder } = menuParseItemCategory(q);
      const name = menuExtractName(remainder);
      if (!name) return { error: 'What should I call the new dish? e.g. "add dish Butter Chicken $14 in Mains".' };
      const price = extractPrice(remainder);
      if (price == null || !(price >= 0)) return { error: `What price for "${name}"? e.g. "add ${name} $12 in Mains".` };
      let category;
      if (categoryName) {
        const matches = await menuResolveCategory(ctx.outletId, categoryName);
        if (!matches.length) return { error: `I couldn't find a category called "${categoryName}". Create it first (or say an existing one) and I'll add "${name}".` };
        if (matches.length > 1) return { error: `"${categoryName}" matched ${matches.length} categories (${matches.slice(0, 4).map((c) => c.name).join(', ')}). Which one exactly?` };
        category = matches[0];
      } else {
        const cats = await menuListCategories(ctx.outletId);
        if (!cats.length) return { error: `You don't have any menu categories yet — add one first (e.g. "add category Mains"), then I can add "${name}".` };
        category = cats[0]; // lowest display_order
      }
      return { params: { name, base_price: round2(price), category_id: category.id, category_name: category.name, defaulted_category: !categoryName } };
    },
    plan(ctx, p) {
      const where = p.defaulted_category ? `the "${p.category_name}" category (default — no category named)` : `the "${p.category_name}" category`;
      return { summary: `Add "${p.name}" at ${money(ctx.currency, p.base_price)} to ${where}` };
    },
    async execute(ctx, p) {
      const created = await menu.createMenuItem({ outlet_id: ctx.outletId, category_id: p.category_id, name: p.name, base_price: p.base_price });
      return { message: `Done — added "${p.name}" at ${money(ctx.currency, p.base_price)} in ${p.category_name}. Set its food type, GST rate, variants and station in Menu → Items.`, entity_type: 'menu_item', entity_id: created && created.id };
    },
  },

  {
    name: 'create_category',
    label: 'add a menu category',
    // The UI route POST /menu/categories enforces MANAGE_CATEGORIES (a distinct seeded
    // permission from MANAGE_MENU); the assistant mirrors the same requirement.
    permission: 'MANAGE_CATEGORIES',
    keywords: [
      'add category', 'add a category', 'new category', 'add new category', 'create category',
      'create a category', 'add menu category', 'new menu category', 'menu category',
      'add a new category', 'make a category',
    ],
    match: /\b(?:add|create|make|new|set\s?up)\b[\s\S]{0,40}\bcategor(?:y|ies)\b/i,
    async extract(ctx, q) {
      const name = menuExtractName(q);
      if (!name || name.trim().length < 2) return { error: 'What should the category be called? e.g. "add category Desserts".' };
      return { params: { name: name.trim() } };
    },
    plan(ctx, p) {
      return { summary: `Create a new menu category "${p.name}"` };
    },
    async execute(ctx, p) {
      const created = await menu.createCategory({ outlet_id: ctx.outletId, name: p.name });
      return { message: `Done — created the "${p.name}" category. You can reorder it and add items to it in Menu → Categories.`, entity_type: 'menu_category', entity_id: created && created.id };
    },
  },

  {
    name: 'create_combo',
    label: 'create a combo',
    permission: 'MANAGE_MENU',
    keywords: [
      'create combo', 'create a combo', 'add combo', 'add a combo', 'new combo',
      'make a combo', 'make combo', 'combo meal', 'meal deal', 'set up a combo',
    ],
    match: /\b(?:add|create|make|new|set\s?up)\b[\s\S]{0,24}\bcombo\b/i,
    async extract(ctx, q) {
      const name = menuExtractName(q);
      if (!name) return { error: 'What should the combo be called? e.g. "create combo \'Lunch Deal\' $12".' };
      const price = extractPrice(q);
      if (price == null || !(price >= 0)) return { error: `What price for the "${name}" combo? e.g. "create combo ${name} $12".` };
      // A combo needs component items, which can't be reliably parsed from one sentence —
      // create the shell (name + price, inactive) and tell the owner to add its items.
      return { params: { name, combo_price: round2(price) } };
    },
    plan(ctx, p) {
      return { summary: `Create the combo "${p.name}" at ${money(ctx.currency, p.combo_price)} as an inactive shell — you'll add its items (and switch it on) in Menu → Combos` };
    },
    async execute(ctx, p) {
      const created = await menu.createCombo({ outlet_id: ctx.outletId, name: p.name, combo_price: p.combo_price, is_active: false });
      return { message: `Done — created the combo "${p.name}" at ${money(ctx.currency, p.combo_price)}. It's off until you add its items and switch it on in Menu → Combos.`, entity_type: 'combo', entity_id: created && created.id };
    },
  },

  {
    name: 'update_staff',
    label: "update a staff member (role or PIN)",
    permission: 'MANAGE_STAFF',
    keywords: [
      'set pin', 'set the pin', 'set a pin', 'change pin', 'change the pin', 'reset pin',
      'reset the pin', 'update pin', 'update the pin', 'manager pin', 'new pin', 'set their pin',
      'change role', 'change the role', 'update role', 'update the role', 'promote', 'make a manager',
    ],
    // Two guarded intents: a PIN set, or a role change. 'make'/'set' are NOT bare
    // keywords (they collide with other actions), so intent is carried by this regex.
    // The role branch has a negative lookahead against menu/floor phrasings.
    match: /(\b(?:set|change|reset|update|give)\b[\s\S]{0,20}\b(?:pin|passcode|pass\s?code)\b)|(\b(?:make|promote|change|set|update|move|reassign|assign)\b[\s\S]{0,25}\b(?:manager|cashier|waiter|server|chef|barista|captain|host|rider)\b(?!\s+(?:special|item|dish|combo|menu|report|section|station|table)))/i,
    async extract(ctx, q) {
      const wantsPin = /\b(?:pin|passcode|pass\s?code|code)\b/i.test(q);
      const role = extractStaffRole(q); // manager|cashier|waiter|chef|delivery|captain | null
      const name = stfExtractStaffName(q);
      if (!name) return { error: 'Who do you want to update? Name the staff member, e.g. "set Sam’s PIN to 4321" or "make Ravi a manager".' };
      const matches = await stfResolveStaff(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find a staff member named "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} staff (${matches.slice(0, 4).map((s) => s.user.full_name).join(', ')}). Which one exactly?` };
      const sp = matches[0];
      const userId = stfUserId(sp);
      const fullName = (sp.user && sp.user.full_name) || name;
      if (wantsPin) {
        const pin = stfExtractPin(q);
        if (!pin) return { error: `What PIN should I set for ${fullName}? Use a 4–6 digit number, e.g. "set ${fullName}’s PIN to 4321".` };
        return { params: { op: 'pin', user_id: userId, full_name: fullName, manager_pin: pin } };
      }
      if (role) return { params: { op: 'role', user_id: userId, full_name: fullName, role } };
      return { error: `What should I change for ${fullName}? I can change their role (e.g. "make ${fullName} a manager") or set their PIN (e.g. "set ${fullName}’s PIN to 4321").` };
    },
    plan(ctx, p) {
      if (p.op === 'role') return { summary: `Change ${p.full_name}'s role to ${p.role}` };
      return { summary: `Set a new PIN for ${p.full_name}` }; // never echo the PIN
    },
    async execute(ctx, p) {
      if (p.op === 'role') {
        await staff.changeStaffRole(ctx.outletId, p.user_id, p.role);
        return { message: `Done — ${p.full_name} is now a ${p.role}.`, entity_type: 'staff', entity_id: p.user_id };
      }
      await staff.upsertStaffProfile(p.user_id, ctx.outletId, { manager_pin: p.manager_pin });
      return { message: `Done — updated ${p.full_name}'s PIN.`, entity_type: 'staff', entity_id: p.user_id };
    },
  },

  {
    name: 'clock_in',
    label: 'clock a staff member in',
    // Clocking a NAMED other person in is a supervisory act; the tightest real key
    // for writing attendance is MANAGE_ATTENDANCE. Owners bypass.
    permission: 'MANAGE_ATTENDANCE',
    keywords: ['clock in', 'clock-in', 'clocking in', 'punch in', 'sign in staff', 'start shift for'],
    match: /\b(?:clock|punch)(?:\s|-)?in\b|\bclock\b[\s\S]{0,20}\bin\b/i,
    async extract(ctx, q) {
      const name = stfClockName(q);
      if (!name) return { error: 'Who should I clock in? e.g. "clock in Priya".' };
      const matches = await stfResolveStaff(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find a staff member named "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} staff (${matches.slice(0, 4).map((s) => s.user.full_name).join(', ')}). Which one exactly?` };
      const sp = matches[0];
      const userId = stfUserId(sp);
      const fullName = (sp.user && sp.user.full_name) || name;
      const open = await stfOpenAttendance(ctx.outletId, userId);
      if (open) return { error: `${fullName} is already clocked in.` };
      return { params: { user_id: userId, full_name: fullName } };
    },
    plan(ctx, p) {
      return { summary: `Clock ${p.full_name} in` };
    },
    async execute(ctx, p) {
      const rec = await staff.clockIn(p.user_id, ctx.outletId, {});
      return { message: `Done — clocked ${p.full_name} in.`, entity_type: 'attendance', entity_id: rec && rec.id };
    },
  },

  {
    name: 'clock_out',
    label: 'clock a staff member out',
    permission: 'MANAGE_ATTENDANCE',
    keywords: ['clock out', 'clock-out', 'clocking out', 'punch out', 'sign out staff', 'end shift for'],
    match: /\b(?:clock|punch)(?:\s|-)?out\b|\bclock\b[\s\S]{0,20}\bout\b/i,
    async extract(ctx, q) {
      const name = stfClockName(q);
      if (!name) return { error: 'Who should I clock out? e.g. "clock out Sam".' };
      const matches = await stfResolveStaff(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find a staff member named "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} staff (${matches.slice(0, 4).map((s) => s.user.full_name).join(', ')}). Which one exactly?` };
      const sp = matches[0];
      const userId = stfUserId(sp);
      const fullName = (sp.user && sp.user.full_name) || name;
      const open = await stfOpenAttendance(ctx.outletId, userId);
      if (!open) return { error: `${fullName} isn't clocked in right now.` };
      return { params: { user_id: userId, full_name: fullName } };
    },
    plan(ctx, p) {
      return { summary: `Clock ${p.full_name} out` };
    },
    async execute(ctx, p) {
      const rec = await staff.clockOut(p.user_id, ctx.outletId, {});
      const hrs = rec && rec.hours_worked != null ? ` (${Number(rec.hours_worked)}h)` : '';
      return { message: `Done — clocked ${p.full_name} out${hrs}.`, entity_type: 'attendance', entity_id: rec && rec.id };
    },
  },

  {
    name: 'create_shift',
    label: 'create a staff shift',
    permission: 'MANAGE_STAFF',
    keywords: ['add a shift', 'create a shift', 'create shift', 'new shift', 'add shift', 'schedule a shift', 'set up a shift', 'add a new shift', 'make a shift'],
    match: /\b(?:add|create|new|schedule|set\s?up|make)\b[\s\S]{0,30}\bshift\b/i,
    async extract(ctx, q) {
      const range = stfParseTimeRange(q);
      if (!range) return { error: 'What time is the shift? Give a start and end, e.g. "add a Friday dinner shift 6pm-11pm".' };
      const name = stfShiftName(q) || `${range.start}-${range.end}`;
      return { params: { name: String(name).slice(0, 50), start_time: range.start, end_time: range.end } };
    },
    plan(ctx, p) {
      return { summary: `Create a "${p.name}" shift from ${p.start_time} to ${p.end_time}` };
    },
    async execute(ctx, p) {
      // StaffShift.start_time/end_time are Postgres TIME columns — Prisma needs a real
      // Date, not a bare 'HH:MM' string, so build one on the epoch date.
      const toTime = (hm) => new Date(`1970-01-01T${hm}:00.000Z`);
      const shift = await staff.createShift({
        outlet_id: ctx.outletId, name: p.name,
        start_time: toTime(p.start_time), end_time: toTime(p.end_time),
      });
      return { message: `Done — created the "${p.name}" shift (${p.start_time}–${p.end_time}). Assign staff to it in Staff → Shifts.`, entity_type: 'shift', entity_id: shift && shift.id };
    },
  },

  {
    name: 'create_pricing_rule',
    label: 'create a pricing / happy-hour rule',
    permission: 'MANAGE_MENU',
    keywords: [
      'happy hour', 'happy-hour', 'pricing rule', 'create a pricing rule', 'time based discount',
      'time-based discount', 'auto discount', 'auto-discount', 'discount rule', 'surcharge rule',
      'off during', 'off between', 'off from', 'off drinks', 'off all', 'off on weekdays',
      'off on weekends', 'surge pricing', 'dynamic price', 'schedule a discount',
    ],
    // The trailing time/day token distinguishes a scheduled RULE from a one-off
    // apply_discount ("10% off order 42").
    match: /\b(?:happy[\s-]?hour|pricing rule|time[\s-]?based (?:price|discount|rule)|surge pricing)\b|(?:\d+\s*%|\bflat\b|\$\s*\d)[\s\S]{0,30}\b(?:off|discount|surcharge)\b[\s\S]{0,40}\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|weekdays?|weekends?|between|from|during|every)\b/i,
    async extract(ctx, q) {
      const disc = extractDiscount(q);
      if (!disc || !(disc.discount_value > 0)) return { error: 'How much should the rule change prices by? e.g. "happy hour 15% off drinks 5-7pm" or "$5 off all 4-6pm".' };
      const action_unit = disc.discount_type === 'percentage' ? 'percent' : 'flat';
      if (action_unit === 'percent' && disc.discount_value > 100) return { error: "A percentage rule can't be more than 100%." };
      const action_type = /\bsurcharge|surge|extra charge|premium\b/i.test(q) ? 'surcharge' : 'discount';
      const win = promoParseTimeWindow(q);
      const { days, label: days_label } = promoParseDays(q);
      const target = await promoResolveTarget(ctx, q);
      const trigger_type = win ? 'time_of_day' : (days.length ? 'day_of_week' : 'manual');
      const amtLabel = action_unit === 'percent' ? `${disc.discount_value}%` : money(ctx.currency, disc.discount_value);
      const verbShort = action_type === 'surcharge' ? 'surcharge' : 'off';
      const name = `${amtLabel} ${verbShort} ${target.label}`.replace(/["']/g, '').slice(0, 100);
      const defaults = [];
      if (!win) defaults.push('all day — no time window detected');
      if (!days.length) defaults.push('every day — no days detected');
      if (target.note) defaults.push(target.note);
      return {
        params: {
          name, description: String(q || '').trim().slice(0, 255), trigger_type, action_type, action_unit,
          action_value: disc.discount_value, time_start: win ? win.time_start : null, time_end: win ? win.time_end : null,
          days_of_week: days, item_target: target.item_target, target_ids: target.target_ids || [], target_tag: target.target_tag || null,
          target_label: target.label, days_label, window_label: win ? `${win.time_start}–${win.time_end}` : 'all day',
          amount_label: amtLabel, verb_label: verbShort, defaults,
        },
      };
    },
    plan(ctx, p) {
      let s = `Create a pricing rule: ${p.amount_label} ${p.verb_label} ${p.target_label}, ${p.window_label}, ${p.days_label}`;
      if (p.defaults && p.defaults.length) s += ` — assuming: ${p.defaults.join('; ')}`;
      return { summary: s };
    },
    async execute(ctx, p) {
      const rule = await pricing.createRule(ctx.outletId, {
        name: p.name, description: p.description, trigger_type: p.trigger_type, action_type: p.action_type,
        action_value: p.action_value, action_unit: p.action_unit, time_start: p.time_start || null, time_end: p.time_end || null,
        days_of_week: p.days_of_week || [], item_target: p.item_target || 'all', target_ids: p.target_ids || [], target_tag: p.target_tag || null,
        is_active: true, priority: 10,
      });
      return { message: `Done — created pricing rule "${p.name}" (${p.amount_label} ${p.verb_label} ${p.target_label}, ${p.window_label}, ${p.days_label}). It's active now; manage it in Menu → Dynamic Pricing.`, entity_type: 'pricing_rule', entity_id: rule && rule.id };
    },
  },

  {
    name: 'create_discount',
    label: 'create a discount / coupon code',
    // The discount route is role-gated (owner/manager/super_admin); MANAGE_MENU is the
    // closest RBAC key the manager role holds.
    permission: 'MANAGE_MENU',
    keywords: [
      'create discount', 'create a discount', 'make a discount', 'new discount', 'add a discount code',
      'discount code', 'coupon code', 'promo code', 'create coupon', 'make coupon', 'create a coupon',
      'create a promo', 'make a promo', 'new coupon', 'make code', 'create code', 'set up a discount',
      'create a discount code', 'voucher code',
    ],
    match: /\b(?:make|create|add|new|set\s?up|setup)\b[\s\S]{0,20}\b(?:discount|coupon|promo(?:tion)?|voucher|code)\b|\b(?:discount|coupon|promo|voucher)\s*code\b/i,
    async extract(ctx, q) {
      const disc = extractDiscount(q);
      if (!disc || !(disc.discount_value > 0)) return { error: 'How much is the discount? e.g. "create code WELCOME10 for 10% off" or "make discount HAPPY 50 off".' };
      const type = disc.discount_type === 'percentage' ? 'percentage' : 'flat';
      if (type === 'percentage' && disc.discount_value > 100) return { error: "A percentage discount can't be more than 100%." };
      const code = promoExtractCode(q);
      const valueLabel = type === 'percentage' ? `${disc.discount_value}%` : money(ctx.currency, disc.discount_value);
      const name = (code ? `${code} — ${valueLabel} off` : `${valueLabel} off`).slice(0, 100);
      return { params: { code: code || null, type, value: disc.discount_value, name, value_label: valueLabel } };
    },
    plan(ctx, p) {
      const codePart = p.code ? `code ${p.code}` : 'an auto-applied discount (no code)';
      return { summary: `Create ${codePart} for ${p.value_label} off` };
    },
    async execute(ctx, p) {
      // NOTE the (data, outletId) argument order of discounts.createDiscount.
      const created = await discounts.createDiscount({ name: p.name, code: p.code || null, type: p.type, value: p.value }, ctx.outletId);
      const codePart = p.code ? `code ${p.code}` : 'discount';
      return { message: `Done — created ${codePart} for ${p.value_label} off. Review it in Promotions → Discounts.`, entity_type: 'discount', entity_id: created && created.id };
    },
  },

  {
    name: 'adjust_loyalty_points',
    label: "adjust a customer's loyalty points",
    permission: 'MANAGE_CUSTOMERS',
    keywords: [
      'give points', 'add points', 'award points', 'credit points', 'grant points', 'adjust points',
      'deduct points', 'remove points', 'take points', 'bonus points', 'reward points', 'add loyalty',
      'give loyalty', 'loyalty bonus', 'add loyalty points', 'give loyalty points',
    ],
    match: /\b(?:give|gave|add|added|award|credit|grant|adjust|deduct|remove|take|subtract|revoke|bump)\b[\s\S]{0,40}\b(?:loyalty\s*)?(?:points?|pts?)\b|\b(?:loyalty\s*)?(?:points?|pts?)\b[\s\S]{0,20}\b(?:to|for|from)\b/i,
    async extract(ctx, q) {
      const points = promoExtractPoints(q);
      if (points == null || points === 0) return { error: 'How many points? e.g. "give 0412345678 50 points" or "take 20 points off John".' };
      const res = await promoResolveCustomer(ctx, q);
      if (res.error) return { error: res.error };
      const cust = res.customer;
      const reason = extractReason(q);
      return { params: { customer_id: cust.id, customer_label: promoCustomerLabel(cust), points, reason: reason || null } };
    },
    plan(ctx, p) {
      const n = Math.abs(p.points);
      const verb = p.points >= 0 ? 'Add' : 'Remove';
      const dir = p.points >= 0 ? 'to' : 'from';
      return { summary: `${verb} ${n} loyalty point${n === 1 ? '' : 's'} ${dir} ${p.customer_label}${p.reason ? ` — reason: "${p.reason}"` : ''}` };
    },
    async execute(ctx, p) {
      const caller = { role: ctx.role, head_office_id: ctx.headOfficeId || null };
      const loyalty = await customer.adjustPoints(p.customer_id, ctx.outletId, p.points, p.reason || 'Assistant adjustment', caller);
      const n = Math.abs(p.points);
      const verb = p.points >= 0 ? 'Added' : 'Removed';
      const dir = p.points >= 0 ? 'to' : 'from';
      const bal = loyalty && typeof loyalty.current_balance === 'number' ? ` New balance: ${loyalty.current_balance} points.` : '';
      return { message: `Done — ${verb.toLowerCase()} ${n} point${n === 1 ? '' : 's'} ${dir} ${p.customer_label}.${bal}`, entity_type: 'customer', entity_id: p.customer_id };
    },
  },

  {
    name: 'create_reservation',
    label: 'create a reservation',
    permission: 'MANAGE_POS',
    keywords: ['book a table', 'make a reservation', 'new reservation', 'create reservation', 'reserve a table', 'add a booking', 'book table', 'take a booking', 'reservation for', 'booking for'],
    async extract(ctx, q) {
      const date = parseReservationDate(q);
      if (!date) return { error: 'What date is the reservation for? (e.g. "book a table for 4 tomorrow at 7pm for John")' };
      const time = parseReservationTime(q) || '19:00';
      const party = extractPartySize(q) || 2;
      const phone = extractPhone(q);
      let name = null;
      const m = q.match(/\b(?:for|under|name[d]?)\s+([a-z][a-z .'-]{1,40})/i);
      if (m) {
        let cand = m[1].trim().replace(/\b(at|on|tomorrow|today|tonight|next|people|guests|pax|persons?|covers?)\b.*$/i, '').trim();
        if (cand && !DAYS.includes(cand.toLowerCase()) && !MON3.includes(cand.slice(0, 3).toLowerCase())) name = cand.replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return { params: { customer_name: name || 'Guest', customer_phone: phone, party_size: party, reservation_date: date, reservation_time: time } };
    },
    plan(ctx, p) {
      return { summary: `Reserve a table for ${p.party_size} on ${p.reservation_date} at ${p.reservation_time}${p.customer_name && p.customer_name !== 'Guest' ? ` for ${p.customer_name}` : ''}` };
    },
    async execute(ctx, p) {
      const r = await reservations.createReservation(ctx.outletId, {
        customer_name: p.customer_name, customer_phone: p.customer_phone,
        party_size: p.party_size, reservation_date: p.reservation_date, reservation_time: p.reservation_time,
      });
      return { message: `Done — reserved ${r && r.table_number ? `table ${r.table_number}` : 'a table'} for ${p.party_size} on ${p.reservation_date} at ${p.reservation_time}${p.customer_name && p.customer_name !== 'Guest' ? ` under ${p.customer_name}` : ''}.`, entity_type: 'reservation', entity_id: r && r.id };
    },
  },

  {
    name: 'send_campaign',
    label: 'send a marketing campaign to customers',
    permission: 'MANAGE_CAMPAIGNS',
    warn: true, // outward-facing (messages real customers) → stronger confirmation in the UI
    keywords: ['send a campaign', 'send campaign', 'marketing campaign', 'send an sms', 'send sms', 'sms to', 'sms my', 'text all customers', 'text my customers', 'text customers', 'text my', 'text all', 'text to', 'message my customers', 'message all', 'email my customers', 'email my', 'email all', 'email vip', 'whatsapp my customers', 'whatsapp my', 'whatsapp all', 'blast', 'promo to customers', 'send promo', 'send a promo'],
    async extract(ctx, q) {
      const message = extractMessage(q);
      if (!message) return { error: 'What message should I send? Put it in quotes, e.g. text VIPs saying "2-for-1 this Friday".' };
      if (message.length > 1000) return { error: 'That message is too long (max 1000 characters).' };
      const channel = detectChannel(q);
      const segment = detectSegment(q);
      const count = await countCampaignRecipients(ctx.outletId, segment);
      if (!count) return { error: `There are no ${segment === 'all' ? '' : `${segment} `}customers to message.` };
      return { params: { channel, segment, message, count, name: `Assistant ${channel.toUpperCase()} — ${segment}` } };
    },
    plan(ctx, p) {
      return { summary: `Send a ${p.channel.toUpperCase()} to ${p.count} ${p.segment === 'all' ? '' : `${p.segment} `}customer${p.count === 1 ? '' : 's'}: “${p.message}”` };
    },
    async execute(ctx, p) {
      await customer.createCampaign(ctx.outletId, { name: p.name, type: p.channel, target_segment: p.segment, message: p.message });
      return { message: `Sent — your ${p.channel.toUpperCase()} campaign went to ${p.count} customer${p.count === 1 ? '' : 's'}.`, entity_type: 'campaign' };
    },
  },

  {
    name: 'apply_discount',
    label: 'apply a discount to an order',
    // Same RBAC key the discount route enforces: order.routes → hasPermission('MANAGE_ORDERS').
    permission: 'MANAGE_ORDERS',
    warn: true, // changes a live bill total → stronger confirmation in the UI
    keywords: [
      'apply discount', 'apply a discount', 'apply the discount', 'give a discount', 'give discount',
      'give them a discount', 'add a discount', 'add discount', 'discount the order', 'discount this order',
      'discount the bill', 'discount the total', 'discount on order', 'discount order', 'discount of',
      '% discount', 'percent discount', 'percentage discount', 'comp the order', 'comp this order',
      'comp the bill', '% off', 'off order', 'off this order', 'off the order', 'off the bill',
      'off the total', 'off the tab', 'percent off', 'percentage off',
    ],
    async extract(ctx, q) {
      const disc = extractDiscount(q);
      if (!disc || !(disc.discount_value > 0)) {
        return { error: 'How much discount should I apply? e.g. "apply 10% off order 42" or "$5 off table 3".' };
      }
      if (disc.discount_type === 'percentage' && disc.discount_value > 100) {
        return { error: "A percentage discount can't be more than 100%." };
      }
      const res = await resolveDiscountOrder(ctx, q);
      if (res.error) return { error: res.error };
      const o = res.order;
      const subtotal = Number(o.subtotal) || 0;
      const est = disc.discount_type === 'percentage'
        ? round2(subtotal * (Math.min(disc.discount_value, 100) / 100))
        : round2(Math.min(disc.discount_value, subtotal));
      return {
        params: {
          order_id: o.id,
          order_number: o.order_number,
          discount_type: disc.discount_type,
          discount_value: disc.discount_value,
          discount_reason: extractReason(q),
          // display-only snapshot; execute() recomputes off the LIVE order.
          est_amount: est,
          subtotal,
        },
      };
    },
    plan(ctx, p) {
      const amt = p.discount_type === 'percentage' ? `${p.discount_value}%` : money(ctx.currency, p.discount_value);
      const est = p.discount_type === 'percentage'
        ? ` (≈ ${money(ctx.currency, p.est_amount)} off a ${money(ctx.currency, p.subtotal)} bill)`
        : '';
      return { summary: `Apply a ${amt} discount to order #${p.order_number}${est}${p.discount_reason ? ` — reason: "${p.discount_reason}"` : ''}` };
    },
    async execute(ctx, p) {
      const prisma = getDbClient();
      // Re-fetch the LIVE order (with the head_office tax config) exactly like the
      // apply-discount controller — never trust the preview snapshot for the write.
      const order = await prisma.order.findFirst({
        where: { id: p.order_id, is_deleted: false, outlet_id: ctx.outletId },
        include: { outlet: { include: { head_office: { select: { country_code: true, region: true, gst_inclusive: true, currency: true } } } } },
      });
      if (!order) throw new Error('Order not found');
      if (!DISCOUNTABLE_STATUSES.includes(order.status)) {
        throw new Error(`Cannot apply discount on an order with status '${order.status}'`);
      }
      const subtotal = Number(order.subtotal) || 0;
      let discountAmount = p.discount_type === 'percentage'
        ? subtotal * (Math.min(Number(p.discount_value) || 0, 100) / 100)
        : (Number(p.discount_value) || 0);
      discountAmount = Math.min(discountAmount, subtotal); // never exceed the bill
      const loyaltyDiscount = Number(order.loyalty_discount) || 0;

      const totals = await computeDiscountedTotals(prisma, p.order_id, order.outlet, discountAmount, loyaltyDiscount);

      await prisma.order.update({
        where: { id: p.order_id },
        data: {
          discount_type: p.discount_type,
          discount_value: p.discount_value,
          discount_amount: totals.discount_amount,
          discount_reason: p.discount_reason || null,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          total_tax: totals.total_tax,
          total_amount: totals.total_amount,
          round_off: totals.round_off,
          grand_total: totals.grand_total,
        },
      });
      const amt = p.discount_type === 'percentage' ? `${p.discount_value}%` : money(ctx.currency, p.discount_value);
      return {
        message: `Done — applied a ${amt} discount (${money(ctx.currency, totals.discount_amount)}) to order #${p.order_number}. New total: ${money(ctx.currency, totals.grand_total)}.`,
        entity_type: 'order',
        entity_id: p.order_id,
      };
    },
  },
];

// money helper (mirrors the tools' formatter)
function money(cur, n) {
  const c = cur || 'AUD';
  const locale = c === 'INR' ? 'en-IN' : 'en-AU';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(Number(n) || 0); }
  catch (_) { return `${c} ${(Number(n) || 0).toFixed(2)}`; }
}

// ── detection (keyword scoring, like the read-tool router) ────────────────────
// How-to / help phrasings ("how do I 86 an item?", "where do I…", "steps to…")
// are QUESTIONS about the app, not commands to run — never a write action.
const HOWTO_RE = /\b(how (do|to|can|does|would)|where (is|do|can)|steps to|step by step|tutorial|guide|explain how|walk me through)\b/;

function detectAction(question) {
  const q = String(question || '').toLowerCase();
  if (HOWTO_RE.test(q)) return null;
  let best = null; let bestScore = 0;
  for (const a of ACTIONS) {
    let score = 0;
    for (const k of a.keywords) if (q.includes(k)) score += k.trim().split(/\s+/).length;
    // An action may also declare a `match` regex for intents its keywords can't
    // catch as contiguous substrings (e.g. "update <item> price", where the item
    // name sits between the verb and "price"). A regex hit is a strong signal.
    if (a.match && a.match.test(q)) score += 3;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore > 0 ? best : null;
}

// ── multi-turn: pronoun / anaphora resolution for menu-item actions ───────────
// A pronoun standing in for "the item we were just talking about".
const PRONOUN_RE = /\bit\b|\bthat\b|\bthis (one|item|dish)\b|\bsame\b|\bthe item\b/i;

/**
 * A follow-up that leans on the previous turn ("change it by 10%", "make that
 * unavailable", "set the same item to 12") won't match a menu-item action's
 * keywords/regex, because the item name is missing. Infer adjust_price / 86_item
 * from the pronoun + the price/availability signal so buildActionPreview can then
 * resolve the actual item from history. Excludes how-to phrasings (same guard as
 * detectAction). Returns an ACTION or null — never mutates.
 * @param {string} question
 * @returns {object|null}
 */
function inferPronounAction(question) {
  const q = String(question || '').toLowerCase();
  if (!PRONOUN_RE.test(q) || HOWTO_RE.test(q)) return null;
  const byName = (n) => ACTIONS.find((a) => a.name === n);
  // Availability signal → 86 / un-86.
  if (/\b(un[- ]?86|86'?d?|unavailable|available|sold[ -]?out|disable|enable|stop selling|off the menu|back on the menu)\b/.test(q)) return byName('86_item') || null;
  // Price signal: the word price/cost, or a change verb paired with a number.
  if (/\b(price|cost)\b/.test(q) || (/\b(change|set|adjust|update|increase|decrease|raise|lower|reduce|drop|bump|hike|revise|reprice|put|bring|make)\b/.test(q) && /\d/.test(q))) return byName('adjust_price') || null;
  return null;
}

/** Substitute the resolved item name in for the pronoun so the action's own
 *  extract (which reads the name out of the question) can resolve it. */
function injectItemName(question, itemName) {
  const s = String(question || '');
  return PRONOUN_RE.test(s) ? s.replace(PRONOUN_RE, itemName) : `${itemName} ${s}`;
}

/**
 * Scan chat history NEWEST-first for the most recent USER turn that names exactly
 * ONE menu item (via the existing resolveMenuItem). Returns that item
 * {id,name,…} or null — an ambiguous prior turn resolves to null so we never
 * guess. Accepts both normalized ({role,text}) and raw history entries. Read-only.
 * @param {string} outletId
 * @param {{role:string,text:string}[]} history
 * @returns {Promise<object|null>}
 */
async function lastMenuItemFromHistory(outletId, history) {
  if (!outletId || !Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (!h || h.role !== 'user' || typeof h.text !== 'string') continue;
    const name = isolateName(h.text, PRICE_STOPWORDS);
    if (!name) continue;
    const matches = await resolveMenuItem(outletId, name);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

/**
 * Anaphora resolution for the two menu-item actions. When the action's own
 * extract could NOT resolve an item AND the follow-up leans on the previous turn
 * (a pronoun, or no item named at all), pull the most recent menu item from
 * `history` and RE-RUN the action's extract with that name substituted for the
 * pronoun. Returns the improved extract result, or the ORIGINAL `ex` when history
 * yields nothing (→ the existing clarify). An explicit but unresolved/ambiguous
 * name is left alone, so it never guesses across items. Read-only.
 * @returns {Promise<object>} an extract result ({params}|{error})
 */
async function resolveMenuItemAnaphora(userCtx, action, question, ex, history) {
  if (!action || (action.name !== 'adjust_price' && action.name !== '86_item')) return ex;
  if (ex && ex.params) return ex; // extract already resolved the item
  const q = String(question || '');
  // Only resolve from context when the user relied on it: a pronoun, or no item
  // name at all. An explicit (but unmatched/ambiguous) name keeps its own clarify.
  if (!PRONOUN_RE.test(q) && isolateName(q, PRICE_STOPWORDS)) return ex;
  const item = await lastMenuItemFromHistory(userCtx.outletId, history);
  if (!item) return ex; // nothing usable in history → keep the existing clarify
  const re = await action.extract(userCtx, injectItemName(q, item.name));
  return re || ex;
}

// ── compound (batch) detection ───────────────────────────────────────────────
// Verbs that begin a NEW action clause. Used to decide whether an " and " is a
// clause boundary ("… and set the price …") or just part of an item name
// ("fish and chips", "mac and cheese" — right side is a noun, not a verb).
const ACTION_VERBS = '86|un-?86|set|change|update|adjust|mark|make|free|clean|create|add|draft|order|reserve|book|send|text|email|apply|discount|increase|decrease|raise|lower';
// Strong, UNCONDITIONAL clause separators (order the longer ' and then ' before
// ' then ' so the whole connector is consumed as one).
const STRONG_SPLIT_RE = /\s*;\s*|\n+|\s+and then\s+|\s+then\s+|\s+also\s+|\s+plus\s+/i;
// An ' and ' that begins a fresh action clause (right side starts with a verb).
const AND_SPLIT_RE = new RegExp(`\\s+and\\s+(?=(?:${ACTION_VERBS})\\b)`, 'i');

/**
 * Split a possibly-compound message into per-action segments and detect each.
 * Splits ONLY on strong connectors (';', ' then ', ' and then ', ' also ',
 * ' plus ', newline) and on ' and ' when the right side starts with an action
 * verb — so item names like "fish and chips" are never torn apart. Non-action
 * (null) segments are dropped and duplicate segments de-duped.
 * @param {string} question
 * @returns {{action:object, segment:string}[]}
 */
function detectActions(question) {
  const raw = String(question || '');
  const segments = [];
  for (const chunk of raw.split(STRONG_SPLIT_RE)) {
    for (const piece of String(chunk).split(AND_SPLIT_RE)) {
      const seg = piece.trim();
      if (seg) segments.push(seg);
    }
  }
  const out = [];
  const seen = new Set();
  for (const seg of segments) {
    const key = seg.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    const action = detectAction(seg);
    if (!action) continue;
    seen.add(key);
    out.push({ action, segment: seg });
  }
  return out;
}

// ── signed action tokens ─────────────────────────────────────────────────────
function signActionToken(payload) {
  return jwt.sign({ scope: 'assistant_action', ...payload }, appConfig.jwt.secret, { expiresIn: '10m' });
}
function verifyActionToken(token) {
  const decoded = jwt.verify(token, appConfig.jwt.secret);
  if (decoded.scope !== 'assistant_action') throw new Error('wrong token scope');
  return decoded;
}

/**
 * Build a confirmation PREVIEW for a write intent — or a denial / clarification /
 * null (not a write). NEVER mutates.
 * @param {{id,role,outletId,permissions,currency?,headOfficeId?}} userCtx
 * @param {string} question
 * @param {{role:string,text:string}[]} [history]  normalized chat history (for pronoun follow-ups)
 * @returns {Promise<null | {denied:true,message} | {clarify:true,message} | {action,summary,token}>}
 */
async function buildActionPreview(userCtx, question, history = []) {
  // A pronoun follow-up ("change it by 10%") whose phrasing alone doesn't name an
  // action still routes to the menu-item action it refers to.
  const action = detectAction(question) || inferPronounAction(question);
  if (!action || !userCtx.outletId) return null;
  if (!userHasPermission(userCtx, action.permission)) {
    return { denied: true, message: `You don't have permission to ${action.label}. Ask an owner or manager.` };
  }
  let ex;
  try {
    ex = await action.extract(userCtx, question);
  } catch (err) {
    logger.warn('assistant action extract failed', { action: action.name, error: err.message });
    return { clarify: true, message: `I couldn't work out the details for that — try being more specific.` };
  }
  // Multi-turn: resolve a pronoun / omitted item from the previous turn before
  // falling back to a clarify.
  ex = await resolveMenuItemAnaphora(userCtx, action, question, ex, history);
  if (!ex || ex.error) return { clarify: true, message: (ex && ex.error) || 'I need a bit more detail to do that.' };
  const preview = action.plan(userCtx, ex.params);
  const token = signActionToken({ action: action.name, params: ex.params, outletId: userCtx.outletId, userId: userCtx.id });
  return { action: action.name, summary: preview.summary, token, warn: !!action.warn };
}

/**
 * Build a COMBINED preview for a compound message that holds 2+ write actions.
 * REUSES each action's own flow — permission check (userHasPermission) + extract
 * + plan — all of which are read-only, so this NEVER mutates. Denied or
 * needs-more-detail sub-actions are still listed (with a note) while the valid
 * ones proceed. Exactly ONE signed batch token is minted carrying every
 * executable sub-action's {action, params}.
 *
 * Returns null when the message has fewer than 2 detected actions, so the caller
 * falls through to the UNCHANGED single-action path.
 * @param {{id,role,outletId,permissions,currency?,headOfficeId?}} userCtx
 * @param {string} question
 * @param {{role:string,text:string}[]} [history]  normalized chat history (for pronoun follow-ups)
 * @returns {Promise<null | {action:'batch', summary:string, warn:boolean, items:{summary:string,warn:boolean}[], token:string}>}
 */
async function buildBatchPreview(userCtx, question, history = []) {
  if (!userCtx || !userCtx.outletId) return null;
  const detected = detectActions(question);
  if (detected.length < 2) return null;

  const items = [];       // everything shown in the preview (incl. denied / clarify notes)
  const executable = [];  // only these carry params → they go into the ONE token
  let anyWarn = false;

  for (const { action, segment } of detected) {
    if (!userHasPermission(userCtx, action.permission)) {
      items.push({ summary: `${action.label} — you don't have permission`, warn: false });
      continue;
    }
    let ex;
    try {
      ex = await action.extract(userCtx, segment);
    } catch (err) {
      logger.warn('assistant batch extract failed', { action: action.name, error: err.message });
      items.push({ summary: `${action.label} — I couldn't work out the details`, warn: false });
      continue;
    }
    // Multi-turn: a pronoun sub-action ("… and 86 it") resolves off history too.
    ex = await resolveMenuItemAnaphora(userCtx, action, segment, ex, history);
    if (!ex || ex.error) {
      items.push({ summary: (ex && ex.error) || `${action.label} — I need a bit more detail`, warn: false });
      continue;
    }
    const warn = !!action.warn;
    if (warn) anyWarn = true;
    items.push({ summary: action.plan(userCtx, ex.params).summary, warn });
    executable.push({ action: action.name, params: ex.params });
  }

  const token = signActionToken({ batch: true, items: executable, outletId: userCtx.outletId, userId: userCtx.id });
  return { action: 'batch', summary: `these ${items.length} things`, warn: anyWarn, items, token };
}

/** Redact secret params (PIN/password) before they're written to the audit log. */
function redactActionParams(params) {
  if (!params || typeof params !== 'object') return params;
  const clone = { ...params };
  for (const k of Object.keys(clone)) {
    if (/pin|passcode|password|secret/i.test(k)) clone[k] = '***';
  }
  return clone;
}

/**
 * Execute a previously previewed action after the user confirms. Re-verifies the
 * token, that it belongs to THIS user + outlet, and that the permission still
 * holds, then calls the real service and writes an audit-log entry.
 * @param {{id,role,outletId,permissions,currency?,headOfficeId?}} userCtx
 * @param {string} token
 * @returns {Promise<{ok:boolean, message:string}>}
 */
async function runAction(userCtx, token) {
  let payload;
  try {
    payload = verifyActionToken(token);
  } catch (_) {
    return { ok: false, message: 'That confirmation has expired — please ask again.' };
  }
  if (payload.userId !== userCtx.id || payload.outletId !== userCtx.outletId) {
    return { ok: false, message: 'That confirmation is not valid for this session.' };
  }
  // Compound confirmation: run every sub-action, reporting per-item success.
  if (payload.batch) return runBatch(userCtx, payload);
  const action = ACTIONS.find((a) => a.name === payload.action);
  if (!action) return { ok: false, message: 'That action is no longer available.' };
  if (!userHasPermission(userCtx, action.permission)) {
    return { ok: false, message: `You don't have permission to ${action.label}.` };
  }
  let result;
  try {
    result = await action.execute(userCtx, payload.params);
  } catch (err) {
    logger.error('assistant action execute failed', { action: action.name, error: err.message });
    return { ok: false, message: err.message && /already exists|not found|invalid/i.test(err.message) ? err.message : "That didn't go through — please try from the relevant screen." };
  }
  // Audit: assistant-initiated writes are traceable alongside UI actions.
  try {
    await getDbClient().auditLog.create({
      data: {
        user_id: userCtx.id,
        outlet_id: userCtx.outletId,
        action: `ASSISTANT_${action.name.toUpperCase()}`,
        entity_type: result.entity_type || 'assistant_action',
        entity_id: result.entity_id || null,
        new_values: redactActionParams(payload.params),
      },
    });
  } catch (e) { logger.warn('assistant action audit-log failed', { error: e.message }); }
  return { ok: true, message: result.message };
}

/**
 * Execute a confirmed BATCH token. Each sub-action re-checks its own RBAC
 * permission (in case it was revoked between preview and confirm), runs through
 * the SAME service the single path uses, and is audited on success as
 * ASSISTANT_<ACTION> — mirroring runAction()'s single-action audit. One failing
 * sub-action never aborts the rest; the result reports a per-item ✓/✗ line.
 * @param {object} userCtx
 * @param {{items:{action:string,params:object}[]}} payload  verified batch token
 * @returns {Promise<{ok:boolean, done:boolean, message:string, results:{summary:string,ok:boolean,message:string}[]}>}
 */
async function runBatch(userCtx, payload) {
  const list = Array.isArray(payload.items) ? payload.items : [];
  const results = [];
  for (const it of list) {
    const action = ACTIONS.find((a) => a.name === it.action);
    // A concise label for the ✓/✗ line — the plan summary, falling back to the
    // action's label if plan() can't render it.
    let label = (action && action.label) || it.action;
    try { if (action) label = action.plan(userCtx, it.params).summary; } catch (_) { /* keep label */ }

    if (!action) { results.push({ summary: label, ok: false, message: 'no longer available' }); continue; }
    if (!userHasPermission(userCtx, action.permission)) {
      results.push({ summary: label, ok: false, message: 'no permission' });
      continue;
    }
    let result;
    try {
      result = await action.execute(userCtx, it.params);
    } catch (err) {
      logger.error('assistant batch item execute failed', { action: action.name, error: err.message });
      const msg = err.message && /already exists|not found|invalid/i.test(err.message) ? err.message : "didn't go through";
      results.push({ summary: label, ok: false, message: msg });
      continue;
    }
    // Audit each successful sub-action, exactly like the single-action path.
    try {
      await getDbClient().auditLog.create({
        data: {
          user_id: userCtx.id,
          outlet_id: userCtx.outletId,
          action: `ASSISTANT_${action.name.toUpperCase()}`,
          entity_type: result.entity_type || 'assistant_action',
          entity_id: result.entity_id || null,
          new_values: redactActionParams(it.params),
        },
      });
    } catch (e) { logger.warn('assistant batch audit-log failed', { error: e.message }); }
    results.push({ summary: label, ok: true, message: result.message });
  }
  const parts = results.map((r) => (r.ok ? `✓ ${r.summary}` : `✗ ${r.summary} — ${r.message}`));
  const okAll = results.length > 0 && results.every((r) => r.ok);
  return {
    ok: okAll,
    done: true,
    message: results.length ? `Done: ${parts.join('; ')}` : 'Nothing to do.',
    results,
  };
}

module.exports = {
  ACTIONS,
  detectAction,
  detectActions,
  inferPronounAction,
  buildActionPreview,
  buildBatchPreview,
  runAction,
  userHasPermission,
  signActionToken,
  verifyActionToken,
  // exported for tests:
  lastMenuItemFromHistory,
  resolveMenuItem,
  resolveTable,
  extractPrice,
  extractPhone,
  extractTableNumber,
  isolateName,
  parseReservationDate,
  parseReservationTime,
  extractPartySize,
  detectChannel,
  detectSegment,
  extractMessage,
  extractDiscount,
  extractOrderNumber,
  extractReason,
  resolveDiscountOrder,
  computeDiscountedTotals,
  menuResolveCategory,
  stfResolveStaff,
  stfExtractStaffName,
  stfExtractPin,
  stfClockName,
  stfParseTimeRange,
  stfShiftName,
  promoParseDays,
  promoParseTimeWindow,
  promoResolveTarget,
  promoExtractCode,
  promoExtractPoints,
  promoResolveCustomer,
};
