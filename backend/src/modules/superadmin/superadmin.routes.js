const express = require('express');
const router = express.Router();
const superadminController = require('./superadmin.controller');
const { authenticate, isSuperAdmin } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  superadminLoginSchema,
  onboardSchema,
  impersonateSchema,
  updateSubscriptionSchema,
  switchRegionSchema,
  updateFeaturesSchema,
  toggleStatusSchema,
  updateNotesSchema,
  assignPlanSchema,
  generateInvoicesSchema,
  updateInvoiceSchema,
  saveTaxProfilesSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  createTicketSchema,
  updateTicketSchema,
  replyToTicketSchema,
  sendBroadcastSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
  validatePromoCodeSchema,
  updateChainProfileSchema,
  logImpersonationSchema,
  savePlatformSettingsSchema,
} = require('./superadmin.validation');

/** POST /api/superadmin/login */
router.post('/login', validate(superadminLoginSchema), superadminController.login);

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
router.post('/onboard', validate(onboardSchema), superadminController.onboard);

/** POST /api/superadmin/impersonate */
router.post('/impersonate', validate(impersonateSchema), superadminController.impersonate);

/** PATCH /api/superadmin/subscription/:id */
router.patch('/subscription/:id', validate(updateSubscriptionSchema), superadminController.updateSubscription);

/** GET /api/superadmin/revenue */
router.get('/revenue', superadminController.getRevenue);

/** GET /api/superadmin/region-templates — AU vs IN defaults */
router.get('/region-templates', superadminController.getRegionTemplates);

/** PATCH /api/superadmin/chains/:id/region — switch HeadOffice region */
router.patch('/chains/:id/region', validate(switchRegionSchema), superadminController.switchRegion);

/** GET/PATCH /api/superadmin/chains/:id/features — feature flag management */
router.get('/chains/:id/features', superadminController.getFeatures);
router.patch('/chains/:id/features', validate(updateFeaturesSchema), superadminController.updateFeatures);

/** PATCH /api/superadmin/chains/:id/status — suspend / activate */
router.patch('/chains/:id/status', validate(toggleStatusSchema), superadminController.toggleStatus);

/** PATCH /api/superadmin/chains/:id/notes — internal notes */
router.patch('/chains/:id/notes', validate(updateNotesSchema), superadminController.updateNotes);

/** PATCH /api/superadmin/chains/:id/plan — assign plan */
router.patch('/chains/:id/plan', validate(assignPlanSchema), superadminController.assignPlan);

/** GET /api/superadmin/live-stats — global live stats */
router.get('/live-stats', superadminController.getLiveStats);

/** GET /api/superadmin/chains/:id/outlets — outlet dashboard */
router.get('/chains/:id/outlets', superadminController.getChainOutlets);

/** GET /api/superadmin/revenue-analytics — MRR trends, churn, region */
router.get('/revenue-analytics', superadminController.getRevenueAnalytics);

/** Invoice management */
router.get('/invoices', superadminController.getInvoices);
router.post('/invoices/generate', validate(generateInvoicesSchema), superadminController.generateInvoices);
router.patch('/invoices/:id', validate(updateInvoiceSchema), superadminController.updateInvoice);

/** Tax profiles */
router.get('/tax-profiles', superadminController.getTaxProfiles);
router.put('/tax-profiles', validate(saveTaxProfilesSchema), superadminController.saveTaxProfiles);

/** Announcements — NOTE: for-chain route must come before /:id to avoid param collision */
router.get('/announcements/for-chain/:headOfficeId', superadminController.getChainAnnouncements);
router.get('/announcements', superadminController.getAnnouncements);
router.post('/announcements', validate(createAnnouncementSchema), superadminController.createAnnouncement);
router.patch('/announcements/:id', validate(updateAnnouncementSchema), superadminController.updateAnnouncement);
router.delete('/announcements/:id', superadminController.deleteAnnouncement);

/** P2: Platform Settings */
router.get('/platform-settings', superadminController.getPlatformSettings);
router.put('/platform-settings', validate(savePlatformSettingsSchema), superadminController.savePlatformSettings);

/** P2: Support Tickets */
router.get('/support-tickets', superadminController.getTickets);
router.post('/support-tickets', validate(createTicketSchema), superadminController.createTicket);
router.patch('/support-tickets/:id', validate(updateTicketSchema), superadminController.updateTicket);
router.post('/support-tickets/:id/reply', validate(replyToTicketSchema), superadminController.replyToTicket);

/** P2: Broadcast Center */
router.get('/broadcasts', superadminController.getBroadcasts);
router.post('/broadcasts', validate(sendBroadcastSchema), superadminController.sendBroadcast);

/** P2: All Users */
router.get('/users', superadminController.getAllUsers);

/** P2: Promo Codes */
router.get('/promo-codes', superadminController.getPromoCodes);
router.post('/promo-codes', validate(createPromoCodeSchema), superadminController.createPromoCode);
router.patch('/promo-codes/:id', validate(updatePromoCodeSchema), superadminController.updatePromoCode);
router.delete('/promo-codes/:id', superadminController.deletePromoCode);
router.post('/promo-codes/validate', validate(validatePromoCodeSchema), superadminController.validatePromoCode);

/** P2: Chain Profile Edit */
router.patch('/chains/:id/profile', validate(updateChainProfileSchema), superadminController.updateChainProfile);

/** P3/P4: Platform Health Monitor */
router.get('/health', superadminController.getPlatformHealth);

/** P3/P4: Impersonation Audit Log */
router.get('/impersonation-log', superadminController.getImpersonationLog);
router.post('/impersonation-log', validate(logImpersonationSchema), superadminController.logImpersonation);

/** P4: Menu Performance Analytics */
router.get('/menu-analytics', superadminController.getMenuAnalytics);

/** P4: Subscription Info per chain */
router.get('/chains/:id/subscription', superadminController.getSubscriptionInfo);

/** Chain Health Score */
router.get('/chain-health',       superadminController.getAllChainHealth);
router.get('/chain-health/:id',   superadminController.getChainHealthDetail);
router.get('/health-summary',     superadminController.getHealthSummary);

/** GET /api/superadmin/onboarding-overview — All chains with wizard progress */
router.get('/onboarding-overview', superadminController.getOnboardingOverview);

/** POST /api/superadmin/chains/:id/reset-wizard — Reset wizard for a chain */
router.post('/chains/:id/reset-wizard', superadminController.resetChainWizard);

module.exports = router;
