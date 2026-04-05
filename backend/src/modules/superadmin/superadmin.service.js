const prisma = require('../../config/database').getDbClient();
const jwt = require('jsonwebtoken');
const { appConfig } = require('../../config/app');

/**
 * SuperAdmin Service
 * Handles platform-wide operations for the SaaS Owner
 */
const superadminService = {
  /**
   * Get Platform Overview Stats
   */
  async getStats() {
    const [totalHo, activeHo, trialHo, expiredHo] = await Promise.all([
      prisma.headOffice.count({ where: { is_deleted: false } }),
      prisma.headOffice.count({ where: { is_deleted: false, is_active: true } }),
      prisma.headOffice.count({ where: { is_deleted: false, plan: 'TRIAL' } }),
      prisma.headOffice.count({ where: { is_deleted: false, is_active: false } }),
    ]);

    // Sum overall revenue (This is a mock for now, would sum payment table in real life)
    const totalRevenue = await prisma.order.aggregate({
      _sum: { total_amount: true },
      where: { status: 'COMPLETED' }
    });

    return {
      restaurants: {
        total: totalHo,
        active: activeHo,
        trial: trialHo,
        expired: expiredHo
      },
      revenue: {
        mrr: (activeHo * 999), // Mock MRR
        total: totalRevenue._sum.total_amount || 0
      },
      health: {
        api: 'online',
        database: 'healthy',
        redis: 'connected'
      }
    };
  },

  /**
   * List All Restaurant Chains (Clients)
   */
  async listChains(filters = {}) {
    const { status, plan, city } = filters;
    let where = { is_deleted: false };

    if (status === 'active') where.is_active = true;
    if (status === 'expired') where.is_active = false;
    if (plan) where.plan = plan;
    
    return await prisma.headOffice.findMany({
      where,
      include: {
        _count: { select: { outlets: true } },
        users: {
            where: { is_deleted: false },
            take: 1,
            select: { full_name: true, phone: true, email: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  },

  /**
   * Generates an impersonation token to login as a restaurant
   */
  async impersonate(head_office_id) {
    const user = await prisma.user.findFirst({
        where: { head_office_id, is_deleted: false },
        include: {
            user_roles: {
                include: { role: true, outlet: true }
            },
            head_office: true
        }
    });

    if (!user) throw new Error('No user found for this chain');

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: 'owner', // Impersonate as owner
      head_office_id: user.head_office_id,
      primary_color: user.head_office.primary_color,
      impersonated: true, // Flag for UI
    };

    const token = jwt.sign(tokenPayload, appConfig.jwt.secret, { expiresIn: '15m' });
    return { token, user };
  },

  /**
   * Update Subscription License
   */
  async updateLicense(id, data) {
    const { plan, is_active, trial_ends_at } = data;
    return await prisma.headOffice.update({
        where: { id },
        data: { plan, is_active, trial_ends_at }
    });
  }
};

module.exports = superadminService;
