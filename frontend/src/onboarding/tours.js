/**
 * Data-driven tour registry. One entry per module route.
 *
 * Add a tour = add an entry here (no engine changes). Each step:
 *   { title, body, anchor? }
 * `anchor` is a CSS selector (usually [data-tour="…"]). If it's omitted OR the
 * element isn't on the page, the engine shows a centered explainer card instead —
 * so a tour is always usable, and adding real anchors later just upgrades it to a
 * spotlight. Keys are exact route paths so the auto-runner can match location.pathname.
 */
export const TOURS = {
  '/': { name: 'Dashboard', steps: [
    { title: 'Welcome to your dashboard', body: 'This is your daily command centre — revenue, orders, alerts and an AI forecast for tomorrow, all live.' },
    { title: "Today's numbers", body: 'Revenue, orders and average order value update in real time as your team takes orders.', anchor: '[data-tour="dash.kpis"]' },
    { title: 'Order pipeline', body: 'See every open order move Confirmed → Ready → Served → Paid. Click any stage to drill into the orders inside it.', anchor: '[data-tour="dash.pipeline"]' },
    { title: 'Getting started checklist', body: 'Tick off these steps to go live — add your menu, a table, take a test order and connect payments.', anchor: '[data-tour="dash.checklist"]' },
    { title: 'Replay any tour anytime', body: 'Stuck later? Hit the “?” in the top bar to replay the tour for any screen.' },
  ]},

  '/pos': { name: 'POS Terminal', steps: [
    { title: 'Your point of sale', body: 'Take dine-in, takeaway and delivery orders from one screen — this is where most of the action happens.' },
    { title: 'Pick items from the menu', body: 'Tap items to add them to the cart; use categories and search to find things fast.', anchor: '[data-tour="pos.menu"]' },
    { title: 'The cart', body: 'Review items, quantities, modifiers and discounts here before sending to the kitchen.', anchor: '[data-tour="pos.cart"]' },
    { title: 'Send to kitchen (KOT)', body: 'Punch the order to fire a Kitchen Order Ticket to the Kitchen Display, then generate the bill and take payment.', anchor: '[data-tour="pos.actions"]' },
    { title: 'Order types', body: 'Switch between Dine-in (pick a table), Takeaway and Delivery — each flows into the same pipeline.', anchor: '[data-tour="pos.ordertype"]' },
  ]},

  '/kitchen': { name: 'Kitchen Display', steps: [
    { title: 'The kitchen screen', body: 'Live tickets flow NEW → COOKING → READY. Timers turn amber then red as tickets age, so nothing gets forgotten.' },
    { title: 'Tick items as you cook', body: 'Tick each dish as it is ready — only ticked items advance; un-ticked ones stay cooking. The ticket auto-moves when all are done.', anchor: '[data-tour="kds.card"]' },
    { title: 'Hand off (serve)', body: 'In the READY column, the purple hand-off control marks each dish served/picked up — distinct from the green “cooked” check.' },
    { title: 'Stations', body: 'Filter by station (Kitchen / Bar / Dessert / Packing) so each screen shows only its tickets.', anchor: '[data-tour="kds.stations"]' },
  ]},

  '/running-orders': { name: 'Live Orders', steps: [
    { title: 'All active orders', body: 'Every order still in play — dine-in, takeaway and delivery — updates here in real time.' },
    { title: 'Act on any order', body: 'Bill, take payment, add items, transfer or merge tables, apply a discount or send an e-bill, right from the card.' },
  ]},

  '/orders': { name: 'Order History', steps: [
    { title: 'Every completed order', body: 'Search and filter your full order history, with a clean status for each (Ready → Served → Paid).' },
    { title: 'Print a receipt anytime', body: 'Open any order and print or re-print its bill receipt — works for any channel, any date.' },
  ]},

  '/menu': { name: 'Menu', steps: [
    { title: 'Manage your menu', body: 'Create categories, items, variants and add-ons — with per-outlet overrides and day-part availability.' },
    { title: 'AI Menu Scan', body: 'Upload a photo or PDF of your existing menu and AI extracts items, prices and food types for you to confirm — no manual typing.', anchor: '[data-tour="menu.aiscan"]' },
    { title: 'Add an item', body: 'Set name, price, food type and photo. Link a recipe so selling it auto-deducts ingredient stock.', anchor: '[data-tour="menu.add"]' },
  ]},

  '/inventory': { name: 'Inventory', steps: [
    { title: 'Stock control', body: 'Track ingredient stock, units and wastage. Selling a dish auto-deducts its recipe ingredients.' },
    { title: 'Recipes drive deduction', body: 'Link each dish to its ingredients once; every sale then updates stock automatically.', anchor: '[data-tour="inv.recipes"]' },
    { title: 'AI inventory + smart PO', body: 'AI suggests items and pricing for your cuisine and drafts a purchase order from low-stock signals.', anchor: '[data-tour="inv.ai"]' },
  ]},

  '/purchase-orders': { name: 'Purchase Orders', steps: [
    { title: 'Order from suppliers', body: 'Build a PO from preset item chips with live totals, then approve it.' },
    { title: 'Receive & stock up', body: 'Receiving a PO creates a goods-received note, increments stock and posts an accounting journal. Send the PO to suppliers by PDF or WhatsApp.' },
  ]},

  '/central-kitchen': { name: 'Central Kitchen', steps: [
    { title: 'Hub-and-spoke stock', body: 'Manage indents between a central/commissary kitchen and your outlets: request → approve → dispatch → receive.' },
  ]},

  '/customers': { name: 'Customers', steps: [
    { title: 'Your customer directory', body: 'Segments (new / regular / VIP / lapsed), visit history, birthdays and loyalty — attach a customer to an order to accrue points.' },
    { title: 'Privacy tools', body: 'Handle data-removal requests (right to be forgotten) directly from a customer record.' },
  ]},

  '/crm': { name: 'Loyalty & Rewards', steps: [
    { title: 'Loyalty & marketing', body: 'Run points, birthday campaigns and SMS/WhatsApp offers. Points accrue on paid orders and redeem at checkout.' },
  ]},

  '/discounts': { name: 'Promotions', steps: [
    { title: 'Discounts & promos', body: 'Create %-off, flat, BOGO and code-based promotions, then toggle them on and off — they apply live at the POS.' },
  ]},

  '/pricing': { name: 'Dynamic Pricing', steps: [
    { title: 'Time & demand pricing', body: 'Set rules that change prices by time slot, day, season or combo — with impact analytics.' },
  ]},

  '/festival': { name: 'Festival Mode', steps: [
    { title: 'Festival menus & themes', body: 'Auto-detect upcoming festivals and switch on special menus, themed pricing and branding.' },
  ]},

  '/reports': { name: 'Reports', steps: [
    { title: 'Your reporting hub', body: '20+ reports — sales, item-wise, hourly, tax, inventory and staff — with date presets and charts.' },
    { title: 'Export & print', body: 'Every report can be filtered by date range and downloaded or printed for your accountant.', anchor: '[data-tour="reports.range"]' },
  ]},

  '/advanced-reports': { name: 'Advanced Reports', steps: [
    { title: 'Deeper analytics', body: 'P&L, hourly heatmaps, category breakdowns and period-over-period comparisons.' },
  ]},

  '/menu-analytics': { name: 'Menu Analytics', steps: [
    { title: 'Menu engineering (ABC)', body: 'See which dishes are Top Sellers (A), Moderate (B) and Slow Movers (C) by sales and profit — and what to promote or rework.' },
  ]},

  '/prep-analytics': { name: 'Prep Analytics', steps: [
    { title: 'Kitchen speed', body: 'Average cook time per item and station, SLA compliance, heatmaps and outliers from your KDS data.' },
  ]},

  '/live': { name: 'Live Dashboard', steps: [
    { title: 'Real-time counters', body: 'Live orders, revenue, active tables and prep timers — a big-screen view for the floor.' },
  ]},

  '/business-health': { name: 'Business Health', steps: [
    { title: 'Business health', body: 'A combined performance view — revenue, payments, labour and discounts — with alerts.' },
  ]},

  '/channel-analytics': { name: 'Channel Analytics', steps: [
    { title: 'Performance by channel', body: 'Compare dine-in, QR, aggregator and direct: orders, AOV, cancel rate, commission and net.' },
  ]},

  '/eod-report': { name: 'EOD Report', steps: [
    { title: 'Close the day', body: 'A guided cash reconciliation: day summary → payment breakdown → count the drawer → reconcile → lock.' },
  ]},

  '/payments': { name: 'Payments', steps: [
    { title: 'Payment records', body: 'Every tender by method — cash, card, EFTPOS, split — searchable, with refunds and reconciliation.' },
  ]},

  '/credit-notes': { name: 'Credit Notes', steps: [
    { title: 'Refunds & adjustments', body: 'Issue tax-compliant credit / adjustment notes for returns and corrections.' },
  ]},

  '/settlements': { name: 'Settlements', steps: [
    { title: 'Match settlements', body: 'Reconcile payment-provider settlements — open / matched / variance — and close them off.' },
  ]},

  '/aggregator-reconciliation': { name: 'Delivery Payouts', steps: [
    { title: 'Reconcile delivery payouts', body: 'Per platform: gross sales, commission taken and expected net payout for a date range.' },
  ]},

  '/delivery': { name: 'Own Delivery', steps: [
    { title: 'Dispatch your own orders', body: 'Send orders to on-demand couriers (Uber Direct, DoorDash Drive): quote → create → track to delivered.' },
  ]},

  '/86-board': { name: '86 Board', steps: [
    { title: 'Live availability', body: 'Instantly 86 (mark unavailable) items across delivery channels, and auto-86 when stock hits zero.' },
  ]},

  '/online-orders': { name: 'Online Orders', steps: [
    { title: 'Incoming delivery orders', body: 'Accept or reject aggregator orders as they arrive — they flow straight into your kitchen and order pipeline.' },
  ]},

  '/qr-orders': { name: 'QR Orders', steps: [
    { title: 'Table QR orders', body: 'When a guest scans the table QR and orders, it lands here to accept — it then occupies the table and fires a KOT.' },
  ]},

  '/reservations': { name: 'Reservations', steps: [
    { title: 'Table bookings', body: 'Create and track bookings (pending → confirmed → seated). Seating a reservation opens a POS order.' },
  ]},

  '/accounting': { name: 'Accounting', steps: [
    { title: 'Native accounting', body: 'Full double-entry books — chart of accounts, ledger, P&L, balance sheet — fed automatically by sales, purchases and payroll.' },
    { title: 'No separate tool needed', body: 'Bank reconciliation, period locks and manual journals are built in, so you may not need a separate Xero subscription.' },
  ]},

  '/payroll': { name: 'Payroll', steps: [
    { title: 'Run payroll', body: 'Pay runs compute PAYG withholding and 12% Super for you, produce payslips and post a wage journal — with STP export.' },
  ]},

  '/gst-returns': { name: 'GST Returns', steps: [
    { title: 'GST filing', body: 'GSTR-1 and GSTR-3B summaries with HSN and tax breakdowns, ready for your accountant.' },
  ]},

  '/customer-invoices': { name: 'Invoices', steps: [
    { title: 'Accounts receivable', body: 'Raise, issue and track customer invoices — posts to the ledger automatically.' },
  ]},

  '/fixed-assets': { name: 'Fixed Assets', steps: [
    { title: 'Asset register', body: 'Track assets and run depreciation, posting straight to your books.' },
  ]},

  '/budgets': { name: 'Budgets', steps: [
    { title: 'Budget vs actual', body: 'Plan budgets and track them against the ledger.' },
  ]},

  '/xero-analytics': { name: 'Financials', steps: [
    { title: 'Financial insights', body: 'A finance overview — P&L, expenses, labour and seasonal trends — with AI-driven insights.' },
  ]},

  '/staff-management': { name: 'Staff Management', steps: [
    { title: 'Team profiles', body: 'Full HR records — personal, employment, compliance, certifications and availability — for every team member.' },
  ]},

  '/staff-rostering': { name: 'Staff Rostering', steps: [
    { title: 'Build the roster', body: 'Create weekly shifts, track availability and certifications, and publish the roster to your staff.' },
  ]},

  '/settings': { name: 'Settings', steps: [
    { title: 'Configure your outlet', body: 'Tax, receipt printer, KDS display, payment methods, voice POS and appearance all live here.' },
    { title: 'Owner-only security', body: 'As the owner you also get a Security section for manager PINs and sensitive controls.' },
  ]},
};
