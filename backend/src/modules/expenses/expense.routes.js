/**
 * @fileoverview Expense routes — CRUD for outlet-level expense tracking.
 * Mounted at /api by app.js, so paths are /api/expenses and /api/expenses/:id
 */

const express = require('express');
const router = express.Router();
const { getDbClient } = require('../../config/database');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { sendSuccess, sendCreated } = require('../../utils/response');
const logger = require('../../config/logger');

const VIEW   = hasPermission('VIEW_REPORTS');
const MANAGE = hasPermission('MANAGE_INVENTORY');   // closest existing permission

/** GET /api/expenses?outlet_id=&month=&year=&limit= */
router.get('/expenses', authenticate, async (req, res, next) => {
  try {
    const prisma = getDbClient();
    const { outlet_id, month, year, limit = '100' } = req.query;
    const outletId = outlet_id || req.user.outlet_id;
    if (!outletId) return res.status(400).json({ success: false, message: 'outlet_id required' });

    const where = { outlet_id: outletId, is_deleted: false };

    if (month && year) {
      const m = parseInt(month, 10);   // 1-12
      const y = parseInt(year, 10);
      where.expense_date = {
        gte: new Date(y, m - 1, 1),
        lte: new Date(y, m, 0, 23, 59, 59),
      };
    }

    const [items, agg] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { expense_date: 'desc' },
        take: Math.min(parseInt(limit, 10), 500),
      }),
      prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    sendSuccess(res, {
      items,
      total_amount:  parseFloat(agg._sum.amount ?? 0),
      total_count:   agg._count.id,
    });
  } catch (e) { next(e); }
});

/** POST /api/expenses */
router.post('/expenses', authenticate, MANAGE, async (req, res, next) => {
  try {
    const prisma = getDbClient();
    const {
      outlet_id, title, description,
      amount, category, expense_date,
      payment_method, notes,
    } = req.body;
    const outletId = outlet_id || req.user.outlet_id;

    if (!title || amount == null) {
      return res.status(400).json({ success: false, message: 'title and amount are required' });
    }

    const expense = await prisma.expense.create({
      data: {
        outlet_id:      outletId,
        title:          title.trim(),
        description:    description?.trim() || null,
        amount:         parseFloat(amount),
        category:       category || 'Misc',
        expense_date:   expense_date ? new Date(expense_date) : new Date(),
        payment_method: payment_method || 'Cash',
        notes:          notes?.trim() || null,
        created_by:     req.user.id,
      },
    });

    logger.info('Expense created', { id: expense.id, outlet_id: outletId, amount });
    sendCreated(res, expense, 'Expense recorded');
  } catch (e) { next(e); }
});

/** PATCH /api/expenses/:id */
router.patch('/expenses/:id', authenticate, MANAGE, async (req, res, next) => {
  try {
    const prisma = getDbClient();
    const { title, description, amount, category, expense_date, payment_method, notes } = req.body;
    const updated = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        ...(title          !== undefined && { title:          title.trim() }),
        ...(description    !== undefined && { description:    description?.trim() || null }),
        ...(amount         !== undefined && { amount:         parseFloat(amount) }),
        ...(category       !== undefined && { category }),
        ...(expense_date   !== undefined && { expense_date:   new Date(expense_date) }),
        ...(payment_method !== undefined && { payment_method }),
        ...(notes          !== undefined && { notes:          notes?.trim() || null }),
      },
    });
    sendSuccess(res, updated, 'Expense updated');
  } catch (e) { next(e); }
});

/** DELETE /api/expenses/:id */
router.delete('/expenses/:id', authenticate, MANAGE, async (req, res, next) => {
  try {
    const prisma = getDbClient();
    await prisma.expense.update({
      where: { id: req.params.id },
      data: { is_deleted: true },
    });
    logger.info('Expense deleted', { id: req.params.id });
    sendSuccess(res, { deleted: true }, 'Expense deleted');
  } catch (e) { next(e); }
});

module.exports = router;
