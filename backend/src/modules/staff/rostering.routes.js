/**
 * @fileoverview Rostering API routes — shift scheduling, availability, certifications
 */
const express = require('express');
const router = express.Router();
const svc = require('./rostering.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess } = require('../../utils/response');

// ── Rosters ──────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await svc.createRoster(outletId, req.body, req.user.id);
    sendSuccess(res, result, 'Roster created');
  } catch (e) { next(e); }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await svc.listRosters(outletId, req.query);
    sendSuccess(res, result, 'Rosters retrieved');
  } catch (e) { next(e); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await svc.getRosterById(req.params.id, outletId);
    sendSuccess(res, result, 'Roster retrieved');
  } catch (e) { next(e); }
});

router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await svc.updateRoster(req.params.id, outletId, req.body);
    sendSuccess(res, result, 'Roster updated');
  } catch (e) { next(e); }
});

router.post('/:id/publish', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await svc.publishRoster(req.params.id, outletId);
    sendSuccess(res, result, 'Roster published');
  } catch (e) { next(e); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await svc.deleteRoster(req.params.id, outletId);
    sendSuccess(res, null, 'Roster deleted');
  } catch (e) { next(e); }
});

// ── Assignments ──────────────────────────────────────────────────────────
router.post('/:id/assignments', authenticate, async (req, res, next) => {
  try {
    const result = await svc.addAssignment(req.params.id, req.body);
    sendSuccess(res, result, 'Assignment added');
  } catch (e) { next(e); }
});

router.patch('/assignments/:assignmentId', authenticate, async (req, res, next) => {
  try {
    const result = await svc.updateAssignment(req.params.assignmentId, req.body);
    sendSuccess(res, result, 'Assignment updated');
  } catch (e) { next(e); }
});

router.delete('/assignments/:assignmentId', authenticate, async (req, res, next) => {
  try {
    await svc.deleteAssignment(req.params.assignmentId);
    sendSuccess(res, null, 'Assignment removed');
  } catch (e) { next(e); }
});

// ── Availability ─────────────────────────────────────────────────────────
router.post('/staff/:staffId/availability', authenticate, async (req, res, next) => {
  try {
    const result = await svc.setAvailability(req.params.staffId, req.body);
    sendSuccess(res, result, 'Availability updated');
  } catch (e) { next(e); }
});

router.get('/staff/:staffId/availability', authenticate, async (req, res, next) => {
  try {
    const result = await svc.getAvailability(req.params.staffId);
    sendSuccess(res, result, 'Availability retrieved');
  } catch (e) { next(e); }
});

router.get('/available-staff', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await svc.getAvailableStaff(outletId, req.query.date);
    sendSuccess(res, result, 'Available staff retrieved');
  } catch (e) { next(e); }
});

// ── Certifications ───────────────────────────────────────────────────────
router.post('/certifications', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await svc.addCertification(outletId, req.body.staff_id, req.body);
    sendSuccess(res, result, 'Certification added');
  } catch (e) { next(e); }
});

router.get('/certifications', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await svc.getAllOutletCertifications(outletId);
    sendSuccess(res, result, 'Certifications retrieved');
  } catch (e) { next(e); }
});

router.get('/certifications/expiring', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const days = parseInt(req.query.within_days) || 30;
    const result = await svc.getExpiringCertifications(outletId, days);
    sendSuccess(res, result, 'Expiring certifications retrieved');
  } catch (e) { next(e); }
});

router.get('/staff/:staffId/certifications', authenticate, async (req, res, next) => {
  try {
    const result = await svc.getCertifications(req.params.staffId);
    sendSuccess(res, result, 'Staff certifications retrieved');
  } catch (e) { next(e); }
});

router.patch('/certifications/:id', authenticate, async (req, res, next) => {
  try {
    const result = await svc.updateCertification(req.params.id, req.body);
    sendSuccess(res, result, 'Certification updated');
  } catch (e) { next(e); }
});

module.exports = router;
