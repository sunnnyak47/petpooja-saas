/**
 * @fileoverview Staff Fraud Detection Engine.
 *
 * Detection rules:
 *  1. EXCESSIVE_CANCELLATIONS  — waiter cancels > threshold orders in a rolling window
 *  2. KOT_WITHOUT_BILL         — KOT printed/completed but order never paid
 *  3. DISCOUNT_ABUSE           — staff applies repeated high discounts, esp. at shift-end
 *  4. VOID_ABUSE               — same staff voids multiple orders in short window
 *  5. QUICK_CANCEL             — order cancelled within N minutes of creation (no genuine cook)
 *  6. LATE_NIGHT_ANOMALY       — high-value transactions at unusual hours without manager
 *  7. REFUND_PATTERN           — repeated refunds by same staff member
 *
 * WhatsApp notification: silent push to owner via WhatsApp Cloud API (or Twilio stub).
 *
 * @module modules/fraud/fraud.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/* ─────────────────────────────────────────────────────────────
   THRESHOLDS (sensible defaults; can be overridden per-outlet)
───────────────────────────────────────────────────────────── */
const DEFAULT_THRESHOLDS = {
  cancellation_count_per_shift: 3,          // >3 cancels in 8h window
  cancellation_pct_of_orders:   0.25,       // >25% of handled orders cancelled
  quick_cancel_minutes:         5,           // cancelled within 5 min of creation
  discount_count_per_shift:     4,           // >4 discount orders in a shift
  discount_pct_of_orders:       0.35,       // >35% of orders have discounts
  discount_avg_pct_threshold:   20,          // average discount > 20%
  kot_without_bill_hours:       3,           // KOT completed >3h but no payment
  void_count_per_shift:         3,           // >3 voids in 8h
  late_night_start:             23,          // 11 PM
  late_night_end:               5,           // 5 AM
  late_night_amount_threshold:  2000,        // ₹2000 AUD/INR threshold
  refund_count_per_day:         3,           // >3 refunds per staff per day
  risk_score_notify_threshold:  65,          // score >= 65 → WhatsApp alert
};

/* ─────────────────────────────────────────────────────────────
   RISK SCORING
───────────────────────────────────────────────────────────── */
const SEVERITY_SCORES = { low: 30, medium: 55, high: 80, critical: 95 };

function severity(score) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
function hoursAgo(h) {
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d;
}

function shiftStart() { return hoursAgo(8); }   // rolling 8-hour shift window
function dayStart()   { return hoursAgo(24); }

async function getStaffName(prisma, staffId) {
  if (!staffId) return 'Unknown';
  const u = await prisma.user.findUnique({ where: { id: staffId }, select: { name: true } });
  return u?.name || 'Unknown';
}

