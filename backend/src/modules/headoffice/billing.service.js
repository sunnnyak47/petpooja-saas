/**
 * @fileoverview SaaS Billing & Invoicing Service.
 * Manages subscription lifecycle and automated invoice generation.
 * @module modules/headoffice/billing.service
 */

const cron = require('node-cron');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * Monthly Subscription Billing Job.
 * Runs on the 1st of every month at midnight.
 */
cron.schedule('0 0 1 * *', async () => {
  logger.info('Starting monthly billing cycle...');
  try {
    const prisma = getDbClient();
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: 'active', is_deleted: false },
      include: { head_office: true }
    });

    for (const sub of activeSubscriptions) {
      await generateInvoice(sub);
    }
    logger.info(`Automated billing completed for ${activeSubscriptions.length} chains.`);
  } catch (error) {
    logger.error('Monthly billing job failed', { error: error.message });
  }
});

/**
 * Generates a PDF invoice for a subscription.
 * @param {object} subscription - Subscription object with head_office
 */
async function generateInvoice(subscription) {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const invoiceNumber = `INV-${new Date().getFullYear()}-${subscription.id.substring(0,6).toUpperCase()}`;
  
  const html = `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #333; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4F46E5; padding-bottom: 20px; }
          .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
          .details { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; }
          .table { width: 100%; margin-top: 40px; border-collapse: collapse; }
          .table th { background: #F3F4F6; padding: 12px; text-align: left; }
          .table td { padding: 12px; border-bottom: 1px solid #E5E7EB; }
          .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #9CA3AF; }
          .total { text-align: right; font-size: 20px; font-weight: bold; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Petpooja ERP — Enterprise</div>
          <div>
            <strong>Invoice #: ${invoiceNumber}</strong><br>
            Date: ${new Date().toLocaleDateString()}
          </div>
        </div>
        <div class="details">
          <div>
            <h3>Bill To:</h3>
            <strong>${subscription.head_office.name}</strong><br>
            ${subscription.head_office.contact_email}<br>
            ${subscription.head_office.contact_phone}
          </div>
          <div style="text-align: right">
            <h3>Payable To:</h3>
            <strong>Petpooja SaaS Pvt Ltd</strong><br>
            Mumbai, Maharashtra, India<br>
            GSTIN: 27PPJSAAS2026R1Z1
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Plan</th>
              <th>Period</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ERP SaaS Subscription - Multi-Tenant License</td>
              <td>${subscription.plan_name}</td>
              <td>${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}</td>
              <td>₹${Number(subscription.amount).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div class="total">Total Due: ₹${Number(subscription.amount).toLocaleString()}</div>
        <div class="footer">
          Thank you for being a Petpooja Partner. This is a computer-generated invoice.
        </div>
      </body>
    </html>
  `;

  await page.setContent(html);
  const pdfPath = path.join(__dirname, `../../../uploads/invoices/${invoiceNumber}.pdf`);
  
  if (!fs.existsSync(path.dirname(pdfPath))) {
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  }

  await page.pdf({ path: pdfPath, format: 'A4' });
  await browser.close();

  logger.info(`Invoice generated: ${pdfPath}`);
}

module.exports = { generateInvoice };
