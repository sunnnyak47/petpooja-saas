/**
 * @fileoverview Unit tests for the dashboard order-pipeline stage derivation.
 * "Served" is derived from KOT statuses (not an order status), so deriveStage
 * must classify orders correctly through Confirmed → Ready → Served → Paid.
 * @module tests/dashboard-pipeline.test
 */

const { deriveStage } = require('../src/modules/dashboard/dashboard.controller');

describe('deriveStage — order pipeline classification', () => {
  test('confirmed order (KOT sent, cooking) → confirmed', () => {
    expect(deriveStage({ status: 'confirmed', is_paid: false, kots: [{ status: 'preparing' }] })).toBe('confirmed');
  });

  test('created order WITH a KOT → confirmed', () => {
    expect(deriveStage({ status: 'created', is_paid: false, kots: [{ status: 'pending' }] })).toBe('confirmed');
  });

  test('ready order whose KOTs are not all served → ready', () => {
    expect(deriveStage({ status: 'ready', is_paid: false, kots: [{ status: 'ready' }, { status: 'served' }] })).toBe('ready');
  });

  test('ready order with ALL KOTs served/completed → served', () => {
    expect(deriveStage({ status: 'ready', is_paid: false, kots: [{ status: 'served' }, { status: 'completed' }] })).toBe('served');
  });

  test('billed order with all KOTs served → served (still awaiting payment)', () => {
    expect(deriveStage({ status: 'billed', is_paid: false, kots: [{ status: 'served' }] })).toBe('served');
  });

  test('paid order → paid (regardless of KOT state)', () => {
    expect(deriveStage({ status: 'paid', is_paid: true, kots: [{ status: 'served' }] })).toBe('paid');
  });

  test('created order with NO KOT → null (not in the 4-stage view)', () => {
    expect(deriveStage({ status: 'created', is_paid: false, kots: [] })).toBeNull();
  });

  test('cancelled / voided → null', () => {
    expect(deriveStage({ status: 'cancelled', is_paid: false, kots: [] })).toBeNull();
    expect(deriveStage({ status: 'voided', is_paid: false, kots: [] })).toBeNull();
  });
});
