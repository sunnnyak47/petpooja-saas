/**
 * @fileoverview Head Office service — multi-outlet management, central kitchen, enterprise reports.
 * @module modules/headoffice/headoffice.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * Lists all outlets for an owner with summary KPIs.
 * @param {string} userId - Owner user ID
 * @returns {Promise<object[]>} Outlets with today's revenue
 */
async function listOutlets(userId) {
  const prisma = getDbClient();
  try {
    const userRoles = await prisma.userRole.findMany({
      where: { user_id: userId, is_deleted: false },
      include: { role: true },
    });

    const isOwnerOrAdmin = userRoles.some((ur) =>
      ['super_admin', 'owner'].includes(ur.role.name)
    );

    let outlets;
    if (isOwnerOrAdmin) {
      outlets = await prisma.outlet.findMany({
        where: { is_deleted: false },
        orderBy: { name: 'asc' },
      });
    } else {
      const outletIds = userRoles.map((ur) => ur.outlet_id).filter(Boolean);
      outlets = await prisma.outlet.findMany({
        where: { id: { in: outletIds }, is_deleted: false },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const enriched = await Promise.all(
      outlets.map(async (outlet) => {
        const [orderCount, revenue, activeOrders] = await Promise.all([
          prisma.order.count({
            where: { outlet_id: outlet.id, created_at: { gte: today, lt: tomorrow }, status: { notIn: ['cancelled', 'voided'] }, is_deleted: false },
          }),
          prisma.order.aggregate({
            where: { outlet_id: outlet.id, created_at: { gte: today, lt: tomorrow }, is_paid: true, is_deleted: false },
            _sum: { grand_total: true },
          }),
          prisma.order.count({
            where: { outlet_id: outlet.id, is_paid: false, status: { notIn: ['cancelled', 'voided', 'paid'] }, is_deleted: false },
          }),
        ]);

        return {
          ...outlet,
          today_orders: orderCount,
          today_revenue: Number(revenue._sum.grand_total || 0),
          active_orders: activeOrders,
        };
      })
    );

    return enriched;
  } catch (error) {
    logger.error('List outlets failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets consolidated dashboard across ALL outlets.
 * @returns {Promise<object>} Enterprise-level KPIs
 */
async function getEnterpriseDashboard() {
  const prisma = getDbClient();
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [
      totalOutlets, activeOutlets,
      todayOrders, todayRevenue,
      yesterdayRevenue, totalCustomers,
    ] = await Promise.all([
      prisma.outlet.count({ where: { is_deleted: false } }),
      prisma.outlet.count({ where: { is_deleted: false, is_active: true } }),
      prisma.order.count({ where: { created_at: { gte: today, lt: tomorrow }, status: { notIn: ['cancelled', 'voided'] }, is_deleted: false } }),
      prisma.order.aggregate({ where: { created_at: { gte: today, lt: tomorrow }, is_paid: true, is_deleted: false }, _sum: { grand_total: true } }),
      prisma.order.aggregate({ where: { created_at: { gte: yesterday, lt: today }, is_paid: true, is_deleted: false }, _sum: { grand_total: true } }),
      prisma.customer.count({ where: { is_deleted: false } }),
    ]);

    const topOutletRaw = await prisma.order.groupBy({
      by: ['outlet_id'],
      where: { created_at: { gte: today, lt: tomorrow }, is_paid: true, is_deleted: false },
      _sum: { grand_total: true },
      orderBy: { _sum: { grand_total: 'desc' } },
      take: 1
    });

    let topOutlet = null;
    if (topOutletRaw.length > 0) {
      const outlet = await prisma.outlet.findUnique({ where: { id: topOutletRaw[0].outlet_id } });
      topOutlet = { name: outlet?.name || 'Unknown', revenue: Number(topOutletRaw[0]._sum.grand_total) };
    }

    const todayRev = Number(todayRevenue._sum.grand_total || 0);
    const yesterdayRev = Number(yesterdayRevenue._sum.grand_total || 0);

    return {
      outlets: { total: totalOutlets, active: activeOutlets },
      today: {
        orders: todayOrders,
        revenue: todayRev,
        growth_pct: yesterdayRev > 0 ? Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 10000) / 100 : 0,
      },
      yesterday_revenue: yesterdayRev,
      total_customers: totalCustomers,
      total_wastage: 0, // Need to implement with cost mappings
      top_outlet: topOutlet
    };
  } catch (error) {
    logger.error('Enterprise dashboard failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets outlet-wise revenue comparison for a date range.
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<object[]>} Per-outlet revenue breakdown
 */
async function getOutletComparison(from, to) {
  const prisma = getDbClient();
  try {
    const outlets = await prisma.outlet.findMany({ where: { is_deleted: false } });

    const comparison = await Promise.all(
      outlets.map(async (outlet) => {
        const result = await prisma.order.aggregate({
          where: {
            outlet_id: outlet.id,
            created_at: { gte: new Date(from), lte: new Date(to) },
            is_paid: true, is_deleted: false,
          },
          _sum: { grand_total: true, total_tax: true },
          _count: { id: true },
        });

        return {
          outlet_id: outlet.id,
          outlet_name: outlet.name,
          outlet_code: outlet.code,
          city: outlet.city,
          total_orders: result._count.id || 0,
          total_revenue: Number(result._sum.grand_total || 0),
          total_tax: Number(result._sum.total_tax || 0),
          avg_order_value: result._count.id > 0
            ? Math.round((Number(result._sum.grand_total || 0) / result._count.id) * 100) / 100
            : 0,
        };
      })
    );

    return comparison.sort((a, b) => b.total_revenue - a.total_revenue);
  } catch (error) {
    logger.error('Outlet comparison failed', { error: error.message });
    throw error;
  }
}

/**
 * Pushes a menu update from HO to specific outlets (menu sync).
 * @param {string} sourceOutletId - Source outlet to copy from
 * @param {string[]} targetOutletIds - Target outlets
 * @param {object} options - { categories: boolean, items: boolean, prices: boolean }
 * @returns {Promise<{synced: number}>}
 */
async function syncMenu(sourceOutletId, targetOutletIds, options = {}) {
  const prisma = getDbClient();
  const io = require('../../socket/index').getIO();

  try {
    const sourceItems = await prisma.menuItem.findMany({
      where: { outlet_id: sourceOutletId, is_deleted: false },
      include: { category: true, variants: { where: { is_deleted: false } } },
    });

    let synced = 0;

    for (const targetId of targetOutletIds) {
      for (const item of sourceItems) {
        const existing = await prisma.menuItem.findFirst({
          where: { outlet_id: targetId, name: item.name, is_deleted: false },
        });

        if (existing) {
          if (options.prices) {
            await prisma.menuItem.update({
              where: { id: existing.id },
              data: { base_price: item.base_price, gst_rate: item.gst_rate },
            });
          }
        } else {
          let targetCategory = await prisma.menuCategory.findFirst({
            where: { outlet_id: targetId, name: item.category.name, is_deleted: false },
          });

          if (!targetCategory) {
            targetCategory = await prisma.menuCategory.create({
              data: { outlet_id: targetId, name: item.category.name, display_order: item.category.display_order },
            });
          }

          await prisma.menuItem.create({
            data: {
              outlet_id: targetId, category_id: targetCategory.id,
              name: item.name, description: item.description,
              base_price: item.base_price, food_type: item.food_type,
              kitchen_station: item.kitchen_station, gst_rate: item.gst_rate,
              hsn_code: item.hsn_code, preparation_time_min: item.preparation_time_min,
            },
          });
        }
        synced++;
      }

      if (io) {
        io.of('/orders').to(`outlet:${targetId}`).emit('menu_updated', {
          source: sourceOutletId, synced_at: new Date(),
        });
      }
    }

    logger.info('Menu sync completed', { source: sourceOutletId, targets: targetOutletIds.length, synced });
    return { synced };
  } catch (error) {
    logger.error('Menu sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Creates a central kitchen indent (request from outlet to CK).
 * @param {object} data - { outlet_id, items: [{inventory_item_id, quantity, unit}] }
 * @returns {Promise<object>}
 */
async function createIndent(data) {
  const prisma = getDbClient();
  try {
    const indent = await prisma.centralKitchenIndent.create({
      data: {
        outlet_id: data.outlet_id,
        indent_number: `IND-${Date.now().toString(36).toUpperCase()}`,
        status: 'pending',
        items: {
          create: data.items.map((item) => ({
            inventory_item_id: item.inventory_item_id,
            requested_quantity: item.quantity,
            unit: item.unit,
          })),
        },
      },
      include: { items: { include: { inventory_item: true } } },
    });
    return indent;
  } catch (error) {
    logger.error('Create indent failed', { error: error.message });
    throw error;
  }
}

/**
 * Registers a new restaurant chain (SaaS Onboarding).
 * Creates Head Office, Primary User, First Outlet, and Trial Subscription.
 * @param {object} data - { name, email, phone, password, address, city }
 * @returns {Promise<object>}
 */
async function registerRestaurant(data) {
  const prisma = getDbClient();
  const bcrypt = require('bcrypt');

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      throw new Error('A user with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const ownerRole = await prisma.role.findFirst({ where: { name: 'owner' } });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Head Office
      const ho = await tx.headOffice.create({
        data: {
          name: data.name,
          contact_email: data.email,
          contact_phone: data.phone,
          legal_name: data.name,
        }
      });

      // 2. Create Primary User (Owner)
      const user = await tx.user.create({
        data: {
          head_office_id: ho.id,
          full_name: data.full_name || data.name,
          email: data.email,
          phone: data.phone,
          password_hash: passwordHash,
        }
      });

      // 3. Create Subscription (Trial)
      await tx.subscription.create({
        data: {
          head_office_id: ho.id,
          plan_name: 'Trial',
          amount: 0,
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        }
      });

      // 4. Create First Outlet
      const outletCode = data.name.substring(0, 3).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
      const outlet = await tx.outlet.create({
        data: {
          head_office_id: ho.id,
          name: `${data.name} - Flagship`,
          code: outletCode,
          city: data.city || 'Mumbai',
          owner_id: user.id
        }
      });

      // 5. Assign Owner Role
      await tx.userRole.create({
        data: {
          user_id: user.id,
          role_id: ownerRole.id,
          outlet_id: outlet.id,
          is_primary: true
        }
      });

      return { ho, user, outlet };
    });

    logger.info('New restaurant registered', { chain: data.name, hoId: result.ho.id });
    return result;
  } catch (error) {
    logger.error('Restaurant registration failed', { error: error.message });
    throw error;
  }
}

async function listAllChains() {
  const prisma = getDbClient();
  return await prisma.headOffice.findMany({
    where: { is_deleted: false },
    include: {
      subscriptions: true,
      _count: { select: { outlets: true, users: true } }
    }
  });
}

module.exports = {
  listOutlets, getEnterpriseDashboard, getOutletComparison,
  syncMenu, createIndent, registerRestaurant, listAllChains,
};
