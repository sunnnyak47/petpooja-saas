/**
 * @fileoverview SuperAdmin — platform announcements and the broadcast center.
 * Both stored as JSON arrays in SystemConfig (preserved as-is). Augments the
 * shared superadminService singleton.
 * @module modules/superadmin/services/announcements.service
 */

const {
  superadminService, prisma, NotFoundError,
} = require('./_shared');

Object.assign(superadminService, {
  // ANNOUNCEMENTS (stored in SystemConfig as JSON array)

  /** Load announcements array from SystemConfig */
  async _loadAnnouncements() {
    const record = await prisma.systemConfig.findUnique({ where: { key: 'platform_announcements' } }).catch(() => null);
    if (!record) return [];
    try { return JSON.parse(record.value); } catch { return []; }
  },

  /** Save announcements array to SystemConfig */
  async _saveAnnouncements(announcements) {
    await prisma.systemConfig.upsert({
      where: { key: 'platform_announcements' },
      update: { value: JSON.stringify(announcements) },
      create: { key: 'platform_announcements', value: JSON.stringify(announcements) },
    });
  },

  /**
   * Create a new platform announcement
   */
  async createAnnouncement({ title, message, type = 'info', target_chain_ids = [], expires_at, adminId }) {
    const list = await superadminService._loadAnnouncements();
    const { v4: uuidv4 } = require('uuid');
    const announcement = {
      id: uuidv4(),
      title,
      message,
      type,
      target_chain_ids: target_chain_ids || [],
      expires_at: expires_at || null,
      created_at: new Date().toISOString(),
      created_by: adminId || 'sa_root',
      is_active: true,
    };
    list.push(announcement);
    await superadminService._saveAnnouncements(list);
    return announcement;
  },

  /** Get all announcements */
  async getAnnouncements() {
    return superadminService._loadAnnouncements();
  },

  /** Update an announcement by id */
  async updateAnnouncement(id, data) {
    const list = await superadminService._loadAnnouncements();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) throw new NotFoundError('Announcement not found');
    list[idx] = { ...list[idx], ...data, id };
    await superadminService._saveAnnouncements(list);
    return list[idx];
  },

  /** Delete an announcement by id */
  async deleteAnnouncement(id) {
    const list = await superadminService._loadAnnouncements();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) throw new NotFoundError('Announcement not found');
    list.splice(idx, 1);
    await superadminService._saveAnnouncements(list);
    return { deleted: true };
  },

  /** Get active announcements relevant to a specific chain */
  async getActiveAnnouncementsForChain(headOfficeId) {
    const list = await superadminService._loadAnnouncements();
    const now = new Date();
    return list.filter(a => {
      if (!a.is_active) return false;
      if (a.expires_at && new Date(a.expires_at) < now) return false;
      if (!a.target_chain_ids || a.target_chain_ids.length === 0) return true;
      return a.target_chain_ids.includes(headOfficeId);
    });
  },

  // BROADCAST CENTER
  BROADCASTS_KEY: 'broadcast_history',

  async _loadBroadcasts() {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: superadminService.BROADCASTS_KEY } });
    if (!cfg) return [];
    try { return JSON.parse(cfg.value); } catch { return []; }
  },

  async getBroadcasts() {
    const list = await superadminService._loadBroadcasts();
    return list.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  },

  async sendBroadcast({ title, body, type, target, sent_by }) {
    const broadcasts = await superadminService._loadBroadcasts();

    // Count recipients
    const where = { is_deleted: false, is_active: true };
    if (target !== 'ALL') where.plan = target;
    const recipientCount = await prisma.headOffice.count({ where });

    const broadcast = {
      id: `BRD-${Date.now().toString(36).toUpperCase()}`,
      title, body, type, target, sent_by,
      sent_at: new Date().toISOString(),
      recipient_count: recipientCount,
      status: 'SENT',
    };

    // Also create a platform-wide announcement for the chains
    await superadminService.createAnnouncement({
      title,
      message: body,
      type: type === 'MAINTENANCE' ? 'warning' : type === 'PROMO' ? 'success' : 'info',
      target_audience: target === 'ALL' ? 'all' : 'custom',
      target_plans: target !== 'ALL' ? [target] : [],
      published: true,
      expires_at: null,
    }).catch(() => null);

    await prisma.systemConfig.upsert({
      where: { key: superadminService.BROADCASTS_KEY },
      update: { value: JSON.stringify([broadcast, ...broadcasts]) },
      create: { key: superadminService.BROADCASTS_KEY, value: JSON.stringify([broadcast, ...broadcasts]) },
    });
    return broadcast;
  },
});

module.exports = superadminService;
