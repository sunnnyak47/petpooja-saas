/**
 * @fileoverview SCHEDULED / RECURRING REPORT EXPORTS — "email me the P&L every
 * Monday", "send yesterday's EOD to accounts@ each morning".
 *
 * Persistence is MIGRATION-FREE: schedules live as a JSON array inside the
 * existing generic key/value table `outlet_settings` (Prisma model
 * `OutletSetting`, unique on [outlet_id, setting_key]) under a single key per
 * outlet — the SAME store Square / Xero / customer settings already use. No new
 * Prisma model, no migration.
 *
 * A schedule row = { id, module, format, cadence, day?, recipient?, currency,
 * created_at, last_run }. A daily cron (assistant.schedule.cron) calls
 * runDueSchedules(): for every outlet that has schedules it picks the ones due
 * today, regenerates the file through assistant.export.generate (same
 * permission-checked read services), and emails it as an attachment via
 * mail.service — then stamps last_run so it never double-sends.
 *
 * Nothing new is computed and nothing is written to business data: this module
 * only persists the *preference* of what to email and when.
 *
 * @module modules/assistant/assistant.schedule
 */

const crypto = require('crypto');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const xport = require('./assistant.export');
const mail = require('../../utils/mail.service');

const SETTING_KEY = 'assistant_scheduled_reports';
const CADENCES = ['daily', 'weekly', 'monthly'];
const FORMATS = ['pdf', 'xlsx', 'csv'];
// Reuse the export module's own list of exportable reports so the two can never
// drift apart.
const VALID_MODULES = Object.keys(xport.MODULE_LABEL);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── date helpers ─────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

// ── persistence (JSON blob inside outlet_settings) ───────────────────────────
async function _read(outletId) {
  const prisma = getDbClient();
  const row = await prisma.outletSetting.findUnique({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: SETTING_KEY } },
  });
  if (!row || !row.setting_value) return [];
  try {
    const arr = JSON.parse(row.setting_value);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

async function _write(outletId, list) {
  const prisma = getDbClient();
  const value = JSON.stringify(Array.isArray(list) ? list : []);
  await prisma.outletSetting.upsert({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: SETTING_KEY } },
    create: { outlet_id: outletId, setting_key: SETTING_KEY, setting_value: value, data_type: 'json' },
    update: { setting_value: value },
  });
}

// ── public: create / list / cancel ───────────────────────────────────────────
/**
 * Validate + normalise a caller's schedule request. Throws on bad input.
 * @returns {{module,format,cadence,day,recipient,currency}}
 */
function normalizeInput(input = {}) {
  const module = String(input.module || '').trim();
  if (!VALID_MODULES.includes(module)) {
    throw new Error(`Unknown report "${input.module}". Choose one of: ${VALID_MODULES.join(', ')}`);
  }
  const format = FORMATS.includes(input.format) ? input.format : 'pdf';
  const cadence = CADENCES.includes(input.cadence) ? input.cadence : 'daily';

  // day: weekly → 0(Sun)–6(Sat), default 1(Mon); monthly → 1–28, default 1.
  let day = null;
  if (cadence === 'weekly') {
    const d = Number.isInteger(input.day) ? input.day : 1;
    day = ((d % 7) + 7) % 7;
  } else if (cadence === 'monthly') {
    const d = Number.isInteger(input.day) ? input.day : 1;
    day = Math.min(28, Math.max(1, d));
  }

  let recipient = null;
  if (input.recipient != null && String(input.recipient).trim() !== '') {
    recipient = String(input.recipient).trim();
    if (!EMAIL_RE.test(recipient)) throw new Error(`"${recipient}" is not a valid email address`);
  }

  const currency = String(input.currency || 'AUD').toUpperCase();
  return { module, format, cadence, day, recipient, currency };
}

/**
 * Create a recurring export schedule for an outlet.
 * @param {string} outletId
 * @param {{module:string, format?:string, cadence?:string, day?:number, recipient?:string, currency?:string}} input
 * @returns {Promise<object>} the stored schedule
 */
async function createSchedule(outletId, input) {
  if (!outletId) throw new Error('outletId is required');
  const norm = normalizeInput(input);
  const list = await _read(outletId);
  const schedule = {
    id: crypto.randomUUID(),
    ...norm,
    created_at: new Date().toISOString(),
    last_run: null,
  };
  list.push(schedule);
  await _write(outletId, list);
  logger.info('[schedule] created', { outletId, id: schedule.id, module: norm.module, cadence: norm.cadence });
  return schedule;
}

/** List an outlet's schedules. */
async function listSchedules(outletId) {
  if (!outletId) return [];
  return _read(outletId);
}

