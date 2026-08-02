/**
 * @fileoverview Labeled question bank for the assistant coverage eval.
 *
 * This is how we "train on thousands of queries" WITHOUT fine-tuning a model:
 * hundreds of natural phrasings per tool, each labeled with the tool it should
 * route to, multiplied by neutral prefixes/suffixes to ~3,000 variants. The
 * coverage test (tests/assistant-coverage.test.js) runs every one through the
 * router and reports routing accuracy, so gaps become measurable and fixable.
 *
 * Neutral wrappers deliberately contain NO tool keywords, so they add realistic
 * phrasing noise without changing the correct label.
 * @module modules/assistant/assistant.querybank
 */

const CORES = {
  finance_summary: [
    'how much profit did we make', 'am i making money', 'are we profitable', "what's my profit this month",
    'did we make money', 'profit so far', 'my bottom line', 'net profit', 'how am i doing this month',
    'what are my earnings', 'how much money did we make this month', "what's my income this month",
    'how much tax do i owe', "what's my gst", 'how much bas do i owe', 'when is my tax due', 'do i owe any tax',
    'who owes me money', "who hasn't paid me", 'how much is unpaid', 'outstanding invoices total',
    'what are my receivables', 'what do i owe suppliers', 'how much do i owe', 'total payables',
    'what were my biggest expenses', 'where is my money going', 'how much did i spend this month',
    'my biggest costs', 'expense breakdown', 'how much are my expenses', 'am i spending too much',
    "what's my financial summary", 'give me my money summary', 'how are my finances',
  ],
  sales_today: [
    'how much did we sell today', "what are today's sales", "today's revenue", 'how much money did we take today',
    'how many orders today', "what's today's takings", 'how are we doing today', 'sales so far today',
    'how busy are we today', "today's numbers", 'what did we make today', 'how many orders have we had today',
    "today's average order value", 'revenue today', 'how much have we sold today', "how's business today",
    "today's total sales", 'orders so far today', 'did we sell much today', 'how much today',
    "what's our takings today", "today's order count", 'how much cash today', "today's sales figure",
    'sales for today', "today so far", 'what have we taken today', "today's earnings", "how's today going",
    'total orders today',
  ],
  sales_forecast: [
    "what's tomorrow looking like", "predict tomorrow's orders", 'how many orders tomorrow', 'forecast for tomorrow',
    'how busy will we be tomorrow', 'what should i expect tomorrow', "tomorrow's sales prediction",
    'expected orders tomorrow', 'projected revenue tomorrow', 'will tomorrow be busy', 'sales forecast',
    'forecast next week', "what's the outlook for tomorrow", "estimate tomorrow's revenue",
    'how many customers tomorrow', 'prediction for tomorrow vs last 30 days', 'average prediction for tomorrow',
    'are we trending up', 'is business trending down', "what's the trend", 'how does tomorrow compare to average',
    'anticipated orders tomorrow', "tomorrow's forecast", 'how many sales tomorrow', "predict next week's orders",
    'revenue projection for tomorrow', 'will we be busy tomorrow', 'forecast my orders', 'expected revenue tomorrow',
    'what to expect tomorrow',
  ],
  top_items: [
    'what are my top sellers', 'best selling items', "what's my most popular dish", 'top items this month',
    'which dishes sell the most', 'what sells best', 'my bestsellers', 'most sold items', "what's selling well",
    'top selling dishes', 'which items are popular', "what's my biggest seller", 'best performing menu items',
    'what do people order most', 'most ordered items', 'popular dishes this month', 'top 5 items',
    'what are customers buying most', 'best sellers this month', 'my top performing dishes',
    'highest selling items', 'which menu items sell most', 'top revenue items', 'most popular menu items',
    'which items are best sellers', 'what are my most popular items', 'top selling products', 'my best seller',
  ],
  low_stock: [
    "what's running low", "what's low on stock", 'what do i need to reorder', "what's out of stock",
    'low stock items', 'what am i running out of', 'inventory levels', 'what needs restocking', 'what stock is low',
    'do i need to order anything', 'what am i short on', 'which items are running low', 'stock alerts',
    "what's depleted", 'how much stock is left', 'reorder list', 'what inventory is low',
    'items below reorder level', 'running low on what', 'critical stock items', "what's nearly out",
    'check my stock levels', 'which ingredients are low', 'am i low on anything', 'what needs reordering',
    'low inventory', 'what stock do i need', 'anything running out',
  ],
  menu_overview: [
    'how many items on the menu', 'how many dishes do we have', 'how many non-veg items', 'how many veg items',
    'how many vegetarian dishes', 'how many egg items', 'menu size', 'total number of menu items',
    'how many categories', "what's the cheapest item", "what's the most expensive dish", 'menu price range',
    "what's on the menu", 'how big is my menu', 'how many items are unavailable', "what's 86'd right now",
    'which items are sold out', "what's off the menu", 'how many available items', 'veg vs non-veg count',
    'how many non-veg dishes in total', 'count of veg items', 'how many menu categories', "what's my menu breakdown",
    'how many total dishes', 'menu overview', 'how many items are veg', 'which items are marked out',
    'how many dishes are unavailable', 'give me a menu summary',
  ],
  top_customers: [
    'who are my top customers', 'best customers', 'who spends the most', 'my most valuable customers',
    'who are my regulars', 'top spending customers', 'which customers are loyal', 'my biggest spenders',
    'who are my vip customers', 'best patrons', 'my top spenders', 'which customers spend most',
    'most loyal customers', 'who are my best customers', 'high spending customers', 'top customers by spend',
    "who's my best customer", 'frequent customers', 'which regulars spend most', 'my valuable customers',
    'biggest customers by revenue', 'who are my loyal regulars', 'top patrons', 'which customers matter most',
    'my most loyal customers',
  ],
  open_purchase_orders: [
    'any open purchase orders', 'pending purchase orders', 'what purchase orders are open', 'open po list',
    'purchase orders not yet received', 'what have i ordered from suppliers', 'incoming stock',
    "what's awaiting delivery", 'outstanding purchase orders', 'how many open pos', 'supplier orders pending',
    'po status', 'which purchase orders are open', "what's on order from suppliers", 'pending supplier orders',
    'unreceived purchase orders', 'total value of open pos', 'open supplier orders', 'purchase orders in progress',
    'list open purchase orders', 'any pending purchase orders', 'what am i waiting to receive from suppliers',
    'open purchase order value', 'purchase orders awaiting delivery',
  ],
  active_orders: [
    'any active orders right now', 'what orders are open', 'show me running orders', 'live orders now',
    'current orders in play', 'any open tables with orders', 'orders in progress right now', "what's cooking",
    'any unpaid orders open', 'open bills right now', 'how many active orders', 'whats being prepared now',
    'any ongoing orders', 'running orders count', 'orders still open', 'what tickets are live',
    'any orders being prepared', 'open orders and their value', 'what orders are pending right now',
    'current open tickets', 'anything still in play', 'live order status', 'how many orders are running',
    'open order total right now', 'active tickets now',
  ],
  eod_summary: [
    'close the day', 'end of day summary', 'eod summary', 'day close totals', 'cash in drawer today',
    'how much cash vs card today', 'z report for today', 'closing report today', "today's day close",
    'ready to close the day', 'cash up for today', 'reconcile the day', 'what do i reconcile at closing',
    'eod totals', 'daily close summary', 'how many voids today at close', 'refunds for the day close',
    'day end summary', 'closing figures for today', 'end of day cash count', 'my eod numbers',
    'what should the drawer have today', 'day close breakdown', 'cash and card split for closing',
  ],
  payroll_summary: [
    'how much did i pay staff', 'latest pay run', 'payroll summary', 'wage bill this period',
    'how much super this run', 'payg withheld last pay run', 'net pay total for staff', 'staff wages total',
    'what did payroll cost', 'gross wages last run', 'how many payslips last run', 'superannuation total',
    'my payroll numbers', 'last pay run details', 'staff pay summary', 'how much in wages',
    'what did i pay in super', 'payroll cost this period', 'wages and super total', 'pay run status',
    'how big was the last pay run', 'total salary paid', 'staff payment summary', 'payroll breakdown',
  ],
  fraud_alerts: [
    'any fraud alerts', 'anything suspicious', 'suspicious activity lately', 'fraud alerts open',
    'any void abuse', 'discount abuse alerts', 'staff doing anything suspicious', 'loss prevention alerts',
    'any flagged transactions', 'suspicious voids or refunds', 'fraud check', 'any theft alerts',
    'suspicious staff behaviour', 'anything flagged for review', 'open fraud cases', 'suspicious refund patterns',
    'any anomalies flagged', 'fraud alerts summary', 'is anyone abusing discounts', 'unusual activity alerts',
    'what fraud alerts are open', 'any suspicious cancellations', 'staff fraud alerts', 'shrinkage alerts',
  ],
  staff_hours: [
    'who worked this week', 'staff hours this period', 'who clocked in', 'attendance summary',
    'hours worked by staff', 'who has the most hours', 'overtime hours this period', 'staff attendance report',
    'days present per staff', 'timesheet summary', 'who worked the most', 'labour hours this period',
    'clock in summary', 'staff working hours', 'how many hours did staff work', 'attendance this month',
    'who was present this week', 'staff overtime summary', 'hours per employee', 'who is putting in hours',
    'attendance record summary', 'total staff hours', 'who clocked the most time', 'shift hours summary',
  ],
  profit_loss: [
    'show me the p&l', 'profit and loss statement', 'p&l breakdown', 'whats my gross profit',
    'cost of goods sold this month', 'net profit breakdown', 'income statement', 'expenses vs revenue',
    'pnl this month', 'my p and l', 'gross profit this month', 'what is my cogs', 'profit breakdown',
    'give me the profit and loss', 'revenue minus expenses', 'p&l for the month', 'profit loss statement',
    'how much gross profit', 'cogs and gross profit', 'monthly p&l',
  ],
  sales_trend: [
    'how are sales this week', 'sales this week', 'how has this week been', 'last 7 days sales',
    'weekly sales', 'sales over the past week', 'how are sales going', 'are sales up or down',
    'week so far', 'sales this past week', 'how has the week gone', 'recent sales', 'sales lately',
    'past 7 days revenue', 'how are we doing this week', 'this week revenue', 'sales for the week',
    'is business going up or down', 'last seven days sales', 'weekly revenue this week',
  ],
  table_status: [
    'how many tables are free', 'are any tables free', 'table status', 'how many tables occupied',
    'free tables right now', 'how full are we', 'table availability', 'how many empty tables',
    'whats the floor status', 'any free tables', 'tables in use', 'how many tables available',
    'seating availability', 'occupied tables count', 'how many tables are open', 'free seats',
    'how many tables do we have free', 'current table status', 'are we full', 'tables free right now',
  ],
  staff_risk: [
    'who is my riskiest staff', 'staff risk profiles', 'which staff are high risk', 'riskiest employees',
    'staff fraud risk', 'who might be stealing', 'which staff is risky', 'highest risk staff member',
    'show me staff risk', 'who are my risky staff', 'staff risk ranking', 'problem staff members',
    'which employee is high risk', 'staff loss prevention risk', 'who to watch on my team',
    'riskiest team member', 'staff risk scores', 'which staff have alerts', 'risky employees list',
    'flag risky staff',
  ],
  tax_figures: [
    'gst collected vs paid', 'gst collected this month', 'how much gst collected on sales',
    'gst on sales this period', 'gst on purchases this month', 'net gst payable', 'net gst for the period',
    'my tax collected vs tax paid', 'input tax credit this month', 'net gst payable amount',
    'tax liability this quarter', 'bas figures for the quarter', 'how much gst to pay the ato',
    'gst refund or amount to pay', 'gst breakdown collected and paid', 'tax collected and tax paid',
    'gst on sales and purchases', 'net gst amount this month', 'net gst payable breakdown',
  ],
  cash_flow: [
    'cash flow this month', 'show me cash flow', 'cash in vs cash out', 'net cash movement',
    'am i cash flow positive', 'my cash position', 'net cash this month', 'cash inflow and outflow',
    'money in and out this month', 'cashflow summary', 'how is my cash flow', 'cash coming in and going out',
    'whats my cashflow', 'cash flow position this month',
  ],
  supplier_balances: [
    'how much do i owe each supplier', 'supplier balances', 'vendor balances', 'outstanding by supplier',
    'which supplier do i owe most', 'supplier wise payables', 'balance due to each vendor',
    'supplier payables breakdown', 'unpaid bills by supplier', 'how much due per vendor',
    'supplier dues breakdown', 'vendor dues breakdown', 'balance due per supplier', 'payables by supplier',
  ],
  budget_vs_actual: [
    'budget vs actual', 'am i over budget this month', 'how am i tracking against budget',
    'planned vs actual spend', 'budget variance report', 'are we over or under budget',
    'did we hit our budget', 'budgeted revenue vs actual', 'how far off budget are we',
    'expense budget comparison', 'budget performance this period', 'actuals against budget plan',
    'on budget or over', 'am i within budget',
  ],
  credit_notes: [
    'how many credit notes', 'outstanding credit notes', 'total credit notes value', 'credit notes issued this month',
    'any credit memos', 'show me credit notes', 'credit note total', 'customer credit notes',
    'value of credit notes issued', 'list credit notes', 'credit notes summary', 'credit memo total',
  ],
  help_howto: [
    'how do i take a new order', 'how to split a bill', 'where do i 86 an item', 'how do i add a menu item',
    'how to connect the thermal printer', 'how do i create a purchase order', 'how to run payroll',
    'how do i close the day step by step', 'how to set up loyalty points', 'where is the kds screen',
    'how do i apply a discount', 'how to reserve a table', 'how do i refund a payment', 'how to add a staff member',
    'how do i connect uber eats', 'how to generate qr codes', 'how do i change my password',
    'how to use offline mode', 'where do i configure the receipt printer', 'how do i transfer a table',
    'how to set up dynamic pricing', 'how do i log wastage', 'how to make a roster', 'where do i see the audit log',
    'how do i push my menu to aggregators', 'how to create a credit note', 'how do i set the gst rate',
    'how to enable auto-86', 'how do i run a marketing campaign', 'how to import a settlement',
  ],
};

const PREFIXES = [
  'can you tell me ', 'i want to know ', 'please tell me ', 'hey ',
  'just checking — ', 'could you show me ', "i'd like to know ",
];
const SUFFIXES = ['?', ' please', ' for me', ' right now', ' thanks'];

/** Expand the cores into ~3,000 labeled {q, tool} variants. */
function generateBank() {
  const bank = [];
  for (const [tool, cores] of Object.entries(CORES)) {
    for (const core of cores) {
      bank.push({ q: core, tool });
      for (const p of PREFIXES) bank.push({ q: p + core, tool });
      for (const s of SUFFIXES) bank.push({ q: core + s, tool });
    }
  }
  return bank;
}

module.exports = { generateBank, CORES, PREFIXES, SUFFIXES };
