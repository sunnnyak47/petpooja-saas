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
  updateTableSchema,
  createTableAreaSchema,
  updateTableAreaSchema,
  saveFloorPlanSchema,
} = require('./table.validation');

/* ── Table Areas (must be before /:id routes) ── */
router.get('/areas', authenticate, enforceOutletScope, tableController.listTableAreas);
router.post('/areas', authenticate, hasPermission('MANAGE_POS'), validate(createTableAreaSchema), tableController.createTableArea);
router.patch('/areas/:id', authenticate, hasPermission('MANAGE_POS'), validate(updateTableAreaSchema), tableController.updateTableArea);
router.delete('/areas/:id', authenticate, hasPermission('MANAGE_POS'), tableController.deleteTableArea);

/* ── Floor Plan bulk save ── */
router.post('/floor-plan', authenticate, hasPermission('MANAGE_POS'), validate(saveFloorPlanSchema), tableController.saveFloorPlan);

/* ── Tables ── */
router.get('/', authenticate, enforceOutletScope, tableController.listTables);
router.post('/', authenticate, hasPermission('MANAGE_POS'), validate(createTableSchema), tableController.createTable);
router.patch('/:id/status', authenticate, hasPermission('MANAGE_POS'), validate(updateTableStatusSchema), tableController.updateTableStatus);
router.patch('/:id', authenticate, hasPermission('MANAGE_POS'), validate(updateTableSchema), tableController.updateTable);
router.delete('/:id', authenticate, hasPermission('MANAGE_POS'), tableController.deleteTable);

module.exports = router;
