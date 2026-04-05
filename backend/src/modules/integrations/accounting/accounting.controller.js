/**
 * @fileoverview Accounting Controller for Tally and other ERP integrations.
 */

const tallyService = require('./tally.service');
const { sendSuccess } = require('../../../utils/response');

/**
 * GET /api/integrations/accounting/tally/mappings
 * Fetches all Tally ledger mappings for an outlet.
 */
async function getTallyMappings(req, res, next) {
  try {
    const { outlet_id } = req.query;
    const mappings = await tallyService.getMappings(outlet_id);
    sendSuccess(res, mappings);
  } catch (error) { next(error); }
}

/**
 * POST /api/integrations/accounting/tally/mappings
 * Updates or creates a Tally ledger mapping.
 */
async function updateTallyMapping(req, res, next) {
  try {
    const { outlet_id, pos_method, tally_ledger_name } = req.body;
    const mapping = await tallyService.updateMapping(outlet_id, pos_method, tally_ledger_name);
    sendSuccess(res, mapping, 'Tally mapping updated');
  } catch (error) { next(error); }
}

/**
 * GET /api/integrations/accounting/tally/export/sales
 * Exports sales vouchers for a date range as XML.
 */
async function exportTallySales(req, res, next) {
  try {
    const { outlet_id, start_date, end_date } = req.query;
    const xml = await tallyService.exportSalesXML(outlet_id, start_date, end_date);
    
    res.set('Content-Type', 'text/xml');
    res.set('Content-Disposition', `attachment; filename="Tally_Sales_${start_date}_${end_date}.xml"`);
    res.send(xml);
  } catch (error) { next(error); }
}

module.exports = {
  getTallyMappings,
  updateTallyMapping,
  exportTallySales
};
