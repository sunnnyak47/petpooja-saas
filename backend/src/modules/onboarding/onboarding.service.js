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
      food_type: 'non-veg',
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
      'You are a restaurant menu parser. Parse the given menu text and return a JSON object with key "items" containing an array. Each item: { "name": string, "price": number, "category": string, "food_type": "veg"|"non-veg"|"egg", "variants": [{"name":string,"price":number}], "description": string }. Extract ALL items. If price is not found use 0. Guess food_type from name.';
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

/**
 * Mark the onboarding wizard as fully completed for a head office.
 */
async function completeWizard(headOfficeId, outletId) {
  const prisma = getDbClient();

  await prisma.headOffice.update({
    where: { id: headOfficeId },
    data: { setup_completed: true },
  });

  await prisma.outletSetting.upsert({
    where: {
      outlet_id_setting_key: {
        outlet_id: outletId,
        setting_key: 'wizard_completed',
      },
    },
    update: { setting_value: 'true' },
    create: {
      outlet_id: outletId,
      setting_key: 'wizard_completed',
      setting_value: 'true',
    },
  });

  return { completed: true };
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
