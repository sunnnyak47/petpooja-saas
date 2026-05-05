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

/** GET /api/superadmin/region-templates — AU vs IN defaults */
router.get('/region-templates', superadminController.getRegionTemplates);

/** PATCH /api/superadmin/chains/:id/region — switch HeadOffice region */
router.patch('/chains/:id/region', superadminController.switchRegion);

/** GET/PATCH /api/superadmin/chains/:id/features — feature flag management */
router.get('/chains/:id/features', superadminController.getFeatures);
router.patch('/chains/:id/features', superadminController.updateFeatures);

/** PATCH /api/superadmin/chains/:id/status — suspend / activate */
router.patch('/chains/:id/status', superadminController.toggleStatus);

/** PATCH /api/superadmin/chains/:id/notes — internal notes */
router.patch('/chains/:id/notes', superadminController.updateNotes);

/** PATCH /api/superadmin/chains/:id/plan — assign plan */
router.patch('/chains/:id/plan', superadminController.assignPlan);

/** GET /api/superadmin/live-stats — global live stats */
router.get('/live-stats', superadminController.getLiveStats);

/** GET /api/superadmin/chains/:id/outlets — outlet dashboard */
router.get('/chains/:id/outlets', superadminController.getChainOutlets);

/** GET /api/superadmin/revenue-analytics — MRR trends, churn, region */
router.get('/revenue-analytics', superadminController.getRevenueAnalytics);

/** Invoice management */
router.get('/invoices', superadminController.getInvoices);
router.post('/invoices/generate', superadminController.generateInvoices);
router.patch('/invoices/:id', superadminController.updateInvoice);

/** Tax profiles */
router.get('/tax-profiles', superadminController.getTaxProfiles);
router.put('/tax-profiles', superadminController.saveTaxProfiles);

/** Announcements — NOTE: for-chain route must come before /:id to avoid param collision */
router.get('/announcements/for-chain/:headOfficeId', superadminController.getChainAnnouncements);
router.get('/announcements', superadminController.getAnnouncements);
router.post('/announcements', superadminController.createAnnouncement);
router.patch('/announcements/:id', superadminController.updateAnnouncement);
router.delete('/announcements/:id', superadminController.deleteAnnouncement);

module.exports = router;
