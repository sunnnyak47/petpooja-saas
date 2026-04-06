/**
 * @fileoverview AI Menu Sync Controller.
 * Handles the flow of menu extraction and confirmation.
 * @module modules/menu/ai_menu.controller
 */

const aiService = require("./ai_menu.service");
const { sendSuccess, sendError } = require("../../utils/response");

/**
 * Scan a menu photo and return structured draft.
 */
async function scanMenu(req, res, next) {
  try {
    if (!req.file) {
      return sendError(res, 400, "Please upload a menu image");
    }

    const { buffer, mimetype } = req.file;
    const extractedData = await aiService.scanMenuImage(buffer, mimetype);
    
    sendSuccess(res, extractedData, "Menu scanned and extracted successfully");
  } catch (error) {
    next(error);
  }
}

/**
 * Confirm and sync the draft menu to the database.
 */
async function confirmSync(req, res, next) {
  try {
    const { outlet_id, menu_data } = req.body;
    if (!outlet_id || !menu_data) {
      return sendError(res, 400, "Outlet ID and Menu Data are required");
    }

    const results = await aiService.syncMenu(outlet_id, menu_data);
    sendSuccess(res, results, "Menu synced successfully to production");
  } catch (error) {
    next(error);
  }
}

module.exports = { scanMenu, confirmSync };
