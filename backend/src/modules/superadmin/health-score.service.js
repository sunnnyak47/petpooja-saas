/**
 * @fileoverview Chain Health Score Engine
 * Computes a 0–100 composite score for each restaurant chain across 6 dimensions.
 *
 * Scoring Dimensions:
 *  1. Order Velocity     (25 pts) — 7d order trend vs prior 7d
 *  2. Menu Completeness  (20 pts) — items with images, descriptions, categories
 *  3. Staff Activity     (15 pts) — users logged in / active in last 14d
 *  4. Revenue Health     (15 pts) — revenue trend + avg order value vs peers
 *  5. Customer Retention (15 pts) — returning customer % (total_visits > 1)
 *  6. Payment Diversity  (10 pts) — mix of cash / card / UPI
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

const prisma = getDbClient();

// Score grade thresholds
const GRADES = [
  { min: 85, label: 'Champion',  color: '#22c55e', bg: '#dcfce7', emoji: '🏆' },
  { min: 65, label: 'Healthy',   color: '#3b82f6', bg: '#dbeafe', emoji: '✅' },
  { min: 45, label: 'At Risk',   color: '#f59e0b', bg: '#fef3c7', emoji: '⚠️' },
  { min: 0,  label: 'Critical',  color: '#ef4444', bg: '#fee2e2', emoji: '🔴' },
];

function getGrade(score) {
  return GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];
}

/**
 * Compute health score for a single outlet_id.
 * Returns { score, grade, dimensions, signals }
 */
