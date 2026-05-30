/**
 * @fileoverview Inventory AI Service — Gemini-powered suggestions, insights, and smart PO builder.
 * @module modules/inventory/inventory.ai.service
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
}

function parseJSON(raw) {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

/* ─────────────────────────────────────────────────────────────
   1. SUGGEST ITEMS FOR RESTAURANT TYPE  (Onboarding Step 1)
───────────────────────────────────────────────────────────── */

async function suggestItemsForRestaurant(restaurantType, region = 'IN') {
  const model = getModel();

  const isAU = region === 'AU';

  const prompt = isAU
    ? `You are a restaurant inventory expert for Australian restaurants.
The restaurant serves: "${restaurantType}".

Suggest 25–30 essential raw materials they would need.
Return ONLY valid JSON — no markdown, no explanation.

Format:
{
  "items": [
    {
      "name": "Tomatoes",
      "category": "Produce",
      "unit": "kg",
      "cost_per_unit": 4.50,
      "min_threshold": 5,
      "max_threshold": 20,
      "auto_order_enabled": true,
      "reorder_qty": 10
    }
  ]
}

Rules:
- category must be one of: Produce, Dairy & Eggs, Meat & Poultry, Seafood, Pantry, Frozen, Beverages, Packaging, Cleaning, Other
- unit must be one of: kg, gm, ltr, ml, pcs, pkt, box, dozen
- cost_per_unit: realistic Australian market price in AUD ($) — e.g. Tomatoes $4.50/kg, Chicken Breast $12/kg, Eggs $6/dozen, Milk $2.50/ltr, Flour $1.50/kg, Olive Oil $8/ltr, Salmon $28/kg
- min_threshold: safe minimum stock level (in the chosen unit)
- max_threshold: typical maximum to keep on hand
- auto_order_enabled: true for perishables, false for slow-moving items
- reorder_qty: how much to order when low
- Use Australian ingredient names (e.g. "Capsicum" not "Bell Pepper", "Spring Onions" not "Scallions", "Rocket" not "Arugula", "Prawns" not "Shrimp")
- Include items relevant specifically to "${restaurantType}" cuisine
- Include basics like Olive Oil, Salt, Brown Onions, Garlic regardless of cuisine type`
    : `You are a restaurant inventory expert for Indian restaurants.
The restaurant serves: "${restaurantType}".

Suggest 25–30 essential raw materials they would need.
Return ONLY valid JSON — no markdown, no explanation.

Format:
{
  "items": [
    {
      "name": "Tomatoes",
      "category": "Vegetables",
      "unit": "kg",
      "cost_per_unit": 40,
      "min_threshold": 5,
      "max_threshold": 20,
      "auto_order_enabled": true,
      "reorder_qty": 10
    }
  ]
}

Rules:
- category must be one of: Vegetables, Dairy, Meat, Seafood, Groceries, Beverages, Packaging, Cleaning, Other
- unit must be one of: kg, gm, ltr, ml, pcs, pkt, box, dozen
- cost_per_unit: realistic Indian market price in ₹
- min_threshold: safe minimum stock level (in the chosen unit)
- max_threshold: typical maximum to keep on hand
- auto_order_enabled: true for perishables, false for slow-moving items
- reorder_qty: how much to order when low
- Include items relevant specifically to "${restaurantType}" cuisine
- Include basics like Oil, Salt, Onions regardless of cuisine type`;

  const result = await model.generateContent([prompt]);
  const data = parseJSON(result.response.text().trim());

  if (!data.items || !Array.isArray(data.items)) throw new Error('Invalid AI response');

  return data.items.map((item, i) => ({
    ...item,
    sku: `AI-${String(i + 1).padStart(3, '0')}`,
    cost_per_unit: parseFloat(item.cost_per_unit) || 0,
    min_threshold: parseFloat(item.min_threshold) || 1,
    max_threshold: parseFloat(item.max_threshold) || 10,
    reorder_qty: parseFloat(item.reorder_qty) || 5,
    auto_order_enabled: item.auto_order_enabled !== false,
  }));
}

/* ─────────────────────────────────────────────────────────────
   2. SUGGEST RECIPE INGREDIENTS  (Onboarding Step 4 / Recipes)
───────────────────────────────────────────────────────────── */

