/**
 * @fileoverview SuperAdmin Controller — Email/Password auth + platform management
 */
const superadminService = require('./superadmin.service');
const onboardingService = require('../onboarding/onboarding.service');
const { sendSuccess, sendError } = require('../../utils/response');

const superadminController = {
  /**
   * SuperAdmin Login — Email + Password
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return sendError(res, 400, 'Email and password are required');
      }
      const result = await superadminService.login(email, password);
      sendSuccess(res, result, 'SuperAdmin access granted');
    } catch (err) {
      next(err);
    }
  },

  /**
   * Dashboard Overview Statistics
   */
  async getDashboard(req, res, next) {
    try {
      const stats = await superadminService.getDashboardStats();
      sendSuccess(res, stats, 'Platform statistics retrieved');
    } catch (err) { next(err); }
  },

  /**
   * SaaS Revenue Analytics
   */
  async getRevenue(req, res, next) {
    try {
      const revenue = await superadminService.getRevenueStats();
      sendSuccess(res, revenue, 'Revenue statistics retrieved');
    } catch (err) { next(err); }
  },

  async getPublicConfig(req, res, next) {
    try {
      const config = await superadminService.getPublicSystemConfig();
      sendSuccess(res, config, 'Public platform branding retrieved');
    } catch (err) { next(err); }
  },

  /**
   * List all restaurant chains
   */
  async getChains(req, res, next) {
    try {
      const chains = await superadminService.listChains(req.query);
      sendSuccess(res, chains, 'All restaurant chains retrieved');
    } catch (err) { next(err); }
  },

  /**
   * Get single chain detail
   */
  async getChainDetail(req, res, next) {
    try {
      const { id } = req.params;
      const chain = await superadminService.getChainDetail(id);
      sendSuccess(res, chain, 'Chain detail retrieved');
    } catch (err) { next(err); }
  },

  /**
   * Impersonation — Login as a client restaurant
   */
  async impersonate(req, res, next) {
    try {
      const { head_office_id } = req.body;
      const { token, user } = await superadminService.impersonate(head_office_id, req.user?.id, req.user?.email);
      sendSuccess(res, { token, user, impersonating: true }, 'Impersonation token generated');
    } catch (err) { next(err); }
  },

  /**
   * Update Client License
   */
  async updateSubscription(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await superadminService.updateLicense(id, req.body);
      sendSuccess(res, updated, 'Subscription updated successfully');
    } catch (err) { next(err); }
  },

  /**
   * Get audit log
   */
  async getAuditLog(req, res, next) {
    try {
      const logs = await superadminService.getAuditLog(req.query);
      sendSuccess(res, logs, 'Audit log retrieved');
    } catch (err) { next(err); }
  },

  /**
   * Onboard New Restaurant Chain
   */
  async onboard(req, res, next) {
    try {
      const result = await superadminService.onboardRestaurant(req.body, req.user?.id);
      sendSuccess(res, result, 'Restaurant onboarded successfully. Owner can now login.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * Verify current SuperAdmin token
   */
  async verifyToken(req, res, next) {
    try {
      sendSuccess(res, { valid: true, user: req.user }, 'Token valid');
    } catch (err) { next(err); }
  },

  /** GET /api/superadmin/region-templates */
  async getRegionTemplates(req, res, next) {
    try {
      const templates = await superadminService.getRegionTemplates();
      sendSuccess(res, templates, 'Region templates retrieved');
    } catch (err) { next(err); }
  },

  /** PATCH /api/superadmin/chains/:id/region */
  async switchRegion(req, res, next) {
    try {
      const result = await superadminService.switchHeadOfficeRegion(req.params.id, req.body);
      sendSuccess(res, result, 'Region switched successfully');
    } catch (err) { next(err); }
  },

  /** GET /api/superadmin/chains/:id/features */
  async getFeatures(req, res, next) {
    try {
      const result = await superadminService.getChainFeatures(req.params.id);
      sendSuccess(res, result, 'Chain features retrieved');
    } catch (err) { next(err); }
  },

  /** PATCH /api/superadmin/chains/:id/features */
  async updateFeatures(req, res, next) {
    try {
      const result = await superadminService.updateChainFeatures(req.params.id, req.body);
      sendSuccess(res, result, 'Chain features updated successfully');
    } catch (err) { next(err); }
  },

  /** PATCH /api/superadmin/chains/:id/status */
  async toggleStatus(req, res, next) {
    try {
      const { action, reason } = req.body;
      if (!['suspend', 'activate', 'trial'].includes(action)) {
        return sendError(res, 400, "action must be one of: suspend, activate, trial");
      }
      const result = await superadminService.toggleChainStatus(req.params.id, action, req.user?.id, reason);
      sendSuccess(res, result, `Chain ${action}d successfully`);
    } catch (err) { next(err); }
  },

  /** PATCH /api/superadmin/chains/:id/notes */
  async updateNotes(req, res, next) {
    try {
      const { notes } = req.body;
      const result = await superadminService.updateChainNotes(req.params.id, notes, req.user?.id);
      sendSuccess(res, result, 'Chain notes updated');
    } catch (err) { next(err); }
  },

  /** PATCH /api/superadmin/chains/:id/plan */
  async assignPlan(req, res, next) {
    try {
      const { plan } = req.body;
      if (!plan) return sendError(res, 400, 'plan is required');
      const result = await superadminService.assignPlan(req.params.id, plan, req.user?.id);
      sendSuccess(res, result, 'Plan assigned successfully');
    } catch (err) { next(err); }
  },

  /** GET /api/superadmin/live-stats */
  async getLiveStats(req, res, next) {
    try {
      const stats = await superadminService.getGlobalLiveStats();
      sendSuccess(res, stats, 'Global live stats retrieved');
    } catch (err) { next(err); }
  },

  /** GET /api/superadmin/announcements */
  async getAnnouncements(req, res, next) {
    try {
      const list = await superadminService.getAnnouncements();
      sendSuccess(res, list, 'Announcements retrieved');
    } catch (err) { next(err); }
  },

  /** POST /api/superadmin/announcements */
  async createAnnouncement(req, res, next) {
    try {
      const { title, message, type, target_chain_ids, expires_at } = req.body;
      if (!title || !message) return sendError(res, 400, 'title and message are required');
      const result = await superadminService.createAnnouncement({
        title, message, type, target_chain_ids, expires_at, adminId: req.user?.id
      });
      sendSuccess(res, result, 'Announcement created');
    } catch (err) { next(err); }
  },

  /** PATCH /api/superadmin/announcements/:id */
  async updateAnnouncement(req, res, next) {
    try {
      const result = await superadminService.updateAnnouncement(req.params.id, req.body);
      sendSuccess(res, result, 'Announcement updated');
    } catch (err) { next(err); }
  },

  /** DELETE /api/superadmin/announcements/:id */
  async deleteAnnouncement(req, res, next) {
    try {
      const result = await superadminService.deleteAnnouncement(req.params.id);
      sendSuccess(res, result, 'Announcement deleted');
    } catch (err) { next(err); }
  },

  /** GET /api/superadmin/announcements/for-chain/:headOfficeId */
  async getChainAnnouncements(req, res, next) {
    try {
      const list = await superadminService.getActiveAnnouncementsForChain(req.params.headOfficeId);
      sendSuccess(res, list, 'Chain announcements retrieved');
    } catch (err) { next(err); }
  },

  // ── P1: Outlet Dashboard ──────────────────────────────────────────────────

  /** GET /api/superadmin/chains/:id/outlets */
  async getChainOutlets(req, res, next) {
    try {
      const outlets = await superadminService.getChainOutlets(req.params.id);
      sendSuccess(res, outlets, 'Chain outlets retrieved');
    } catch (err) { next(err); }
  },

  // ── P1: Revenue Analytics ─────────────────────────────────────────────────

  /** GET /api/superadmin/revenue-analytics */
  async getRevenueAnalytics(req, res, next) {
    try {
      const data = await superadminService.getRevenueAnalytics();
      sendSuccess(res, data, 'Revenue analytics retrieved');
    } catch (err) { next(err); }
  },

  // ── P1: Invoice Management ────────────────────────────────────────────────

  /** GET /api/superadmin/invoices */
  async getInvoices(req, res, next) {
    try {
      const list = await superadminService.getInvoices(req.query.head_office_id);
      sendSuccess(res, list, 'Invoices retrieved');
    } catch (err) { next(err); }
  },

  /** POST /api/superadmin/invoices/generate */
  async generateInvoices(req, res, next) {
    try {
      const { month, year } = req.body;
      const now = new Date();
      const result = await superadminService.generateMonthlyInvoices(
        month || now.getMonth() + 1,
        year || now.getFullYear()
      );
      sendSuccess(res, result, `Generated ${result.generated} invoices`);
    } catch (err) { next(err); }
  },

  /** PATCH /api/superadmin/invoices/:id */
  async updateInvoice(req, res, next) {
    try {
      const result = await superadminService.updateInvoice(req.params.id, req.body);
      sendSuccess(res, result, 'Invoice updated');
    } catch (err) { next(err); }
  },

  // ── P1: Tax Profiles ──────────────────────────────────────────────────────

  /** GET /api/superadmin/tax-profiles */
  async getTaxProfiles(req, res, next) {
    try {
      const profiles = await superadminService.getTaxProfiles();
      sendSuccess(res, profiles, 'Tax profiles retrieved');
    } catch (err) { next(err); }
  },

  /** PUT /api/superadmin/tax-profiles */
  async saveTaxProfiles(req, res, next) {
    try {
      const { profiles } = req.body;
      if (!Array.isArray(profiles)) return sendError(res, 400, 'profiles must be an array');
      const result = await superadminService.saveTaxProfiles(profiles);
      sendSuccess(res, result, 'Tax profiles saved');
    } catch (err) { next(err); }
  },

  // ─── P2: Platform Settings ────────────────────────────────────────────────
  async getPlatformSettings(req, res, next) {
    try {
      const settings = await superadminService.getPlatformSettings();
      sendSuccess(res, settings, 'Platform settings retrieved');
    } catch (err) { next(err); }
  },

  async savePlatformSettings(req, res, next) {
    try {
      const result = await superadminService.savePlatformSettings(req.body);
      sendSuccess(res, result, 'Platform settings saved');
    } catch (err) { next(err); }
  },

  // ─── P2: Support Tickets ─────────────────────────────────────────────────
  async getTickets(req, res, next) {
    try {
      const { status, priority, search } = req.query;
      const tickets = await superadminService.getTickets({ status, priority, search });
      sendSuccess(res, tickets, 'Tickets retrieved');
    } catch (err) { next(err); }
  },

  async createTicket(req, res, next) {
    try {
      const ticket = await superadminService.createTicket(req.body);
      sendSuccess(res, ticket, 'Ticket created');
    } catch (err) { next(err); }
  },

  async updateTicket(req, res, next) {
    try {
      const result = await superadminService.updateTicket(req.params.id, req.body);
      sendSuccess(res, result, 'Ticket updated');
    } catch (err) { next(err); }
  },

  async replyToTicket(req, res, next) {
    try {
      const result = await superadminService.replyToTicket(req.params.id, req.body);
      sendSuccess(res, result, 'Reply added');
    } catch (err) { next(err); }
  },

  // ─── P2: Broadcast Center ────────────────────────────────────────────────
  async getBroadcasts(req, res, next) {
    try {
      const broadcasts = await superadminService.getBroadcasts();
      sendSuccess(res, broadcasts, 'Broadcasts retrieved');
    } catch (err) { next(err); }
  },

  async sendBroadcast(req, res, next) {
    try {
      const sent_by = req.user?.email || 'admin@madsundigital.com';
      const result = await superadminService.sendBroadcast({ ...req.body, sent_by });
      sendSuccess(res, result, 'Broadcast sent');
    } catch (err) { next(err); }
  },

  // ─── P2: All Users ───────────────────────────────────────────────────────
  async getAllUsers(req, res, next) {
    try {
      const { search, role, plan } = req.query;
      const users = await superadminService.getAllUsers({ search, role, plan });
      sendSuccess(res, users, 'Users retrieved');
    } catch (err) { next(err); }
  },

  // ─── P2: Promo Codes ─────────────────────────────────────────────────────
  async getPromoCodes(req, res, next) {
    try {
      const promos = await superadminService.getPromoCodes();
      sendSuccess(res, promos, 'Promo codes retrieved');
    } catch (err) { next(err); }
  },

  async createPromoCode(req, res, next) {
    try {
      const promo = await superadminService.createPromoCode(req.body);
      sendSuccess(res, promo, 'Promo code created');
    } catch (err) { next(err); }
  },

  async updatePromoCode(req, res, next) {
    try {
      const result = await superadminService.updatePromoCode(req.params.id, req.body);
      sendSuccess(res, result, 'Promo code updated');
    } catch (err) { next(err); }
  },

  async deletePromoCode(req, res, next) {
    try {
      await superadminService.deletePromoCode(req.params.id);
      sendSuccess(res, { deleted: true }, 'Promo code deleted');
    } catch (err) { next(err); }
  },

  async validatePromoCode(req, res, next) {
    try {
      const { code, plan } = req.body;
      const promo = await superadminService.validatePromoCode(code, plan);
      sendSuccess(res, promo, 'Valid promo code');
    } catch (err) { next(err); }
  },

  // ─── P2: Chain Profile Edit ──────────────────────────────────────────────
  async updateChainProfile(req, res, next) {
    try {
      const result = await superadminService.updateChainProfile(req.params.id, req.body);
      sendSuccess(res, result, 'Chain profile updated');
    } catch (err) { next(err); }
  },

  // ─── P3/P4: Platform Health Monitor ──────────────────────────────────────
  async getPlatformHealth(req, res, next) {
    try {
      const data = await superadminService.getPlatformHealth();
      sendSuccess(res, data, 'Platform health');
    } catch (err) { next(err); }
  },

  // ─── P3/P4: Impersonation Audit Log ──────────────────────────────────────
  async getImpersonationLog(req, res, next) {
    try {
      const data = await superadminService.getImpersonationLog();
      sendSuccess(res, data, 'Impersonation log');
    } catch (err) { next(err); }
  },

  async logImpersonation(req, res, next) {
    try {
      const entry = await superadminService.logImpersonation(req.body);
      sendSuccess(res, entry, 'Logged');
    } catch (err) { next(err); }
  },

  // ─── P4: Menu Analytics ───────────────────────────────────────────────────
  async getMenuAnalytics(req, res, next) {
    try {
      const { outlet_id } = req.query;
      if (!outlet_id) return sendError(res, 400, 'outlet_id required');
      const data = await superadminService.getMenuAnalytics(outlet_id);
      sendSuccess(res, data, 'Menu analytics');
    } catch (err) { next(err); }
  },

  // ─── P4: Subscription Info ────────────────────────────────────────────────
  async getSubscriptionInfo(req, res, next) {
    try {
      const headOfficeId = req.params.id;
      const data = await superadminService.getSubscriptionInfo(headOfficeId);
      sendSuccess(res, data, 'Subscription info');
    } catch (err) { next(err); }
  },

  // ─── Chain Health Score ───────────────────────────────────────────────────
  async getAllChainHealth(req, res, next) {
    try {
      const { computeAllChainScores } = require('./health-score.service');
      const data = await computeAllChainScores();
      sendSuccess(res, data, 'Chain health scores');
    } catch (err) { next(err); }
  },

  async getChainHealthDetail(req, res, next) {
    try {
      const { computeAllChainScores } = require('./health-score.service');
      const all = await computeAllChainScores({ headOfficeId: req.params.id });
      if (!all.length) return sendError(res, 404, 'Chain not found');
      sendSuccess(res, all[0], 'Chain health detail');
    } catch (err) { next(err); }
  },

  async getHealthSummary(req, res, next) {
    try {
      const { getPlatformHealthSummary } = require('./health-score.service');
      const data = await getPlatformHealthSummary();
      sendSuccess(res, data, 'Platform health summary');
    } catch (err) { next(err); }
  },

  async getOnboardingOverview(req, res, next) {
    try {
      const overview = await onboardingService.getOnboardingOverview();
      const { sendSuccess } = require('../../utils/response');
      sendSuccess(res, overview, 'Onboarding overview retrieved');
    } catch (error) { next(error); }
  },

  async resetChainWizard(req, res, next) {
    try {
      const { getDbClient } = require('../../config/database');
      const prisma = getDbClient();
      // Find primary outlet for this head office
      const outlet = await prisma.outlet.findFirst({
        where: { head_office_id: req.params.id, is_deleted: false },
        select: { id: true }
      });
      if (!outlet) {
        return res.status(404).json({ success: false, message: 'No outlet found for chain' });
      }
      const result = await onboardingService.resetWizard(req.params.id, outlet.id);
      const { sendSuccess } = require('../../utils/response');
      sendSuccess(res, result, 'Wizard reset for chain');
    } catch (error) { next(error); }
  },
};

module.exports = superadminController;
