/**
 * @fileoverview Digest-email schedules. A DAILY digest goes out at 07:00 (each
 * morning, summarising yesterday) and a WEEKLY digest every Monday at 07:30
 * (summarising the trailing week). Each run iterates the active outlets that
 * have an owner email and sends that owner their outlet's digest.
 *
 * All work is delegated to assistant.digest (buildDigest/sendDigest/runDigests);
 * this module only wires up the cron triggers. Skipped under NODE_ENV==='test'
 * so the schedules never fire during the test run (mirrors the other assistant
 * / performance crons).
 *
 * @module modules/assistant/assistant.digest.cron
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const { runDigests } = require('./assistant.digest');

async function runDaily() {
  try { await runDigests({ period: 'daily' }); }
  catch (e) { logger.warn('assistant daily digest run failed', { error: e.message }); }
}

async function runWeekly() {
  try { await runDigests({ period: 'weekly' }); }
  catch (e) { logger.warn('assistant weekly digest run failed', { error: e.message }); }
}

// Daily 07:00; Weekly Monday 07:30. Skip under tests.
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 7 * * *', runDaily);
  cron.schedule('30 7 * * 1', runWeekly);
}

module.exports = { runDaily, runWeekly };
