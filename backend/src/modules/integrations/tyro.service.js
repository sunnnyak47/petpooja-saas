/**
 * @fileoverview Tyro EFTPOS integration service (AU market).
 *
 * Reads credentials the merchant enters via the Integrations Hub (stored as
 * `integration_tyro_*` in outletSetting by the shared /integrations/config PUT)
 * and exposes:
 *   - loadConfig(outletId)          — read all tyro_* settings back as one object
 *   - validateConfig(cfg)           — field-format checks (MID/TID length, env, etc.)
 *   - testConnection(outletId)      — validate + reachability probe to Tyro's host
 *   - pairTerminal(outletId, opts)  — call Tyro Pair API; persist returned integrationKey
 *
 * NOTE: Purchase / refund calls require Tyro POS certification. Those endpoints
 * are stubbed as clearly-marked TODOs so the wiring exists but nothing calls a
 * production Tyro endpoint until the merchant is certified. Certification is a
 * commercial process between the merchant / ISV and Tyro — see
 * https://integrations.tyro.com/ for the current developer program.
 *
 * @module modules/integrations/tyro.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

const TYRO_HOSTS = {
  sandbox: 'https://iclient-simulator.test.tyro.com',
  production: 'https://iclient.tyro.com',
};

// Headful iClient script (Tyro-hosted UI in iframe/modal). Loaded fresh from
// Tyro's CDN — bundling or self-hosting this violates PCI, per Tyro's own docs
// on the sibling Tyro Pay product. Same rule applies here for safety.
const ICLIENT_SCRIPTS = {
  sandbox: 'https://iclientsimulator.test.tyro.com/iclient-with-ui-v1.js',
  production: 'https://iclient.tyro.com/iclient-with-ui-v1.js',
};

function iClientScriptUrl(environment) {
  return ICLIENT_SCRIPTS[environment] || ICLIENT_SCRIPTS.sandbox;
}

const CONFIG_KEYS = [
  'mid',               // Tyro Merchant ID (a.k.a. MID)
  'tid',               // Terminal ID (8 digits)
  'integration_key',   // returned by Tyro Pair — persisted so we don't re-pair every session
  'api_key',           // POS-vendor API key issued by Tyro (for cloud/Connect flows)
  'merchant_name',     // display name printed on receipts
  'pos_product_name',  // required by Tyro Pair — the POS product identity
  'pos_product_vendor',
  'pos_product_version',
  'environment',       // 'sandbox' | 'production'
  'mock_mode',         // 'true' | 'false' — dev flag: skip real Tyro, simulate approvals locally
];

/** Read every integration_tyro_* setting for an outlet back as a flat object. */
async function loadConfig(outletId) {
  const prisma = getDbClient();
  const rows = await prisma.outletSetting.findMany({
    where: {
      outlet_id: outletId,
      is_deleted: false,
      setting_key: { startsWith: 'integration_tyro_' },
    },
  });
  const cfg = {};
  for (const r of rows) {
    const key = r.setting_key.replace(/^integration_tyro_/, '');
    cfg[key] = r.setting_value;
  }
  return cfg;
}

/** Persist a single tyro_* setting (used after Pair returns an integrationKey). */
async function saveSetting(outletId, key, value) {
  const prisma = getDbClient();
  const settingKey = `integration_tyro_${key}`;
  await prisma.outletSetting.upsert({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: settingKey } },
    update: { setting_value: String(value) },
    create: { outlet_id: outletId, setting_key: settingKey, setting_value: String(value) },
  });
}

/**
 * Field-level validation of a saved Tyro config. Returns { ok, errors, warnings }.
 * Never throws — callers surface the message to the user.
 */
function validateConfig(cfg) {
  const errors = [];
  const warnings = [];

  if (!cfg.mid || String(cfg.mid).trim().length < 4)
    errors.push('Merchant ID (MID) is required');
  if (!cfg.tid || !/^\d{8}$/.test(String(cfg.tid).trim()))
    errors.push('Terminal ID (TID) must be exactly 8 digits');
  if (!cfg.merchant_name || String(cfg.merchant_name).trim().length < 2)
    errors.push('Merchant / trading name is required (printed on receipts)');
  if (!cfg.pos_product_name)
    warnings.push('POS product name not set — Tyro requires this at pairing time');
  if (!cfg.environment || !['sandbox', 'production'].includes(cfg.environment))
    errors.push('Environment must be "sandbox" or "production"');
  if (cfg.environment === 'production' && !cfg.integration_key)
    warnings.push('No integration key yet — pair the terminal before taking live payments');

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Reachability probe. We don't call an authenticated Tyro endpoint (that requires
 * cert-issued credentials); instead we do a low-cost HEAD to the environment's
 * host to confirm the outlet's network can reach Tyro. That plus the format
 * check is what "setup successful" means at the config stage.
 */
