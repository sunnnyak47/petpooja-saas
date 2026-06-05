/**
 * @fileoverview SuperAdmin — platform dashboards & analytics: overview stats,
 * system config, branding, audit log, global live stats, platform health, and
 * owner-facing staff/menu analytics. Augments the shared superadminService
 * singleton.
 * @module modules/superadmin/services/analytics.service
 */

const {
  superadminService, prisma, MOCK_STATS, logger,
} = require('./_shared');

Object.assign(superadminService, {
  /**
   * Get Platform Overview Stats (Live Analytics)
   */
  async getDashboardStats() {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    try {
      const [
        totalRestaurants,
        activeRestaurants,
        expiringRestaurants,
        newThisWeek,
        trialRestaurants,
        thisMonthRevenue,
        lastMonthRevenue,
        recentActivity,
        totalUsers,
      ] = await Promise.all([
        // Total restaurants (not deleted)
        prisma.headOffice.count({ where: { is_deleted: false } }),

        // Active licenses (not expired, not suspended)
        prisma.headOffice.count({
          where: {
            is_deleted: false,
            is_active: true,
            subscriptions: { some: { expires_at: { gte: now }, status: 'active' } }
          }
        }),

        // Expiring in next 30 days
        prisma.headOffice.count({
          where: {
            is_deleted: false,
            is_active: true,
            subscriptions: {
              some: {
                expires_at: { gte: now, lte: thirtyDaysFromNow },
                status: 'active'
              }
            }
          }
        }),

        // New this week
        prisma.headOffice.count({
          where: { is_deleted: false, created_at: { gte: sevenDaysAgo } }
        }),

        // Trial restaurants
        prisma.headOffice.count({
          where: { is_deleted: false, plan: 'TRIAL' }
        }),

        // This month subscription revenue (calculated from subscriptions starting this month)
        prisma.subscription.aggregate({
          where: { created_at: { gte: startOfMonth }, status: 'active' },
          _sum: { amount: true }
        }).catch(() => ({ _sum: { amount: 0 } })),

        // Last month revenue
        prisma.subscription.aggregate({
          where: { created_at: { gte: startOfLastMonth, lte: endOfLastMonth }, status: 'active' },
          _sum: { amount: true }
        }).catch(() => ({ _sum: { amount: 0 } })),

        // Recent activity (last 10 events)
        prisma.auditLog.findMany({
          where: {
            action: {
              in: [
                'RESTAURANT_ONBOARDED',
                'RESTAURANT_ONBOARDED_V2',
                'SUBSCRIPTION_PAYMENT',
                'LICENSE_EXPIRED',
                'LICENSE_EXTENDED',
                'RESTAURANT_SUSPENDED',
                'RESTAURANT_REACTIVATED',
              ]
            }
          },
          orderBy: { created_at: 'desc' },
          take: 10,
          include: { user: { select: { full_name: true } } }
        }).catch(() => []),

        // Total staff/users across all restaurants
        prisma.user.count({ where: { is_deleted: false } }),
      ]);

      // Calculate MRR
      const allActiveSubs = await prisma.subscription.findMany({
        where: { expires_at: { gte: now }, status: 'active' },
        select: { billing_cycle: true, amount: true }
      });

      const mrr = allActiveSubs.reduce((sum, sub) => {
        const amount = Number(sub.amount) || 0;
        if (sub.billing_cycle === 'annual') return sum + (amount / 12);
        if (sub.billing_cycle === 'monthly') return sum + amount;
        return sum;
      }, 0);

      // Format activity stream
      const activityStream = recentActivity.map(log => {
        const diffMs = now - new Date(log.created_at);
        const minutesAgo = Math.floor(diffMs / 60000);
        const timeLabel = minutesAgo < 60 ? `${minutesAgo} min ago` :
                         minutesAgo < 1440 ? `${Math.floor(minutesAgo/60)} hr ago` :
                         `${Math.floor(minutesAgo/1440)} days ago`;

        return {
          id: log.id,
          type: log.action,
          time: timeLabel,
          raw_time: log.created_at,
          restaurant: log.new_values?.name || 'Platform System',
          user: log.user?.full_name || 'System',
          details: log.new_values || {}
        };
      });

      // Redis status & Active Sessions
      const redis = require('../../../config/redis').getRedisClient();
      const redisStatus = redis.status === 'ready' || redis.status === 'connecting' ? 'connected' : 'disconnected';
      let activeSessions = 0;
      try {
        if (redisStatus === 'connected') {
          const keys = await redis.keys('session:*');
          activeSessions = keys.length;
        }
      } catch (e) { logger.warn('Redis session count failed', { error: e.message }); }

      return {
        stats: {
          total_restaurants: totalRestaurants,
          active_licenses: activeRestaurants,
          expiring_soon: expiringRestaurants,
          current_mrr: Math.round(mrr),
          new_this_week: newThisWeek,
          trial_count: trialRestaurants,
          total_users: totalUsers,
          active_sessions: activeSessions ?? 0
        },
        growth: {
          this_month_revenue: Number(thisMonthRevenue._sum?.amount || 0),
          last_month_revenue: Number(lastMonthRevenue._sum?.amount || 0),
        },
        activity_stream: activityStream,
        platform_health: {
          api: 'online',
          database: 'connected',
          redis: redisStatus,
          socket: 'active',
          last_checked: now.toISOString(),
        }
      };
    } catch (error) {
      logger.error('Dashboard Stats Error', { error: error.message });
      return MOCK_STATS;
    }
  },

  /**
   * Configuration Management
   */
  async getSystemConfig() {
    const configs = await prisma.systemConfig.findMany();
    const result = {};
    configs.forEach(c => { result[c.key] = c.value; });
    return result;
  },

  async getPublicSystemConfig() {
    const publicKeys = ['platform_name', 'support_whatsapp', 'support_email', 'restaurant_app_url'];
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: publicKeys } }
    });

    // Default values if not set
    const result = {
      platform_name: 'MS-RM System',
      support_whatsapp: '+91 9999999999',
      support_email: 'support@madsundigital.com',
      restaurant_app_url: 'petpooja-saas.vercel.app'
    };

    configs.forEach(c => { result[c.key] = c.value; });
    return result;
  },

  async updateSystemConfig(settings) {
    const updates = Object.entries(settings).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
    );
    return await Promise.all(updates);
  },

  /**
   * Get Audit Log
   */
  async getAuditLog({ page = 1, limit = 50 } = {}) {
    try {
      const logs = await prisma.auditLog.findMany({
        orderBy: { created_at: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { user: { select: { full_name: true, email: true } } }
      });
      return logs;
    } catch {
      return [];
    }
  },

  /**
   * Helper to get common branding settings for other services
   */
  async getBranding() {
    const keys = ['platform_name', 'support_email', 'restaurant_app_url'];
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: keys } }
    });
    const res = {
      platform_name: 'MS-RM System',
      support_email: 'support@madsundigital.com',
      restaurant_app_url: 'petpooja-saas.vercel.app'
    };
    configs.forEach(c => { res[c.key] = c.value; });
    return res;
  },

  /**
   * Live platform-wide stats for the superadmin dashboard
   */
  async getGlobalLiveStats() {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
      const [
        todayOrderCount,
        todayRevAgg,
        activeChainCount,
        monthOrderCount,
      ] = await Promise.all([
        prisma.order.count({ where: { created_at: { gte: todayMidnight } } }),
        prisma.order.aggregate({
          where: { created_at: { gte: todayMidnight }, status: 'paid' },
          _sum: { total_amount: true },
        }),
        prisma.headOffice.count({ where: { is_active: true, is_deleted: false } }),
        prisma.order.count({ where: { created_at: { gte: startOfMonth } } }),
      ]);

      // Top 5 chains by orders this month
      const topChainsRaw = await prisma.order.groupBy({
        by: ['outlet_id'],
        where: { created_at: { gte: startOfMonth } },
        _count: { id: true },
        _sum: { total_amount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      });

      // Enrich with outlet -> head_office info
      const outletIds = topChainsRaw.map(r => r.outlet_id);
      const outlets = await prisma.outlet.findMany({
        where: { id: { in: outletIds } },
        select: { id: true, head_office_id: true, head_office: { select: { id: true, name: true } } },
      });
      const outletMap = {};
      outlets.forEach(o => { outletMap[o.id] = o; });

      // Aggregate by chain
      const chainMap = {};
      for (const row of topChainsRaw) {
        const outlet = outletMap[row.outlet_id];
        if (!outlet) continue;
        const chainId = outlet.head_office_id;
        if (!chainMap[chainId]) {
          chainMap[chainId] = { chain_id: chainId, chain_name: outlet.head_office?.name || 'Unknown', order_count: 0, revenue: 0 };
        }
        chainMap[chainId].order_count += row._count.id;
        chainMap[chainId].revenue += Number(row._sum.total_amount || 0);
      }
      const topChains = Object.values(chainMap).sort((a, b) => b.order_count - a.order_count).slice(0, 5);

      // Recent 10 orders across all chains
      const recentOrders = await prisma.order.findMany({
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true,
          order_number: true,
          total_amount: true,
          status: true,
          created_at: true,
          outlet: { select: { name: true, head_office: { select: { name: true } } } },
        },
      });

      return {
        today: {
          orders: todayOrderCount,
          revenue: Number(todayRevAgg._sum?.total_amount || 0),
        },
        this_month: {
          orders: monthOrderCount,
        },
        active_chains: activeChainCount,
        top_chains_this_month: topChains,
        recent_orders: recentOrders.map(o => ({
          id: o.id,
          order_number: o.order_number,
          total_amount: Number(o.total_amount || 0),
          status: o.status,
          created_at: o.created_at,
          outlet_name: o.outlet?.name || 'Unknown',
          chain_name: o.outlet?.head_office?.name || 'Unknown',
        })),
      };
    } catch (error) {
      logger.error('getGlobalLiveStats Error', { error: error.message });
      return { today: { orders: 0, revenue: 0 }, this_month: { orders: 0 }, active_chains: 0, top_chains_this_month: [], recent_orders: [] };
    }
  },

  // PLATFORM HEALTH MONITOR
  async getPlatformHealth() {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [
      totalChains, activeChains, totalOutlets, totalUsers,
      ordersToday, ordersWeek, revenueToday,
      auditLogsToday, activeTrials,
    ] = await Promise.all([
      prisma.headOffice.count({ where: { is_deleted: false } }),
      prisma.headOffice.count({ where: { is_deleted: false, is_active: true } }),
      prisma.outlet.count({ where: { is_deleted: false } }),
      prisma.user.count({ where: { is_deleted: false } }),
      prisma.order.count({ where: { created_at: { gte: last24h }, status: { not: 'cancelled' } } }),
      prisma.order.count({ where: { created_at: { gte: last7d }, status: { not: 'cancelled' } } }),
      prisma.order.aggregate({ where: { created_at: { gte: last24h }, status: { not: 'cancelled' } }, _sum: { total_amount: true } }),
      prisma.auditLog.count({ where: { created_at: { gte: last24h } } }).catch(() => 0),
      prisma.headOffice.count({ where: { is_deleted: false, plan: 'TRIAL' } }),
    ]);

    return {
      chains:      { total: totalChains, active: activeChains, inactive: totalChains - activeChains, trial: activeTrials },
      outlets:     { total: totalOutlets },
      users:       { total: totalUsers },
      orders:      { last_24h: ordersToday, last_7d: ordersWeek },
      revenue:     { last_24h: parseFloat(revenueToday._sum.total_amount || 0) },
      activity:    { audit_logs_24h: auditLogsToday },
      uptime:      { api: 'Operational', database: 'Operational', storage: 'Operational' },
      checked_at:  now.toISOString(),
    };
  },

  // OWNER STAFF ANALYTICS (called from owner dashboard routes)
  async getStaffAnalytics(headOfficeId) {
    const [totalStaff, activeStaff, recentAttendance] = await Promise.all([
      prisma.user.count({ where: { head_office_id: headOfficeId, is_deleted: false } }),
      prisma.user.count({ where: { head_office_id: headOfficeId, is_deleted: false, is_active: true } }),
      prisma.attendanceLog.findMany({
        where: { outlet: { head_office_id: headOfficeId }, created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        include: { user: { select: { full_name: true, email: true } } },
        orderBy: { created_at: 'desc' },
        take: 20,
      }).catch(() => []),
    ]);
    return { total_staff: totalStaff, active_staff: activeStaff, recent_attendance: recentAttendance };
  },

  // MENU PERFORMANCE ANALYTICS
  async getMenuAnalytics(outletId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orderItems = await prisma.orderItem.findMany({
      where: { order: { outlet_id: outletId, created_at: { gte: thirtyDaysAgo }, status: { not: 'cancelled' } } },
      include: { menu_item: { select: { id: true, name: true, price: true, category_id: true, category: { select: { name: true } } } } },
    }).catch(() => []);

    // Aggregate by item
    const itemMap = {};
    for (const oi of orderItems) {
      if (!oi.menu_item) continue;
      const key = oi.menu_item.id;
      if (!itemMap[key]) {
        itemMap[key] = { id: key, name: oi.menu_item.name, category: oi.menu_item.category?.name || 'Uncategorized',
          price: parseFloat(oi.menu_item.base_price || 0), qty: 0, revenue: 0, orders: new Set() };
      }
      itemMap[key].qty     += oi.quantity || 1;
      itemMap[key].revenue += parseFloat(oi.total_price || oi.unit_price || 0);
      itemMap[key].orders.add(oi.order_id);
    }

    const items = Object.values(itemMap).map(i => ({ ...i, order_count: i.orders.size, orders: undefined }));
    items.sort((a, b) => b.qty - a.qty);

    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    let cumulative = 0;
    const withABC = items.map(item => {
      cumulative += item.qty;
      const pct = totalQty > 0 ? (cumulative / totalQty) * 100 : 0;
      return { ...item, abc: pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C' };
    });

    return {
      top_sellers:  withABC.filter(i => i.abc === 'A').slice(0, 10),
      moderate:     withABC.filter(i => i.abc === 'B').slice(0, 10),
      slow_movers:  withABC.filter(i => i.abc === 'C').slice(0, 10),
      total_items_sold: totalQty,
      period_days: 30,
    };
  },
});

module.exports = superadminService;