async function suggestRecipeIngredients(dishName, existingItems = []) {
  const model = getModel();

  const itemList = existingItems.length
    ? existingItems.map(i => `${i.id}::${i.name} (${i.unit})`).join('\n')
    : 'No existing items — suggest new ingredients.';

  const prompt = `You are a recipe consultant for Indian restaurants.
Dish: "${dishName}"
Serving size: 1 portion

Available inventory items (id::name (unit)):
${itemList}

Return ONLY valid JSON — no markdown.

Format:
{
  "ingredients": [
    {
      "inventory_item_id": "uuid-if-matched-from-list-or-null",
      "name": "Ingredient name",
      "quantity": 200,
      "unit": "gm"
    }
  ]
}

Rules:
- If an ingredient exists in the list, use its exact id and name
- If not found, set inventory_item_id to null and provide a realistic name
- quantity should be realistic for 1 portion (in grams/ml for wet ingredients)
- unit must be one of: kg, gm, ltr, ml, pcs, pkt, box, dozen`;

  const result = await model.generateContent([prompt]);
  const data = parseJSON(result.response.text().trim());

  if (!data.ingredients || !Array.isArray(data.ingredients)) throw new Error('Invalid AI response');
  return data.ingredients;
}

/* ─────────────────────────────────────────────────────────────
   3. DAILY STOCK INSIGHTS  (Main page insight strip)
───────────────────────────────────────────────────────────── */

