/**
 * @fileoverview Weekly assistant usage-learning report. Every Monday it mines the
 * last 7 days of ASSISTANT_ASK audit rows (all outlets) and logs the top MISSES so
 * the team can fold recurring gaps back into the querybank / KB (see the fold-back
 * path in assistant.insights.js). Questions are already PII-redacted at write time.
 * @module modules/assistant/assistant.insights.cron
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const { mineUsage } = require('./assistant.insights');

async function runWeeklyReport() {
  try {
    const report = await mineUsage({}, { days: 7 }); // {} = all outlets
    logger.info('assistant weekly usage report', {
      period: report.period,
      total: report.total,
      answered: report.answered,
      misses: report.misses_count,
      miss_rate: report.miss_rate,
      errors: report.errors,
      injection_flagged: report.injection_flagged,
      top_misses: report.top_misses.slice(0, 20),
      by_tool: report.by_tool.slice(0, 15),
    });
  } catch (e) {
    logger.warn('assistant weekly usage report failed', { error: e.message });
  }
}

// Monday 03:15 — after the nightly jobs, low-traffic window. Skip under tests.
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('15 3 * * 1', runWeeklyReport);
}

module.exports = { runWeeklyReport };
