/**
 * @fileoverview Cron trigger for RECURRING REPORT EXPORTS. Once a day at 08:00
 * server time it calls runDueSchedules(), which picks every schedule that is due
 * today (daily / weekly-on-day / monthly-on-day), regenerates the report and
 * emails it as an attachment. All logic lives in assistant.schedule; this module
 * only wires the trigger.
 *
 * Runs after the 07:00/07:30 digests so the two never contend for mail
 * throughput. Skipped under NODE_ENV==='test' (mirrors the other assistant /
 * performance crons) so the schedule never fires during the test run.
 *
 * @module modules/assistant/assistant.schedule.cron
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const { runDueSchedules } = require('./assistant.schedule');

async function runScheduled() {
  try { await runDueSchedules(); }
  catch (e) { logger.warn('assistant scheduled-report run failed', { error: e.message }); }
}

// Daily 08:00. Skip under tests.
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 8 * * *', runScheduled);
}

module.exports = { runScheduled };