async function probeHost(environment) {
  const host = TYRO_HOSTS[environment] || TYRO_HOSTS.sandbox;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(host, { method: 'HEAD', signal: controller.signal });
    clearTimeout(t);
    // Any 2xx/3xx/4xx from Tyro means the host is reachable and TLS handshaked.
    // We only treat network-level failure as "unreachable".
    return { reachable: true, status: res.status, host };
  } catch (err) {
    return { reachable: false, error: err.message, host };
  }
}

/** Full test: validate + reachability probe. Merchant sees this after "Test Connection". */
async function testConnection(outletId) {
  const cfg = await loadConfig(outletId);
  const v = validateConfig(cfg);
  if (!v.ok) {
    return { success: false, stage: 'validation', errors: v.errors, warnings: v.warnings };
  }
  const probe = await probeHost(cfg.environment);
  if (!probe.reachable) {
    return {
      success: false,
      stage: 'network',
      errors: [`Cannot reach Tyro ${cfg.environment} host (${probe.host}) — check outlet internet / firewall`],
      warnings: v.warnings,
      details: probe,
    };
  }
  return {
    success: true,
    stage: 'ready',
    message: v.warnings.length
      ? 'Tyro configured — ready to pair terminal. See warnings below.'
      : 'Tyro configured and Tyro host reachable. Ready to pair terminal.',
    warnings: v.warnings,
    details: {
      mid: cfg.mid,
      tid: cfg.tid,
      environment: cfg.environment,
      host: probe.host,
      paired: !!cfg.integration_key,
    },
  };
}

/**
 * Pair a terminal via Tyro's Pair API. This is a real HTTP call; it will fail
 * without real Tyro credentials, which is the correct behaviour — a merchant who
 * hasn't been certified/onboarded can't pair. On success we persist the returned
 * integrationKey so subsequent purchase/refund calls can reuse it.
 *
 * Docs: https://integrations.tyro.com/pos/rest/
 */
async function pairTerminal(outletId) {
  const cfg = await loadConfig(outletId);
  const v = validateConfig(cfg);
  if (!v.ok) {
    const err = new Error(v.errors.join('; '));
    err.status = 400;
    throw err;
  }
  const host = TYRO_HOSTS[cfg.environment] || TYRO_HOSTS.sandbox;
  const url = `${host}/v1/pairings`;
  const body = {
    mid: String(cfg.mid).trim(),
    tid: String(cfg.tid).trim(),
    posProductInfo: {
      posProductName: cfg.pos_product_name || 'PetPooja POS',
      posProductVendor: cfg.pos_product_vendor || 'PetPooja',
      posProductVersion: cfg.pos_product_version || '1.0.0',
    },
    merchantName: cfg.merchant_name,
  };
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.api_key) headers.Authorization = `Bearer ${cfg.api_key}`;

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (err) {
    logger.error('Tyro pair network failure', { outletId, error: err.message });
    const e = new Error(`Cannot reach Tyro (${err.message}). Check outlet internet and try again.`);
    e.status = 502;
    throw e;
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    logger.warn('Tyro pair rejected', { outletId, status: res.status, data });
    const msg = data?.errorMessage || data?.message || `Tyro rejected pairing (HTTP ${res.status})`;
    const e = new Error(msg);
    e.status = res.status;
    e.details = data;
    throw e;
  }

  const integrationKey = data.integrationKey || data.integration_key;
  if (!integrationKey) {
    const e = new Error('Tyro returned an unexpected response (no integrationKey). Check Tyro dashboard.');
    e.status = 502;
    e.details = data;
    throw e;
  }

  await saveSetting(outletId, 'integration_key', integrationKey);
  logger.info('Tyro terminal paired', { outletId, tid: cfg.tid });
  return { success: true, paired: true, tid: cfg.tid, mid: cfg.mid, environment: cfg.environment };
}

// ────────────────────────────────────────────────────────────────────────────
// Terminal transaction lifecycle (used by /tyro/transactions routes)
//
// The iClient runs in the POS browser and drives the terminal directly. The
// backend does NOT talk to Tyro during a purchase — it only records what the
// terminal returned so we have an authoritative audit trail for reconciliation
// with Tyro's daily settlement report.
//
// Flow:
//   1. POS calls startTransaction() BEFORE opening the iClient iframe.
//      → row created with status='pending', our_ref is the iClient transactionId
//   2. POS drives iClient in-browser; user taps card at terminal.
//   3. iClient transactionCompleteCallback fires with the result.
//   4. POS calls finaliseTransaction() with the full response.
//      → row updated with tyro_reference / receipts / status.
//
// Idempotency: startTransaction is idempotent by (outlet_id, our_ref). A retry
// with the same our_ref returns the existing pending row.
// ────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  'pending', 'in_progress',
  'approved', 'declined', 'cancelled', 'reversed', 'system_error', 'unknown',
]);

/** Map iClient's `result` string to our normalised status enum. */
function mapTyroResult(result) {
  const r = String(result || '').toUpperCase();
  if (r === 'APPROVED')           return 'approved';
  if (r === 'CANCELLED')          return 'cancelled';
  if (r === 'REVERSED')           return 'reversed';
  if (r === 'DECLINED')           return 'declined';
  if (r === 'SYSTEM ERROR')       return 'system_error';
  if (r === 'NOT STARTED')        return 'cancelled';
  return 'unknown';
}

