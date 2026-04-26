/**
 * @fileoverview Reports service — sales, revenue, item-wise, payment, tax, and dashboard analytics.
 * @module modules/reports/reports.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * Generates a daily sales summary for an outlet.
 * @param {string} outletId - Outlet UUID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<object>} Daily sales summary
 */
async function getDailySales(outletId, date) {
  const prisma = getDbClient();
  try {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        created_at: { gte: targetDate, lt: nextDay },
        status: { notIn: ['cancelled', 'voided'] },
      },
      include: {
        payments: { where: { status: 'success', is_deleted: false } },
      },
    });

    const summary = {
      date,
      total_orders: orders.length,
      total_revenue: 0,
      total_tax: 0,
      total_discount: 0,
      by_type: { dine_in: 0, takeaway: 0, delivery: 0, online: 0, qr_order: 0 },
      by_source: { pos: 0, qr: 0, online: 0, kiosk: 0, app: 0 },
      by_payment: { cash: 0, card: 0, upi: 0, other: 0 },
      paid_orders: 0,
      unpaid_orders: 0,
      avg_order_value: 0,
    };

    for (const order of orders) {
      const gt = Number(order.grand_total);
      summary.total_revenue += gt;
      summary.total_tax += Number(order.total_tax);
      summary.total_discount += Number(order.discount_amount);
      summary.by_type[order.order_type] = (summary.by_type[order.order_type] || 0) + 1;
      summary.by_source[order.source] = (summary.by_source[order.source] || 0) + 1;

      if (order.is_paid) {
        summary.paid_orders++;
        for (const payment of order.payments) {
          const method = payment.method;
          if (method === 'cash') summary.by_payment.cash += Number(payment.amount);
          else if (method.includes('card')) summary.by_payment.card += Number(payment.amount);
          else if (method.includes('upi')) summary.by_payment.upi += Number(payment.amount);
          else summary.by_payment.other += Number(payment.amount);
        }
      } else {
        summary.unpaid_orders++;
      }
    }

    summary.avg_order_value = orders.length > 0 ? Math.round((summary.total_revenue / orders.length) * 100) / 100 : 0;
    summary.total_revenue = Math.round(summary.total_revenue * 100) / 100;
    summary.total_tax = Math.round(summary.total_tax * 100) / 100;

    return summary;
  } catch (error) {
    logger.error('Get daily sales failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets item-wise sales report (top sellers, revenue by item).
 * @param {string} outletId - Outlet UUID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {number} [topN=20] - Number of top items
 * @returns {Promise<object>} Item-wise sales data
 */
async function getItemWiseSales(outletId, from, to, topN = 20) {
  const prisma = getDbClient();
  try {
    const orderItems = await prisma.orderItem.findMany({
      where: {
        is_deleted: false,
        order: {
          outlet_id: outletId,
          is_deleted: false,
          status: { notIn: ['cancelled', 'voided'] },
          created_at: { gte: new Date(from), lte: new Date(to) },
        },
      },
      select: {
        menu_item_id: true,
        name: true,
        quantity: true,
        item_total: true,
        item_tax: true,
      },
    });

    const itemMap = new Map();
    for (const oi of orderItems) {
      const existing = itemMap.get(oi.menu_item_id) || {
        menu_item_id: oi.menu_item_id, name: oi.name,
        total_quantity: 0, total_revenue: 0, total_tax: 0, order_count: 0,
      };
      existing.total_quantity += oi.quantity;
      existing.total_revenue += Number(oi.item_total);
      existing.total_tax += Number(oi.item_tax);
      existing.order_count++;
      itemMap.set(oi.menu_item_id, existing);
    }

    const items = Array.from(itemMap.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, topN)
      .map((item) => ({
        ...item,
        total_revenue: Math.round(item.total_revenue * 100) / 100,
        total_tax: Math.round(item.total_tax * 100) / 100,
        avg_price: item.total_quantity > 0 ? Math.round((item.total_revenue / item.total_quantity) * 100) / 100 : 0,
      }));

    return {
      period: { from, to },
      total_items_sold: orderItems.reduce((sum, oi) => sum + oi.quantity, 0),
      total_revenue: Math.round(orderItems.reduce((sum, oi) => sum + Number(oi.item_total), 0) * 100) / 100,
      items,
    };
  } catch (error) {
    logger.error('Get item-wise sales failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets revenue trend report (daily/weekly/monthly).
 * @param {string} outletId - Outlet UUID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<object[]>} Array of daily revenue data points
 */
async function getRevenueTrend(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const summaries = await prisma.dailySummary.findMany({
      where: {
        outlet_id: outletId,
        summary_date: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: { summary_date: 'asc' },
    });

    return summaries.map((s) => ({
      date: s.summary_date,
      orders: s.total_orders,
      revenue: Number(s.total_revenue),
      tax: Number(s.total_tax),
      discount: Number(s.total_discount),
      dine_in: s.dine_in_orders,
      takeaway: s.takeaway_orders,
      delivery: s.delivery_orders,
      online: s.online_orders,
      avg_order_value: Number(s.avg_order_value),
    }));
  } catch (error) {
    logger.error('Get revenue trend failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets a dashboard summary with key KPIs for today.
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>} Dashboard data
 */
async function getDashboard(outletId) {
  const prisma = getDbClient();
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [todayOrders, yesterdayOrders, activeTables, pendingKots] = await Promise.all([
      prisma.order.findMany({
        where: {
          outlet_id: outletId, is_deleted: false,
          created_at: { gte: today, lt: tomorrow },
          status: { notIn: ['cancelled', 'voided', 'pending'] },
        },
      }),
      prisma.order.findMany({
        where: {
          outlet_id: outletId, is_deleted: false,
          created_at: { gte: yesterday, lt: today },
          status: { notIn: ['cancelled', 'voided'] },
        },
      }),
      prisma.table.count({
        where: { outlet_id: outletId, status: 'occupied', is_deleted: false },
      }),
      prisma.kOT.count({
        where: { outlet_id: outletId, status: { in: ['pending', 'preparing'] }, is_deleted: false },
      }),
    ]);

    const todayRevenue = todayOrders.reduce((sum, o) => sum + Number(o.grand_total), 0);
    const yesterdayRevenue = yesterdayOrders.reduce((sum, o) => sum + Number(o.grand_total), 0);
    const revenueGrowth = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 10000) / 100
      : 0;

    const totalTables = await prisma.table.count({
      where: { outlet_id: outletId, is_deleted: false },
    });

    return {
      today: {
        orders: todayOrders.length,
        revenue: Math.round(todayRevenue * 100) / 100,
        avg_order_value: todayOrders.length > 0
          ? Math.round((todayRevenue / todayOrders.length) * 100) / 100
          : 0,
        paid_orders: todayOrders.filter((o) => o.is_paid).length,
        running_orders: todayOrders.filter((o) => !o.is_paid && o.status !== 'cancelled').length,
      },
      comparison: {
        yesterday_revenue: Math.round(yesterdayRevenue * 100) / 100,
        yesterday_orders: yesterdayOrders.length,
        revenue_growth_pct: revenueGrowth,
      },
      live: {
        active_tables: activeTables,
        total_tables: totalTables,
        occupancy_pct: totalTables > 0 ? Math.round((activeTables / totalTables) * 100) : 0,
        pending_kots: pendingKots,
      },
    };
  } catch (error) {
    logger.error('Get dashboard failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets hourly revenue breakdown for a date.
 * @param {string} outletId - Outlet UUID
 * @param {string} date - Date string
 * @returns {Promise<object[]>}
 */
async function getHourlyBreakdown(outletId, date) {
  const prisma = getDbClient();
  try {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId, is_deleted: false,
        created_at: { gte: targetDate, lt: nextDay },
        status: { notIn: ['cancelled', 'voided'] },
      },
      select: { created_at: true, grand_total: true },
    });

    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: i, orders: 0, revenue: 0,
    }));

    for (const order of orders) {
      const hour = new Date(order.created_at).getHours();
      hourly[hour].orders++;
      hourly[hour].revenue += Number(order.grand_total);
    }

    return hourly.map((h) => ({ ...h, revenue: Math.round(h.revenue * 100) / 100 }));
  } catch (error) {
    throw error;
  }
}

async function getCategoryWiseSales(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date();
    if(!from) fromDate.setHours(0,0,0,0);
    const toDate = to ? new Date(to) : new Date();
    if(!to) toDate.setDate(toDate.getDate() + 1);

    const orderItems = await prisma.orderItem.findMany({
      where: { order: { outlet_id: outletId, status: { notIn: ['cancelled'] }, created_at: { gte: fromDate, lte: toDate } } },
      include: { order: true }
    });
    
    // Stub categories from item names for simplicity if category relation is deep
    const categories = {};
    for(const oi of orderItems) {
       const cat = (oi.name && oi.name.includes('Tikka') ? 'Starters' : 'Main Course');
       if(!categories[cat]) categories[cat] = 0;
       categories[cat] += Number(oi.item_total);
    }
    return Object.keys(categories).map(k => ({ category: k, revenue: categories[k] }));
  } catch(e) { throw e; }
}

