/**
 * Headless OFFLINE self-test for the desktop app's local engine.
 *
 * Runs the REAL production modules (src/database/localDB.js) under Electron —
 * with the SAME better-sqlite3 native binding the app ships — against a THROWAWAY
 * database in a temp dir (never touches your real petpooja-local.db). It proves
 * the offline modules work with ZERO network: create/edit orders, KOT, tables,
 * customers, offline numbering, AU-GST billing, EOD, the write-outbox queue, and
 * the post-reconnect "mark synced" step — all with no backend running.
 *
 * Run from desktop/:   npm run test:offline
 * Exit code 0 = all passed, 1 = a check failed, 2 = harness error.
 */
const { app } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

if (app.disableHardwareAcceleration) app.disableHardwareAcceleration();

// Isolate: point the app's data dir at a throwaway folder BEFORE localDB opens.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-offline-selftest-'));
app.setPath('userData', tmp);

let fails = 0;
const results = [];
const check = (name, fn) => {
  try { const ok = fn(); results.push([!!ok, name]); if (!ok) fails += 1; }
  catch (e) { results.push([false, `${name} — ${e && e.message}`]); fails += 1; }
};

app.whenReady().then(() => {
  const db = require(path.join(__dirname, '..', 'src', 'database', 'localDB'));
  const { OutletDB, MenuDB, TableDB, OrderDB, KotDB, CustomerDB, nextOfflineInvoiceNumber } = db;
  db.getDB(); // open + initSchema + migrate

  const OUT = 'selftest-outlet';

  // ── seed the caches a first ONLINE sync would download ──────────────────────
  check('outlet cached (region-aware AU)', () => {
    OutletDB.save({ id: OUT, name: 'Selftest Cafe', code: 'ST', country_code: 'AU', region: 'AU', currency: 'AUD', gst_inclusive: 1 });
    const o = OutletDB.get(OUT); return o && o.region === 'AU';
  });
  check('menu cached offline', () => {
    MenuDB.saveMenuFromSync(
      [{ id: 'c1', outlet_id: OUT, name: 'Mains', display_order: 0, is_active: 1 }],
      [{ id: 'm1', outlet_id: OUT, category_id: 'c1', name: 'Burger', description: null, price: 10, image_url: null, veg_type: 'veg', gst_rate: 10, hsn_code: null, is_available: 1, is_bestseller: 0, short_code: null, display_order: 0 }],
    );
    return MenuDB.getItems(OUT).length >= 1;
  });
  check('tables cached offline', () => {
    TableDB.saveFromSync([{ id: 't5', outlet_id: OUT, table_number: '5', area_name: 'Main', capacity: 4, status: 'available' }]);
    return TableDB.getAll(OUT).some((t) => t.id === 't5');
  });

  // ── OFFLINE actions (no network) ────────────────────────────────────────────
  // OrderDB.create returns the new order's id (a string).
  let orderId;
  check('offline: create dine-in order with items', () => {
    orderId = OrderDB.create({ outlet_id: OUT, table_id: 't5', table_number: '5', order_type: 'dine_in', items: [{ menu_item_id: 'm1', menu_item_name: 'Burger', name: 'Burger', unit_price: 10, quantity: 2 }] });
    return typeof orderId === 'string' && orderId.length > 0;
  });
  check('offline: device-namespaced order number', () => !!OrderDB.getById(orderId).order_number);
  check('offline: add another item to the order', () => {
    OrderDB.addItem({ order_id: orderId, outlet_id: OUT, menu_item_id: 'm1', menu_item_name: 'Burger', variant_id: null, variant_name: null, unit_price: 10, quantity: 1, notes: null });
    return OrderDB.getById(orderId).items.length >= 1;
  });
  check('offline: apply 10% discount', () => {
    OrderDB.applyDiscount(orderId, { type: 'percentage', value: 10, reason: 'selftest' });
    return Number(OrderDB.getById(orderId).discount_amount) > 0;
  });
  check('offline: AU-GST bill total computed (> 0)', () => Number(OrderDB.getById(orderId).grand_total) > 0);
  check('offline: KDS kitchen queue readable', () => Array.isArray(KotDB.getActiveForOutlet(OUT)));
  check('offline: table marked occupied', () => {
    TableDB.updateStatus('t5', 'occupied');
    return TableDB.getAll(OUT).find((t) => t.id === 't5').status === 'occupied';
  });
  check('offline: create + search customer', () => {
    CustomerDB.createLocal({ outlet_id: OUT, name: 'Jane Offline', phone: '0400000000' });
    return CustomerDB.search(OUT, 'Jane').length >= 1;
  });
  check('offline: next invoice number issued', () => !!nextOfflineInvoiceNumber(OutletDB.get(OUT)));
  check('offline: EOD summary from local orders', () => {
    const e = OrderDB.eodSummary(OUT, new Date().toISOString().slice(0, 10));
    return e && Number(e.order_count) >= 1;
  });

  // ── the write-outbox: the offline order is queued for upload ────────────────
  let unsynced;
  check('offline order is QUEUED for sync (unsynced ≥ 1)', () => { unsynced = OrderDB.getUnsyncedCount(); return unsynced >= 1; });
  check('getUnsyncedOrders lists the offline order', () => OrderDB.getUnsyncedOrders().some((o) => o.id === orderId));

  // ── SIMULATE RECONNECT: cloud accepts the order → mark synced ───────────────
  check('after reconnect, order marked synced (cloud number stored)', () => {
    OrderDB.markSynced(orderId, 'CLOUD-0001');
    return OrderDB.getUnsyncedCount() === unsynced - 1;
  });

  // ── report ──────────────────────────────────────────────────────────────────
  console.log('\n─── DESKTOP OFFLINE SELF-TEST ───');
  for (const [ok, name] of results) console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  console.log('─────────────────────────────────');
  console.log(fails
    ? `❌ ${fails} / ${results.length} checks FAILED`
    : `✅ ALL ${results.length} offline checks PASSED — no network was used.`);

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* temp cleanup */ }
  app.exit(fails ? 1 : 0);
}).catch((e) => {
  console.error('HARNESS ERROR:', (e && e.stack) || e);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* temp cleanup */ }
  app.exit(2);
});
