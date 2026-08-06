/**
 * @fileoverview Assets routes — fixed asset register & depreciation.
 */

const express = require('express');
const router = express.Router();
const c = require('./assets.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const v = require('./assets.validation');

const VIEW = hasPermission('VIEW_REPORTS');
const MANAGE = hasPermission('MANAGE_INVENTORY');

// enforceOutletScope closes a cross-outlet/cross-tenant IDOR: without it, scoped
// users could pass any outlet_id in query/body since the controller trusts it as-is.
// It rejects a mismatched outlet_id and defaults it when absent; owners/super_admins pass through.
router.get('/register', authenticate, VIEW, enforceOutletScope, c.register);
router.get('/', authenticate, VIEW, enforceOutletScope, c.list);
router.post('/', authenticate, MANAGE, validate(v.createAssetSchema), enforceOutletScope, c.create);
router.patch('/:id', authenticate, MANAGE, validate(v.updateAssetSchema), enforceOutletScope, c.update);
router.delete('/:id', authenticate, MANAGE, enforceOutletScope, c.remove);
router.post('/run-depreciation', authenticate, MANAGE, validate(v.runDepreciationSchema), enforceOutletScope, c.runDepreciation);

module.exports = router;
