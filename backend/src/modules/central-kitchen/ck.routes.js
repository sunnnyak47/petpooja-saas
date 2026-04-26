/**
 * Central Kitchen / Multi-Branch Stock routes
 * Endpoints:
 *   POST   /api/ck/indents               — Branch creates requisition
 *   GET    /api/ck/indents               — List indents (filter by outlet, status)
 *   GET    /api/ck/indents/:id           — Single indent detail
 *   PATCH  /api/ck/indents/:id/approve   — CK approves + sets approved_qty
 *   PATCH  /api/ck/indents/:id/dispatch  — CK dispatches (sets dispatched_qty, moves stock)
 *   PATCH  /api/ck/indents/:id/receive   — Branch confirms receipt
 *   PATCH  /api/ck/indents/:id/reject    — CK rejects indent
 *   GET    /api/ck/outlets               — List outlets for selector
 *   GET    /api/ck/inventory/:outlet_id  — Inventory items of an outlet (for requisition form)
 */

const express = require('express');
const router = express.Router();
const ckService = require('./ck.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess, sendCreated } = require('../../utils/response');

// All routes require auth
router.use(authenticate);

/** List indents — supports ?outlet_id=, ?status=, ?role=ck */
router.get('/indents', async (req, res, next) => {
  try {
    const indents = await ckService.listIndents(req.query, req.user);
    sendSuccess(res, indents, 'Indents retrieved');
  } catch (e) { next(e); }
});

/** Get single indent with items */
router.get('/indents/:id', async (req, res, next) => {
  try {
    const indent = await ckService.getIndent(req.params.id);
    sendSuccess(res, indent, 'Indent retrieved');
  } catch (e) { next(e); }
});

/** Branch creates requisition */
router.post('/indents', async (req, res, next) => {
  try {
    const indent = await ckService.createIndent(req.body, req.user);
    sendCreated(res, indent, 'Requisition created');
  } catch (e) { next(e); }
});

/** CK approves indent */
router.patch('/indents/:id/approve', async (req, res, next) => {
  try {
    const indent = await ckService.approveIndent(req.params.id, req.body, req.user);
    sendSuccess(res, indent, 'Indent approved');
  } catch (e) { next(e); }
});

/** CK dispatches goods */
router.patch('/indents/:id/dispatch', async (req, res, next) => {
  try {
    const indent = await ckService.dispatchIndent(req.params.id, req.body, req.user);
    sendSuccess(res, indent, 'Indent dispatched');
  } catch (e) { next(e); }
});

/** Branch confirms receipt */
router.patch('/indents/:id/receive', async (req, res, next) => {
  try {
    const indent = await ckService.receiveIndent(req.params.id, req.user);
    sendSuccess(res, indent, 'Receipt confirmed');
  } catch (e) { next(e); }
});

/** CK rejects indent */
router.patch('/indents/:id/reject', async (req, res, next) => {
  try {
    const indent = await ckService.rejectIndent(req.params.id, req.body, req.user);
    sendSuccess(res, indent, 'Indent rejected');
  } catch (e) { next(e); }
});

/** Outlets list for selectors */
router.get('/outlets', async (req, res, next) => {
  try {
    const outlets = await ckService.getOutlets(req.user);
    sendSuccess(res, outlets, 'Outlets retrieved');
  } catch (e) { next(e); }
});

/** Inventory items for a given outlet */
router.get('/inventory/:outlet_id', async (req, res, next) => {
  try {
    const items = await ckService.getInventoryItems(req.params.outlet_id);
    sendSuccess(res, items, 'Inventory items retrieved');
  } catch (e) { next(e); }
});

module.exports = router;
