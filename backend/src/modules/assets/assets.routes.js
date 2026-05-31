/**
 * @fileoverview Assets routes — fixed asset register & depreciation.
 */

const express = require('express');
const router = express.Router();
const c = require('./assets.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const v = require('./assets.validation');

const VIEW = hasPermission('VIEW_REPORTS');
const MANAGE = hasPermission('MANAGE_INVENTORY');

router.get('/register', authenticate, VIEW, c.register);
router.get('/', authenticate, VIEW, c.list);
router.post('/', authenticate, MANAGE, validate(v.createAssetSchema), c.create);
router.patch('/:id', authenticate, MANAGE, validate(v.updateAssetSchema), c.update);
router.delete('/:id', authenticate, MANAGE, c.remove);
router.post('/run-depreciation', authenticate, MANAGE, validate(v.runDepreciationSchema), c.runDepreciation);

module.exports = router;
