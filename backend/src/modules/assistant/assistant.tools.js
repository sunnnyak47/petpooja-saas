/**
 * @fileoverview Read-only tool registry for the assistant (Phase 1).
 *
 * Each tool wraps an EXISTING read service — the assistant never queries the DB
 * directly. A tool declares:
 *   - name/description  : shown to the LLM for routing
 *   - keywords          : deterministic fallback routing (no-LLM path)
 *   - permission        : RBAC key (null = any authenticated user); gated in
 *                         assistant.service, mirroring rbac.hasPermission
 *   - run(ctx)          : calls the underlying service, scoped to ctx.outletId
 *   - summarize(data,q) : deterministic plain-language answer (no-LLM fallback)
 *
 * ctx = { id, role, outletId, permissions, currency, outletName }.
 * All tools are READ-ONLY. Adding a module = add one entry here.
 * @module modules/assistant/assistant.tools
 */

const copilot = require('../accounting/accounting.copilot.service');
const reports = require('../reports/reports.service');
const inventory = require('../inventory/inventory.service');
const procurement = require('../inventory/procurement.service');
const menu = require('../menu/menu.service');
const customer = require('../customers/customer.service');
const orders = require('../orders/order.service');
const payroll = require('../payroll/payroll.service');
const fraud = require('../fraud/fraud.service');
const attendance = require('../staff/attendance.service');
const eod = require('../reports/eod.service');
const { computeForecast } = require('./assistant.forecast');
const { searchKnowledge } = require('./assistant.knowledge');

const money = (cur, n) => {
  const c = cur || 'AUD';
  const locale = c === 'INR' ? 'en-IN' : 'en-AU';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)); }
  catch (_) { return `${c} ${Math.round(Number(n) || 0)}`; }
};
const num = (n) => Number(n) || 0;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const monthStart = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 1)); };
const daysAgo = (n) => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)); };

