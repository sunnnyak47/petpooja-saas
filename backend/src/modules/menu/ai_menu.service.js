/**
 * @fileoverview AI Menu Sync Service — Gemini Vision (gemini-1.5-flash, free 1500 req/day).
 * Pipeline: image → Gemini Vision (gemini-2.5-flash-lite) → structured JSON → DB.
 * Get a free API key at https://aistudio.google.com
 * @module modules/menu/ai_menu.service
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../config/logger');
const { getDbClient } = require('../../config/database');

/* ─────────────────────────────────────────────────────────────
   GEMINI CLIENT
───────────────────────────────────────────────────────────── */

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env — get a free key at https://aistudio.google.com');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
}

/* ─────────────────────────────────────────────────────────────
   VISION EXTRACTION PROMPT
───────────────────────────────────────────────────────────── */

const MENU_PROMPT = `You are a restaurant menu data extractor. Look at this menu image carefully and extract ALL items.

Return ONLY a valid JSON object — no markdown, no explanation, just raw JSON.

Format:
{
  "categories": [
    {
      "name": "CATEGORY NAME",
      "items": [
        {
          "name": "Item Name",
          "description": "ingredients or description if shown",
          "base_price": 100,
          "food_type": "veg" or "non_veg",
          "variants": [
            { "name": "Regular", "price": 100, "price_addition": 0 },
            { "name": "Medium",  "price": 200, "price_addition": 100 },
            { "name": "Large",   "price": 300, "price_addition": 200 }
          ]
        }
      ]
    }
  ]
}

Rules:
- Extract EVERY item visible — do not skip any.
- For pizzas with R / M / L columns: use variants named Regular, Medium, Large.
- For 2-size items: use Half / Full.
- base_price = the lowest / first price shown.
- food_type: "non_veg" if item contains chicken, mutton, egg, fish, prawn; otherwise "veg".
- description: the ingredient line shown in parentheses or below the item name, if any.
- Ignore promotional text, daily offers, address, phone numbers, logos, QR codes.
- Include combo items and snacks as their own categories.
- Do NOT include "Extra Topping", "Extra Sauce", combo header rows in items list.
`;

/* ─────────────────────────────────────────────────────────────
   MAIN OCR via Gemini Vision
───────────────────────────────────────────────────────────── */

async function scanMenuImage(imageBuffer, mimeType) {
  logger.info('AI Menu Scan started via Gemini Vision');

  const model = getGeminiModel();
  const mime = mimeType || 'image/jpeg';

  let result;
  try {
    result = await model.generateContent([
      MENU_PROMPT,
      { inlineData: { data: imageBuffer.toString('base64'), mimeType: mime } },
    ]);
  } catch (err) {
    if (err.message?.includes('limit: 0') || err.message?.includes('free_tier')) {
      throw new Error('Gemini API key has no free quota. Get a fresh key from aistudio.google.com/app/apikey and set GEMINI_API_KEY in .env');
    }
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error('Gemini rate limit hit — wait 1 minute and try again (1500 free scans/day)');
    }
    if (err.message?.includes('API_KEY') || err.message?.includes('not set')) {
      throw new Error('GEMINI_API_KEY not set in backend .env — get a free key at aistudio.google.com/app/apikey');
    }
    throw err;
  }

  const raw = result.response.text().trim();
  logger.info('Gemini response received', { chars: raw.length, preview: raw.slice(0, 200) });

  // Strip markdown code fences if Gemini wraps in ```json ... ```
  const jsonStr = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let structured;
  try {
    structured = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('JSON parse failed', { raw: raw.slice(0, 500) });
    throw new Error('Gemini returned invalid JSON — try again or use a clearer photo.');
  }

  if (!structured.categories || !Array.isArray(structured.categories)) {
    structured = { categories: [] };
  }

  // Sanitise numeric fields
  for (const cat of structured.categories) {
    cat.items = (cat.items || []).map(item => ({
      ...item,
      base_price: parseFloat(item.base_price) || 0,
      variants: (item.variants || []).map((v, i) => ({
        name: v.name || `Size ${i + 1}`,
        price: parseFloat(v.price) || 0,
        price_addition: parseFloat(v.price_addition) ?? (i === 0 ? 0 : parseFloat(v.price) - parseFloat((cat.items.find(x => x.name === item.name) || item).base_price)),
      })),
      food_type: item.food_type === 'non_veg' ? 'non_veg' : 'veg',
      description: item.description || '',
      addons: [],
    }));
  }

  const totalItems = structured.categories.reduce((s, c) => s + c.items.length, 0);
  logger.info('Menu extraction complete', {
    categories: structured.categories.length,
    items: totalItems,
  });

  return structured;
}

