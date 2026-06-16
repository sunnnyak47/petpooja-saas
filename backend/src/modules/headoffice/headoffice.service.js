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
 * @param {object} [ctx] - Tenant scoping context
 * @param {string|null} [ctx.headOfficeId] - Caller's head office (tenant) ID
 * @param {boolean} [ctx.isSuperAdmin] - Whether caller is a super_admin (global view)
 * @returns {Promise<object[]>} Outlets with today's revenue
 */
async function listOutlets(userId, { headOfficeId = null, isSuperAdmin = false } = {}) {
  const prisma = getDbClient();
  try {
    const userRoles = await prisma.userRole.findMany({
      where: { user_id: userId, is_deleted: false },
      include: { role: true },
    });

    const isOwnerOrAdmin = isSuperAdmin || userRoles.some((ur) =>
      ['super_admin', 'owner'].includes(ur.role.name)
    );

    let outlets;
    if (isSuperAdmin) {
      // Super admin: global view across all tenants
      outlets = await prisma.outlet.findMany({
        where: { is_deleted: false },
        orderBy: { name: 'asc' },
      });
    } else if (isOwnerOrAdmin) {
      // Owner/admin: scoped to their own head office (tenant)
      if (!headOfficeId) throw new ForbiddenError('No head office linked to this account');
      outlets = await prisma.outlet.findMany({
        where: { head_office_id: headOfficeId, is_deleted: false },
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
 * Gets consolidated dashboard across outlets.
 * @param {object} [ctx] - Tenant scoping context
 * @param {string|null} [ctx.headOfficeId] - Caller's head office (tenant) ID
 * @param {boolean} [ctx.isSuperAdmin] - Whether caller is a super_admin (global view)
 * @returns {Promise<object>} Enterprise-level KPIs
 */
async function getEnterpriseDashboard({ headOfficeId = null, isSuperAdmin = false } = {}) {
  const prisma = getDbClient();
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Tenant scoping: super_admin sees global; everyone else is restricted to
    // their own head office's outlets/customers.
    if (!isSuperAdmin && !headOfficeId) {
      throw new ForbiddenError('No head office linked to this account');
    }
    const outletWhere = isSuperAdmin ? { is_deleted: false } : { head_office_id: headOfficeId, is_deleted: false };
    // Order/customer tables are scoped via the tenant's outlet IDs.
    let orderTenantFilter = {};
    // Customer has no tenant column; it relates to a tenant only via its orders.
    let customerWhere = { is_deleted: false };
    if (!isSuperAdmin) {
      const tenantOutlets = await prisma.outlet.findMany({
        where: { head_office_id: headOfficeId, is_deleted: false },
        select: { id: true },
      });
      const tenantOutletIds = tenantOutlets.map((o) => o.id);
      orderTenantFilter = { outlet_id: { in: tenantOutletIds } };
      // Count only customers who have placed an order at one of this tenant's outlets.
      customerWhere = {
        is_deleted: false,
        orders: { some: { outlet_id: { in: tenantOutletIds }, is_deleted: false } },
      };
    }

    const [
      totalOutlets, activeOutlets,
      todayOrders, todayRevenue,
      yesterdayRevenue, totalCustomers,
    ] = await Promise.all([
      prisma.outlet.count({ where: outletWhere }),
      prisma.outlet.count({ where: { ...outletWhere, is_active: true } }),
      prisma.order.count({ where: { ...orderTenantFilter, created_at: { gte: today, lt: tomorrow }, status: { notIn: ['cancelled', 'voided'] }, is_deleted: false } }),
      prisma.order.aggregate({ where: { ...orderTenantFilter, created_at: { gte: today, lt: tomorrow }, is_paid: true, is_deleted: false }, _sum: { grand_total: true } }),
      prisma.order.aggregate({ where: { ...orderTenantFilter, created_at: { gte: yesterday, lt: today }, is_paid: true, is_deleted: false }, _sum: { grand_total: true } }),
      prisma.customer.count({ where: customerWhere }),
    ]);

    const topOutletRaw = await prisma.order.groupBy({
      by: ['outlet_id'],
      where: { ...orderTenantFilter, created_at: { gte: today, lt: tomorrow }, is_paid: true, is_deleted: false },
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
 * @param {object} [ctx] - Tenant scoping context
 * @param {string|null} [ctx.headOfficeId] - Caller's head office (tenant) ID
 * @param {boolean} [ctx.isSuperAdmin] - Whether caller is a super_admin (global view)
 * @returns {Promise<object[]>} Per-outlet revenue breakdown
 */
async function getOutletComparison(from, to, { headOfficeId = null, isSuperAdmin = false } = {}) {
  const prisma = getDbClient();
  try {
    if (!isSuperAdmin && !headOfficeId) {
      throw new ForbiddenError('No head office linked to this account');
    }
    const outletWhere = isSuperAdmin
      ? { is_deleted: false }
      : { head_office_id: headOfficeId, is_deleted: false };
    const outlets = await prisma.outlet.findMany({ where: outletWhere });

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

    // If no targets specified, push to ALL other outlets in the same head office
    if (!targetOutletIds || targetOutletIds.length === 0) {
      const sourceOutlet = await prisma.outlet.findUnique({
        where: { id: sourceOutletId },
        select: { head_office_id: true },
      });
      if (sourceOutlet?.head_office_id) {
        const allOutlets = await prisma.outlet.findMany({
          where: { head_office_id: sourceOutlet.head_office_id, is_deleted: false, id: { not: sourceOutletId } },
          select: { id: true },
        });
        targetOutletIds = allOutlets.map(o => o.id);
      }
    }

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
    // ── Pre-flight uniqueness checks ──────────────────────────
    if (!data.name?.trim())  throw new Error('Restaurant name is required.');
    if (!data.email?.trim()) throw new Error('Owner email is required.');
    if (!data.phone?.trim()) throw new Error('Phone number is required.');
    if (!data.password)      throw new Error('Password is required.');

    const [existingEmail, existingPhone, existingHO] = await Promise.all([
      prisma.user.findUnique({ where: { email: data.email } }),
      prisma.user.findUnique({ where: { phone: data.phone } }),
      prisma.headOffice.findUnique({ where: { contact_email: data.email } }),
    ]);
    if (existingEmail) throw new Error('A user with this email already exists.');
    if (existingPhone) throw new Error('A user with this phone number already exists. Use a different phone.');
    if (existingHO)    throw new Error('A restaurant chain with this email already exists.');

    const passwordHash = await bcrypt.hash(data.password, 12);
    const ownerRole = await prisma.role.findFirst({ where: { name: 'owner' } });
    if (!ownerRole) throw new Error('System configuration error: owner role not found.');

    // Region defaults
    const region = data.region || 'IN';
    const regionDefaults = region === 'AU'
      ? { region: 'AU', currency: 'AUD', timezone: 'Australia/Sydney', country_code: 'AU', regulations_profile: 'AUSTRALIA' }
      : { region: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',     country_code: 'IN', regulations_profile: 'INDIA' };

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Head Office
      const ho = await tx.headOffice.create({
        data: {
          name: data.name,
          contact_email: data.email,
          contact_phone: data.phone,
          legal_name: data.name,
          region:        regionDefaults.region,
          currency:      regionDefaults.currency,
          timezone:      regionDefaults.timezone,
          // Persist these too — the order tax engine keys off country_code/gst_inclusive.
          // Omitting them left AU chains with country_code=null + gst_inclusive=false, so
          // the POS billed GST on top of already-inclusive AU prices.
          country_code:  regionDefaults.country_code,
          gst_inclusive: regionDefaults.region === 'AU',
          ...(data.abn ? { abn: data.abn } : {}),
          ...(data.acn ? { acn: data.acn } : {}),
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

      // 4. Create First Outlet (region-aware defaults)
      const outletCode = data.name.substring(0, 3).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
      const outlet = await tx.outlet.create({
        data: {
          head_office_id: ho.id,
          name: `${data.name} - Flagship`,
          code: outletCode,
          city: data.city || (region === 'AU' ? 'Sydney' : 'Mumbai'),
          country: region === 'AU' ? 'Australia' : 'India',
          currency: regionDefaults.currency,
          timezone: regionDefaults.timezone,
          owner_id: user.id,
        },
        select: { id: true, name: true, code: true }, // Explicit select guards against schema-drift P2022 errors
      });

      // 5. Assign Owner Role
      await tx.userRole.create({
        data: {
          user_id: user.id,
          role_id: ownerRole.id,
          outlet_id: outlet.id,
          is_primary: true,
        }
      });

      return { ho, user, outlet };
    });

    logger.info('New restaurant registered', { chain: data.name, hoId: result.ho.id, region });
    return result;
  } catch (error) {
    // Re-map Prisma unique constraint errors to friendly messages
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      if (field.includes('email'))   throw new Error('A user with this email already exists.');
      if (field.includes('phone'))   throw new Error('A user with this phone number already exists. Use a different phone.');
      if (field.includes('contact')) throw new Error('A restaurant with this contact email already exists.');
      throw new Error(`Duplicate value for ${field}. Please use a different value.`);
    }
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

/**
 * Gets a single outlet by ID with tax configs and settings.
 * @param {string} outletId - UUID of the outlet
 * @param {object} [ctx] - Tenant scoping context
 * @param {string|null} [ctx.headOfficeId] - Caller's head office (tenant) ID
 * @param {boolean} [ctx.isSuperAdmin] - Whether caller is a super_admin (global view)
 * @returns {Promise<object>} Outlet details with tax config and settings
 */
async function getOutletById(outletId, { headOfficeId = null, isSuperAdmin = false } = {}) {
  const prisma = getDbClient();
  try {
    const outlet = await prisma.outlet.findUnique({
      where: { id: outletId, is_deleted: false },
      include: {
        outlet_settings: { where: { is_deleted: false } },
        tax_configs: { where: { is_deleted: false, is_active: true } },
      },
    });

    if (!outlet) throw new NotFoundError('Outlet not found');

    // Tenant isolation: a non-super_admin caller may only view outlets that
    // belong to their own head office. Treat cross-tenant access as not-found
    // so existence of other tenants' outlets is not leaked.
    if (!isSuperAdmin && outlet.head_office_id !== headOfficeId) {
      throw new NotFoundError('Outlet not found');
    }

    // Extract tax rates from tax_configs
    const cgstConfig = outlet.tax_configs.find(t => t.name?.toLowerCase() === 'cgst');
    const sgstConfig = outlet.tax_configs.find(t => t.name?.toLowerCase() === 'sgst');
    const serviceChargeConfig = outlet.tax_configs.find(t => t.name?.toLowerCase().includes('service'));

    // Count tables from DB
    const tableCount = await prisma.table.count({
      where: { outlet_id: outletId, is_deleted: false },
    }).catch(() => outlet.tables_count || 0);

    // Format opening/closing times
    const formatTime = (dt) => {
      if (!dt) return null;
      const d = new Date(dt);
      const hours = d.getUTCHours();
      const mins = d.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
    };

    return {
      id: outlet.id,
      name: outlet.name,
      code: outlet.code,
      type: outlet.type,
      address_line1: outlet.address_line1,
      address_line2: outlet.address_line2,
      city: outlet.city,
      state: outlet.state,
      pincode: outlet.pincode,
      country: outlet.country,
      phone: outlet.phone,
      email: outlet.email,
      gstin: outlet.gstin,
      fssai_number: outlet.fssai_number,
      timezone: outlet.timezone,
      currency: outlet.currency,
      opening_time: formatTime(outlet.opening_time),
      closing_time: formatTime(outlet.closing_time),
      cgst_rate: cgstConfig ? Number(cgstConfig.rate) : null,
      sgst_rate: sgstConfig ? Number(sgstConfig.rate) : null,
      service_charge_rate: serviceChargeConfig ? Number(serviceChargeConfig.rate) : null,
      table_count: tableCount,
      terminal_count: 0, // No terminal model; placeholder
      is_active: outlet.is_active,
      logo_url: outlet.logo_url,
      settings: outlet.outlet_settings.reduce((acc, s) => {
        acc[s.setting_key] = s.data_type === 'boolean'
          ? s.setting_value === 'true'
          : s.data_type === 'number'
          ? Number(s.setting_value)
          : s.setting_value;
        return acc;
      }, {}),
    };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    logger.error('Get outlet by ID failed', { outletId, error: error.message });
    throw error;
  }
}

module.exports = {
  listOutlets, getEnterpriseDashboard, getOutletComparison,
  syncMenu, createIndent, registerRestaurant, listAllChains, getOutletById,
};
