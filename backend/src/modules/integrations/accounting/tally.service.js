/**
 * @fileoverview Tally ERP XML Export Service.
 * Generates Tally-compatible XML for Sales and Receipt vouchers.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../../config/logger');

/**
 * Generates Tally XML Header and Envelope.
 * @param {string} body - The TallyMessage body.
 * @returns {string} Complete Tally XML.
 */
function wrapTallyEnvelope(body) {
  return `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>##SVCURRENTCOMPANY</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                ${body}
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

/**
 * Format date for Tally (YYYYMMDD).
 * @param {Date} date 
 * @returns {string}
 */
function formatTallyDate(date) {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Get Tally mappings for an outlet.
 */
async function getMappings(outletId) {
  return prisma.tallyMapping.findMany({
    where: { outlet_id: outletId, is_deleted: false }
  });
}

/**
 * Update or create a Tally mapping.
 */
async function updateMapping(outletId, posMethod, tallyLedgerName) {
  return prisma.tallyMapping.upsert({
    where: {
      outlet_id_pos_method: {
        outlet_id: outletId,
        pos_method: posMethod
      }
    },
    update: { tally_ledger_name: tallyLedgerName, is_deleted: false },
    create: {
      outlet_id: outletId,
      pos_method: posMethod,
      tally_ledger_name: tallyLedgerName
    }
  });
}

/**
 * Export Sales Vouchers as Tally XML.
 */
async function exportSalesXML(outletId, startDate, endDate) {
  const orders = await prisma.order.findMany({
    where: {
      outlet_id: outletId,
      created_at: { gte: new Date(startDate), lte: new Date(endDate) },
      status: 'completed',
      is_deleted: false
    },
    include: { payments: true }
  });

  const mappings = await getMappings(outletId);
  const ledgerMap = mappings.reduce((acc, m) => ({ ...acc, [m.pos_method]: m.tally_ledger_name }), {});

  let messageBody = '';

  for (const order of orders) {
    const tallyDate = formatTallyDate(order.created_at);
    const voucherNumber = order.invoice_number || order.order_number;
    
    // Tally Sales Voucher Structure
    messageBody += `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${ledgerMap['cash'] || 'Cash'}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            
            <!-- Dr. Payment Ledgers (Multiple allowed in Tally Sales Vch) -->
            ${order.payments.map(pay => `
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${ledgerMap[pay.method] || pay.method}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>YES</ISDEEMEDPOSITIVE>
                <AMOUNT>-${pay.amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`).join('')}

            <!-- Cr. Sales Ledger -->
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Sales</LEDGERNAME>
                <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>
                <AMOUNT>${order.taxable_amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- Cr. GST Ledgers -->
            ${order.cgst > 0 ? `
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Output CGST</LEDGERNAME>
                <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>
                <AMOUNT>${order.cgst}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>` : ''}
            
            ${order.sgst > 0 ? `
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Output SGST</LEDGERNAME>
                <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>
                <AMOUNT>${order.sgst}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>` : ''}

            ${order.igst > 0 ? `
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Output IGST</LEDGERNAME>
                <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>
                <AMOUNT>${order.igst}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>` : ''}

            <!-- Round Off -->
            ${order.round_off != 0 ? `
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Round Off</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${order.round_off > 0 ? 'NO' : 'YES'}</ISDEEMEDPOSITIVE>
                <AMOUNT>${Math.abs(order.round_off)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>` : ''}

        </VOUCHER>
    </TALLYMESSAGE>`;
  }

  return wrapTallyEnvelope(messageBody);
}

/**
 * Export Receipt Vouchers as Tally XML.
 */
async function exportReceiptsXML(outletId, startDate, endDate) {
  const payments = await prisma.payment.findMany({
    where: {
      outlet_id: outletId,
      created_at: { gte: new Date(startDate), lte: new Date(endDate) },
      status: 'completed',
      is_deleted: false
    },
    include: { order: true }
  });

  const mappings = await getMappings(outletId);
  const ledgerMap = mappings.reduce((acc, m) => ({ ...acc, [m.pos_method]: m.tally_ledger_name }), {});

  let messageBody = '';

  for (const pay of payments) {
    const tallyDate = formatTallyDate(pay.created_at);
    const voucherNumber = `RCPT-${pay.id.slice(0, 8).toUpperCase()}`;

    messageBody += `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${ledgerMap[pay.method] || pay.method}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <NARRATION>Payment for Order ${pay.order?.order_number || 'N/A'}</NARRATION>

            <!-- Dr. Cash/Bank Ledger -->
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${ledgerMap[pay.method] || pay.method}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>YES</ISDEEMEDPOSITIVE>
                <AMOUNT>-${pay.amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- Cr. Customer/Income Ledger -->
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Customer Collections</LEDGERNAME>
                <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>
                <AMOUNT>${pay.amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
        </VOUCHER>
    </TALLYMESSAGE>`;
  }

  return wrapTallyEnvelope(messageBody);
}

/**
 * Export Purchase Vouchers (GRN) as Tally XML.
 */
async function exportPurchasesXML(outletId, startDate, endDate) {
  const grns = await prisma.goodsReceivedNote.findMany({
    where: {
      outlet_id: outletId,
      received_at: { gte: new Date(startDate), lte: new Date(endDate) },
      status: 'completed',
      is_deleted: false
    },
    include: { supplier: true, grn_items: { include: { inventory_item: true } } }
  });

  let messageBody = '';

  for (const grn of grns) {
    const tallyDate = formatTallyDate(grn.received_at);
    const voucherNumber = grn.grn_number;

    messageBody += `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${grn.supplier?.name || 'Generic Supplier'}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>

            <!-- Dr. Purchase Ledger -->
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Purchases</LEDGERNAME>
                <ISDEEMEDPOSITIVE>YES</ISDEEMEDPOSITIVE>
                <AMOUNT>-${grn.total_amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- Cr. Supplier Ledger -->
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${grn.supplier?.name || 'Generic Supplier'}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>
                <AMOUNT>${grn.total_amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
        </VOUCHER>
    </TALLYMESSAGE>`;
  }

  return wrapTallyEnvelope(messageBody);
}

module.exports = {
  getMappings,
  updateMapping,
  exportSalesXML,
  exportReceiptsXML,
  exportPurchasesXML
};