async function computeOutletScore(outletId) {
  const now = new Date();
  const day7  = new Date(now - 7  * 86400000);
  const day14 = new Date(now - 14 * 86400000);
  const day30 = new Date(now - 30 * 86400000);

  // ── Parallel data fetching ─────────────────────────────────────────────────
  const [
    ordersLast7,
    ordersPrev7,
    menuItems,
    usersRecent,
    totalUsers,
    payments30d,
    customers30d,
  ] = await Promise.all([
    // Orders last 7d
    prisma.order.count({
      where: { outlet_id: outletId, is_deleted: false, created_at: { gte: day7 } },
    }),
    // Orders prior 7d (7–14d ago)
    prisma.order.count({
      where: { outlet_id: outletId, is_deleted: false, created_at: { gte: day14, lt: day7 } },
    }),
    // Menu items for completeness
    prisma.menuItem.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      select: { id: true, image_url: true, description: true, is_active: true },
    }),
    // Active staff (last_login_at in last 14d via User model)
    prisma.user.count({
      where: {
        user_roles: { some: { outlet_id: outletId, is_deleted: false } },
        last_login_at: { gte: day14 },
        is_deleted: false,
      },
    }),
    // Total staff for this outlet
    prisma.user.count({
      where: {
        user_roles: { some: { outlet_id: outletId, is_deleted: false } },
        is_deleted: false,
      },
    }),
    // Payments last 30d for method diversity
    prisma.payment.findMany({
      where: {
        order: { outlet_id: outletId, is_deleted: false },
        created_at: { gte: day30 },
        is_deleted: false,
      },
      select: { method: true, amount: true },
    }),
    // Customer return rate last 30d
    prisma.customer.findMany({
      where: {
        orders: { some: { outlet_id: outletId, created_at: { gte: day30 } } },
        is_deleted: false,
      },
      select: { total_visits: true },
    }),
  ]);

  // ── 1. Order Velocity (25 pts) ─────────────────────────────────────────────
  let orderScore = 0;
  let orderSignal = '';
  if (ordersLast7 === 0 && ordersPrev7 === 0) {
    orderScore = 0;
    orderSignal = 'No orders in 14 days';
  } else if (ordersPrev7 === 0) {
    orderScore = 18; // new chain, no comparison
    orderSignal = `${ordersLast7} orders this week (new)`;
  } else {
    const trend = (ordersLast7 - ordersPrev7) / ordersPrev7;
    if (trend >= 0.20)       { orderScore = 25; orderSignal = `↑ ${Math.round(trend * 100)}% orders vs last week`; }
    else if (trend >= 0.05)  { orderScore = 22; orderSignal = `↑ ${Math.round(trend * 100)}% orders vs last week`; }
    else if (trend >= -0.05) { orderScore = 18; orderSignal = `Stable orders (${ordersLast7} this week)`; }
    else if (trend >= -0.20) { orderScore = 12; orderSignal = `↓ ${Math.round(Math.abs(trend) * 100)}% orders vs last week`; }
    else                     { orderScore = 5;  orderSignal = `↓↓ ${Math.round(Math.abs(trend) * 100)}% orders — declining`; }
  }

  // ── 2. Menu Completeness (20 pts) ─────────────────────────────────────────
  const totalItems = menuItems.length;
  const activeItems = menuItems.filter(m => m.is_active).length;
  const withImage = menuItems.filter(m => m.image_url).length;
  const withDesc  = menuItems.filter(m => m.description && m.description.trim().length > 5).length;
  let menuScore = 0;
  let menuSignal = '';
  if (totalItems === 0) {
    menuScore = 0;
    menuSignal = 'No menu items created yet';
  } else {
    const imagePct = withImage / totalItems;
    const descPct  = withDesc  / totalItems;
    const activePct = activeItems / totalItems;
    menuScore = Math.round((imagePct * 8) + (descPct * 7) + (activePct * 5));
    const issues = [];
    if (imagePct < 0.5) issues.push(`${totalItems - withImage} items missing images`);
    if (descPct  < 0.5) issues.push(`${totalItems - withDesc} items missing descriptions`);
    menuSignal = issues.length
      ? issues.join(' · ')
      : `${totalItems} items, ${Math.round(imagePct * 100)}% with images`;
  }

  // ── 3. Staff Activity (15 pts) ────────────────────────────────────────────
  let staffScore = 0;
  let staffSignal = '';
  if (totalUsers === 0) {
    staffScore = 5;
    staffSignal = 'No staff accounts created';
  } else {
    const loginRate = usersRecent / totalUsers;
    staffScore = Math.round(loginRate * 15);
    staffSignal = `${usersRecent}/${totalUsers} staff active in last 14 days`;
  }

  // ── 4. Revenue Health (15 pts) ────────────────────────────────────────────
  // Proxy: total payment amount last 30d, scaled vs minimum viable
  const totalRevenue30d = payments30d.reduce((s, p) => s + Number(p.amount || 0), 0);
  let revenueScore = 0;
  let revenueSignal = '';
  if (totalRevenue30d === 0) {
    revenueScore = 0;
    revenueSignal = 'No revenue recorded in 30 days';
  } else if (totalRevenue30d >= 500000) { revenueScore = 15; revenueSignal = `₹${Math.round(totalRevenue30d / 1000)}k revenue this month`; }
  else if (totalRevenue30d >= 200000)   { revenueScore = 12; revenueSignal = `₹${Math.round(totalRevenue30d / 1000)}k revenue this month`; }
  else if (totalRevenue30d >= 50000)    { revenueScore = 9;  revenueSignal = `₹${Math.round(totalRevenue30d / 1000)}k revenue this month`; }
  else if (totalRevenue30d >= 10000)    { revenueScore = 6;  revenueSignal = `₹${Math.round(totalRevenue30d / 1000)}k revenue this month`; }
  else                                  { revenueScore = 3;  revenueSignal = `Low revenue: ₹${Math.round(totalRevenue30d).toLocaleString('en-IN')}`; }

  // ── 5. Customer Retention (15 pts) ────────────────────────────────────────
  const totalCust30d = customers30d.length;
  const returningCust = customers30d.filter(c => c.total_visits > 1).length;
  let retentionScore = 0;
  let retentionSignal = '';
  if (totalCust30d === 0) {
    retentionScore = 0;
    retentionSignal = 'No customers tracked (use customer profiles)';
  } else {
    const retRate = returningCust / totalCust30d;
    retentionScore = Math.round(retRate * 15);
    retentionSignal = `${returningCust}/${totalCust30d} returning customers (${Math.round(retRate * 100)}%)`;
  }

  // ── 6. Payment Diversity (10 pts) ─────────────────────────────────────────
  const methods = new Set(payments30d.map(p => (p.method || '').toLowerCase()));
  const hasCash = methods.has('cash');
  const hasCard = methods.has('card');
  const hasUpi  = methods.has('upi');
  const diversity = [hasCash, hasCard, hasUpi].filter(Boolean).length;
  const paymentScore = [0, 4, 7, 10][diversity] || 0;
  const paymentSignal = payments30d.length === 0
    ? 'No payments recorded'
    : `${diversity}/3 payment methods used (${[hasCash && 'Cash', hasCard && 'Card', hasUpi && 'UPI'].filter(Boolean).join(', ')})`;

  // ── Final Score ────────────────────────────────────────────────────────────
  const score = Math.min(100, Math.max(0,
    orderScore + menuScore + staffScore + revenueScore + retentionScore + paymentScore
  ));

  return {
    score,
    grade: getGrade(score),
    dimensions: [
      { key: 'orders',     label: 'Order Velocity',     score: orderScore,     max: 25, signal: orderSignal },
      { key: 'menu',       label: 'Menu Completeness',  score: menuScore,      max: 20, signal: menuSignal },
      { key: 'staff',      label: 'Staff Activity',     score: staffScore,     max: 15, signal: staffSignal },
      { key: 'revenue',    label: 'Revenue Health',     score: revenueScore,   max: 15, signal: revenueSignal },
      { key: 'retention',  label: 'Customer Retention', score: retentionScore, max: 15, signal: retentionSignal },
      { key: 'payments',   label: 'Payment Diversity',  score: paymentScore,   max: 10, signal: paymentSignal },
    ],
    meta: {
      orders_last7: ordersLast7,
      orders_prev7: ordersPrev7,
      menu_items:   totalItems,
      staff_total:  totalUsers,
      staff_active: usersRecent,
      revenue_30d:  totalRevenue30d,
      customers_30d: totalCust30d,
      returning_customers: returningCust,
    },
  };
}

