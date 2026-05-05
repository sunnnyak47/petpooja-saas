/**
 * Voice POS routes — conversational LLM-powered order parsing
 */
const express = require('express');
const router = express.Router();
const { conversationalParse, getSupportedLanguages, getUpsellSuggestions, placeVoiceOrder } = require('./voice-pos.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { sendSuccess, sendCreated } = require('../../utils/response');

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

/**
 * POST /api/voice-pos/upsell
 * Get Groq-powered upsell suggestions for the current cart
 * Body: { cart, outlet_id? }
 */
router.post('/upsell', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { cart = [] } = req.body;
    if (!outletId) return res.status(400).json({ success: false, message: 'Outlet ID required' });
    const suggestions = await getUpsellSuggestions(outletId, cart);
    sendSuccess(res, suggestions, 'Upsell suggestions');
  } catch (e) { next(e); }
});

/**
 * POST /api/voice-pos/place-order
 * Create a real order directly from Voice POS (bypasses Redux cart)
 * Body: { cart, outlet_id?, order_type, table_id?, customer_name? }
 */
router.post('/place-order', authenticate, hasPermission('CREATE_ORDER'), async (req, res, next) => {
  try {
    const outletId    = req.body.outlet_id || req.user.outlet_id;
    const { cart, order_type, table_id, customer_name } = req.body;

    if (!outletId) return res.status(400).json({ success: false, message: 'Outlet ID required' });
    if (!cart?.length) return res.status(400).json({ success: false, message: 'Cart is empty' });

    const result = await placeVoiceOrder({
      outletId,
      cart,
      orderType:    order_type   || 'dine_in',
      tableId:      table_id     || null,
      staffId:      req.user.id,
      customerName: customer_name || null,
    });

    sendCreated(res, result, `Order #${result.order?.order_number} placed via Voice POS`);
  } catch (e) { next(e); }
});

module.exports = router;
