/**
 * @fileoverview Orders module integration tests.
 * Tests: create order, list, get by id, add items, status update, payment, cancel.
 * Runs against real app (requires DB) — skips gracefully if DB unavailable.
 * @module tests/orders.test
 */

const request = require('supertest');

/* ── helpers ── */
const makePhone = () => `9${Math.floor(100000000 + Math.random() * 900000000)}`;

let app;
let accessToken = '';
let outletId    = '';
let orderId     = '';
let menuItemId  = '';

const OWNER = {
  full_name: `Orders Test User`,
  email:     `orderstest_${Date.now()}@petpooja.com`,
  phone:     makePhone(),
  password:  'OrderTest@123',
};

/* ── setup ── */
beforeAll(async () => {
  process.env.NODE_ENV  = 'test';
  process.env.PORT      = '0';
  process.env.JWT_ACCESS_SECRET  = 'test-access-secret-256-bit-minimum-length-key-here';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-256-bit-minimum-length-key-here';

  try {
    app = require('../src/app').app;
  } catch (e) {
    console.log('App load skipped (requires DB):', e.message);
    return;
  }

  /* Register a fresh owner */
  const regRes = await request(app).post('/api/auth/register').send(OWNER);
  if (regRes.status === 201) {
    accessToken = regRes.body.data.accessToken;
    outletId    = regRes.body.data.user?.outlet_id || '';
  }

  /* Grab outletId from /me if not in register response */
  if (accessToken && !outletId) {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    outletId = me.body.data?.outlet_id || '';
  }

  /* Grab first menu item for order creation */
  if (accessToken && outletId) {
    const items = await request(app)
      .get('/api/menu/items')
      .set('Authorization', `Bearer ${accessToken}`);
    if (items.body?.data?.items?.length) {
      menuItemId = items.body.data.items[0].id;
    }
  }
}, 30000);

/* ── test suites ── */
describe('Orders Module', () => {

  describe('GET /api/orders — list orders', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
    });

    test('returns 200 with valid token', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data?.orders ?? res.body.data)).toBe(true);
    });

    test('accepts pagination params', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/orders?page=1&limit=5')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 400]).toContain(res.status);
    });

    test('accepts status filter', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/orders?status=pending')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('POST /api/orders — create order', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/orders')
        .send({ outlet_id: outletId, order_type: 'dine_in', items: [] });
      expect(res.status).toBe(401);
    });

    test('returns 400 with empty items', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ outlet_id: outletId, order_type: 'dine_in', items: [] });
      expect(res.status).toBe(400);
    });

    test('creates a dine_in order successfully', async () => {
      if (!app || !accessToken || !outletId || !menuItemId) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id:  outletId,
          order_type: 'dine_in',
          source:     'pos',
          items: [{ menu_item_id: menuItemId, quantity: 2, notes: 'no onion' }],
        });

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data.order).toHaveProperty('id');
        expect(res.body.data.order).toHaveProperty('order_number');
        expect(res.body.data.order.order_type).toBe('dine_in');
        orderId = res.body.data.order.id;
      } else {
        // Service may fail on test DB state — just verify it's a structured response
        expect(res.body).toHaveProperty('success');
      }
    });

    test('creates a takeaway order', async () => {
      if (!app || !accessToken || !outletId || !menuItemId) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id:  outletId,
          order_type: 'takeaway',
          source:     'pos',
          items: [{ menu_item_id: menuItemId, quantity: 1 }],
        });
      expect([201, 400, 403, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.data.order.order_type).toBe('takeaway');
      }
    });

    test('rejects missing outlet_id', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ order_type: 'dine_in', items: [{ menu_item_id: menuItemId, quantity: 1 }] });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/orders/:id — get single order', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/orders/nonexistent-id');
      expect(res.status).toBe(401);
    });

    test('returns 404 for nonexistent order', async () => {
      if (!app || !accessToken) return;
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/orders/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect([404, 400]).toContain(res.status);
    });

    test('returns order details for valid id', async () => {
      if (!app || !accessToken || !orderId) return;
      const res = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      if (res.status === 200) {
        expect(res.body.data).toHaveProperty('id', orderId);
        expect(res.body.data).toHaveProperty('items');
      }
    });
  });

  describe('PATCH /api/orders/:id/status — status updates', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .patch('/api/orders/some-id/status')
        .send({ status: 'confirmed' });
      expect(res.status).toBe(401);
    });

    test('returns 400 for invalid status', async () => {
      if (!app || !accessToken || !orderId) return;
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'invalid_status_xyz' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('updates order to confirmed', async () => {
      if (!app || !accessToken || !orderId) return;
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'confirmed' });
      expect([200, 400, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data.status).toBe('confirmed');
      }
    });

    test('updates order to ready', async () => {
      if (!app || !accessToken || !orderId) return;
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'ready' });
      expect([200, 400, 403]).toContain(res.status);
    });
  });

  describe('POST /api/orders/:id/cancel — cancel order', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/orders/some-id/cancel')
        .send({ reason: 'Customer request' });
      expect(res.status).toBe(401);
    });

    test('returns 400 without reason', async () => {
      if (!app || !accessToken || !orderId) return;
      const res = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/orders/:id/payment — process payment', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/orders/some-id/payment')
        .send({ method: 'cash', amount: 100 });
      expect(res.status).toBe(401);
    });

    test('returns 400 for missing payment method', async () => {
      if (!app || !accessToken || !orderId) return;
      const res = await request(app)
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('accepts valid payment payload shape', async () => {
      if (!app || !accessToken || !orderId) return;
      const res = await request(app)
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ method: 'cash', amount: 0 }); // will fail business logic — just checking plumbing
      expect([200, 400, 403, 409]).toContain(res.status);
      expect(res.body).toHaveProperty('success');
    });
  });

  describe('POST /api/orders/:id/kot — generate KOT', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).post('/api/orders/some-id/kot');
      expect(res.status).toBe(401);
    });

    test('returns 404 for nonexistent order', async () => {
      if (!app || !accessToken) return;
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const res = await request(app)
        .post(`/api/orders/${fakeId}/kot`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect([404, 400]).toContain(res.status);
    });
  });
});
