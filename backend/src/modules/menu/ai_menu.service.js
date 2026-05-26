/**
 * @fileoverview AI Menu Sync Service — Gemini Vision (gemini-1.5-flash, free 1500 req/day).
 * Pipeline: image → Gemini Vision (gemini-2.5-flash-lite) → structured JSON → DB.
 * Get a free API key at https://aistudio.google.com
 * @module modules/menu/ai_menu.service
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../config/logger');
const { getDbClient } = require('../../config/database');
const { BadRequestError, RateLimitError, UnauthorizedError } = require('../../utils/errors');

/* ─────────────────────────────────────────────────────────────
   GEMINI CLIENT
───────────────────────────────────────────────────────────── */

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new BadRequestError('GEMINI_API_KEY is not set in .env — get a free key at https://aistudio.google.com');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
}

/**
 * Wrap a Gemini generateContent call with:
 *  - one automatic retry on transient 503 (model overloaded)
 *  - clear error messages for the common failure modes
 *
 * @param {object} model           the GenerativeModel returned by getGeminiModel()
 * @param {Array}  parts           array passed straight to model.generateContent
 * @returns {Promise<any>}         the Gemini response object
 */
async function geminiCall(model, parts) {
  const attempt = async () => model.generateContent(parts);
  try {
    return await attempt();
  } catch (err) {
    const msg = err?.message || '';
    // 503: Gemini overloaded — quick retry once with backoff
    if (msg.includes('503') || /currently experiencing high demand|overloaded/i.test(msg)) {
      logger.warn('Gemini 503 — retrying once after 2s');
      await new Promise(r => setTimeout(r, 2000));
      try {
        return await attempt();
      } catch (err2) {
        const msg2 = err2?.message || '';
        if (msg2.includes('503') || /high demand|overloaded/i.test(msg2)) {
          throw new RateLimitError('Gemini AI is overloaded right now — please try again in a minute.');
        }
        throw err2;
      }
    }
    if (msg.includes('429') || /quota|rate limit/i.test(msg)) {
      throw new RateLimitError('Gemini rate limit hit — wait 1 minute and try again (1500 free scans/day).');
    }
    if (msg.includes('leaked') || msg.includes('403')) {
      throw new UnauthorizedError('GEMINI_API_KEY is invalid or revoked. Get a fresh key at aistudio.google.com/app/apikey');
    }
    if (/API_KEY|not set/i.test(msg)) {
      throw new BadRequestError('GEMINI_API_KEY not set in backend .env — get a free key at aistudio.google.com/app/apikey');
    }
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
   VISION EXTRACTION PROMPT — region-aware
───────────────────────────────────────────────────────────── */

/**
 * Builds a Gemini extraction prompt tailored to the outlet's region.
 * Region drives currency symbols, examples, and "veg/non-veg/egg" dietary
 * conventions (the egg-as-its-own-row pattern is specific to India).
 *
 * @param {object} ctx
 * @param {string} [ctx.region='IN']     'IN' or 'AU'
 * @param {string} [ctx.currency='INR']  ISO currency code
 * @returns {string}                     the prompt
 */
function buildMenuPrompt(ctx = {}) {
  const region = (ctx.region || 'IN').toUpperCase();
  const isAU = region === 'AU';
  const currency = (ctx.currency || (isAU ? 'AUD' : 'INR')).toUpperCase();

  // Region-specific currency examples — these are the patterns Gemini will see.
  const currencyBlock = isAU
    ? `CURRENCY CONTEXT — this outlet is in AUSTRALIA (currency: AUD):
- Prices will use $, A$, AU$. Examples: "$8" → 8, "A$12.50" → 12.50, "AU$22" → 22.
- "8" or "8.00" on its own → 8.
- Tax (GST) is usually included or shown separately. Use the menu-shown price.
- NEVER multiply by 100. "$8" is eight dollars — base_price is 8.`
    : `CURRENCY CONTEXT — this outlet is in INDIA (currency: INR):
- Prices will use ₹, Rs., Rs, INR, or the "/-" Indian-style suffix. Examples:
    "₹120" → 120, "Rs.250" → 250, "Rs 80" → 80, "INR 100" → 100,
    "40/-" → 40 (the /- means "rupees only" — it is NOT a multiplier),
    "150 /-" → 150, "10.50" → 10.50.
- NEVER multiply by 100, NEVER add zeros. "100/-" is 100 rupees, not 10000 paise.
- If you see only a number without symbol, treat it as whole rupees.`;

  // Region-specific dietary block. "egg" as its own row is an Indian menu pattern.
  const dietaryBlock = isAU
    ? `DIETARY:
- food_type: exactly one of "veg" or "non_veg". (Australian menus rarely mark this — guess from item name. Default to "non_veg" only if the item clearly contains beef, lamb, chicken, fish, prawn, pork, seafood; otherwise "veg".)
- DO NOT use "egg" as a food_type for Australian menus.`
    : `DIETARY:
- food_type: exactly one of "veg", "non_veg", or "egg".
- Indian menus sometimes show a row labeled "VEG / NON-VEG / EGG" near a dish — that is a column header for THAT dish, NOT three separate items. Map it to one item with the appropriate food_type.
- Use "non_veg" if the dish contains chicken, mutton, fish, prawn, lamb, beef, pork, kheema, seafood, eggs visibly cooked into the dish.
- Use "egg" only if the dish IS an egg preparation (omelette, bhurji, egg curry, anda biryani, half-fry).
- Use "veg" otherwise.`;

  return `You are a precise menu data extractor for a restaurant POS. Your output is consumed directly by a database — accuracy is more important than completeness.

Return ONLY a valid JSON object. No markdown fences, no commentary, just raw JSON.

OUTPUT SCHEMA:
{
  "categories": [
    {
      "name": "CATEGORY NAME exactly as printed",
      "items": [
        {
          "name": "Item Name exactly as printed on the menu",
          "description": "ingredient line or sub-text shown beneath the item, if any",
          "base_price": 120,
          "food_type": "veg" | "non_veg" | "egg",
          "variants": [
            { "name": "Regular", "price": 120, "price_addition": 0 },
            { "name": "Medium",  "price": 180, "price_addition": 60 },
            { "name": "Large",   "price": 240, "price_addition": 120 }
          ]
        }
      ]
    }
  ],
  "combos": [
    {
      "name": "Combo Name",
      "description": "what's included",
      "price": 350
    }
  ]
}

${currencyBlock}

${dietaryBlock}

NAME EXTRACTION RULES (zero-tolerance, this is the #1 source of bugs):
- Copy the dish name LETTER-FOR-LETTER from the menu — keep case, punctuation, abbreviations.
- DO NOT translate, paraphrase, expand, shorten, or "fix" the name.
- DO NOT invent items the menu does not show.
- DO NOT split a single dish name into multiple items.
- DO NOT merge two dishes into one.
- A bare label like "VEG", "NON-VEG", "EGG", "JAIN", "HALF", "FULL", "REGULAR", "SMALL", "MEDIUM", "LARGE", "SPICY", "EXTRA", "CHEESE" is NEVER an item name — it is a marker / variant / column header for the dish next to it. Skip standalone occurrences. If those words appear inside a longer dish name (e.g. "Egg Bhurji", "Half Plate Biryani"), keep them as part of the name.
- Section banners ("STARTERS", "MAIN COURSE", "BEVERAGES") become CATEGORY names, not item names.
- Promotional text, taglines, address, phone numbers, GSTIN, FSSAI numbers, social handles, and disclaimers ("Prices subject to change", "Taxes extra") are NOT items.

PRICE RULES:
- base_price is a number (not a string), in whole currency units per the CURRENCY CONTEXT above.
- If multiple sizes are shown for one dish, use the lowest price for base_price and list all sizes as variants.
- price_addition on a variant = (variant_price - base_price). Set to 0 for the smallest size.
- Round to 2 decimal places maximum.

VARIANT RULES:
- Pizzas with Regular / Medium / Large columns → 3 variants in that order.
- Half / Full or Quarter / Half / Full → 2 or 3 variants in that order.
- R / M / L → expand to Regular / Medium / Large.
- S / M / L → expand to Small / Medium / Large.
- If only one size is shown, omit the variants array (or leave it empty).
- Variants are sizes of the SAME dish — never use variants to list different dishes.

COMBO RULES:
- Items in a "Combo", "Meal Deal", "Family Pack", "Thali" section go into the top-level combos array, not categories[].items[].
- Combo description should list what's included.

EXCLUDE COMPLETELY:
- "Extra cheese", "Add ons", "Extra sauce", "Add chicken" toppings unless they are a separate priced item on a separate addon row — and even then, only if the rest of the menu has real addons.
- Headers like "Our Specialties", "Chef's Recommendation", "Most Popular".
- Allergen disclaimers, dietary icons legends, GST notes.

FINAL CHECKS before returning:
- Every item.name is at least 3 characters and contains at least one letter.
- Every item.base_price is a positive number.
- No two items in the same category have the exact same name.
- The category list is non-empty.

Output region tag (debug): ${region}/${currency}.`;
}

/* ─────────────────────────────────────────────────────────────
   MAIN OCR via Gemini Vision
───────────────────────────────────────────────────────────── */

async function scanMenuImage(imageBuffer, mimeType, ctx = {}) {
  logger.info('AI Menu Scan started via Gemini Vision', { region: ctx.region, currency: ctx.currency });

  const model = getGeminiModel();
  const mime = mimeType || 'image/jpeg';

  const result = await geminiCall(model, [
    buildMenuPrompt(ctx),
    { inlineData: { data: imageBuffer.toString('base64'), mimeType: mime } },
  ]);

  const raw = result.response.text().trim();
  logger.info('Gemini response received', { chars: raw.length, preview: raw.slice(0, 200) });

  const structured = parseAndSanitiseGeminiResponse(raw, ctx);

  const totalItems = structured.categories.reduce((s, c) => s + c.items.length, 0);
  logger.info('Menu extraction complete', {
    categories: structured.categories.length,
    items: totalItems,
    combos: (structured.combos || []).length,
  });

  return structured;
}

/* ─────────────────────────────────────────────────────────────
   SHARED PARSE + SANITISE (post-Gemini)
───────────────────────────────────────────────────────────── */

// Tokens that, when standing alone as an item name, are clearly column
// headers / dietary markers / size labels — never real menu items.
// We strip them after extraction as a safety net even if the prompt holds.
const ITEM_NAME_BLOCKLIST = new Set([
  'veg', 'non-veg', 'non veg', 'nonveg', 'egg', 'jain',
  'half', 'full', 'quarter', 'plate', 'portion',
  'small', 'medium', 'large', 'regular', 'mini', 'jumbo',
  's', 'm', 'l', 'xl', 'r',
  'spicy', 'mild', 'extra', 'add-on', 'addon', 'add on',
  'starters', 'mains', 'main course', 'desserts', 'beverages', 'drinks',
  'price', 'prices', 'rate', 'rates', 'cost', 'taxes', 'gst',
  'menu', 'category', 'item', 'name',
]);

/**
 * Parses Gemini's raw text response and sanitises every item.
 * Drops obvious junk (blocklisted single-word names, zero-price rows,
 * malformed entries) so the Review screen never shows "Egg" as an item.
 *
 * @param {string} rawText        Gemini's raw response
 * @param {object} ctx            { region, currency } — currently used for logging only
 * @returns {{categories: Array, combos?: Array}}
 */
function parseAndSanitiseGeminiResponse(rawText, ctx = {}) {
  const jsonStr = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let structured;
  try {
    structured = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('Gemini JSON parse failed', { raw: rawText.slice(0, 500), region: ctx.region });
    throw new BadRequestError('Gemini returned invalid JSON — try again with a clearer source.');
  }

  if (!structured || typeof structured !== 'object') {
    structured = { categories: [] };
  }
  if (!Array.isArray(structured.categories)) structured.categories = [];
  if (!Array.isArray(structured.combos)) structured.combos = [];

  let droppedItems = 0;
  let droppedCats = 0;

  for (const cat of structured.categories) {
    cat.name = String(cat.name || '').trim();
    const rawItems = Array.isArray(cat.items) ? cat.items : [];

    const seenNames = new Set();
    const kept = [];
    for (const item of rawItems) {
      const name = String(item?.name || '').trim();
      const normalisedKey = name.toLowerCase();

      // Skip empty / single-character names.
      if (!name || name.length < 2) { droppedItems++; continue; }
      // Skip bare dietary / size markers — these are columns, not items.
      if (ITEM_NAME_BLOCKLIST.has(normalisedKey)) { droppedItems++; continue; }
      // Skip names that are only numbers / punctuation.
      if (!/[a-zA-Zऀ-ॿ一-鿿]/.test(name)) { droppedItems++; continue; }
      // Dedupe within the same category.
      if (seenNames.has(normalisedKey)) { droppedItems++; continue; }
      seenNames.add(normalisedKey);

      const base_price = parseFloat(item.base_price);
      const variants = Array.isArray(item.variants) ? item.variants : [];

      const cleanVariants = variants
        .map((v, i) => {
          const vName = String(v?.name || '').trim() || `Size ${i + 1}`;
          const vPrice = parseFloat(v?.price);
          const vAdd = parseFloat(v?.price_addition);
          return {
            name: vName,
            price: isFinite(vPrice) && vPrice > 0 ? vPrice : 0,
            price_addition: isFinite(vAdd) ? vAdd : (isFinite(vPrice) && isFinite(base_price) ? Math.max(0, vPrice - base_price) : 0),
          };
        })
        .filter(v => v.name && v.price >= 0);

      // Either base_price or at least one variant must give us a price.
      const effectivePrice = isFinite(base_price) && base_price > 0
        ? base_price
        : (cleanVariants[0]?.price || 0);
      if (effectivePrice <= 0) { droppedItems++; continue; }

      const food_type = ['veg', 'non_veg', 'egg'].includes(String(item.food_type || '').toLowerCase())
        ? String(item.food_type).toLowerCase()
        : 'veg';

      kept.push({
        name,
        description: String(item.description || '').trim(),
        base_price: Math.round(effectivePrice * 100) / 100,
        food_type,
        variants: cleanVariants,
        addons: [],
      });
    }
    cat.items = kept;
  }

  // Drop any category that ended up empty after item-level filtering.
  structured.categories = structured.categories.filter(c => {
    if (!c.name || !c.items.length) { droppedCats++; return false; }
    return true;
  });

  // Sanitise combos.
  structured.combos = structured.combos
    .map(c => ({
      name: String(c?.name || '').trim(),
      description: String(c?.description || '').trim(),
      price: parseFloat(c?.price ?? c?.combo_price) || 0,
    }))
    .filter(c => c.name && c.price > 0);

  if (droppedItems || droppedCats) {
    logger.info('Sanitised Gemini output', { droppedItems, droppedCats, region: ctx.region });
  }
  return structured;
}

/* ─────────────────────────────────────────────────────────────
   SYNC REVIEWED MENU TO DB
───────────────────────────────────────────────────────────── */

/* ─── small input sanitisers — schema has tight VarChars + Decimals.
       Bad Gemini output (long descriptions in the food_type field,
       names over 200 chars, etc.) is silently truncated/normalised
       so the whole sync doesn't abort on one ugly row. */
const VALID_FOOD_TYPES = new Set(['veg', 'non_veg', 'egg']);
const trimTo = (s, n) => {
  if (!s && s !== 0) return '';
  const str = String(s).trim();
  return str.length > n ? str.slice(0, n) : str;
};
const cleanFoodType = (v) => VALID_FOOD_TYPES.has(String(v || '').toLowerCase())
  ? String(v).toLowerCase() : 'veg';
const cleanPrice = (v) => {
  const n = parseFloat(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;   // 2dp
};

async function syncMenu(outletId, data) {
  const prisma = getDbClient();
  const results = {
    categoriesCreated: 0,
    itemsCreated: 0,
    variantsCreated: 0,
    addonsCreated: 0,
    combosCreated: 0,
    errors: [],
  };

  // Batched bulk-insert strategy — avoids the per-row INSERT round-trip that
  // made 200+ item menus take 2–3 min and overshoot the frontend axios timeout.
  //
  // 1. Look up existing categories once, create the new ones in one createMany.
  // 2. createManyAndReturn all menu items in one shot.
  // 3. createMany variants + addons in one shot using the parent IDs from step 2.
  // 4. createMany combos.
  await prisma.$transaction(async (tx) => {
    // ── 1. Categories ─────────────────────────────────────────────
    const inputCats = (data.categories || []).map((c) => ({
      ...c,
      name: trimTo(c.name, 100) || 'Uncategorised',
    }));
    const uniqueCatNames = [...new Set(inputCats.map((c) => c.name))];

    const existingCats = uniqueCatNames.length
      ? await tx.menuCategory.findMany({
          where: { outlet_id: outletId, name: { in: uniqueCatNames }, is_deleted: false },
          select: { id: true, name: true },
        })
      : [];
    const existingCatByName = new Map(existingCats.map((c) => [c.name, c.id]));

    const catsToCreate = uniqueCatNames
      .filter((n) => !existingCatByName.has(n))
      .map((name, i) => ({ name, outlet_id: outletId, display_order: i }));

    if (catsToCreate.length) {
      const created = await tx.menuCategory.createManyAndReturn({
        data: catsToCreate,
        select: { id: true, name: true },
      });
      for (const c of created) existingCatByName.set(c.name, c.id);
      results.categoriesCreated = created.length;
    }

    // ── 2. Items (batched createManyAndReturn so we keep ids) ─────
    // Walk every item once, build a flat row array + a parallel `meta` array
    // that remembers each row's variants and addons so we can wire them up
    // after we know the inserted menu_item ids.
    const itemRows = [];
    const itemMeta = [];   // { variants, addons, name }
    for (const catData of inputCats) {
      const categoryId = existingCatByName.get(catData.name);
      if (!categoryId) continue;
      for (const itemData of (catData.items || [])) {
        const itemName = trimTo(itemData.name, 200);
        if (!itemName) {
          results.errors.push(`Empty item name skipped in "${catData.name}"`);
          continue;
        }
        itemRows.push({
          name: itemName,
          description: trimTo(itemData.description || '', 2000),
          short_code: trimTo(itemData.short_code || '', 20) || null,
          image_url: itemData.image_url || null,
          base_price: cleanPrice(itemData.base_price),
          category_id: categoryId,
          outlet_id: outletId,
          food_type: cleanFoodType(itemData.food_type),
          kitchen_station: 'KITCHEN',
          is_active: true,
          is_available: true,
        });
        itemMeta.push({
          name: itemName,
          variants: itemData.variants || [],
          addons: itemData.addons || [],
        });
      }
    }

    let createdItems = [];
    if (itemRows.length) {
      createdItems = await tx.menuItem.createManyAndReturn({
        data: itemRows,
        select: { id: true },
      });
      results.itemsCreated = createdItems.length;
    }

    // ── 3a. Variants — one giant createMany ───────────────────────
    const variantRows = [];
    for (let i = 0; i < createdItems.length; i++) {
      const itemId = createdItems[i].id;
      const meta = itemMeta[i];
      meta.variants.forEach((v, vIdx) => {
        const vName = trimTo(v.name, 100) || `Size ${vIdx + 1}`;
        variantRows.push({
          menu_item_id: itemId,
          name: vName,
          price_addition: cleanPrice(v.price_addition ?? v.price ?? 0),
          is_active: true,
          is_default: vIdx === 0,
          display_order: vIdx,
        });
      });
    }
    if (variantRows.length) {
      const r = await tx.itemVariant.createMany({ data: variantRows });
      results.variantsCreated = r.count;
    }

    // ── 3b. Addons — one AddonGroup per item that has addons. ────
    // Group rows first, capture ids via createManyAndReturn, then flat-insert
    // the addon items pointing to the right group.
    const addonGroupRows = [];
    const addonGroupItemIdx = [];   // parallel index into createdItems
    for (let i = 0; i < createdItems.length; i++) {
      const meta = itemMeta[i];
      if (meta.addons?.length > 0) {
        addonGroupRows.push({
          name: 'Add-ons',
          outlet_id: outletId,
          is_required: false,
          min_selection: 0,
          max_selection: meta.addons.length,
        });
        addonGroupItemIdx.push(i);
      }
    }
    let addonGroups = [];
    if (addonGroupRows.length) {
      addonGroups = await tx.addonGroup.createManyAndReturn({
        data: addonGroupRows,
        select: { id: true },
      });
    }

    const addonRows = [];
    for (let g = 0; g < addonGroups.length; g++) {
      const itemIdx = addonGroupItemIdx[g];
      const groupId = addonGroups[g].id;
      const itemId = createdItems[itemIdx].id;
      const meta = itemMeta[itemIdx];
      meta.addons.forEach((a, aIdx) => {
        const aName = trimTo(a.name, 100);
        if (!aName) return;
        addonRows.push({
          addon_group_id: groupId,
          menu_item_id: itemId,
          name: aName,
          price: cleanPrice(a.price),
          is_active: true,
          display_order: aIdx,
        });
      });
    }
    if (addonRows.length) {
      const r = await tx.itemAddon.createMany({ data: addonRows });
      results.addonsCreated = r.count;
    }

    // ── 4. Combos ─────────────────────────────────────────────────
    const comboRows = [];
    for (const c of (data.combos || [])) {
      const comboName = trimTo(c.name, 200);
      if (!comboName) continue;
      comboRows.push({
        outlet_id: outletId,
        name: comboName,
        description: trimTo(c.description || '', 2000),
        combo_price: cleanPrice(c.price ?? c.combo_price ?? 0),
        is_active: true,
      });
    }
    if (comboRows.length) {
      const r = await tx.itemCombo.createMany({ data: comboRows });
      results.combosCreated = r.count;
    }
  }, {
    maxWait: 30000,      // wait up to 30s to acquire a connection
    timeout: 120000,     // batched inserts finish in well under a min for 500+ items
  });

  logger.info('Menu sync complete', results);
  return results;
}

/* ═════════════════════════════════════════════════════════════
   ADDITIONAL INPUT MODES — all funnel into the same JSON schema
   so the frontend Review screen handles every result the same way.
═════════════════════════════════════════════════════════════ */

/**
 * Shared Gemini text-prompt → structured-menu helper.
 * Used by the text / URL / CSV importers.
 *
 * @param {string} rawText
 * @param {string} sourceHint
 * @param {object} ctx { region, currency }
 */
async function structureMenuFromText(rawText, sourceHint = 'menu text', ctx = {}) {
  if (!rawText || !rawText.trim()) {
    throw new BadRequestError('No text content was extracted to parse.');
  }
  const model = getGeminiModel();
  const prompt = `${buildMenuPrompt(ctx)}

INPUT (${sourceHint}):
"""
${rawText.slice(0, 50000)}
"""

Treat the input above the same way you would a photo of a menu. Extract every item.`;

  const result = await geminiCall(model, [prompt]);
  const raw = result.response.text().trim();
  return parseAndSanitiseGeminiResponse(raw, ctx);
}

/**
 * Mode 2: PDF upload. Gemini Vision handles application/pdf natively.
 */
async function scanMenuPdf(pdfBuffer, ctx = {}) {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new BadRequestError('Empty PDF upload.');
  }
  logger.info('AI Menu Scan started via Gemini PDF', { bytes: pdfBuffer.length, region: ctx.region });

  const model = getGeminiModel();
  const result = await geminiCall(model, [
    buildMenuPrompt(ctx),
    { inlineData: { data: pdfBuffer.toString('base64'), mimeType: 'application/pdf' } },
  ]);

  const raw = result.response.text().trim();
  return parseAndSanitiseGeminiResponse(raw, ctx);
}

/**
 * Mode 3: Paste / typed text — owner pastes a menu from email, Word, etc.
 */
async function parseMenuFromText(text, ctx = {}) {
  return structureMenuFromText(text, 'pasted text from owner', ctx);
}

/* ─────────────────────────────────────────────────────────────
   URL crawler internals
───────────────────────────────────────────────────────────── */

/** One-shot fetch with timeout. Returns the HTML string or null on failure. */
async function fetchHtml(url, timeoutMs = 12000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 MSRM-MenuBot/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  }
}

/** Convert HTML → plain text by stripping scripts/styles/tags. */
function stripHtml(html) {
  return (html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Path tokens that strongly suggest a menu page (multilingual considered later).
const MENU_KEYWORDS = [
  'menu', 'menus', 'food', 'eat', 'eats',
  'lunch', 'dinner', 'breakfast', 'brunch',
  'starters', 'entrees', 'mains', 'sides', 'desserts', 'dessert',
  'specials', 'kids', 'drinks', 'beverages', 'cocktails', 'wine', 'beer',
  'pizza', 'pizzas', 'pasta', 'burgers', 'salads', 'sandwiches',
  'snacks', 'coffee', 'tea', 'order',
];

// Anti-patterns — paths that look menu-ish but aren't (cart/checkout/blog/auth).
const MENU_BLOCKLIST = [
  'cart', 'checkout', 'account', 'login', 'signin', 'signup', 'register',
  'contact', 'about', 'blog', 'news', 'careers', 'jobs', 'press',
  'gallery', 'reservation', 'reservations', 'book', 'booking',
  'privacy', 'terms', 'faq', 'help', 'support',
  'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'linkedin',
];

/**
 * Returns true if a URL is likely a menu sub-page.
 * Considers path tokens, link text, and excludes obvious non-menu paths.
 */
function looksLikeMenuLink(href, linkText, basePath) {
  const path = (href || '').toLowerCase();
  const text = (linkText || '').toLowerCase();

  // Exclude if path or text matches a blocklist token.
  for (const bad of MENU_BLOCKLIST) {
    const re = new RegExp(`(?:^|[\\/_-])${bad}(?:[\\/_-]|$)`, 'i');
    if (re.test(path) || re.test(text)) return false;
  }
  // Include if path or text contains a menu keyword.
  for (const good of MENU_KEYWORDS) {
    const re = new RegExp(`(?:^|[\\/_-])${good}(?:[\\/_-]|$|\\b)`, 'i');
    if (re.test(path) || re.test(text)) return true;
  }
  return false;
}

/**
 * Discover menu sub-pages by scraping <a href> elements from the seed HTML.
 * Filters to same-origin, dedupes, scores by likelihood, and caps the list.
 *
 * @param {string} seedUrl  URL the user pasted
 * @param {string} html     HTML of the seed page
 * @param {number} cap      Maximum sub-pages to follow
 * @returns {string[]} ordered list of candidate menu URLs (excluding seed)
 */
function discoverMenuLinks(seedUrl, html, cap = 10) {
  const base = new URL(seedUrl);
  const found = new Map();   // canonical href → linkText

  // Extract <a> tags. Tolerant regex — Gemini doesn't need perfection.
  const re = /<a\b[^>]*\bhref\s*=\s*(['"])([^'"]+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[2];
    const innerText = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let absolute;
    try {
      absolute = new URL(rawHref, seedUrl).toString();
    } catch (_) { continue; }
    // Same origin only.
    const u = new URL(absolute);
    if (u.origin !== base.origin) continue;
    // Drop fragment + trailing slash for dedup.
    u.hash = '';
    const canonical = u.toString().replace(/\/+$/, '');
    if (canonical === seedUrl.replace(/\/+$/, '')) continue;
    if (found.has(canonical)) continue;
    if (!looksLikeMenuLink(u.pathname + u.search, innerText, base.pathname)) continue;
    found.set(canonical, innerText);
    if (found.size >= cap * 3) break; // hard limit to avoid huge pages
  }

  // Rank: paths containing 'menu' first, then by ascending depth (shorter paths
  // usually mean main category pages), capped at `cap`.
  return [...found.keys()]
    .sort((a, b) => {
      const aM = /menu/i.test(a) ? 0 : 1;
      const bM = /menu/i.test(b) ? 0 : 1;
      if (aM !== bM) return aM - bM;
      const aDepth = new URL(a).pathname.split('/').filter(Boolean).length;
      const bDepth = new URL(b).pathname.split('/').filter(Boolean).length;
      return aDepth - bDepth;
    })
    .slice(0, cap);
}

/**
 * Mode 4: Fetch URL → strip HTML → parse with Gemini.
 * When `crawl=true`, also discovers and fetches up to 10 menu sub-pages on
 * the same domain, then concatenates all text into one prompt.
 *
 * @param {string} url
 * @param {object} opts
 * @param {boolean} [opts.crawl=true]   follow menu-like links on the same domain
 * @param {number}  [opts.maxPages=10]
 * @returns {Promise<object>} structured menu
 */
async function parseMenuFromUrl(url, opts = {}) {
  const { crawl = true, maxPages = 10, ctx = {} } = opts;
  if (!/^https?:\/\//i.test(url || '')) {
    throw new BadRequestError('URL must start with http:// or https://');
  }

  // ── Seed page ─────────────────────────────────────────────
  const seedHtml = await fetchHtml(url, 12000);
  if (!seedHtml) throw new BadRequestError('Could not fetch the URL (4xx/5xx or network error).');
  const seedText = stripHtml(seedHtml);
  const seedTitleMatch = seedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const seedTitle = seedTitleMatch ? stripHtml(seedTitleMatch[1]) : '';

  if (!crawl) {
    if (seedText.length < 50) {
      throw new BadRequestError('Page had almost no text — menu may be loaded by JavaScript. Try the URL of the actual menu page.');
    }
    return structureMenuFromText(seedText, `webpage: ${url}`, ctx);
  }

  // ── Discover + fetch sub-pages in parallel ────────────────
  const subUrls = discoverMenuLinks(url, seedHtml, maxPages);
  logger.info('Crawler: discovered sub-pages', { seed: url, count: subUrls.length, urls: subUrls });

  let combinedText = `[Source: ${url}]\n[Page title: ${seedTitle}]\n\n${seedText}`;
  const visitedPages = [{ url, chars: seedText.length, ok: true }];

  if (subUrls.length > 0) {
    const results = await Promise.allSettled(
      subUrls.map(u => fetchHtml(u, 10000).then(html => ({ url: u, html })))
    );
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value?.html) {
        visitedPages.push({ url: r.value?.url || '?', chars: 0, ok: false });
        continue;
      }
      const t = stripHtml(r.value.html);
      if (t.length < 80) {
        visitedPages.push({ url: r.value.url, chars: t.length, ok: false });
        continue;
      }
      const title = (r.value.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
      combinedText += `\n\n────────\n[Source: ${r.value.url}]\n[Page title: ${stripHtml(title)}]\n\n${t}`;
      visitedPages.push({ url: r.value.url, chars: t.length, ok: true });
    }
  }

  if (combinedText.length < 200) {
    throw new BadRequestError('All fetched pages were almost empty — the menu is likely rendered by JavaScript.');
  }

  // Cap total payload sent to Gemini.
  if (combinedText.length > 200000) combinedText = combinedText.slice(0, 200000);

  logger.info('Crawler: combined text ready', { totalChars: combinedText.length, pages: visitedPages.filter(p => p.ok).length });
  const result = await structureMenuFromText(
    combinedText,
    `${visitedPages.filter(p => p.ok).length} page(s) crawled from ${new URL(url).origin}`,
    ctx
  );
  // Surface which pages contributed (frontend can show this in the review screen)
  result._crawl = { seedUrl: url, visitedPages };
  return result;
}

/**
 * Mode 5: CSV/TSV upload. Convert tabular text → Gemini text prompt.
 * We don't try to guess columns ourselves — Gemini reads it like a menu.
 */
async function parseMenuFromCsv(csvBuffer, mimetype = 'text/csv', ctx = {}) {
  if (!csvBuffer || csvBuffer.length === 0) throw new BadRequestError('Empty file.');
  const text = csvBuffer.toString('utf8');
  if (!text.trim()) throw new BadRequestError('File contained no text.');
  // Hint Gemini about the structure
  const hint = `tabular data (likely CSV or TSV export from another POS / spreadsheet).
Common column names include: name, item, category, price, base_price, type, food_type, variant, size, description, veg, half, full, regular, medium, large.
If you see Half/Full or R/M/L columns, treat them as variants of the same item.`;
  return structureMenuFromText(`${hint}\n\nDATA:\n${text}`, mimetype, ctx);
}

/**
 * Resolves the outlet's region+currency context for region-aware prompting.
 * Falls back to IN/INR if anything's missing so the system stays usable
 * for malformed seed data.
 *
 * @param {string} outletId
 * @returns {Promise<{region: string, currency: string}>}
 */
async function getOutletContext(outletId) {
  if (!outletId) return { region: 'IN', currency: 'INR' };
  try {
    const prisma = getDbClient();
    const o = await prisma.outlet.findUnique({
      where: { id: outletId },
      select: {
        currency: true,
        country: true,
        head_office: { select: { region: true, currency: true } },
      },
    });
    if (!o) return { region: 'IN', currency: 'INR' };
    // Prefer head office region (it's the canonical regulatory region).
    // Outlet's own currency wins over head office for display.
    const region = o.head_office?.region
      || (/(australia|new zealand)/i.test(o.country || '') ? 'AU' : 'IN');
    const currency = o.currency || o.head_office?.currency || (region === 'AU' ? 'AUD' : 'INR');
    return { region: region.toUpperCase(), currency: currency.toUpperCase() };
  } catch (err) {
    logger.warn('getOutletContext fallback to IN/INR', { error: err.message, outletId });
    return { region: 'IN', currency: 'INR' };
  }
}

module.exports = {
  scanMenuImage,
  scanMenuPdf,
  parseMenuFromText,
  parseMenuFromUrl,
  parseMenuFromCsv,
  syncMenu,
  getOutletContext,
  // Exposed for unit testing — pure functions, safe to expose.
  _buildMenuPrompt: buildMenuPrompt,
  _parseAndSanitiseGeminiResponse: parseAndSanitiseGeminiResponse,
};
