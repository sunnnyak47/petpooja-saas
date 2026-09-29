/**
 * @fileoverview Unit tests for the Square payment-reconciliation gaps closed for
 * the AU launch audit:
 *
 *   1. Terminal-checkout completion (terminal.checkout.updated → COMPLETED) is
 *      recorded as a Payment row and settles the order through the SAME path the
 *      online-card flow uses (order.service.processPayment) — idempotently: a
 *      replayed webhook must never double-record, and losing the conditional
 *      is_paid race inside processPayment is treated as an idempotent no-op.
 *
 *   2. refundSquarePayment — Square Refunds API (idempotency key always sent),
 *      tenant-guarded Payment lookup, refund fields updated, coherent mock-mode
 *      simulation when app credentials are absent — plus idempotent refund
 *      webhook status transitions (amount applied once per refund id, FAILED
 *      reverses exactly once).
 *
 * Unit-level: Prisma and order.service are mocked (same pattern as
 * order-double-settle-guard.test.js) so no Postgres or Square account is needed.
 * @module tests/square-reconciliation.test
 */

const mockPaymentFindFirst = jest.fn();
const mockPaymentUpdate = jest.fn();
const mockOrderFindFirst = jest.fn();
const mockSettingFindUnique = jest.fn();
const mockSettingUpsert = jest.fn();
const mockQueryRawUnsafe = jest.fn();

jest.mock('../src/config/database', () => ({
  getDbClient: () => ({
    payment: { findFirst: mockPaymentFindFirst, update: mockPaymentUpdate },
    order: { findFirst: mockOrderFindFirst },
    outletSetting: { findUnique: mockSettingFindUnique, upsert: mockSettingUpsert },
    $queryRawUnsafe: mockQueryRawUnsafe,
  }),
}));

// Keep the heavy order.service graph out of the test — we only need to observe
// that the terminal webhook settles through processPayment (the card path).
const mockProcessPayment = jest.fn();
jest.mock('../src/modules/orders/order.service', () => ({
  processPayment: mockProcessPayment,
}));

const squareService = require('../src/modules/integrations/square.service');

const OUTLET = 'a71f1e0a-0000-4000-8000-000000000001';
const ORDER = 'b82f2e1b-0000-4000-8000-000000000002';
const PAYMENT_ROW = 'c93f3e2c-0000-4000-8000-000000000003';

function terminalEvent(checkoutOverrides = {}) {
  return {
    merchant_id: 'MERCHANT_1',
    type: 'terminal.checkout.updated',
    event_id: 'evt_1',
    data: {
      type: 'checkout.event',
      id: 'chk_1',
      object: {
        checkout: {
          id: 'chk_1',
          status: 'COMPLETED',
          reference_id: ORDER,
          payment_ids: ['sq_pay_1'],
          amount_money: { amount: 2550, currency: 'AUD' },
          ...checkoutOverrides,
        },
      },
    },
  };
}

function refundEvent(refundOverrides = {}) {
  return {
    merchant_id: 'MERCHANT_1',
    type: 'refund.updated',
    event_id: 'evt_r1',
    data: {
      type: 'refund.event',
      id: 'sqr_1',
      object: {
        refund: {
          id: 'sqr_1',
          payment_id: 'sq_pay_1',
          status: 'COMPLETED',
          amount_money: { amount: 2500, currency: 'AUD' },
          ...refundOverrides,
        },
      },
    },
  };
}

function basePaymentRow(overrides = {}) {
  return {
    id: PAYMENT_ROW,
    outlet_id: OUTLET,
    order_id: ORDER,
    method: 'card',
    amount: 100,
    refund_amount: 0,
    status: 'success',
    transaction_id: 'sq_pay_1',
    refund_id: null,
    gateway_response: null,
    is_deleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Mock mode by default: no app-level Square credentials.
  delete process.env.SQUARE_APPLICATION_ID;
  delete process.env.SQUARE_APPLICATION_SECRET;
  delete process.env.SQUARE_REDIRECT_URL;
  mockPaymentUpdate.mockResolvedValue({});
  mockSettingUpsert.mockResolvedValue({});
  mockQueryRawUnsafe.mockResolvedValue([{ outlet_id: OUTLET }]);
});

