/**
 * @fileoverview "Ask your books" — an AI copilot that answers a restaurant
 * owner's plain-language money questions.
 *
 * Safety-first design: the LLM NEVER sees or invents raw ledger rows. We first
 * compute a small, trusted snapshot of the books (profit, tax, receivables,
 * payables, expenses) from the existing double-entry reports, then ask the LLM
 * to phrase an answer strictly from that snapshot. If no LLM provider is
 * configured (or it errors), a deterministic rule-based answer covers the core
 * questions, so the feature always works.
 *
 * Read-only: the copilot cannot post journals or change anything.
 * @module modules/accounting/accounting.copilot.service
 */

const https = require('https');
const owner = require('./accounting.owner.service');
const aging = require('./accounting.aging.service');
const logger = require('../../config/logger');

/* ── Currency + date helpers ─────────────────────────────────── */

function money(ctx, n) {
  const cur = (ctx && ctx.currency) || 'AUD';
  const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
  } catch (_) {
    return `${cur} ${Math.round(Number(n) || 0)}`;
  }
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (_) { return String(d); }
}

/* ── Trusted books snapshot (the only numbers the LLM may use) ── */

async function buildBooksContext(outletId) {
  const [dash, recv] = await Promise.all([
    owner.getOwnerDashboard(outletId),
    aging.getReceivablesAging(outletId).catch(() => null),
  ]);

  const topDebtors = (recv?.items || [])
    .slice()
    .sort((a, b) => b.days - a.days)
    .slice(0, 5)
    .map((i) => ({ customer: i.customer || 'Walk-in', amount: i.amount, days_overdue: i.days, ref: i.ref }));

  return {
    currency: dash.currency,
    region: dash.region,
    business: dash.outlet_name,
    period: dash.period,
    this_month: {
      profit: dash.profit.this_month,
      sales_revenue: dash.profit.revenue,
      gross_profit: dash.profit.gross_profit,
    },
    last_month: { profit: dash.profit.prev_month },
    profit_change_pct_vs_last_month: dash.profit.delta_pct,
    tax: dash.tax ? {
      type: dash.region === 'IN' ? 'GST' : 'BAS',
      amount_to_pay: dash.tax.amount,
      is_payable: dash.tax.payable,
      period: dash.tax.quarter_label,
      due_date: dash.tax.due_date,
    } : null,
    who_owes_me: {
      total: dash.receivables.total,
      unpaid_count: dash.receivables.count,
      overdue_amount: dash.receivables.overdue,
      top_debtors: topDebtors,
    },
    what_i_owe: { total: dash.payables.total, bill_count: dash.payables.count },
    expenses_this_month: dash.expenses.top.map((e) => ({ category: e.name, amount: e.amount })),
    has_data: dash.has_data,
  };
}

/* ── LLM providers (reuse whichever key prod has) ────────────── */

const SYSTEM_PROMPT = [
  'You are "Ask your books", a friendly assistant that helps a restaurant owner understand their finances.',
  'You are given the owner\'s QUESTION and a DATA object holding the real, current figures from their accounting system.',
  'Rules you must follow:',
  '- Answer ONLY using numbers present in DATA. NEVER invent, estimate, or extrapolate figures that are not in DATA.',
  '- Always show money using the currency in DATA.currency.',
  '- Be concise and plain-spoken: 1-3 short sentences, no accounting jargon, no markdown, no tables.',
  '- If DATA does not contain what is needed, say you cannot answer that one yet and name 2-3 things you CAN answer (profit, tax, unpaid invoices, expenses).',
  '- Only use DATA.tax fields for tax/dates. Never give tax or legal advice.',
  '- You are read-only and cannot make changes; if asked to do something, say they can do it from the dashboard.',
  'Respond as strict JSON: {"answer": "<your answer>"}',
].join('\n');

function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.2,
    max_tokens: 700,
    response_format: { type: 'json_object' },
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(JSON.parse(parsed.choices?.[0]?.message?.content));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Groq request timed out')));
    req.write(body);
    req.end();
  });
}

async function callGemini(system, user) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: system,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  const res = await model.generateContent(user);
  return JSON.parse(res.response.text());
}

async function callLLM(system, user) {
  if (process.env.GROQ_API_KEY) {
    return callGroq([{ role: 'system', content: system }, { role: 'user', content: user }]);
  }
  if (process.env.GEMINI_API_KEY) {
    return callGemini(system, user);
  }
  throw new Error('No LLM provider configured');
}