/**
 * Cancel a schedule by id.
 * @returns {Promise<{removed:boolean, remaining:number}>}
 */
async function cancelSchedule(outletId, id) {
  if (!outletId || !id) return { removed: false, remaining: 0 };
  const list = await _read(outletId);
  const next = list.filter((s) => s.id !== id);
  const removed = next.length !== list.length;
  if (removed) await _write(outletId, next);
  return { removed, remaining: next.length };
}

// ── due-check + report window ────────────────────────────────────────────────
/**
 * The date range a given cadence covers, evaluated at `now`. Mirrors the digest
 * windows: daily = yesterday; weekly = trailing 7 days ending yesterday;
 * monthly = the previous calendar month.
 * @returns {{from:string, to:string, label:string}}
 */
function computeWindow(cadence, now = new Date()) {
  const today = dateOnly(now);
  const yesterday = addDays(today, -1);
  if (cadence === 'weekly') {
    const from = addDays(yesterday, -6);
    return { from: ymd(from), to: ymd(yesterday), label: `${ymd(from)} to ${ymd(yesterday)}` };
  }
  if (cadence === 'monthly') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: ymd(startOfMonth(prev)), to: ymd(endOfMonth(prev)), label: `${ymd(startOfMonth(prev))} to ${ymd(endOfMonth(prev))}` };
  }
  return { from: ymd(yesterday), to: ymd(yesterday), label: ymd(yesterday) };
}

/**
 * Is this schedule due to run on the day of `now`? Guarded by last_run so a
 * schedule fires at most once per day even if the cron runs twice.
 */
function isDue(schedule, now = new Date()) {
  if (!schedule || !CADENCES.includes(schedule.cadence)) return false;
  const today = dateOnly(now);
  const todayYmd = ymd(today);
  if (schedule.last_run === todayYmd) return false; // already sent today
  if (schedule.cadence === 'daily') return true;
  if (schedule.cadence === 'weekly') {
    const wanted = Number.isInteger(schedule.day) ? schedule.day : 1;
    return today.getDay() === wanted;
  }
  if (schedule.cadence === 'monthly') {
    const wanted = Number.isInteger(schedule.day) ? schedule.day : 1;
    return today.getDate() === wanted;
  }
  return false;
}

// ── recipient resolution ─────────────────────────────────────────────────────
/** Explicit recipient wins; else fall back to the outlet owner's email. */
async function resolveRecipient(outlet, schedule) {
  if (schedule.recipient) return schedule.recipient;
  if (!outlet || !outlet.owner_id) return null;
  try {
    const user = await getDbClient().user.findUnique({
      where: { id: outlet.owner_id }, select: { email: true },
    });
    return (user && user.email) || null;
  } catch (e) {
    logger.warn('[schedule] owner lookup failed', { outletId: outlet && outlet.id, error: e.message });
    return null;
  }
}

// ── run one / run all due ────────────────────────────────────────────────────
/**
 * Generate + email one schedule's report. Does NOT persist last_run (the caller
 * batches the writes). Returns a per-schedule outcome.
 */
async function runOne(outlet, schedule, now = new Date()) {
  const to = await resolveRecipient(outlet, schedule);
  if (!to) return { id: schedule.id, sent: false, reason: 'no_recipient' };

  const { from, to: rangeTo, label } = computeWindow(schedule.cadence, now);
  const currency = schedule.currency || (outlet && outlet.currency) || 'AUD';
  const payload = { outletId: outlet.id, module: schedule.module, from, to: rangeTo, format: schedule.format, currency };

  let file;
  try {
    const generated = new Date().toISOString().slice(0, 16).replace('T', ' ');
    file = await xport.generate(payload, outlet && outlet.name, generated);
  } catch (e) {
    logger.warn('[schedule] report generation failed', { outletId: outlet.id, id: schedule.id, error: e.message });
    return { id: schedule.id, sent: false, reason: 'generate_failed' };
  }

  const moduleLabel = xport.MODULE_LABEL[schedule.module] || schedule.module;
  const cadenceLabel = schedule.cadence.charAt(0).toUpperCase() + schedule.cadence.slice(1);
  const outletName = (outlet && outlet.name) || 'your outlet';
  const subject = `${cadenceLabel} ${moduleLabel} report — ${outletName} · ${label}`;
  const text = `Attached is your ${schedule.cadence} ${moduleLabel} report for ${outletName}.\n\nPeriod: ${label}\nFormat: ${String(schedule.format).toUpperCase()}\n\n— Your MS-RM assistant`;
  const html = scheduleEmailHtml({ cadenceLabel, moduleLabel, outletName, label, format: schedule.format });

  try {
    const res = await mail.sendMail({
      to, subject, text, html,
      attachments: [{ filename: file.filename, content: file.body, contentType: file.contentType }],
    });
    logger.info('[schedule] sent', { outletId: outlet.id, id: schedule.id, to, module: schedule.module });
    return { id: schedule.id, sent: true, to, transport: res && res.transport, filename: file.filename };
  } catch (e) {
    logger.warn('[schedule] send failed', { outletId: outlet.id, id: schedule.id, to, error: e.message });
    return { id: schedule.id, sent: false, reason: 'send_failed', to };
  }
}

