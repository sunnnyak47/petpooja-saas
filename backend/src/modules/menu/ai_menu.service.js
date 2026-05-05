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

module.exports = { scanMenuImage, syncMenu };
