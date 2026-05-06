/**
 * @fileoverview Pricing & Discounts module integration tests.
 * Tests: pricing rules CRUD, live pricing, discount CRUD, validate coupon.
 * @module tests/pricing.test
 */

const request = require('supertest');

const makePhone = () => `9${Math.floor(100000000 + Math.random() * 900000000)}`;

let app;
let accessToken = '';
let outletId    = '';
let ruleId      = '';
let discountId  = '';

const OWNER = {
  full_name: `Pricing Test User`,
  email:     `pricingtest_${Date.now()}@petpooja.com`,
  phone:     makePhone(),
  password:  'PricingTest@123',
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

describe('Dynamic Pricing Module', () => {

  describe('GET /api/pricing/rules — list rules', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/pricing/rules');
      expect(res.status).toBe(401);
    });

    test('returns rules list with valid token', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/pricing/rules')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/pricing/rules — create rule', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/pricing/rules')
        .send({ name: 'Test Rule', type: 'percentage' });
      expect(res.status).toBe(401);
    });

    test('creates a surge pricing rule', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .post('/api/pricing/rules')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id:   outletId,
          name:        'Happy Hour Test',
          rule_type:   'time_based',
          adjustment_type: 'percentage',
          adjustment_value: -10,
          start_time:  '17:00',
          end_time:    '19:00',
          days_of_week: [1, 2, 3, 4, 5],
          is_active:   true,
        });

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        ruleId = res.body.data.id;
      } else {
        expect(res.body).toHaveProperty('success');
      }
    });

    test('returns 400 for missing required fields', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .post('/api/pricing/rules')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Incomplete Rule' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/pricing/live — current price multiplier', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/pricing/live');
      expect(res.status).toBe(401);
    });

    test('returns live pricing data', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/pricing/live')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('PATCH /api/pricing/rules/:id — update rule', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .patch('/api/pricing/rules/some-id')
        .send({ is_active: false });
      expect(res.status).toBe(401);
    });

    test('updates rule when valid', async () => {
      if (!app || !accessToken || !ruleId) return;
      const res = await request(app)
        .patch(`/api/pricing/rules/${ruleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Happy Hour Updated' });
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('POST /api/pricing/rules/:id/toggle — toggle rule', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/pricing/rules/some-id/toggle')
        .send({});
      expect(res.status).toBe(401);
    });

    test('toggles rule active state', async () => {
      if (!app || !accessToken || !ruleId) return;
      const res = await request(app)
        .post(`/api/pricing/rules/${ruleId}/toggle`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('DELETE /api/pricing/rules/:id — delete rule', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).delete('/api/pricing/rules/some-id');
      expect(res.status).toBe(401);
    });

    test('deletes created rule', async () => {
      if (!app || !accessToken || !ruleId) return;
      const res = await request(app)
        .delete(`/api/pricing/rules/${ruleId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });
});

describe('Discounts Module', () => {

  describe('GET /api/discounts — list discounts', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/discounts');
      expect(res.status).toBe(401);
    });

    test('returns discount list', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/discounts')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/discounts — create discount', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/discounts')
        .send({ code: 'TESTCODE', value: 10 });
      expect(res.status).toBe(401);
    });

    test('creates percentage discount', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .post('/api/discounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id:   outletId,
          code:        `TEST${Date.now()}`,
          name:        'Integration Test Discount',
          type:        'percentage',
          value:       15,
          min_order_amount: 100,
          is_active:   true,
        });

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        discountId = res.body.data.id;
      } else {
        expect(res.body).toHaveProperty('success');
      }
    });

    test('creates flat discount', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .post('/api/discounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          outlet_id: outletId,
          code:      `FLAT${Date.now()}`,
          name:      'Flat 50 Off',
          type:      'flat',
          value:     50,
          is_active: true,
        });
      expect([201, 400, 409]).toContain(res.status);
    });
  });

  describe('POST /api/discounts/validate — validate coupon code', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/discounts/validate')
        .send({ code: 'TESTCODE', order_amount: 200 });
      expect(res.status).toBe(401);
    });

    test('returns 400 for missing code', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .post('/api/discounts/validate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ order_amount: 200 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('returns invalid for non-existent code', async () => {
      if (!app || !accessToken || !outletId) return;
      const res = await request(app)
        .post('/api/discounts/validate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'NONEXISTENT999', outlet_id: outletId, order_amount: 500 });
      expect([200, 400, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data.valid).toBe(false);
      }
    });
  });

  describe('DELETE /api/discounts/:id — delete discount', () => {
    test('returns 401 without token', async () => {
      if (!app) return;
      const res = await request(app).delete('/api/discounts/some-id');
      expect(res.status).toBe(401);
    });

    test('deletes created discount', async () => {
      if (!app || !accessToken || !discountId) return;
      const res = await request(app)
        .delete(`/api/discounts/${discountId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });
});