/** Email body — inline styles, email-client safe. */
function scheduleEmailHtml({ cadenceLabel, moduleLabel, outletName, label, format }) {
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(cadenceLabel)} ${esc(moduleLabel)} report</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.06);">
        <tr><td style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 60%,#3b82f6 100%);padding:28px 32px;color:#fff;">
          <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;opacity:0.75;text-transform:uppercase;">${esc(cadenceLabel)} report · ${esc(label)}</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;margin-top:6px;">${esc(moduleLabel)}</div>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#334155;">Hi there,</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#334155;">Your scheduled <strong>${esc(moduleLabel)}</strong> report for <strong>${esc(outletName)}</strong> is attached as a ${esc(String(format).toUpperCase())} file.</p>
          <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#334155;">
            <div><strong>Period:</strong> ${esc(label)}</div>
            <div style="margin-top:4px;"><strong>Delivery:</strong> ${esc(cadenceLabel)}</div>
          </div>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:11.5px;color:#94a3b8;line-height:1.6;">Automated ${esc(cadenceLabel.toLowerCase())} report from your MS-RM assistant.<br>© ${new Date().getFullYear()} MS-RM · Replies aren't monitored.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Every outlet that has at least one schedule, joined to the outlet's name /
 * currency / owner. Skips inactive/deleted outlets.
 * @returns {Promise<Array<{outlet:object, schedules:Array}>>}
 */
async function listScheduledOutlets() {
  const prisma = getDbClient();
  let rows = [];
  try {
    rows = await prisma.outletSetting.findMany({
      where: { setting_key: SETTING_KEY, is_deleted: false },
      select: { outlet_id: true, setting_value: true },
    });
  } catch (e) {
    logger.warn('[schedule] settings scan failed', { error: e.message });
    return [];
  }
  const out = [];
  for (const row of rows || []) {
    let schedules = [];
    try { const a = JSON.parse(row.setting_value); schedules = Array.isArray(a) ? a : []; } catch (_) { schedules = []; }
    if (!schedules.length) continue;
    let outlet = null;
    try {
      outlet = await prisma.outlet.findUnique({
        where: { id: row.outlet_id },
        select: { id: true, name: true, currency: true, owner_id: true, is_active: true, is_deleted: true },
      });
    } catch (e) {
      logger.warn('[schedule] outlet lookup failed', { outletId: row.outlet_id, error: e.message });
    }
    if (!outlet || outlet.is_deleted || outlet.is_active === false) continue;
    out.push({ outlet, schedules });
  }
  return out;
}

/**
 * The cron entry point: run every schedule that is due today, email each, and
 * persist last_run. Sequential to keep mail throughput gentle; one schedule's
 * failure never blocks the others.
 * @param {{now?:Date|string}} [opts]
 */
async function runDueSchedules(opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const todayYmd = ymd(dateOnly(now));
  const groups = await listScheduledOutlets();
  let sent = 0; let skipped = 0; let outletsTouched = 0;

  for (const { outlet, schedules } of groups) {
    const due = schedules.filter((s) => isDue(s, now));
    if (!due.length) continue;
    outletsTouched += 1;
    for (const schedule of due) {
      try {
        const r = await runOne(outlet, schedule, now);
        if (r && r.sent) { schedule.last_run = todayYmd; sent += 1; } else skipped += 1;
      } catch (e) {
        skipped += 1;
        logger.warn('[schedule] run failed', { outletId: outlet.id, id: schedule.id, error: e.message });
      }
    }
    // Persist the updated last_run stamps for this outlet's whole list.
    try { await _write(outlet.id, schedules); }
    catch (e) { logger.warn('[schedule] last_run persist failed', { outletId: outlet.id, error: e.message }); }
  }

  logger.info('[schedule] run complete', { outlets: outletsTouched, sent, skipped });
  return { outlets: outletsTouched, sent, skipped };
}

module.exports = {
  SETTING_KEY, VALID_MODULES, CADENCES, FORMATS,
  normalizeInput, createSchedule, listSchedules, cancelSchedule,
  computeWindow, isDue, resolveRecipient, runOne, listScheduledOutlets, runDueSchedules,
};