async function getGstReport(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date();
    if(!from) fromDate.setHours(0,0,0,0);
    const toDate = to ? new Date(to) : new Date();
    if(!to) toDate.setDate(toDate.getDate() + 1);

    const orders = await prisma.order.findMany({
      where: { outlet_id: outletId, status: { notIn: ['cancelled'] }, created_at: { gte: fromDate, lte: toDate } }
    });
    
    let taxBreakdown = {};
    for (const order of orders) {
      const dateStr = order.created_at.toISOString().split('T')[0];
      if(!taxBreakdown[dateStr]) taxBreakdown[dateStr] = { date: dateStr, taxable: 0, cgst: 0, sgst: 0, total_tax: 0 };
      const sub = Number(order.subtotal);
      const tax = Number(order.total_tax);
      taxBreakdown[dateStr].taxable += sub;
      taxBreakdown[dateStr].total_tax += tax;
      taxBreakdown[dateStr].cgst += tax/2;
      taxBreakdown[dateStr].sgst += tax/2;
    }
    return Object.values(taxBreakdown);
  } catch(e) { throw e; }
}

async function getStaffPerformance(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date();
    if(!from) fromDate.setHours(0,0,0,0);
    const toDate = to ? new Date(to) : new Date();
    if(!to) toDate.setDate(toDate.getDate() + 1);

    const orders = await prisma.order.findMany({
      where: { outlet_id: outletId, created_at: { gte: fromDate, lte: toDate } },
      include: { staff: true }
    });
    
    const staffMap = {};
    for (const order of orders) {
       const staffName = order.staff ? `${order.staff.first_name} ${order.staff.last_name}` : 'Self Order / POS';
       if(!staffMap[staffName]) staffMap[staffName] = { name: staffName, orders: 0, revenue: 0, discounts: 0, voids: 0 };
       
       if(order.status === 'voided') staffMap[staffName].voids++;
       else {
          staffMap[staffName].orders++;
          staffMap[staffName].revenue += Number(order.grand_total);
          staffMap[staffName].discounts += Number(order.discount_amount);
       }
    }
    return Object.values(staffMap).sort((a,b)=>b.revenue - a.revenue);
  } catch(e) { throw e; }
}