/** @type {Array<{name:string,description:string,keywords:string[],permission:?string,run:Function,summarize:Function}>} */
const TOOLS = [
  {
    name: 'finance_summary',
    description: 'Money this month: profit, sales, tax owed (GST/BAS), who owes you, what you owe, and biggest expenses',
    keywords: ['profit', 'profitable', 'making money', 'make money', 'made money', 'make this month', 'income', 'my earnings', 'net profit', 'bottom line', 'tax', 'gst', 'bas', 'vat', 'owe', 'owes', 'owed', 'unpaid', "hasn't paid", 'paid me', 'receivable', 'payable', 'outstanding', 'expense', 'spend this', 'spending too', 'my costs', 'biggest cost', 'money going', 'financial', 'finances', 'how am i doing', 'margin', 'money summary'],
    permission: 'VIEW_REPORTS',
    run: (ctx) => copilot.buildBooksContext(ctx.outletId),
    summarize: (data, question) => copilot.ruleBasedAnswer(question, data),
  },

  {
    name: 'sales_today',
    description: "Today's sales so far: total revenue, number of orders, average order value, and channel split",
    keywords: ['today', 'takings', 'made today', 'orders today', 'sold today', 'revenue today', 'busy today', 'busy are we', 'how much today'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const d = await reports.getDailySales(ctx.outletId, today());
      return {
        currency: ctx.currency,
        total_orders: d.total_orders,
        total_revenue: num(d.total_revenue),
        avg_order_value: num(d.avg_order_value),
        by_type: d.by_type,
        by_payment: d.by_payment,
      };
    },
    summarize: (d) => {
      if (!d.total_orders) return 'No sales recorded yet today.';
      return `Today so far: ${money(d.currency, d.total_revenue)} from ${d.total_orders} order${d.total_orders === 1 ? '' : 's'} (average ${money(d.currency, d.avg_order_value)}).`;
    },
  },

  {
    name: 'top_items',
    description: 'Best-selling menu items this month by quantity and revenue',
    keywords: ['top seller', 'best seller', 'seller', 'top item', 'top 5', 'popular', 'most popular', 'popular menu', 'popular item', 'popular dish', 'best selling', 'top selling', 'selling', 'sells', 'sell the most', 'sell most', 'sell best', 'most sold', 'most ordered', 'order most', 'buying', 'bestseller', 'top dish', 'best performing', 'performing', 'flying off', 'top revenue', 'products'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const r = await reports.getItemWiseSales(ctx.outletId, monthStart(), today(), 10);
      return {
        currency: ctx.currency,
        items: (r.items || []).map((i) => ({ name: i.name, qty: num(i.total_quantity), revenue: num(i.total_revenue) })),
      };
    },
    summarize: (d) => {
      if (!d.items || !d.items.length) return 'No item sales recorded this month yet.';
      const top = d.items.slice(0, 5).map((i) => `${i.name} (${i.qty})`).join(', ');
      return `Your top sellers this month: ${top}.`;
    },
  },

  {
    name: 'low_stock',
    description: 'Inventory items running low or out of stock, with how much is left',
    keywords: ['low stock', 'running low', 'out of stock', 'reorder', 'restock', 'stock', 'inventory', 'running out', 'low on', 'short on', 'depleted', 'nearly out', 'need to order', 'need more', 'ingredients'],
    permission: 'VIEW_INVENTORY',
    run: async (ctx) => {
      const items = await inventory.getLowStock(ctx.outletId);
      return {
        count: items.length,
        items: items.slice(0, 15).map((i) => ({ name: i.name, on_hand: num(i.current_stock), unit: i.unit, reorder_at: num(i.min_threshold), status: i.stock_status })),
      };
    },
    summarize: (d) => {
      if (!d.count) return 'Nothing is running low — stock levels look fine.';
      const top = d.items.slice(0, 5).map((i) => `${i.name} (${i.on_hand}${i.unit ? ` ${i.unit}` : ''} left)`).join(', ');
      return `${d.count} item${d.count === 1 ? '' : 's'} running low: ${top}.`;
    },
  },

  {
    name: 'menu_overview',
    description: "Your menu: total number of items, how many are veg / non-veg / egg, number of categories, price range, and which items are currently unavailable (86'd)",
    keywords: ['menu', 'items', 'how many items', 'dishes', 'veg', 'non-veg', 'non veg', 'nonveg', 'vegetarian', 'egg', 'categor', 'cheapest', 'expensive', 'price range', 'menu size', '86', 'unavailable', 'available', 'sold out', 'off the menu'],
    permission: null,
    run: async (ctx) => {
      const r = await menu.listMenuItems(ctx.outletId, { limit: 2000, is_active: 'true' });
      const items = r.items || [];
      const total = typeof r.total === 'number' ? r.total : items.length;
      const norm = (ft) => {
        const t = String(ft || 'veg').toLowerCase().replace(/-/g, '_');
        if (t.startsWith('non')) return 'non_veg';
        if (t === 'egg') return 'egg';
        return 'veg';
      };
      let veg = 0; let nonVeg = 0; let egg = 0; let unavailable = 0;
      const catMap = {}; const unavailableNames = [];
      let minP = Infinity; let maxP = 0; let sumP = 0; let priced = 0;
      for (const it of items) {
        const ft = norm(it.food_type);
        if (ft === 'non_veg') nonVeg += 1; else if (ft === 'egg') egg += 1; else veg += 1;
        if (it.is_available === false) { unavailable += 1; if (unavailableNames.length < 15) unavailableNames.push(it.name); }
        const cat = (it.category && it.category.name) || 'Uncategorised';
        catMap[cat] = (catMap[cat] || 0) + 1;
        const p = num(it.base_price);
        if (p > 0) { minP = Math.min(minP, p); maxP = Math.max(maxP, p); sumP += p; priced += 1; }
      }
      const categories = Object.entries(catMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      return {
        currency: ctx.currency,
        total_items: total,
        veg, non_veg: nonVeg, egg,
        available: total - unavailable,
        unavailable,
        unavailable_items: unavailableNames,
        category_count: categories.length,
        categories: categories.slice(0, 12),
        price: priced ? { min: Math.round(minP), max: Math.round(maxP), avg: Math.round(sumP / priced) } : null,
      };
    },
    summarize: (d) => {
      if (!d.total_items) return 'Your menu has no active items yet.';
      const parts = [`${d.total_items} items`, `${d.veg} veg`, `${d.non_veg} non-veg`];
      if (d.egg) parts.push(`${d.egg} egg`);
      let s = `Your menu has ${parts.join(', ')} across ${d.category_count} categor${d.category_count === 1 ? 'y' : 'ies'}`;
      if (d.price) s += `, priced ${money(d.currency, d.price.min)}–${money(d.currency, d.price.max)}`;
      s += '.';
      if (d.unavailable) s += ` ${d.unavailable} currently unavailable (86'd).`;
      return s;
    },
  },

  {
    name: 'top_customers',
    description: 'Your highest-spending / most valuable customers',
    keywords: ['top customer', 'best customer', 'best patron', 'patron', 'regular', 'loyal', 'biggest customer', 'valuable customer', 'my valuable', 'who spends', 'spend most', 'spend the most', 'top spending', 'spending customer', 'spender', 'spenders', 'high spend', 'vip', 'frequent', 'orders the most', 'matter most', 'customers by spend', 'customers by revenue'],
    permission: 'VIEW_CUSTOMERS',
    run: async (ctx) => {
      const crm = await customer.getCRMDashboard(ctx.outletId);
      return { currency: ctx.currency, top: (crm.topSpenders || []).slice(0, 10).map((c) => ({ name: c.full_name, spend: num(c.total_spend), visits: c.total_visits })) };
    },
    summarize: (d) => {
      if (!d.top || !d.top.length) return "No customer spend data yet.";
      const top = d.top.slice(0, 3).map((c) => `${c.name} (${money(d.currency, c.spend)})`).join(', ');
      return `Your top customers by spend: ${top}.`;
    },
  },

  {
    name: 'sales_forecast',
    description: "Predict tomorrow's orders and revenue from the last 30 days, vs your daily average and recent trend",
    keywords: ['predict', 'prediction', 'forecast', 'tomorrow', 'expected', 'projection', 'projected', 'estimate', 'next week', 'busy tomorrow', 'trend', 'trending', 'outlook', 'anticipated', 'average prediction', 'compare to last 30', 'what to expect'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const series = await reports.getRevenueTrendRange(ctx.outletId, daysAgo(29), today());
      return { currency: ctx.currency, ...computeForecast(series, new Date()) };
    },
    summarize: (d) => {
      const t = d.tomorrow || {};
      if (!d.days_with_data) return "I don't have enough sales history yet to forecast — check back after a few days of orders.";
      let s = `Based on your last ${d.days_with_data} day${d.days_with_data === 1 ? '' : 's'} of sales, tomorrow (${t.weekday}) is likely around ${t.predicted_orders} order${t.predicted_orders === 1 ? '' : 's'} (~${money(d.currency, t.predicted_revenue)})`;
      if (t.orders_vs_avg_pct != null && t.orders_vs_avg_pct !== 0) {
        s += `, ${t.orders_vs_avg_pct > 0 ? `${t.orders_vs_avg_pct}% above` : `${Math.abs(t.orders_vs_avg_pct)}% below`} your daily average of ${d.avg_orders_per_day}`;
      } else {
        s += `, about your daily average of ${d.avg_orders_per_day}`;
      }
      s += '.';
      if (d.trend_pct != null && Math.abs(d.trend_pct) >= 5) {
        s += ` Your last week is trending ${d.trend_pct > 0 ? 'up' : 'down'} ${Math.abs(d.trend_pct)}% vs the week before.`;
      }
      if (d.confidence === 'low' || d.confidence === 'none') s += ' (Low confidence — limited history so far.)';
      return s;
    },
  },

  {
    name: 'open_purchase_orders',
    description: 'Purchase orders still open (not yet received) and their total value',
    keywords: ['purchase order', 'open po', 'pending purchase', 'pending supplier', 'pending order', 'supplier order', 'ordered from supplier', 'incoming stock', 'awaiting delivery', 'awaiting', 'outstanding purchase', 'unreceived', 'not yet received', 'on order', 'po status', 'to receive', 'in progress', 'on the way'],
    permission: 'VIEW_INVENTORY',
    run: async (ctx) => {
      const r = await procurement.listPurchaseOrders(ctx.outletId, {});
      const open = (r.items || []).filter((p) => !['received', 'cancelled'].includes(String(p.status || '').toLowerCase()));
      return {
        currency: ctx.currency,
        count: open.length,
        total: open.reduce((s, p) => s + num(p.grand_total), 0),
        orders: open.slice(0, 10).map((p) => ({ po: p.po_number, supplier: (p.supplier && p.supplier.name) || '—', status: p.status, amount: num(p.grand_total) })),
      };
    },
    summarize: (d) => {
      if (!d.count) return 'No open purchase orders — everything is received or closed.';
      return `${d.count} open purchase order${d.count === 1 ? '' : 's'} worth ${money(d.currency, d.total)}.`;
    },
  },

  {
    name: 'active_orders',
    description: 'Orders happening right now — open dine-in tables, takeaway and delivery still being prepared or awaiting payment, with how many and their value',
    keywords: ['active order', 'open order', 'running order', 'live order', 'orders right now', 'current order', 'in progress', 'open table', 'open bill', 'unpaid order', 'whats cooking', 'being prepared', 'pending order', 'ongoing'],
    permission: 'VIEW_ORDERS',
    run: async (ctx) => {
      const r = await orders.listOrders(ctx.outletId, { running: 'true', limit: 50 });
      const list = r.orders || r.items || (Array.isArray(r) ? r : []);
      return {
        currency: ctx.currency,
        count: list.length,
        total: list.reduce((s, o) => s + num(o.grand_total), 0),
        orders: list.slice(0, 10).map((o) => ({
          number: o.order_number,
          type: o.order_type,
          status: o.status,
          amount: num(o.grand_total),
          items: o._count?.order_items ?? (o.order_items ? o.order_items.length : 0),
          paid: !!o.is_paid,
        })),
      };
    },
    summarize: (d) => {
      if (!d.count) return 'No active orders right now — everything is served and closed.';
      const unpaid = d.orders.filter((o) => !o.paid).length;
      return `${d.count} active order${d.count === 1 ? '' : 's'} in play worth ${money(d.currency, d.total)}${unpaid ? `, ${unpaid} still to be paid` : ''}.`;
    },
  },

  {
    name: 'eod_summary',
    description: "Today's day-close / end-of-day: total sales, tax, discounts, cash vs card taken, voids and refunds — what you'd reconcile at closing",
    keywords: ['eod', 'end of day', 'day close', 'close the day', 'closing', 'cash up', 'z report', 'reconcile', 'cash in drawer', 'takings today', 'day summary', 'daily close', 'settle the day'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const s = await eod.previewToday(ctx.outletId);
      return { currency: ctx.currency, ...s };
    },
    summarize: (d) => {
      if (!d.total_orders) return 'No sales recorded yet today, so there is nothing to close.';
      let s = `Today: ${money(d.currency, d.total_revenue)} from ${d.total_orders} order${d.total_orders === 1 ? '' : 's'}. Cash sales ${money(d.currency, d.cash_system)}, card ${money(d.currency, d.card_system)}. Tax ${money(d.currency, d.total_tax)}, discounts ${money(d.currency, d.total_discount)}.`;
      if (d.void_count || d.refund_count) s += ` ${d.void_count || 0} void${d.void_count === 1 ? '' : 's'}, ${d.refund_count || 0} refund${d.refund_count === 1 ? '' : 's'}.`;
      return s;
    },
  },

  {
    name: 'payroll_summary',
    description: 'Your latest payroll pay run: gross wages, PAYG tax withheld, superannuation, net pay and number of payslips',
    keywords: ['payroll', 'pay run', 'wages', 'salary', 'payslip', 'super', 'superannuation', 'paye', 'payg', 'staff pay', 'wage bill', 'how much pay', 'net pay'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const runs = await payroll.listPayRuns(ctx.outletId);
      const latest = runs && runs[0];
      return {
        currency: ctx.currency,
        total_runs: runs ? runs.length : 0,
        latest: latest
          ? {
              period_start: latest.period_start,
              period_end: latest.period_end,
              status: latest.status,
              gross: num(latest.gross_total),
              paye: num(latest.paye_total),
              super: num(latest.super_total),
              net: num(latest.net_total),
              payslips: latest._count?.payslips ?? 0,
            }
          : null,
      };
    },
    summarize: (d) => {
      if (!d.latest) return 'No payroll pay runs have been created yet.';
      const l = d.latest;
      const day = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '');
      return `Latest pay run (${day(l.period_start)} to ${day(l.period_end)}, ${l.status}): gross ${money(d.currency, l.gross)}, PAYG ${money(d.currency, l.paye)}, super ${money(d.currency, l.super)}, net ${money(d.currency, l.net)} across ${l.payslips} payslip${l.payslips === 1 ? '' : 's'}.`;
    },
  },

  {
    name: 'fraud_alerts',
    description: 'Open fraud / loss-prevention alerts — suspicious voids, discounts, refunds or cash events flagged for review, most severe first',
    keywords: ['fraud', 'suspicious', 'loss prevention', 'theft', 'alert', 'anomaly', 'unusual', 'flagged', 'void abuse', 'discount abuse', 'cash discrepancy', 'staff risk', 'shrinkage'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const r = await fraud.listAlerts(ctx.outletId, { limit: 10 });
      const items = r.items || [];
      return {
        count: r.total ?? items.length,
        alerts: items.slice(0, 5).map((a) => ({
          type: a.alert_type,
          severity: a.severity,
          title: a.title,
          staff: (a.staff && a.staff.full_name) || null,
          when: a.created_at,
        })),
      };
    },
    summarize: (d) => {
      if (!d.count) return 'No open fraud alerts — nothing suspicious is flagged right now.';
      const top = d.alerts.slice(0, 3).map((a) => `${a.severity} · ${a.title}${a.staff ? ` (${a.staff})` : ''}`).join('; ');
      return `${d.count} open fraud alert${d.count === 1 ? '' : 's'}. Top: ${top}.`;
    },
  },

  {
    name: 'staff_hours',
    description: 'Staff attendance this period: who clocked in, their days present and hours worked (including overtime)',
    keywords: ['staff hours', 'attendance', 'who worked', 'hours worked', 'clock in', 'clocked in', 'shift report', 'timesheet', 'overtime', 'days present', 'staff working', 'labour hours', 'who is on'],
    permission: 'VIEW_STAFF',
    run: async (ctx) => {
      const r = await attendance.getShiftReport(ctx.outletId, {});
      const staff = (r.staff || []).map((s) => ({
        name: s.name,
        days: num(s.days_present),
        hours: Math.round(num(s.total_hours) * 10) / 10,
        overtime: Math.round(num(s.overtime_hours) * 10) / 10,
      }));
      staff.sort((a, b) => b.hours - a.hours);
      return { period_from: r.from, period_to: r.to, staff_count: staff.length, staff: staff.slice(0, 10) };
    },
    summarize: (d) => {
      if (!d.staff_count) return 'No staff attendance has been recorded for this period yet.';
      const top = d.staff.slice(0, 3).map((s) => `${s.name} (${s.hours}h)`).join(', ');
      return `${d.staff_count} staff clocked in this period. Most hours: ${top}.`;
    },
  },

  {
    name: 'help_howto',
    description: 'How to DO something in the app — step-by-step help for POS, payments, tables, menu, inventory, purchase orders, EOD, discounts, offline mode, staff/attendance, payroll and account security. Use for "how do I…", "where is…", "how to…" questions about using the software (not about live data).',
    keywords: ['how do i', 'how to', 'how can i', 'how does', 'where is', 'where do i', 'where can i', 'steps to', 'guide', 'tutorial', 'set up', 'setup', 'configure', 'use the', 'using', 'explain how', 'walk me through', 'show me how'],
    permission: null,
    run: (ctx, question) => ({ matches: searchKnowledge(question, 3) }),
    summarize: (d) => {
      if (!d.matches || !d.matches.length) {
        return 'I can walk you through POS, payments, tables, menu, inventory, EOD, discounts, offline mode, staff and payroll — tell me which feature.';
      }
      return d.matches[0].text;
    },
  },
];

const SUGGESTIONS = [
  'How much did we sell today?',
  "What's tomorrow looking like?",
  'What are my top sellers?',
  "What's running low on stock?",
];

module.exports = { TOOLS, SUGGESTIONS, money };