/** Create (or return the existing) pending TerminalTransaction row. */
async function startTransaction(outletId, {
  order_id = null,
  our_ref,
  type = 'purchase',
  amount_cents,
  cashout_cents = 0,
  initiated_by = null,
}) {
  if (!our_ref) {
    const e = new Error('our_ref (idempotency key) is required');
    e.status = 400; throw e;
  }
  if (!Number.isInteger(amount_cents) || amount_cents < 0) {
    const e = new Error('amount_cents must be a non-negative integer');
    e.status = 400; throw e;
  }
  const prisma = getDbClient();
  const cfg = await loadConfig(outletId);

  // Idempotent: same (outlet, our_ref) returns the existing row unchanged.
  const existing = await prisma.terminalTransaction.findUnique({
    where: { outlet_id_our_ref: { outlet_id: outletId, our_ref } },
  });
  if (existing) return existing;

  return prisma.terminalTransaction.create({
    data: {
      outlet_id: outletId,
      order_id,
      provider: 'tyro',
      our_ref,
      mid: cfg.mid || null,
      tid: cfg.tid || null,
      type,
      amount_cents,
      cashout_cents,
      status: 'pending',
      initiated_by,
    },
  });
}

/**
 * Finalise a transaction with the iClient completion payload. The `raw`
 * argument is the entire response object as it came from the terminal — we
 * persist the whole thing plus extract the fields we care about for reporting.
 */
async function finaliseTransaction(id, raw = {}) {
  const prisma = getDbClient();
  const row = await prisma.terminalTransaction.findUnique({ where: { id } });
  if (!row) {
    const e = new Error('Terminal transaction not found');
    e.status = 404; throw e;
  }
  const status = mapTyroResult(raw.result);
  if (!TERMINAL_STATUSES.has(status)) {
    const e = new Error(`Unknown terminal status "${status}"`);
    e.status = 422; throw e;
  }

  // iClient amounts arrive as strings in cents; coerce defensively.
  const toInt = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  return prisma.terminalTransaction.update({
    where: { id },
    data: {
      status,
      tyro_reference: raw.transactionReference || raw.transactionReferenceNumber || null,
      authorisation_code: raw.authorisationCode || null,
      card_type: raw.cardType || null,
      elided_pan: raw.elidedPan || raw.maskedCard || null,
      rrn: raw.rrn || null,
      base_amount_cents: toInt(raw.baseAmount) ?? row.amount_cents,
      tip_cents: toInt(raw.tipAmount) ?? 0,
      surcharge_cents: toInt(raw.surchargeAmount) ?? 0,
      merchant_receipt: raw.merchantReceipt || null,
      customer_receipt: raw.customerReceipt || null,
      signature_required: !!raw.signatureRequired,
      error_code: raw.errorCode || null,
      error_message: raw.errorMessage || (status !== 'approved' ? raw.result : null),
      raw_response: raw,
      completed_at: new Date(),
    },
  });
}

/** Return a MOCK transactionCompleteCallback payload — dev/mock-mode only. */
function mockCompletionPayload({ our_ref, amount_cents, decline = false }) {
  const base = amount_cents;
  const tip = 0;
  const surcharge = 0;
  if (decline) {
    return {
      result: 'DECLINED',
      transactionId: our_ref,
      baseAmount: String(base),
      tipAmount: String(tip),
      surchargeAmount: String(surcharge),
      errorMessage: 'Do not honour (mock)',
    };
  }
  return {
    result: 'APPROVED',
    transactionId: our_ref,
    transactionReference: `MOCK-${Date.now()}`,
    authorisationCode: '123456',
    cardType: 'VISA',
    elidedPan: '**** **** **** 4242',
    rrn: String(Date.now()),
    baseAmount: String(base),
    tipAmount: String(tip),
    surchargeAmount: String(surcharge),
    merchantReceipt: 'MOCK MERCHANT RECEIPT — Not a real transaction',
    customerReceipt: 'MOCK CUSTOMER RECEIPT — Not a real transaction',
    signatureRequired: false,
  };
}

async function initiatePurchase(_outletId, _payload) {
  const e = new Error('Purchases run in-browser via iClient — the backend only records the result. Use POST /tyro/transactions to start, PATCH to finalise.');
  e.status = 501;
  throw e;
}
async function initiateRefund(_outletId, _payload) {
  const e = new Error('Refunds run in-browser via iClient — the backend only records the result. Use POST /tyro/transactions to start, PATCH to finalise.');
  e.status = 501;
  throw e;
}

module.exports = {
  CONFIG_KEYS,
  TYRO_HOSTS,
  ICLIENT_SCRIPTS,
  iClientScriptUrl,
  loadConfig,
  saveSetting,
  validateConfig,
  probeHost,
  testConnection,
  pairTerminal,
  startTransaction,
  finaliseTransaction,
  mapTyroResult,
  mockCompletionPayload,
  initiatePurchase,
  initiateRefund,
};
