/**
 * @fileoverview Tests for RECURRING REPORT EXPORTS (assistant.schedule). Verifies
 * the migration-free persistence path (schedules stored as a JSON blob inside the
 * existing outlet_settings key/value table), create/list/cancel, due-checking and
 * date-window logic, and that runDueSchedules regenerates + emails the report as
 * an attachment and stamps last_run so it can't double-send. Prisma, the export
 * generator and mail are all mocked; `now` is injected for determinism.
 * @module tests/assistant-schedule.test
 */

const mockPrisma = {
  outletSetting: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
  outlet: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};
const mockExport = {
  MODULE_LABEL: { sales: 'Sales', eod: 'End-of-day', pnl: 'Profit & Loss' },
  generate: jest.fn(),
};
const mockMail = { sendMail: jest.fn().mockResolvedValue({ transport: 'test' }) };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/modules/assistant/assistant.export', () => mockExport);
jest.mock('../src/utils/mail.service', () => mockMail);

const schedule = require('../src/modules/assistant/assistant.schedule');

const OUTLET_ID = 'o1';
const NOW = new Date(2026, 7, 3); // Mon 3 Aug 2026 → yesterday = 2026-08-02, getDay()=1

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.outletSetting.findUnique.mockResolvedValue(null);
  mockPrisma.outletSetting.upsert.mockResolvedValue({});
  mockExport.generate.mockResolvedValue({
    filename: 'sales-2026-08-02-to-2026-08-02.pdf',
    contentType: 'application/pdf',
    body: Buffer.from('%PDF-1.4 fake'),
  });
});

describe('normalizeInput / createSchedule', () => {
  test('rejects an unknown report module', async () => {
    await expect(schedule.createSchedule(OUTLET_ID, { module: 'nope' })).rejects.toThrow(/Unknown report/);
    expect(mockPrisma.outletSetting.upsert).not.toHaveBeenCalled();
  });

  test('rejects a malformed recipient email', async () => {
    await expect(schedule.createSchedule(OUTLET_ID, { module: 'sales', recipient: 'not-an-email' }))
      .rejects.toThrow(/valid email/);
  });

  test('persists a new schedule as a JSON blob under the outlet_settings key', async () => {
    const created = await schedule.createSchedule(OUTLET_ID, {
      module: 'sales', format: 'pdf', cadence: 'weekly', day: 1, recipient: 'accounts@cafe.com',
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.module).toBe('sales');
    expect(created.last_run).toBeNull();

    expect(mockPrisma.outletSetting.upsert).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.outletSetting.upsert.mock.calls[0][0];
    // stored under the dedicated compound-unique key — no new table
    expect(arg.where.outlet_id_setting_key).toEqual({ outlet_id: OUTLET_ID, setting_key: schedule.SETTING_KEY });
    expect(arg.create.data_type).toBe('json');
    const stored = JSON.parse(arg.create.setting_value);
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[0].recipient).toBe('accounts@cafe.com');
    expect(stored[0].cadence).toBe('weekly');
  });

  test('appends to an existing schedule list rather than clobbering it', async () => {
    const existing = [{ id: 'old', module: 'eod', format: 'csv', cadence: 'daily', day: null, recipient: null, currency: 'AUD', created_at: 'x', last_run: null }];
    mockPrisma.outletSetting.findUnique.mockResolvedValue({ setting_value: JSON.stringify(existing) });
    await schedule.createSchedule(OUTLET_ID, { module: 'pnl', cadence: 'monthly' });
    const arg = mockPrisma.outletSetting.upsert.mock.calls[0][0];
    const stored = JSON.parse(arg.update.setting_value);
    expect(stored).toHaveLength(2);
    expect(stored.map((s) => s.module)).toEqual(['eod', 'pnl']);
  });
});

