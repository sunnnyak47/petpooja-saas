/**
 * @fileoverview HTTP handlers for the read-only AI assistant.
 * @module modules/assistant/assistant.controller
 */

const assistant = require('./assistant.service');
const insights = require('./assistant.insights');
const xport = require('./assistant.export');
const { TOOLS, SUGGESTIONS } = require('./assistant.tools');
const { sendSuccess, sendError } = require('../../utils/response');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * POST /api/assistant/ask — answer a read-only question about the user's data.
 */
async function ask(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.body.outlet_id || req.user.outlet_id || null;
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (!question) return sendError(res, 400, 'Please type a question');
    if (question.length > 500) return sendError(res, 400, 'That question is too long (max 500 characters)');

    const userCtx = {
      id: req.user.id,
      role: req.user.role,
      outletId,
      permissions: Array.isArray(req.user.permissions) ? req.user.permissions : [],
    };
    // Optional conversation history for multi-turn follow-ups; the service
    // sanitizes + bounds it, so a malformed value can never break the request.
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const result = await assistant.ask(userCtx, question, history);
    sendSuccess(res, result, 'Answer generated');
  } catch (error) { next(error); }
}

/**
 * GET /api/assistant/capabilities — what THIS user's assistant can answer.
 */
async function capabilities(req, res, next) {
  try {
    const userCtx = { role: req.user.role, permissions: Array.isArray(req.user.permissions) ? req.user.permissions : [] };
    const allowed = assistant.allowedTools ? assistant.allowedTools(userCtx) : TOOLS;
    sendSuccess(res, {
      tools: allowed.map((t) => ({ name: t.name, description: t.description })),
      suggestions: SUGGESTIONS,
    }, 'Assistant capabilities');
  } catch (error) { next(error); }
}

/**
 * GET /api/assistant/report?t=<token> — stream a report file (CSV/PDF) the
 * assistant offered. The signed token IS the authorisation (so a plain browser
 * download works); it is outlet/module/range/format-scoped and expires in 20 min.
 */
async function downloadReport(req, res, next) {
  try {
    const token = req.query.t;
    if (!token) return sendError(res, 400, 'Missing download token');

    let payload;
    try {
      payload = xport.verifyExportToken(token);
    } catch (e) {
      return sendError(res, 401, 'This download link has expired — ask the assistant for the report again.');
    }

    let outletName;
    try {
      const o = await getDbClient().outlet.findUnique({ where: { id: payload.outletId }, select: { name: true } });
      outletName = o && o.name;
    } catch (_) { /* name is cosmetic */ }

    const generated = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const { filename, contentType, body } = await xport.generate(payload, outletName, generated);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(body);
  } catch (error) {
    logger.error('assistant report export failed', { error: error.message });
    return sendError(res, 500, 'Could not generate that report — please try a smaller date range.');
  }
}

/**
 * POST /api/assistant/act — confirm + execute a previewed write action.
 * Body: { token } (the signed action token returned by /ask). The service
 * re-verifies the token belongs to this user + outlet and re-checks permission.
 */
async function act(req, res, next) {
  try {
    const token = req.body && req.body.token;
    if (!token || typeof token !== 'string') return sendError(res, 400, 'Missing confirmation token');
    const userCtx = {
      id: req.user.id,
      role: req.user.role,
      outletId: req.query.outlet_id || req.body.outlet_id || req.user.outlet_id || null,
      permissions: Array.isArray(req.user.permissions) ? req.user.permissions : [],
    };
    const result = await assistant.confirmAction(userCtx, token);
    return sendSuccess(res, result, result.done ? 'Action completed' : 'Action not completed');
  } catch (error) { next(error); }
}

/**
 * GET /api/assistant/alerts — proactive alerts for the user's outlet.
 */
async function getAlerts(req, res, next) {
  try {
    const userCtx = {
      id: req.user.id,
      role: req.user.role,
      outletId: req.query.outlet_id || req.user.outlet_id || null,
      permissions: Array.isArray(req.user.permissions) ? req.user.permissions : [],
    };
    const list = await assistant.alerts(userCtx);
    return sendSuccess(res, { alerts: list, count: list.length }, 'Alerts');
  } catch (error) { next(error); }
}

/**
 * GET /api/assistant/insights — usage-learning report (asks, misses, tools) for
 * the outlet over the last N days. Owner/super_admin or VIEW_REPORTS only.
 */
async function getInsights(req, res, next) {
  try {
    const role = req.user.role;
    const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (!(role === 'super_admin' || role === 'owner' || perms.includes('VIEW_REPORTS'))) {
      return sendError(res, 403, 'You do not have access to assistant insights');
    }
    const outletId = req.query.outlet_id || req.user.outlet_id || null;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
    const report = await insights.mineUsage({ outletId }, { days });
    return sendSuccess(res, report, 'Assistant usage insights');
  } catch (error) { next(error); }
}

module.exports = { ask, capabilities, downloadReport, act, getAlerts, getInsights };
