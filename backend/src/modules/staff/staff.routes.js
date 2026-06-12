/**
 * @fileoverview Staff controller + routes combined.
 * @module modules/staff/staff.routes
 */

const express = require('express');
const router = express.Router();
const staffService = require('./staff.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createStaffSchema, updateStaffSchema, addCertificationSchema, setAvailabilitySchema, verifyPinSchema, clockInSchema, clockOutSchema, createShiftSchema, calculateSalarySchema, bulkCalculateSalarySchema, markSalaryPaidSchema, generateOTPSchema, verifyOTPSchema } = require('./staff.validation');
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
router.post('/', authenticate, hasPermission('MANAGE_STAFF'), validate(createStaffSchema), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await staffService.assertOutletInTenant(outletId, req.user);
    const result = await staffService.createStaffWithUser(outletId, req.body);
    sendCreated(res, result, 'Staff member created');
  } catch (error) { next(error); }
});

/** GET /api/staff/:userId/profile — Get full staff profile */
router.get('/:userId/profile', authenticate, hasPermission('VIEW_STAFF'), async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await staffService.assertOutletInTenant(outletId, req.user);
    const profile = await staffService.getStaffProfile(req.params.userId, outletId);
    sendSuccess(res, profile, 'Staff profile retrieved');
  } catch (error) { next(error); }
});

/** PATCH /api/staff/:userId/profile — Update full staff profile */
router.patch('/:userId/profile', authenticate, hasPermission('MANAGE_STAFF'), validate(updateStaffSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await staffService.assertOutletInTenant(outletId, req.user);
    const profile = await staffService.upsertStaffProfile(req.params.userId, outletId, req.body);
    sendSuccess(res, profile, 'Staff profile updated');
  } catch (error) { next(error); }
});

/** PATCH /api/staff/:id — Update profile (legacy) */
router.patch('/:id', authenticate, hasPermission('MANAGE_STAFF'), validate(updateStaffSchema), async (req, res, next) => {
  try {
    const userId = req.body.user_id || req.params.id;
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await staffService.assertOutletInTenant(outletId, req.user);
    const profile = await staffService.upsertStaffProfile(userId, outletId, req.body);
    sendSuccess(res, profile, 'Staff updated');
  } catch (error) { next(error); }
});

/** GET /api/staff/:userId/certifications — List certifications */
router.get('/:userId/certifications', authenticate, hasPermission('VIEW_STAFF'), async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await staffService.assertOutletInTenant(outletId, req.user);
    const certs = await staffService.listCertifications(req.params.userId, outletId);
    sendSuccess(res, certs, 'Certifications retrieved');
  } catch (error) { next(error); }
});

/** POST /api/staff/:userId/certifications — Add certification */
router.post('/:userId/certifications', authenticate, hasPermission('MANAGE_STAFF'), validate(addCertificationSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await staffService.assertOutletInTenant(outletId, req.user);
    const cert = await staffService.addCertification(req.params.userId, outletId, req.body);
    sendCreated(res, cert, 'Certification added');
  } catch (error) { next(error); }
});

/** DELETE /api/staff/certifications/:certId — Remove certification */
router.delete('/certifications/:certId', authenticate, hasPermission('MANAGE_STAFF'), async (req, res, next) => {
  try {
    await staffService.deleteCertification(req.params.certId);
    sendSuccess(res, null, 'Certification removed');
  } catch (error) { next(error); }
});

/** GET /api/staff/:userId/availability — Get weekly availability */
router.get('/:userId/availability', authenticate, hasPermission('VIEW_STAFF'), async (req, res, next) => {
  try {
    const slots = await staffService.getAvailability(req.params.userId, req.user);
    sendSuccess(res, slots, 'Availability retrieved');
  } catch (error) { next(error); }
});

/** PUT /api/staff/:userId/availability — Set weekly availability */
router.put('/:userId/availability', authenticate, hasPermission('MANAGE_STAFF'), validate(setAvailabilitySchema), async (req, res, next) => {
  try {
    const slots = await staffService.setAvailability(req.params.userId, req.body.slots, req.user);
    sendSuccess(res, slots, 'Availability updated');
  } catch (error) { next(error); }
});

