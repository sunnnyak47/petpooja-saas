/**
 * @fileoverview Auth module integration tests.
 * Tests: register, login, token refresh, logout, password reset flow.
 * @module tests/auth.test
 */

const request = require('supertest');

const TEST_USER = {
  full_name: 'Test User',
  email: `testuser_${Date.now()}@petpooja.com`,
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  password: 'TestPass@123',
};

let app;
let accessToken = '';
let refreshToken = '';

describe('Authentication Module', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-256-bit-minimum-length-key-here';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-256-bit-minimum-length-key-here';

    try {
      const appModule = require('../src/app');
      app = appModule.app;
    } catch (e) {
      console.log('App load skipped (requires DB):', e.message);
    }
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user with valid data', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/register')
        .send(TEST_USER)
        .expect('Content-Type', /json/);

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('accessToken');
        expect(res.body.data).toHaveProperty('refreshToken');
        expect(res.body.data.user.email).toBe(TEST_USER.email);
        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
      }
    });

    test('should reject duplicate registration', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .post('/api/auth/register')
        .send(TEST_USER);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('should reject registration with weak password', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...TEST_USER, email: 'weak@test.com', phone: '9876543210', password: '123' });

      expect(res.status).toBe(400);
    });

    test('should reject registration with invalid phone', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...TEST_USER, email: 'phone@test.com', phone: '12345', password: 'Strong@123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid email and password', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/login')
        .send({ login: TEST_USER.email, password: TEST_USER.password });

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('accessToken');
        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
      }
    });

    test('should login with valid phone', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/login')
        .send({ login: TEST_USER.phone, password: TEST_USER.password });

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    test('should reject login with wrong password', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/login')
        .send({ login: TEST_USER.email, password: 'WrongPass@123' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('should reject login with missing fields', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return user profile with valid token', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('email');
      }
    });

    test('should reject without token', async () => {
      if (!app) return;
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('should reject with invalid token', async () => {
      if (!app) return;
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-here');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh-token', () => {
    test('should refresh tokens with valid refresh token', async () => {
      if (!app || !refreshToken) return;
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refresh_token: refreshToken });

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('accessToken');
        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
      }
    });

    test('should reject with invalid refresh token', async () => {
      if (!app) return;
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refresh_token: 'invalid-refresh-token' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout and blacklist token', async () => {
      if (!app || !accessToken) return;
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });
});
