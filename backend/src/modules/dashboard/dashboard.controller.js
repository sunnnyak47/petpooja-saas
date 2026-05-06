/**
 * @fileoverview Dashboard controller — aggregated summary for mobile app / head-office.
 * @module modules/dashboard/dashboard.controller
 */

const { getDbClient } = require('../../config/database');
const { sendSuccess } = require('../../utils/response');

/** GET /api/dashboard/summary */
async function getSummary(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const prisma = getDbClient();

    // Date window — today in the server timezone
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Base where clause scoped to outlet + today
    const baseWhere = {
      outlet_id: outletId,
      is_deleted: false,
      created_at: { gte: todayStart, lte: todayEnd },
    };

    // Run aggregations in parallel
    const [revenueAgg, statusGroups, topItemsRaw, allTodayOrders] = await Promise.all([
      // Total revenue (paid orders only)
      prisma.order.aggregate({
        where: { ...baseWhere, is_paid: true },
        _sum: { grand_total: true },
        _count: { id: true },
      }),

      // Order counts grouped by status
      prisma.order.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Top 5 menu items by quantity sold today
      prisma.orderItem.groupBy({
        by: ['menu_item_id'],
        where: {
          order: {
            outlet_id: outletId,
            is_deleted: false,
            created_at: { gte: todayStart, lte: todayEnd },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),

      // Hourly breakdown — fetch all orders with grand_total for the day
      prisma.order.findMany({
        where: { ...baseWhere, is_paid: true },
        select: { grand_total: true, created_at: true },
      }),
    ]);

    // Build status map
    const statusMap = {};
    statusGroups.forEach(({ status, _count }) => {
      statusMap[status] = _count.id;
    });

    // Build hourly breakdown (0-23)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
    allTodayOrders.forEach(({ grand_total, created_at }) => {
      const h = new Date(created_at).getHours();
      hourly[h].revenue += Number(grand_total);
      hourly[h].orders += 1;
    });

    // Resolve top item names from menu_item_id (best-effort — skip if DB call fails)
    let topItems = topItemsRaw.map((r) => ({
      menu_item_id: r.menu_item_id,
      quantity_sold: Number(r._sum.quantity) || 0,
      name: null,
    }));
    try {
      const ids = topItemsRaw.map((r) => r.menu_item_id).filter(Boolean);
      if (ids.length) {
        const menuItems = await prisma.menuItem.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        const nameMap = {};
        menuItems.forEach((m) => { nameMap[m.id] = m.name; });
        topItems = topItems.map((t) => ({ ...t, name: nameMap[t.menu_item_id] || 'Unknown' }));
      }
    } catch (_) { /* non-fatal */ }

    const totalOrders = statusGroups.reduce((acc, s) => acc + s._count.id, 0);
    const totalRevenue = Number(revenueAgg._sum.grand_total) || 0;
    const paidOrders = revenueAgg._count.id || 0;

    const summary = {
      date: todayStart.toISOString().split('T')[0],
      revenue: {
        total: totalRevenue,
        currency: 'INR',
        paid_orders: paidOrders,
      },
      orders: {
        total: totalOrders,
        by_status: statusMap,
      },
      top_items: topItems,
      hourly_breakdown: hourly,
    };

    // If the DB returned nothing (empty restaurant), supplement with mock values
    // so the mobile app always renders something useful.
    if (totalOrders === 0) {
      summary._note = 'No orders today — showing mock data for preview';
      summary.revenue.total = 0;
      summary.orders.by_status = {
        created: 0, confirmed: 0, preparing: 0, ready: 0, served: 0, paid: 0, cancelled: 0,
      };
    }

    sendSuccess(res, summary, 'Dashboard summary retrieved');
  } catch (error) {
    next(error);
  }
}

module.exports = { getSummary };
