/**
 * @fileoverview Curated help knowledge base for the assistant's `help_howto`
 * tool — a lightweight, embedding-free RAG source.
 *
 * Each entry is a self-contained "how do I…" answer about USING the app, grounded
 * in the real UI (actual tab names, form fields, options and parameters).
 * `searchKnowledge` ranks entries by keyword/term overlap with the question and
 * returns the best few as grounding DATA; the assistant's compose() step phrases
 * a friendly answer from ONLY those entries (so it never invents app behaviour).
 *
 * Covers: POS/orders, kitchen, tables/reservations, menu, inventory/purchasing,
 * customers/loyalty, promotions, staff/rostering/payroll, reports/EOD/analytics,
 * accounting/BAS/invoices/credit-notes/assets/budgets/settlements, delivery &
 * aggregators, QR ordering, integrations, offline mode, and every Settings tab.
 * @module modules/assistant/assistant.knowledge
 */

/** @type {Array<{topic:string, keywords:string[], text:string}>} */
const KB = [
  // ── POS & ORDERS ──────────────────────────────────────────────────────────
  {
    topic: 'Take a new order (POS)',
    keywords: ['take order', 'new order', 'place order', 'pos', 'add items', 'start order', 'punch order', 'create order', 'ring up', 'make an order'],
    text: 'Open POS Terminal, tap items to add them to the cart (choose a variant/size and add-ons if the item has them), pick the order type (dine-in / takeaway / delivery) and — for dine-in — the table, then tap Place Order or Send to Kitchen. The KOT prints automatically.',
  },
  {
    topic: 'Collect payment / split a bill',
    keywords: ['collect payment', 'take payment', 'settle', 'pay bill', 'split bill', 'split the bill', 'split a bill', 'part payment', 'cash card', 'settle table', 'close bill', 'multi tender', 'how to pay'],
    text: 'Open the order or table and choose Collect Payment. Pick the method (cash, card/EFTPOS, or UPI), enter the amount and Confirm. For a split bill add more than one payment line (e.g. part cash + part card) — the balance updates until it reaches zero. Cash payments pop the drawer.',
  },
  {
    topic: 'Hold / park an order',
    keywords: ['hold order', 'park order', 'save order', 'held order', 'hold', 'park', 'come back later'],
    text: 'In POS, build the cart and choose Hold instead of Place Order. Held orders are parked without going to the kitchen and do not need a table; reopen one later to add items, send to kitchen, or settle.',
  },
  {
    topic: 'Void or cancel an item / order',
    keywords: ['void', 'cancel order', 'cancel item', 'remove item', 'delete order', 'void item', 'manager pin', 'refund order', 'cancel a cooking'],
    text: 'To remove one item, use Void Item on the order; to cancel the whole order use Cancel/Void. Voiding usually needs a Manager PIN (set on the staff member). An order can be cancelled at any stage before it is paid — a bill is not required first. Once paid, use a refund/credit note instead.',
  },
  {
    topic: 'Apply a discount to an order',
    keywords: ['apply discount', 'add discount', 'discount order', 'give discount', 'comp order', 'complimentary', 'reduce price', 'markdown'],
    text: 'On the open order in POS, choose Apply Discount and pick a percentage or flat amount (and a reason). To make an order free, use Comp. Discounts you set up in Discounts & Promotions can also auto-apply. Tax is recalculated on the discounted amount.',
  },
  {
    topic: 'Transfer, merge or split an order between tables',
    keywords: ['transfer table', 'move order', 'change table', 'merge order', 'merge tables', 'split order', 'combine bills', 'move to another table'],
    text: 'From the open order use Transfer to move it to a new table (frees the old one), Merge to combine two tables’ orders into one bill, or Split to move selected items into a new separate order/bill. Totals recompute automatically.',
  },
  {
    topic: 'Kitchen display (KOT / KDS)',
    keywords: ['kitchen', 'kot', 'kds', 'kitchen display', 'tickets', 'preparing', 'mark ready', 'bump', 'station', 'kitchen order ticket'],
    text: 'The Kitchen Display shows live order tickets by status — New/Pending, Preparing, Ready. Tap a ticket to advance it; marking items Ready/Served notifies the counter. Configure auto-accept, sound alerts and the late-order alert threshold in Settings → KDS Display.',
  },
  {
    topic: 'Tables — status, cleaning, seating',
    keywords: ['table', 'tables', 'occupied', 'cleaning', 'free table', 'available', 'seat guests', 'covers', 'add table', 'edit table', 'table number', 'floor plan', 'delete table'],
    text: 'The Tables screen shows each table’s status (empty, occupied, bill-pending, cleaning, reserved). Tap a table to seat guests, start an order, collect payment or mark it for cleaning. Add/edit tables in Table management: set Table Number, Capacity, Shape and Area; use Bulk Add to create many at once (prefix + range). After cleaning, mark it available to re-seat.',
  },
  {
    topic: 'Reservations',
    keywords: ['reservation', 'reservations', 'booking', 'book a table', 'reserve', 'party size', 'reservation offline'],
    text: 'Open Reservations → New Reservation and enter the customer name/phone, party size, date, time and (optionally) a table — if you leave the table blank the system suggests a best-fit one. On the desktop app the list also works offline from the local cache, and new bookings queue and sync when you reconnect.',
  },
  {
    topic: '86 / make a menu item unavailable',
    keywords: ['86', 'sold out', 'unavailable', 'out of item', 'disable item', 'hide item', 'mark unavailable', 'stop selling', '86 board'],
    text: 'To 86 an item, open Menu, find the item and turn off its Item Available toggle (or use the 86 Board). It stays on the menu but can’t be ordered until you switch it back on.',
  },
  {
    topic: 'Live / running orders',
    keywords: ['live orders', 'running orders', 'active orders', 'open orders', 'orders in progress', 'whats cooking', 'ongoing orders'],
    text: 'Live Orders shows every order still in play — dine-in, takeaway and delivery that isn’t finished/paid. From here you can add items, generate the bill, collect payment or cancel. On desktop this works offline and reflects cloud tickets after the first online login.',
  },
  {
    topic: 'Order history',
    keywords: ['order history', 'past orders', 'previous orders', 'find an order', 'order lookup', 'reprint bill', 'old orders'],
    text: 'Order History lists past orders with filters for status and date. Open any order to view items, payments and reprint the bill. On the desktop app offline it shows orders cached to this device (plus what you created offline); the full cloud history returns once you’re back online.',
  },

  // ── MENU ──────────────────────────────────────────────────────────────────
  {
    topic: 'Add or edit a menu item',
    keywords: ['add menu item', 'new item', 'edit item', 'menu item', 'add dish', 'create item', 'menu management', 'item name', 'add food'],
    text: 'Menu → Add Item. Fill Item Name, Short Code (optional), Description, Category, Dietary Type (veg/non-veg/egg) and tags/allergens. Under Pricing choose Single Price (amount + optional label like “Regular”) or Multiple Variants. Set the GST Category, upload an Image (JPG/PNG, max 5MB), toggle Item Available, link Add-on Groups, and optionally add an Availability Schedule, then Save. New items appear in POS immediately.',
  },
  {
    topic: 'Add or rename a menu category',
    keywords: ['add category', 'new category', 'rename category', 'menu category', 'category order', 'delete category', 'display order'],
    text: 'In Menu, use + New Category in the category sidebar and enter a Category Name and Display Order (min 1). Hover a category to Edit (rename) or Delete (owner/manager only).',
  },
  {
    topic: 'Menu item variants and sizes',
    keywords: ['variant', 'variants', 'size', 'sizes', 'small large', 'half full', 'multiple prices', 'price options'],
    text: 'When adding/editing an item, switch Pricing to Multiple Variants and add rows like “Small / Regular / Large” each with its full price (Add Variant for more). The first variant sets the base price; the others store the difference. Variants appear as size choices in POS.',
  },
  {
    topic: 'Add-on groups (extras / modifiers)',
    keywords: ['add-on', 'addon', 'extras', 'modifiers', 'toppings', 'add on group', 'customize item'],
    text: 'Create Add-on Groups (e.g. “Extra cheese”, “Spice level”) and then link them to an item in the item form under Add-on Groups. At POS the operator can add these extras, and their price is included in the line total.',
  },
  {
    topic: 'Bulk update menu prices',
    keywords: ['bulk price', 'update prices', 'change prices', 'increase prices', 'price increase', 'bulk edit menu', 'raise prices'],
    text: 'In Menu, turn on Bulk Edit, select the items, then Update Prices. Choose % Percentage or Flat Amount and enter a value (positive to increase, negative to decrease) to apply it across the selected items at once.',
  },
  {
    topic: 'Import / AI-sync a menu',
    keywords: ['import menu', 'ai sync', 'scan menu', 'upload menu', 'bulk add items', 'menu from image', 'ai menu'],
    text: 'Use AI Sync on the Menu page to scan or import a menu (e.g. from a photo or text) and auto-create items and categories, which you can then review and edit.',
  },
  {
    topic: 'Schedule item availability / happy hour',
    keywords: ['availability schedule', 'time slot', 'happy hour', 'breakfast menu', 'available times', 'menu timing', 'time-based menu'],
    text: 'In the item form, add an Availability Schedule with time slots — each has a Day (Everyday / Mon–Fri / Sat–Sun) plus start and end time — so the item only sells during those hours (e.g. a breakfast or happy-hour item).',
  },

  // ── INVENTORY & PURCHASING ────────────────────────────────────────────────
  {
    topic: 'Add an inventory item / material',
    keywords: ['add inventory', 'add material', 'new stock item', 'raw material', 'ingredient', 'add ingredient', 'stock item', 'unit cost'],
    text: 'Inventory → Add Material. Enter Item Name (AI Fill can autofill the rest), Category, Unit (kg/gm/ltr/ml/pcs/pkt/box/dozen), Cost per Unit, Min Stock, Max Stock and Reorder Qty, and toggle Auto-order when low, then Save.',
  },
  {
    topic: 'Inventory & low stock',
    keywords: ['inventory', 'stock', 'low stock', 'running low', 'reorder', 'stock level', 'auto order', 'out of stock', 'short on'],
    text: 'Inventory tracks raw-material stock; items below their Min Stock threshold show as low. Use Auto-Order to raise POs for everything low at once, or turn on Auto-order when low per item to create a PO automatically at the minimum.',
  },
  {
    topic: 'Receive a delivery (stock in)',
    keywords: ['received delivery', 'receive stock', 'stock in', 'goods received', 'add stock', 'delivery arrived'],
    text: 'Inventory → Received Delivery. Search the items that arrived, enter the quantity for each and save — it adds the stock with reason “Delivery received”.',
  },
  {
    topic: 'Log wastage',
    keywords: ['wastage', 'waste', 'spoilage', 'damaged stock', 'expired', 'write off', 'log waste'],
    text: 'Inventory → Log Wastage. Pick the item(s), enter the Quantity and a reason (Expired, Damaged, Over-portioned, Cooking error, Spillage) to deduct it from stock and record the loss.',
  },
  {
    topic: 'Adjust stock / stock count',
    keywords: ['adjust stock', 'stock count', 'stock adjustment', 'audit', 'correct stock', 'manual count', 'stocktake'],
    text: 'Inventory → Adjust Stock. Search the item, choose + Add Stock or − Remove Stock, enter the Quantity and a reason (Manual Count, Audit Correction, Return to Vendor, Transfer, Damage Write-off, Other).',
  },
  {
    topic: 'Manage suppliers',
    keywords: ['supplier', 'suppliers', 'add supplier', 'vendor', 'supplier details', 'payment terms'],
    text: 'In Inventory → Suppliers, Add Supplier with Name, Contact Person, Phone, Email and Payment Terms (Net 7/15/30, Cash on Delivery, Advance). Suppliers are then selectable on purchase orders.',
  },
  {
    topic: 'Recipes / ingredient deduction',
    keywords: ['recipe', 'recipes', 'bom', 'bill of materials', 'ingredient deduction', 'auto deduct stock'],
    text: 'Recipes link a menu item to the raw materials it uses, so selling the dish automatically deducts those ingredients from inventory. View them in Inventory → Recipes.',
  },
  {
    topic: 'Create and receive a purchase order (PO)',
    keywords: ['purchase order', 'create po', 'new po', 'raise po', 'order stock', 'mark received', 'receive po', 'po pdf', 'send po whatsapp', 'approve po'],
    text: 'Inventory → Purchase Orders → New PO. Pick the Supplier, set Order/Delivery dates, Reference and Terms, then add line items (item, HSN/Code, unit, qty, rate, GST%) — presets fill defaults and totals compute live. Save, then Approve the draft, Download PDF or send via WhatsApp. When the goods arrive, open the PO and Mark Received to add the stock.',
  },

  // ── CUSTOMERS & LOYALTY ───────────────────────────────────────────────────
  {
    topic: 'Add a customer',
    keywords: ['add customer', 'new customer', 'create customer', 'customer details', 'crm', 'customer profile', 'save customer'],
    text: 'Customers → Add Customer. Enter Full Name, Phone (required), Email, Gender, Date of Birth, Anniversary, Segment (New/Regular/VIP), Diet Preference, marketing consent and notes. Customers are auto-enrolled in loyalty. DOB/anniversary drive birthday reminders and campaigns.',
  },
  {
    topic: 'Loyalty & rewards',
    keywords: ['loyalty', 'rewards', 'points', 'redeem points', 'loyalty program', 'earn points', 'vip'],
    text: 'Customers earn loyalty points automatically on paid orders. At checkout you can redeem a customer’s points against the bill (capped by the redemption limit). Manage members and segments (New/Regular/VIP/Lapsed) in Customers.',
  },
  {
    topic: 'Send a marketing campaign',
    keywords: ['marketing', 'campaign', 'sms campaign', 'whatsapp campaign', 'promote', 'birthday campaign', 'message customers', 'send offer'],
    text: 'Customers → Marketing Campaign. Set a Campaign Name, Channel (WhatsApp/SMS/Email), Target Segment (All/New/Regulars/VIPs/Lapsed) and a Message (use {name} to personalise). Only customers with marketing consent are messaged.',
  },
  {
    topic: 'Export or erase customer data (privacy)',
    keywords: ['export customer data', 'erase data', 'delete customer data', 'dpdp', 'privacy', 'gdpr', 'right to erasure'],
    text: 'On a customer’s row use Export data to download their record, or Erase personal data to anonymise it (privacy/DPDP compliance). These are separate from deleting the customer.',
  },

  // ── PROMOTIONS / DISCOUNTS ────────────────────────────────────────────────
  {
    topic: 'Create a discount, coupon or promotion',
    keywords: ['create discount', 'coupon', 'promo code', 'promotion', 'offer', 'bogo', 'buy one get one', 'happy hour discount', 'auto apply discount', 'discount rule'],
    text: 'Discounts & Promotions → New Promotion. Set Name, Coupon Code (blank = auto-apply), Type (Percentage / Flat Amount / BOGO / Buy X Get Y), Value, Min Order Value, Max Discount cap (percentage type only), Start/End dates, Max Uses and Auto-apply. Save — eligible orders can then use it at POS or online.',
  },

  // ── STAFF, ROSTERING & PAYROLL ────────────────────────────────────────────
  {
    topic: 'Add a staff member',
    keywords: ['add staff', 'new employee', 'add employee', 'create staff', 'staff role', 'add waiter', 'add cashier', 'manager pin'],
    text: 'Staff Management → Add. Enter Full Name, Phone, Email, Role (Waiter/Server, Cashier, Chef/Kitchen, Manager, Delivery) and an optional 4–6 digit Manager PIN (needed to approve voids/comps/refunds). A temporary password is set if you leave it blank.',
  },
  {
    topic: 'Staff HR profile (employment, compliance, certifications)',
    keywords: ['staff profile', 'employee details', 'employment', 'compliance', 'certification', 'tfn', 'super', 'visa', 'rsa', 'wwcc', 'bank details', 'hr'],
    text: 'Open a staff member in Staff Management to edit five tabs: Personal (DOB, address, emergency contact), Employment (employee code, type, pay rate/salary, bank BSB/account, TFN, superannuation), Compliance (Right to Work, RSA, WWCC, Food Safety, Police Check with expiries), Certifications (add cert type, number, issue/expiry), and Availability (per-day hours).',
  },
  {
    topic: 'Staff attendance / clock in–out',
    keywords: ['attendance', 'clock in', 'clock out', 'shift report', 'staff hours', 'timesheet', 'punch in', 'who is working'],
    text: 'Staff clock in and out from the Attendance screen (some setups confirm with an OTP). The shift report totals each person’s days present and hours worked for the period, which feeds payroll.',
  },
  {
    topic: 'Create and publish a staff roster',
    keywords: ['roster', 'rostering', 'schedule shifts', 'assign shift', 'publish roster', 'staff schedule', 'shift planning', 'new roster'],
    text: 'Staff Rostering → New Roster (name, start/end dates). On the calendar, +Add a shift to a day and pick the Staff Member, Start/End time and a Role label. When the week is set, Publish the roster to make it live.',
  },
  {
    topic: 'Track staff certifications (RSA, WWCC, Food Safety)',
    keywords: ['certification', 'rsa', 'wwcc', 'food safety', 'first aid', 'cert expiry', 'add certification', 'license expiry'],
    text: 'In Rostering → Certifications (or the staff member’s Certifications tab) use Add Cert: choose the Certification Type (RSA, Food Safety, First Aid, Working With Children, Security License), Certificate Number, Provider, Issue and Expiry dates. The app flags certs expiring within 60 days.',
  },
  {
    topic: 'Run payroll (pay run)',
    keywords: ['payroll', 'pay run', 'pay staff', 'wages', 'payslip', 'paye', 'payg', 'superannuation', 'net pay', 'finalise pay run'],
    text: 'Payroll → New Pay Run. Set Period Start, Period End and Pay Date, add employee lines (staff, gross, hours) and Create Pay Run. Open a run to see payslips (Gross/PAYG/Super/Net); Finalise a draft to lock it and post it to the books.',
  },

  // ── REPORTS, EOD & ANALYTICS ──────────────────────────────────────────────
  {
    topic: 'Reports & analytics',
    keywords: ['reports', 'analytics', 'sales report', 'revenue report', 'kpis', 'export report', 'business report', 'download report'],
    text: 'Reports (Analytics) shows KPIs, revenue trend, payment/cost mix, peak hours and top sellers with date presets or a custom range. Each panel has its own CSV Download, plus a full Export and Print. Use the outlet selector for multi-outlet views.',
  },
  {
    topic: 'End of day / close of day (EOD)',
    keywords: ['eod', 'end of day', 'day close', 'close the day', 'cash up', 'z report', 'reconcile cash', 'closing', 'cash count', 'opening float'],
    text: 'EOD Report is a 5-step wizard: 1) Day Summary, 2) Payment Breakdown (enter your Opening Float), 3) Cash Count (enter notes/coins by denomination), 4) Reconciliation (expected vs counted — enter a Reason if there’s a discrepancy), 5) Lock & Finalise (Print then Lock — irreversible). Save Draft is available at any step, and it works offline on desktop.',
  },
  {
    topic: 'Advanced reports & business health',
    keywords: ['advanced reports', 'business health', 'profit margin', 'heatmap', 'net profit', 'square xero dashboard', 'performance', 'menu analytics', 'channel analytics'],
    text: 'Advanced Reports adds P&L, an hourly heatmap and category/trend breakdowns. Business Health (AU) combines Square payments + Xero financials into one dashboard (true net profit, card fees, labour %, cash forecast) — connect Square/Xero first. Menu Analytics and Channel Analytics break performance down by item and by sales channel.',
  },
  {
    topic: 'GST / BAS returns',
    keywords: ['gst return', 'bas', 'gstr-1', 'gstr-3b', 'gst report', 'tax return', 'lodge bas', 'gst filing', 'hsn summary'],
    text: 'India: GST Returns shows GSTR-1 and GSTR-3B summaries for a period with Download JSON. Australia: use the Accounting → BAS tab (G1/1A/G11/1B and net GST) and BAS Lodge to prepare and lodge. The GST & Compliance page also exports rate-wise, daily and HSN registers as CSV.',
  },

  // ── ACCOUNTING & FINANCE (AU) ─────────────────────────────────────────────
  {
    topic: 'Accounting (chart of accounts, ledger, statements)',
    keywords: ['accounting', 'chart of accounts', 'ledger', 'trial balance', 'balance sheet', 'journal', 'double entry', 'add account', 'period lock', 'seed chart'],
    text: 'Accounting (AU) is native double-entry. Use Seed Chart to create the chart of accounts, then the tabs: Chart of Accounts (Add Account — Code, Name, Type, GST flag), Ledger, Trial Balance, Profit & Loss, Balance Sheet (each with Export CSV), Manual Journal (post debit/credit lines), and Period Lock to lock/unlock a period.',
  },
  {
    topic: 'Create a customer (tax) invoice',
    keywords: ['invoice', 'customer invoice', 'tax invoice', 'accounts receivable', 'bill a customer', 'issue invoice', 'b2b invoice', 'mark paid'],
    text: 'Invoices → New Invoice. Enter Customer Name, Issue Date, Due Date (defaults +30 days), Notes and line items (Description, Qty, Unit Price) — GST is added at 10%. Create it, then Issue (posts to AR), Mark Paid when settled, or Void.',
  },
  {
    topic: 'Issue a credit note',
    keywords: ['credit note', 'refund document', 'return', 'adjustment note', 'issue credit', 'cancel credit note'],
    text: 'Credit Notes → New Credit Note. Optionally link an Order ID, add a Reason, Customer details and line items (Description, Qty, Unit Price, GST%) — the subtotal/tax/total preview live — then Issue Credit Note. An issued note can be Cancelled with a reason.',
  },
  {
    topic: 'Fixed assets & depreciation',
    keywords: ['fixed asset', 'assets', 'depreciation', 'asset register', 'net book value', 'run depreciation'],
    text: 'Fixed Assets → Add Asset (Name, Category, Purchase Date, Cost, Salvage Value, Useful Life in months). Use Run Depreciation, pick the period and Post Depreciation to write it to the ledger. Summary cards show Total Cost, Accumulated Depreciation and Net Book Value.',
  },
  {
    topic: 'Budgets (budget vs actual)',
    keywords: ['budget', 'budgets', 'budget vs actual', 'variance', 'plan spending', 'financial plan'],
    text: 'Budgets → New Budget. Set a Name and FY Year, add lines (pick an account + amount) and Save. Select a budget to see the Budget vs Actual table with Variance and Variance % (favourable/unfavourable coloured).',
  },
  {
    topic: 'Settlement reconciliation',
    keywords: ['settlement', 'reconcile', 'settlement batch', 'payout reconciliation', 'match payments', 'import settlement', 'acquirer'],
    text: 'Settlements → Import Settlement. Choose Provider (Razorpay/Card Acquirer/UPI/Bank/Manual), Currency, Reference and Date, and paste the Lines CSV (transaction_id, amount, fee, net, type, order_ref). Open the batch and Reconcile to match against recorded payments (matched/unmatched/variance), then Close.',
  },

  // ── DELIVERY, AGGREGATORS & QR ────────────────────────────────────────────
  {
    topic: 'Online / aggregator orders',
    keywords: ['online orders', 'aggregator', 'uber eats', 'doordash', 'menulog', 'swiggy', 'zomato', 'accept online order', 'auto accept'],
    text: 'Online Orders shows live aggregator orders (AU: Uber Eats/DoorDash/Menulog; India: Swiggy/Zomato) in a New → Preparing → Ready board with sound alerts. Set a prep time and Accept or Reject new ones, then Mark Ready for Pickup. Toggle Auto-Accept, and connect platforms via Manage Platforms / Integrations.',
  },
  {
    topic: 'Dispatch your own delivery',
    keywords: ['own delivery', 'delivery dispatch', 'courier', 'uber direct', 'doordash drive', 'get a driver', 'send delivery', 'delivery payout'],
    text: 'Own Delivery → pick a Provider (Uber Direct / DoorDash Drive), enter the customer name/phone and dropoff address, Get Quote (fee + ETA) and Request to book a courier. The dispatch list tracks status and lets you Track or Cancel. Delivery Payouts reconciles what you’re owed.',
  },
  {
    topic: 'Generate QR codes for tables',
    keywords: ['qr code', 'qr codes', 'table qr', 'generate qr', 'self ordering', 'scan to order', 'print qr', 'download qr'],
    text: 'QR Codes → click a table to render its ordering QR, then Download PNG or Print QR (a card with the restaurant name and table number). Customers scan it to order from their table. Tables must exist first in the Tables module.',
  },
  {
    topic: 'Approve QR self-orders',
    keywords: ['qr orders', 'table qr orders', 'approve qr order', 'customer scanned order', 'accept qr', 'self order approval'],
    text: 'QR Orders shows incoming customer scan-orders with a live alert. On each card, Accept & KOT sends it to the kitchen (and generates the KOT) or Reject cancels it and frees the table.',
  },

  // ── INTEGRATIONS & SYSTEM ─────────────────────────────────────────────────
  {
    topic: 'Connect an integration',
    keywords: ['integration', 'integrations', 'connect', 'zomato', 'swiggy', 'tyro', 'square', 'xero', 'myob', 'tally', 'razorpay', 'whatsapp', 'connect service', 'api key'],
    text: 'Integrations Hub → filter by Category, toggle a service on and Configure it with the required fields (e.g. Store/Restaurant ID or API keys), then Save Configuration. AU services include Uber Eats, DoorDash, Menulog, Tyro, Square, Xero, MYOB, WhatsApp and ATO BAS; India includes Zomato, Swiggy, Razorpay, Tally and Pine Labs.',
  },
  {
    topic: 'Devices & security (sessions)',
    keywords: ['device', 'devices', 'security', 'session', 'logout', 'log out others', 'signed in devices', 'login history', 'revoke device'],
    text: 'Devices & Security lists the devices signed into your account with their last activity and login history. Revoke a single session, or Log out all other devices if something looks wrong.',
  },
  {
    topic: 'Subscription & billing',
    keywords: ['subscription', 'billing', 'plan', 'upgrade', 'pay invoice', 'usage', 'trial', 'change plan'],
    text: 'Subscription shows your plan (Trial/Starter/Pro/Enterprise), usage vs limits (outlets, staff), included features and monthly usage. Invoices can be paid via the Pay button; upgrading is arranged with support.',
  },
  {
    topic: 'Raise a support ticket',
    keywords: ['support', 'help', 'raise ticket', 'contact support', 'report a problem', 'new ticket', 'get help'],
    text: 'Support → New Ticket. Enter a Subject, Priority (Low/Medium/High/Urgent) and Message, then Raise Ticket. Expand a ticket to read replies and respond until it’s resolved.',
  },

  // ── SETTINGS (every tab) ──────────────────────────────────────────────────
  {
    topic: 'Connect a thermal receipt printer',
    keywords: ['thermal printer', 'receipt printer', 'connect printer', 'printer setup', 'esc pos', 'printer ip', 'printer port', 'paper width', 'print bill', 'setup printer', 'network printer', 'kot printer'],
    text: 'Settings → Receipt Printer. Set Printer Type to Thermal (ESC/POS), choose Paper Width (80mm is standard, or 58mm/A4), enter the printer’s IP Address (e.g. 192.168.1.100) and Port (usually 9100), toggle Print Logo/Print Address and set a Footer Message, then Save Settings. Make sure the printer is on the same network as this device. On the desktop app the printer is then used automatically for KOTs and bills (with a browser-print fallback if it’s unreachable).',
  },
  {
    topic: 'General settings (name, currency, timezone, table rules)',
    keywords: ['general settings', 'restaurant name', 'currency', 'language', 'timezone', 'require table selection', 'auto-free table', 'outlet settings'],
    text: 'Settings → General. Set the Restaurant Name, Currency (INR/AUD/USD/AED/ZAR), Language and Timezone. Toggle “Require table selection for dine-in”, and enable predictive Auto-Free Table with a reminder grace countdown (15s–2min). Save Settings.',
  },
  {
    topic: 'Tax & GST settings',
    keywords: ['tax settings', 'gst settings', 'gstin', 'fssai', 'abn', 'acn', 'gst slab', 'service charge', 'gst inclusive', 'tax config'],
    text: 'Settings → Tax & GST. India: enter GSTIN and FSSAI. Australia: enter ABN and ACN. Set the Default GST Slab (AU: 0% or 10%; India: 0/5/12/18%), a Service Charge %, and toggle GST Inclusive Pricing (prices already include GST). Save Settings.',
  },
  {
    topic: 'Voice POS settings',
    keywords: ['voice settings', 'voice pos', 'voice language', 'speech settings', 'confirm before adding', 'continuous mode', 'silence timeout', 'speech rate', 'test microphone'],
    text: 'Settings → Voice POS. Choose the Recognition & Speech Language, and toggle Confirm Before Adding, Continuous Multi-Item Mode, Speak Responses Aloud, Toast Notifications, Save History and Wake On Open. Tune the Silence Timeout, Max Session Length and Speech Rate sliders, and use Test Microphone / Test Speech Output. (On the desktop app, voice records audio and transcribes it in the cloud.)',
  },
  {
    topic: 'Kitchen display (KDS) settings',
    keywords: ['kds settings', 'kitchen display settings', 'auto-accept orders', 'sound alerts', 'alert threshold', 'kitchen settings'],
    text: 'Settings → KDS Display. Toggle Auto-accept Orders and Sound Alerts, and set the Alert Threshold (minutes) after which a ticket is flagged as late. Save Settings.',
  },
  {
    topic: 'Payment method settings',
    keywords: ['payment settings', 'payment methods', 'enable cash', 'enable card', 'eftpos', 'upi', 'razorpay', 'payment options', 'upi vpa'],
    text: 'Settings → Payment. Toggle the methods you accept — Cash, Card/POS Machine, and EFTPOS (AU) or UPI (India). For UPI, add the UPI VPA and Merchant Display Name. To take online payments, enable Razorpay (India) with your Key ID, or connect Square (AU) via Integrations. Save Settings.',
  },
  {
    topic: 'Notification settings',
    keywords: ['notification settings', 'sms', 'email', 'whatsapp notifications', 'low stock alerts', 'order notifications', 'alerts'],
    text: 'Settings → Notifications. Toggle SMS, Email and WhatsApp for order confirmations/receipts, and Low Stock Alerts to be notified when inventory falls below threshold. Save Settings.',
  },
  {
    topic: 'Appearance / branding (theme, logo, colour)',
    keywords: ['appearance', 'theme', 'dark mode', 'brand colour', 'logo', 'compact layout', 'branding', 'change colors'],
    text: 'Settings → Appearance. Owners can set a Brand Colour (hex) and upload a Logo, then Save branding. Pick a Theme and toggle Compact Layout to fit more on screen.',
  },
  {
    topic: 'Hardware settings (cash drawer, scanner, scale)',
    keywords: ['hardware settings', 'cash drawer', 'barcode scanner', 'weighing scale', 'customer display', 'serial port', 'peripherals'],
    text: 'Settings → Hardware. Toggle Cash Drawer (auto-open on payment) and set its Serial Port (e.g. /dev/ttyUSB0), plus toggles for Barcode Scanner, Weighing Scale and Customer-Facing Display. Save Settings.',
  },
  {
    topic: 'Change your password (security)',
    keywords: ['change password', 'password', 'security settings', 'reset password', 'update password', 'account security'],
    text: 'Settings → Security (owner). Enter your Current Password, then a New Password and confirm it (8–50 characters with upper & lower case, a number and a special character), and Change Password.',
  },

  // ── OFFLINE, VOICE & THE ASSISTANT ────────────────────────────────────────
  {
    topic: 'Offline mode (desktop app)',
    keywords: ['offline', 'no internet', 'internet down', 'works offline', 'sync', 'offline mode', 'hybrid', 'connection lost', 'offline billing'],
    text: 'The desktop app works offline: log in online once so it caches your menu, tables, recent orders and settings, then it keeps taking orders, printing KOTs, billing and collecting payments with no internet. When the connection returns it automatically syncs everything to the cloud and refreshes the screens.',
  },
  {
    topic: 'Using Voice POS to take an order',
    keywords: ['voice order', 'voice pos', 'talk to order', 'speak order', 'voice command', 'hands free order', 'microphone order'],
    text: 'Open Voice POS and tap the mic, then speak the order naturally (e.g. “two butter chicken and a garlic naan”). It transcribes and parses the items into the cart; if Confirm Before Adding is on you review before it’s added. On the desktop app it records audio and transcribes it in the cloud, so it needs internet and a working microphone.',
  },
  {
    topic: 'What the assistant can do',
    keywords: ['assistant', 'what can you do', 'help', 'ask you', 'capabilities', 'what do you know', 'how to use assistant'],
    text: "Ask about your live business data — today's sales, top sellers, low stock, money/tax this month, top customers, tomorrow's forecast, active orders, open purchase orders, payroll, fraud alerts, staff hours — or how to do things in the app (any of the topics here). I can also export EOD/P&L/Sales reports as PDF or Excel. I'm read-only, so I report and explain but never change anything.",
  },
];

const STOP = new Set(['the', 'a', 'an', 'to', 'do', 'i', 'how', 'what', 'is', 'my', 'me', 'of', 'in', 'on', 'for', 'and', 'or', 'can', 'you', 'we', 'it', 'this', 'that', 'with', 'get', 'am', 'set', 'up', 'add', 'new']);

function terms(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Rank KB entries against a question and return the best matches as grounding.
 * Scores multi-word keyword phrase hits highest, then per-term overlap.
 * @param {string} question
 * @param {number} [n=4]
 * @returns {{topic:string,text:string,score:number}[]}
 */
function searchKnowledge(question, n = 4) {
  const q = String(question || '').toLowerCase();
  const qTerms = new Set(terms(q));
  const scored = KB.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += kw.trim().split(/\s+/).length * 2; // phrase hit weighs most
    }
    for (const t of terms(`${entry.topic} ${entry.keywords.join(' ')}`)) {
      if (qTerms.has(t)) score += 1;
    }
    return { topic: entry.topic, text: entry.text, score };
  });
  return scored.filter((e) => e.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
}

module.exports = { KB, searchKnowledge };
