/**
 * @fileoverview Assets controller — fixed asset register & depreciation.
 */

const assets = require('./assets.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

async function list(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await assets.listAssets(outletId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await assets.getAssetRegister(outletId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const data = await assets.createAsset(outletId, req.body);
    sendCreated(res, data);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const data = await assets.updateAsset(outletId, req.params.id, req.body);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const data = await assets.deleteAsset(outletId, req.params.id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

async function runDepreciation(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const data = await assets.runDepreciation(outletId, req.body.period, req.user.id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, register, create, update, remove, runDepreciation };
