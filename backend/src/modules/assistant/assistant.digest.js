/**
 * @fileoverview Daily / weekly DIGEST EMAILS — the "assistant that reports to you".
 *
 * A digest is a proactive, READ-only summary the assistant mails to an outlet's
 * OWNER: yesterday's (or the week's) revenue, the active proactive alerts, and a
 * short line on how the assistant was used. It reuses the SAME services the
 * chat assistant and alert engine already use — nothing new is computed here:
 *   • reports.service getDailySales / getRevenueTrendRange  → revenue
 *   • assistant.alerts computeAlerts                        → what needs attention
 *   • assistant.insights mineUsage                          → assistant usage
 *
 * buildDigest(outlet, {period}) renders a text + html summary; sendDigest(outlet,
 * {period}) resolves the owner's email and sends it via mail.service (skips
 * silently when there is no owner email — never emails a third party).
 *
 * @module modules/assistant/assistant.digest
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const reports = require('../reports/reports.service');
const { computeAlerts } = require('./assistant.alerts');
const { mineUsage } = require('./assistant.insights');
const mail = require('../../utils/mail.service');

// ── formatting + date helpers ────────────────────────────────────────────────
const money = (cur, n) => {
  const c = cur || 'AUD';
  const locale = c === 'INR' ? 'en-IN' : 'en-AU';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)); }
  catch (_) { return `${c} ${Math.round(Number(n) || 0)}`; }
};
const num = (n) => Number(n) || 0;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/** Build the owner-scoped ctx a digest evaluates alerts / usage against. */
function ctxFor(outlet) {
  return {
    id: outlet && outlet.owner_id ? outlet.owner_id : undefined,
    role: 'owner', // digests go to the owner → owner-level visibility across rules
    outletId: outlet && outlet.id,
    permissions: [],
    currency: (outlet && outlet.currency) || 'AUD',
    outletName: outlet && outlet.name,
  };
}

/**
 * Build a daily/weekly digest for one outlet. Every sub-service is guarded so a
 * single failure degrades that section rather than dropping the whole digest.
 * @param {{id:string, name?:string, currency?:string, owner_id?:string}} outlet
 * @param {{period?:'daily'|'weekly', now?:Date|string}} [opts]
 * @returns {Promise<{period, subject, summary, text, html, revenue:number, alertCount:number, alerts:Array, usage:object, range:{from:string,to:string}}>}
 */
async function buildDigest(outlet, opts = {}) {
  const period = opts.period === 'weekly' ? 'weekly' : 'daily';
  const now = opts.now ? new Date(opts.now) : new Date();
  const ctx = ctxFor(outlet);
  const cur = ctx.currency;
  const outletId = ctx.outletId;

  // Window: daily → yesterday; weekly → the trailing 7 days ending yesterday.
  const yesterday = addDays(dateOnly(now), -1);
  const yStr = ymd(yesterday);
  const rangeFrom = period === 'weekly' ? ymd(addDays(dateOnly(now), -7)) : ymd(addDays(dateOnly(now), -7));
  const rangeTo = yStr;

  // 1) Revenue — daily headline from getDailySales, plus the trailing-week trend.
  let dailySales = null; let trend = [];
  try { dailySales = await reports.getDailySales(outletId, yStr); }
  catch (e) { logger.warn('[digest] getDailySales failed', { outletId, error: e.message }); }
  try { trend = await reports.getRevenueTrendRange(outletId, rangeFrom, rangeTo); }
  catch (e) { logger.warn('[digest] getRevenueTrendRange failed', { outletId, error: e.message }); }
  const trendArr = Array.isArray(trend) ? trend : [];
  const weekRevenue = trendArr.reduce((s, d) => s + num(d.revenue), 0);
  const weekOrders = trendArr.reduce((s, d) => s + num(d.orders), 0);
  const dayRevenue = dailySales ? num(dailySales.total_revenue) : 0;
  const dayOrders = dailySales ? num(dailySales.total_orders) : 0;
  const revenue = period === 'weekly' ? weekRevenue : dayRevenue;
  const orders = period === 'weekly' ? weekOrders : dayOrders;

  // 2) Proactive alerts (severity-sorted, owner-scoped).
  let alerts = [];
  try { alerts = await computeAlerts(ctx, now); }
  catch (e) { logger.warn('[digest] computeAlerts failed', { outletId, error: e.message }); }
  const alertList = Array.isArray(alerts) ? alerts : [];
  const alertCount = alertList.length;

  // 3) Assistant usage over the same window.
  let usage = null;
  try { usage = await mineUsage(ctx, { days: period === 'weekly' ? 7 : 1, now }); }
  catch (e) { logger.warn('[digest] mineUsage failed', { outletId, error: e.message }); }

  const label = period === 'weekly' ? 'Weekly' : 'Daily';
  const rangeLabel = period === 'weekly' ? `${rangeFrom} → ${rangeTo}` : yStr;
  const name = outlet && outlet.name ? outlet.name : 'your outlet';
  const revMoney = money(cur, revenue);
  const alertPhrase = `${alertCount} alert${alertCount === 1 ? '' : 's'}`;

  // Short one-line summary — carries the headline revenue + alert count.
  const summary = `${label} digest for ${name}: revenue ${revMoney} · ${orders} order${orders === 1 ? '' : 's'} · ${alertPhrase}${usage && usage.total ? ` · ${usage.total} assistant question${usage.total === 1 ? '' : 's'}` : ''}.`;
  const subject = `${label} digest — ${name} · ${revMoney}${alertCount ? ` · ${alertPhrase}` : ''}`;

  const text = renderText({ label, name, rangeLabel, revMoney, orders, alertList, usage, cur, period, trendArr });
  const html = renderHtml({ label, name, rangeLabel, revMoney, orders, alertList, usage, cur, period });

  return { period, subject, summary, text, html, revenue, orders, alertCount, alerts: alertList, usage, range: { from: rangeFrom, to: rangeTo } };
}

