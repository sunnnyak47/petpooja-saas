const express = require('express');
const router = express.Router();
const superadminController = require('./superadmin.controller');
const { authenticate, isSuperAdmin } = require('../../middleware/auth.middleware');

/** POST /api/superadmin/login */
router.post('/login', superadminController.login);

/** GET /api/superadmin/verify — Verify token */
router.get('/verify', authenticate, isSuperAdmin, superadminController.verifyToken);

// All routes below are protected
router.use(authenticate, isSuperAdmin);

/** GET /api/superadmin/dashboard */
router.get('/dashboard', superadminController.getDashboard);

/** GET /api/superadmin/chains */
router.get('/chains', superadminController.getChains);

/** GET /api/superadmin/chains/:id */
router.get('/chains/:id', superadminController.getChainDetail);

/** POST /api/superadmin/onboard */
router.post('/onboard', superadminController.onboard);

/** POST /api/superadmin/impersonate */
router.post('/impersonate', superadminController.impersonate);

/** PATCH /api/superadmin/subscription/:id */
router.patch('/subscription/:id', superadminController.updateSubscription);

/** GET /api/superadmin/revenue */
router.get('/revenue', superadminController.getRevenue);

/** GET/PUT /api/superadmin/config */
router.get('/config', superadminController.getConfig);
router.put('/config', superadminController.updateConfig);

module.exports = router;
