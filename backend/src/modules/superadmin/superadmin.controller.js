/**
 * @fileoverview SuperAdmin Controller — Email/Password auth + platform management
 */
const superadminService = require('./superadmin.service');
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

  /**
   * System Configuration
   */
  async getConfig(req, res, next) {
    try {
      const config = await superadminService.getSystemConfig();
      sendSuccess(res, config, 'System configuration retrieved');
    } catch (err) { next(err); }
  },

  async updateConfig(req, res, next) {
    try {
      const result = await superadminService.updateSystemConfig(req.body);
      sendSuccess(res, result, 'System configuration updated');
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
      const { token, user } = await superadminService.impersonate(head_office_id, req.user?.id);
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
  }
};

module.exports = superadminController;
