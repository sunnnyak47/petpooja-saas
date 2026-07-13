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
const { computeForecast } = require('./assistant.forecast');

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
    keywords: ['profit', 'tax', 'gst', 'bas', 'money', 'doing', 'income', 'owe', 'owes', 'unpaid', 'receivable', 'payable', 'expense', 'spend', 'financial', 'bottom line'],
    permission: 'VIEW_REPORTS',
    run: (ctx) => copilot.buildBooksContext(ctx.outletId),
    summarize: (data, question) => copilot.ruleBasedAnswer(question, data),
  },

  {
    name: 'sales_today',
    description: "Today's sales so far: total revenue, number of orders, average order value, and channel split",
    keywords: ['today', 'takings', 'made today', 'orders today', 'sold today', 'revenue today', 'busy', 'how much today'],
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
    keywords: ['top seller', 'best seller', 'top item', 'popular', 'best selling', 'most sold', 'top dish', 'selling'],
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
    keywords: ['low stock', 'running low', 'out of stock', 'reorder', 'stock', 'inventory', 'running out', 'restock'],
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
    keywords: ['top customer', 'best customer', 'regular', 'loyal', 'biggest customer', 'who spends', 'valuable customer'],
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
    keywords: ['predict', 'prediction', 'forecast', 'tomorrow', 'expected', 'projection', 'estimate', 'next week', 'how many orders', 'busy tomorrow', 'trend', 'trending', 'average prediction', 'compare to last 30'],
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
    keywords: ['purchase order', 'po', 'pending order', 'supplier order', 'open po', 'ordered from supplier', 'incoming stock'],
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
];

const SUGGESTIONS = [
  'How much did we sell today?',
  "What's tomorrow looking like?",
  'What are my top sellers?',
  "What's running low on stock?",
];

module.exports = { TOOLS, SUGGESTIONS, money };
