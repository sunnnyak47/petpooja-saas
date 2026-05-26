/**
 * @fileoverview AI Menu Sync Controller.
 * Handles five input modes (image, pdf, text, url, csv) plus the
 * final review-then-sync step.
 *
 * Every extraction call resolves the caller's outlet context (region +
 * currency) so the prompt can be tailored — Indian outlets see ₹/Rs/"/-"
 * pricing rules and the veg/non-veg/egg dietary scheme; Australian
 * outlets see $/A$ pricing and the simpler veg/non_veg scheme.
 *
 * @module modules/menu/ai_menu.controller
 */

const aiService = require('./ai_menu.service');
const { sendSuccess, sendError } = require('../../utils/response');

/**
 * Resolves the outlet context for the current request.
 * Uses req.body.outlet_id if provided (sync flow), otherwise req.user.outlet_id.
 * Defaults to IN/INR if we can't resolve it.
 */
async function resolveCtx(req) {
  const outletId = req.body?.outlet_id || req.user?.outlet_id;
  return aiService.getOutletContext(outletId);
}

/** POST /api/menu/ai/scan-menu — multipart "image" field */
async function scanMenu(req, res, next) {
  try {
    if (!req.file) return sendError(res, 400, 'Please upload a menu image');
    const ctx = await resolveCtx(req);
    const { buffer, mimetype } = req.file;
    const data = await aiService.scanMenuImage(buffer, mimetype, ctx);
    sendSuccess(res, data, 'Menu extracted from image');
  } catch (err) { next(err); }
}

/** POST /api/menu/ai/scan-pdf — multipart "pdf" field */
async function scanPdf(req, res, next) {
  try {
    if (!req.file) return sendError(res, 400, 'Please upload a PDF file');
    if (!/pdf/i.test(req.file.mimetype || '') && !/\.pdf$/i.test(req.file.originalname || '')) {
      return sendError(res, 400, 'Uploaded file is not a PDF.');
    }
    const ctx = await resolveCtx(req);
    const data = await aiService.scanMenuPdf(req.file.buffer, ctx);
    sendSuccess(res, data, 'Menu extracted from PDF');
  } catch (err) { next(err); }
}

/** POST /api/menu/ai/parse-text — body: { text } */
async function parseText(req, res, next) {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) return sendError(res, 400, 'Menu text is required');
    if (text.length > 200000) return sendError(res, 400, 'Text is too long (max ~200k chars)');
    const ctx = await resolveCtx(req);
    const data = await aiService.parseMenuFromText(text, ctx);
    sendSuccess(res, data, 'Menu extracted from pasted text');
  } catch (err) { next(err); }
}

/** POST /api/menu/ai/parse-url — body: { url, crawl?, max_pages? } */
async function parseUrl(req, res, next) {
  try {
    const { url, crawl, max_pages } = req.body || {};
    if (!url || !url.trim()) return sendError(res, 400, 'URL is required');
    const ctx = await resolveCtx(req);
    const data = await aiService.parseMenuFromUrl(url.trim(), {
      crawl: crawl !== false,                                          // default true
      maxPages: Math.max(1, Math.min(20, Number(max_pages) || 10)),    // clamp 1..20
      ctx,
    });
    sendSuccess(res, data, 'Menu extracted from URL');
  } catch (err) { next(err); }
}

/** POST /api/menu/ai/parse-csv — multipart "file" field */
async function parseCsv(req, res, next) {
  try {
    if (!req.file) return sendError(res, 400, 'Please upload a CSV / TSV / XLSX file');
    const ctx = await resolveCtx(req);
    const data = await aiService.parseMenuFromCsv(req.file.buffer, req.file.mimetype, ctx);
    sendSuccess(res, data, 'Menu extracted from spreadsheet');
  } catch (err) { next(err); }
}

/** POST /api/menu/ai/confirm-sync — body: { outlet_id, menu_data } */
async function confirmSync(req, res, next) {
  try {
    const { outlet_id, menu_data } = req.body;
    if (!outlet_id || !menu_data) return sendError(res, 400, 'Outlet ID and Menu Data are required');
    const results = await aiService.syncMenu(outlet_id, menu_data);
    sendSuccess(res, results, 'Menu synced successfully to production');
  } catch (err) { next(err); }
}

module.exports = { scanMenu, scanPdf, parseText, parseUrl, parseCsv, confirmSync };
