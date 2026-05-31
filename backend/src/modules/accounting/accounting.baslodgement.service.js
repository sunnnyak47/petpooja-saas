/**
 * @fileoverview BAS lodgement records. Computes a BAS report for a period via
 * the BAS reporting service and persists it as a `bASLodgement` row that can be
 * marked as lodged. NOTE: lodging here is a *record* of lodgement only — it does
 * NOT transmit anything to the ATO. Real SBR2 lodgement requires ATO machine
 * credentials and is out of scope here.
 *
 * @module modules/accounting/accounting.baslodgement.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const bas = require('./accounting.bas.service');

/** Round a number to 2 decimal places. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the BAS for a period and persist it as a draft lodgement.
 * @param {number} outletId Outlet id.
 * @param {{ period_start: (string|Date), period_end: (string|Date) }} range Period.
 * @returns {Promise<object>} The created lodgement row.
 */
async function createLodgement(outletId, { period_start, period_end }) {
  const prisma = getDbClient();
  const report = await bas.getBASReport(outletId, period_start, period_end);

  const row = await prisma.bASLodgement.create({
    data: {
      outlet_id: outletId,
      period_start: new Date(period_start),
      period_end: new Date(period_end),
      g1: round2(report.G1_total_sales),
      a1: round2(report.gst_on_sales_1A),
      g11: round2(report.G11_purchases),
      b1: round2(report.gst_on_purchases_1B),
      net_gst: round2(report.net_gst),
      status: 'draft',
    },
  });

  logger.info(`Created draft BAS lodgement ${row.id} for outlet ${outletId}`);
  return row;
}

/**
 * List non-deleted lodgements for an outlet, newest period first.
 * @param {number} outletId Outlet id.
 * @returns {Promise<object[]>} Lodgement rows.
 */
async function listLodgements(outletId) {
  const prisma = getDbClient();
  return prisma.bASLodgement.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { period_start: 'desc' },
  });
}

/**
 * Mark a draft lodgement as lodged.
 *
 * NOTE: This only records that the BAS was lodged — it does NOT transmit the
 * BAS to the ATO. A real SBR2 lodgement requires ATO machine credentials and
 * is not performed here.
 *
 * @param {number} outletId Outlet id.
 * @param {number} id Lodgement id.
 * @returns {Promise<object>} The updated lodgement row.
 */
async function lodge(outletId, id) {
  const prisma = getDbClient();
  const existing = await prisma.bASLodgement.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!existing) {
    throw new Error(`BAS lodgement ${id} not found for outlet ${outletId}`);
  }
  if (existing.status !== 'draft') {
    throw new Error(`BAS lodgement ${id} is not in draft status`);
  }

  const row = await prisma.bASLodgement.update({
    where: { id },
    data: {
      status: 'lodged',
      lodged_at: new Date(),
      reference: `ATO-${Date.now().toString(36).toUpperCase()}`,
    },
  });

  logger.info(`Marked BAS lodgement ${row.id} as lodged (reference ${row.reference})`);
  return row;
}

/**
 * Build a plain export object for a lodgement.
 * @param {object} lodgement A lodgement row.
 * @returns {object} Export-friendly representation.
 */
function buildBASExport(lodgement) {
  return {
    period: { start: lodgement.period_start, end: lodgement.period_end },
    labels: {
      G1: lodgement.g1,
      '1A': lodgement.a1,
      G11: lodgement.g11,
      '1B': lodgement.b1,
    },
    net_gst: lodgement.net_gst,
    note: 'Computed BAS — not transmitted to ATO',
  };
}

module.exports = { createLodgement, listLodgements, lodge, buildBASExport };
