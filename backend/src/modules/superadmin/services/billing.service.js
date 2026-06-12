/**
 * @fileoverview SuperAdmin — revenue analytics, SaaS invoices, tax profiles,
 * platform settings, and per-chain subscription info. Augments the shared
 * superadminService singleton.
 *
 * NOTE: JSON-blob storage in SystemConfig is preserved as-is (out of scope to
 * migrate to dedicated tables).
 * @module modules/superadmin/services/billing.service
 */

const {
  superadminService, prisma, NotFoundError,
} = require('./_shared');

Object.assign(superadminService, {
  /**
   * Get Detailed Revenue Analytics
   */
  async getRevenueStats() {
    const now = new Date();
    const paidSubs = await prisma.subscription.findMany({
      where: { status: 'active', amount: { gt: 0 } },
      include: { head_office: { select: { name: true, plan: true } } },
      orderBy: { created_at: 'desc' }
    });

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);

      const rev = await prisma.subscription.aggregate({
        where: { created_at: { gte: start, lte: end }, status: 'active' },
        _sum: { amount: true }
      });

      monthlyTrend.push({
        month: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        revenue: Number(rev._sum?.amount || 0)
      });
    }

    return {
      summary: {
        total_paying: paidSubs.length,
        recent_payments: paidSubs.slice(0, 10).map(s => ({
          restaurant: s.head_office.name,
          amount: s.amount,
          plan: s.plan_name,
          date: s.created_at
        }))
      },
      monthly_trend: monthlyTrend
    };
  },

  async getRevenueAnalytics() {
    const now = new Date();
    // Build last 12 months
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString('default', { month: 'short', year: '2-digit' }) });
    }

    // Active chains per month (chains created before end of that month)
    const chains = await prisma.headOffice.findMany({
      where: { is_deleted: false },
      select: { id: true, plan: true, created_at: true, is_active: true, country_code: true },
    });

    const PLAN_MRR = { TRIAL: 0, STARTER: 2999, PRO: 7999, ENTERPRISE: 19999 };

    const mrrData = months.map(m => {
      const endOfMonth = new Date(m.year, m.month, 0, 23, 59, 59);
      const startOfMonth = new Date(m.year, m.month - 1, 1);
      const activeChains = chains.filter(c => new Date(c.created_at) <= endOfMonth);
      const mrr = activeChains.reduce((sum, c) => sum + (PLAN_MRR[c.plan] || 0), 0);
      const newChains = chains.filter(c => {
        const cd = new Date(c.created_at);
        return cd >= startOfMonth && cd <= endOfMonth;
      }).length;
      return { label: m.label, mrr, chains: activeChains.length, new_chains: newChains };
    });

    // Region breakdown
    const byRegion = {};
    chains.forEach(c => {
      const region = c.country_code || 'IN';
      if (!byRegion[region]) byRegion[region] = { chains: 0, mrr: 0 };
      byRegion[region].chains++;
      byRegion[region].mrr += PLAN_MRR[c.plan] || 0;
    });

    // Plan distribution
    const byPlan = {};
    chains.forEach(c => {
      byPlan[c.plan] = (byPlan[c.plan] || 0) + 1;
    });

    const currentMrr = chains.reduce((sum, c) => sum + (PLAN_MRR[c.plan] || 0), 0);
    const prevMonth = mrrData[mrrData.length - 2];
    const mrrGrowth = prevMonth?.mrr > 0 ? ((currentMrr - prevMonth.mrr) / prevMonth.mrr * 100).toFixed(1) : 0;

    // Churn: chains that are inactive
    const churned = chains.filter(c => !c.is_active).length;
    const churnRate = chains.length > 0 ? ((churned / chains.length) * 100).toFixed(1) : 0;

    return { mrr_trend: mrrData, by_region: byRegion, by_plan: byPlan, current_mrr: currentMrr, mrr_growth: mrrGrowth, churn_rate: churnRate, total_chains: chains.length, churned_chains: churned };
  },

  // INVOICE MANAGEMENT — Monthly SaaS invoices per chain
  INVOICE_KEY: 'platform_invoices',

  async _loadInvoices() {
    try {
      const cfg = await prisma.systemConfig.findUnique({ where: { key: superadminService.INVOICE_KEY } });
      return cfg?.value ? JSON.parse(cfg.value) : [];
    } catch { return []; }
  },

  async _saveInvoices(list) {
    await prisma.systemConfig.upsert({
      where: { key: superadminService.INVOICE_KEY },
      update: { value: JSON.stringify(list) },
      create: { key: superadminService.INVOICE_KEY, value: JSON.stringify(list) },
    });
  },

  async getInvoices(headOfficeId) {
    const all = await superadminService._loadInvoices();
    if (headOfficeId) return all.filter(i => i.head_office_id === headOfficeId);
    return all;
  },

  // Region-aware fixed-plan pricing. AU chains are billed in AUD, IN in INR.
  // Keyed by region; the chain's country_code selects the table.
  PLAN_PRICE_BY_REGION: {
    IN: { currency: 'INR', prices: { TRIAL: 0, STARTER: 2999, PRO: 7999, ENTERPRISE: 19999 } },
    AU: { currency: 'AUD', prices: { TRIAL: 0, STARTER: 59, PRO: 149, ENTERPRISE: 399 } },
  },

  async generateMonthlyInvoices(month, year) {
    const chains = await prisma.headOffice.findMany({
      where: { is_deleted: false, is_active: true },
      select: { id: true, name: true, contact_email: true, plan: true, country_code: true, region: true },
    });

    const existing = await superadminService._loadInvoices();
    const newInvoices = [];

    for (const chain of chains) {
      const alreadyExists = existing.find(i => i.head_office_id === chain.id && i.month === month && i.year === year);
      if (alreadyExists) continue;
      const region = (chain.country_code || chain.region) === 'AU' ? 'AU' : 'IN';
      const table = superadminService.PLAN_PRICE_BY_REGION[region] || superadminService.PLAN_PRICE_BY_REGION.IN;
      const amount = table.prices[chain.plan] || 0;
      if (amount === 0) continue;
      newInvoices.push({
        id: `INV-${Date.now()}-${chain.id.slice(0, 6)}`,
        head_office_id: chain.id,
        chain_name: chain.name,
        email: chain.contact_email,
        plan: chain.plan,
        amount,
        currency: table.currency,
        region,
        month, year,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        paid_at: null,
        notes: '',
      });
    }

    const updated = [...existing, ...newInvoices];
    await superadminService._saveInvoices(updated);
    return { generated: newInvoices.length, invoices: newInvoices };
  },

  async updateInvoice(id, data) {
    const list = await superadminService._loadInvoices();
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) throw new NotFoundError('Invoice not found');
    list[idx] = { ...list[idx], ...data, id };
    await superadminService._saveInvoices(list);
    return list[idx];
  },

  // TAX PROFILES — Per-region tax configuration
  TAX_KEY: 'platform_tax_profiles',

  async getTaxProfiles() {
    try {
      const cfg = await prisma.systemConfig.findUnique({ where: { key: superadminService.TAX_KEY } });
      if (cfg?.value) return JSON.parse(cfg.value);
    } catch { /* fall through */ }
    // Default profiles
    return [
      { id: 'IN_GST', region: 'IN', name: 'India GST', slabs: [{ rate: 0, label: '0% (Exempt)' }, { rate: 5, label: '5% GST' }, { rate: 12, label: '12% GST' }, { rate: 18, label: '18% GST' }, { rate: 28, label: '28% GST' }], default_slab: 5, gst_type: 'REGULAR', inclusive: false },
      { id: 'AU_GST', region: 'AU', name: 'Australia GST', slabs: [{ rate: 0, label: '0% (GST-Free)' }, { rate: 10, label: '10% GST' }], default_slab: 10, gst_type: 'INCLUSIVE', inclusive: true },
    ];
  },

  async saveTaxProfiles(profiles) {
    await prisma.systemConfig.upsert({
      where: { key: superadminService.TAX_KEY },
      update: { value: JSON.stringify(profiles) },
      create: { key: superadminService.TAX_KEY, value: JSON.stringify(profiles) },
    });
    return profiles;
  },

  // PLATFORM SETTINGS
  PLATFORM_SETTINGS_KEY: 'platform_settings',

  _defaultPlatformSettings() {
    return {
      maintenance_mode: false,
      registration_open: true,
      platform_name: 'MS-RM System',
      support_email: 'support@madsundigital.com',
      default_trial_days: 14,
      plan_pricing: { TRIAL: 0, STARTER: 2999, PRO: 7999, ENTERPRISE: 19999 },
      max_outlets_per_plan: { TRIAL: 1, STARTER: 3, PRO: 10, ENTERPRISE: 50 },
      allow_impersonation: true,
      onboarding_required: true,
      min_password_length: 8,
      session_timeout_hours: 24,
      updated_at: new Date().toISOString(),
    };
  },

  async getPlatformSettings() {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: superadminService.PLATFORM_SETTINGS_KEY } });
    if (!cfg) return superadminService._defaultPlatformSettings();
    try { return JSON.parse(cfg.value); } catch { return superadminService._defaultPlatformSettings(); }
  },

  async savePlatformSettings(settings) {
    const merged = { ...superadminService._defaultPlatformSettings(), ...settings, updated_at: new Date().toISOString() };
    await prisma.systemConfig.upsert({
      where: { key: superadminService.PLATFORM_SETTINGS_KEY },
      update: { value: JSON.stringify(merged) },
      create: { key: superadminService.PLATFORM_SETTINGS_KEY, value: JSON.stringify(merged) },
    });
    return merged;
  },

  // SUBSCRIPTION INFO FOR OWNERS
  async getSubscriptionInfo(headOfficeId) {
    const ho = await prisma.headOffice.findUnique({
      where: { id: headOfficeId },
      select: { id: true, name: true, plan: true, is_active: true, created_at: true,
        outlets: { where: { is_deleted: false }, select: { id: true, name: true } },
        users:   { where: { is_deleted: false, is_active: true }, select: { id: true } },
      },
    });
    if (!ho) throw new NotFoundError('Chain not found');

    const PLAN_PRICES = { TRIAL: 0, STARTER: 2999, PRO: 7999, ENTERPRISE: 19999 };
    const PLAN_LIMITS = {
      TRIAL:      { outlets: 1,  staff: 3,  features: ['pos', 'menu', 'orders'] },
      STARTER:    { outlets: 2,  staff: 10, features: ['pos', 'menu', 'orders', 'reports', 'tables', 'payments'] },
      PRO:        { outlets: 5,  staff: 50, features: ['pos', 'menu', 'orders', 'reports', 'tables', 'payments', 'crm', 'inventory', 'kitchen', 'online_orders'] },
      ENTERPRISE: { outlets: 20, staff: 200, features: ['all'] },
    };

    const invoices = await superadminService._loadInvoices();
    const myInvoices = invoices.filter(inv => inv.head_office_id === headOfficeId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      plan:          ho.plan,
      plan_price:    PLAN_PRICES[ho.plan] || 0,
      plan_limits:   PLAN_LIMITS[ho.plan] || PLAN_LIMITS.TRIAL,
      outlets_used:  ho.outlets.length,
      staff_used:    ho.users.length,
      is_active:     ho.is_active,
      member_since:  ho.created_at,
      invoices:      myInvoices.slice(0, 10),
      next_plans:    Object.entries(PLAN_PRICES)
        .filter(([p]) => p !== ho.plan && PLAN_PRICES[p] > (PLAN_PRICES[ho.plan] || 0))
        .map(([plan, price]) => ({ plan, price, limits: PLAN_LIMITS[plan] })),
    };
  },
});

module.exports = superadminService;