/* ─────────────────────────────────────────────────────────────
   SYNC REVIEWED MENU TO DB
───────────────────────────────────────────────────────────── */

async function syncMenu(outletId, data) {
  const prisma = getDbClient();
  const results = { categoriesCreated: 0, itemsCreated: 0, variantsCreated: 0, addonsCreated: 0 };

  await prisma.$transaction(async (tx) => {
    for (const catData of data.categories) {
      let category = await tx.menuCategory.findFirst({
        where: { outlet_id: outletId, name: catData.name },
      });
      if (!category) {
        category = await tx.menuCategory.create({
          data: { name: catData.name, outlet_id: outletId, display_order: results.categoriesCreated },
        });
        results.categoriesCreated++;
      }

      for (const itemData of catData.items) {
        const item = await tx.menuItem.create({
          data: {
            name: itemData.name,
            description: itemData.description || '',
            base_price: parseFloat(itemData.base_price) || 0,
            category_id: category.id,
            outlet_id: outletId,
            food_type: itemData.food_type || 'veg',
            kitchen_station: 'KITCHEN',
            is_active: true,
          },
        });
        results.itemsCreated++;

        for (const v of (itemData.variants || [])) {
          await tx.itemVariant.create({
            data: {
              menu_item_id: item.id,
              name: v.name,
              price_addition: parseFloat(v.price_addition ?? v.price ?? 0),
              is_active: true,
            },
          });
          results.variantsCreated++;
        }

        if (itemData.addons?.length > 0) {
          const group = await tx.addonGroup.create({
            data: {
              name: 'Add-ons',
              outlet_id: outletId,
              is_required: false,
              min_select: 0,
              max_select: itemData.addons.length,
              menu_items: { connect: { id: item.id } },
            },
          });
          for (const a of itemData.addons) {
            await tx.addonItem.create({
              data: { addon_group_id: group.id, name: a.name, price: parseFloat(a.price || 0), is_active: true },
            });
            results.addonsCreated++;
          }
        }
      }
    }
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
 */
async function structureMenuFromText(rawText, sourceHint = 'menu text') {
  if (!rawText || !rawText.trim()) {
    throw new Error('No text content was extracted to parse.');
  }
  const model = getGeminiModel();
  const prompt = `${MENU_PROMPT}

CRITICAL PRICE RULE for the input below:
- Prices in the input may use any currency symbol: A$, AU$, $, ₹, Rs., £, €.
- "A$8" means 8 dollars (base_price: 8) — NOT 800 cents.
- "A$22" means 22 dollars (base_price: 22) — NOT 2200.
- "A$8.50" means 8.50 dollars (base_price: 8.50).
- "Rs.100" or "₹100" means 100 (base_price: 100).
- Treat base_price as a whole-currency-unit number (dollars or rupees), NEVER in cents/paise.
- Strip the currency symbol; output only the numeric value.

INPUT (${sourceHint}):
"""
${rawText.slice(0, 50000)}
"""

Treat the input above the same way you would a photo of a menu. Extract every item.`;

  let result;
  try {
    result = await model.generateContent([prompt]);
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error('Gemini rate limit hit — wait 1 minute and try again');
    }
    if (err.message?.includes('leaked') || err.message?.includes('403')) {
      throw new Error('GEMINI_API_KEY is invalid or revoked. Get a fresh key at aistudio.google.com/app/apikey');
    }
    throw err;
  }

  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let structured;
  try {
    structured = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('Gemini text→JSON parse failed', { raw: raw.slice(0, 500) });
    throw new Error('Gemini returned invalid JSON — try again with cleaner input.');
  }
  if (!structured.categories || !Array.isArray(structured.categories)) {
    structured = { categories: [] };
  }

  // Sanitise — same shape as scanMenuImage
  for (const cat of structured.categories) {
    cat.items = (cat.items || []).map(item => ({
      ...item,
      base_price: parseFloat(item.base_price) || 0,
      variants: (item.variants || []).map((v, i) => ({
        name: v.name || `Size ${i + 1}`,
        price: parseFloat(v.price) || 0,
        price_addition: parseFloat(v.price_addition ?? 0) || 0,
      })),
      food_type: item.food_type === 'non_veg' ? 'non_veg' : 'veg',
      description: item.description || '',
      addons: [],
    }));
  }
  return structured;
}

/**
 * Mode 2: PDF upload. Gemini Vision handles application/pdf natively.
 */
async function scanMenuPdf(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('Empty PDF upload.');
  }
  logger.info('AI Menu Scan started via Gemini PDF', { bytes: pdfBuffer.length });

  const model = getGeminiModel();
  let result;
  try {
    result = await model.generateContent([
      MENU_PROMPT,
      { inlineData: { data: pdfBuffer.toString('base64'), mimeType: 'application/pdf' } },
    ]);
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error('Gemini rate limit hit — wait 1 minute and try again');
    }
    if (err.message?.includes('leaked') || err.message?.includes('403')) {
      throw new Error('GEMINI_API_KEY is invalid or revoked. Get a fresh key at aistudio.google.com/app/apikey');
    }
    throw err;
  }

  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let structured;
  try { structured = JSON.parse(jsonStr); }
  catch (e) { throw new Error('Gemini returned invalid JSON from the PDF — try a different file.'); }
  if (!structured.categories || !Array.isArray(structured.categories)) structured = { categories: [] };

  for (const cat of structured.categories) {
    cat.items = (cat.items || []).map(item => ({
      ...item,
      base_price: parseFloat(item.base_price) || 0,
      variants: (item.variants || []).map((v, i) => ({
        name: v.name || `Size ${i + 1}`,
        price: parseFloat(v.price) || 0,
        price_addition: parseFloat(v.price_addition ?? 0) || 0,
      })),
      food_type: item.food_type === 'non_veg' ? 'non_veg' : 'veg',
      description: item.description || '',
      addons: [],
    }));
  }
  return structured;
}

