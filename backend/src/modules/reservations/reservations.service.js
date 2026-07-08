/**
 * @fileoverview Reservation domain logic shared by the authenticated owner
 * routes and the PUBLIC (unauthenticated) QR/link self-reservation flow.
 *
 * Auto table suggestion: given a party size we pick the best-fit AVAILABLE table
 * (smallest capacity that still seats the party — least wasted seats). We only
 * READ the existing `tables` data (capacity + status); table state is owned by
 * the orders/tables module and is never mutated here.
 *
 * @module modules/reservations/reservations.service
 */

const { getDbClient } = require('../../config/database');

/**
 * Read all non-deleted tables for an outlet (capacity + live status only).
 * This mirrors what the GET /api/orders/tables endpoint returns; we never
 * write to the table model.
 * @param {string} outletId
 * @returns {Promise<Array<{id:string,table_number:string,seating_capacity:number,status:string,area_id:string|null}>>}
 */
async function getOutletTables(outletId) {
  return getDbClient().table.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    select: { id: true, table_number: true, seating_capacity: true, status: true, area_id: true },
    orderBy: { seating_capacity: 'asc' },
  });
}

/**
 * Rank tables by how well they fit a party. Best fit = the smallest AVAILABLE
 * table whose capacity is >= the party size (fewest wasted seats). If no single
 * available table is large enough, fall back to the largest available tables
 * (the guest may need adjoining tables). If nothing is currently available at
 * all, fall back to any table by fit — a reservation is for a future slot, so a
 * currently-occupied table can still be offered.
 * @param {Array} tables
 * @param {number} partySize
 * @returns {Array} ranked tables, best first
 */
function rankTablesByFit(tables, partySize) {
  const size = Math.max(1, parseInt(partySize, 10) || 1);
  const byCapAsc = (a, b) =>
    (a.seating_capacity - b.seating_capacity) ||
    String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true });
  const byCapDesc = (a, b) => (b.seating_capacity - a.seating_capacity) || byCapAsc(a, b);

  const available = tables.filter(t => (t.status || 'available') === 'available');

  // 1) available tables that seat the party, smallest first (least waste)
  const availableFits = available.filter(t => (t.seating_capacity || 0) >= size).sort(byCapAsc);
  if (availableFits.length) return availableFits;

  // 2) available tables that are too small — largest first (combine tables)
  if (available.length) return available.slice().sort(byCapDesc);

  // 3) nothing free right now — any table that fits, smallest first
  const anyFits = tables.filter(t => (t.seating_capacity || 0) >= size).sort(byCapAsc);
  if (anyFits.length) return anyFits;

  // 4) last resort — largest table of any status
  return tables.slice().sort(byCapDesc);
}

/**
 * Suggest the best-fit tables for a party size at an outlet.
 * @param {string} outletId
 * @param {number} partySize
 * @param {number} [limit=3]
 * @returns {Promise<Array>}
 */
async function suggestTables(outletId, partySize, limit = 3) {
  const tables = await getOutletTables(outletId);
  return rankTablesByFit(tables, partySize).slice(0, Math.max(1, limit));
}

/**
 * Public-safe outlet info for the self-reservation landing page + the table
 * data needed to compute a suggestion client-side. Returns null when the outlet
 * does not exist or is inactive (so the caller can 404).
 * @param {string} outletId
 * @returns {Promise<null|object>}
 */
async function getPublicOutletInfo(outletId) {
  const db = getDbClient();
  const outlet = await db.outlet.findFirst({
    where: { id: outletId, is_active: true, is_deleted: false },
    select: { id: true, name: true, currency: true, city: true, phone: true, logo_url: true, timezone: true },
  });
  if (!outlet) return null;

  const tables = await getOutletTables(outletId);
  const maxCapacity = tables.reduce((m, t) => Math.max(m, t.seating_capacity || 0), 0);

  return {
    outlet,
    // Capacity + status only — used to render availability and compute the
    // client-side "suggested table" hint. No orders/PII leaked.
    tables: tables.map(t => ({
      id: t.id,
      table_number: t.table_number,
      seating_capacity: t.seating_capacity,
      status: t.status,
    })),
    available_count: tables.filter(t => (t.status || 'available') === 'available').length,
    max_party_size: Math.min(50, maxCapacity || 50),
  };
}

/**
 * Build a Date for a time-only column, mirroring the owner route's handling.
 * @param {string} reservationTime "HH:MM"
 */
function parseTime(reservationTime) {
  const [hh = '12', mm = '00'] = String(reservationTime || '12:00').split(':');
  return new Date(`1970-01-01T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
}

/**
 * Create a reservation from the PUBLIC self-service flow. Tenant-safe: the
 * outlet is validated to exist and be active, and any client-supplied table_id
 * must belong to that outlet. When no table is supplied we auto-assign the
 * best-fit available table. Public bookings start as `pending` so staff confirm.
 *
 * @param {object} input
 * @returns {Promise<object>} sanitized reservation (no internal-only fields)
 */
async function createPublicReservation(input) {
  const db = getDbClient();
  const {
    outlet_id, customer_name, customer_phone, party_size,
    reservation_date, reservation_time, special_requests, table_id,
  } = input;

  const outlet = await db.outlet.findFirst({
    where: { id: outlet_id, is_active: true, is_deleted: false },
    select: { id: true },
  });
  if (!outlet) {
    const err = new Error('Reservations are not available for this restaurant');
    err.status = 404;
    throw err;
  }

  // Resolve the table: honour a valid client choice, else auto-suggest, else any.
  let tid = null;
  if (table_id) {
    const chosen = await db.table.findFirst({
      where: { id: table_id, outlet_id, is_deleted: false },
      select: { id: true },
    });
    tid = chosen?.id || null;
  }
  if (!tid) {
    const suggested = await suggestTables(outlet_id, party_size, 1);
    tid = suggested[0]?.id || null;
  }
  if (!tid) {
    const anyTable = await db.table.findFirst({
      where: { outlet_id, is_deleted: false },
      select: { id: true },
    });
    tid = anyTable?.id || null;
  }
  if (!tid) {
    const err = new Error('This restaurant has no tables set up for reservations yet');
    err.status = 400;
    throw err;
  }

  const created = await db.tableReservation.create({
    data: {
      outlet_id,
      table_id: tid,
      customer_name: customer_name || 'Guest',
      customer_phone: customer_phone || '',
      party_size: parseInt(party_size, 10) || 2,
      reservation_date: new Date(reservation_date),
      reservation_time: parseTime(reservation_time),
      notes: special_requests || '',
      status: 'pending', // self-service requests await staff confirmation
    },
    include: { table: { select: { table_number: true, seating_capacity: true } } },
  });

  return {
    id: created.id,
    status: created.status,
    customer_name: created.customer_name,
    party_size: created.party_size,
    reservation_date: created.reservation_date?.toISOString(),
    reservation_time: reservation_time || null,
    table_number: created.table?.table_number || null,
    table_capacity: created.table?.seating_capacity || null,
  };
}

module.exports = {
  getOutletTables,
  rankTablesByFit,
  suggestTables,
  getPublicOutletInfo,
  createPublicReservation,
};
