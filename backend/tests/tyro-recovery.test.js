/**
 * @fileoverview Tyro EFTPOS — Continue-Last-Transaction recovery + idempotent
 * finalise guards (certification reliability).
 *
 * Why: if the POS reloads/crashes mid-purchase the terminal may have completed a
 * charge the POS never recorded. Recovery must (a) find the outlet's most-recent
 * OPEN (pending/in_progress) terminal transaction, and (b) finalise it safely —
 * and re-finalising an already-settled row must be a no-op so a recovery racing
 * a late callback (or a retried PATCH) can never clobber the first authoritative
 * result or double-apply. Also covers the pure helpers that feed the browser
 * (iClientInitParams) and the mock tip/surcharge payload.
 *
 * Unit-level with a mocked Prisma (no Postgres), matching the order-guard tests.
 * @module tests/tyro-recovery.test
 */

const mockFindFirst = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../src/config/database', () => ({
  getDbClient: () => ({
    terminalTransaction: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  }),
}));

jest.mock('../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const tyroService = require('../src/modules/integrations/tyro.service');

beforeEach(() => {
  mockFindFirst.mockReset();
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
});

describe('recoverOpenTransaction — find the outlet most-recent OPEN terminal txn', () => {
  test('queries only open statuses for this outlet+provider, newest first, and returns the row', async () => {
    const openRow = { id: 'tx-1', outlet_id: 'outlet-1', status: 'pending', amount_cents: 2599 };
    mockFindFirst.mockResolvedValue(openRow);

    const row = await tyroService.recoverOpenTransaction('outlet-1');
    expect(row).toBe(openRow);

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    const arg = mockFindFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({ outlet_id: 'outlet-1', provider: 'tyro' });
    // Only non-terminal rows are recoverable.
    expect(arg.where.status).toEqual({ in: expect.arrayContaining(['pending', 'in_progress']) });
    expect(arg.where.status.in).toHaveLength(2);
    // Most-recent wins.
    expect(arg.orderBy).toEqual({ initiated_at: 'desc' });
  });

  test('returns null when the outlet has no open transaction', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(tyroService.recoverOpenTransaction('outlet-1')).resolves.toBeNull();
  });

  test('rejects (400) when no outlet_id is given, without touching the DB', async () => {
    await expect(tyroService.recoverOpenTransaction()).rejects.toMatchObject({ status: 400 });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});

describe('finaliseTransaction — idempotent on an already-settled row', () => {
  test('an OPEN (pending) row is finalised: status mapped + tip/surcharge/receipts recorded', async () => {
    mockFindUnique.mockResolvedValue({ id: 'tx-1', status: 'pending', amount_cents: 1000 });
    mockUpdate.mockImplementation(async ({ data }) => ({ id: 'tx-1', ...data }));

    const res = await tyroService.finaliseTransaction('tx-1', {
      result: 'APPROVED',
      transactionReference: 'T-REF',
      baseAmount: '1000',
      tipAmount: '100',
      surchargeAmount: '15',
      customerReceipt: 'CUST',
      merchantReceipt: 'MERCH',
      signatureRequired: true,
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('approved');
    expect(res.tyro_reference).toBe('T-REF');
    expect(res.tip_cents).toBe(100);
    expect(res.surcharge_cents).toBe(15);
    expect(res.base_amount_cents).toBe(1000);
    expect(res.customer_receipt).toBe('CUST');
    expect(res.merchant_receipt).toBe('MERCH');
    expect(res.signature_required).toBe(true);
  });

  test('a row already APPROVED is returned unchanged and is NEVER re-written', async () => {
    const settled = { id: 'tx-1', status: 'approved', tyro_reference: 'ORIGINAL', tip_cents: 50 };
    mockFindUnique.mockResolvedValue(settled);

    // Re-finalise with a conflicting payload (e.g. a late DECLINED callback).
    const res = await tyroService.finaliseTransaction('tx-1', { result: 'DECLINED' });

    expect(res).toBe(settled);              // same recorded row, untouched
    expect(res.tyro_reference).toBe('ORIGINAL');
    expect(mockUpdate).not.toHaveBeenCalled(); // no clobber, no moved completed_at
  });

  test.each(['declined', 'cancelled', 'reversed', 'system_error', 'unknown'])(
    'a row already settled as %s is a no-op on re-finalise',
    async (status) => {
      const settled = { id: 'tx-1', status };
      mockFindUnique.mockResolvedValue(settled);
      const res = await tyroService.finaliseTransaction('tx-1', { result: 'APPROVED' });
      expect(res).toBe(settled);
      expect(mockUpdate).not.toHaveBeenCalled();
    },
  );

  test('throws 404 when the row does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(tyroService.finaliseTransaction('missing', { result: 'APPROVED' }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('isOpenStatus', () => {
  test('pending/in_progress are open; settled statuses are not', () => {
    expect(tyroService.isOpenStatus('pending')).toBe(true);
    expect(tyroService.isOpenStatus('in_progress')).toBe(true);
    expect(tyroService.isOpenStatus('approved')).toBe(false);
    expect(tyroService.isOpenStatus('declined')).toBe(false);
    expect(tyroService.isOpenStatus('')).toBe(false);
    expect(tyroService.isOpenStatus(undefined)).toBe(false);
  });
});

describe('iClientInitParams — surfaces the browser init block incl. AU feature flags', () => {
  test('coerces mock_mode + surcharge/tipping string settings to booleans', () => {
    const p = tyroService.iClientInitParams({
      environment: 'production',
      mid: '12345678', tid: '87654321',
      api_key: 'secret', merchant_name: 'Cafe',
      mock_mode: 'true',
      surcharge_enabled: 'true',
      tipping_enabled: 'false',
    });
    expect(p.mock_mode).toBe(true);
    expect(p.surcharge_enabled).toBe(true);
    expect(p.tipping_enabled).toBe(false);
    expect(p.environment).toBe('production');
    expect(p.merchant_name).toBe('Cafe');
    expect(p.script_url).toContain('iclient'); // production headful iClient URL
  });

  test('defaults everything off for an unconfigured outlet', () => {
    const p = tyroService.iClientInitParams({});
    expect(p.mock_mode).toBe(false);
    expect(p.surcharge_enabled).toBe(false);
    expect(p.tipping_enabled).toBe(false);
    expect(p.environment).toBe('sandbox');
  });
});

describe('mockCompletionPayload — sample tip/surcharge only when enabled', () => {
  test('no tip/surcharge by default', () => {
    const r = tyroService.mockCompletionPayload({ our_ref: 'r1', amount_cents: 1000 });
    expect(r.result).toBe('APPROVED');
    expect(r.tipAmount).toBe('0');
    expect(r.surchargeAmount).toBe('0');
    expect(r.baseAmount).toBe('1000');
  });

  test('emits a sample tip + surcharge when the toggles are on', () => {
    const r = tyroService.mockCompletionPayload({
      our_ref: 'r1', amount_cents: 1000,
      tipping_enabled: true, surcharge_enabled: true,
    });
    expect(r.tipAmount).toBe('100');       // 10% of 1000
    expect(r.surchargeAmount).toBe('15');  // 1.5% of 1000
  });

  test('a decline carries the enabled sample amounts too', () => {
    const r = tyroService.mockCompletionPayload({
      our_ref: 'r1', amount_cents: 2000, decline: true, tipping_enabled: true,
    });
    expect(r.result).toBe('DECLINED');
    expect(r.tipAmount).toBe('200');
    expect(r.errorMessage).toMatch(/honour/i);
  });
});