/* ─────────────────────────────────────────────────────────────
   WHATSAPP NOTIFICATION (silent to owner)
───────────────────────────────────────────────────────────── */
async function notifyOwnerWhatsApp(outletId, alert) {
  try {
    const prisma = getDbClient();
    // Get outlet + owner phone
    const outlet = await prisma.outlet.findUnique({
      where: { id: outletId },
      include: {
        users: {
          where: { role: { in: ['owner', 'admin'] }, is_active: true },
          select: { phone: true, name: true },
          take: 1,
        },
      },
    });

    const owner = outlet?.users?.[0];
    if (!owner?.phone) {
      logger.warn('Fraud WA: no owner phone found', { outletId });
      return false;
    }

    const emoji = { critical: '🚨', high: '⚠️', medium: '🔶', low: '🔵' }[alert.severity] || '⚠️';
    const msg = [
      `${emoji} *PETPOOJA FRAUD ALERT* ${emoji}`,
      `*${alert.title}*`,
      ``,
      alert.description,
      ``,
      `*Risk Score:* ${alert.risk_score}/100`,
      `*Severity:* ${alert.severity.toUpperCase()}`,
      `*Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      ``,
      `_Review in your Petpooja dashboard → Staff → Fraud Alerts_`,
    ].join('\n');

    // WhatsApp Cloud API (Meta) — uses env vars
    const waToken   = process.env.WA_TOKEN;
    const waPhoneId = process.env.WA_PHONE_NUMBER_ID;

    if (waToken && waPhoneId) {
      const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
      if (fetch) {
        const phone = owner.phone.replace(/\D/g, '');
        const body  = {
          messaging_product: 'whatsapp',
          to: phone.startsWith('91') || phone.startsWith('61') ? phone : `91${phone}`,
          type: 'text',
          text: { body: msg, preview_url: false },
        };
        const resp = await fetch(
          `https://graph.facebook.com/v19.0/${waPhoneId}/messages`,
          { method: 'POST', headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (resp.ok) {
          logger.info('Fraud WA sent', { phone, alertType: alert.alert_type });
          return true;
        }
      }
    }

    // Fallback: log silently (Twilio / other gateway can be plugged here)
    logger.info('FRAUD_ALERT_WA_STUB', {
      to: owner.phone,
      outlet: outlet?.name,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: msg,
    });
    return true;
  } catch (err) {
    logger.error('Fraud WA notification failed', { err: err.message });
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────
   ALERT PERSISTENCE
───────────────────────────────────────────────────────────── */
async function saveAlert(prisma, outletId, staffId, payload) {
  // Dedupe: if same alert_type + staff_id already exists in last 4h, skip
  const existing = await prisma.fraudAlert.findFirst({
    where: {
      outlet_id:  outletId,
      staff_id:   staffId || null,
      alert_type: payload.alert_type,
      created_at: { gte: hoursAgo(4) },
      is_dismissed: false,
    },
  });
  if (existing) return existing;  // already alerted

  const alert = await prisma.fraudAlert.create({
    data: {
      outlet_id:   outletId,
      staff_id:    staffId || null,
      alert_type:  payload.alert_type,
      severity:    payload.severity,
      title:       payload.title,
      description: payload.description,
      evidence:    payload.evidence || {},
      risk_score:  payload.risk_score,
    },
  });

  // Send WA if risk score crosses threshold
  if (payload.risk_score >= DEFAULT_THRESHOLDS.risk_score_notify_threshold) {
    const sent = await notifyOwnerWhatsApp(outletId, alert);
    if (sent) {
      await prisma.fraudAlert.update({
        where: { id: alert.id },
        data: { wa_notified: true, wa_notified_at: new Date() },
      });
    }
  }

  return alert;
}

/* ─────────────────────────────────────────────────────────────
   RULE 1: EXCESSIVE CANCELLATIONS
───────────────────────────────────────────────────────────── */
async function detectExcessiveCancellations(prisma, outletId, t) {
  const alerts = [];

  // Group cancellations by staff in last 8h
  const cancelled = await prisma.order.groupBy({
    by: ['cancelled_by'],
    where: {
      outlet_id:    outletId,
      cancelled_at: { gte: shiftStart() },
      cancelled_by: { not: null },
      is_deleted:   false,
    },
    _count: { id: true },
  });

  for (const row of cancelled) {
    const staffId = row.cancelled_by;
    const count   = row._count.id;
    if (count < t.cancellation_count_per_shift) continue;

    // Get total orders handled by this staff in same window
    const total = await prisma.order.count({
      where: { outlet_id: outletId, staff_id: staffId, created_at: { gte: shiftStart() }, is_deleted: false },
    });

    const pct = total > 0 ? count / total : 1;
    if (pct < t.cancellation_pct_of_orders && count < t.cancellation_count_per_shift + 2) continue;

    const score = Math.min(95, 50 + count * 5 + Math.round(pct * 30));
    const name  = await getStaffName(prisma, staffId);

    alerts.push(await saveAlert(prisma, outletId, staffId, {
      alert_type:  'EXCESSIVE_CANCELLATIONS',
      severity:    severity(score),
      risk_score:  score,
      title:       `${name} cancelled ${count} orders in last 8 hours`,
      description: `Staff member ${name} has cancelled ${count} orders (${Math.round(pct * 100)}% of their orders) in the current shift window. This is above the safe threshold of ${t.cancellation_count_per_shift} cancellations.`,
      evidence:    { staff_id: staffId, staff_name: name, cancel_count: count, total_orders: total, cancel_pct: Math.round(pct * 100) },
    }));
  }

  return alerts.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   RULE 2: KOT WITHOUT BILL
───────────────────────────────────────────────────────────── */
async function detectKotWithoutBill(prisma, outletId, t) {
  const alerts = [];
  const cutoff = hoursAgo(t.kot_without_bill_hours);

  // KOTs that are completed but parent order not paid and older than threshold
  const kots = await prisma.kOT.findMany({
    where: {
      outlet_id:   outletId,
      status:      { in: ['completed', 'served'] },
      completed_at: { lte: cutoff },
      is_deleted:  false,
    },
    include: {
      order: { select: { id: true, is_paid: true, status: true, staff_id: true, grand_total: true, order_number: true } },
    },
  });

  // Group by staff
  const staffMap = {};
  for (const kot of kots) {
    if (!kot.order || kot.order.is_paid || ['cancelled', 'voided'].includes(kot.order.status)) continue;
    const sid = kot.order.staff_id || 'unknown';
    if (!staffMap[sid]) staffMap[sid] = [];
    staffMap[sid].push(kot);
  }

  for (const [staffId, kotList] of Object.entries(staffMap)) {
    if (kotList.length === 0) continue;
    const total  = kotList.reduce((s, k) => s + Number(k.order?.grand_total || 0), 0);
    const score  = Math.min(95, 55 + kotList.length * 8);
    const name   = await getStaffName(prisma, staffId === 'unknown' ? null : staffId);

    alerts.push(await saveAlert(prisma, outletId, staffId === 'unknown' ? null : staffId, {
      alert_type:  'KOT_WITHOUT_BILL',
      severity:    severity(score),
      risk_score:  score,
      title:       `${kotList.length} KOT(s) served with no bill — ₹${total.toFixed(0)} at risk`,
      description: `${kotList.length} kitchen order ticket(s) handled by ${name} were marked completed/served more than ${t.kot_without_bill_hours} hours ago, but the corresponding orders have never been billed or paid. Possible food given without payment.`,
      evidence: {
        staff_name:   name,
        kot_count:    kotList.length,
        total_amount: total,
        orders:       kotList.map(k => ({ order_number: k.order?.order_number, amount: k.order?.grand_total })),
      },
    }));
  }

  return alerts.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   RULE 3: DISCOUNT ABUSE
───────────────────────────────────────────────────────────── */
async function detectDiscountAbuse(prisma, outletId, t) {
  const alerts = [];

  const discounted = await prisma.order.findMany({
    where: {
      outlet_id:      outletId,
      created_at:     { gte: shiftStart() },
      discount_amount: { gt: 0 },
      is_deleted:     false,
      staff_id:       { not: null },
    },
    select: { staff_id: true, discount_amount: true, subtotal: true, grand_total: true, created_at: true },
  });

  // Group by staff
  const byStaff = {};
  for (const o of discounted) {
    if (!byStaff[o.staff_id]) byStaff[o.staff_id] = [];
    byStaff[o.staff_id].push(o);
  }

  for (const [staffId, orders] of Object.entries(byStaff)) {
    if (orders.length < t.discount_count_per_shift) continue;

    const totalOrders = await prisma.order.count({
      where: { outlet_id: outletId, staff_id: staffId, created_at: { gte: shiftStart() }, is_deleted: false },
    });

    const discPct = totalOrders > 0 ? orders.length / totalOrders : 1;
    if (discPct < t.discount_pct_of_orders) continue;

    const avgDiscPct = orders.reduce((s, o) => {
      const sub = Number(o.subtotal) || 1;
      return s + (Number(o.discount_amount) / sub) * 100;
    }, 0) / orders.length;

    if (avgDiscPct < t.discount_avg_pct_threshold) continue;

    const score = Math.min(95, 45 + orders.length * 4 + Math.round(avgDiscPct));
    const name  = await getStaffName(prisma, staffId);

    alerts.push(await saveAlert(prisma, outletId, staffId, {
      alert_type:  'DISCOUNT_ABUSE',
      severity:    severity(score),
      risk_score:  score,
      title:       `${name} applied discounts on ${orders.length} orders (avg ${Math.round(avgDiscPct)}% off)`,
      description: `${name} applied discounts on ${orders.length} out of ${totalOrders} orders (${Math.round(discPct * 100)}%) in the current shift, with an average discount of ${Math.round(avgDiscPct)}%. This pattern may indicate unauthorized discounting or collusion with customers.`,
      evidence: {
        staff_name:    name,
        discount_count: orders.length,
        total_orders:  totalOrders,
        discount_pct:  Math.round(discPct * 100),
        avg_disc_pct:  Math.round(avgDiscPct),
      },
    }));
  }

  return alerts.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   RULE 4: VOID ABUSE
───────────────────────────────────────────────────────────── */
async function detectVoidAbuse(prisma, outletId, t) {
  const alerts = [];

  const voided = await prisma.order.groupBy({
    by: ['voided_by'],
    where: {
      outlet_id:  outletId,
      voided_by:  { not: null },
      updated_at: { gte: shiftStart() },
      status:     'voided',
      is_deleted: false,
    },
    _count: { id: true },
    _sum:   { grand_total: true },
  });

  for (const row of voided) {
    const count = row._count.id;
    if (count < t.void_count_per_shift) continue;

    const staffId = row.voided_by;
    const total   = Number(row._sum.grand_total || 0);
    const score   = Math.min(95, 55 + count * 8);
    const name    = await getStaffName(prisma, staffId);

    alerts.push(await saveAlert(prisma, outletId, staffId, {
      alert_type:  'VOID_ABUSE',
      severity:    severity(score),
      risk_score:  score,
      title:       `${name} voided ${count} orders (₹${total.toFixed(0)} total) this shift`,
      description: `${name} has voided ${count} orders totalling ₹${total.toFixed(0)} in the current shift. Excessive voiding may indicate revenue skimming where cash is pocketed after voiding a settled bill.`,
      evidence: { staff_name: name, void_count: count, total_voided: total },
    }));
  }

  return alerts.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   RULE 5: QUICK CANCELLATIONS
───────────────────────────────────────────────────────────── */
async function detectQuickCancels(prisma, outletId, t) {
  const alerts = [];
  const cutoffMins = t.quick_cancel_minutes;

  const quickCancels = await prisma.$queryRaw`
    SELECT cancelled_by, COUNT(*) as cnt, ARRAY_AGG(order_number) as orders
    FROM orders
    WHERE outlet_id = ${outletId}::uuid
      AND cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL
      AND EXTRACT(EPOCH FROM (cancelled_at - created_at)) / 60 < ${cutoffMins}
      AND cancelled_at >= ${shiftStart()}
      AND is_deleted = false
    GROUP BY cancelled_by
    HAVING COUNT(*) >= 2
  `;

  for (const row of quickCancels) {
    const staffId = row.cancelled_by;
    const count   = Number(row.cnt);
    const score   = Math.min(90, 50 + count * 10);
    const name    = await getStaffName(prisma, staffId);

    alerts.push(await saveAlert(prisma, outletId, staffId, {
      alert_type:  'QUICK_CANCEL',
      severity:    severity(score),
      risk_score:  score,
      title:       `${name} cancelled ${count} orders within ${cutoffMins} min of creation`,
      description: `${name} cancelled ${count} orders within ${cutoffMins} minutes of creation. Rapid cancellations may indicate test orders placed to manipulate reports, or orders taken and food consumed without payment.`,
      evidence: { staff_name: name, count, orders: row.orders, threshold_minutes: cutoffMins },
    }));
  }

  return alerts.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   RULE 6: LATE NIGHT ANOMALY
───────────────────────────────────────────────────────────── */
async function detectLateNightAnomaly(prisma, outletId, t) {
  const alerts = [];
  const now    = new Date();
  const hour   = now.getHours();

  // Only run this check if currently late night
  if (hour < t.late_night_start && hour >= t.late_night_end) return [];

  const lateOrders = await prisma.order.findMany({
    where: {
      outlet_id:    outletId,
      created_at:   { gte: hoursAgo(2) },
      grand_total:  { gte: t.late_night_amount_threshold },
      is_deleted:   false,
      is_paid:      true,
    },
    select: { id: true, staff_id: true, grand_total: true, order_number: true, created_at: true },
  });

  if (lateOrders.length === 0) return [];

  const byStaff = {};
  for (const o of lateOrders) {
    const sid = o.staff_id || 'unknown';
    if (!byStaff[sid]) byStaff[sid] = [];
    byStaff[sid].push(o);
  }

  for (const [staffId, orders] of Object.entries(byStaff)) {
    const total = orders.reduce((s, o) => s + Number(o.grand_total), 0);
    if (total < t.late_night_amount_threshold) continue;

    const score = Math.min(75, 40 + orders.length * 5);
    const name  = await getStaffName(prisma, staffId === 'unknown' ? null : staffId);

    alerts.push(await saveAlert(prisma, outletId, staffId === 'unknown' ? null : staffId, {
      alert_type:  'LATE_NIGHT_ANOMALY',
      severity:    severity(score),
      risk_score:  score,
      title:       `High-value transactions at ${hour}:00 — ₹${total.toFixed(0)} by ${name}`,
      description: `${orders.length} high-value orders totalling ₹${total.toFixed(0)} were processed after ${t.late_night_start}:00 by ${name}. Late-night large transactions without manager oversight warrant review.`,
      evidence: { staff_name: name, hour, order_count: orders.length, total_amount: total },
    }));
  }

  return alerts.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   RULE 7: REFUND PATTERN
───────────────────────────────────────────────────────────── */
async function detectRefundPattern(prisma, outletId, t) {
  const alerts = [];

  const refunds = await prisma.payment.groupBy({
    by: ['processed_by'],
    where: {
      outlet_id:    outletId,
      refund_amount: { gt: 0 },
      created_at:   { gte: dayStart() },
      processed_by: { not: null },
    },
    _count: { id: true },
    _sum:   { refund_amount: true },
  });

  for (const row of refunds) {
    const count = row._count.id;
    if (count < t.refund_count_per_day) continue;

    const staffId = row.processed_by;
    const total   = Number(row._sum.refund_amount || 0);
    const score   = Math.min(90, 50 + count * 8);
    const name    = await getStaffName(prisma, staffId);

    alerts.push(await saveAlert(prisma, outletId, staffId, {
      alert_type:  'REFUND_PATTERN',
      severity:    severity(score),
      risk_score:  score,
      title:       `${name} processed ${count} refunds today (₹${total.toFixed(0)} total)`,
      description: `${name} has processed ${count} refunds totalling ₹${total.toFixed(0)} today. Repeated refunds by the same staff member may indicate refund fraud where money is returned to accomplice customers.`,
      evidence: { staff_name: name, refund_count: count, total_refunded: total },
    }));
  }

  return alerts.filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   MAIN ENGINE — run all rules
───────────────────────────────────────────────────────────── */
async function runDetection(outletId, customThresholds = {}) {
  const prisma = getDbClient();
  const t = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  logger.info('Fraud detection started', { outletId });

  const [r1, r2, r3, r4, r5, r6, r7] = await Promise.allSettled([
    detectExcessiveCancellations(prisma, outletId, t),
    detectKotWithoutBill(prisma, outletId, t),
    detectDiscountAbuse(prisma, outletId, t),
    detectVoidAbuse(prisma, outletId, t),
    detectQuickCancels(prisma, outletId, t),
    detectLateNightAnomaly(prisma, outletId, t),
    detectRefundPattern(prisma, outletId, t),
  ]);

  const allAlerts = [r1, r2, r3, r4, r5, r6, r7]
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(Boolean);

  logger.info('Fraud detection complete', { outletId, alertsFound: allAlerts.length });
  return { alerts: allAlerts, total: allAlerts.length, ran_at: new Date().toISOString() };
}

/* ─────────────────────────────────────────────────────────────
   STAFF RISK PROFILE
───────────────────────────────────────────────────────────── */
async function getStaffRiskProfiles(outletId) {
  const prisma = getDbClient();

  const [staffList, alerts30d] = await Promise.all([
    prisma.user.findMany({
      where: { outlet_id: outletId, is_active: true, role: { in: ['waiter', 'cashier', 'captain', 'manager'] } },
      select: { id: true, name: true, role: true, phone: true },
    }),
    prisma.fraudAlert.findMany({
      where: { outlet_id: outletId, created_at: { gte: hoursAgo(720) }, is_dismissed: false },
      select: { staff_id: true, alert_type: true, severity: true, risk_score: true, created_at: true, is_resolved: true },
    }),
  ]);

  const alertsByStaff = {};
  for (const a of alerts30d) {
    if (!a.staff_id) continue;
    if (!alertsByStaff[a.staff_id]) alertsByStaff[a.staff_id] = [];
    alertsByStaff[a.staff_id].push(a);
  }

  return staffList.map(staff => {
    const myAlerts  = alertsByStaff[staff.id] || [];
    const maxScore  = myAlerts.length > 0 ? Math.max(...myAlerts.map(a => a.risk_score)) : 0;
    const unresolved = myAlerts.filter(a => !a.is_resolved).length;
    const riskLevel = maxScore >= 80 ? 'high' : maxScore >= 55 ? 'medium' : maxScore >= 30 ? 'low' : 'clean';

    return {
      ...staff,
      alert_count:   myAlerts.length,
      unresolved:    unresolved,
      max_risk_score: maxScore,
      risk_level:    riskLevel,
      alert_types:   [...new Set(myAlerts.map(a => a.alert_type))],
    };
  }).sort((a, b) => b.max_risk_score - a.max_risk_score);
}

/* ─────────────────────────────────────────────────────────────
   LIST / UPDATE ALERTS
───────────────────────────────────────────────────────────── */
async function listAlerts(outletId, { page = 1, limit = 20, severity: sev, alert_type, staff_id, unread_only } = {}) {
  const prisma  = getDbClient();
  const where   = { outlet_id: outletId, is_dismissed: false };
  if (sev)        where.severity    = sev;
  if (alert_type) where.alert_type  = alert_type;
  if (staff_id)   where.staff_id    = staff_id;
  if (unread_only) where.is_read    = false;

  const [items, total] = await Promise.all([
    prisma.fraudAlert.findMany({
      where,
      include: { staff: { select: { id: true, name: true, role: true } } },
      orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.fraudAlert.count({ where }),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

async function markRead(outletId, alertId) {
  const prisma = getDbClient();
  return prisma.fraudAlert.updateMany({ where: { id: alertId, outlet_id: outletId }, data: { is_read: true } });
}

async function markAllRead(outletId) {
  const prisma = getDbClient();
  return prisma.fraudAlert.updateMany({ where: { outlet_id: outletId, is_read: false }, data: { is_read: true } });
}

async function dismissAlert(outletId, alertId) {
  const prisma = getDbClient();
  return prisma.fraudAlert.updateMany({ where: { id: alertId, outlet_id: outletId }, data: { is_dismissed: true } });
}

async function resolveAlert(outletId, alertId, note) {
  const prisma = getDbClient();
  return prisma.fraudAlert.updateMany({
    where: { id: alertId, outlet_id: outletId },
    data:  { is_resolved: true, resolved_note: note || null, is_read: true },
  });
}

async function getAlertStats(outletId) {
  const prisma = getDbClient();
  const [total, unread, bySev, byType, trend] = await Promise.all([
    prisma.fraudAlert.count({ where: { outlet_id: outletId, is_dismissed: false } }),
    prisma.fraudAlert.count({ where: { outlet_id: outletId, is_dismissed: false, is_read: false } }),
    prisma.fraudAlert.groupBy({
      by: ['severity'],
      where: { outlet_id: outletId, is_dismissed: false },
      _count: { id: true },
    }),
    prisma.fraudAlert.groupBy({
      by: ['alert_type'],
      where: { outlet_id: outletId, is_dismissed: false, created_at: { gte: hoursAgo(168) } },
      _count: { id: true },
    }),
    prisma.$queryRaw`
      SELECT DATE(created_at AT TIME ZONE 'Asia/Kolkata') as day, COUNT(*) as count
      FROM fraud_alerts
      WHERE outlet_id = ${outletId}::uuid
        AND created_at >= NOW() - INTERVAL '7 days'
        AND is_dismissed = false
      GROUP BY day ORDER BY day ASC
    `,
  ]);

  return {
    total,
    unread,
    by_severity: Object.fromEntries(bySev.map(r => [r.severity, r._count.id])),
    by_type:     byType.map(r => ({ type: r.alert_type, count: r._count.id })),
    trend_7d:    trend,
  };
}

module.exports = {
  runDetection,
  getStaffRiskProfiles,
  listAlerts,
  markRead,
  markAllRead,
  dismissAlert,
  resolveAlert,
  getAlertStats,
  DEFAULT_THRESHOLDS,
};