async function getStockInsights(outletId) {
  const prisma = getDbClient();

  // Pull stock data + recent consumption
  const [stockRows, wastageRows] = await Promise.all([
    prisma.inventoryStock.findMany({
      where: { outlet_id: outletId },
      include: { inventory_item: { select: { name: true, unit: true, min_threshold: true } } },
    }),
    prisma.wastageLog.findMany({
      where: {
        outlet_id: outletId,
        created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: { inventory_item: { select: { name: true, unit: true } } },
      take: 50,
    }),
  ]);

  const stockSummary = stockRows.map(s => ({
    name: s.inventory_item?.name,
    unit: s.inventory_item?.unit,
    current: parseFloat(s.current_stock),
    min: parseFloat(s.inventory_item?.min_threshold || 0),
    status:
      s.current_stock <= 0 ? 'OUT' :
      s.current_stock <= s.inventory_item?.min_threshold ? 'CRITICAL' :
      s.current_stock <= s.inventory_item?.min_threshold * 1.5 ? 'LOW' : 'OK',
  }));

  const wastageSummary = wastageRows.reduce((acc, w) => {
    const n = w.inventory_item?.name;
    if (!acc[n]) acc[n] = 0;
    acc[n] += parseFloat(w.quantity);
    return acc;
  }, {});

  const lowCount = stockSummary.filter(s => ['LOW', 'CRITICAL', 'OUT'].includes(s.status)).length;

  // If nothing interesting, return static insights fast (no Gemini call)
  if (stockRows.length === 0) {
    return [{
      type: 'empty',
      icon: 'package',
      message: 'No inventory set up yet. Start onboarding to add your first items.',
      action: 'Start Setup',
      actionKey: 'onboard',
      severity: 'info',
    }];
  }

  const model = getModel();

  const prompt = `You are an inventory analyst for a restaurant.
Current stock summary (JSON):
${JSON.stringify(stockSummary.slice(0, 30))}

Last 7 days wastage (item → qty):
${JSON.stringify(wastageSummary)}

Low/critical/out items count: ${lowCount}

Generate 3–4 concise, actionable insights for the restaurant owner.
Return ONLY valid JSON:
{
  "insights": [
    {
      "type": "alert|warning|tip|info",
      "icon": "alert-triangle|trending-up|zap|package|trash-2",
      "message": "Short, specific insight (max 12 words)",
      "detail": "One line explaining what to do",
      "action": "Button label or null",
      "actionKey": "reorder|create-po|view-wastage|null",
      "severity": "high|medium|low"
    }
  ]
}

Rules:
- Be specific — mention actual item names, numbers
- Prioritise OUT and CRITICAL items first
- If wastage is high for an item, mention it
- Keep messages under 12 words`;

  try {
    const result = await model.generateContent([prompt]);
    const data = parseJSON(result.response.text().trim());
    return data.insights || [];
  } catch (err) {
    logger.warn('AI insights fallback', { err: err.message });
    // Graceful fallback — static insights from DB data
    const insights = [];
    const critical = stockSummary.filter(s => s.status === 'OUT' || s.status === 'CRITICAL');
    if (critical.length > 0) {
      insights.push({
        type: 'alert',
        icon: 'alert-triangle',
        message: `${critical.length} item${critical.length > 1 ? 's' : ''} critically low or out of stock`,
        detail: critical.slice(0, 3).map(i => i.name).join(', '),
        action: 'Create PO',
        actionKey: 'create-po',
        severity: 'high',
      });
    }
    const topWaste = Object.entries(wastageSummary).sort((a, b) => b[1] - a[1])[0];
    if (topWaste) {
      insights.push({
        type: 'warning',
        icon: 'trash-2',
        message: `High wastage: ${topWaste[0]} (${topWaste[1]} units this week)`,
        detail: 'Consider reducing your order quantity.',
        action: 'View Logs',
        actionKey: 'view-wastage',
        severity: 'medium',
      });
    }
    return insights;
  }
}

/* ─────────────────────────────────────────────────────────────
   4. SMART PO BUILDER  (Create PO quick action)
───────────────────────────────────────────────────────────── */

async function buildSmartPO(outletId) {
  const prisma = getDbClient();

  const [lowStock, suppliers, consumption] = await Promise.all([
    prisma.inventoryStock.findMany({
      where: { outlet_id: outletId },
      include: {
        inventory_item: {
          include: { preferred_supplier: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      select: { id: true, name: true },
    }),
    prisma.stockTransaction.findMany({
      where: {
        outlet_id: outletId,
        transaction_type: 'consumption',
        created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: { inventory_item: { select: { name: true, unit: true } } },
      take: 100,
    }),
  ]);

  const needsReorder = lowStock
    .filter(s => {
      const item = s.inventory_item;
      const min = parseFloat(item?.min_threshold || 0);
      const cur = parseFloat(s.current_stock || 0);
      return cur <= min * 1.5;
    })
    .map(s => ({
      id: s.inventory_item_id,
      name: s.inventory_item?.name,
      unit: s.inventory_item?.unit,
      current: parseFloat(s.current_stock),
      min: parseFloat(s.inventory_item?.min_threshold || 0),
      reorder_qty: parseFloat(s.inventory_item?.reorder_qty || 5),
      preferred_supplier_id: s.inventory_item?.preferred_supplier?.id || null,
      preferred_supplier_name: s.inventory_item?.preferred_supplier?.name || null,
      cost_per_unit: parseFloat(s.inventory_item?.cost_per_unit || 0),
    }));

  const consumptionMap = consumption.reduce((acc, t) => {
    const n = t.inventory_item?.name;
    if (!acc[n]) acc[n] = 0;
    acc[n] += Math.abs(parseFloat(t.quantity));
    return acc;
  }, {});

  return {
    items: needsReorder,
    suppliers,
    consumptionLastWeek: consumptionMap,
    summary: `${needsReorder.length} items need restocking`,
  };
}

/* ─────────────────────────────────────────────────────────────
   5. AUTO-FILL ITEM DETAILS  (Add Material quick form)
───────────────────────────────────────────────────────────── */

async function autofillItem(itemName, region = 'IN') {
  const model = getModel();

  const isAU = region === 'AU';

  const prompt = isAU
    ? `You are an inventory expert for Australian restaurants.
Item name: "${itemName}"

Return ONLY valid JSON:
{
  "category": "Produce",
  "unit": "kg",
  "cost_per_unit": 4.50,
  "min_threshold": 2,
  "max_threshold": 10,
  "auto_order_enabled": true,
  "reorder_qty": 5
}

Rules:
- category must be one of: Produce, Dairy & Eggs, Meat & Poultry, Seafood, Pantry, Frozen, Beverages, Packaging, Cleaning, Other
- unit must be one of: kg, gm, ltr, ml, pcs, pkt, box, dozen
- cost_per_unit: realistic Australian market price in AUD ($)
- Be smart: "Lurpak Butter 250g" → category=Dairy & Eggs, unit=pcs, cost_per_unit=5.50`
    : `You are an inventory expert for Indian restaurants.
Item name: "${itemName}"

Return ONLY valid JSON:
{
  "category": "Vegetables",
  "unit": "kg",
  "cost_per_unit": 40,
  "min_threshold": 2,
  "max_threshold": 10,
  "auto_order_enabled": true,
  "reorder_qty": 5
}

Rules:
- category must be one of: Vegetables, Dairy, Meat, Seafood, Groceries, Beverages, Packaging, Cleaning, Other
- unit must be one of: kg, gm, ltr, ml, pcs, pkt, box, dozen
- cost_per_unit: realistic Indian market price in ₹
- Be smart: "Amul Butter 500g" → category=Dairy, unit=pcs, cost_per_unit=60`;

  try {
    const result = await model.generateContent([prompt]);
    const data = parseJSON(result.response.text().trim());
    return {
      category: data.category || 'Other',
      unit: data.unit || 'pcs',
      cost_per_unit: parseFloat(data.cost_per_unit) || 0,
      min_threshold: parseFloat(data.min_threshold) || 1,
      max_threshold: parseFloat(data.max_threshold) || 10,
      auto_order_enabled: data.auto_order_enabled !== false,
      reorder_qty: parseFloat(data.reorder_qty) || 5,
    };
  } catch {
    return { category: 'Other', unit: 'pcs', cost_per_unit: 0, min_threshold: 1, max_threshold: 10, auto_order_enabled: false, reorder_qty: 5 };
  }
}

module.exports = {
  suggestItemsForRestaurant,
  suggestRecipeIngredients,
  getStockInsights,
  buildSmartPO,
  autofillItem,
};
