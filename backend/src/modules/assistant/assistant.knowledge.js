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
    keywords: ['take order', 'new order', 'place order', 'pos', 'add items', 'start order', 'punch order', 'create order', 'ring up', 'make an order', 'key in', 'key that in', 'enter the order', 'enter items', 'punch in', 'walk-in', 'walk in', 'guests ordered', 'food selection', 'sat down', 'wants to order', 'front counter'],
    text: 'Open POS Terminal, tap items to add them to the cart (choose a variant/size and add-ons if the item has them), pick the order type (dine-in / takeaway / delivery) and — for dine-in — the table, then tap Place Order or Send to Kitchen. The KOT prints automatically.',
  },
  {
    topic: 'Collect payment / split a bill',
    keywords: ['collect payment', 'take payment', 'settle', 'pay bill', 'split bill', 'split the bill', 'split a bill', 'part payment', 'cash card', 'settle table', 'close bill', 'multi tender', 'how to pay', 'two cards', 'different cards', 'half in cash', 'the remainder', 'settle the bill', 'one check', 'pay the bill', 'take the payment', 'rest by card', 'rest on card'],
    text: 'Open the order or table and choose Collect Payment. Pick the method (cash, card/EFTPOS, or UPI), enter the amount and Confirm. For a split bill add more than one payment line (e.g. part cash + part card) — the balance updates until it reaches zero. Cash payments pop the drawer.',
  },
  {
    topic: 'Hold / park an order',
    keywords: ['hold order', 'park order', 'save order', 'held order', 'hold', 'park', 'come back later', 'set aside', 'put it aside', 'stash', 'save the order', 'save for later', 'keep the cart', 'without sending', 'without firing', 'pick it up again', 'come back later', 'stepped out', 'finish later'],
    text: 'In POS, build the cart and choose Hold instead of Place Order. Held orders are parked without going to the kitchen and do not need a table; reopen one later to add items, send to kitchen, or settle.',
  },
  {
    topic: 'Void or cancel an item / order',
    keywords: ['void', 'cancel order', 'cancel item', 'remove item', 'delete order', 'void item', 'manager pin', 'refund order', 'cancel a cooking', 'take it off', 'off the ticket', 'off the check', 'off the order', 'remove an item', 'rung in by mistake', 'wrong dish', 'by mistake', 'scrap the', 'changed their mind', 'keyed in the wrong', 'get it off'],
    text: 'To remove one item, use Void Item on the order; to cancel the whole order use Cancel/Void. Voiding usually needs a Manager PIN (set on the staff member). An order can be cancelled at any stage before it is paid — a bill is not required first. Once paid, use a refund/credit note instead.',
  },
  {
    topic: 'Apply a discount to an order',
    keywords: ['apply discount', 'add discount', 'discount order', 'give discount', 'comp order', 'complimentary', 'reduce price', 'markdown', 'knock some money off', 'money off', 'knock off', 'free of charge', 'reduce the bill', 'lower the total', 'percent off', '% off', 'take off the total', 'completely free', 'on the house', 'complained'],
    text: 'On the open order in POS, choose Apply Discount and pick a percentage or flat amount (and a reason). To make an order free, use Comp. Discounts you set up in Discounts & Promotions can also auto-apply. Tax is recalculated on the discounted amount.',
  },
  {
    topic: 'Transfer, merge or split an order between tables',
    keywords: ['transfer table', 'move order', 'change table', 'merge order', 'merge tables', 'split order', 'combine bills', 'move to another table', 'moved tables', 'switched tables', 'join the tables', 'combine bills', 'single check', 'separate check', 'own check', 'put their orders together', 'update their order', 'mid-meal'],
    text: 'From the open order use Transfer to move it to a new table (frees the old one), Merge to combine two tables’ orders into one bill, or Split to move selected items into a new separate order/bill. Totals recompute automatically.',
  },
  {
    topic: 'Kitchen display (KOT / KDS)',
    keywords: ['kitchen', 'kot', 'kds', 'kitchen display', 'tickets', 'preparing', 'mark ready', 'bump', 'station', 'kitchen order ticket', 'cooks', 'chef', 'back of house', 'back-of-house', 'bump', 'dish is done', 'food is done', 'sitting too long', 'kitchen screen', 'incoming food orders', 'screen at the back', 'columns'],
    text: 'The Kitchen Display shows live order tickets by status — New/Pending, Preparing, Ready. Tap a ticket to advance it; marking items Ready/Served notifies the counter. Configure auto-accept, sound alerts and the late-order alert threshold in Settings → KDS Display.',
  },
  {
    topic: 'Tables — status, cleaning, seating',
    keywords: ['table', 'tables', 'occupied', 'cleaning', 'free table', 'available', 'seat guests', 'covers', 'add table', 'edit table', 'table number', 'floor plan', 'delete table', 'floor layout', 'dining room', 'seat a party', 'walk-in party', 'empty spot', 'add a table', 'new table', 'capacities', 'areas', 'get them started'],
    text: 'The Tables screen shows each table’s status (empty, occupied, bill-pending, cleaning, reserved). Tap a table to seat guests, start an order, collect payment or mark it for cleaning. Add/edit tables in Table management: set Table Number, Capacity, Shape and Area; use Bulk Add to create many at once (prefix + range). After cleaning, mark it available to re-seat.',
  },
  {
    topic: 'Reservations',
    keywords: ['reservation', 'reservations', 'booking', 'book a table', 'reserve', 'party size', 'reservation offline', 'book a table', 'booking', 'phoned ahead', 'phone ahead', 'lock in', 'party of', 'secure a table', 'future visit', 'record that', 'for friday', 'for saturday', 'suggest one', 'without picking a table'],
    text: 'Open Reservations → New Reservation and enter the customer name/phone, party size, date, time and (optionally) a table — if you leave the table blank the system suggests a best-fit one. On the desktop app the list also works offline from the local cache, and new bookings queue and sync when you reconnect.',
  },
  {
    topic: '86 / make a menu item unavailable',
    keywords: ['86', 'sold out', 'unavailable', 'out of item', 'disable item', 'hide item', 'mark unavailable', 'stop selling', '86 board', 'off sale', 'switch off', 'switch that dish off', 'turn it back on', 'stop selling', 'can\'t make', 'off for the evening', 'temporarily off', 'keep it listed'],
    text: 'To 86 an item, open Menu, find the item and turn off its Item Available toggle (or use the 86 Board). It stays on the menu but can’t be ordered until you switch it back on.',
  },
  {
    topic: 'Live / running orders',
    keywords: ['live orders', 'running orders', 'active orders', 'open orders', 'orders in progress', 'whats cooking', 'ongoing orders', 'unfinished orders', 'one screen', 'every order', 'hasn\'t been settled', 'watch every order', 'keep an eye on', 'in one place'],
    text: 'Live Orders shows every order still in play — dine-in, takeaway and delivery that isn’t finished/paid. From here you can add items, generate the bill, collect payment or cancel. On desktop this works offline and reflects cloud tickets after the first online login.',
  },
  {
    topic: 'Order history',
    keywords: ['order history', 'past orders', 'previous orders', 'find an order', 'order lookup', 'reprint bill', 'old orders', 'past order', 'look up a', 'ordered yesterday', 'last week wants', 'copy of their receipt', 'reprint', 'receipt copy', 'what a table ordered', 'find an old order', 'completed order', 'last month', 'pull up', 'bring up', 'old order', 'disputes', 'charged on', 'see its items', 'check it'],
    text: 'Order History lists past orders with filters for status and date. Open any order to view items, payments and reprint the bill. On the desktop app offline it shows orders cached to this device (plus what you created offline); the full cloud history returns once you’re back online.',
  },

  // ── MENU ──────────────────────────────────────────────────────────────────
  {
    topic: 'Add or edit a menu item',
    keywords: ['add menu item', 'new item', 'edit item', 'menu item', 'add dish', 'create item', 'menu management', 'item name', 'add food', 'new burger', 'launching', 'staff can sell', 'change the price', 'price of just one', 'new special', 'with a photo', 'put it in the system', 'edit a dish', 'add a dish', 'new dish', 'edit dish', 'dish photo', 'update an item'],
    text: 'Menu → Add Item. Fill Item Name, Short Code (optional), Description, Category, Dietary Type (veg/non-veg/egg) and tags/allergens. Under Pricing choose Single Price (amount + optional label like “Regular”) or Multiple Variants. Set the GST Category, upload an Image (JPG/PNG, max 5MB), toggle Item Available, link Add-on Groups, and optionally add an Availability Schedule, then Save. New items appear in POS immediately.',
  },
  {
    topic: 'Add or rename a menu category',
    keywords: ['add category', 'new category', 'rename category', 'menu category', 'category order', 'delete category', 'display order', 'section', 'desserts section', 'heading', 'appears first', 'group my dishes', 'new heading', 'rename', 'entrees', 'starters heading', 'should say', 'create one'],
    text: 'In Menu, use + New Category in the category sidebar and enter a Category Name and Display Order (min 1). Hover a category to Edit (rename) or Delete (owner/manager only).',
  },
  {
    topic: 'Menu item variants and sizes',
    keywords: ['variant', 'variants', 'size', 'sizes', 'small large', 'half full', 'multiple prices', 'price options', 'portions', 'serve', 'jumbo', 'different rates', 'cost differently', 'three different', 'multiple sizes', 'regular and large', 'each cost', 'small medium large'],
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
    keywords: ['add inventory', 'add material', 'new stock item', 'raw material', 'ingredient', 'add ingredient', 'stock item', 'unit cost', 'new material', 'into the system so it can be tracked', 'register a new supply', 'new supply', 'storeroom', 'price we pay', 'per kilo', 'ai fill', 'started buying', 'on the shelf', 'add ingredient', 'stock list'],
    text: 'Inventory → Add Material. Enter Item Name (AI Fill can autofill the rest), Category, Unit (kg/gm/ltr/ml/pcs/pkt/box/dozen), Cost per Unit, Min Stock, Max Stock and Reorder Qty, and toggle Auto-order when low, then Save.',
  },
  {
    topic: 'Inventory & low stock',
    keywords: ['inventory', 'stock', 'low stock', 'running low', 'reorder', 'stock level', 'auto order', 'out of stock', 'short on'],
    text: 'Inventory tracks raw-material stock; items below their Min Stock threshold show as low. Use Auto-Order to raise POs for everything low at once, or turn on Auto-order when low per item to create a PO automatically at the minimum.',
  },
  {
    topic: 'Receive a delivery (stock in)',
    keywords: ['received delivery', 'receive stock', 'stock in', 'goods received', 'add stock', 'delivery arrived', 'dropped off', 'drop-off', 'what came in', 'log what came', 'update quantities', 'supplier drop', 'truck', 'this morning', 'no paperwork', 'bump up each'],
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
    keywords: ['recipe', 'recipes', 'bom', 'bill of materials', 'ingredient deduction', 'auto deduct stock', 'automatically take', 'out of the counts', 'quantities go down', 'raw materials it uses', 'bill of materials', 'bom', 'uses one', 'deduct ingredients', 'ingredient mapping', 'level drop', 'goes down with every sale', 'link a dish'],
    text: 'Recipes link a menu item to the raw materials it uses, so selling the dish automatically deducts those ingredients from inventory. View them in Inventory → Recipes.',
  },
  {
    topic: 'Create and receive a purchase order (PO)',
    keywords: ['purchase order', 'create po', 'new po', 'raise po', 'order stock', 'mark received', 'receive po', 'po pdf', 'send po whatsapp', 'approve po', 'mark a po', 'formal document', 'vendor', 'line items', 'hsn', 'draft supply order', 'close it out', 'message to the vendor', 'quantities and rates', 'ordering supplies'],
    text: 'Inventory → Purchase Orders → New PO. Pick the Supplier, set Order/Delivery dates, Reference and Terms, then add line items (item, HSN/Code, unit, qty, rate, GST%) — presets fill defaults and totals compute live. Save, then Approve the draft, Download PDF or send via WhatsApp. When the goods arrive, open the PO and Mark Received to add the stock.',
  },

  // ── CUSTOMERS & LOYALTY ───────────────────────────────────────────────────
  {
    topic: 'Add a customer',
    keywords: ['add customer', 'new customer', 'create customer', 'customer details', 'crm', 'customer profile', 'save customer', 'customers list', 'into the database', 'customer database', 'phone number and date of birth', 'remember their', 'diet preference next time', 'entering their name', 'first enter their information'],
    text: 'Customers → Add Customer. Enter Full Name, Phone (required), Email, Gender, Date of Birth, Anniversary, Segment (New/Regular/VIP), Diet Preference, marketing consent and notes. Customers are auto-enrolled in loyalty. DOB/anniversary drive birthday reminders and campaigns.',
  },
  {
    topic: 'Loyalty & rewards (and how to set the program up)',
    keywords: ['loyalty', 'rewards', 'points', 'redeem points', 'loyalty program', 'earn points', 'vip', 'earn rate', 'points per spend', 'redemption rate', 'point expiry', 'bonus points', 'setup loyalty', 'loyalty settings', 'crm'],
    text: 'Customers earn points automatically on paid orders and you can redeem them against a bill at checkout. To configure the program open Loyalty & Rewards (CRM) → Settings: turn the program on/off and set Earning Rules (points per spend, spend amount, VIP threshold, VIP multiplier), Redemption Rules (value per point, minimum points to redeem, max redemption % per order, point expiry months) and Bonus Points (signup, birthday, referral), then Save Changes. The other tabs are Overview (KPIs, segments, top spenders, upcoming birthdays), Customers (add/edit, Adjust Points, Loyalty History), Loyalty (rules + leaderboard) and Campaigns.',
  },
  {
    topic: '86 Board (pause items across channels)',
    keywords: ['86 board', 'auto-86', 'pause item', 'sold out channels', 're-sync availability', 'stop selling online', 'availability board', 'pull it off', 'every channel', 'at the same time', 'from one screen', 'delivery apps when', 'availability screen', 'stock column', 'takes dishes off', 'ingredients run dry'],
    text: 'The 86 Board pauses menu items across every delivery channel at once. Search the item and flip its Available toggle to 86 it (or turn it back on); the Status pill shows Available / Low / 86’d and the Stock column names the limiting ingredient. Turn on Auto-86 to pause items automatically when stock hits zero, and use Re-sync now to push current availability out to the channels.',
  },
  {
    topic: 'Live Dashboard (real-time operations)',
    keywords: ['live dashboard', 'real time', 'orders today', 'active tables', 'order pipeline', 'kitchen status', 'live view', 'whats happening now'],
    text: 'The Live Dashboard is a real-time view of today that auto-refreshes every 30 seconds (with a manual Refresh and a “last updated” time). It shows Orders Today, Revenue Today, Active Tables and Avg Order Value, the Order Pipeline (Pending → Confirmed → Preparing → Ready → Delivered/Cancelled) and Kitchen Status (In Queue, Preparing, Ready, Completed) plus avg prep time and staff on duty. It always reflects the current day — there are no filters.',
  },
  {
    topic: 'Menu Analytics (best and worst sellers)',
    keywords: ['menu analytics', 'abc analysis', 'slow movers', 'top sellers report', 'item performance', 'which items sell', 'worst selling', 'menu performance'],
    text: 'Menu Analytics ranks every item over the last 30 days into three tiers — A (Top Sellers), B (Moderate), C (Slow Movers). Pick an outlet top-right if you have several (the window is fixed at 30 days). Read the KPI strip (Total Revenue, Units Sold, Active SKUs, Avg Revenue/Item) and the Revenue Distribution bar, then open a tier tab to see per-item units, average price, revenue and % share — useful for deciding what to promote or drop.',
  },
  {
    topic: 'Channel Analytics (compare sales channels)',
    keywords: ['channel analytics', 'channel comparison', 'commission', 'net revenue by channel', 'aggregator performance', 'dine-in vs delivery', 'cancel rate', 'side-by-side', 'side by side', 'each ordering platform', 'versus walk-in', 'against walk-in', 'average ticket', 'where the order came from', 'more money once fees', 'highest average ticket', 'filtered by where'],
    text: 'Channel Analytics compares sales across delivery aggregators (Uber Eats, DoorDash, Deliveroo, Menulog, Swiggy, Zomato) plus dine-in, QR and direct orders. Set the window with the From/To dates (defaults to the last 30 days) and read Total Orders, Gross Sales, Commission and Net Revenue, then the per-channel table (orders, gross, AOV, cancel %, avg prep, commission, net), the gross-share bars and Top Items (filterable by channel).',
  },
  {
    topic: 'Prep Time Analytics (kitchen speed)',
    keywords: ['prep time', 'prep analytics', 'cook time', 'kitchen speed', 'sla', 'slowest item', 'station performance', 'kds analytics', 'how fast kitchen'],
    text: 'Prep Time Analytics reports average cook time per item and station from KDS data. Choose a range (1d / 7d / 30d / 90d) and read Avg Prep, Fastest/Slowest KOT and SLA Compliance by Station, then use the tabs: Overview (slowest/fastest items + daily trend), Stations, Items (filter by Kitchen/Bar/Dessert/Packing), Heatmap (hour × day) and Trend. Most tabs have a CSV export.',
  },
  {
    topic: 'Financial Analytics with Xero',
    keywords: ['xero', 'xero analytics', 'financial analytics', 'sync xero', 'export to xero', 'connect xero', 'accounting sync', 'push sales to xero'],
    text: 'Financial Analytics surfaces your Xero accounting data. If it isn’t connected, click Connect Xero (OAuth); then use Sync Now to pull data, or Export to Xero to push POS sales (set From/To dates and toggle Itemised by category, Channel tracking, Reconcile payments, Per-order invoices, then Export Now). Pick a range (Last Month/Quarter/Year/All Time) and a tab: Overview, P&L, Expenses, Labour, Cash Flow, Balance Sheet, Invoices, BAS/Tax and more.',
  },
  {
    topic: 'Australian integrations (Xero, Square, MYOB, Google Reviews)',
    keywords: ['au integrations', 'connect square', 'connect myob', 'google reviews', 'pronto', 'oauth connect', 'disconnect integration', 'australian tools', 'myob api key', 'unlink square', 'aussie', 'link up square', 'business tools'],
    text: 'AU Integrations connects Australian business tools. Xero and Square connect by OAuth (Connect with…), while MYOB, Google Reviews and Pronto use a Connect form for API keys/IDs. Each connected card shows live stats and actions — Xero (Import, Sync Sales, View Analytics), MYOB (Export CSV for Sales/Expenses/Payroll over a date range), Pronto (Sync Now) — and Google Reviews lists reviews with sentiment and a Reply action. Any tool can be disconnected from its card.',
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
    keywords: ['certification', 'rsa', 'wwcc', 'food safety', 'first aid', 'cert expiry', 'add certification', 'license expiry', 'accreditation', 'about to lapse', 'security licence', 'security license', 'training credentials', 'renewal dates', 'licences that are running out', 'proof of', 'audited', 'bartender'],
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
    keywords: ['eod', 'end of day', 'day close', 'close the day', 'cash up', 'z report', 'reconcile cash', 'closing', 'cash count', 'opening float', 'tonight', 'lock up', 'before closing', 'closing time', 'cashup'],
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
    keywords: ['accounting', 'chart of accounts', 'ledger', 'trial balance', 'balance sheet', 'journal', 'double entry', 'add account', 'period lock', 'seed chart', 'manual journal', 'debit and credit', 'lock the period', 'stop anyone editing', 'bookkeeping', 'built-in accounting', 'financial accounts', 'starting fresh', 'the books'],
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
    keywords: ['qr orders', 'table qr orders', 'approve qr order', 'customer scanned order', 'accept qr', 'self order approval', 'ordered from their phone', 'phone at the table', 'from their seats', 'from their own phone', 'accept & kot', 'accept and kot', 'need my confirmation', 'turn down an order', 'diners place', 'submitted from'],
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
    keywords: ['device', 'devices', 'security', 'session', 'logout', 'log out others', 'signed in devices', 'login history', 'revoke device', 'someone else is using', 'kick them off', 'old phone', 'still has access', 'remove it', 'computers', 'currently connected', 'last accessed', 'from where', 'using my account', 'signed in devices'],
    text: 'Devices & Security lists the devices signed into your account with their last activity and login history. Revoke a single session, or Log out all other devices if something looks wrong.',
  },
  {
    topic: 'Subscription & billing',
    keywords: ['subscription', 'billing', 'plan', 'upgrade', 'pay invoice', 'usage', 'trial', 'change plan', 'pay my invoice', 'software bill', 'my plan', 'upgrade plan', 'paid tier', 'free period', 'trial ending', 'hit my limit', 'allowed to add', 'features are included', 'paying for each month', 'the service itself', 'settle what i owe'],
    text: 'Subscription shows your plan (Trial/Starter/Pro/Enterprise), usage vs limits (outlets, staff), included features and monthly usage. Invoices can be paid via the Pay button; upgrading is arranged with support.',
  },
  {
    topic: 'Raise a support ticket',
    keywords: ['support', 'help', 'raise ticket', 'contact support', 'report a problem', 'new ticket', 'get help', 'something is broken', 'who do i tell', 'reach the', 'petpooja team', 'about an issue', 'fix something', 'urgent', 'report a problem', 'not working', 'contact support'],
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
    keywords: ['general settings', 'restaurant name', 'currency', 'language', 'timezone', 'require table selection', 'auto-free table', 'outlet settings', 'renamed', 'venue', 'update the name', 'across the system', 'restaurant name', 'change name'],
    text: 'Settings → General. Set the Restaurant Name, Currency (INR/AUD/USD/AED/ZAR), Language and Timezone. Toggle “Require table selection for dine-in”, and enable predictive Auto-Free Table with a reminder grace countdown (15s–2min). Save Settings.',
  },
  {
    topic: 'Tax & GST settings',
    keywords: ['tax settings', 'gst settings', 'gstin', 'fssai', 'abn', 'acn', 'gst slab', 'service charge', 'gst inclusive', 'tax config', 'automatic extra percentage', 'every bill for service', 'food safety licence', 'australian business number', 'business number', 'extra percentage'],
    text: 'Settings → Tax & GST. India: enter GSTIN and FSSAI. Australia: enter ABN and ACN. Set the Default GST Slab (AU: 0% or 10%; India: 0/5/12/18%), a Service Charge %, and toggle GST Inclusive Pricing (prices already include GST). Save Settings.',
  },
  {
    topic: 'Voice POS settings',
    keywords: ['voice settings', 'voice pos', 'voice language', 'speech settings', 'confirm before adding', 'continuous mode', 'silence timeout', 'speech rate', 'test microphone', 'reads responses', 'too fast', 'slow it down', 'reading responses', 'out loud', 'the mic', 'picking up sound', 'dictation', 'cuts off', 'pause between', 'talking assistant', 'test microphone', 'stop the app reading'],
    text: 'Settings → Voice POS. Choose the Recognition & Speech Language, and toggle Confirm Before Adding, Continuous Multi-Item Mode, Speak Responses Aloud, Toast Notifications, Save History and Wake On Open. Tune the Silence Timeout, Max Session Length and Speech Rate sliders, and use Test Microphone / Test Speech Output. (On the desktop app, voice records audio and transcribes it in the cloud.)',
  },
  {
    topic: 'Kitchen display (KDS) settings',
    keywords: ['kds settings', 'kitchen display settings', 'auto-accept orders', 'sound alerts', 'alert threshold', 'kitchen settings', 'beep', 'kitchen screen beep', 'straight into preparing', 'without the chef', 'accept every time', 'making any noise', 'new tickets', 'switch that on', 'sound for orders'],
    text: 'Settings → KDS Display. Toggle Auto-accept Orders and Sound Alerts, and set the Alert Threshold (minutes) after which a ticket is flagged as late. Save Settings.',
  },
  {
    topic: 'Payment method settings',
    keywords: ['payment settings', 'payment methods', 'enable cash', 'enable card', 'eftpos', 'upi', 'razorpay', 'payment options', 'upi vpa', 'stopped taking', 'paper money', 'remove that option', 'from the till', 'gpay', 'phonepe', 'pay us directly', 'upi id', 'accept cash', 'disable cash'],
    text: 'Settings → Payment. Toggle the methods you accept — Cash, Card/POS Machine, and EFTPOS (AU) or UPI (India). For UPI, add the UPI VPA and Merchant Display Name. To take online payments, enable Razorpay (India) with your Key ID, or connect Square (AU) via Integrations. Save Settings.',
  },
  {
    topic: 'Notification settings',
    keywords: ['notification settings', 'sms', 'email', 'whatsapp notifications', 'low stock alerts', 'order notifications', 'alerts', 'text message', 'confirming their order', 'automatically get', 'sms confirmation', 'send a text'],
    text: 'Settings → Notifications. Toggle SMS, Email and WhatsApp for order confirmations/receipts, and Low Stock Alerts to be notified when inventory falls below threshold. Save Settings.',
  },
  {
    topic: 'Appearance / branding (theme, logo, colour)',
    keywords: ['appearance', 'theme', 'dark mode', 'brand colour', 'logo', 'compact layout', 'branding', 'change colors', 'too bright', 'at night', 'make it darker', 'dark mode', 'colours and emblem', 'app look', 'restaurant colours', 'darker'],
    text: 'Settings → Appearance. Owners can set a Brand Colour (hex) and upload a Logo, then Save branding. Pick a Theme and toggle Compact Layout to fit more on screen.',
  },
  {
    topic: 'Hardware settings (cash drawer, scanner, scale)',
    keywords: ['hardware settings', 'cash drawer', 'barcode scanner', 'weighing scale', 'customer display', 'serial port', 'peripherals', 'money till', 'pop open automatically', 'till pop', 'when we take a payment', 'drawer open', 'open the drawer'],
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
    topic: 'Central kitchen requisitions (indents)',
    keywords: ['central kitchen', 'requisition', 'indent', 'stock transfer', 'branch request', 'dispatch stock', 'transfer between outlets', 'confirm receipt'],
    text: 'Central Kitchen handles raw-material requisitions between a branch and the central kitchen. Use the tabs My Branch Requests / Incoming to My Outlet and filter by status. Click New Requisition, choose the source outlet (Request From), search-and-add inventory items with quantity/unit and Notes. The central kitchen then Approves (with an editable Approve Qty) or Rejects with a reason, and Dispatches (Dispatch Qty); the requesting branch finishes with Confirm Receipt.',
  },
  {
    topic: 'Dynamic pricing rules',
    keywords: ['dynamic pricing', 'pricing rules', 'surge pricing', 'time based pricing', 'weather pricing', 'auto price', 'price rule', 'happy hour pricing'],
    text: 'Dynamic Pricing auto-adjusts menu prices by time, day, weather and season (tabs: Rules, Live Prices, Analytics). Click New Rule (or Load Defaults) and set Rule Name, Priority, Trigger Type (Time Slot / Day of Week / Weather / Combo), times and days, Weather and Season, Apply To (all items, slow movers, bestsellers, a category, specific items or a tag), then the Pricing Action (Discount / Surcharge / Fixed Price) with a value in % or flat, plus optional Max Discount Cap, Min Order Value and validity dates. Rules can be Paused, Edited or Deleted; Live Prices shows what is firing now and can simulate weather.',
  },
  {
    topic: 'Festival / Holiday Mode',
    keywords: ['festival mode', 'holiday mode', 'seasonal menu', 'festival offer', 'christmas', 'diwali', 'seasonal promotion', 'themed menu'],
    text: 'Festival Mode (called Holiday Mode in Australia, where it appears as a tab inside Discounts) detects upcoming festivals and lets you switch on themed menus, banners and offers. Browse Upcoming / Full Calendar / My Configs, then Preview or Configure a festival: set the Festival Name, Start/End dates, a Custom Banner Message and an Offer (label, discount %, minimum order value), and switch Activate Now on.',
  },
  {
    topic: 'Fraud detection & staff risk',
    keywords: ['fraud', 'fraud detection', 'staff fraud', 'void abuse', 'discount abuse', 'suspicious', 'risk score', 'theft', 'run scan', 'resolve alert'],
    text: 'Fraud Detection runs behavioural analysis on staff actions (tabs: Alerts, Staff Risk, Analytics) and Run Scan Now triggers a fresh check. Filter alerts by severity (Critical/High/Medium/Low), type (Excessive Cancellations, KOT Without Bill, Discount Abuse, Void Abuse, Quick Cancel, Late Night Anomaly, Refund Pattern) or unread only; each alert can be opened for Details, Resolved with a note, or Dismissed. Analytics shows the alert-type breakdown, a 7-day trend and the active rule thresholds.',
  },
  {
    topic: 'Connect delivery aggregators & push your menu',
    keywords: ['aggregators', 'connect swiggy', 'connect zomato', 'connect doordash', 'connect uber eats', 'menulog', 'push menu', 'webhook url', 'store id', 'sync menu to platform', 'manage platforms', 'push my menu', 'republish', 'show up on the delivery apps', 'get my dishes', 'store id and api key', 'updated my prices'],
    text: 'The Aggregators hub connects delivery platforms (India: Swiggy/Zomato; Australia: Uber Eats/DoorDash/Menulog) with tabs Connect, Menu Sync, Orders and Sync Logs. On Connect, toggle a platform on, enter its Store/Restaurant ID and API key, then copy the generated Webhook URL into the partner dashboard. Use Push Menu Now (or Push Menu to All) to publish your menu and Simulate Test Order to verify. Incoming orders appear in the Orders kanban to Accept (with prep time), Reject or Mark Ready.',
  },
  {
    topic: 'Delivery payouts & commission reconciliation',
    keywords: ['delivery payout', 'aggregator reconciliation', 'commission', 'net payout', 'platform commission', 'what am i owed', 'payout report', 'their cut', 'lands in my bank', 'transfer looks short', 'shortchanged', 'should be paying me', 'fee they kept', 'gross sales versus', 'after their cut', 'took this month', 'weekly transfers'],
    text: 'Delivery Payouts shows, per platform, gross sales, commission taken and the expected net payout for a date range. Filter by From/To date and Platform, then read Orders, Gross, Commission % and amount, and Net payout. Use Create settlement on a row to turn that payout into a settlement you can reconcile against recorded payments in Settlements.',
  },
  {
    topic: 'ONDC seller hub (India)',
    keywords: ['ondc', 'open network', 'ondc onboarding', 'go live ondc', 'seller hub', 'ondc orders'],
    text: 'The ONDC Seller Hub onboards your outlet onto the ONDC network (tabs: Onboarding, Orders, Analytics). The wizard has six steps — Store Info (name, description, category, cuisines), Documents (FSSAI + expiry, GSTIN, PAN), Bank Details (holder, bank, account, IFSC), Delivery (radius, min order, prep time, delivery/pickup/auto-accept), Hours, then Review & Go Live (accept the terms and Submit for ONDC Review). Status moves draft → under review → verified → live; incoming ONDC orders are accepted with a prep time and progressed Preparing → Ready → Picked Up.',
  },
  {
    topic: 'Audit trail & activity log',
    keywords: ['audit log', 'audit trail', 'activity log', 'who did what', 'security log', 'track changes', 'login history log', 'ip address', 'who voided', 'who cancelled', 'who deleted', 'who changed', 'who refunded', 'trace action'],
    text: 'The Audit Trail is a read-only log of every action, login and sensitive operation. Filter with the search box, a date range (Today/Week/Month/All) and an action type (Logins, Creates, Updates, Deletes, Voids, Refunds, Payments). Stat cards summarise Total Events, Logins, Voids/Refunds and Config Changes, and the table shows Timestamp, User, Action, Entity, Details and IP Address.',
  },
  {
    topic: 'Payment transactions & issuing a refund',
    keywords: ['payments page', 'transactions', 'refund', 'issue refund', 'refund a payment', 'payment history', 'export payments', 'transaction list', 'charged twice', 'give the money back', 'reverse the charge', 'reverse last', 'card charge', 'look up a settled order', 'by invoice number', 'csv of each', 'which method it was paid', 'individual charge'],
    text: 'The Payments page tracks all paid-order activity with stat cards (Total Revenue, Transactions, Cash, Card, UPI/EFTPOS). Filter by search (order #, invoice, customer), date range and method, and use Export CSV for the current view. To refund, use the Refund action on the transaction and supply a reason (at least 3 characters) plus a 4-digit Manager PIN.',
  },
  {
    topic: 'Set up a new restaurant (onboarding wizard)',
    keywords: ['onboarding', 'setup restaurant', 'first time setup', 'new restaurant', 'go live', 'setup wizard', 'getting started', 'initial setup'],
    text: 'The Onboarding wizard sets up a whole restaurant in 7 steps: Business Profile (name, country, cuisines, business type, GSTIN+FSSAI or ABN+ACN), Outlet & Tables (address, service modes, table count, QR), Menu Setup (paste a menu for AI parsing), Team Setup (name, phone, role, 4-digit PIN), POS Config (default order type, payment modes, receipt footer, Voice language), Integrations, then Go Live. Use Back/Skip/Next, or “Skip setup & go to dashboard” for the express path.',
  },
  {
    topic: 'Set up a POS terminal / desktop device',
    keywords: ['terminal setup', 'setup wizard', 'connect terminal', 'new device', 'desktop setup', 'first run', 'device setup', 'link terminal', 'welcome screen', 'fresh install', 'brand-new counter', 'counter machine', 'till software', 'new till', 'fresh till', 'prefilled', 'asking for a manager login'],
    text: 'When the desktop app runs for the first time it shows a 3-step terminal setup: Welcome → Get Started, Manager Login (email + password → Connect Terminal), then Thermal Printer (enter the Printer IP Address, default 192.168.1.100 → Finish Setup, or Skip). This links one physical terminal to your existing account — it is separate from the restaurant Onboarding wizard. The cash drawer is driven via the printer.',
  },
  {
    topic: 'What the assistant can do',
    keywords: ['assistant', 'what can you do', 'help', 'ask you', 'capabilities', 'what do you know', 'how to use assistant', 'read-only', 'read only', 'can you change things', 'can you export', 'chat helper', 'rundown', 'answer about my business', 'what data can you', 'report on'],
    text: "Ask about your live business data — today's sales, top sellers, low stock, money/tax this month, top customers, tomorrow's forecast, active orders, open purchase orders, payroll, fraud alerts, staff hours — or how to do things in the app (any of the topics here). I can also export EOD/P&L/Sales reports as PDF or Excel. I'm read-only, so I report and explain but never change anything.",
  },

  // ── Troubleshooting (failure modes) ─────────────────────────────────────────
  {
    topic: 'Troubleshoot: printer not printing (receipts / bills)',
    keywords: ['printer not printing', 'printer not working', 'receipt not printing', 'bill not printing', 'nothing prints', 'printer offline', 'no printout', "printer won't print", 'printer wont print', 'printer stopped', 'not printing receipts', 'printer issue', 'printer problem', 'printer error', 'printer not responding', 'cant print the bill'],
    text: "If the receipt/bill printer isn't printing: 1) check it's powered on, has paper, and is on the SAME network/Wi-Fi as this device; 2) Settings → Receipt Printer — confirm Printer Type (Thermal ESC/POS), IP Address (e.g. 192.168.1.100) and Port (usually 9100), then Test Print; 3) on the desktop app a browser-print fallback appears if the printer is unreachable; 4) power-cycle the printer and re-open the bill. If it still fails, open the printer's IP in a browser to check it's reachable on the network.",
  },
  {
    topic: 'Troubleshoot: KOT not printing to the kitchen',
    keywords: ['kot not printing', 'kitchen ticket not printing', 'kot not coming', 'kitchen not getting orders', 'order not going to kitchen', 'kot printer not working', 'kitchen printer not working', 'kot not fired', 'kitchen not printing', 'no kot', 'ticket not printing in kitchen', 'kitchen order not printing'],
    text: "If KOTs aren't reaching the kitchen: 1) make sure you tapped Place Order / Send to Kitchen — a held/parked order does NOT fire a KOT; 2) Settings → KDS/Printer, check the kitchen printer or KDS station is assigned to the item's category; 3) verify the kitchen printer IP/port and that it's online (Test Print); 4) if you use the Kitchen Display (KDS) instead of a printer, open the KDS screen and confirm the ticket shows under New/Pending. Re-fire the KOT from the open order if needed.",
  },
  {
    topic: 'Troubleshoot: sync failed / changes not syncing',
    keywords: ['sync failed', 'not syncing', 'sync error', "won't sync", 'wont sync', 'changes not syncing', 'sync stuck', 'data not syncing', 'sync problem', 'sync issue', 'failed to sync', 'orders not syncing', 'sync not working', 'pending sync'],
    text: "If sync failed or data isn't syncing: 1) check your internet connection — the app works offline and syncs when back online; 2) pull to refresh / re-open the app so the write-outbox retries (it uses automatic backoff); 3) confirm you're still logged in (re-login if the session expired); 4) on desktop/offline, check the sync status indicator and use Retry. Orders/invoices created offline are renumbered by the server after sync — that's expected, not a duplicate.",
  },
  {
    topic: "Troubleshoot: order stuck / won't close or move",
    keywords: ['order stuck', "order won't close", 'order wont close', 'cant close order', 'order not closing', 'order frozen', "order won't move", 'stuck order', 'order not updating', 'cant complete order', 'order hung', 'ticket stuck', 'table wont free'],
    text: "If an order is stuck or won't close: 1) make sure it's fully paid — an unpaid balance blocks closing (open it → Collect Payment → balance must reach zero); 2) if items are still 'preparing' on the KDS, mark them Ready/Served; 3) for a dine-in table, settle the bill then mark the table for cleaning to free it; 4) if it's genuinely frozen, refresh/re-open the app — offline changes are saved and will sync. A void/cancel needs a Manager PIN and only works before payment.",
  },
  {
    topic: 'Troubleshoot: payment declined or card / EFTPOS not working',
    keywords: ['payment declined', 'card declined', 'payment failed', 'card not working', 'eftpos not working', 'payment not going through', 'transaction declined', 'card machine not working', 'terminal not working', 'upi failed', 'payment error', 'declined transaction', 'card reader not working'],
    text: "If a payment is declined or the card/EFTPOS terminal isn't working: 1) retry the card or ask for another card/tender; 2) check the payment terminal is powered, paired and connected (Bluetooth/network); 3) in Australia confirm the EFTPOS integration in Settings → Payments; in India, if a UPI/QR payment fails, re-generate the QR or record another tender; 4) you can record the payment manually (cash/other) and reconcile later. A declined attempt does NOT close the bill — the balance stays open until paid.",
  },
  {
    topic: "Troubleshoot: can't log in / PIN not working",
    keywords: ["can't log in", 'cant log in', 'cant login', 'login not working', 'password not working', 'pin not working', 'forgot password', 'forgot pin', 'locked out', 'cannot sign in', 'login failed', 'wrong pin', 'staff pin not working', 'unable to login'],
    text: "If you can't log in: 1) check your email/password and use Forgot Password to reset (a reset link is emailed); 2) staff sign in with their PIN on the POS — an owner/manager can reset a staff member's PIN in Staff management; 3) confirm the account is active and has a role assigned; 4) if you were logged out unexpectedly, the session may have expired or been ended from Devices & Security (Logout-all) — just log in again. Repeated wrong PINs can briefly lock the terminal.",
  },
  {
    topic: 'Troubleshoot: offline mode not syncing when back online',
    keywords: ['offline not syncing', 'offline mode not working', 'offline data not uploading', 'offline orders not syncing', 'no internet orders', 'offline stuck', 'offline changes not saved', 'sync after offline', 'reconnect not syncing', 'offline queue not clearing'],
    text: "The app is offline-first: orders, payments and changes are saved locally and upload automatically when the internet returns. If offline changes aren't syncing after you reconnect: 1) confirm you're actually back online; 2) keep the app open briefly so the write-outbox retries (automatic backoff); 3) don't log out while items are pending; 4) check the sync/pending indicator. Offline invoice/order numbers are device-namespaced and renumbered by the server on sync, so duplicates are handled automatically.",
  },
  {
    topic: 'Troubleshoot: app slow, frozen or keeps crashing',
    keywords: ['app slow', 'app frozen', 'app crashing', 'keeps crashing', 'app not responding', 'app hangs', 'slow app', 'app freezes', 'laggy', 'app stuck', 'app keeps closing', 'crash on open', 'performance issue', 'app is lagging'],
    text: "If the app is slow, frozen or crashing: 1) close and re-open it — your data is saved and will sync; 2) check the device has network and enough storage/memory; 3) update to the latest version (desktop auto-updates; mobile from the app store); 4) too many old open orders/tables can slow the POS — settle or clean up completed ones; 5) if a specific screen crashes repeatedly, note what you tapped and raise a support ticket so we can fix it.",
  },
  {
    topic: 'Troubleshoot: aggregator order not coming through (Uber Eats / DoorDash / Zomato / Swiggy)',
    keywords: ['aggregator order not coming', 'uber eats order not showing', 'doordash order missing', 'zomato order not received', 'swiggy order not coming', 'online order not showing', 'delivery app order missing', 'marketplace order not received', 'aggregator not working', 'online orders not appearing', 'menulog order not showing'],
    text: "If online/aggregator orders (Uber Eats, DoorDash, Menulog, Zomato, Swiggy) aren't appearing: 1) check the integration is connected in Settings → Integrations and the store is set to Online/Open (not paused); 2) make sure the item/store isn't 86'd and the menu is in sync — re-push the menu to the aggregator; 3) confirm auto-accept settings; 4) a network drop can delay orders — they arrive once reconnected. Check the aggregator's own dashboard to confirm the order was actually placed.",
  },
  {
    topic: 'Troubleshoot: cash drawer not opening',
    keywords: ['drawer not opening', 'cash drawer not opening', 'till not opening', "drawer won't open", 'drawer wont open', 'cash drawer stuck', 'drawer not popping', 'kick drawer not working', 'open drawer manually', 'cash drawer problem'],
    text: "The cash drawer opens via the receipt printer (it's driven by the printer's kick port). If it won't open: 1) confirm the drawer cable is plugged into the printer's RJ11/kick port; 2) check the printer works — print a test receipt, and the drawer should pop on a cash payment; 3) a cash sale or the Open Drawer action triggers it; 4) if the printer is offline the drawer won't fire, so fix the printer first. There's also a physical key to open it manually.",
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

/** True when a and b are within Levenshtein distance 1 (catches single typos). */
function within1(a, b) {
  if (a === b) return true;
  const la = a.length; const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  // one pass: find first mismatch, then compare tails per edit type
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i += 1;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1); // substitution
  const [s, l] = la < lb ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1); // insertion/deletion
}