// ───────────────────────────────────────────────────────────────────────────
// 1. Terminal checkout → Payment reconciliation
// ───────────────────────────────────────────────────────────────────────────
describe('handleTerminalCheckoutEvent', () => {
  test('records the payment and settles the order via the card path on first COMPLETED webhook', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(null); // no prior row for this Square payment id
    mockOrderFindFirst.mockResolvedValueOnce({ id: ORDER, is_paid: false });
    mockSettingFindUnique.mockResolvedValue(null); // no stats config to bump
    mockProcessPayment.mockResolvedValueOnce({ payment: { id: PAYMENT_ROW } });

    const result = await squareService.handleTerminalCheckoutEvent(terminalEvent());

    expect(result.handled).toBe(true);
    expect(result.idempotent).toBeUndefined();
    expect(result.payment_id).toBe(PAYMENT_ROW);

    // Settled exactly like the online-card flow: processPayment with method card,
    // the checkout's base amount, and the Square payment id as transaction_id.
    expect(mockProcessPayment).toHaveBeenCalledTimes(1);
    expect(mockProcessPayment).toHaveBeenCalledWith(
      ORDER,
      { method: 'card', amount: 25.5, transaction_id: 'sq_pay_1' },
      null,
      OUTLET,
    );

    // The raw webhook payload lands in gateway_response.
    expect(mockPaymentUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mockPaymentUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: PAYMENT_ROW });
    expect(updateArg.data.gateway_response.source).toBe('square_terminal_webhook');
    expect(updateArg.data.gateway_response.checkout.id).toBe('chk_1');
    expect(updateArg.data.gateway_response.checkout.payment_ids).toEqual(['sq_pay_1']);
  });

  test('a replayed webhook is a no-op (Payment already carries this Square payment id)', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce({ id: PAYMENT_ROW });

    const result = await squareService.handleTerminalCheckoutEvent(terminalEvent());

    expect(result).toMatchObject({ handled: true, idempotent: true, payment_id: PAYMENT_ROW });
    expect(mockProcessPayment).not.toHaveBeenCalled();
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  test('losing the conditional is_paid race inside processPayment is idempotent, not an error', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(null);
    mockOrderFindFirst.mockResolvedValueOnce({ id: ORDER, is_paid: false });
    mockProcessPayment.mockRejectedValueOnce(new Error('Order is already paid'));

    const result = await squareService.handleTerminalCheckoutEvent(terminalEvent());

    expect(result).toMatchObject({ handled: true, idempotent: true, reason: 'order_already_paid' });
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  test('an already-paid order (settled by another path) is never double-recorded', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(null);
    mockOrderFindFirst.mockResolvedValueOnce({ id: ORDER, is_paid: true });

    const result = await squareService.handleTerminalCheckoutEvent(terminalEvent());

    expect(result).toMatchObject({ handled: true, idempotent: true, reason: 'order_already_paid' });
    expect(mockProcessPayment).not.toHaveBeenCalled();
  });

  test('non-COMPLETED checkout statuses are ignored', async () => {
    const result = await squareService.handleTerminalCheckoutEvent(
      terminalEvent({ status: 'IN_PROGRESS' }),
    );
    expect(result.handled).toBe(false);
    expect(mockProcessPayment).not.toHaveBeenCalled();
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  test('a checkout without reference_id cannot be reconciled (logged, no crash)', async () => {
    const result = await squareService.handleTerminalCheckoutEvent(
      terminalEvent({ reference_id: null }),
    );
    expect(result).toMatchObject({ handled: false, reason: 'no_reference_id' });
    expect(mockProcessPayment).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2a. refundSquarePayment — mock mode (no app credentials)
// ───────────────────────────────────────────────────────────────────────────
describe('refundSquarePayment (mock mode)', () => {
  test('full refund updates all refund fields and flips the payment to refunded', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(basePaymentRow());

    const result = await squareService.refundSquarePayment(OUTLET, {
      payment_id: PAYMENT_ROW,
      reason: 'customer complaint',
    });

    expect(result.mock).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.amount).toBe(100);
    expect(result.fully_refunded).toBe(true);
    expect(result.refund_id).toMatch(/^mock_refund_/);

    // Tenant-guarded lookup.
    expect(mockPaymentFindFirst).toHaveBeenCalledWith({
      where: { id: PAYMENT_ROW, outlet_id: OUTLET, is_deleted: false },
    });

    const { data } = mockPaymentUpdate.mock.calls[0][0];
    expect(Number(data.refund_amount)).toBe(100);
    expect(data.refund_id).toMatch(/^mock_refund_/);
    expect(data.refund_reason).toBe('customer complaint');
    expect(data.status).toBe('refunded');
    expect(data.gateway_response.refund_ids).toHaveLength(1);
  });

  test('partial refund accumulates refund_amount and leaves the payment settled', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(basePaymentRow());

    const result = await squareService.refundSquarePayment(OUTLET, {
      payment_id: PAYMENT_ROW,
      amount: 40,
    });

    expect(result.fully_refunded).toBe(false);
    const { data } = mockPaymentUpdate.mock.calls[0][0];
    expect(Number(data.refund_amount)).toBe(40);
    expect(data.status).toBeUndefined(); // stays 'success'
  });

  test('over-refund beyond the refundable balance is rejected', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(basePaymentRow({ refund_amount: 70 }));

    await expect(
      squareService.refundSquarePayment(OUTLET, { payment_id: PAYMENT_ROW, amount: 50 }),
    ).rejects.toThrow(/exceeds refundable balance/);
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  test('an already fully refunded payment is rejected', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(basePaymentRow({ refund_amount: 100 }));

    await expect(
      squareService.refundSquarePayment(OUTLET, { payment_id: PAYMENT_ROW }),
    ).rejects.toThrow(/already fully refunded/);
  });

  test('a payment from another outlet is invisible (tenant guard)', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(null); // scoped query finds nothing

    await expect(
      squareService.refundSquarePayment(OUTLET, { payment_id: PAYMENT_ROW }),
    ).rejects.toThrow(/not found/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2b. refundSquarePayment — real mode (Square Refunds API, mocked fetch)
// ───────────────────────────────────────────────────────────────────────────
describe('refundSquarePayment (real mode)', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.SQUARE_APPLICATION_ID = 'sq0idp-test';
    process.env.SQUARE_APPLICATION_SECRET = 'sq0csp-test';
    process.env.SQUARE_REDIRECT_URL = 'https://api.example.com/api/integrations/au/square/oauth/callback';
    const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    mockSettingFindUnique.mockResolvedValue({
      setting_value: JSON.stringify({
        connected: true,
        access_token: 'tok_live',
        refresh_token: 'ref_live',
        expires_at: farFuture,
        merchant_id: 'MERCHANT_1',
        location_id: 'L1',
        currency: 'AUD',
      }),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ refund: { id: 'sqr_api_1', status: 'PENDING' } }),
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('POSTs /v2/refunds with a Square idempotency key and records the PENDING refund', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(basePaymentRow());

    const result = await squareService.refundSquarePayment(OUTLET, {
      payment_id: PAYMENT_ROW,
      amount: 25,
      reason: 'damaged item',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/v2\/refunds$/);
    const body = JSON.parse(opts.body);
    expect(body.idempotency_key).toBeTruthy(); // Square REQUIRES an idempotency key
    expect(body.payment_id).toBe('sq_pay_1');
    expect(body.amount_money).toEqual({ amount: 2500, currency: 'AUD' });
    expect(body.reason).toBe('damaged item');

    expect(result).toMatchObject({ mock: false, refund_id: 'sqr_api_1', status: 'PENDING', amount: 25 });
    const { data } = mockPaymentUpdate.mock.calls[0][0];
    expect(data.refund_id).toBe('sqr_api_1');
    expect(Number(data.refund_amount)).toBe(25);
  });

  test('a caller-supplied idempotency key is passed through verbatim', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(basePaymentRow());

    await squareService.refundSquarePayment(OUTLET, {
      payment_id: PAYMENT_ROW,
      amount: 10,
      idempotency_key: 'client-key-123',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.idempotency_key).toBe('client-key-123');
  });

  test('a Square API error surfaces and leaves the Payment untouched', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(basePaymentRow());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ errors: [{ detail: 'Refund amount exceeds the payment' }] }),
    });

    await expect(
      squareService.refundSquarePayment(OUTLET, { payment_id: PAYMENT_ROW, amount: 25 }),
    ).rejects.toThrow('Refund amount exceeds the payment');
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2c. Refund webhook — idempotent status transitions
// ───────────────────────────────────────────────────────────────────────────
describe('handleRefundEvent', () => {
  test('PENDING → COMPLETED progression for a seen refund id never re-applies the amount', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(
      basePaymentRow({ refund_amount: 25, refund_id: 'sqr_1', gateway_response: { refund_ids: ['sqr_1'] } }),
    );

    const result = await squareService.handleRefundEvent(refundEvent());

    expect(result).toMatchObject({ handled: true, idempotent: true, refund_id: 'sqr_1' });
    expect(mockPaymentUpdate).toHaveBeenCalledTimes(1);
    const { data } = mockPaymentUpdate.mock.calls[0][0];
    expect(data.refund_amount).toBeUndefined(); // status marker only — no money movement
    expect(data.gateway_response.last_refund_status).toBe('COMPLETED');
  });

  test('a NEW refund id applies its amount once and flips to refunded when fully covered', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(
      basePaymentRow({ refund_amount: 25, refund_id: 'sqr_1', gateway_response: { refund_ids: ['sqr_1'] } }),
    );

    const result = await squareService.handleRefundEvent(
      refundEvent({ id: 'sqr_2', amount_money: { amount: 7500, currency: 'AUD' } }),
    );

    expect(result).toMatchObject({ handled: true, refund_id: 'sqr_2', fully_refunded: true });
    const { data } = mockPaymentUpdate.mock.calls[0][0];
    expect(Number(data.refund_amount)).toBe(100);
    expect(data.status).toBe('refunded');
    expect(data.gateway_response.refund_ids).toEqual(['sqr_1', 'sqr_2']);
  });

  test('FAILED for a previously applied refund reverses the amount exactly once', async () => {
    const applied = basePaymentRow({
      refund_amount: 100,
      status: 'refunded',
      refund_id: 'sqr_1',
      gateway_response: { refund_ids: ['sqr_1'] },
    });
    mockPaymentFindFirst.mockResolvedValueOnce(applied);

    const result = await squareService.handleRefundEvent(
      refundEvent({ status: 'FAILED', amount_money: { amount: 10000, currency: 'AUD' } }),
    );

    expect(result).toMatchObject({ handled: true, reversed: true });
    const { data } = mockPaymentUpdate.mock.calls[0][0];
    expect(Number(data.refund_amount)).toBe(0);
    expect(data.status).toBe('success'); // back to settled
    expect(data.gateway_response.refund_failed_ids).toEqual(['sqr_1']);

    // Replay of the same FAILED event: the reversal is already recorded → no-op.
    mockPaymentUpdate.mockClear();
    mockPaymentFindFirst.mockResolvedValueOnce(
      basePaymentRow({
        refund_amount: 0,
        status: 'success',
        gateway_response: { refund_ids: ['sqr_1'], refund_failed_ids: ['sqr_1'] },
      }),
    );
    const replay = await squareService.handleRefundEvent(
      refundEvent({ status: 'FAILED', amount_money: { amount: 10000, currency: 'AUD' } }),
    );
    expect(replay).toMatchObject({ handled: true, idempotent: true });
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  test('a refund for an unknown payment row is reported unhandled (never throws)', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(null);

    const result = await squareService.handleRefundEvent(refundEvent());

    expect(result).toMatchObject({ handled: false, reason: 'no_payment_row' });
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });
});
