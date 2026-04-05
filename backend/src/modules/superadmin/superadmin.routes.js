const express = require('express');
const router = express.Router();
const superadminController = require('./superadmin.controller');
const { authenticate, isSuperAdmin } = require('../../middleware/auth.middleware');

/** POST /api/superadmin/login — Global Master Login */
router.post('/login', superadminController.login);

// All other routes are globally protected by SuperAdmin only access
router.use(authenticate, isSuperAdmin);

/** GET /api/superadmin/dashboard — Global Statistics */
router.get('/dashboard', superadminController.getDashboard);

/** GET /api/superadmin/chains — List all restaurant chains */
router.get('/chains', superadminController.getChains);

/** POST /api/superadmin/impersonate — Login as a client */
router.post('/impersonate', superadminController.impersonate);

/** PATCH /api/superadmin/subscription/:id — Update license status */
router.patch('/subscription/:id', superadminController.updateSubscription);

module.exports = router;
