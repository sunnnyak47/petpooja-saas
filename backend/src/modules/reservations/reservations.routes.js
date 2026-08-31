const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { getDbClient } = require('../../config/database');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createReservationSchema, updateReservationSchema, publicReservationSchema,
} = require('./reservations.validation');
const reservationService = require('./reservations.service');
const { sendSuccess, sendError } = require('../../utils/response');

/* ==================================================================
   PUBLIC ROUTES (UNAUTHENTICATED) — customer self-reservation via
   QR code / shared link. These are declared BEFORE `router.use(authenticate)`
   so no session is required. The outlet is taken from the link (path/body)
   and validated to exist + be active; nothing else is trusted.
   ================================================================== */

// Basic abuse guard for the public create endpoint.
const publicReservationLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { success: false, message: 'Too many reservation attempts, please try again shortly' },
});

/** GET /api/reservations/public/:outletId/info — outlet + table info for the public page */
router.get('/public/:outletId/info', async (req, res, next) => {
  try {
    const info = await reservationService.getPublicOutletInfo(req.params.outletId);
    if (!info) return sendError(res, 404, 'Reservations are not available for this restaurant');
    sendSuccess(res, info);
  } catch (err) { next(err); }
});

/** POST /api/reservations/public — customer creates a reservation for the outlet in the link */
router.post('/public', publicReservationLimiter, validate(publicReservationSchema), async (req, res, next) => {
  try {
    const reservation = await reservationService.createPublicReservation(req.body);
    sendSuccess(res, reservation, 'Reservation request received', 201);
  } catch (err) {
    if (err && err.status) return sendError(res, err.status, err.message);
    next(err);
  }
});

/* ==================================================================
   AUTHENTICATED ROUTES (owner/staff) below this line.
   ================================================================== */
router.use(authenticate);

/** GET /api/reservations */
router.get('/', hasPermission('MANAGE_POS'), async (req, res, next) => {
  try {
    const { outlet_id, date } = req.query;
    const where = { is_deleted: false };
    // SECURITY: never run an unscoped findMany here — with only { is_deleted:false }
    // any authenticated user would dump every tenant's reservation PII across all
    // outlets (multi-tenant leak / IDOR). Always derive scope from req.user, and
    // validate any client-supplied outlet_id against the caller's own tenant.
    if (['super_admin', 'owner'].includes(req.user.role)) {
      // Owners/super_admins may span multiple outlets, but only within their tenant.
      if (outlet_id) {
        const owned = await getDbClient().outlet.findFirst({
          where: { id: outlet_id, head_office_id: req.user.head_office_id },
          select: { id: true },
        });
        if (!owned) return sendError(res, 403, 'Access denied: cannot access data from another outlet');
        where.outlet_id = outlet_id;
      } else {
        where.outlet = { head_office_id: req.user.head_office_id };
      }
    } else {
      // Non-privileged staff are locked to their assigned outlet; ignore client outlet_id.
      where.outlet_id = req.user.outlet_id;
    }
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime()))
        return sendError(res, 400, 'Invalid date format, expected YYYY-MM-DD');
      const d = new Date(date);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      where.reservation_date = { gte: d, lt: next };
    }
    const reservations = await getDbClient().tableReservation.findMany({
      where,
      include: { table: { select: { id: true, table_number: true, seating_capacity: true } } },
      orderBy: [{ reservation_date: 'asc' }, { reservation_time: 'asc' }],
    });
    sendSuccess(res, reservations.map(r => ({
      ...r,
      reservation_date: r.reservation_date?.toISOString(),
      reservation_time: r.reservation_time
        ? `${String(new Date(r.reservation_time).getUTCHours()).padStart(2,'0')}:${String(new Date(r.reservation_time).getUTCMinutes()).padStart(2,'0')}`
        : null,
      customer_email: r.customer_email || null,
      special_requests: r.notes,
      table_preference: r.table?.table_number ? `Table ${r.table.table_number}` : null,
    })));
  } catch (err) { next(err); }
});

