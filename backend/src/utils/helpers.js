/**
 * @fileoverview Utility helper functions for date, currency, GST, and common operations.
 * @module utils/helpers
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generates a UUID v4 string.
 * @returns {string} UUID
 */
function generateId() {
  return uuidv4();
}

/**
 * Returns the current Indian financial year string (e.g., '2025-26').
 * Financial year starts April 1 and ends March 31.
 * @param {Date} [date=new Date()] - Date to evaluate
 * @returns {string} Financial year string
 */
function getFinancialYear(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

/**
 * Generates an invoice number in the format FY-OUTLETCODE-SEQUENCE.
 * @param {string} financialYear - Financial year (e.g., '2025-26')
 * @param {string} outletCode - Short outlet identifier
 * @param {number} sequence - Sequential invoice number
 * @returns {string} Formatted invoice number
 */
function generateInvoiceNumber(financialYear, outletCode, sequence) {
  const paddedSeq = String(sequence).padStart(6, '0');
  return `${financialYear}-${outletCode}-${paddedSeq}`;
}

/**
 * Generates an order number in the format OUT-YYYYMMDD-XXXX.
 * @param {string} outletCode - Short outlet identifier
 * @param {number} dailySequence - Sequential number for the day
 * @param {Date} [date=new Date()] - Order date
 * @returns {string} Formatted order number
 */
function generateOrderNumber(outletCode, dailySequence, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const paddedSeq = String(dailySequence).padStart(4, '0');
  return `${outletCode}-${dateStr}-${paddedSeq}`;
}

/**
 * Calculates GST breakdown for a given amount.
 * Supports same-state (CGST+SGST) and inter-state (IGST) scenarios.
 * @param {number} amount - Taxable amount in INR
 * @param {number} gstRate - GST percentage (e.g., 5, 12, 18)
 * @param {boolean} [isSameState=true] - Whether buyer and seller are in the same state
 * @returns {{ taxableAmount: number, cgst: number, sgst: number, igst: number, totalTax: number, totalWithTax: number }}
 */
function calculateGST(amount, gstRate, isSameState = true) {
  const taxableAmount = Math.round(amount * 100) / 100;
  const totalTax = Math.round((taxableAmount * gstRate) / 100 * 100) / 100;

  if (isSameState) {
    const halfTax = Math.round((totalTax / 2) * 100) / 100;
    return {
      taxableAmount,
      cgst: halfTax,
      sgst: halfTax,
      igst: 0,
      totalTax,
      totalWithTax: Math.round((taxableAmount + totalTax) * 100) / 100,
    };
  }

  return {
    taxableAmount,
    cgst: 0,
    sgst: 0,
    igst: totalTax,
    totalTax,
    totalWithTax: Math.round((taxableAmount + totalTax) * 100) / 100,
  };
}

/**
 * Formats a number as Indian Rupee currency string.
 * @param {number} amount - Amount in INR
 * @returns {string} Formatted string (e.g., '₹1,23,456.00')
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Calculates the discount amount based on type and value.
 * @param {number} subtotal - Original subtotal
 * @param {'percentage'|'flat'} discountType - Type of discount
 * @param {number} discountValue - Discount value (percent or flat amount)
 * @param {number} [maxDiscountPercent=100] - Maximum allowed discount percentage
 * @returns {{ discountAmount: number, isAllowed: boolean, reason: string }}
 */
function calculateDiscount(subtotal, discountType, discountValue, maxDiscountPercent = 100) {
  if (discountType === 'flat') {
    if (discountValue > subtotal) {
      return { discountAmount: 0, isAllowed: false, reason: 'Discount exceeds subtotal' };
    }
    const effectivePercent = (discountValue / subtotal) * 100;
    if (effectivePercent > maxDiscountPercent) {
      return { discountAmount: 0, isAllowed: false, reason: `Discount exceeds ${maxDiscountPercent}% limit` };
    }
    return { discountAmount: Math.round(discountValue * 100) / 100, isAllowed: true, reason: '' };
  }

  if (discountType === 'percentage') {
    if (discountValue > maxDiscountPercent) {
      return { discountAmount: 0, isAllowed: false, reason: `Discount exceeds ${maxDiscountPercent}% limit` };
    }
    const discountAmount = Math.round((subtotal * discountValue) / 100 * 100) / 100;
    return { discountAmount, isAllowed: true, reason: '' };
  }

  return { discountAmount: 0, isAllowed: false, reason: 'Invalid discount type' };
}

/**
 * Builds pagination parameters from query string.
 * @param {object} query - Express req.query object
 * @returns {{ page: number, limit: number, offset: number, sort: string, order: string }}
 */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const sort = query.sort || 'created_at';
  const order = query.order === 'asc' ? 'asc' : 'desc';
  return { page, limit, offset, sort, order };
}

/**
 * Sanitizes a string for safe database storage.
 * Removes HTML tags and trims whitespace.
 * @param {string} input - Raw user input
 * @returns {string} Sanitized string
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Checks if a date falls within the current Indian financial year.
 * @param {Date} date - Date to check
 * @returns {boolean}
 */
function isCurrentFinancialYear(date) {
  return getFinancialYear(date) === getFinancialYear(new Date());
}

/**
 * Calculates food cost percentage.
 * @param {number} recipeCost - Total cost of ingredients
 * @param {number} sellingPrice - Menu selling price
 * @returns {number} Food cost percentage rounded to 2 decimals
 */
function foodCostPercentage(recipeCost, sellingPrice) {
  if (sellingPrice <= 0) return 0;
  return Math.round((recipeCost / sellingPrice) * 100 * 100) / 100;
}

module.exports = {
  generateId,
  getFinancialYear,
  generateInvoiceNumber,
  generateOrderNumber,
  calculateGST,
  formatCurrency,
  calculateDiscount,
  parsePagination,
  sanitizeString,
  isCurrentFinancialYear,
  foodCostPercentage,
};
