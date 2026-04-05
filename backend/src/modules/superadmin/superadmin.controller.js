const superadminService = require('./superadmin.service');
const { sendSuccess } = require('../../utils/response');

/**
 * SuperAdmin Controller
 */
const jwt = require('jsonwebtoken');
const appConfig = require('../../config/app');
const superadminController = {
  /**
   * Global Admin Login (Master Auth)
   */
  async login(req, res, next) {
    console.log('--- GLOBAL LOGIN ATTEMPT ---', req.body);
    try {
      const { pin } = req.body;
      // Phase 1: Verify against Master PIN
      if (pin !== '1234') {
        return res.status(401).json({ success: false, message: 'Invalid Master Key' });
      }

      // Generate a REAL high-security JWT for the SuperAdmin
      const token = jwt.sign(
        { role: 'super_admin', email: 'admin@petpooja.com' },
        appConfig.jwt.secret,
        { expiresIn: '24h' }
      );

      sendSuccess(res, { token }, 'Global Admin Access Granted');
    } catch (err) { next(err); }
  },

  /**
   * Dashboard Overview Statistics
   */
  async getDashboard(req, res, next) {
    try {
      const stats = await superadminService.getStats();
      sendSuccess(res, stats, 'Platform statistics retrieved');
    } catch (err) { next(err); }
  },

  /**
   * List all restaurant chains
   */
  async getChains(req, res, next) {
    try {
      const filters = req.query;
      const chains = await superadminService.listChains(filters);
      sendSuccess(res, chains, 'All restaurant chains retrieved');
    } catch (err) { next(err); }
  },

  /**
   * Impersonation — Login as a client
   * This is a critical support feature
   */
  async impersonate(req, res, next) {
    try {
      const { head_office_id } = req.body;
      const { token, user } = await superadminService.impersonate(head_office_id);
      
      // We append a flag to the response for the frontend to recognize impersonation mode
      sendSuccess(res, { token, user, impersonating: true }, 'Impersonation successful! Launching POS...');
    } catch (err) { next(err); }
  },

  /**
   * Update Client License (Extend/Suspend)
   */
  async updateSubscription(req, res, next) {
    try {
      const { id } = req.params;
      const { plan, is_active, trial_ends_at } = req.body;
      
      const updated = await superadminService.updateLicense(id, { plan, is_active, trial_ends_at });
      sendSuccess(res, updated, 'Client subscription updated successfully');
    } catch (err) { next(err); }
  }
};

module.exports = superadminController;
