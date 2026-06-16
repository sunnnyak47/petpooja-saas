const { getDbClient } = require('../../config/database');
const https = require('https');
const logger = require('../../config/logger');

/**
 * Get the current wizard status for a head office / outlet.
 */
async function getWizardStatus(headOfficeId, outletId) {
  const prisma = getDbClient();

  const [settings, headOffice] = await Promise.all([
    prisma.outletSetting.findMany({
      where: {
        outlet_id: outletId,
        setting_key: { startsWith: 'wizard_' },
        is_deleted: false,
      },
    }),
    prisma.headOffice.findUnique({
      where: { id: headOfficeId },
      select: { setup_completed: true, name: true },
    }),
  ]);

  const currentStepSetting = settings.find((s) => s.setting_key === 'wizard_current_step');
  const completedStepsSetting = settings.find((s) => s.setting_key === 'wizard_completed_steps');

  let completedSteps = [];
  try {
    completedSteps = JSON.parse(completedStepsSetting?.setting_value) || [];
  } catch (_) {
    completedSteps = [];
  }

  return {
    current_step: parseInt(currentStepSetting?.setting_value) || 1,
    completed_steps: completedSteps,
    setup_completed: headOffice?.setup_completed ?? false,
    wizard_data: {},
  };
}

/**
 * Save a single wizard step's data and advance the current step pointer.
 */
async function saveWizardStep(headOfficeId, outletId, step, data) {
  const prisma = getDbClient();

  // Persist the step data
  await prisma.outletSetting.upsert({
    where: {
      outlet_id_setting_key: {
        outlet_id: outletId,
        setting_key: 'wizard_step_' + step,
      },
    },
    update: { setting_value: JSON.stringify(data) },
    create: {
      outlet_id: outletId,
      setting_key: 'wizard_step_' + step,
      setting_value: JSON.stringify(data),
    },
  });

  // Read and update completed_steps
  const completedStepsSetting = await prisma.outletSetting.findUnique({
    where: {
      outlet_id_setting_key: {
        outlet_id: outletId,
        setting_key: 'wizard_completed_steps',
      },
    },
  });

  let completedSteps = [];
  try {
    completedSteps = JSON.parse(completedStepsSetting?.setting_value) || [];
  } catch (_) {
    completedSteps = [];
  }

  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  await prisma.outletSetting.upsert({
    where: {
      outlet_id_setting_key: {
        outlet_id: outletId,
        setting_key: 'wizard_completed_steps',
      },
    },
    update: { setting_value: JSON.stringify(completedSteps) },
    create: {
      outlet_id: outletId,
      setting_key: 'wizard_completed_steps',
      setting_value: JSON.stringify(completedSteps),
    },
  });

  // Advance the current step pointer
  await prisma.outletSetting.upsert({
    where: {
      outlet_id_setting_key: {
        outlet_id: outletId,
        setting_key: 'wizard_current_step',
      },
    },
    update: { setting_value: String(step + 1) },
    create: {
      outlet_id: outletId,
      setting_key: 'wizard_current_step',
      setting_value: String(step + 1),
    },
  });

  return { saved: true, next_step: step + 1 };
}

/**
 * Use Groq (llama-3.3-70b-versatile) to parse raw menu text into structured items.
 * Falls back to sample items when the API key is missing or the call fails.
 */
// Coerce any veg/non-veg variant (hyphen, space, casing) to the canonical
// enum the DB + menu validation expect: 'veg' | 'non_veg' | 'egg'.
function normalizeFoodType(v) {
  const s = String(v || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (s === 'egg') return 'egg';
  if (s === 'non_veg' || s === 'nonveg' || s === 'non_vegetarian') return 'non_veg';
  return 'veg';
}

async function parseMenuWithAI(menuText, currency = 'INR') {
  const fallback = [
    {
      name: 'Veg Thali',
      price: 150,
      category: 'Main Course',
      food_type: 'veg',
      variants: [],
      description: 'Sample item',
    },
    {
      name: 'Chicken Biryani',
      price: 280,
      category: 'Rice',
      food_type: 'non_veg',
      variants: [
        { name: 'Half', price: 180 },
        { name: 'Full', price: 280 },
      ],
      description: 'Aromatic rice',
    },
    {
      name: 'Cold Coffee',
      price: 90,
      category: 'Beverages',
      food_type: 'veg',
      variants: [],
      description: 'Chilled coffee',
    },
  ];

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      logger.warn('GROQ_API_KEY not set — returning fallback menu items');
      return fallback;
    }

    const systemPrompt =
      'You are a restaurant menu parser. Parse the given menu text and return a JSON object with key "items" containing an array. Each item: { "name": string, "price": number, "category": string, "food_type": "veg"|"non_veg"|"egg", "variants": [{"name":string,"price":number}], "description": string }. Extract ALL items. If price is not found use 0. Guess food_type from name.';
    const userMessage = `Parse this menu (currency: ${currency}):\n\n${menuText}`;

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });

    const responseText = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });

    const parsed = JSON.parse(responseText);
    const content = parsed?.choices?.[0]?.message?.content;
    const menuJson = JSON.parse(content);
    return menuJson.items || fallback;
  } catch (err) {
    logger.error('parseMenuWithAI error:', err);
    return fallback;
  }
}