/** POST /api/staff/verify-pin */
router.post('/verify-pin', authenticate, validate(verifyPinSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const staff = await staffService.verifyManagerPIN(outletId, req.body.pin);
    if (!staff) return res.status(401).json({ success: false, message: 'Invalid PIN' });
    sendSuccess(res, staff, 'PIN verified');
  } catch (error) { next(error); }
});

/** POST /api/staff/clock-in — Clock in */
router.post('/clock-in', authenticate, validate(clockInSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const record = await staffService.clockIn(req.user.id, outletId, req.body);
    sendCreated(res, record, 'Clocked in successfully');
  } catch (error) { next(error); }
});

/** POST /api/staff/clock-out — Clock out */
router.post('/clock-out', authenticate, validate(clockOutSchema), async (req, res, next) => {
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
router.post('/shifts', authenticate, hasPermission('MANAGE_STAFF'), validate(createShiftSchema), async (req, res, next) => {
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

/** POST /api/staff/otp/generate — Generate clock-in/out OTP */
router.post('/otp/generate', authenticate, validate(generateOTPSchema), async (req, res, next) => {
  try {
    const { action } = req.body; // clock_in | clock_out
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await staffService.generateClockOTP(req.user.id, outletId, action);
    sendSuccess(res, result, 'OTP generated');
  } catch (error) { next(error); }
});

/** POST /api/staff/otp/verify — Verify OTP and clock in/out */
router.post('/otp/verify', authenticate, validate(verifyOTPSchema), async (req, res, next) => {
  try {
    const { otp, action } = req.body;
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const record = await staffService.verifyClockOTP(req.user.id, outletId, otp, action);
    sendSuccess(res, record, action === 'clock_in' ? 'Clocked in ✓' : 'Clocked out ✓');
  } catch (error) { next(error); }
});

/** GET /api/staff/shift-report — Shift/attendance report */
router.get('/shift-report', authenticate, hasPermission('VIEW_REPORTS'), async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await staffService.getShiftReport(outletId, req.query);
    sendSuccess(res, result, 'Shift report retrieved');
  } catch (error) { next(error); }
});

/** GET /api/staff/salary — List salary records */
router.get('/salary', authenticate, hasPermission('MANAGE_STAFF'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const records = await staffService.listSalaryRecords(outletId, req.query);
    sendSuccess(res, records, 'Salary records retrieved');
  } catch (error) { next(error); }
});

/** POST /api/staff/salary/calculate — Calculate salary for one staff */
router.post('/salary/calculate', authenticate, hasPermission('MANAGE_STAFF'), validate(calculateSalarySchema), async (req, res, next) => {
  try {
    const { user_id, month, year } = req.body;
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const record = await staffService.calculateSalary(user_id, outletId, parseInt(month), parseInt(year));
    sendSuccess(res, record, 'Salary calculated');
  } catch (error) { next(error); }
});

/** POST /api/staff/salary/bulk-calculate — Calculate salary for all staff */
router.post('/salary/bulk-calculate', authenticate, hasPermission('MANAGE_STAFF'), validate(bulkCalculateSalarySchema), async (req, res, next) => {
  try {
    const { month, year } = req.body;
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const records = await staffService.bulkCalculateSalary(outletId, parseInt(month), parseInt(year));
    sendSuccess(res, records, `Salary calculated for ${records.length} staff`);
  } catch (error) { next(error); }
});

/** PATCH /api/staff/salary/:id/pay — Mark salary as paid */
router.patch('/salary/:id/pay', authenticate, hasPermission('MANAGE_STAFF'), validate(markSalaryPaidSchema), async (req, res, next) => {
  try {
    const record = await staffService.markSalaryPaid(req.params.id, req.user, req.body.bonus || 0);
    sendSuccess(res, record, 'Salary marked as paid');
  } catch (error) { next(error); }
});

module.exports = router;
