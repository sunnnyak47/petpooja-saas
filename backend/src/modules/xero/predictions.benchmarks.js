/**
 * @fileoverview Static benchmark data + recommendation copy for the Xero
 * predictions engine. Extracted from xero.predictions.service.js to keep the
 * computation module focused.
 * @module modules/xero/predictions.benchmarks
 */

/**
 * Industry benchmarks for Australian hospitality.
 */
const BENCHMARKS = {
  cogs_pct:       { low: 28, target: 30, high: 32, label: 'Cost of Goods' },
  labour_pct:     { low: 28, target: 30, high: 32, label: 'Labour' },
  occupancy_pct:  { low: 8,  target: 10, high: 12, label: 'Occupancy' },
  marketing_pct:  { low: 2,  target: 3,  high: 4,  label: 'Marketing' },
  net_margin_pct: { low: 5,  target: 10, high: 15, label: 'Net Margin' },
};

/**
 * Generate recommendations based on benchmark status.
 */
function getRecommendation(key, status) {
  const recs = {
    cogs_pct: {
      excellent: 'COGS well controlled — maintain supplier relationships',
      good: 'COGS within target — monitor for seasonal spikes',
      caution: 'COGS trending high — review supplier contracts & portion sizes',
      critical: 'COGS over benchmark — urgent: renegotiate suppliers, reduce waste',
    },
    labour_pct: {
      excellent: 'Labour efficiently managed — good scheduling',
      good: 'Labour within range — optimise roster during slow periods',
      caution: 'Labour costs elevated — review roster efficiency & casual ratios',
      critical: 'Labour significantly over benchmark — restructure rosters, consider automation',
    },
    occupancy_pct: {
      excellent: 'Rent/occupancy very competitive for revenue level',
      good: 'Occupancy costs reasonable — review at next lease renewal',
      caution: 'Occupancy costs above target — consider subletting or renegotiating',
      critical: 'High occupancy burden — review lease terms urgently',
    },
    marketing_pct: {
      excellent: 'Low marketing spend — ensure brand visibility is maintained',
      good: 'Marketing spend balanced — track ROI on campaigns',
      caution: 'Marketing spend slightly high — measure return per channel',
      critical: 'Marketing overspend — cut low-ROI channels immediately',
    },
    net_margin_pct: {
      excellent: 'Outstanding profitability — reinvest strategically',
      good: 'Healthy margins — continue current strategy',
      caution: 'Margins below target — focus on revenue growth & cost control',
      critical: 'Margins critically low — immediate action needed on costs',
    },
  };
  return recs[key]?.[status] || '';
}

module.exports = { BENCHMARKS, getRecommendation };