/**
 * Compute health scores for all outlets under a headOffice (or all chains for superadmin).
 * Returns array sorted by score desc.
 */
async function computeAllChainScores({ headOfficeId } = {}) {
  const where = { is_deleted: false };
  if (headOfficeId) where.head_office_id = headOfficeId;

  const headOffices = await prisma.headOffice.findMany({
    where,
    select: {
      id: true, name: true, plan: true, is_active: true,
      outlets: {
        where: { is_deleted: false },
        select: { id: true, name: true },
      },
    },
  });

  const results = [];

  for (const ho of headOffices) {
    if (ho.outlets.length === 0) {
      results.push({
        chain_id:   ho.id,
        chain_name: ho.name,
        plan:       ho.plan,
        is_active:  ho.is_active,
        outlets:    [],
        score:      0,
        grade:      getGrade(0),
        dimensions: [],
        meta:       {},
        outlet_scores: [],
      });
      continue;
    }

    // Score each outlet, then average for the chain
    const outletScores = [];
    for (const outlet of ho.outlets) {
      try {
        const s = await computeOutletScore(outlet.id);
        outletScores.push({ outlet_id: outlet.id, outlet_name: outlet.name, ...s });
      } catch (err) {
        logger.warn(`Health score failed for outlet ${outlet.id}: ${err.message}`);
        outletScores.push({ outlet_id: outlet.id, outlet_name: outlet.name, score: 0, grade: getGrade(0), dimensions: [], meta: {} });
      }
    }

    // Chain score = average of outlet scores (weighted by outlet count)
    const avgScore = Math.round(outletScores.reduce((s, o) => s + o.score, 0) / outletScores.length);
    const topOutlet = outletScores.sort((a, b) => b.score - a.score)[0];

    results.push({
      chain_id:      ho.id,
      chain_name:    ho.name,
      plan:          ho.plan,
      is_active:     ho.is_active,
      outlets:       ho.outlets,
      score:         avgScore,
      grade:         getGrade(avgScore),
      dimensions:    topOutlet?.dimensions || [],
      meta:          topOutlet?.meta || {},
      outlet_scores: outletScores,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Platform-level health summary for superadmin overview card.
 */
async function getPlatformHealthSummary() {
  const all = await computeAllChainScores();
  const byGrade = { Champion: 0, Healthy: 0, 'At Risk': 0, Critical: 0 };
  all.forEach(c => { if (byGrade[c.grade.label] !== undefined) byGrade[c.grade.label]++; });
  const avg = all.length ? Math.round(all.reduce((s, c) => s + c.score, 0) / all.length) : 0;
  return {
    total_chains: all.length,
    avg_score: avg,
    grade_distribution: byGrade,
    top_chain:    all[0]    || null,
    bottom_chain: all[all.length - 1] || null,
    at_risk_count: byGrade['At Risk'] + byGrade['Critical'],
  };
}

module.exports = { computeOutletScore, computeAllChainScores, getPlatformHealthSummary, getGrade, GRADES };