const COUNTRY_LOCALE = {
  IN: { country: 'India', currency: 'INR' },
  AU: { country: 'Australia', currency: 'AUD' },
  US: { country: 'United States', currency: 'USD' },
  UK: { country: 'United Kingdom', currency: 'GBP' },
  AE: { country: 'UAE', currency: 'AED' },
};

/** Reads the saved per-step wizard data for an outlet. Returns { step1, step2, ... }. */
async function readWizardData(prisma, outletId) {
  const rows = await prisma.outletSetting.findMany({
    where: { outlet_id: outletId, setting_key: { startsWith: 'wizard_step_' }, is_deleted: false },
  });
  const data = {};
  for (const r of rows) {
    const n = r.setting_key.replace('wizard_step_', '');
    try { data[`step${n}`] = JSON.parse(r.setting_value); } catch { /* skip malformed */ }
  }
  return data;
}

async function setSetting(prisma, outletId, key, value) {
  await prisma.outletSetting.upsert({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: key } },
    update: { setting_value: String(value), is_deleted: false },
    create: { outlet_id: outletId, setting_key: key, setting_value: String(value) },
  });
}

/**
 * Provisions REAL records from the collected wizard data — outlet profile, tables,
 * menu categories + items, staff users, POS config and integration keys. Every
 * section is idempotent (safe to run more than once) and isolated in its own
 * try/catch so one failure never blocks the rest of setup.
 *
 * Returns a summary of what was created so the caller / UI can confirm.
 */
