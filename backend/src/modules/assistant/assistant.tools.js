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
const tableSvc = require('../orders/table.service');
const payroll = require('../payroll/payroll.service');
const fraud = require('../fraud/fraud.service');
const attendance = require('../staff/attendance.service');
const eod = require('../reports/eod.service');
const statements = require('../accounting/accounting.statements.service');
const bas = require('../accounting/accounting.bas.service');
const aging = require('../accounting/accounting.aging.service');
const budgetSvc = require('../accounting/accounting.budget.service');
const creditNotes = require('../financial-docs/creditnote.service');
const settlements = require('../settlements/settlement.service');
const aggregatorRecon = require('../integrations/aggregator.reconciliation.service');
const prepAnalytics = require('../orders/prep-analytics.service');
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
    keywords: ['predict', 'prediction', 'predict tomorrow', 'forecast', 'forecast my', 'tomorrow', 'tomorrows orders', "tomorrow's orders", 'expected', 'projection', 'projected', 'estimate', 'next week', 'busy tomorrow', 'trend', 'trending', 'outlook', 'anticipated', 'average prediction', 'compare to last 30', 'what to expect'],
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
    keywords: ['purchase order', 'purchase', 'open purchase', 'purchase orders open', 'open po', 'pending purchase', 'pending supplier', 'supplier order', 'supplier orders', 'open supplier', 'ordered from supplier', 'incoming stock', 'awaiting delivery', 'awaiting', 'outstanding purchase', 'unreceived', 'not yet received', 'on order', 'po status', 'to receive', 'on the way'],
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
    keywords: ['active order', 'open order', 'orders open', 'orders are open', 'running order', 'orders running', 'orders are running', 'are running', 'live order', 'orders right now', 'current order', 'in progress', 'open table', 'open bill', 'unpaid order', 'whats cooking', 'cooking', 'being prepared', 'pending order', 'orders pending', 'orders are pending', 'ongoing', 'still open', 'orders still', 'in play', 'ticket', 'tickets', 'active ticket', 'open ticket', 'orders are active', 'r running', 'runing', 'waiting to pay', 'have to pay', 'live in the kitchen', 'kitchen working on', 'opne tables'],
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
    keywords: ['eod', 'end of day', 'day close', 'day end', 'close the day', 'closing', 'closing report', 'closing figures', 'at close', 'cash up', 'z report', 'reconcile', 'cash in drawer', 'drawer', 'the drawer', 'drawer have', 'cash vs card', 'cash and card', 'takings today', 'day summary', 'daily close', 'settle the day', 'voids today', 'voids', 'refunds', 'how many voids', 'how many refunds', 'before closing', 'reconcile today', 'close of day', 'lock up', 'tonight', 'cashup', 'cash-up', 'the eod'],
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
    keywords: ['payroll', 'pay run', 'wages', 'salary', 'payslip', 'super', 'superannuation', 'paye', 'payg', 'staff pay', 'pay staff', 'paid staff', 'pay my staff', 'wage bill', 'how much pay', 'net pay', 'salary paid', 'paying staff', 'withhold', 'withheld', 'payrun', 'pay-run', 'payrol', 'from wages', 'superannuation owed', 'super owed', 'this run'],
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
    keywords: ['fraud', 'suspicious', 'loss prevention', 'theft', 'alert', 'anomaly', 'anomalies', 'unusual', 'flagged', 'void abuse', 'discount abuse', 'abuse', 'abusing', 'risky', 'cash discrepancy', 'shrinkage', 'dodgy', 'weird', 'red flag', 'red flags', 'suspicious voids', 'suspicious refunds', 'suspicious void', 'anyone abusing', 'abusing voids', 'suspicous voids', 'any alerts', 'voids lately', 'flag any', 'any flags', 'suspicous', 'fishy'],
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
    keywords: ['staff hours', 'attendance', 'who worked', 'hours worked', 'most hours', 'hours per', 'shift hours', 'hours', 'clock in', 'clocked', 'clocked in', 'shift report', 'timesheet', 'overtime', 'days present', 'present this', 'staff working', 'putting in hours', 'labour hours', 'who is on', 'showing up', 'showed up', 'on the clock', 'days has', 'worked this', 'attendence', 'whos been', 'been in', 'coming in', 'been coming'],
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
    name: 'profit_loss',
    description: "Profit & loss breakdown this month: total revenue, total expenses, cost of goods sold (COGS), gross profit and net profit",
    keywords: ['p&l', 'p and l', 'pnl', 'profit and loss', 'profit & loss', 'profit loss statement', 'income statement', 'gross profit', 'cost of goods', 'cogs', 'net profit breakdown', 'pl statement', 'p&l breakdown', 'profit breakdown', 'expenses vs revenue', 'revenue minus expenses', 'revenue and expenses'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const pl = await statements.getProfitAndLoss(ctx.outletId, monthStart(), today());
      return {
        currency: ctx.currency,
        revenue: num(pl.revenue && pl.revenue.total),
        expenses: num(pl.expenses && pl.expenses.total),
        cogs: num(pl.cogs_total),
        gross_profit: num(pl.gross_profit),
        net_profit: num(pl.net_profit),
      };
    },
    summarize: (d) => {
      if (!d.revenue && !d.expenses && !d.cogs) return 'No profit & loss activity recorded this month yet.';
      return `This month: revenue ${money(d.currency, d.revenue)}, COGS ${money(d.currency, d.cogs)}, expenses ${money(d.currency, d.expenses)}. Gross profit ${money(d.currency, d.gross_profit)}, net profit ${money(d.currency, d.net_profit)}.`;
    },
  },

  {
    name: 'sales_trend',
    description: 'How sales are trending over the last 7 days — daily revenue and orders, the week total, and whether the last few days are up or down',
    keywords: ['this week', 'last 7 days', 'past week', 'weekly sales', 'sales this week', 'how has this week', 'up or down', 'week so far', 'last week sales', 'recent sales', 'sales lately', 'how are sales going', 'going up', 'going down', 'past 7 days', 'seven days', 'week gone', 'sales for the week', 'this past week'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const series = await reports.getRevenueTrendRange(ctx.outletId, daysAgo(6), today());
      const days = Array.isArray(series) ? series : [];
      const totalRev = days.reduce((s, d) => s + num(d.revenue), 0);
      const totalOrders = days.reduce((s, d) => s + num(d.orders), 0);
      // Compare the last 3 days to the previous 3 to read direction.
      const rev = days.map((d) => num(d.revenue));
      const recent = rev.slice(-3).reduce((s, v) => s + v, 0);
      const prior = rev.slice(-6, -3).reduce((s, v) => s + v, 0);
      const changePct = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;
      const best = days.slice().sort((a, b) => num(b.revenue) - num(a.revenue))[0] || null;
      return {
        currency: ctx.currency,
        days_with_data: days.filter((d) => num(d.revenue) > 0).length,
        total_revenue: totalRev,
        total_orders: totalOrders,
        change_pct: changePct,
        best_day: best ? { date: best.date, revenue: num(best.revenue) } : null,
      };
    },
    summarize: (d) => {
      if (!d.total_orders) return 'No sales in the last 7 days.';
      let s = `Last 7 days: ${money(d.currency, d.total_revenue)} from ${d.total_orders} order${d.total_orders === 1 ? '' : 's'}.`;
      if (d.change_pct != null && Math.abs(d.change_pct) >= 5) s += ` The last 3 days are ${d.change_pct > 0 ? 'up' : 'down'} ${Math.abs(d.change_pct)}% vs the 3 before.`;
      if (d.best_day) s += ` Best day was ${d.best_day.date} (${money(d.currency, d.best_day.revenue)}).`;
      return s;
    },
  },

  {
    name: 'table_status',
    description: 'Live table status right now — how many tables are free, occupied, awaiting bill or being cleaned, and the total floor',
    keywords: ['table status', 'tables free', 'tables occupied', 'occupied tables', 'how many tables', 'free tables', 'available tables', 'tables available', 'empty tables', 'floor status', 'how full', 'are we full', 'seating', 'free seats', 'tables in use', 'occupancy', 'any tables free', 'table availability', 'tables count', 'seating availability'],
    permission: null,
    run: async (ctx) => {
      const tables = await tableSvc.listTables(ctx.outletId, {});
      const list = Array.isArray(tables) ? tables : [];
      const counts = { available: 0, occupied: 0, dirty: 0, reserved: 0, blocked: 0, other: 0 };
      for (const t of list) {
        const st = String(t.status || 'available');
        if (counts[st] != null) counts[st] += 1; else counts.other += 1;
      }
      return { total: list.length, ...counts };
    },
    summarize: (d) => {
      if (!d.total) return 'No tables are set up for this outlet yet.';
      const bits = [`${d.available} free`, `${d.occupied} occupied`];
      if (d.dirty) bits.push(`${d.dirty} cleaning`);
      if (d.reserved) bits.push(`${d.reserved} reserved`);
      return `${d.total} tables: ${bits.join(', ')}.`;
    },
  },

  {
    name: 'staff_risk',
    description: 'Which staff are the highest loss-prevention risk — ranked by fraud alert score over the last 30 days (voids, discounts, refunds, cash events)',
    keywords: ['staff risk', 'riskiest staff', 'riskiest employee', 'riskiest team', 'risky staff', 'risky employee', 'risky employees', 'staff risk profile', 'staff risk ranking', 'staff risk score', 'who is high risk', 'high risk', 'high risk staff', 'are high risk', 'which staff is risky', 'which staff high risk', 'which staff have alerts', 'staff fraud risk', 'which staff risky', 'highest risk staff', 'staff loss prevention', 'problem staff', 'who might be stealing', 'stealing', 'who to watch', 'watch on my team', 'employee is high risk'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const profiles = await fraud.getStaffRiskProfiles(ctx.outletId);
      const list = (Array.isArray(profiles) ? profiles : []).filter((p) => num(p.max_risk_score) > 0 || num(p.alert_count) > 0);
      return {
        flagged: list.length,
        staff: list.slice(0, 5).map((p) => ({
          name: p.full_name,
          role: p.role,
          risk: p.risk_level,
          score: num(p.max_risk_score),
          alerts: num(p.alert_count),
        })),
      };
    },
    summarize: (d) => {
      if (!d.flagged) return 'No staff are flagged for risk — nothing suspicious in the last 30 days.';
      const top = d.staff.slice(0, 3).map((p) => `${p.name} (${p.risk} · ${p.alerts} alert${p.alerts === 1 ? '' : 's'})`).join(', ');
      return `${d.flagged} staff flagged over 30 days. Highest risk: ${top}.`;
    },
  },

  {
    name: 'help_howto',
    description: 'How to DO something in the app — step-by-step help for POS, payments, tables, menu, inventory, purchase orders, EOD, discounts, offline mode, staff/attendance, payroll and account security. Use for "how do I…", "where is…", "how to…" questions about using the software (not about live data).',
    keywords: ['how do i', 'how do i create', 'how do i add', 'how do i make', 'how do i set', 'how to', 'how to run', 'how can i', 'how do you', 'where is', 'where do i', 'where can i', 'where to', 'steps to', 'steps to run', 'step by step', 'walk me', 'guide', 'tutorial', 'set up', 'setup', 'configure', 'explain how', 'walk me through'],
    permission: null,
    run: (ctx, question) => ({ matches: searchKnowledge(question, 3) }),
    summarize: (d) => {
      if (!d.matches || !d.matches.length) {
        return 'I can walk you through POS, payments, tables, menu, inventory, EOD, discounts, offline mode, staff and payroll — tell me which feature.';
      }
      return d.matches[0].text;
    },
  },

  {
    name: 'tax_figures',
    description: 'GST/BAS tax figures this month: tax collected on sales, tax paid on purchases (input credit), and the net amount you owe or are due back',
    keywords: ['gst collected', 'gst on sales', 'gst on purchases', 'net gst', 'tax collected', 'tax paid', 'input tax credit', 'gst payable', 'collected vs paid', 'tax liability', 'bas figures', 'pay the ato', 'gst refund', 'gst breakdown'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const r = await bas.getBASReport(ctx.outletId, monthStart(), today());
      return {
        currency: ctx.currency,
        tax_type: ctx.currency === 'INR' ? 'GST' : 'BAS',
        period: r.period_label,
        tax_collected: num(r.gst_on_sales_1A),
        tax_paid: num(r.gst_on_purchases_1B),
        net_owed: num(r.net_gst),
        is_payable: !!r.payable,
      };
    },
    summarize: (d) => {
      const label = d.tax_type || 'GST';
      if (!d.tax_collected && !d.tax_paid) return `No ${label} activity recorded for ${d.period || 'this period'} yet.`;
      const net = money(d.currency, Math.abs(d.net_owed));
      return d.net_owed >= 0
        ? `${label} for ${d.period}: collected ${money(d.currency, d.tax_collected)}, paid ${money(d.currency, d.tax_paid)} — you owe ${net}.`
        : `${label} for ${d.period}: collected ${money(d.currency, d.tax_collected)}, paid ${money(d.currency, d.tax_paid)} — you're due a refund of ${net}.`;
    },
  },

  {
    name: 'cash_flow',
    description: 'Cash flow this month: how much cash came in vs went out, the net movement, and the biggest inflows and outflows',
    keywords: ['cash flow', 'cashflow', 'cash in vs cash out', 'cash in and out', 'net cash', 'cash movement', 'money in and out', 'cash position', 'cash coming in', 'cash going out', 'cash inflow', 'cash outflow'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const cf = await bas.getCashFlow(ctx.outletId, monthStart(), today());
      return {
        currency: ctx.currency,
        cash_in: num(cf.total_in),
        cash_out: num(cf.total_out),
        net_change: num(cf.net_change),
        inflows: (cf.inflows || []).map((i) => ({ label: i.label, amount: num(i.amount) })),
        outflows: (cf.outflows || []).map((o) => ({ label: o.label, amount: num(o.amount) })),
      };
    },
    summarize: (d) => {
      if (!d.cash_in && !d.cash_out) return 'No cash movement recorded this month yet.';
      const dir = d.net_change >= 0 ? 'up' : 'down';
      return `This month: ${money(d.currency, d.cash_in)} cash in, ${money(d.currency, d.cash_out)} out — net ${dir} ${money(d.currency, Math.abs(d.net_change))}.`;
    },
  },

  {
    name: 'supplier_balances',
    description: 'How much you owe each supplier — outstanding payables broken down by vendor, largest first',
    keywords: ['each supplier', 'by supplier', 'per supplier', 'which supplier', 'supplier balance', 'vendor balance', 'supplier balances', 'vendor balances', 'supplier payables', 'supplier wise', 'each vendor', 'per vendor', 'vendor dues', 'supplier dues', 'owe each'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const report = await aging.getPayablesAging(ctx.outletId);
      const bySupplier = {};
      for (const it of (report.items || [])) {
        const name = it.supplier || '—';
        const row = bySupplier[name] || (bySupplier[name] = { supplier: name, owed: 0, bills: 0, oldest_days: 0 });
        row.owed = Math.round((row.owed + num(it.amount)) * 100) / 100;
        row.bills += 1;
        if (num(it.days) > row.oldest_days) row.oldest_days = num(it.days);
      }
      const suppliers = Object.values(bySupplier).sort((a, b) => b.owed - a.owed).slice(0, 20);
      return { currency: ctx.currency, total_owed: num(report.total), supplier_count: suppliers.length, suppliers };
    },
    summarize: (d) => {
      if (!d.supplier_count) return 'You have no outstanding supplier balances — all bills are paid.';
      const top = d.suppliers.slice(0, 3).map((s) => `${s.supplier} (${money(d.currency, s.owed)})`).join(', ');
      return `You owe ${money(d.currency, d.total_owed)} across ${d.supplier_count} supplier${d.supplier_count === 1 ? '' : 's'}. Most: ${top}.`;
    },
  },

  {
    name: 'budget_vs_actual',
    description: 'Budget vs actual this month: how your real revenue and expenses compare to your budget, with the biggest variances',
    keywords: ['budget vs actual', 'over budget', 'under budget', 'against budget', 'budget variance', 'budget target', 'planned vs actual', 'on budget', 'budget performance', 'budgeted', 'budget comparison', 'hit our budget', 'vs actual', 'budget'],
    permission: 'VIEW_REPORTS',
    run: async (ctx) => {
      const budgets = await budgetSvc.listBudgets(ctx.outletId);
      if (!budgets || !budgets.length) return { currency: ctx.currency, has_budget: false };
      const latest = budgets[0];
      const r = await budgetSvc.getBudgetVsActual(ctx.outletId, latest.id, monthStart(), today());
      const lines = (r.lines || [])
        .map((l) => ({ account: l.account_name || l.account_code, budget: num(l.budget), actual: num(l.actual), variance: num(l.variance), variance_pct: l.variance_pct }))
        .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
        .slice(0, 8);
      return { currency: ctx.currency, has_budget: true, budget_name: r.name, fy_year: r.fy_year, totals: r.totals, lines };
    },
    summarize: (d) => {
      if (!d.has_budget) return "You haven't set up a budget yet, so I can't compare actuals against it.";
      const t = d.totals || {};
      const worst = d.lines && d.lines[0];
      let s = `Against your "${d.budget_name}" budget: actual ${money(d.currency, num(t.actual))} vs budgeted ${money(d.currency, num(t.budget))}.`;
      if (worst) s += ` Biggest gap: ${worst.account} (${money(d.currency, worst.actual)} vs ${money(d.currency, worst.budget)}).`;
      return s;
    },
  },

  {
    name: 'credit_notes',
    description: 'Credit notes issued: how many, their total value and tax, and the most recent ones',
    keywords: ['credit note', 'credit notes', 'credit memo', 'credit notes issued', 'outstanding credit notes', 'credit note value'],
    permission: null,
    run: async (ctx) => {
      const s = await creditNotes.stats(ctx.outletId, {});
      let recent = [];
      try {
        const r = await creditNotes.list(ctx.outletId, { status: 'issued', limit: 5 });
        recent = (r.rows || []).slice(0, 5).map((n) => ({ number: n.credit_note_no, customer: n.customer_name || '—', amount: num(n.total_amount), issued: n.issued_at }));
      } catch (_) { /* recent list is best-effort */ }
      return { currency: ctx.currency, count: num(s.count), total: num(s.total_amount), tax: num(s.tax_amount), notes: recent };
    },
    summarize: (d) => {
      if (!d.count) return 'No credit notes have been issued.';
      return `${d.count} credit note${d.count === 1 ? '' : 's'} issued, totalling ${money(d.currency, d.total)} (incl. ${money(d.currency, d.tax)} tax).`;
    },
  },

  {
    name: 'wastage',
    description: 'Inventory wastage logged recently: how many entries, the total value thrown away, and the biggest items wasted with their reason',
    keywords: ['wastage', 'wasted', 'waste', 'food waste', 'spoilage', 'spoiled', 'thrown away', 'throw away', 'dumped', 'expired items', 'wastage log', 'waste value', 'spoiled ingredients', 'wasted stock', 'wasted inventory', 'how much waste'],
    permission: 'VIEW_INVENTORY',
    run: async (ctx) => {
      const logs = await inventory.getWastageLogs(ctx.outletId, { limit: 100 });
      const list = Array.isArray(logs) ? logs : (logs.items || logs.rows || []);
      let totalValue = 0;
      const rows = list.map((w) => {
        const qty = num(w.quantity);
        const unitCost = num(w.inventory_item && w.inventory_item.cost_per_unit);
        const value = Math.round(qty * unitCost * 100) / 100;
        totalValue += value;
        return { item: w.inventory_item ? w.inventory_item.name : null, quantity: qty, unit: w.inventory_item ? w.inventory_item.unit : null, reason: w.reason, value };
      });
      rows.sort((a, b) => b.value - a.value);
      return { currency: ctx.currency, count: list.length, total_value: Math.round(totalValue * 100) / 100, items: rows.slice(0, 15) };
    },
    summarize: (d) => {
      if (!d.count) return 'No wastage has been logged recently.';
      const top = d.items.slice(0, 3).map((i) => `${i.item || 'item'} (${i.quantity}${i.unit ? ` ${i.unit}` : ''})`).join(', ');
      return `${d.count} wastage entr${d.count === 1 ? 'y' : 'ies'} logged, worth ${money(d.currency, d.total_value)}. Most: ${top}.`;
    },
  },

  {
    name: 'customer_lookup',
    description: 'Look up ONE customer by name or phone — their total spend, visits, loyalty points and most recent order',
    keywords: ['look up', 'look up customer', 'look up a customer', 'find customer', 'find a customer', 'customer details', 'customer profile', 'search customer', 'lookup customer', 'how much has', 'points for', 'last order', 'how many points'],
    permission: 'VIEW_CUSTOMERS',
    run: async (ctx, question) => {
      const q = String(question || '');
      const digits = (q.match(/\d[\d\s-]{5,}\d/) || [])[0];
      const stop = ['look', 'lookup', 'find', 'customer', 'customers', 'spend', 'spent', 'points', 'point', 'loyalty', 'order', 'orders', 'last', 'visit', 'visits', 'how', 'much', 'many', 'has', 'have', 'does', 'the', 'who', 'what', 'details', 'profile', 'phone', 'number', 'search', 'show', 'tell', 'about', 'for', 'with', 'their'];
      const term = digits
        ? digits.replace(/[\s-]/g, '')
        : q.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.includes(w.toLowerCase())).join(' ').trim();
      if (!term) return { currency: ctx.currency, found: false, need: 'a customer name or phone number' };
      const { customers } = await customer.listCustomers(ctx.outletId, { search: term, limit: 1 }, null);
      if (!customers || !customers.length) return { currency: ctx.currency, found: false, query: term };
      const c = customers[0];
      let last_order = null;
      try {
        const full = await customer.getCustomer(c.id, null);
        const o = (full.orders || [])[0];
        if (o) last_order = { number: o.order_number, total: num(o.grand_total), at: o.created_at };
      } catch (_) { /* last-order enrichment is best-effort */ }
      return {
        currency: ctx.currency,
        found: true,
        name: c.full_name || '(no name)',
        phone: c.phone,
        segment: c.segment,
        total_spend: num(c.total_spend),
        total_visits: c.total_visits,
        order_count: c._count?.orders ?? null,
        loyalty_points: c.loyalty_points?.current_balance ?? 0,
        last_visit_at: c.last_visit_at,
        last_order,
      };
    },
    summarize: (d) => {
      if (!d.found) return d.need ? `Tell me the customer's name or phone number and I'll look them up.` : `I couldn't find a customer matching "${d.query}".`;
      let s = `${d.name}${d.phone ? ` (${d.phone})` : ''}: ${money(d.currency, d.total_spend)} across ${d.total_visits || 0} visit${d.total_visits === 1 ? '' : 's'}, ${d.loyalty_points} loyalty point${d.loyalty_points === 1 ? '' : 's'}.`;
      if (d.last_order) s += ` Last order ${money(d.currency, d.last_order.total)}.`;
      return s;
    },
  },

  {
    name: 'settlement_status',
    description: 'Payment settlement / payout status — how much has settled to your bank, net after fees, and any batches still open or with a variance',
    keywords: ['settlement', 'settlements', 'settlement status', 'payout', 'payout status', 'settled to bank', 'settled', 'bank settlement', 'provider payout', 'gateway payout', 'acquirer', 'razorpay payout', 'upi payout', 'settlement variance', 'unreconciled settlements', 'money hit my bank'],
    permission: null,
    run: async (ctx) => {
      const s = await settlements.stats(ctx.outletId, {});
      let recent = [];
      try {
        const r = await settlements.list(ctx.outletId, { limit: 5 });
        recent = (r.rows || []).slice(0, 5).map((x) => ({ provider: x.provider, date: x.settlement_date, status: x.status, net: num(x.net_amount), variance: num(x.variance_amount), reference: x.reference }));
      } catch (_) { /* recent list is best-effort */ }
      const bs = s.by_status || {};
      return { currency: ctx.currency, total: num(s.total), by_status: bs, net_to_bank: num(s.total_net), total_variance: num(s.total_variance), recent };
    },
    summarize: (d) => {
      if (!d.total) return 'No settlement batches have been recorded yet.';
      const bs = d.by_status || {};
      const open = num(bs.open) + num(bs.variance);
      let s = `${d.total} settlement batch${d.total === 1 ? '' : 'es'}, ${money(d.currency, d.net_to_bank)} net to bank.`;
      if (open) s += ` ${open} still open or with a variance.`;
      return s;
    },
  },

  {
    name: 'aggregator_commission',
    description: 'Commission owed to delivery aggregators (Uber Eats, DoorDash, Menulog, Swiggy, Zomato) — per platform gross, commission and net payout',
    keywords: ['commission', 'aggregator commission', 'aggregator', 'swiggy', 'zomato', 'uber eats', 'ubereats', 'doordash', 'menulog', 'delivery apps', 'delivery platform', 'platform fees', 'marketplace commission', 'apps take', 'apps charging'],
    permission: null,
    run: async (ctx) => {
      const { rows, totals } = await aggregatorRecon.commissionReport(ctx.outletId, {});
      return {
        currency: ctx.currency,
        platforms: (rows || []).map((r) => ({ platform: r.platform_name, orders: r.order_count, gross: num(r.gross), commission_pct: r.commission_pct, commission: num(r.commission_amount), net_payout: num(r.net_payout) })),
        total_commission: num(totals && totals.commission_amount),
        total_net_payout: num(totals && totals.net_payout),
      };
    },
    summarize: (d) => {
      if (!d.platforms || !d.platforms.length) return 'No aggregator (delivery app) sales recorded, so there is no commission to report.';
      const top = d.platforms.slice(0, 3).map((p) => `${p.platform} ${money(d.currency, p.commission)}`).join(', ');
      return `Aggregator commission totals ${money(d.currency, d.total_commission)} — ${top}. Net payout ${money(d.currency, d.total_net_payout)}.`;
    },
  },

  {
    name: 'prep_time',
    description: 'Average kitchen prep time this month: how long orders take to make, plus the fastest and slowest ticket',
    keywords: ['prep time', 'preparation time', 'prep per order', 'cook time', 'kitchen turnaround', 'turnaround time', 'ticket time', 'kot time', 'kitchen speed', 'how long to make', 'how long to prepare', 'minutes to cook', 'how fast is my kitchen', 'how fast is the kitchen'],
    permission: null,
    run: async (ctx) => {
      const s = await prepAnalytics.getSummary(ctx.outletId, monthStart(), today());
      return { total_kots: num(s.total_kots), avg_prep: s.avg_fmt, avg_secs: num(s.avg_secs), fastest: s.fastest_fmt, slowest: s.slowest_fmt };
    },
    summarize: (d) => {
      if (!d.total_kots) return 'No kitchen tickets recorded this month yet, so there is no prep-time data.';
      return `Average prep time this month is ${d.avg_prep} across ${d.total_kots} kitchen ticket${d.total_kots === 1 ? '' : 's'} (fastest ${d.fastest}, slowest ${d.slowest}).`;
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