async function getTopSellingItems(outletId, limit = 5) {
  const prisma = getDbClient();
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const items = await prisma.orderItem.groupBy({
      by: ['menu_item_id', 'name'],
      where: {
        is_deleted: false,
        order: { 
          outlet_id: outletId, 
          is_deleted: false, 
          created_at: { gte: firstDay }, 
          status: { notIn: ['cancelled', 'voided'] } 
        }
      },
      _sum: { quantity: true, item_total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit
    });

    return items.map(i => ({
      name: i.name,
      count: i._sum.quantity || 0,
      revenue: Number(i._sum.item_total || 0),
      // We don't have category here easily, stub for now as 'Food'
      category: 'Food'
    }));
  } catch (error) {
    logger.error('Get top selling items failed', { error: error.message });
    throw error;
  }
}

/**
 * Detailed GST report with rate-wise, daily, and HSN breakdown.
 * @param {string} outletId
 * @param {string} from
 * @param {string} to
 */
async function getGstDetailedReport(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date();
    if (!from) fromDate.setHours(0, 0, 0, 0);
    const toDate = to ? new Date(to) : new Date();
    if (to) toDate.setHours(23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        status: { notIn: ['cancelled', 'voided'] },
        created_at: { gte: fromDate, lte: toDate },
      },
      include: {
        items: {
          where: { is_deleted: false },
          select: {
            quantity: true,
            item_total: true,
            item_tax: true,
            gst_rate: true,
            name: true,
            menu_item: { select: { hsn_code: true, name: true } },
          },
        },
      },
    });

    // Daily register
    const dailyMap = {};
    // Rate-wise map
    const rateMap = {};
    // HSN map
    const hsnMap = {};

    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalTax = 0;

    for (const order of orders) {
      const dateStr = order.created_at.toISOString().split('T')[0];
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, order_count: 0, gross_revenue: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total_tax: 0, grand_total: 0 };
      }

      const gross = Number(order.subtotal || 0);
      const discount = Number(order.discount_amount || 0);
      const tax = Number(order.total_tax || 0);
      const cgst = Number(order.cgst || tax / 2);
      const sgst = Number(order.sgst || tax / 2);
      const igst = Number(order.igst || 0);
      const taxable = gross - discount;
      const grand = Number(order.grand_total || 0);

      dailyMap[dateStr].order_count++;
      dailyMap[dateStr].gross_revenue += gross;
      dailyMap[dateStr].discount += discount;
      dailyMap[dateStr].taxable += taxable;
      dailyMap[dateStr].cgst += cgst;
      dailyMap[dateStr].sgst += sgst;
      dailyMap[dateStr].igst += igst;
      dailyMap[dateStr].total_tax += tax;
      dailyMap[dateStr].grand_total += grand;

      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalTax += tax;

      // Rate-wise from items
      for (const item of order.items) {
        const rate = Number(item.gst_rate || 0);
        const itemTax = Number(item.item_tax || 0);
        const itemTotal = Number(item.item_total || 0);
        const itemTaxable = itemTotal;
        const itemCgst = itemTax / 2;
        const itemSgst = itemTax / 2;

        if (!rateMap[rate]) {
          rateMap[rate] = { rate, order_count: 0, taxable: 0, cgst: 0, sgst: 0, total_tax: 0 };
        }
        rateMap[rate].order_count++;
        rateMap[rate].taxable += itemTaxable;
        rateMap[rate].cgst += itemCgst;
        rateMap[rate].sgst += itemSgst;
        rateMap[rate].total_tax += itemTax;

        // HSN
        const hsnCode = item.menu_item?.hsn_code || null;
        const hsnKey = hsnCode || `NO_HSN_${rate}`;
        if (!hsnMap[hsnKey]) {
          hsnMap[hsnKey] = {
            hsn_code: hsnCode,
            description: item.menu_item?.name || item.name,
            gst_rate: rate,
            total_qty: 0,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            total_tax: 0,
          };
        }
        hsnMap[hsnKey].total_qty += item.quantity;
        hsnMap[hsnKey].taxable += itemTaxable;
        hsnMap[hsnKey].cgst += itemCgst;
        hsnMap[hsnKey].sgst += itemSgst;
        hsnMap[hsnKey].total_tax += itemTax;
      }
    }

    const round2 = (n) => Math.round(n * 100) / 100;

    const daily = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        gross_revenue: round2(d.gross_revenue),
        discount: round2(d.discount),
        taxable: round2(d.taxable),
        cgst: round2(d.cgst),
        sgst: round2(d.sgst),
        igst: round2(d.igst),
        total_tax: round2(d.total_tax),
        grand_total: round2(d.grand_total),
      }));

    const by_rate = Object.values(rateMap)
      .sort((a, b) => a.rate - b.rate)
      .map((r) => ({
        ...r,
        taxable: round2(r.taxable),
        cgst: round2(r.cgst),
        sgst: round2(r.sgst),
        total_tax: round2(r.total_tax),
      }));

    const hsn = Object.values(hsnMap)
      .sort((a, b) => b.taxable - a.taxable)
      .map((h) => ({
        ...h,
        taxable: round2(h.taxable),
        cgst: round2(h.cgst),
        sgst: round2(h.sgst),
        total_tax: round2(h.total_tax),
      }));

    return {
      period: { from, to },
      totals: {
        order_count: orders.length,
        taxable: round2(totalTaxable),
        cgst: round2(totalCgst),
        sgst: round2(totalSgst),
        igst: round2(totalIgst),
        total_tax: round2(totalTax),
      },
      daily,
      by_rate,
      hsn,
    };
  } catch (error) {
    logger.error('Get GST detailed report failed', { error: error.message });
    throw error;
  }
}

