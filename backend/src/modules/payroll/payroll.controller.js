/**
 * @fileoverview Payroll controller — HTTP handlers for pay runs.
 * @module modules/payroll/payroll.controller
 */

const payroll = require('./payroll.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

async function list(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const payRuns = await payroll.listPayRuns(outletId);
    sendSuccess(res, payRuns, 'Pay runs retrieved');
  } catch (error) { next(error); }
}

async function get(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const payRun = await payroll.getPayRun(outletId, req.params.id);
    sendSuccess(res, payRun, 'Pay run retrieved');
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const payRun = await payroll.createPayRun(outletId, { ...req.body, created_by: req.user.id });
    sendCreated(res, payRun, 'Pay run created');
  } catch (error) { next(error); }
}

async function finalise(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const payRun = await payroll.finalisePayRun(outletId, req.params.id, req.user.id);
    sendSuccess(res, payRun, 'Pay run finalised');
  } catch (error) { next(error); }
}

module.exports = { list, get, create, finalise };
