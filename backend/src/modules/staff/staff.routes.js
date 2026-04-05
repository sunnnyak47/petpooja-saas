/**
 * @fileoverview Staff controller + routes combined.
 * @module modules/staff/staff.routes
 */

const express = require('express');
const router = express.Router();
const staffService = require('./staff.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

/** GET /api/staff — List staff for outlet */
router.get('/', authenticate, hasPermission('VIEW_STAFF'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { staff, total, page, limit } = await staffService.listStaff(outletId, req.query);
    sendPaginated(res, staff, total, page, limit, 'Staff retrieved');
  } catch (error) { next(error); }
});

/** POST /api/staff — Create staff with user */
router.post('/', authenticate, hasPermission('MANAGE_STAFF'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await staffService.createStaffWithUser(outletId, req.body);
    sendCreated(res, result, 'Staff member created');
  } catch (error) { next(error); }
});

/** PATCH /api/staff/:id — Update profile */
router.patch('/:id', authenticate, hasPermission('MANAGE_STAFF'), async (req, res, next) => {
  try {
    const profile = await staffService.upsertStaffProfile(req.body.user_id, req.user.outlet_id, req.body);
    sendSuccess(res, profile, 'Staff updated');
  } catch (error) { next(error); }
});

/** POST /api/staff/verify-pin */
router.post('/verify-pin', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const staff = await staffService.verifyManagerPIN(outletId, req.body.pin);
    if (!staff) return res.status(401).json({ success: false, message: 'Invalid PIN' });
    sendSuccess(res, staff, 'PIN verified');
  } catch (error) { next(error); }
});

/** POST /api/staff/clock-in — Clock in */
router.post('/clock-in', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const record = await staffService.clockIn(req.user.id, outletId, req.body);
    sendCreated(res, record, 'Clocked in successfully');
  } catch (error) { next(error); }
});

/** POST /api/staff/clock-out — Clock out */
router.post('/clock-out', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const record = await staffService.clockOut(req.user.id, outletId, req.body);
    sendSuccess(res, record, 'Clocked out successfully');
  } catch (error) { next(error); }
});

/** GET /api/staff/attendance — Attendance records */
router.get('/attendance', authenticate, hasPermission('MANAGE_ATTENDANCE'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await staffService.getAttendance(outletId, req.query);
    sendPaginated(res, result.records, result.total, result.page, result.limit, 'Attendance retrieved');
  } catch (error) { next(error); }
});

/** GET /api/staff/shifts — List shifts */
router.get('/shifts', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const shifts = await staffService.listShifts(outletId);
    sendSuccess(res, shifts, 'Shifts retrieved');
  } catch (error) { next(error); }
});

/** POST /api/staff/shifts — Create shift */
router.post('/shifts', authenticate, hasPermission('MANAGE_STAFF'), async (req, res, next) => {
  try {
    const shift = await staffService.createShift(req.body);
    sendCreated(res, shift, 'Shift created');
  } catch (error) { next(error); }
});

/** GET /api/staff/performance — Staff performance metrics */
router.get('/performance', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await staffService.getStaffPerformance(outletId, req.query.from, req.query.to);
    sendSuccess(res, result, 'Staff performance retrieved');
  } catch (error) { next(error); }
});

module.exports = router;