/* ── Deterministic fallback (always works, covers core questions) ── */

function ruleBasedAnswer(question, ctx) {
  const q = String(question || '').toLowerCase();
  if (!ctx.has_data) {
    return "Your books aren't set up yet — open the Overview tab and set up your accounts, then build from history. After that I can answer questions about your money.";
  }
  if (/\b(tax|gst|bas|vat)\b/.test(q) && ctx.tax) {
    return `You have ${money(ctx, ctx.tax.amount_to_pay)} of ${ctx.tax.type} ${ctx.tax.is_payable ? 'to pay' : 'as a refund'} for ${ctx.tax.period}, ${ctx.tax.is_payable ? 'due' : 'expected'} ${fmtDate(ctx.tax.due_date)}.`;
  }
  if (/(owes? me|who owes|unpaid|outstanding|receivable|hasn'?t paid|collect)/.test(q)) {
    const r = ctx.who_owes_me;
    if (!r.total) return 'Nobody owes you right now — all invoices are paid.';
    let s = `${r.unpaid_count} unpaid invoice${r.unpaid_count === 1 ? '' : 's'} totalling ${money(ctx, r.total)}`;
    if (r.overdue_amount) s += `, of which ${money(ctx, r.overdue_amount)} is overdue`;
    const top = r.top_debtors[0];
    if (top) s += `. The oldest is ${top.customer} at ${money(ctx, top.amount)}, ${top.days_overdue} days old`;
    return `${s}.`;
  }
  if (/(i owe|do i owe|owe to|payable|supplier|bills? to pay|pay suppliers)/.test(q)) {
    const p = ctx.what_i_owe;
    if (!p.total) return 'You have no supplier bills to pay right now.';
    return `You owe ${money(ctx, p.total)} across ${p.bill_count} supplier bill${p.bill_count === 1 ? '' : 's'}.`;
  }
  if (/(expense|spend|spending|cost|where.*money|biggest)/.test(q)) {
    const e = ctx.expenses_this_month;
    if (!e.length) return 'No expenses have been recorded yet this month.';
    const top3 = e.slice(0, 3).map((x) => `${x.category} ${money(ctx, x.amount)}`).join(', ');
    return `Your biggest costs this month: ${top3}.`;
  }
  if (/(revenue|sales|turnover|takings|took in)/.test(q)) {
    return `Your sales so far this month are ${money(ctx, ctx.this_month.sales_revenue)}.`;
  }
  if (/(profit|doing|earn|made|make|net|income|bottom line)/.test(q)) {
    let s = `Your profit this month is ${money(ctx, ctx.this_month.profit)}`;
    if (ctx.profit_change_pct_vs_last_month != null) {
      s += `, ${ctx.profit_change_pct_vs_last_month >= 0 ? 'up' : 'down'} ${Math.abs(ctx.profit_change_pct_vs_last_month)}% vs last month`;
    }
    return `${s}.`;
  }
  return `I can tell you about your profit, sales, ${ctx.tax?.type || 'GST/BAS'} tax, unpaid invoices, and biggest expenses. Try asking one of those.`;
}

const SUGGESTIONS = [
  'How much tax do I owe?',
  'What were my biggest expenses this month?',
  "Who hasn't paid me?",
  'How am I doing vs last month?',
];

/**
 * Answer an owner's finance question, grounded in their real books.
 * @param {string} outletId
 * @param {string} question
 * @returns {Promise<{ answer: string, source: 'ai'|'rules', suggestions: string[] }>}
 */
async function askBooks(outletId, question) {
  const ctx = await buildBooksContext(outletId);

  let answer;
  let source = 'rules';
  try {
    const out = await callLLM(SYSTEM_PROMPT, `QUESTION: ${question}\n\nDATA:\n${JSON.stringify(ctx)}`);
    if (out && typeof out.answer === 'string' && out.answer.trim()) {
      answer = out.answer.trim();
      source = 'ai';
    } else {
      answer = ruleBasedAnswer(question, ctx);
    }
  } catch (err) {
    logger.warn('askBooks: LLM unavailable, using rule-based answer', { error: err.message });
    answer = ruleBasedAnswer(question, ctx);
  }

  return { answer, source, suggestions: SUGGESTIONS };
}

module.exports = { askBooks, buildBooksContext, ruleBasedAnswer, SUGGESTIONS };
