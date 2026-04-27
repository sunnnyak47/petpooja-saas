/**
 * @fileoverview Hyperlocal Festival Mode routes.
 * @module modules/festival/festival.routes
 */

const express = require('express');
const router  = express.Router();
const svc     = require('./festival.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess, sendCreated } = require('../../utils/response');

/** GET /api/festival/detect — upcoming festivals for outlet's region */
router.get('/detect', authenticate, async (req, res, next) => {
  try {
    const outletId  = req.query.outlet_id || req.user.outlet_id;
    const daysAhead = parseInt(req.query.days_ahead) || 45;
    sendSuccess(res, await svc.detectFestivals(outletId, daysAhead), 'Festivals detected');
  } catch (e) { next(e); }
});

/** GET /api/festival/master — full master calendar */
router.get('/master', authenticate, async (req, res, next) => {
  try {
    const { country, year } = req.query;
    sendSuccess(res, await svc.getMasterCalendar(country, year ? +year : undefined), 'Master calendar');
  } catch (e) { next(e); }
});

/** GET /api/festival/active — currently active mode for POS */
router.get('/active', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.getActiveFestivalMode(outletId), 'Active festival mode');
  } catch (e) { next(e); }
});

/** GET /api/festival/configs — list all saved configs */
router.get('/configs', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.listConfigs(outletId), 'Festival configs retrieved');
  } catch (e) { next(e); }
});

/** POST /api/festival/configs — save/update a festival config */
router.post('/configs', authenticate, async (req, res, next) => {
  try {
    const outletId    = req.body.outlet_id || req.user.outlet_id;
    const { festival_key, ...data } = req.body;
    if (!festival_key) throw new Error('festival_key is required');
    sendCreated(res, await svc.saveFestivalConfig(outletId, festival_key, data), 'Festival config saved');
  } catch (e) { next(e); }
});

/** POST /api/festival/configs/:id/toggle — activate/deactivate */
router.post('/configs/:id/toggle', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.toggleFestivalMode(outletId, req.params.id), 'Festival mode toggled');
  } catch (e) { next(e); }
});

/** DELETE /api/festival/configs/:id — remove config */
router.delete('/configs/:id', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.deleteConfig(outletId, req.params.id), 'Festival config deleted');
  } catch (e) { next(e); }
});

/** GET /api/festival/menu-suggestions/:key — match festival items to real menu */
router.get('/menu-suggestions/:key', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.getMenuSuggestions(outletId, req.params.key), 'Menu suggestions ready');
  } catch (e) { next(e); }
});

module.exports = router;
