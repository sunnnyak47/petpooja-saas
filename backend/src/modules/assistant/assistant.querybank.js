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