/**
 * Mode 3: Paste / typed text — owner pastes a menu from email, Word, etc.
 */
async function parseMenuFromText(text) {
  return structureMenuFromText(text, 'pasted text from owner');
}

/**
 * Mode 4: Fetch URL → strip HTML → parse with Gemini.
 */
async function parseMenuFromUrl(url) {
  if (!/^https?:\/\//i.test(url || '')) {
    throw new Error('URL must start with http:// or https://');
  }
  let html;
  try {
    // 12s timeout, give-up early if the page is huge or slow
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 MSRM-MenuBot/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Fetch returned HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('URL took too long to load (>12s). Try a different page.');
    throw new Error(`Could not fetch URL: ${err.message}`);
  }
  // Crude HTML → text: strip script/style/comments, collapse whitespace.
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 50) throw new Error('Page had almost no text — the menu may be loaded by JavaScript and unreachable.');
  return structureMenuFromText(text, `webpage: ${url}`);
}

/**
 * Mode 5: CSV/TSV upload. Convert tabular text → Gemini text prompt.
 * We don't try to guess columns ourselves — Gemini reads it like a menu.
 */
async function parseMenuFromCsv(csvBuffer, mimetype = 'text/csv') {
  if (!csvBuffer || csvBuffer.length === 0) throw new Error('Empty file.');
  const text = csvBuffer.toString('utf8');
  if (!text.trim()) throw new Error('File contained no text.');
  // Hint Gemini about the structure
  const hint = `tabular data (likely CSV or TSV export from another POS / spreadsheet).
Common column names include: name, item, category, price, base_price, type, food_type, variant, size, description, veg, half, full, regular, medium, large.
If you see Half/Full or R/M/L columns, treat them as variants of the same item.`;
  return structureMenuFromText(`${hint}\n\nDATA:\n${text}`, mimetype);
}

module.exports = {
  scanMenuImage,
  scanMenuPdf,
  parseMenuFromText,
  parseMenuFromUrl,
  parseMenuFromCsv,
  syncMenu,
};
