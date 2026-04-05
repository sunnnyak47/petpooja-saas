/**
 * @fileoverview Test configuration — Jest + Supertest setup.
 * @module tests/setup
 */

require('dotenv').config({ path: '.env.test' });
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-256-bit-minimum-length-key';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-256-bit-minimum-length-key';

let server;

beforeAll(async () => {
  jest.setTimeout(30000);
});

afterAll(async () => {
  if (server) {
    server.close();
  }
});

module.exports = { getTestServer: () => server };
