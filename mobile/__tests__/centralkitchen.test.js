/**
 * Unit tests for the pure helpers in useCentralKitchen — status→action logic
 * and the approve/dispatch payload builders (which move real stock, so their
 * per-line quantities must be exactly right). No React, no network.
 */

jest.mock('../src/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import {
  indentNumber,
  itemCount,
  itemName,
  itemUnit,
  nextActions,
  approveItemsPayload,
  dispatchItemsPayload,
  filterIndents,
  summarizeIndents,
  CK_STATUS,
} from '../src/hooks/useCentralKitchen';

const INDENT = {
  id: 'abcdef1234567890',
  indent_number: 'IND-42',
  status: 'pending',
  items: [
    { id: 'li1', requested_quantity: 10, approved_quantity: null, unit: 'kg', inventory_item: { name: 'Paneer', unit: 'kg' } },
    { id: 'li2', requested_quantity: 5, approved_quantity: 4, unit: 'L', inventory_item: { name: 'Oil', unit: 'L' } },
  ],
};

describe('display helpers', () => {
  test('indentNumber prefers indent_number then #id-slice', () => {
    expect(indentNumber(INDENT)).toBe('IND-42');
    expect(indentNumber({ id: 'abcdef1234' })).toBe('#abcdef12');
    expect(indentNumber({})).toBe('');
  });
  test('itemCount / itemName / itemUnit', () => {
    expect(itemCount(INDENT)).toBe(2);
    expect(itemName(INDENT.items[0])).toBe('Paneer');
    expect(itemUnit(INDENT.items[0])).toBe('kg');
    expect(itemName({})).toBe('Item');
  });
});

describe('nextActions — role/status aware', () => {
  test('incoming (CK) actions', () => {
    expect(nextActions('pending', 'incoming')).toEqual(['approve', 'reject']);
    expect(nextActions('approved', 'incoming')).toEqual(['dispatch']);
    expect(nextActions('dispatched', 'incoming')).toEqual([]);
  });
  test('mine (branch) actions', () => {
    expect(nextActions('dispatched', 'mine')).toEqual(['receive']);
    expect(nextActions('pending', 'mine')).toEqual([]);
    expect(nextActions('received', 'mine')).toEqual([]);
  });
});

describe('payload builders — exact per-line quantities', () => {
  test('approve uses requested quantities', () => {
    expect(approveItemsPayload(INDENT)).toEqual({
      items: [
        { item_id: 'li1', approved_quantity: 10 },
        { item_id: 'li2', approved_quantity: 5 },
      ],
    });
  });
  test('dispatch uses approved quantity, falling back to requested', () => {
    expect(dispatchItemsPayload(INDENT)).toEqual({
      items: [
        { item_id: 'li1', dispatched_quantity: 10 }, // approved null → requested
        { item_id: 'li2', dispatched_quantity: 4 },  // approved 4
      ],
    });
  });
  test('empty indent → empty items', () => {
    expect(approveItemsPayload({}).items).toEqual([]);
    expect(dispatchItemsPayload({}).items).toEqual([]);
  });
});

describe('filter + summary', () => {
  const rows = [
    { status: 'pending' }, { status: 'approved' }, { status: 'dispatched' },
    { status: 'received' }, { status: 'rejected' }, { status: 'pending' },
  ];
  test('filterIndents', () => {
    expect(filterIndents(rows, 'pending')).toHaveLength(2);
    expect(filterIndents(rows, 'all')).toHaveLength(6);
  });
  test('summarizeIndents buckets', () => {
    expect(summarizeIndents(rows)).toEqual({ total: 6, pending: 2, inTransit: 2, received: 1, rejected: 1 });
  });
});

test('CK_STATUS constants', () => {
  expect(CK_STATUS.DISPATCHED).toBe('dispatched');
});
