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
function extractPhone(q) {
  const m = String(q).replace(/[^\d+]/g, ' ').match(/(\+?\d[\d ]{7,14}\d)/);
  return m ? m[1].replace(/\s/g, '') : null;
}
function extractTableNumber(q) {
  const m = q.match(/table\s*#?\s*([a-z]?\d+[a-z]?)/i) || q.match(/\b(?:no\.?|number)\s*([a-z]?\d+)/i);
  return m ? m[1] : null;
}
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
    async extract(ctx, q) {
      const price = extractPrice(q);
      if (price == null || !(price >= 0)) return { error: 'What price should I set? (e.g. "set garlic naan to 8.50")' };
      const name = isolateName(q);
      if (!name) return { error: 'Which item’s price should I change?' };
      const matches = await resolveMenuItem(ctx.outletId, name);
      if (!matches.length) return { error: `I couldn't find a menu item matching "${name}".` };
      if (matches.length > 1) return { error: `"${name}" matched ${matches.length} items (${matches.slice(0, 4).map((m) => m.name).join(', ')}). Which one?` };
      const item = matches[0];
      return { params: { item_id: item.id, item_name: item.name, old_price: Number(item.base_price) || 0, new_price: price } };
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
];

// money helper (mirrors the tools' formatter)
function money(cur, n) {
  const c = cur || 'AUD';
  const locale = c === 'INR' ? 'en-IN' : 'en-AU';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(Number(n) || 0); }
  catch (_) { return `${c} ${(Number(n) || 0).toFixed(2)}`; }
}

// ── detection (keyword scoring, like the read-tool router) ────────────────────
function detectAction(question) {
  const q = String(question || '').toLowerCase();
  // How-to / help phrasings ("how do I 86 an item?", "where do I…", "steps to…")
  // are QUESTIONS about the app, not commands to run — never treat them as a
  // write action; they belong to help_howto.
  if (/\b(how (do|to|can|does|would)|where (is|do|can)|steps to|step by step|tutorial|guide|explain how|walk me through)\b/.test(q)) return null;
  let best = null; let bestScore = 0;
  for (const a of ACTIONS) {
    let score = 0;
    for (const k of a.keywords) if (q.includes(k)) score += k.trim().split(/\s+/).length;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore > 0 ? best : null;
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
 * @returns {Promise<null | {denied:true,message} | {clarify:true,message} | {action,summary,token}>}
 */
async function buildActionPreview(userCtx, question) {
  const action = detectAction(question);
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
  if (!ex || ex.error) return { clarify: true, message: (ex && ex.error) || 'I need a bit more detail to do that.' };
  const preview = action.plan(userCtx, ex.params);
  const token = signActionToken({ action: action.name, params: ex.params, outletId: userCtx.outletId, userId: userCtx.id });
  return { action: action.name, summary: preview.summary, token, warn: !!action.warn };
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
        new_values: payload.params,
      },
    });
  } catch (e) { logger.warn('assistant action audit-log failed', { error: e.message }); }
  return { ok: true, message: result.message };
}

module.exports = {
  ACTIONS,
  detectAction,
  buildActionPreview,
  runAction,
  userHasPermission,
  signActionToken,
  verifyActionToken,
  // exported for tests:
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
};