describe('listSchedules / cancelSchedule', () => {
  test('lists the parsed schedules', async () => {
    const rows = [{ id: 'a', module: 'sales' }, { id: 'b', module: 'eod' }];
    mockPrisma.outletSetting.findUnique.mockResolvedValue({ setting_value: JSON.stringify(rows) });
    const list = await schedule.listSchedules(OUTLET_ID);
    expect(list).toHaveLength(2);
  });

  test('cancel removes the matching schedule and persists the rest', async () => {
    const rows = [{ id: 'a', module: 'sales' }, { id: 'b', module: 'eod' }];
    mockPrisma.outletSetting.findUnique.mockResolvedValue({ setting_value: JSON.stringify(rows) });
    const res = await schedule.cancelSchedule(OUTLET_ID, 'a');
    expect(res).toEqual({ removed: true, remaining: 1 });
    const stored = JSON.parse(mockPrisma.outletSetting.upsert.mock.calls[0][0].update.setting_value);
    expect(stored).toEqual([{ id: 'b', module: 'eod' }]);
  });

  test('cancel of an unknown id is a no-op', async () => {
    mockPrisma.outletSetting.findUnique.mockResolvedValue({ setting_value: JSON.stringify([{ id: 'a' }]) });
    const res = await schedule.cancelSchedule(OUTLET_ID, 'zzz');
    expect(res.removed).toBe(false);
    expect(mockPrisma.outletSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('computeWindow', () => {
  test('daily → yesterday only', () => {
    expect(schedule.computeWindow('daily', NOW)).toMatchObject({ from: '2026-08-02', to: '2026-08-02' });
  });
  test('weekly → trailing 7 days ending yesterday', () => {
    expect(schedule.computeWindow('weekly', NOW)).toMatchObject({ from: '2026-07-27', to: '2026-08-02' });
  });
  test('monthly → previous calendar month', () => {
    expect(schedule.computeWindow('monthly', NOW)).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
  });
});

describe('isDue', () => {
  test('daily is due unless already run today', () => {
    expect(schedule.isDue({ cadence: 'daily', last_run: null }, NOW)).toBe(true);
    expect(schedule.isDue({ cadence: 'daily', last_run: '2026-08-03' }, NOW)).toBe(false);
  });
  test('weekly is due only on its configured weekday (Mon=1)', () => {
    expect(schedule.isDue({ cadence: 'weekly', day: 1, last_run: null }, NOW)).toBe(true); // NOW is Monday
    expect(schedule.isDue({ cadence: 'weekly', day: 3, last_run: null }, NOW)).toBe(false);
  });
  test('monthly is due only on its configured day-of-month', () => {
    expect(schedule.isDue({ cadence: 'monthly', day: 3, last_run: null }, NOW)).toBe(true); // NOW is the 3rd
    expect(schedule.isDue({ cadence: 'monthly', day: 15, last_run: null }, NOW)).toBe(false);
  });
});

describe('resolveRecipient', () => {
  test('explicit recipient wins', async () => {
    const to = await schedule.resolveRecipient({ id: 'o1', owner_id: 'u1' }, { recipient: 'boss@x.com' });
    expect(to).toBe('boss@x.com');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
  test('falls back to the outlet owner email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'owner@cafe.com' });
    const to = await schedule.resolveRecipient({ id: 'o1', owner_id: 'u1' }, { recipient: null });
    expect(to).toBe('owner@cafe.com');
  });
});

describe('runDueSchedules', () => {
  test('generates + emails the due report as an attachment and stamps last_run', async () => {
    const scheds = [
      { id: 's1', module: 'sales', format: 'pdf', cadence: 'daily', day: null, recipient: 'accounts@cafe.com', currency: 'AUD', created_at: 'x', last_run: null },
      { id: 's2', module: 'pnl', format: 'csv', cadence: 'weekly', day: 3, recipient: 'accounts@cafe.com', currency: 'AUD', created_at: 'x', last_run: null }, // Wed → NOT due Monday
    ];
    mockPrisma.outletSetting.findMany.mockResolvedValue([{ outlet_id: 'o1', setting_value: JSON.stringify(scheds) }]);
    mockPrisma.outlet.findUnique.mockResolvedValue({ id: 'o1', name: 'Test Cafe', currency: 'AUD', owner_id: 'u1', is_active: true, is_deleted: false });

    const res = await schedule.runDueSchedules({ now: NOW });

    expect(res).toMatchObject({ outlets: 1, sent: 1, skipped: 0 });
    // only the daily one fired
    expect(mockExport.generate).toHaveBeenCalledTimes(1);
    expect(mockExport.generate).toHaveBeenCalledWith(
      expect.objectContaining({ outletId: 'o1', module: 'sales', format: 'pdf', from: '2026-08-02', to: '2026-08-02' }),
      'Test Cafe', expect.any(String),
    );
    // emailed with the file attached
    expect(mockMail.sendMail).toHaveBeenCalledTimes(1);
    const mailArg = mockMail.sendMail.mock.calls[0][0];
    expect(mailArg.to).toBe('accounts@cafe.com');
    expect(mailArg.attachments).toHaveLength(1);
    expect(mailArg.attachments[0].filename).toMatch(/sales-.*\.pdf/);
    expect(Buffer.isBuffer(mailArg.attachments[0].content)).toBe(true);
    // last_run stamped for the fired schedule, persisted back to outlet_settings
    const persisted = JSON.parse(mockPrisma.outletSetting.upsert.mock.calls[0][0].update.setting_value);
    expect(persisted.find((s) => s.id === 's1').last_run).toBe('2026-08-03');
    expect(persisted.find((s) => s.id === 's2').last_run).toBeNull();
  });

  test('skips a schedule with no resolvable recipient (no owner email, none set)', async () => {
    const scheds = [{ id: 's1', module: 'sales', format: 'pdf', cadence: 'daily', day: null, recipient: null, currency: 'AUD', created_at: 'x', last_run: null }];
    mockPrisma.outletSetting.findMany.mockResolvedValue([{ outlet_id: 'o1', setting_value: JSON.stringify(scheds) }]);
    mockPrisma.outlet.findUnique.mockResolvedValue({ id: 'o1', name: 'Test Cafe', currency: 'AUD', owner_id: 'u1', is_active: true, is_deleted: false });
    mockPrisma.user.findUnique.mockResolvedValue({ email: null });

    const res = await schedule.runDueSchedules({ now: NOW });
    expect(res).toMatchObject({ sent: 0, skipped: 1 });
    expect(mockMail.sendMail).not.toHaveBeenCalled();
  });

  test('ignores inactive/deleted outlets', async () => {
    const scheds = [{ id: 's1', module: 'sales', format: 'pdf', cadence: 'daily', day: null, recipient: 'x@y.com', currency: 'AUD', created_at: 'x', last_run: null }];
    mockPrisma.outletSetting.findMany.mockResolvedValue([{ outlet_id: 'o1', setting_value: JSON.stringify(scheds) }]);
    mockPrisma.outlet.findUnique.mockResolvedValue({ id: 'o1', name: 'Gone', currency: 'AUD', owner_id: 'u1', is_active: false, is_deleted: true });

    const res = await schedule.runDueSchedules({ now: NOW });
    expect(res.outlets).toBe(0);
    expect(mockExport.generate).not.toHaveBeenCalled();
  });
});
