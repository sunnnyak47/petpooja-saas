/**
 * @fileoverview Voice POS routes — speech-to-cart parsing.
 * @module modules/voice-pos/voice-pos.routes
 */

const express = require('express');
const router = express.Router();
const { parseTranscript, getSupportedLanguages } = require('./voice-pos.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess } = require('../../utils/response');

/**
 * POST /api/voice-pos/parse
 * Body: { transcript: string, outlet_id?: string }
 * Returns matched cart items + unmatched segments.
 */
router.post('/parse', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { transcript } = req.body;

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }

    const result = await parseTranscript(outletId, transcript.trim());
    sendSuccess(res, result, 'Transcript parsed');
  } catch (e) { next(e); }
});

/**
 * GET /api/voice-pos/languages
 * Returns supported speech recognition languages.
 */
router.get('/languages', authenticate, (req, res) => {
  sendSuccess(res, getSupportedLanguages(), 'Supported languages');
});

module.exports = router;