/** Plain-text body. */
function renderText({ label, name, rangeLabel, revMoney, orders, alertList, usage, period }) {
  const lines = [];
  lines.push(`${label} digest — ${name}`);
  lines.push(`Period: ${rangeLabel}`);
  lines.push('');
  lines.push(`Revenue: ${revMoney}  (${orders} order${orders === 1 ? '' : 's'})`);
  lines.push('');
  if (alertList.length) {
    lines.push(`Needs attention (${alertList.length}):`);
    for (const a of alertList) lines.push(`  • [${a.severity}] ${a.title} — ${a.message}`);
  } else {
    lines.push('Needs attention: nothing — all clear.');
  }
  lines.push('');
  if (usage && usage.total) {
    lines.push(`Assistant: ${usage.total} question${usage.total === 1 ? '' : 's'} over the ${period === 'weekly' ? 'week' : 'day'} (${usage.miss_rate}% couldn't be answered confidently).`);
  }
  lines.push('');
  lines.push('— Your MS-RM assistant');
  return lines.join('\n');
}

/** HTML body — inline styles, email-client safe. */
function renderHtml({ label, name, rangeLabel, revMoney, orders, alertList, usage, period }) {
  const sevColor = { high: '#dc2626', medium: '#d97706', low: '#2563eb' };
  const alertRows = alertList.length
    ? alertList.map((a) => `
        <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-size:14px;font-weight:700;color:${sevColor[a.severity] || '#0f172a'};">${esc(a.title)}</div>
          <div style="font-size:13px;color:#475569;margin-top:2px;line-height:1.5;">${esc(a.message)}</div>
        </td></tr><tr><td style="height:8px;"></td></tr>`).join('')
    : `<tr><td style="padding:12px 14px;font-size:14px;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">All clear — nothing needs your attention.</td></tr>`;

  const usageLine = usage && usage.total
    ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b;line-height:1.6;">The assistant answered <strong>${esc(usage.total - usage.misses_count)}</strong> of <strong>${esc(usage.total)}</strong> question${usage.total === 1 ? '' : 's'} this ${period === 'weekly' ? 'week' : 'day'}${usage.miss_rate ? ` (${esc(usage.miss_rate)}% missed)` : ''}.</p>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(label)} digest</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.06);">
        <tr><td style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 60%,#3b82f6 100%);padding:28px 32px;color:#fff;">
          <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;opacity:0.75;text-transform:uppercase;">${esc(label)} digest · ${esc(rangeLabel)}</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;margin-top:6px;">${esc(name)}</div>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <div style="padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
            <div style="font-size:12px;font-weight:600;letter-spacing:0.06em;color:#64748b;text-transform:uppercase;">Revenue</div>
            <div style="font-size:30px;font-weight:800;color:#0f172a;margin-top:4px;">${esc(revMoney)}</div>
            <div style="font-size:13px;color:#64748b;margin-top:2px;">${esc(orders)} order${orders === 1 ? '' : 's'}</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#334155;margin:22px 0 10px;">Needs attention</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${alertRows}</table>
          ${usageLine}
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:11.5px;color:#94a3b8;line-height:1.6;">
            Automated ${esc(label.toLowerCase())} digest from your MS-RM assistant.<br>© ${new Date().getFullYear()} MS-RM · Replies aren't monitored.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Resolve the outlet owner's email and send the digest. No owner / no email →
 * skips silently (never emails anyone but the owner).
 * @param {{id:string, name?:string, currency?:string, owner_id?:string}} outlet
 * @param {{period?:'daily'|'weekly', now?:Date|string}} [opts]
 * @returns {Promise<{sent:boolean, to?:string, period:string, reason?:string, transport?:string}>}
 */
async function sendDigest(outlet, opts = {}) {
  const period = opts.period === 'weekly' ? 'weekly' : 'daily';
  if (!outlet || !outlet.id) return { sent: false, period, reason: 'no_outlet' };

  // Resolve owner email (owner_id → User). Outlet has no `owner` relation.
  let to = null; let ownerName = null;
  if (outlet.owner_id) {
    try {
      const user = await getDbClient().user.findUnique({ where: { id: outlet.owner_id }, select: { email: true, full_name: true } });
      to = user && user.email;
      ownerName = user && user.full_name;
    } catch (e) {
      logger.warn('[digest] owner lookup failed', { outletId: outlet.id, error: e.message });
    }
  }
  if (!to) {
    logger.info('[digest] skipped — no owner email', { outletId: outlet.id, period });
    return { sent: false, period, reason: 'no_email' };
  }

  const digest = await buildDigest(outlet, { period, now: opts.now });
  try {
    const res = await mail.sendMail({ to, subject: digest.subject, text: digest.text, html: digest.html });
    logger.info('[digest] sent', { outletId: outlet.id, to, period, owner: ownerName });
    return { sent: true, to, period, transport: res && res.transport, summary: digest.summary };
  } catch (e) {
    logger.warn('[digest] send failed', { outletId: outlet.id, to, period, error: e.message });
    return { sent: false, period, to, reason: 'send_failed' };
  }
}

/**
 * Fetch the outlets a digest should run for — active, not deleted, with an owner.
 * @returns {Promise<Array<{id, name, currency, owner_id}>>}
 */
async function listDigestOutlets() {
  try {
    const rows = await getDbClient().outlet.findMany({
      where: { is_active: true, is_deleted: false, owner_id: { not: null } },
      select: { id: true, name: true, currency: true, owner_id: true },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    logger.warn('[digest] outlet scan failed', { error: e.message });
    return [];
  }
}

/**
 * Send a digest to every eligible outlet's owner (used by the cron). Sequential
 * to keep mail throughput gentle; each outlet is isolated from the others.
 * @param {{period?:'daily'|'weekly', now?:Date|string}} [opts]
 */
async function runDigests(opts = {}) {
  const period = opts.period === 'weekly' ? 'weekly' : 'daily';
  const outlets = await listDigestOutlets();
  let sent = 0; let skipped = 0;
  for (const outlet of outlets) {
    try {
      const r = await sendDigest(outlet, { period, now: opts.now });
      if (r && r.sent) sent += 1; else skipped += 1;
    } catch (e) {
      skipped += 1;
      logger.warn('[digest] outlet run failed', { outletId: outlet.id, period, error: e.message });
    }
  }
  logger.info(`[digest] ${period} run complete`, { outlets: outlets.length, sent, skipped });
  return { period, outlets: outlets.length, sent, skipped };
}

module.exports = { buildDigest, sendDigest, listDigestOutlets, runDigests, ctxFor };
