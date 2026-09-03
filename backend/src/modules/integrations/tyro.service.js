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

/**
 * Stub for a purchase. Wired but does NOT call Tyro — leaving this live before
 * certification would push unbilled transactions at the merchant's real terminal.
 * Enable the body block after certification.
 */
async function initiatePurchase(_outletId, _payload) {
  const e = new Error('Tyro purchase flow is not enabled until the merchant completes Tyro certification. Contact Tyro to certify this POS integration.');
  e.status = 501;
  throw e;
}
async function initiateRefund(_outletId, _payload) {
  const e = new Error('Tyro refund flow is not enabled until the merchant completes Tyro certification.');
  e.status = 501;
  throw e;
}

module.exports = {
  CONFIG_KEYS,
  TYRO_HOSTS,
  loadConfig,
  saveSetting,
  validateConfig,
  probeHost,
  testConnection,
  pairTerminal,
  initiatePurchase,
  initiateRefund,
};
