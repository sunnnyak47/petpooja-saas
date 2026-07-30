/**
 * @fileoverview Curated help knowledge base for the assistant's `help_howto`
 * tool — a lightweight, embedding-free RAG source.
 *
 * Each entry is a small, self-contained "how do I…" answer about USING the app.
 * `searchKnowledge` ranks entries by keyword/term overlap with the question and
 * returns the best few as grounding DATA; the assistant's compose() step phrases
 * a friendly answer from ONLY those entries (so it never invents app behaviour).
 *
 * This is deliberately about product usage — not the customer's live data (that's
 * what the DB-backed tools are for) and not source code.
 * @module modules/assistant/assistant.knowledge
 */

/** @type {Array<{topic:string, keywords:string[], text:string}>} */
const KB = [
  {
    topic: 'Take a new order (POS)',
    keywords: ['take order', 'new order', 'place order', 'pos', 'add items', 'start order', 'punch order', 'create order', 'ring up'],
    text: 'Open POS, tap items to add them to the cart, pick the order type (dine-in / takeaway / delivery) and the table for dine-in, then tap Place Order. The order is sent to the kitchen (KOT) automatically.',
  },
  {
    topic: 'Collect payment / split a bill',
    keywords: ['collect payment', 'take payment', 'settle', 'pay bill', 'split bill', 'split payment', 'part payment', 'cash card', 'settle table', 'close bill', 'multi tender'],
    text: 'Open the order (or the table) and choose Collect Payment. Pick the method — cash, card/EFTPOS, UPI — enter the amount, and Confirm. For a split bill, add more than one payment line (e.g. part cash + part card); the balance updates until it reaches zero.',
  },
  {
    topic: 'Kitchen display (KOT / KDS)',
    keywords: ['kitchen', 'kot', 'kds', 'kitchen display', 'tickets', 'preparing', 'mark ready', 'bump', 'station'],
    text: 'The Kitchen (KOT/KDS) screen shows live order tickets by status — Pending, Preparing, Ready. Tap a ticket to advance it; marking items Ready/Served notifies the front counter and eventually frees the table.',
  },
  {
    topic: 'Tables — status, cleaning, reserve',
    keywords: ['table', 'tables', 'occupied', 'cleaning', 'reserve', 'reservation', 'free table', 'available', 'seat guests', 'covers', 'merge table', 'transfer table'],
    text: "The Tables screen shows each table's status (empty, occupied, bill-pending, cleaning, reserved). Tap a table to seat guests, start an order, collect payment, or mark it for cleaning. After cleaning, mark it available again so it can be re-seated.",
  },
  {
    topic: "86 / make a menu item unavailable",
    keywords: ['86', 'sold out', 'unavailable', 'out of item', 'disable item', 'hide item', 'mark unavailable', 'turn off item', 'stop selling'],
    text: "To 86 an item (mark it temporarily unavailable), open Menu, find the item, and toggle it off / mark unavailable. It stays on the menu but can't be ordered until you turn it back on.",
  },
  {
    topic: 'Add or edit a menu item',
    keywords: ['add menu', 'new item', 'edit item', 'menu item', 'change price', 'update price', 'add dish', 'category', 'create item', 'menu management'],
    text: 'Go to Menu → Add Item (or tap an existing item to edit). Set the name, category, price, veg/non-veg, and kitchen station, then Save. New items appear in POS immediately.',
  },
  {
    topic: 'Inventory & low stock',
    keywords: ['inventory', 'stock', 'low stock', 'reorder', 'stock level', 'ingredients', 'raw material', 'adjust stock', 'stock count'],
    text: 'Inventory tracks raw-material stock. Items below their reorder threshold show as low stock. Use a Purchase Order to restock, then Mark Received when the delivery arrives to add it back into stock.',
  },
  {
    topic: 'Purchase orders — create & receive',
    keywords: ['purchase order', 'po', 'supplier', 'receive stock', 'mark received', 'grn', 'order stock', 'delivery received'],
    text: 'Create a Purchase Order under Inventory → Purchase Orders, add the supplier and items, and Save. When the goods arrive, open the PO and tap Mark Received to record the delivery and increase stock.',
  },
  {
    topic: 'End of day (EOD) / day close',
    keywords: ['eod', 'end of day', 'day close', 'close day', 'cash up', 'z report', 'reconcile cash', 'drawer', 'closing'],
    text: 'At close, open End of Day. It shows the day’s sales, tax, discounts and cash expected in the drawer. Count the cash by denomination, enter it, note any discrepancy reason, and Lock the report to finalise the day.',
  },
  {
    topic: 'Discounts & promotions',
    keywords: ['discount', 'promo', 'offer', 'coupon', 'percentage off', 'apply discount', 'happy hour'],
    text: 'Create discount rules under Discounts (percentage or fixed amount, item- or bill-level). At POS you can apply an eligible discount to an order before payment.',
  },
  {
    topic: 'Offline mode (desktop app)',
    keywords: ['offline', 'no internet', 'internet down', 'works offline', 'sync', 'offline mode', 'hybrid', 'connection lost'],
    text: 'The desktop app works offline: log in online once so it caches your menu, tables and settings, then it keeps taking orders, printing KOTs and collecting payments with no internet. When the connection returns it automatically syncs everything to the cloud.',
  },
  {
    topic: 'Staff attendance / clock in–out',
    keywords: ['attendance', 'clock in', 'clock out', 'shift', 'roster', 'staff hours', 'punch in', 'timesheet', 'who is working'],
    text: 'Staff clock in and out from the Staff/Attendance screen (some setups use an OTP to confirm). The shift report totals each person’s days present and hours worked for the period, which feeds payroll.',
  },
  {
    topic: 'Payroll pay run',
    keywords: ['payroll', 'pay run', 'wages', 'salary', 'payslip', 'super', 'paye', 'payg', 'pay staff'],
    text: 'Under Payroll, create a Pay Run for a period — it totals gross wages, PAYG tax and superannuation and produces payslips. Finalise the run to lock it and post it to the books.',
  },
  {
    topic: 'Devices & security / log out other devices',
    keywords: ['device', 'security', 'session', 'logout', 'log out others', 'signed in', 'login history', 'revoke device', 'account security'],
    text: 'Devices & Security lists the devices signed into your account with their last activity and login history. You can revoke a single session or log out all other devices if something looks wrong.',
  },
  {
    topic: 'What the assistant can do',
    keywords: ['assistant', 'what can you do', 'help', 'ask you', 'capabilities', 'what do you know'],
    text: "Ask about your live business data — today's sales, top sellers, low stock, money/tax this month, top customers, tomorrow's forecast, open purchase orders, active orders, payroll, fraud alerts and staff hours — or how to do things in the app. I’m read-only, so I report and explain but never change anything.",
  },
];

const STOP = new Set(['the', 'a', 'an', 'to', 'do', 'i', 'how', 'what', 'is', 'my', 'me', 'of', 'in', 'on', 'for', 'and', 'or', 'can', 'you', 'we', 'it', 'this', 'that', 'with', 'get', 'am']);

function terms(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Rank KB entries against a question and return the best matches as grounding.
 * Scores multi-word keyword hits highest, then per-term overlap.
 * @param {string} question
 * @param {number} [n=3]
 * @returns {{topic:string,text:string,score:number}[]}
 */
function searchKnowledge(question, n = 3) {
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