async function provisionFromWizard(prisma, headOfficeId, outletId) {
  const d = await readWizardData(prisma, outletId);
  const summary = { outlet: false, tables: 0, categories: 0, menu_items: 0, staff: 0, pos: false, integrations: 0 };
  const country = d.step1?.country || 'IN';
  const locale = COUNTRY_LOCALE[country] || COUNTRY_LOCALE.IN;

  // ── Business profile → HeadOffice + Outlet identity ──
  try {
    if (d.step1) {
      const hoData = {};
      if (d.step1.restaurant_name) hoData.name = d.step1.restaurant_name;
      if (Object.keys(hoData).length) await prisma.headOffice.update({ where: { id: headOfficeId }, data: hoData }).catch(() => {});
    }
  } catch (e) { logger.warn('Onboarding: profile provision failed', { error: e.message }); }

  // ── Outlet & service → Outlet fields + Tables ──
  try {
    if (d.step2 || d.step1) {
      const outletData = { country: locale.country, currency: locale.currency };
      if (d.step2?.outlet_name) outletData.name = d.step2.outlet_name;
      if (d.step2?.address) outletData.address_line1 = String(d.step2.address).slice(0, 255);
      if (d.step2?.city) outletData.city = d.step2.city;
      if (d.step2?.phone) outletData.phone = String(d.step2.phone).slice(0, 15);
      if (d.step1?.gstin) outletData.gstin = String(d.step1.gstin).slice(0, 20);
      if (d.step1?.abn) outletData.abn = String(d.step1.abn).replace(/\s/g, '').slice(0, 11);
      await prisma.outlet.update({ where: { id: outletId }, data: outletData });
      summary.outlet = true;
    }

    // Tables — create only the ones that don't exist yet (idempotent by table_number).
    const wantTables = Math.max(0, Math.min(parseInt(d.step2?.table_count) || 0, 500));
    if (d.step2?.dine_in !== false && wantTables > 0) {
      const existing = await prisma.table.findMany({
        where: { outlet_id: outletId, is_deleted: false }, select: { table_number: true },
      });
      const have = new Set(existing.map((t) => String(t.table_number)));
      const toCreate = [];
      for (let i = 1; i <= wantTables; i += 1) {
        if (!have.has(String(i))) toCreate.push({ outlet_id: outletId, table_number: String(i), seating_capacity: 4, display_order: i });
      }
      if (toCreate.length) {
        await prisma.table.createMany({ data: toCreate });
        summary.tables = toCreate.length;
      }
    }
  } catch (e) { logger.warn('Onboarding: outlet/tables provision failed', { error: e.message }); }

  // ── Menu → categories + items ──
  try {
    const items = Array.isArray(d.step3?.approved_items) ? d.step3.approved_items : [];
    if (items.length) {
      // Resolve/ create categories by name (idempotent).
      const catCache = {};
      const existingCats = await prisma.menuCategory.findMany({ where: { outlet_id: outletId, is_deleted: false }, select: { id: true, name: true } });
      for (const c of existingCats) catCache[c.name.toLowerCase()] = c.id;

      const existingItems = await prisma.menuItem.findMany({ where: { outlet_id: outletId, is_deleted: false }, select: { name: true } });
      const haveItems = new Set(existingItems.map((i) => i.name.toLowerCase()));

      let order = 0;
      for (const it of items) {
        const name = String(it.name || '').trim();
        if (!name || haveItems.has(name.toLowerCase())) continue;
        const catName = String(it.category || 'Menu').trim() || 'Menu';
        let catId = catCache[catName.toLowerCase()];
        if (!catId) {
          const cat = await prisma.menuCategory.create({ data: { outlet_id: outletId, name: catName.slice(0, 100), display_order: Object.keys(catCache).length } });
          catId = cat.id; catCache[catName.toLowerCase()] = catId; summary.categories += 1;
        }
        await prisma.menuItem.create({
          data: {
            outlet_id: outletId, category_id: catId, name: name.slice(0, 200),
            base_price: Number(it.price) || 0,
            food_type: normalizeFoodType(it.food_type),
            display_order: order++,
          },
        });
        haveItems.add(name.toLowerCase());
        summary.menu_items += 1;
      }
    }
  } catch (e) { logger.warn('Onboarding: menu provision failed', { error: e.message }); }

  // ── Team → staff users (idempotent by phone) ──
  try {
    const members = Array.isArray(d.step4?.staff_members) ? d.step4.staff_members : [];
    if (members.length) {
      const bcrypt = require('bcryptjs');
      const roleMap = { manager: 'manager', cashier: 'cashier', captain: 'cashier', chef: 'cashier', 'kot screen': 'cashier' };
      for (const m of members) {
        const fullName = String(m.name || '').trim();
        const phone = String(m.phone || '').trim();
        if (!fullName) continue;
        if (phone) {
          const dup = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
          if (dup) continue; // already exists
        }
        const roleName = roleMap[String(m.role || '').toLowerCase()] || 'cashier';
        const hash = await bcrypt.hash(`Staff@${(m.pin && String(m.pin).length === 4) ? m.pin : '1234'}`, 12);
        await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: { full_name: fullName, phone: phone || `pos_${Date.now()}_${summary.staff}`, password_hash: hash },
          });
          await tx.staffProfile.create({
            data: { user_id: user.id, outlet_id: outletId, designation: m.role || null, manager_pin: (m.pin && String(m.pin).length >= 4) ? String(m.pin).slice(0, 6) : null, join_date: new Date() },
          });
          const role = await tx.role.findFirst({ where: { name: roleName } });
          if (role) await tx.userRole.create({ data: { user_id: user.id, role_id: role.id, outlet_id: outletId, is_primary: true } });
        });
        summary.staff += 1;
      }
    }
  } catch (e) { logger.warn('Onboarding: staff provision failed', { error: e.message }); }

  // ── POS config → outletSetting ──
  try {
    if (d.step5) {
      if (d.step5.default_order_type) await setSetting(prisma, outletId, 'pos_default_order_type', d.step5.default_order_type);
      if (Array.isArray(d.step5.payment_modes)) await setSetting(prisma, outletId, 'pos_payment_modes', JSON.stringify(d.step5.payment_modes));
      if (d.step5.receipt_footer != null) await setSetting(prisma, outletId, 'receipt_footer', d.step5.receipt_footer);
      if (d.step5.voice_language) await setSetting(prisma, outletId, 'voice_language', d.step5.voice_language);
      summary.pos = true;
    }
    if (d.step2) {
      await setSetting(prisma, outletId, 'service_dine_in', d.step2.dine_in !== false);
      await setSetting(prisma, outletId, 'service_takeaway', d.step2.takeaway !== false);
      await setSetting(prisma, outletId, 'service_delivery', !!d.step2.delivery);
      await setSetting(prisma, outletId, 'qr_ordering_enabled', !!d.step2.enable_qr);
    }
  } catch (e) { logger.warn('Onboarding: POS config provision failed', { error: e.message }); }

  // ── Integrations → aggregator/* settings ──
  try {
    if (d.step6) {
      const map = {
        swiggy_key: 'swiggy', zomato_key: 'zomato', ubereats_key: 'uber_eats',
        doordash_key: 'doordash', menulog_key: 'menulog',
      };
      for (const [field, platform] of Object.entries(map)) {
        const v = d.step6[field];
        if (v) {
          await setSetting(prisma, outletId, `aggregator_${platform}_api_key`, v);
          await setSetting(prisma, outletId, `aggregator_${platform}_enabled`, 'true');
          summary.integrations += 1;
        }
      }
      if (d.step6.whatsapp_number) await setSetting(prisma, outletId, 'whatsapp_business_number', d.step6.whatsapp_number);
      if (d.step6.razorpay_key_id) await setSetting(prisma, outletId, 'razorpay_key_id', d.step6.razorpay_key_id);
      if (d.step6.stripe_key) await setSetting(prisma, outletId, 'stripe_secret_key', d.step6.stripe_key);
    }
  } catch (e) { logger.warn('Onboarding: integrations provision failed', { error: e.message }); }

  return summary;
}