/** POST /api/reservations */
router.post('/', hasPermission('MANAGE_POS'), validate(createReservationSchema), async (req, res, next) => {
  try {
    const { customer_name, customer_phone, party_size, reservation_date,
            reservation_time, special_requests, outlet_id, table_id } = req.body;
    if (!customer_name || !reservation_date || !outlet_id)
      return sendError(res, 400, 'customer_name, reservation_date, outlet_id are required');

    // SECURITY: resolve table_id against THIS outlet — never trust a client-supplied
    // table_id verbatim (as the service functions already do), or a MANAGE_POS user
    // could attach another outlet's table to the reservation (cross-outlet reference).
    // An invalid/foreign id resolves to null and falls through to auto-suggest below.
    let tid = null;
    if (table_id) {
      const chosen = await getDbClient().table.findFirst({
        where: { id: table_id, outlet_id, is_deleted: false },
        select: { id: true },
      });
      tid = chosen?.id || null;
      // Conflict check: reject if the explicitly requested table already has a
      // reservation within ±90 min of the requested slot.
      if (tid && reservation_date && reservation_time) {
        const booked = await reservationService.getBookedTableIds(outlet_id, reservation_date, reservation_time);
        if (booked.has(tid))
          return sendError(res, 409, 'This table is already reserved for the requested time slot. Please choose a different table or time.');
      }
    }
    // Pick a table if not specified — auto-suggest the best-fit free table for the
    // slot, excluding any already booked within ±90 min.
    if (!tid) {
      const [suggested] = await reservationService.suggestTables(outlet_id, party_size, 1, reservation_date, reservation_time);
      if (suggested) {
        tid = suggested.id;
      } else {
        const anyTable = await getDbClient().table.findFirst({ where: { outlet_id, is_deleted: false } });
        if (!anyTable) return sendError(res, 400, 'No tables found for this outlet');
        return sendError(res, 409, 'No tables are available for the requested time slot. Please choose a different time.');
      }
    }

    const resDate = new Date(reservation_date);
    const [hh = '12', mm = '00'] = (reservation_time || '12:00').split(':');
    const resTime = new Date(`1970-01-01T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00Z`);

    const reservation = await getDbClient().tableReservation.create({
      data: {
        outlet_id, table_id: tid,
        customer_name: customer_name || 'Guest',
        customer_phone: customer_phone || '',
        party_size: parseInt(party_size) || 2,
        reservation_date: resDate,
        reservation_time: resTime,
        notes: special_requests || '',
        status: 'confirmed',
      },
    });
    sendSuccess(res, reservation, 'Reservation created', 201);
  } catch (err) { next(err); }
});

/** PATCH /api/reservations/:id */
router.patch('/:id', hasPermission('MANAGE_POS'), validate(updateReservationSchema), async (req, res, next) => {
  try {
    const { status, customer_name, customer_phone, party_size,
            reservation_date, reservation_time, special_requests } = req.body;
    const data = {};
    if (status)           data.status = status.toLowerCase();
    if (customer_name)    data.customer_name = customer_name;
    if (customer_phone)   data.customer_phone = customer_phone;
    if (party_size)       data.party_size = parseInt(party_size);
    if (reservation_date) data.reservation_date = new Date(reservation_date);
    if (reservation_time) {
      const [hh = '12', mm = '00'] = reservation_time.split(':');
      data.reservation_time = new Date(`1970-01-01T${hh.padStart(2,'0')}:${mm.padStart(2,'0')}:00Z`);
    }
    if (special_requests !== undefined) data.notes = special_requests;
    // SECURITY: verify the reservation exists AND belongs to the caller's tenant
    // before mutating by id. Without this an outlet's MANAGE_POS user could edit
    // another tenant's reservation by id (multi-tenant IDOR). Mirrors enforceOutletScope:
    // owners/super_admins may cross their own outlets; staff are locked to theirs.
    const existing = await getDbClient().tableReservation.findFirst({
      where: { id: req.params.id, is_deleted: false },
      select: { id: true, outlet_id: true, table_id: true, reservation_date: true, reservation_time: true },
    });
    if (!existing) return sendError(res, 404, 'Reservation not found');
    if (!['super_admin', 'owner'].includes(req.user.role) && existing.outlet_id !== req.user.outlet_id)
      return sendError(res, 403, 'Access denied: cannot access data from another outlet');

    // Double-booking guard: when seating a party, reject if another reservation on
    // the same table is already 'seated' (someone is physically at the table now).
    if (data.status === 'seated' && existing.table_id) {
      const alreadySeated = await getDbClient().tableReservation.findFirst({
        where: {
          id: { not: existing.id },
          table_id: existing.table_id,
          status: 'seated',
          is_deleted: false,
        },
        select: { id: true },
      });
      if (alreadySeated)
        return sendError(res, 409, 'Another party is currently seated at this table. Please complete or move that reservation first.');
    }

    const updated = await getDbClient().tableReservation.update({ where: { id: req.params.id }, data });
    sendSuccess(res, updated, 'Reservation updated');
  } catch (err) { next(err); }
});

/** DELETE /api/reservations/:id */
router.delete('/:id', hasPermission('MANAGE_POS'), async (req, res, next) => {
  try {
    // SECURITY: same multi-tenant IDOR guard as PATCH — confirm the reservation
    // belongs to the caller's tenant before soft-deleting it by id.
    const existing = await getDbClient().tableReservation.findFirst({
      where: { id: req.params.id, is_deleted: false },
      select: { id: true, outlet_id: true },
    });
    if (!existing) return sendError(res, 404, 'Reservation not found');
    if (!['super_admin', 'owner'].includes(req.user.role) && existing.outlet_id !== req.user.outlet_id)
      return sendError(res, 403, 'Access denied: cannot access data from another outlet');
    await getDbClient().tableReservation.update({ where: { id: req.params.id }, data: { is_deleted: true } });
    sendSuccess(res, { deleted: true }, 'Reservation deleted');
  } catch (err) { next(err); }
});

module.exports = router;
