/**
 * @fileoverview HTTP handlers for the read-only AI assistant.
 * @module modules/assistant/assistant.controller
 */

const assistant = require('./assistant.service');
const { TOOLS, SUGGESTIONS } = require('./assistant.tools');
const { sendSuccess, sendError } = require('../../utils/response');

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
    const result = await assistant.ask(userCtx, question);
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

module.exports = { ask, capabilities };
