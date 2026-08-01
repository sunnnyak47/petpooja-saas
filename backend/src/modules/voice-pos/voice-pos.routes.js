/**
 * Voice POS routes — conversational LLM-powered order parsing
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { conversationalParse, getSupportedLanguages, getUpsellSuggestions, placeVoiceOrder } = require('./voice-pos.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { converseSchema, upsellSchema, placeVoiceOrderSchema } = require('./voice-pos.validation');
const { sendSuccess, sendCreated } = require('../../utils/response');

// In-memory audio upload for speech-to-text (kept small — voice clips are short).
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/voice-pos/transcribe  (multipart: audio)
 * Speech-to-text so the DESKTOP app (Electron has no Web Speech API) can capture
 * spoken orders. Uses Groq Whisper; the resulting text is fed to /converse just
 * like the browser SpeechRecognition transcript. Returns { text }.
 */
router.post('/transcribe', authenticate, audioUpload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer || !req.file.buffer.length) {
      return res.status(400).json({ success: false, message: 'Audio file required' });
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ success: false, message: 'Speech-to-text is not configured on the server.' });
    }
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), req.file.originalname || 'audio.webm');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'json');
    if (req.body.language) form.append('language', String(req.body.language).slice(0, 2));

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ success: false, message: 'Transcription failed', detail: detail.slice(0, 200) });
    }
    const data = await r.json();
    return sendSuccess(res, { text: (data && data.text) || '' }, 'Transcribed');
  } catch (e) { next(e); }
});

/**
 * POST /api/voice-pos/converse
 * Multi-turn conversational order parsing via Groq LLM
 * Body: { transcript, conversation_history, current_cart, outlet_id? }
 */
router.post('/converse', authenticate, validate(converseSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { transcript, conversation_history = [], current_cart = [], language = 'en-IN' } = req.body;

    if (!transcript?.trim()) {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }
    if (!outletId) {
      return res.status(400).json({ success: false, message: 'Outlet ID required' });
    }

    const result = await conversationalParse(outletId, transcript.trim(), conversation_history, current_cart, language);
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
router.post('/upsell', authenticate, validate(upsellSchema), async (req, res, next) => {
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
router.post('/place-order', authenticate, hasPermission('CREATE_ORDER'), validate(placeVoiceOrderSchema), async (req, res, next) => {
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
