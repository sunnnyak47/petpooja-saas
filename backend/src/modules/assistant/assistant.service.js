/**
 * @fileoverview Read-only AI assistant orchestrator (Phase 1).
 *
 * Flow: pick ONE read tool for the question → run it (scoped to the user's
 * outlet + permissions) → compose a grounded answer from the tool's data.
 * The LLM only chooses a tool and phrases the answer; it never touches the DB,
 * never invents numbers, and can only call tools the user is allowed to use.
 * A deterministic keyword router + per-tool summarizer make it work with no LLM.
 *
 * @module modules/assistant/assistant.service
 */

const { callLLM } = require('../../utils/llm');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { TOOLS, SUGGESTIONS } = require('./assistant.tools');

/** Attach the outlet's currency + name to the user context (for money formatting). */
async function resolveOutletContext(userCtx) {
  userCtx.currency = 'AUD';
  if (!userCtx.outletId) return userCtx;
  try {
    const o = await getDbClient().outlet.findUnique({ where: { id: userCtx.outletId }, select: { currency: true, name: true } });
    if (o) { userCtx.currency = o.currency || 'AUD'; userCtx.outletName = o.name; }
  } catch (err) {
    logger.warn('assistant: could not resolve outlet currency', { error: err.message });
  }
  return userCtx;
}

/**
 * Tools this user may use — mirrors rbac.middleware.hasPermission exactly:
 * super_admin and owner bypass; everyone else needs the permission key.
 */
function allowedTools(userCtx) {
  const role = userCtx.role;
  const perms = Array.isArray(userCtx.permissions) ? userCtx.permissions : [];
  return TOOLS.filter((t) => {
    if (!t.permission) return true;
    if (role === 'super_admin' || role === 'owner') return true;
    return perms.includes(t.permission);
  });
}

/** Deterministic keyword router used when the LLM is unavailable. */
function keywordSelect(question, toolList) {
  const q = String(question || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const t of toolList) {
    const score = (t.keywords || []).reduce((s, k) => s + (q.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = t.name; }
  }
  return bestScore > 0 ? best : null;
}

/** Choose a tool (LLM first, keyword fallback). Returns a tool name or null. */
async function selectTool(question, toolList) {
  const catalog = toolList.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const sys = [
    'You route a restaurant owner\'s question to exactly ONE tool from the list, or null.',
    'Use null for greetings, thanks, or "how do I use the app" questions.',
    'Pick only a tool name that appears in the list. Do not invent tools.',
    'Respond as strict JSON: {"tool": "<tool name or null>"}',
  ].join('\n');
  try {
    const out = await callLLM(sys, `TOOLS:\n${catalog}\n\nQUESTION: ${question}`);
    const t = out ? out.tool : undefined;
    if (t === null) return null;
    if (typeof t === 'string' && toolList.some((x) => x.name === t)) return t;
  } catch (err) {
    logger.warn('assistant: tool selection LLM failed, using keywords', { error: err.message });
  }
  return keywordSelect(question, toolList);
}

/** Compose the final answer grounded in the tool's data (LLM, else summarize). */
async function compose(question, tool, data) {
  const sys = [
    'You are a helpful restaurant back-office assistant.',
    'Answer ONLY using facts/numbers present in DATA. NEVER invent or estimate anything not in DATA.',
    'Be concise and plain-spoken: 1-3 short sentences, no jargon, no markdown. Include the currency where money is shown.',
    'If DATA does not contain the answer, say you do not have that detail.',
    'Respond as strict JSON: {"answer": "<your answer>"}',
  ].join('\n');
  try {
    const out = await callLLM(sys, `QUESTION: ${question}\n\nDATA:\n${JSON.stringify(data)}`);
    if (out && typeof out.answer === 'string' && out.answer.trim()) {
      return { answer: out.answer.trim(), source: 'ai' };
    }
  } catch (err) {
    logger.warn('assistant: compose LLM failed, using summarizer', { error: err.message });
  }
  return { answer: tool.summarize(data, question), source: 'rules' };
}

/** Friendly capabilities message (null-tool path / when nothing matches). */
function helpAnswer(toolList) {
  const caps = toolList.map((t) => `• ${t.description}`).join('\n');
  return `I can answer questions about your live data — read-only, I can't change anything. For example:\n${caps}\nTry asking one of those, or ask me "how am I doing this month?"`;
}

/**
 * Answer a question for the given user, scoped to their outlet + permissions.
 * @param {{ id: string, role: string, outletId: string|null, permissions: string[] }} userCtx
 * @param {string} question
 * @returns {Promise<{ answer: string, source: string, tool: string|null, suggestions: string[] }>}
 */
async function ask(userCtx, question) {
  const toolList = allowedTools(userCtx);
  const toolName = await selectTool(question, toolList);

  if (!toolName) {
    return { answer: helpAnswer(toolList), source: 'rules', tool: null, suggestions: SUGGESTIONS };
  }

  const tool = toolList.find((t) => t.name === toolName);
  await resolveOutletContext(userCtx);
  let data;
  try {
    data = await tool.run(userCtx);
  } catch (err) {
    logger.error('assistant: tool run failed', { tool: toolName, error: err.message });
    return { answer: "I couldn't fetch that just now — please try again in a moment.", source: 'error', tool: toolName, suggestions: SUGGESTIONS };
  }

  const { answer, source } = await compose(question, tool, data);
  return { answer, source, tool: toolName, suggestions: SUGGESTIONS };
}

module.exports = { ask, allowedTools, keywordSelect, helpAnswer };