/**
 * Mark the onboarding wizard as fully completed for a head office AND provision
 * all the real records from the data the owner entered (tables, menu, staff, POS
 * config, integrations). Previously this only flipped a flag, so nothing the owner
 * set up actually appeared in the app.
 */
async function completeWizard(headOfficeId, outletId) {
  const prisma = getDbClient();

  const provisioned = await provisionFromWizard(prisma, headOfficeId, outletId);

  await prisma.headOffice.update({
    where: { id: headOfficeId },
    data: { setup_completed: true },
  });

  await setSetting(prisma, outletId, 'wizard_completed', 'true');

  logger.info('Onboarding completed + provisioned', { headOfficeId, outletId, provisioned });
  return { completed: true, provisioned };
}

/**
 * Return a high-level overview of all head offices and their onboarding progress.
 * Intended for superadmin use.
 */
async function getOnboardingOverview() {
  const prisma = getDbClient();

  const headOffices = await prisma.headOffice.findMany({
    where: { is_deleted: false },
    select: {
      id: true,
      name: true,
      plan: true,
      setup_completed: true,
      created_at: true,
      contact_email: true,
    },
  });

  const details = await Promise.all(
    headOffices.map(async (ho) => {
      const [primaryOutlet, outletCount] = await Promise.all([
        prisma.outlet.findFirst({
          where: { head_office_id: ho.id, is_deleted: false },
          select: { id: true },
        }),
        prisma.outlet.count({
          where: { head_office_id: ho.id, is_deleted: false },
        }),
      ]);

      let wizardStep = 1;
      if (primaryOutlet) {
        const stepSetting = await prisma.outletSetting.findUnique({
          where: {
            outlet_id_setting_key: {
              outlet_id: primaryOutlet.id,
              setting_key: 'wizard_current_step',
            },
          },
        });
        wizardStep = parseInt(stepSetting?.setting_value) || 1;
      }

      return {
        id: ho.id,
        name: ho.name,
        plan: ho.plan,
        setup_completed: ho.setup_completed,
        wizard_step: wizardStep,
        outlet_count: outletCount,
        created_at: ho.created_at,
        contact_email: ho.contact_email,
        days_since_signup: Math.floor(
          (Date.now() - new Date(ho.created_at)) / 86400000
        ),
      };
    })
  );

  return details;
}

/**
 * Wipe all wizard settings for an outlet and mark the head office as not set up.
 */
async function resetWizard(headOfficeId, outletId) {
  const prisma = getDbClient();

  await prisma.outletSetting.deleteMany({
    where: {
      outlet_id: outletId,
      setting_key: { startsWith: 'wizard_' },
    },
  });

  await prisma.headOffice.update({
    where: { id: headOfficeId },
    data: { setup_completed: false },
  });

  return { reset: true };
}

module.exports = {
  getWizardStatus,
  saveWizardStep,
  parseMenuWithAI,
  completeWizard,
  getOnboardingOverview,
  resetWizard,
};
