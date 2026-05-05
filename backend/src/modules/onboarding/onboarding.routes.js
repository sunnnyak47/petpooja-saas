/**
 * @fileoverview Onboarding wizard routes — guides new restaurant owners through setup.
 */
const express = require('express');
const router = express.Router();
const onboardingService = require('./onboarding.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess } = require('../../utils/response');

// All routes require auth
router.use(authenticate);

/** GET /api/onboarding/status */
router.get('/status', async (req, res, next) => {
  try {
    const headOfficeId = req.user.head_office_id || req.user.head_office?.id;
    const outletId = req.user.outlet_id || req.user.outlets?.[0]?.id;
    const status = await onboardingService.getWizardStatus(headOfficeId, outletId);
    sendSuccess(res, status, 'Wizard status retrieved');
  } catch (error) { next(error); }
});

/** POST /api/onboarding/step/:step */
router.post('/step/:step', async (req, res, next) => {
  try {
    const headOfficeId = req.user.head_office_id || req.user.head_office?.id;
    const outletId = req.user.outlet_id || req.user.outlets?.[0]?.id;
    const step = parseInt(req.params.step);
    const result = await onboardingService.saveWizardStep(headOfficeId, outletId, step, req.body.data || req.body);
    sendSuccess(res, result, `Step ${step} saved`);
  } catch (error) { next(error); }
});

/** POST /api/onboarding/parse-menu */
router.post('/parse-menu', async (req, res, next) => {
  try {
    const { menu_text, currency = 'INR' } = req.body;
    if (!menu_text) return res.status(400).json({ success: false, message: 'menu_text required' });
    const items = await onboardingService.parseMenuWithAI(menu_text, currency);
    sendSuccess(res, { items }, 'Menu parsed successfully');
  } catch (error) { next(error); }
});

/** POST /api/onboarding/complete */
router.post('/complete', async (req, res, next) => {
  try {
    const headOfficeId = req.user.head_office_id || req.user.head_office?.id;
    const outletId = req.user.outlet_id || req.user.outlets?.[0]?.id;
    const result = await onboardingService.completeWizard(headOfficeId, outletId);
    sendSuccess(res, result, 'Onboarding complete! Welcome to PetPooja.');
  } catch (error) { next(error); }
});

/** POST /api/onboarding/reset */
router.post('/reset', async (req, res, next) => {
  try {
    const headOfficeId = req.user.head_office_id || req.user.head_office?.id;
    const outletId = req.user.outlet_id || req.user.outlets?.[0]?.id;
    const result = await onboardingService.resetWizard(headOfficeId, outletId);
    sendSuccess(res, result, 'Wizard reset');
  } catch (error) { next(error); }
});

module.exports = router;