// ── Precomputed index: per-entry term sets + inverse document frequency ──────
// Common terms ('order', 'customer', 'menu') appear in dozens of entries and
// are weak evidence; rare terms ('reservation', 'payroll') are strong. IDF
// weighting makes rare-term hits dominate, which is what fixes indirect
// phrasings that share only generic words with the wrong entry.
const INDEX = KB.map((entry) => {
  const kwTerms = terms(`${entry.topic} ${entry.keywords.join(' ')}`);
  const textTerms = terms(entry.text);
  return { entry, kwSet: new Set(kwTerms), textSet: new Set(textTerms) };
});
const DF = new Map();
for (const { kwSet, textSet } of INDEX) {
  for (const t of new Set([...kwSet, ...textSet])) DF.set(t, (DF.get(t) || 0) + 1);
}
const idf = (t) => Math.log(1 + KB.length / (DF.get(t) || 1));

/**
 * Rank KB entries against a question and return the best matches as grounding.
 * Scoring: exact keyword-phrase hits (×2 per word, IDF-scaled), IDF-weighted
 * term overlap against keywords (full weight) and entry text (0.4×), plus
 * fuzzy edit-distance-1 term matches at 0.7× (catches single-letter typos
 * like 'reservtion', 'discont', 'paymnt').
 * @param {string} question
 * @param {number} [n=4]
 * @returns {{topic:string,text:string,score:number}[]}
 */
function searchKnowledge(question, n = 4) {
  const q = String(question || '').toLowerCase();
  const qTerms = [...new Set(terms(q))];
  const scored = INDEX.map(({ entry, kwSet, textSet }) => {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) {
        const words = kw.trim().split(/\s+/);
        const w = words.reduce((s, t) => s + idf(t), 0) / words.length;
        score += words.length * w; // phrase hit: length × avg rarity
      }
    }
    for (const t of qTerms) {
      if (kwSet.has(t)) { score += idf(t); continue; }
      if (textSet.has(t)) { score += 0.4 * idf(t); continue; }
      if (t.length >= 5) {
        let fuzzy = 0;
        for (const et of kwSet) { if (t[0] === et[0] && within1(t, et)) { fuzzy = Math.max(fuzzy, 0.7 * idf(et)); } }
        score += fuzzy;
      }
    }
    return { topic: entry.topic, text: entry.text, score };
  });
  return scored.filter((e) => e.score > 0.5).sort((a, b) => b.score - a.score).slice(0, n);
}

module.exports = { KB, searchKnowledge };
