const express = require('express');
const router = express.Router();
const superadminController = require('./superadmin.controller');
const { authenticate, isSuperAdmin, requirePlatformPermission } = require('../../middleware/auth.middleware');
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
  createStaffSchema,
  updateStaffSchema,
  transferOwnershipSchema,
  softDeleteChainSchema,
  changeOwnerEmailSchema,
} = require('./superadmin.validation');

/** Short alias — gate a route to platform staff holding a given permission. */
const P = requirePlatformPermission;

/** POST /api/superadmin/login */
router.post('/login', validate(superadminLoginSchema), superadminController.login);

/** GET /api/superadmin/verify — Verify token (any logged-in platform staff) */
router.get('/verify', authenticate, isSuperAdmin, superadminController.verifyToken);

// All routes below are protected: must be platform staff, then per-route permission.
router.use(authenticate, isSuperAdmin);

/** GET /api/superadmin/dashboard */
router.get('/dashboard', P('sa.dashboard.view'), superadminController.getDashboard);

/** GET /api/superadmin/chains */
router.get('/chains', P('sa.chains.view'), superadminController.getChains);

/** GET /api/superadmin/chains/:id */
router.get('/chains/:id', P('sa.chains.view'), superadminController.getChainDetail);

/** POST /api/superadmin/onboard */
router.post('/onboard', P('sa.chains.manage'), validate(onboardSchema), superadminController.onboard);

/** POST /api/superadmin/impersonate */
router.post('/impersonate', P('sa.impersonate'), validate(impersonateSchema), superadminController.impersonate);

/** PATCH /api/superadmin/subscription/:id */
router.patch('/subscription/:id', P('sa.billing.manage'), validate(updateSubscriptionSchema), superadminController.updateSubscription);

/** GET /api/superadmin/revenue */
router.get('/revenue', P('sa.billing.view'), superadminController.getRevenue);

/** GET /api/superadmin/region-templates — AU vs IN defaults */
router.get('/region-templates', P('sa.chains.view'), superadminController.getRegionTemplates);

/** PATCH /api/superadmin/chains/:id/region — switch HeadOffice region */
router.patch('/chains/:id/region', P('sa.chains.manage'), validate(switchRegionSchema), superadminController.switchRegion);

/** GET/PATCH /api/superadmin/chains/:id/features — feature flag management */
router.get('/chains/:id/features', P('sa.chains.view'), superadminController.getFeatures);
router.patch('/chains/:id/features', P('sa.chains.manage'), validate(updateFeaturesSchema), superadminController.updateFeatures);

/** PATCH /api/superadmin/chains/:id/status — suspend / activate */
router.patch('/chains/:id/status', P('sa.chains.manage'), validate(toggleStatusSchema), superadminController.toggleStatus);

/** PATCH /api/superadmin/chains/:id/notes — internal notes */
router.patch('/chains/:id/notes', P('sa.chains.manage'), validate(updateNotesSchema), superadminController.updateNotes);

/** PATCH /api/superadmin/chains/:id/plan — assign plan */
router.patch('/chains/:id/plan', P('sa.chains.manage'), validate(assignPlanSchema), superadminController.assignPlan);

/** GET /api/superadmin/live-stats — global live stats */
router.get('/live-stats', P('sa.dashboard.view'), superadminController.getLiveStats);

/** GET /api/superadmin/chains/:id/outlets — outlet dashboard */
router.get('/chains/:id/outlets', P('sa.chains.view'), superadminController.getChainOutlets);

/** GET /api/superadmin/revenue-analytics — MRR trends, churn, region */
router.get('/revenue-analytics', P('sa.billing.view'), superadminController.getRevenueAnalytics);

/** Invoice management */
router.get('/invoices', P('sa.billing.view'), superadminController.getInvoices);
router.post('/invoices/generate', P('sa.billing.manage'), validate(generateInvoicesSchema), superadminController.generateInvoices);
router.patch('/invoices/:id', P('sa.billing.manage'), validate(updateInvoiceSchema), superadminController.updateInvoice);

/** Tax profiles */
router.get('/tax-profiles', P('sa.billing.view'), superadminController.getTaxProfiles);
router.put('/tax-profiles', P('sa.billing.manage'), validate(saveTaxProfilesSchema), superadminController.saveTaxProfiles);

/** Announcements — NOTE: for-chain route must come before /:id to avoid param collision */
router.get('/announcements/for-chain/:headOfficeId', P('sa.support.manage'), superadminController.getChainAnnouncements);
router.get('/announcements', P('sa.support.manage'), superadminController.getAnnouncements);
router.post('/announcements', P('sa.support.manage'), validate(createAnnouncementSchema), superadminController.createAnnouncement);
router.patch('/announcements/:id', P('sa.support.manage'), validate(updateAnnouncementSchema), superadminController.updateAnnouncement);
router.delete('/announcements/:id', P('sa.support.manage'), superadminController.deleteAnnouncement);

