/**
 * @fileoverview Push-alert schedule. A couple of times a day it computes each
 * outlet's proactive alerts and PUSHES the high-severity ones to the devices
 * watching that outlet (Expo). All work is delegated to assistant.push
 * (runAlertPush); this module only wires the cron trigger. The 12h per-alert
 * dedup guard in assistant.push means these runs never nag — a given alert
 * pushes at most once per window.
 *
 * Skipped under NODE_ENV==='test' so the schedule never fires during the test
 * run (mirrors the other assistant / performance crons).
 *
 * @module modules/assistant/assistant.push.cron
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const { runAlertPush } = require('./assistant.push');

async function runPushAlerts() {
  try { await runAlertPush(); }
  catch (e) { logger.warn('assistant push-alert run failed', { error: e.message }); }
}

// 10:00 and 16:00 daily — mid-morning + mid-afternoon, business hours only so a
// fraud/stock ping never lands at 3am. Skip under tests.
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 10,16 * * *', runPushAlerts);
}

module.exports = { runPushAlerts };
