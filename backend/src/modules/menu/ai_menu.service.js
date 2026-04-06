/**
 * @fileoverview AI Menu Sync Service.
 * Uses Gemini Pro Vision to extract menu data from images.
 * @module modules/menu/ai_menu.service
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../../config/logger");
const { getDbClient } = require("../../config/database");

/**
 * Scans a menu image and extracts structured data.
 * @param {Buffer} imageBuffer - The menu photo
 * @param {string} mimeType - image/jpeg, image/png, etc.
 * @returns {Promise<Object>} Structured menu JSON
 */
async function scanMenuImage(imageBuffer, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error("AI Sync failed: GEMINI_API_KEY is not defined in environment variables");
    throw new Error("AI Sync failed: API Key missing in environment variables. Please check Render settings.");
  }

  // Mask the key for logs: first 4 and last 4 chars
  const maskedKey = apiKey.length > 8 
    ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
    : "****";
  logger.info(`AI Menu Scan triggered using API key: ${maskedKey} (Length: ${apiKey.length})`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
      You are an expert menu digitizer for a restaurant ERP. 
      Analyze the attached menu photo and extract all categories, menu items, prices, descriptions, variants, and addons.
      
      Return ONLY a valid JSON object in this format:
      {
        "categories": [
          {
            "name": "Category Name",
            "items": [
              {
                "name": "Item Name",
                "description": "Item Description",
                "base_price": 450,
                "food_type": "veg/non-veg/egg",
                "variants": [
                  { "name": "Full", "price": 500 },
                  { "name": "Half", "price": 300 }
                ],
                "addons": [
                  { "name": "Extra Cheese", "price": 50 }
                ]
              }
            ]
          }
        ]
      }

      Important Rules:
      1. If an item has multiple prices (e.g. Small/Large), treat them as variants.
      2. If an item is clearly vegetarian (green dot or name like Paneer), set food_type to 'veg'.
      3. Prices should be numbers.
      4. If you see combos (e.g. Burger + Fries + Coke), mark them clearly in the description.
      5. Do not include currency symbols.
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Clean up markdown code blocks if the AI returns them
    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    logger.error("AI Menu Scan failed", { error: error.message });
    throw new Error("Failed to scan menu image with AI. Ensure GEMINI_API_KEY is valid.");
  }
}

/**
 * Bulk syncs the reviewed menu data to the database.
 * @param {string} outletId - The outlet to sync to
 * @param {Object} data - The reviewed menu JSON
 * @returns {Promise<Object>} Sync results
 */
async function syncMenu(outletId, data) {
  const prisma = getDbClient();
  const results = { categoriesCreated: 0, itemsCreated: 0, variantsCreated: 0 };

  await prisma.$transaction(async (tx) => {
    for (const catData of data.categories) {
      // 1. Create or Find Category
      const category = await tx.menuCategory.create({
        data: {
          name: catData.name,
          outlet_id: outletId,
          display_order: results.categoriesCreated,
        },
      });
      results.categoriesCreated++;

      for (const itemData of catData.items) {
        // 2. Create Menu Item
        const item = await tx.menuItem.create({
          data: {
            name: itemData.name,
            description: itemData.description || "",
            base_price: parseFloat(itemData.base_price) || 0,
            category_id: category.id,
            outlet_id: outletId,
            food_type: itemData.food_type || "veg",
            kitchen_station: "KITCHEN",
            is_active: true,
          },
        });
        results.itemsCreated++;

        // 3. Create Variants if any
        if (itemData.variants && itemData.variants.length > 0) {
          for (const varData of itemData.variants) {
            await tx.itemVariant.create({
              data: {
                menu_item_id: item.id,
                name: varData.name,
                price_addition: (parseFloat(varData.price) || 0) - item.base_price,
                is_active: true,
              },
            });
            results.variantsCreated++;
          }
        }
      }
    }
  });

  return results;
}

module.exports = { scanMenuImage, syncMenu };
