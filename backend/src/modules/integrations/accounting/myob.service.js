/**
 * MYOB AccountRight Export Service — AU
 *
 * Generates MYOB-compatible CSV files for manual import into MYOB AccountRight.
 * Covers: Sales invoices, Purchase expenses, Payroll summary, and BAS worksheet.
 *
 * All monetary arithmetic uses integer-cents to avoid floating-point drift.
 * CSV output follows MYOB AccountRight import specifications.
 */
const { getDbClient } = require('../../../config/database');
const logger = require('../../../config/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Prisma Decimal (string) to integer cents.
 * @param {string|number|null|undefined} val
 * @returns {number} value in cents
 */
function toCents(val) {
  if (val == null) return 0;
  return Math.round(Number(val) * 100);
}

/**
 * Convert integer cents back to a two-decimal string (e.g. "14.50").
 * @param {number} cents
 * @returns {string}
 */
function centsToStr(cents) {
  return (cents / 100).toFixed(2);
}

/**
 * Format a JS Date as DD/MM/YYYY (Australian format required by MYOB).
 * @param {Date} d
 * @returns {string}
 */
function formatDateAU(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Escape a CSV field — wrap in double-quotes if it contains a comma,
 * double-quote, or newline. Inner double-quotes are doubled.
 * @param {string} field
 * @returns {string}
 */
function csvEscape(field) {
  const str = String(field ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV string from an array of header names and an array of row arrays.
 * @param {string[]} headers
 * @param {Array<string[]>} rows
 * @returns {string}
 */
function buildCSV(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Derive a human-readable customer label from the primary payment method.
 * @param {Array<{method: string}>} payments
 * @returns {string}
 */
function customerLabel(payments) {
  if (!payments || payments.length === 0) return 'POS Sale';
  const method = (payments[0].method || '').toLowerCase();
  if (method === 'cash') return 'POS Cash Sale';
  if (method === 'card' || method === 'eftpos') return 'POS Card Sale';
  if (method === 'upi') return 'POS UPI Sale';
  return `POS ${method.charAt(0).toUpperCase() + method.slice(1)} Sale`;
}

/**
 * Build a short description from order items (max 3 names).
 * @param {Array<{name: string}>} items
 * @returns {string}
 */
function itemDescription(items) {
  if (!items || items.length === 0) return 'No Items';
  if (items.length <= 3) {
    return items.map((i) => i.name).join(', ');
  }
  return 'Multiple Items';
}

/**
 * Normalise payment method string for the CSV Payment Method column.
 * @param {Array<{method: string}>} payments
 * @returns {string}
 */
function paymentMethod(payments) {
  if (!payments || payments.length === 0) return 'Unknown';
  const method = (payments[0].method || '').toLowerCase();
  const map = { cash: 'Cash', card: 'Card', eftpos: 'EFTPOS', upi: 'UPI' };
  return map[method] || method.charAt(0).toUpperCase() + method.slice(1);
}

/**
 * Build start-of-day and end-of-day Date objects (UTC) from ISO date strings.
 * @param {string} from - YYYY-MM-DD
 * @param {string} to   - YYYY-MM-DD
 * @returns {{ fromDt: Date, toDt: Date }}
 */
function dateRange(from, to) {
  const fromDt = new Date(`${from}T00:00:00.000Z`);
  const toDt = new Date(`${to}T23:59:59.999Z`);
  return { fromDt, toDt };
}

/**
 * Derive quarter start/end dates.
 * AU financial quarters: Q1 = Jul-Sep, Q2 = Oct-Dec, Q3 = Jan-Mar, Q4 = Apr-Jun.
 * @param {number} quarter - 1..4
 * @param {number} year    - financial year ending (e.g. 2026 means FY2025-26)
 * @returns {{ fromDt: Date, toDt: Date }}
 */
function quarterRange(quarter, year) {
  // quarter 1 = Jul-Sep of year-1, quarter 4 = Apr-Jun of year
  const qMap = {
    1: { startMonth: 6, startYear: year - 1, endMonth: 8, endYear: year - 1 },  // Jul(6)-Sep(8)
    2: { startMonth: 9, startYear: year - 1, endMonth: 11, endYear: year - 1 }, // Oct(9)-Dec(11)
    3: { startMonth: 0, startYear: year, endMonth: 2, endYear: year },           // Jan(0)-Mar(2)
    4: { startMonth: 3, startYear: year, endMonth: 5, endYear: year },           // Apr(3)-Jun(5)
  };

  const q = qMap[quarter];
  if (!q) throw new Error(`Invalid quarter: ${quarter}. Must be 1-4.`);

  const fromDt = new Date(Date.UTC(q.startYear, q.startMonth, 1));
  // Last day of end month
  const toDt = new Date(Date.UTC(q.endYear, q.endMonth + 1, 0, 23, 59, 59, 999));
  return { fromDt, toDt };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class MyobService {
  // -----------------------------------------------------------------------
  // 1. Export Sales CSV
  // -----------------------------------------------------------------------

  /**
   * Generate an MYOB AccountRight-compatible CSV for paid sales orders.
   *
   * @param {string} outletId  - UUID of the outlet
   * @param {string} fromDate  - Start date YYYY-MM-DD
   * @param {string} toDate    - End date YYYY-MM-DD
   * @returns {Promise<{csv: string, filename: string, count: number, totalAmount: number}>}
   */
  async exportSalesCSV(outletId, fromDate, toDate) {
    const prisma = getDbClient();
    const { fromDt, toDt } = dateRange(fromDate, toDate);

    logger.info(`[MYOB] Exporting sales CSV for outlet ${outletId} from ${fromDate} to ${toDate}`);

    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_paid: true,
        is_deleted: false,
        paid_at: { gte: fromDt, lte: toDt },
      },
      include: {
        payments: {
          where: { is_deleted: false, status: 'completed' },
          select: { method: true, amount: true },
        },
        order_items: {
          where: { status: { not: 'cancelled' } },
          select: { name: true },
        },
      },
      orderBy: { paid_at: 'asc' },
    });

    const headers = [
      'Date',
      'Invoice Number',
      'Customer',
      'Description',
      'Account',
      'Amount (Inc Tax)',
      'Tax Code',
      'Amount (Ex Tax)',
      'Tax Amount',
      'Payment Method',
      'Status',
    ];

    let totalCents = 0;
    const rows = [];

    for (const order of orders) {
      const grandTotalCents = toCents(order.grand_total);
      const taxCents = toCents(order.total_tax);
      const exTaxCents = grandTotalCents - taxCents;

      totalCents += grandTotalCents;

      rows.push([
        formatDateAU(order.paid_at),
        order.order_number,
        customerLabel(order.payments),
        itemDescription(order.order_items),
        '1-1000',
        centsToStr(grandTotalCents),
        'GST',
        centsToStr(exTaxCents),
        centsToStr(taxCents),
        paymentMethod(order.payments),
        'Closed',
      ]);
    }

    const csv = buildCSV(headers, rows);
    const filename = `MYOB_Sales_${outletId.slice(0, 8)}_${fromDate}_${toDate}.csv`;

    logger.info(`[MYOB] Sales CSV generated: ${orders.length} orders, total $${centsToStr(totalCents)}`);

    return {
      csv,
      filename,
      count: orders.length,
      totalAmount: Number(centsToStr(totalCents)),
    };
  }

  // -----------------------------------------------------------------------
  // 2. Export Expenses CSV
  // -----------------------------------------------------------------------

  /**
   * Generate an MYOB AccountRight-compatible CSV for purchase orders (expenses).
   *
   * @param {string} outletId  - UUID of the outlet
   * @param {string} fromDate  - Start date YYYY-MM-DD
   * @param {string} toDate    - End date YYYY-MM-DD
   * @returns {Promise<{csv: string, filename: string, count: number, totalAmount: number}>}
   */
  async exportExpensesCSV(outletId, fromDate, toDate) {
    const prisma = getDbClient();
    const { fromDt, toDt } = dateRange(fromDate, toDate);

    logger.info(`[MYOB] Exporting expenses CSV for outlet ${outletId} from ${fromDate} to ${toDate}`);

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        status: { in: ['approved', 'received', 'completed'] },
        created_at: { gte: fromDt, lte: toDt },
      },
      include: {
        supplier: {
          select: { name: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const headers = [
      'Date',
      'Supplier',
      'Invoice Number',
      'Account',
      'Amount (Inc Tax)',
      'Tax Code',
      'Amount (Ex Tax)',
      'Tax Amount',
    ];

    let totalCents = 0;
    const rows = [];

    for (const po of purchaseOrders) {
      const grandTotalCents = toCents(po.grand_total);
      const taxCents = toCents(po.tax_amount);
      const exTaxCents = grandTotalCents - taxCents;

      totalCents += grandTotalCents;

      rows.push([
        formatDateAU(po.created_at),
        po.supplier ? po.supplier.name : 'Unknown Supplier',
        po.po_number,
        '5-1000',
        centsToStr(grandTotalCents),
        'GST',
        centsToStr(exTaxCents),
        centsToStr(taxCents),
      ]);
    }

    const csv = buildCSV(headers, rows);
    const filename = `MYOB_Expenses_${outletId.slice(0, 8)}_${fromDate}_${toDate}.csv`;

    logger.info(`[MYOB] Expenses CSV generated: ${purchaseOrders.length} POs, total $${centsToStr(totalCents)}`);

    return {
      csv,
      filename,
      count: purchaseOrders.length,
      totalAmount: Number(centsToStr(totalCents)),
    };
  }

  // -----------------------------------------------------------------------
  // 3. Export Payroll Summary CSV
  // -----------------------------------------------------------------------

  /**
   * Generate a payroll summary CSV for MYOB import based on attendance and
   * salary records. Falls back gracefully if no rostering data exists.
   *
   * @param {string} outletId  - UUID of the outlet
   * @param {string} fromDate  - Start date YYYY-MM-DD
   * @param {string} toDate    - End date YYYY-MM-DD
   * @returns {Promise<{csv: string, filename: string, count: number, totalAmount: number, message?: string}>}
   */
  async exportPayrollSummary(outletId, fromDate, toDate) {
    const prisma = getDbClient();
    const { fromDt, toDt } = dateRange(fromDate, toDate);

    logger.info(`[MYOB] Exporting payroll summary for outlet ${outletId} from ${fromDate} to ${toDate}`);

    // Fetch attendance logs with staff profile (for hourly rate)
    const attendanceLogs = await prisma.attendanceLog.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        clock_in: { gte: fromDt, lte: toDt },
        clock_out: { not: null }, // only completed shifts
      },
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
            staff_profiles: {
              where: { outlet_id: outletId, is_deleted: false },
              select: {
                hourly_rate: true,
                employee_code: true,
                designation: true,
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { clock_in: 'asc' },
    });

    if (attendanceLogs.length === 0) {
      logger.info('[MYOB] No attendance/rostering data found for payroll export');
      return {
        csv: '',
        filename: '',
        count: 0,
        totalAmount: 0,
        message: 'No rostering data available',
      };
    }

    // Aggregate by staff member
    const staffMap = new Map();
    for (const log of attendanceLogs) {
      const userId = log.user_id;
      if (!staffMap.has(userId)) {
        const profile = log.user.staff_profiles?.[0] || {};
        staffMap.set(userId, {
          name: log.user.full_name,
          employeeCode: profile.employee_code || '',
          designation: profile.designation || '',
          hourlyRateCents: toCents(profile.hourly_rate),
          totalHoursCents: 0, // hundredths of an hour for precision
          overtimeHoursCents: 0,
          shifts: 0,
        });
      }
      const entry = staffMap.get(userId);
      entry.totalHoursCents += toCents(log.hours_worked);
      entry.overtimeHoursCents += toCents(log.overtime_hours);
      entry.shifts += 1;
    }

    const headers = [
      'Employee Code',
      'Employee Name',
      'Designation',
      'Period Start',
      'Period End',
      'Total Hours',
      'Overtime Hours',
      'Hourly Rate',
      'Gross Pay',
      'Overtime Pay',
      'Total Pay',
    ];

    let grandTotalCents = 0;
    const rows = [];
    const periodStart = formatDateAU(fromDt);
    const periodEnd = formatDateAU(toDt);

    for (const [, staff] of staffMap) {
      const totalHours = staff.totalHoursCents / 100;
      const overtimeHours = staff.overtimeHoursCents / 100;
      const regularHours = totalHours - overtimeHours;

      // Gross pay = regular hours * hourly rate
      const grossPayCents = Math.round(regularHours * staff.hourlyRateCents);
      // Overtime at 1.5x
      const overtimePayCents = Math.round(overtimeHours * staff.hourlyRateCents * 1.5);
      const totalPayCents = grossPayCents + overtimePayCents;

      grandTotalCents += totalPayCents;

      rows.push([
        staff.employeeCode,
        staff.name,
        staff.designation,
        periodStart,
        periodEnd,
        totalHours.toFixed(2),
        overtimeHours.toFixed(2),
        centsToStr(staff.hourlyRateCents),
        centsToStr(grossPayCents),
        centsToStr(overtimePayCents),
        centsToStr(totalPayCents),
      ]);
    }

    const csv = buildCSV(headers, rows);
    const filename = `MYOB_Payroll_${outletId.slice(0, 8)}_${fromDate}_${toDate}.csv`;

    logger.info(`[MYOB] Payroll CSV generated: ${staffMap.size} employees, total $${centsToStr(grandTotalCents)}`);

    return {
      csv,
      filename,
      count: staffMap.size,
      totalAmount: Number(centsToStr(grandTotalCents)),
    };
  }

  // -----------------------------------------------------------------------
  // 4. Generate BAS Worksheet
  // -----------------------------------------------------------------------

  /**
   * Calculate BAS (Business Activity Statement) worksheet fields for an
   * Australian financial quarter.
   *
   * AU financial year quarters:
   *   Q1 = Jul-Sep, Q2 = Oct-Dec, Q3 = Jan-Mar, Q4 = Apr-Jun
   *
   * @param {string} outletId - UUID of the outlet
   * @param {number} quarter  - 1..4
   * @param {number} year     - Financial year ending (e.g. 2026 = FY2025-26)
   * @returns {Promise<{
   *   quarter: number,
   *   financialYear: string,
   *   period: { from: string, to: string },
   *   G1:  number, _1A: number,
   *   G10: number, G11: number, _1B: number,
   *   PAYG: number,
   *   netGST: number,
   *   totalPayable: number
   * }>}
   */
  async generateBASWorksheet(outletId, quarter, year) {
    const prisma = getDbClient();
    const { fromDt, toDt } = quarterRange(quarter, year);

    logger.info(
      `[MYOB] Generating BAS worksheet for outlet ${outletId}, Q${quarter} FY${year - 1}-${year}`
    );

    // ----- G1 & 1A: Sales (GST collected) -----
    const salesAgg = await prisma.order.aggregate({
      where: {
        outlet_id: outletId,
        is_paid: true,
        is_deleted: false,
        paid_at: { gte: fromDt, lte: toDt },
      },
      _sum: {
        grand_total: true,
        total_tax: true,
      },
    });

    const g1Cents = toCents(salesAgg._sum.grand_total);
    const _1ACents = toCents(salesAgg._sum.total_tax);

    // ----- G10 & G11 & 1B: Purchases (GST paid) -----
    // G10 = capital purchases (not tracked separately — default 0)
    // G11 = non-capital purchases (purchase orders)
    const purchaseAgg = await prisma.purchaseOrder.aggregate({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        status: { in: ['approved', 'received', 'completed'] },
        created_at: { gte: fromDt, lte: toDt },
      },
      _sum: {
        grand_total: true,
        tax_amount: true,
      },
    });

    const g10Cents = 0; // Capital purchases — not tracked in POS, default to 0
    const g11Cents = toCents(purchaseAgg._sum.grand_total);
    const _1BCents = toCents(purchaseAgg._sum.tax_amount);

    // ----- PAYG Withholding (from salary records if available) -----
    // Derive from the months that fall within the quarter
    const fromMonth = fromDt.getUTCMonth() + 1; // 1-based
    const fromYear = fromDt.getUTCFullYear();
    const toMonth = toDt.getUTCMonth() + 1;
    const toYear = toDt.getUTCFullYear();

    // Build month/year pairs for the quarter (handles year boundary)
    const monthYearPairs = [];
    let m = fromMonth;
    let y = fromYear;
    while (y < toYear || (y === toYear && m <= toMonth)) {
      monthYearPairs.push({ month: m, year: y });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    let paygCents = 0;
    if (monthYearPairs.length > 0) {
      const salaryRecords = await prisma.salaryRecord.findMany({
        where: {
          outlet_id: outletId,
          is_deleted: false,
          OR: monthYearPairs.map((p) => ({ month: p.month, year: p.year })),
        },
        select: {
          net_salary: true,
          deductions: true,
        },
      });

      // PAYG withholding is approximated from the deductions column
      // (proper integration would use a dedicated PAYG field)
      for (const rec of salaryRecords) {
        paygCents += toCents(rec.deductions);
      }
    }

    // ----- Derived totals -----
    const netGSTCents = _1ACents - _1BCents; // GST payable (or refundable if negative)
    const totalPayableCents = netGSTCents + paygCents;

    const result = {
      quarter,
      financialYear: `FY${year - 1}-${String(year).slice(2)}`,
      period: {
        from: formatDateAU(fromDt),
        to: formatDateAU(toDt),
      },
      G1: Number(centsToStr(g1Cents)),
      _1A: Number(centsToStr(_1ACents)),
      G10: Number(centsToStr(g10Cents)),
      G11: Number(centsToStr(g11Cents)),
      _1B: Number(centsToStr(_1BCents)),
      PAYG: Number(centsToStr(paygCents)),
      netGST: Number(centsToStr(netGSTCents)),
      totalPayable: Number(centsToStr(totalPayableCents)),
    };

    logger.info(
      `[MYOB] BAS worksheet generated — G1: $${result.G1}, 1A: $${result._1A}, ` +
        `G11: $${result.G11}, 1B: $${result._1B}, PAYG: $${result.PAYG}, ` +
        `Net GST: $${result.netGST}, Total payable: $${result.totalPayable}`
    );

    return result;
  }
}

module.exports = new MyobService();
