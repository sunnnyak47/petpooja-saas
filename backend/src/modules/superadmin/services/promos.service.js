/**
 * @fileoverview SuperAdmin — promo codes (stored as a JSON array in
 * SystemConfig, preserved as-is). Augments the shared superadminService
 * singleton.
 * @module modules/superadmin/services/promos.service
 */

const {
  superadminService, prisma, NotFoundError, BadRequestError, ConflictError,
} = require('./_shared');

Object.assign(superadminService, {
  // PROMO CODES
  PROMOS_KEY: 'promo_codes',

  async _loadPromos() {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: superadminService.PROMOS_KEY } });
    if (!cfg) return [];
    try { return JSON.parse(cfg.value); } catch { return []; }
  },

  async _savePromos(promos) {
    await prisma.systemConfig.upsert({
      where: { key: superadminService.PROMOS_KEY },
      update: { value: JSON.stringify(promos) },
      create: { key: superadminService.PROMOS_KEY, value: JSON.stringify(promos) },
    });
  },

  async getPromoCodes() {
    return (await superadminService._loadPromos()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async createPromoCode({ code, discount_type, discount_value, applicable_plans, max_uses, valid_from, valid_until, description }) {
    const promos = await superadminService._loadPromos();
    if (promos.find(p => p.code === code.toUpperCase())) throw new ConflictError('Promo code already exists');
    const promo = {
      id: `PROMO-${Date.now().toString(36).toUpperCase()}`,
      code: code.toUpperCase(), discount_type, discount_value,
      applicable_plans: applicable_plans || ['STARTER', 'PRO', 'ENTERPRISE'],
      max_uses: max_uses || null,
      used_count: 0,
      valid_from: valid_from || new Date().toISOString(),
      valid_until: valid_until || null,
      description: description || '',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    await superadminService._savePromos([promo, ...promos]);
    return promo;
  },

  async updatePromoCode(id, data) {
    const promos = await superadminService._loadPromos();
    const idx = promos.findIndex(p => p.id === id);
    if (idx === -1) throw new NotFoundError('Promo code not found');
    promos[idx] = { ...promos[idx], ...data, id, updated_at: new Date().toISOString() };
    await superadminService._savePromos(promos);
    return promos[idx];
  },

  async deletePromoCode(id) {
    const promos = await superadminService._loadPromos();
    await superadminService._savePromos(promos.filter(p => p.id !== id));
    return { deleted: true };
  },

  async validatePromoCode(code, plan) {
    const promos = await superadminService._loadPromos();
    const promo = promos.find(p => p.code === code.toUpperCase() && p.is_active);
    if (!promo) throw new BadRequestError('Invalid or expired promo code');
    if (promo.valid_until && new Date(promo.valid_until) < new Date()) throw new BadRequestError('Promo code has expired');
    if (promo.max_uses && promo.used_count >= promo.max_uses) throw new BadRequestError('Promo code usage limit reached');
    if (plan && !promo.applicable_plans.includes(plan)) throw new BadRequestError(`This promo code is not applicable for ${plan} plan`);
    return promo;
  },
});

module.exports = superadminService;
