/**
 * @fileoverview Table routes — maps endpoints to controllers with auth + validation.
 * @module modules/orders/table.routes
 */

const express = require('express');
const router = express.Router();
const tableController = require('./table.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createTableSchema,
  updateTableStatusSchema,
  createTableAreaSchema,
} = require('./table.validation');

/* -- Tables -- */
router.get('/', authenticate, enforceOutletScope, tableController.listTables);
router.post('/', authenticate, hasPermission('MANAGE_POS'), validate(createTableSchema), tableController.createTable);
router.patch('/:id/status', authenticate, hasPermission('MANAGE_POS'), validate(updateTableStatusSchema), tableController.updateTableStatus);
router.delete('/:id', authenticate, hasPermission('MANAGE_POS'), tableController.deleteTable);

/* -- Table Areas -- */
router.get('/areas', authenticate, enforceOutletScope, tableController.listTableAreas);

module.exports = router;