/**
 * Generate GST export CSV (GSTR-1, GSTR-3B summary, HSN, rate-wise).
 */
async function exportGstCsv(outletId, from, to, type = 'gstr1') {
  const data = await getGstDetailedReport(outletId, from, to);

  let csv = '';
  const fmt = (n) => Number(n || 0).toFixed(2);

  if (type === 'gstr1') {
    csv += 'GSTR-1 - Daily GST Register\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'Date,Orders,Gross Revenue,Discount,Taxable Value,CGST,SGST,IGST,Total Tax,Grand Total\n';
    for (const row of data.daily) {
      csv += `${row.date},${row.order_count},${fmt(row.gross_revenue)},${fmt(row.discount)},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},${fmt(row.igst)},${fmt(row.total_tax)},${fmt(row.grand_total)}\n`;
    }
    csv += `\nTOTAL,${data.totals.order_count},,,"${fmt(data.totals.taxable)}","${fmt(data.totals.cgst)}","${fmt(data.totals.sgst)}","${fmt(data.totals.igst)}","${fmt(data.totals.total_tax)}"\n`;
  } else if (type === 'gstr3b') {
    csv += 'GSTR-3B Summary\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'GST Rate (%),Total Orders,Taxable Amount,CGST,SGST,IGST,Total Tax\n';
    for (const row of data.by_rate) {
      csv += `${row.rate},${row.order_count},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},0.00,${fmt(row.total_tax)}\n`;
    }
    csv += `\nGrand Total,${data.totals.order_count},${fmt(data.totals.taxable)},${fmt(data.totals.cgst)},${fmt(data.totals.sgst)},${fmt(data.totals.igst)},${fmt(data.totals.total_tax)}\n`;
  } else if (type === 'hsn') {
    csv += 'HSN-wise Summary (GSTR-1 Table 12)\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'HSN Code,Description,UOM,Total Qty,GST Rate (%),Taxable Value,CGST,SGST,Total Tax\n';
    for (const row of data.hsn) {
      csv += `"${row.hsn_code || 'N/A'}","${(row.description || '').replace(/"/g, '""')}",NOS,${row.total_qty},${row.gst_rate},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},${fmt(row.total_tax)}\n`;
    }
  } else if (type === 'rate_wise') {
    csv += 'Rate-wise GST Summary\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'GST Rate (%),Orders,Taxable Amount,CGST,SGST,Total Tax\n';
    for (const row of data.by_rate) {
      csv += `${row.rate},${row.order_count},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},${fmt(row.total_tax)}\n`;
    }
  }

  return csv;
}

module.exports = {
  getDailySales, getItemWiseSales, getRevenueTrend,
  getDashboard, getHourlyBreakdown, getCategoryWiseSales, getGstReport, getStaffPerformance,
  getTopSellingItems, getGstDetailedReport, exportGstCsv,
};
