/**
 * @fileoverview Inventory AI Controller — HTTP handlers for Gemini-powered inventory features.
 * @module modules/inventory/inventory.ai.controller
 */

const aiService = require('./inventory.ai.service');
const { sendSuccess } = require('../../utils/response');
const logger = require('../../config/logger');

async function suggestItems(req, res, next) {
  try {
    const { restaurant_type, region = 'IN' } = req.body;
    if (!restaurant_type) return res.status(400).json({ success: false, message: 'restaurant_type is required' });

    logger.info('AI suggest items', { restaurant_type, region });
    const items = await aiService.suggestItemsForRestaurant(restaurant_type, region);
    return sendSuccess(res, items, 'Items suggested');
  } catch (err) {
    next(err);
  }
}

async function suggestRecipe(req, res, next) {
  try {
    const { dish_name, existing_items = [] } = req.body;
    if (!dish_name) return res.status(400).json({ success: false, message: 'dish_name is required' });

    const ingredients = await aiService.suggestRecipeIngredients(dish_name, existing_items);
    return sendSuccess(res, ingredients, 'Recipe ingredients suggested');
  } catch (err) {
    next(err);
  }
}

async function getInsights(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user?.outlet_id;
    if (!outletId) return res.status(400).json({ success: false, message: 'outlet_id required' });

    const insights = await aiService.getStockInsights(outletId);
    return sendSuccess(res, insights, 'Insights generated');
  } catch (err) {
    next(err);
  }
}

async function buildPO(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user?.outlet_id;
    if (!outletId) return res.status(400).json({ success: false, message: 'outlet_id required' });

    const result = await aiService.buildSmartPO(outletId);
    return sendSuccess(res, result, 'Smart PO built');
  } catch (err) {
    next(err);
  }
}

async function autofillItem(req, res, next) {
  try {
    const { item_name, region = 'IN' } = req.body;
    if (!item_name) return res.status(400).json({ success: false, message: 'item_name is required' });

    const data = await aiService.autofillItem(item_name, region);
    return sendSuccess(res, data, 'Item details suggested');
  } catch (err) {
    next(err);
  }
}

module.exports = { suggestItems, suggestRecipe, getInsights, buildPO, autofillItem };
