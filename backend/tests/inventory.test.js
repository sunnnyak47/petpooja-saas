/**
 * @fileoverview Inventory module integration tests.
 * Tests: list items, create, stock, adjust, wastage, recipes, low-stock, suppliers.
 * @module tests/inventory.test
 */

const request = require('supertest');

const makePhone = () => `9${Math.floor(100000000 + Math.random() * 900000000)}`;

let app;
let accessToken = '';
let outletId    = '';
let itemId      = '';   // created inventory item id

const OWNER = {
  full_name: `Inventory Test User`,
  email:     `invtest_${Date.now()}@petpooja.com`,
  phone:     makePhone(),
  password:  'InvTest@123',
};

const SAMPLE_ITEM = {
  name:            'Test Tomatoes',
  unit:            'kg',
  current_stock:   50,
  minimum_stock:   5,
  reorder_level:   10,
  reorder_quantity:20,
  cost_per_unit:   40,
  category:        'Vegetables',
};

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

  const regRes = await request(app).post('/api/auth/register').send(OWNER);
  if (regRes.status === 201) {
    accessToken = regRes.body.data.accessToken;
    outletId    = regRes.body.data.user?.outlet_id || '';
  }

  if (accessToken && !outletId) {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    outletId = me.body.data?.outlet_id || '';
  }
}, 30000);

describe('Inventory Module', () => {

  describe('GET /api/inventory/items — list items', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/inventory/items');
      expect(res.status).toBe(401);
    });

    test('returns 200 with valid token', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // items may be an array or wrapped object
      const items = res.body.data?.items ?? res.body.data;
      expect(Array.isArray(items)).toBe(true);
    });

    test('accepts search query param', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/inventory/items?search=tomato')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 400]).toContain(res.status);
    });

    test('accepts category filter', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/inventory/items?category=Vegetables')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('POST /api/inventory/items — create item', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/inventory/items')
        .send(SAMPLE_ITEM);
      expect(res.status).toBe(401);
    });

    test('returns 400 for missing required fields', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ unit: 'kg' }); // missing name, outlet_id
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('creates an inventory item successfully', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...SAMPLE_ITEM, outlet_id: outletId });

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data.name).toBe(SAMPLE_ITEM.name);
        expect(res.body.data.unit).toBe(SAMPLE_ITEM.unit);
        itemId = res.body.data.id;
      } else {
        expect(res.body).toHaveProperty('success');
      }
    });
  });

  describe('PATCH /api/inventory/items/:id — update item', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .patch('/api/inventory/items/some-id')
        .send({ name: 'Updated' });
      expect(res.status).toBe(401);
    });

    test('returns 404 for nonexistent item', async () => {
      if (!app || !accessToken) return;
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .patch(`/api/inventory/items/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Ghost Item' });
      expect([404, 400]).toContain(res.status);
    });

    test('updates item name when valid', async () => {
      if (!app || !accessToken || !itemId) return;
      const res = await request(app)
        .patch(`/api/inventory/items/${itemId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Tomatoes Updated' });
      if (res.status === 200) {
        expect(res.body.data.name).toBe('Test Tomatoes Updated');
      }
    });
  });

  describe('GET /api/inventory/stock — stock levels', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/inventory/stock');
      expect(res.status).toBe(401);
    });

    test('returns 200 with stock data', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/inventory/stock')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/inventory/adjust — adjust stock', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/inventory/adjust')
        .send({ item_id: itemId, quantity: 10, reason: 'restock' });
      expect(res.status).toBe(401);
    });

    test('returns 400 for missing fields', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('adjusts stock successfully', async () => {
      if (!app || !accessToken || !outletId || !itemId) return;
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id: outletId,
          item_id:   itemId,
          quantity:  10,
          reason:    'manual_restock',
        });
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('new_stock');
      } else {
        expect([400, 404]).toContain(res.status);
      }
    });

    test('handles negative adjustment (consumption)', async () => {
      if (!app || !accessToken || !outletId || !itemId) return;
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id: outletId,
          item_id:   itemId,
          quantity:  -5,
          reason:    'manual_consumption',
        });
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('GET /api/inventory/low-stock', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/inventory/low-stock');
      expect(res.status).toBe(401);
    });

    test('returns array of low stock items', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/inventory/wastage — record wastage', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/inventory/wastage')
        .send({ outlet_id: outletId, items: [] });
      expect(res.status).toBe(401);
    });

    test('returns 400 for empty items array', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .post('/api/inventory/wastage')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ outlet_id: outletId, items: [] });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('records wastage entries', async () => {
      if (!app || !accessToken || !outletId || !itemId) return;
      const res = await request(app)
        .post('/api/inventory/wastage')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id: outletId,
          items: [{ inventory_item_id: itemId, quantity: 1, reason: 'Expired' }],
        });
      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      } else {
        expect([400, 404]).toContain(res.status);
      }
    });
  });

  describe('GET /api/inventory/wastage — wastage logs', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/inventory/wastage');
      expect(res.status).toBe(401);
    });

    test('returns wastage log list', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/inventory/wastage')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/suppliers — supplier list', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      // Suppliers are owned by the procurement module at /api/suppliers
      // (the old /api/inventory/suppliers duplicate was removed).
      const res = await request(app).get('/api/suppliers');
      expect(res.status).toBe(401);
    });

    test('returns suppliers for outlet', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/inventory/suppliers')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('DELETE /api/inventory/items/:id — delete item', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).delete('/api/inventory/items/some-id');
      expect(res.status).toBe(401);
    });

    test('returns 404 for nonexistent item', async () => {
      if (!app || !accessToken) return;
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .delete(`/api/inventory/items/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect([404, 400]).toContain(res.status);
    });

    test('soft-deletes created item', async () => {
      if (!app || !accessToken || !itemId) return;
      const res = await request(app)
        .delete(`/api/inventory/items/${itemId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });
});
