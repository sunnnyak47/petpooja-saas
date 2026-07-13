/**
 * @fileoverview SuperAdmin — chains, onboarding, licensing, impersonation,
 * features, plans, regions, and user listings. Augments the shared
 * superadminService singleton.
 * @module modules/superadmin/services/onboarding.service
 */

const {
  superadminService, prisma, jwt, bcrypt, appConfig, logger,
  UnauthorizedError, NotFoundError, BadRequestError, ConflictError,
} = require('./_shared');
const { isPlatformRole } = require('../platform-rbac');

Object.assign(superadminService, {
  /**
   * Authenticate SuperAdmin by email + password
   * @param {string} email
   * @param {string} password
   */
  async login(email, password) {
    let user = null;

    try {
      user = await prisma.user.findFirst({
        where: {
          // Case-insensitive so login works regardless of stored email casing.
          email: { equals: email.toLowerCase().trim(), mode: 'insensitive' },
          is_deleted: false,
          is_active: true,
        }
      });
    } catch (dbError) {
      logger.warn('DB unreachable during superadmin login', { error: dbError.message });
      throw new UnauthorizedError('Service temporarily unavailable. Try again.');
    }

    // No hardcoded credentials — user must exist in DB.
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedError('Invalid email or password');

    // The user must hold a PLATFORM role (outlet-less). A user may also have
    // tenant roles, so scan their outlet-less role grants for a platform one and
    // collect that role's permissions from the DB (the real, current grant set).
    const platformGrants = await prisma.userRole.findMany({
      where: { user_id: user.id, outlet_id: null, is_deleted: false },
      include: {
        role: {
          include: {
            role_permissions: { where: { is_deleted: false }, include: { permission: true } },
          },
        },
      },
    }).catch(() => []);

    const grant = platformGrants.find((g) => g.role && isPlatformRole(g.role.name));
    if (!grant) {
      throw new UnauthorizedError('Access denied: SuperAdmin console requires a platform role');
    }

    const roleName = grant.role.name;
    const permissions = [...new Set(
      (grant.role.role_permissions || [])
        .map((rp) => rp.permission?.key)
        .filter((k) => typeof k === 'string' && k.startsWith('sa.'))
    )];

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: roleName,
      full_name: user.full_name || 'Super Admin',
      permissions,
    };

    const token = jwt.sign(tokenPayload, appConfig.jwt.secret, { expiresIn: '24h' });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: tokenPayload.full_name,
        role: roleName,
        permissions,
      },
    };
  },

  /**
   * List All Restaurant Chains
   */
  async listChains(filters = {}) {
    try {
      const { status, plan, search, page = 1, limit = 20 } = filters;
      let where = { is_deleted: false };

      if (status === 'active') where.is_active = true;
      if (status === 'expired') where.is_active = false;
      if (status === 'trial') where.plan = 'TRIAL';
      if (plan) where.plan = plan.toUpperCase();
      if (search) where.name = { contains: search, mode: 'insensitive' };

      const [chains, total] = await Promise.all([
        prisma.headOffice.findMany({
          where,
          include: {
            _count: { select: { outlets: true } },
            users: {
              where: { is_deleted: false },
              take: 1,
              select: { full_name: true, phone: true, email: true }
            }
          },
          orderBy: { created_at: 'desc' },
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
        }),
        prisma.headOffice.count({ where })
      ]);

      return { chains, total, page: Number(page), limit: Number(limit) };
    } catch (error) {
      logger.error('listChains Error', { error: error.message });
      return { chains: [], total: 0, page: 1, limit: 20 };
    }
  },

  /**
   * Get single chain detail with usage stats
   */
  async getChainDetail(id) {
    const chain = await prisma.headOffice.findUnique({
      where: { id },
      include: {
        outlets: { where: { is_deleted: false }, include: { _count: { select: { tables: true, menu_items: true } } } },
        users: { where: { is_deleted: false }, select: { full_name: true, phone: true, email: true } }
      }
    });
    if (!chain) throw new NotFoundError('Restaurant not found');

    // Usage stats
    const [orderCount, staffCount] = await Promise.all([
      prisma.order.count({ where: { outlet: { head_office_id: id }, created_at: { gte: new Date(new Date().setDate(1)) } } }).catch(() => 0),
      prisma.user.count({ where: { head_office_id: id, is_deleted: false, is_active: true } }).catch(() => 0),
    ]);

    return { ...chain, usage: { orders_this_month: orderCount, active_staff: staffCount } };
  },

  /**
   * Impersonation token with Audit Logging
   */
  async impersonate(head_office_id, adminId, adminEmail) {
    const user = await prisma.user.findFirst({
      where: { head_office_id, is_deleted: false },
      include: { head_office: true }
    });

    if (!user) throw new NotFoundError('No user found for this chain');

    // AUDIT LOG: Impersonation Start
    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: 'SUPERADMIN_IMPERSONATION',
        entity_type: 'restaurant',
        entity_id: head_office_id,
        new_values: { impersonated_user: user.email }
      }
    }).catch(() => null);

    // Also record to the impersonation audit log consumed by /impersonation-log.
    // Without this, that console's data source stays permanently empty.
    await superadminService.logImpersonation({
      admin_id: (adminId && adminId !== 'sa_root') ? adminId : null,
      admin_email: adminEmail || null,
      target_chain_id: head_office_id,
      target_chain_name: user.head_office?.name || null,
      target_user_id: user.id,
      target_user_email: user.email,
    }).catch(() => null);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'owner', head_office_id: user.head_office_id, impersonated: true },
      appConfig.jwt.secret,
      { expiresIn: '15m' }
    );
    return { token, user };
  },

  /**
   * Reset a chain OWNER's login: set a fresh temporary password AND unlock the
   * account (clear failed attempts + lock). Returns the temp password ONCE so the
   * operator can relay it to the owner. Lets support recover a locked-out client
   * without DB access. Prefers the user holding the 'owner' role for the chain.
   * @param {string} head_office_id
   * @param {string} adminId
   * @param {string} adminEmail
   * @returns {Promise<{owner_email:string, temp_password:string}>}
   */
  async resetOwnerPassword(head_office_id, adminId, adminEmail) {
    const crypto = require('crypto');
    const user =
      (await prisma.user.findFirst({
        where: {
          head_office_id, is_deleted: false,
          user_roles: { some: { is_deleted: false, role: { name: 'owner' } } },
        },
        include: { head_office: true },
      })) ||
      (await prisma.user.findFirst({ where: { head_office_id, is_deleted: false }, include: { head_office: true } }));

    if (!user) throw new NotFoundError('No owner/user found for this chain');

    // Readable temp password — strong enough as a one-time value the owner resets.
    const tempPassword = `Tmp-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`;
    const password_hash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash, failed_login_attempts: 0, locked_until: null, is_active: true },
    });

    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: 'SUPERADMIN_RESET_OWNER_PASSWORD',
        entity_type: 'restaurant',
        entity_id: head_office_id,
        new_values: { reset_for: user.email, by: adminEmail || 'super_admin' },
      },
    }).catch(() => null);

    logger.info('SuperAdmin reset owner password', { head_office_id, owner: user.email, by: adminEmail });
    return { owner_email: user.email, temp_password: tempPassword };
  },

  /**
   * Change the login email of a chain's owner account. Validates format and
   * global uniqueness, then updates the owner user's email and audits the change.
   * @param {string} head_office_id
   * @param {string} newEmail
   * @param {string} adminId   acting SuperAdmin id
   * @param {string} adminEmail
   * @returns {Promise<{old_email:string,new_email:string}>}
   */
  async changeOwnerEmail(head_office_id, newEmail, adminId, adminEmail) {
    const email = String(newEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestError('Please provide a valid email address');
    }

    const user =
      (await prisma.user.findFirst({
        where: {
          head_office_id, is_deleted: false,
          user_roles: { some: { is_deleted: false, role: { name: 'owner' } } },
        },
      })) ||
      (await prisma.user.findFirst({ where: { head_office_id, is_deleted: false } }));

    if (!user) throw new NotFoundError('No owner/user found for this chain');
    if (user.email && user.email.toLowerCase() === email) {
      throw new BadRequestError('That is already the owner’s email');
    }

    // Email is the login identifier — must be globally unique among live users.
    const clash = await prisma.user.findFirst({
      where: { email, is_deleted: false, NOT: { id: user.id } },
      select: { id: true },
    });
    if (clash) throw new ConflictError('Another account already uses that email');

    const oldEmail = user.email;
    await prisma.user.update({ where: { id: user.id }, data: { email } });

    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: 'SUPERADMIN_CHANGE_OWNER_EMAIL',
        entity_type: 'restaurant',
        entity_id: head_office_id,
        old_values: { email: oldEmail },
        new_values: { email, by: adminEmail || 'super_admin' },
      },
    }).catch(() => null);

    logger.info('SuperAdmin changed owner email', { head_office_id, from: oldEmail, to: email, by: adminEmail });
    return { old_email: oldEmail, new_email: email };
  },

  /**
   * Platform-owner audit trail: recent SuperAdmin / chain-level actions (suspend,
   * activate, plan change, region switch, impersonation, owner-password reset),
   * newest first, with the acting user's email and the affected chain name.
   * @param {{limit?:number}} [query]
   * @returns {Promise<object[]>}
   */
  async getPlatformAuditLog(query = {}) {
    const take = Math.min(parseInt(query.limit, 10) || 100, 200);
    const rows = await prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { startsWith: 'SUPERADMIN_' } },
          { action: { in: ['CHAIN_SUSPENDED', 'CHAIN_ACTIVATED', 'PLAN_ASSIGNED', 'REGION_SWITCHED', 'CHAIN_REGION_SWITCHED'] } },
        ],
      },
      orderBy: { created_at: 'desc' },
      take,
      include: { user: { select: { email: true, full_name: true } } },
    });
    const chainIds = [...new Set(rows.map((r) => r.entity_id).filter(Boolean))];
    const chains = chainIds.length
      ? await prisma.headOffice.findMany({ where: { id: { in: chainIds } }, select: { id: true, name: true } })
      : [];
    const cMap = Object.fromEntries(chains.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      created_at: r.created_at,
      actor: r.user?.email || r.user?.full_name || 'super_admin',
      chain: cMap[r.entity_id] || r.entity_id || '—',
      details: r.new_values || null,
    }));
  },

  /**
   * Onboard New Restaurant — Full Transactional Setup
   * Creates HeadOffice, Owner User, Outlet, Role, and Subscription
   */
  async onboardRestaurant(data, adminId) {
    const {
      // Identity & Address
      name, legal_name, type = 'RESTAURANT', cuisine,
      address, city, state, district, pincode, logo_url,
      // Legal & Tax
      gstin, gst_type = 'REGULAR', pan, fssai, fssai_expiry,
      is_ac = false, serves_alcohol = false, service_charge_pct = 0,
      gst_inclusive = false, default_gst_slab = '5',
      // Owner & Login
      owner_name, contact_email, contact_phone, whatsapp_number,
      language = 'en', password,
      // Subscription
      plan = 'TRIAL', payment_status = 'pending', payment_method, utr_reference,
      starts_at = new Date(), expires_at,
      // Setup & Hardware
      tables_count = 0, printer_type = 'THERMAL', printer_ip, bill_header, bill_footer,
      floor_names = [], order_types = ['dine_in', 'takeaway', 'delivery'], operating_hours = {},
      // Integrations
      zomato_id, swiggy_id, razorpay_key, tally_enabled = false
    } = data;

    logger.debug(`[ONBOARD] Attempting to onboard: ${name} (${contact_email})`);

    // 1. Validate Email/Phone uniqueness
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: contact_email }, { phone: contact_phone }],
        is_deleted: false
      }
    });

    if (existingUser) {
      logger.warn(`[ONBOARD] Conflict: User already exists with email ${contact_email} or phone ${contact_phone}`);
      throw new ConflictError('Owner Email or Phone already registered');
    }

    const password_hash = await bcrypt.hash(password, 12);
    logger.debug('[ONBOARD] Validation passed, starting transaction...');

    return await prisma.$transaction(async (tx) => {
      // 2. Create Head Office
      const headOffice = await tx.headOffice.create({
        data: {
          name,
          legal_name: legal_name || name,
          gstin,
          gst_type,
          pan,
          fssai,
          fssai_expiry: fssai_expiry ? new Date(fssai_expiry) : null,
          contact_email,
          contact_phone,
          whatsapp_number: whatsapp_number || contact_phone,
          logo_url,
          is_active: true,
          is_ac,
          serves_alcohol,
          service_charge_pct,
          gst_inclusive,
          default_gst_slab,
          language,
          zomato_id,
          swiggy_id,
          razorpay_key,
          tally_enabled,
          plan: plan.toUpperCase(),
          metadata: {
            floor_names,
            order_types,
            operating_hours
          }
        }
      });
      logger.debug(`[ONBOARD] HeadOffice created: ${headOffice.id}`);

      // 3. Create Owner User
      const user = await tx.user.create({
        data: {
          full_name: owner_name,
          email: contact_email,
          phone: contact_phone,
          password_hash,
          head_office_id: headOffice.id,
          is_active: true
        }
      });
      logger.debug(`[ONBOARD] Owner User created: ${user.id}`);

      // 4. Get/Create Owner Role
      let ownerRole = await tx.role.findFirst({ where: { name: 'owner' } });
      if (!ownerRole) {
          ownerRole = await tx.role.create({
          data: { name: 'owner', display_name: 'Restaurant Owner', is_system: true }
        });
        logger.debug(`[ONBOARD] System 'owner' role created: ${ownerRole.id}`);
      }

      // 5. Create Default Outlet
      const outletCode = `${name.slice(0, 3).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`;
      const outlet = await tx.outlet.create({
        data: {
          head_office_id: headOffice.id,
          name: `${name} - ${city}`,
          code: outletCode,
          type: type.toLowerCase(),
          address_line1: address,
          city,
          state,
          pincode,
          phone: contact_phone,
          email: contact_email,
          gstin,
          is_ac,
          tables_count: Number(tables_count),
          printer_type,
          printer_ip,
          bill_header,
          bill_footer,
          is_active: true,
          metadata: {
            district,
            operating_hours
          }
        }
      });
      logger.debug(`[ONBOARD] Default Outlet created: ${outlet.id} (${outletCode})`);

      // 6. Assign Owner Role to User for this Outlet
      await tx.userRole.create({
        data: {
          user_id: user.id,
          role_id: ownerRole.id,
          outlet_id: outlet.id,
          is_primary: true
        }
      });

      // 7. Initial Settings for 3rd Party Connectors (Wiring to Aggregator/Payment Services)
      const settingsToCreate = [];
      if (zomato_id) settingsToCreate.push({ outlet_id: outlet.id, setting_key: 'zomato_store_id', setting_value: zomato_id });
      if (swiggy_id) settingsToCreate.push({ outlet_id: outlet.id, setting_key: 'swiggy_store_id', setting_value: swiggy_id });
      if (razorpay_key) settingsToCreate.push({ outlet_id: outlet.id, setting_key: 'razorpay_api_key', setting_value: razorpay_key });
      if (tally_enabled) settingsToCreate.push({ outlet_id: outlet.id, setting_key: 'tally_sync_enabled', setting_value: 'true' });

      if (settingsToCreate.length > 0) {
        await tx.outletSetting.createMany({ data: settingsToCreate });
        logger.debug(`[ONBOARD] Wired ${settingsToCreate.length} 3rd party connectors to OutletSetting.`);
      }

      // 8. Create Initial Subscription
      const subExpiry = expires_at ? new Date(expires_at) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await tx.subscription.create({
        data: {
          head_office_id: headOffice.id,
          plan_name: plan,
          status: payment_status === 'paid' ? 'active' : 'trial',
          amount: 0, // In logic, should set based on plans
          starts_at: new Date(starts_at),
          expires_at: subExpiry,
          billing_cycle: 'annual',
        }
      });
      logger.debug(`[ONBOARD] Subscription initialized.`);

      // 8. Audit Log
      await tx.auditLog.create({
        data: {
          user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
          action: 'RESTAURANT_ONBOARDED_V2',
          entity_type: 'restaurant',
          entity_id: headOffice.id,
          new_values: {
            name,
            owner: owner_name,
            email: contact_email,
            version: '2.0',
            fields_count: Object.keys(data).length
          }
        }
      });

      logger.debug(`[ONBOARD] SUCCESS: Restaurant ${name} (Enterprise) is live.`);
      return { headOffice, user, outlet, subscription_expiry: subExpiry };
    });
  },

  /**
   * Update License
   */
  async updateLicense(id, data) {
    const { plan, is_active, trial_ends_at } = data;
    return await prisma.headOffice.update({ where: { id }, data: { plan, is_active, trial_ends_at } });
  },

  /** Return AU and IN region templates */
  async getRegionTemplates() {
    return {
      AU: {
        region: 'AU',
        currency: 'AUD',
        timezone: 'Australia/Sydney',
        country_code: 'AU',
        regulations_profile: 'AUSTRALIA',
        gst_enabled: false,
        default_tax_rate: 0.10,
        language: 'en-AU',
        tax_breakdown: 'GST_ONLY',
        currency_symbol: '$',
        label: 'Australia',
        flag: '🇦🇺',
        compliance_fields: ['abn', 'acn'],
        description: 'Australian franchise — AUD currency, GST-inclusive pricing, Sydney timezone, ABN/ACN compliance',
      },
      IN: {
        region: 'IN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        country_code: 'IN',
        regulations_profile: 'INDIA',
        gst_enabled: true,
        default_tax_rate: 0.05,
        language: 'en-IN',
        tax_breakdown: 'CGST_SGST_IGST',
        currency_symbol: '₹',
        label: 'India',
        flag: '🇮🇳',
        compliance_fields: ['gstin', 'fssai', 'pan'],
        description: 'Indian operations — INR currency, GST filing, Kolkata timezone, FSSAI/GSTIN compliance',
      }
    };
  },

  /** Switch HeadOffice region and update all outlets defaults */
  async switchHeadOfficeRegion(headOfficeId, body) {
    const { region } = body;
    if (!['AU', 'IN'].includes(region)) throw new BadRequestError('Invalid region. Use AU or IN.');

    const templates = await superadminService.getRegionTemplates();
    const tpl = templates[region];

    // Persist ABN/ACN compliance fields. Only write when a value is provided so
    // we never silently wipe an existing ABN/ACN when switching regions. An
    // explicit empty string clears the field; undefined leaves it untouched.
    const data = {
      region: tpl.region,
      currency: tpl.currency,
      timezone: tpl.timezone,
      country_code: tpl.country_code,
      regulations_profile: tpl.regulations_profile,
    };
    if (body.abn !== undefined) data.abn = body.abn === '' ? null : body.abn;
    if (body.acn !== undefined) data.acn = body.acn === '' ? null : body.acn;

    const headOffice = await prisma.headOffice.update({
      where: { id: headOfficeId },
      data,
      include: { outlets: true }
    });

    // Update all outlets under this HeadOffice
    await prisma.outlet.updateMany({
      where: { head_office_id: headOfficeId, is_deleted: false },
      data: {
        currency: tpl.currency,
        timezone: tpl.timezone,
        country: region === 'AU' ? 'Australia' : 'India',
      }
    });

    return {
      head_office: headOffice,
      region_applied: tpl,
      outlets_updated: headOffice.outlets.length,
    };
  },

  /**
   * All platform features that can be toggled per chain.
   * Default: all ON.
   */
  ALL_FEATURES: [
    // Core
    { key: 'pos',             label: 'Point of Sale (POS)',      category: 'Core',       description: 'Take orders and process payments at the counter' },
    { key: 'orders',          label: 'Order History',             category: 'Core',       description: 'View and manage all past orders' },
    { key: 'menu',            label: 'Menu Management',           category: 'Core',       description: 'Add, edit and manage menu items & categories' },
    { key: 'tables',          label: 'Table Management',          category: 'Core',       description: 'Manage dine-in tables and floor layout' },
    { key: 'customers',       label: 'Customer Management',       category: 'Core',       description: 'Customer profiles, history and contact info' },
    { key: 'staff',           label: 'Staff Management',          category: 'Core',       description: 'Manage staff accounts and roles' },
    { key: 'payments',        label: 'Payments',                  category: 'Core',       description: 'Payment methods, UPI, cards and settlements' },
    { key: 'discounts',       label: 'Discounts & Promotions',    category: 'Core',       description: 'Create and manage discount rules and offers' },
    // Operations
    { key: 'kitchen',         label: 'Kitchen Display (KDS)',     category: 'Operations', description: 'Live kitchen display system for order tickets' },
    { key: 'running_orders',  label: 'Live Running Orders',       category: 'Operations', description: 'Real-time view of active in-progress orders' },
    { key: 'qr_orders',       label: 'QR Table Ordering',         category: 'Operations', description: 'Customers scan QR to order from their table' },
    { key: 'qr_codes',        label: 'QR Code Generator',         category: 'Operations', description: 'Generate and print QR codes for tables' },
    { key: 'inventory',       label: 'Inventory Management',      category: 'Operations', description: 'Track stock levels and raw materials' },
    { key: 'purchase_orders', label: 'Purchase Orders',           category: 'Operations', description: 'Create supplier POs and track deliveries' },
    { key: 'central_kitchen', label: 'Central Kitchen',           category: 'Operations', description: 'Manage centralized production kitchen orders' },
    // Growth
    { key: 'online_orders',   label: 'Online Orders',             category: 'Growth',     description: 'Accept orders from your own online storefront' },
    { key: 'aggregators',     label: 'Aggregators (Zomato/Swiggy)', category: 'Growth',   description: 'Receive and manage orders from food aggregators' },
    { key: 'ondc',            label: 'ONDC Network',              category: 'Growth',     description: 'List on Open Network for Digital Commerce' },
    { key: 'crm',             label: 'CRM & Loyalty',             category: 'Growth',     description: 'Loyalty points, campaigns and customer rewards' },
    // Analytics
    { key: 'reports',         label: 'Reports & Analytics',       category: 'Analytics',  description: 'Sales, revenue and business performance reports' },
    { key: 'eod_report',      label: 'EOD Report',                category: 'Analytics',  description: 'End-of-day cash and sales summary report' },
    { key: 'prep_analytics',  label: 'Prep Time Analytics',       category: 'Analytics',  description: 'Kitchen efficiency and prep time tracking' },
    { key: 'fraud',           label: 'Fraud Detection',           category: 'Analytics',  description: 'AI-powered detection of suspicious transactions' },
    // Advanced
    { key: 'dynamic_pricing', label: 'Dynamic Pricing',           category: 'Advanced',   description: 'Automatically adjust prices based on time/demand' },
    { key: 'festival_mode',   label: 'Festival Mode',             category: 'Advanced',   description: 'Special pricing, menus and branding for events' },
    { key: 'rostering',       label: 'Staff Rostering',           category: 'Advanced',   description: 'Schedule and manage staff rosters and shifts' },
    { key: 'integrations',    label: 'Integrations (Tally etc.)', category: 'Advanced',   description: 'Third-party accounting and delivery integrations' },
    { key: 'audit_log',       label: 'Audit Log',                 category: 'Advanced',   description: 'Full security and compliance activity log' },
    // Finance & Compliance — newer region-specific modules (AU/IN). `region` is
    // display metadata for the toggle card; the app also region-gates the nav.
    { key: 'financials',       label: 'Financials (Xero)',   category: 'Finance & Compliance', description: 'Xero-synced financial reporting, P&L and balance sheet',    region: 'AU' },
    { key: 'accounting',       label: 'Accounting',          category: 'Finance & Compliance', description: 'Double-entry ledgers, journals and chart of accounts',      region: 'AU' },
    { key: 'payroll',          label: 'Payroll',             category: 'Finance & Compliance', description: 'Staff pay runs, wages, superannuation and payslips',        region: 'AU' },
    { key: 'fixed_assets',     label: 'Fixed Assets',        category: 'Finance & Compliance', description: 'Asset register and depreciation schedules',                 region: 'AU' },
    { key: 'budgets',          label: 'Budgets',             category: 'Finance & Compliance', description: 'Budget planning and actual-vs-budget variance tracking',    region: 'AU' },
    { key: 'gst_returns',      label: 'GST / BAS Returns',   category: 'Finance & Compliance', description: 'Prepare and file GST (India) / BAS (Australia) returns',    region: 'IN' },
    { key: 'customer_invoices',label: 'Tax Invoices',        category: 'Finance & Compliance', description: 'Issue B2B tax invoices to corporate customers' },
    { key: 'menu_analytics',   label: 'Menu Analytics',      category: 'Analytics',            description: 'Item-level sales performance and profitability' },
  ],

  /** Build default features object — all features ON */
  getDefaultFeatures() {
    return superadminService.ALL_FEATURES.reduce((acc, f) => {
      acc[f.key] = true;
      return acc;
    }, {});
  },

  /** GET features for a chain */
  async getChainFeatures(headOfficeId) {
    const ho = await prisma.headOffice.findUnique({
      where: { id: headOfficeId },
      select: { id: true, name: true, metadata: true },
    });
    if (!ho) throw new NotFoundError('Chain not found');

    const stored = (ho.metadata?.features) || {};
    const defaults = superadminService.getDefaultFeatures();
    // Merge: stored values override defaults (new features default ON)
    const features = { ...defaults, ...stored };

    return {
      chain_id: ho.id,
      chain_name: ho.name,
      features,
      feature_definitions: superadminService.ALL_FEATURES,
    };
  },

  /** PATCH features for a chain */
  async updateChainFeatures(headOfficeId, body) {
    const ho = await prisma.headOffice.findUnique({
      where: { id: headOfficeId },
      select: { id: true, name: true, metadata: true },
    });
    if (!ho) throw new NotFoundError('Chain not found');

    const existingMeta = ho.metadata || {};
    const existingFeatures = existingMeta.features || {};
    const updatedFeatures = { ...existingFeatures, ...body.features };

    const updated = await prisma.headOffice.update({
      where: { id: headOfficeId },
      data: {
        metadata: { ...existingMeta, features: updatedFeatures },
      },
      select: { id: true, name: true, metadata: true },
    });

    return {
      chain_id: updated.id,
      chain_name: updated.name,
      features: updated.metadata.features,
    };
  },

  /**
   * Toggle chain active status
   * @param {string} headOfficeId
   * @param {'suspend'|'activate'|'trial'} action
   * @param {string} adminId
   * @param {string} [reason]
   */
  async toggleChainStatus(headOfficeId, action, adminId, reason) {
    const ho = await prisma.headOffice.findUnique({ where: { id: headOfficeId } });
    if (!ho) throw new NotFoundError('Chain not found');

    const isActive = action === 'activate';
    const auditAction = action === 'suspend' ? 'CHAIN_SUSPENDED' : 'CHAIN_ACTIVATED';

    const existingMeta = ho.metadata || {};
    const metaUpdate = isActive
      ? { ...existingMeta, suspension_reason: null, suspended_at: null, activated_at: new Date().toISOString() }
      : { ...existingMeta, suspension_reason: reason || 'Suspended by admin', suspended_at: new Date().toISOString() };

    const updated = await prisma.headOffice.update({
      where: { id: headOfficeId },
      data: {
        is_active: isActive,
        ...(action === 'trial' ? { plan: 'TRIAL' } : {}),
        metadata: metaUpdate,
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: auditAction,
        entity_type: 'restaurant',
        entity_id: headOfficeId,
        new_values: { action, reason: reason || null, name: ho.name },
      },
    }).catch(() => null);

    return updated;
  },

  /**
   * Save internal notes on a chain (superadmin-only)
   */
  async updateChainNotes(headOfficeId, notes, adminId) {
    const ho = await prisma.headOffice.findUnique({ where: { id: headOfficeId } });
    if (!ho) throw new NotFoundError('Chain not found');

    const existingMeta = ho.metadata || {};
    const updated = await prisma.headOffice.update({
      where: { id: headOfficeId },
      data: { metadata: { ...existingMeta, internal_notes: notes } },
    });
    return updated;
  },

  async getChainOutlets(headOfficeId) {
    const outlets = await prisma.outlet.findMany({
      where: { head_office_id: headOfficeId, is_deleted: false },
      include: {
        _count: { select: { orders: true, menu_items: true } },
        orders: {
          where: {
            created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          select: { total_amount: true, status: true, created_at: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return outlets.map(o => {
      const revenue30d = o.orders.reduce((sum, ord) => sum + Number(ord.total_amount || 0), 0);
      const todayOrders = o.orders.filter(ord => new Date(ord.created_at) >= today);
      const todayRevenue = todayOrders.reduce((sum, ord) => sum + Number(ord.total_amount || 0), 0);
      const lastOrder = o.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      // Health score: 0-100 based on orders/day, menu size
      const ordersPerDay = o.orders.length / 30;
      const menuScore = Math.min(o._count.menu_items / 50, 1) * 25;
      const activityScore = Math.min(ordersPerDay / 20, 1) * 50;
      const revenueScore = Math.min(revenue30d / 100000, 1) * 25;
      const healthScore = Math.round(menuScore + activityScore + revenueScore);

      return {
        id: o.id,
        name: o.name,
        address: o.address,
        city: o.city,
        phone: o.phone,
        is_active: o.is_active,
        created_at: o.created_at,
        orders_total: o._count.orders,
        menu_items_count: o._count.menu_items,
        orders_30d: o.orders.length,
        revenue_30d: revenue30d,
        orders_today: todayOrders.length,
        revenue_today: todayRevenue,
        last_order_at: lastOrder?.created_at || null,
        health_score: healthScore,
      };
    });
  },

  PLANS: ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'],

  /** Get all available plans */
  async getPlans() {
    return superadminService.PLANS.map(name => ({
      name,
      label: name.charAt(0) + name.slice(1).toLowerCase(),
    }));
  },

  /** Assign a plan to a chain */
  async assignPlan(headOfficeId, planName, adminId) {
    const plan = planName.toUpperCase();
    if (!superadminService.PLANS.includes(plan)) throw new BadRequestError(`Invalid plan. Use one of: ${superadminService.PLANS.join(', ')}`);

    const updated = await prisma.headOffice.update({
      where: { id: headOfficeId },
      data: { plan },
    });

    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: 'PLAN_ASSIGNED',
        entity_type: 'restaurant',
        entity_id: headOfficeId,
        new_values: { plan, previous_plan: updated.plan, name: updated.name },
      },
    }).catch(() => null);

    return updated;
  },

  async getAllUsers({ search, role, plan } = {}) {
    const headOffices = await prisma.headOffice.findMany({
      where: { is_deleted: false },
      select: {
        id: true, name: true, plan: true, is_active: true,
        outlets: {
          where: { is_deleted: false },
          select: { id: true, name: true },
        },
        users: {
          where: { is_deleted: false },
          select: {
            id: true, full_name: true, email: true, phone: true,
            is_active: true, created_at: true, last_login_at: true,
            user_roles: {
              where: { is_deleted: false, is_primary: true },
              select: {
                outlet_id: true,
                role: { select: { name: true, display_name: true } },
              },
              take: 1,
            },
          },
        },
      },
    });

    const users = [];
    for (const ho of headOffices) {
      for (const u of ho.users) {
        const primaryRole = u.user_roles?.[0];
        const roleName = primaryRole?.role?.name || 'owner';
        const outletId = primaryRole?.outlet_id;
        const outlet = ho.outlets.find(o => o.id === outletId);

        if (role && role !== 'ALL' && roleName !== role) continue;
        if (plan && plan !== 'ALL' && ho.plan !== plan) continue;
        if (search) {
          const q = search.toLowerCase();
          const nm = u.full_name?.toLowerCase() || '';
          const em = u.email?.toLowerCase() || '';
          const ph = u.phone?.toLowerCase() || '';
          const ch = ho.name?.toLowerCase() || '';
          if (!nm.includes(q) && !em.includes(q) && !ph.includes(q) && !ch.includes(q)) continue;
        }
        users.push({
          id: u.id,
          name: u.full_name,
          email: u.email,
          phone: u.phone,
          role: roleName,
          is_active: u.is_active,
          created_at: u.created_at,
          last_login_at: u.last_login_at,
          outlet_name: outlet?.name || ho.name,
          outlet_id: outletId || null,
          chain_name: ho.name,
          chain_id: ho.id,
          chain_plan: ho.plan,
          chain_active: ho.is_active,
        });
      }
    }
    return users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  /**
   * Chain profile edit
   */
  async updateChainProfile(headOfficeId, { name, contact_email, phone, address, city, state, gstin, website }) {
    const data = {};
    if (name !== undefined) data.name = name;
    if (contact_email !== undefined) data.contact_email = contact_email;
    if (phone !== undefined) data.phone = phone;
    if (address !== undefined) data.address = address;
    if (city !== undefined) data.city = city;
    if (state !== undefined) data.state = state;
    if (gstin !== undefined) data.gstin = gstin;
    if (website !== undefined) data.website = website;

    return await prisma.headOffice.update({ where: { id: headOfficeId }, data });
  },

  // IMPERSONATION AUDIT LOG
  IMPERSONATION_KEY: 'impersonation_log',

  async getImpersonationLog() {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: superadminService.IMPERSONATION_KEY } });
    if (!cfg) return [];
    try { return JSON.parse(cfg.value); } catch { return []; }
  },

  async logImpersonation({ admin_id, admin_email, target_chain_id, target_chain_name, target_user_id, target_user_email }) {
    const logs = await superadminService.getImpersonationLog();
    logs.unshift({
      id: `imp_${Date.now()}`,
      admin_id, admin_email,
      target_chain_id, target_chain_name,
      target_user_id, target_user_email,
      timestamp: new Date().toISOString(),
      duration_mins: null,
    });
    // Keep only last 500 entries
    const trimmed = logs.slice(0, 500);
    await prisma.systemConfig.upsert({
      where:  { key: superadminService.IMPERSONATION_KEY },
      update: { value: JSON.stringify(trimmed) },
      create: { key: superadminService.IMPERSONATION_KEY, value: JSON.stringify(trimmed), description: 'Impersonation audit log' },
    });
    return trimmed[0];
  },
});

module.exports = superadminService;