/** P2: Platform Settings */
router.get('/platform-settings', P('sa.settings.manage'), superadminController.getPlatformSettings);
router.put('/platform-settings', P('sa.settings.manage'), validate(savePlatformSettingsSchema), superadminController.savePlatformSettings);

/** P2: Support Tickets */
router.get('/support-tickets', P('sa.support.manage'), superadminController.getTickets);
router.post('/support-tickets', P('sa.support.manage'), validate(createTicketSchema), superadminController.createTicket);
router.patch('/support-tickets/:id', P('sa.support.manage'), validate(updateTicketSchema), superadminController.updateTicket);
router.post('/support-tickets/:id/reply', P('sa.support.manage'), validate(replyToTicketSchema), superadminController.replyToTicket);

/** P2: Broadcast Center */
router.get('/broadcasts', P('sa.support.manage'), superadminController.getBroadcasts);
router.post('/broadcasts', P('sa.support.manage'), validate(sendBroadcastSchema), superadminController.sendBroadcast);

/** P2: All Users */
router.get('/users', P('sa.chains.view'), superadminController.getAllUsers);

/** P2: Promo Codes */
router.get('/promo-codes', P('sa.promos.manage'), superadminController.getPromoCodes);
router.post('/promo-codes', P('sa.promos.manage'), validate(createPromoCodeSchema), superadminController.createPromoCode);
router.patch('/promo-codes/:id', P('sa.promos.manage'), validate(updatePromoCodeSchema), superadminController.updatePromoCode);
router.delete('/promo-codes/:id', P('sa.promos.manage'), superadminController.deletePromoCode);
router.post('/promo-codes/validate', P('sa.promos.manage'), validate(validatePromoCodeSchema), superadminController.validatePromoCode);

/** P2: Chain Profile Edit */
router.patch('/chains/:id/profile', P('sa.chains.manage'), validate(updateChainProfileSchema), superadminController.updateChainProfile);

/** P3/P4: Platform Health Monitor */
router.get('/health', P('sa.audit.view'), superadminController.getPlatformHealth);

/** P3/P4: Impersonation Audit Log */
router.get('/impersonation-log', P('sa.audit.view'), superadminController.getImpersonationLog);
router.post('/impersonation-log', P('sa.impersonate'), validate(logImpersonationSchema), superadminController.logImpersonation);

/** P4: Menu Performance Analytics */
router.get('/menu-analytics', P('sa.dashboard.view'), superadminController.getMenuAnalytics);

/** P4: Subscription Info per chain */
router.get('/chains/:id/subscription', P('sa.chains.view'), superadminController.getSubscriptionInfo);

/** Chain Health Score */
router.get('/chain-health',       P('sa.dashboard.view'), superadminController.getAllChainHealth);
router.get('/chain-health/:id',   P('sa.dashboard.view'), superadminController.getChainHealthDetail);
router.get('/health-summary',     P('sa.dashboard.view'), superadminController.getHealthSummary);

/** GET /api/superadmin/onboarding-overview — All chains with wizard progress */
router.get('/onboarding-overview', P('sa.chains.view'), superadminController.getOnboardingOverview);

/** POST /api/superadmin/chains/:id/reset-wizard — Reset wizard for a chain */
router.post('/chains/:id/reset-wizard', P('sa.chains.manage'), superadminController.resetChainWizard);

/** POST /api/superadmin/chains/:id/reset-owner-password — reset + unlock the chain owner's login */
router.post('/chains/:id/reset-owner-password', P('sa.chains.manage'), superadminController.resetOwnerPassword);

/** PATCH /api/superadmin/chains/:id/owner-email — change the chain owner's login email */
router.patch('/chains/:id/owner-email', P('sa.chains.manage'), validate(changeOwnerEmailSchema), superadminController.changeOwnerEmail);

/** GET /api/superadmin/audit-log — platform-owner audit trail */
router.get('/audit-log', P('sa.audit.view'), superadminController.getPlatformAuditLog);

/** Chain lifecycle: ownership transfer + soft-delete / restore */
router.post('/chains/:id/transfer-ownership', P('sa.chains.manage'), validate(transferOwnershipSchema), superadminController.transferOwnership);
router.get('/chains-deleted', P('sa.chains.delete'), superadminController.listDeletedChains);
router.delete('/chains/:id', P('sa.chains.delete'), validate(softDeleteChainSchema), superadminController.softDeleteChain);
router.post('/chains/:id/restore', P('sa.chains.delete'), superadminController.restoreChain);

/** Platform staff management (super_admin / sa.staff.manage) */
router.get('/staff/roles', P('sa.staff.manage'), superadminController.listPlatformRoles);
router.get('/staff', P('sa.staff.manage'), superadminController.listStaff);
router.post('/staff', P('sa.staff.manage'), validate(createStaffSchema), superadminController.createStaff);
router.patch('/staff/:id', P('sa.staff.manage'), validate(updateStaffSchema), superadminController.updateStaff);
router.post('/staff/:id/reset-password', P('sa.staff.manage'), superadminController.resetStaffPassword);
router.delete('/staff/:id', P('sa.staff.manage'), superadminController.deactivateStaff);

module.exports = router;
