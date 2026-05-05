/**
 * Voice POS routes — conversational LLM-powered order parsing
 */
const express = require('express');
const router = express.Router();
const { conversationalParse, getSupportedLanguages } = require('./voice-pos.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess } = require('../../utils/response');

/**
 * POST /api/voice-pos/converse
 * Multi-turn conversational order parsing via Groq LLM
 * Body: { transcript, conversation_history, current_cart, outlet_id? }
 */
router.post('/converse', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { transcript, conversation_history = [], current_cart = [] } = req.body;

    if (!transcript?.trim()) {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }
    if (!outletId) {
      return res.status(400).json({ success: false, message: 'Outlet ID required' });
    }

    const result = await conversationalParse(outletId, transcript.trim(), conversation_history, current_cart);
    sendSuccess(res, result, 'Conversation turn processed');
  } catch (e) { next(e); }
});

/**
 * GET /api/voice-pos/languages
 */
router.get('/languages', authenticate, (req, res) => {
  sendSuccess(res, getSupportedLanguages(), 'Supported languages');
});

module.exports = router;
