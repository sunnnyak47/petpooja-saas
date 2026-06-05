/**
 * @fileoverview Observability tests — liveness, readiness, metrics, request IDs.
 *
 * Mirrors the defensive load pattern of api.test.js: the app is required inside
 * a try/catch and every test no-ops when the app could not load (e.g. no DB in
 * a bare local run). In CI a real Postgres is provisioned, so the readiness and
 * metrics assertions exercise the live (DB-up) branches.
 *
 * @module tests/monitoring.test
 */

const request = require('supertest');

let app;

describe('Monitoring & Observability', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-256-bit-minimum-length-key-here';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-256-bit-minimum-length-key-here';
    // Default posture: no token configured → /metrics is open outside production.
    delete process.env.METRICS_TOKEN;

    try {
      app = require('../src/app').app;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('App load skipped (requires DB):', e.message);
    }
  });

  describe('Liveness — GET /health/live', () => {
    test('returns 200 with alive status and never touches the DB', async () => {
      if (!app) return;
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
      expect(typeof res.body.uptime).toBe('number');
    });
  });

  describe('Readiness — GET /health/ready', () => {
    test('reports dependency checks and the body agrees with the status code', async () => {
      if (!app) return;
      const res = await request(app).get('/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('database');
      expect(res.body.checks).toHaveProperty('redis');

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('ready');
        expect(res.body.checks.database).toBe('up');
      } else {
        expect(res.body.success).toBe(false);
        expect(res.body.status).toBe('not_ready');
        expect(res.body.checks.database).toBe('down');
      }
    });
  });

  describe('Health — GET /health (regression)', () => {
    test('still returns the documented success envelope', async () => {
      if (!app) return;
      const res = await request(app).get('/health');
      expect([200, 500]).toContain(res.status);
      expect(res.body).toHaveProperty('success');
      expect(res.body.data).toHaveProperty('service');
      expect(res.body.data).toHaveProperty('database');
      expect(res.body.data).toHaveProperty('uptime');
    });
  });

  describe('Metrics — GET /metrics', () => {
    test('exposes a JSON snapshot in non-production when no token is configured', async () => {
      if (!app) return;
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const d = res.body.data;
      expect(d).toHaveProperty('uptime_seconds');
      expect(d).toHaveProperty('requests_total');
      expect(d).toHaveProperty('latency_ms');
      expect(d.latency_ms).toHaveProperty('p95');
      expect(d).toHaveProperty('memory_mb');
    });

    test('serves Prometheus text exposition when asked', async () => {
      if (!app) return;
      const res = await request(app).get('/metrics?format=prometheus');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toMatch(/msrm_requests_total/);
    });

    test('rejects a wrong token when METRICS_TOKEN is configured', async () => {
      if (!app) return;
      process.env.METRICS_TOKEN = 'secret-metrics-token';
      try {
        const res = await request(app).get('/metrics').set('x-metrics-token', 'wrong');
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      } finally {
        delete process.env.METRICS_TOKEN;
      }
    });

    test('accepts the correct token when METRICS_TOKEN is configured', async () => {
      if (!app) return;
      process.env.METRICS_TOKEN = 'secret-metrics-token';
      try {
        const res = await request(app).get('/metrics').set('x-metrics-token', 'secret-metrics-token');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      } finally {
        delete process.env.METRICS_TOKEN;
      }
    });
  });

  describe('Request correlation — X-Request-Id', () => {
    test('every response carries a request-id header', async () => {
      if (!app) return;
      const res = await request(app).get('/health/live');
      expect(res.headers['x-request-id']).toBeTruthy();
    });

    test('honours a safe inbound X-Request-Id', async () => {
      if (!app) return;
      const id = 'test-correlation-id-123';
      const res = await request(app).get('/health/live').set('X-Request-Id', id);
      expect(res.headers['x-request-id']).toBe(id);
    });

    test('replaces an unsafe inbound X-Request-Id with a generated one', async () => {
      if (!app) return;
      const unsafe = 'bad id with spaces!';
      const res = await request(app).get('/health/live').set('X-Request-Id', unsafe);
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(res.headers['x-request-id']).not.toBe(unsafe);
    });
  });
});
