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

/** P2: Platform Settings */
router.get('/platform-settings', superadminController.getPlatformSettings);
router.put('/platform-settings', superadminController.savePlatformSettings);

/** P2: Support Tickets */
router.get('/support-tickets', superadminController.getTickets);
router.post('/support-tickets', superadminController.createTicket);
router.patch('/support-tickets/:id', superadminController.updateTicket);
router.post('/support-tickets/:id/reply', superadminController.replyToTicket);

/** P2: Broadcast Center */
router.get('/broadcasts', superadminController.getBroadcasts);
router.post('/broadcasts', superadminController.sendBroadcast);

/** P2: All Users */
router.get('/users', superadminController.getAllUsers);

/** P2: Promo Codes */
router.get('/promo-codes', superadminController.getPromoCodes);
router.post('/promo-codes', superadminController.createPromoCode);
router.patch('/promo-codes/:id', superadminController.updatePromoCode);
router.delete('/promo-codes/:id', superadminController.deletePromoCode);
router.post('/promo-codes/validate', superadminController.validatePromoCode);

/** P2: Chain Profile Edit */
router.patch('/chains/:id/profile', superadminController.updateChainProfile);

/** P3/P4: Platform Health Monitor */
router.get('/health', superadminController.getPlatformHealth);

/** P3/P4: Impersonation Audit Log */
router.get('/impersonation-log', superadminController.getImpersonationLog);
router.post('/impersonation-log', superadminController.logImpersonation);

/** P4: Menu Performance Analytics */
router.get('/menu-analytics', superadminController.getMenuAnalytics);

/** P4: Subscription Info per chain */
router.get('/chains/:id/subscription', superadminController.getSubscriptionInfo);

/** Chain Health Score */
router.get('/chain-health',       superadminController.getAllChainHealth);
router.get('/chain-health/:id',   superadminController.getChainHealthDetail);
router.get('/health-summary',     superadminController.getHealthSummary);

module.exports = router;
