// Unit tests for the pure logic in useGstReports (period math + CSV/export
// builders + empty detection). The api module is mocked so nothing hits the
// network — we only exercise the deterministic transforms.

jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ success: true, data: {} }) },
}));

// The hook module transitively imports the outlet/auth contexts (for the live
// hook), which pull in AsyncStorage's native module. Stub it so the pure
// helpers under test can be imported in the Node/jest environment.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import {
  num,
  ymd,
  periodRange,
  periodLabel,
  PERIOD_PRESETS,
  isReportEmpty,
  rowsToCsv,
  basCsv,
  gstr1Csv,
  gstr3bCsv,
  summaryCsv,
  buildExport,
} from '../src/hooks/useGstReports';

describe('num', () => {
  test('coerces bad values to 0', () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(NaN)).toBe(0);
  });
  test('passes through finite numbers and numeric strings', () => {
    expect(num(12.5)).toBe(12.5);
    expect(num('42')).toBe(42);
  });
});

describe('ymd', () => {
  test('formats a local date as YYYY-MM-DD zero-padded', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(ymd(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('periodRange', () => {
  // Fixed reference: 10 Jul 2026 (a Friday). month index 6 = July.
  const ref = new Date(2026, 6, 10);

  test('this_month spans the whole calendar month', () => {
    expect(periodRange('this_month', false, ref)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  test('last_month spans the previous calendar month', () => {
    expect(periodRange('last_month', false, ref)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  test('this_quarter spans Jul–Sep for a July ref', () => {
    expect(periodRange('this_quarter', false, ref)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
  });

  test('AU financial year runs Jul 1 → Jun 30', () => {
    expect(periodRange('this_fy', true, ref)).toEqual({ from: '2026-07-01', to: '2027-06-30' });
  });

  test('IN financial year runs Apr 1 → Mar 31', () => {
    expect(periodRange('this_fy', false, ref)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });

  test('FY start rolls back a year before the FY boundary', () => {
    const feb = new Date(2026, 1, 15); // Feb 2026
    expect(periodRange('this_fy', false, feb)).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(periodRange('this_fy', true, feb)).toEqual({ from: '2025-07-01', to: '2026-06-30' });
  });

  test('last_month wraps across the year boundary', () => {
    const jan = new Date(2026, 0, 20);
    expect(periodRange('last_month', false, jan)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('periodLabel', () => {
  test('maps known presets and falls back to This Month', () => {
    expect(periodLabel('this_quarter')).toBe('This Quarter');
    expect(periodLabel('nonsense')).toBe('This Month');
  });
  test('PERIOD_PRESETS covers the four supported windows', () => {
    expect(PERIOD_PRESETS.map((p) => p.key)).toEqual([
      'this_month', 'last_month', 'this_quarter', 'this_fy',
    ]);
  });
});

describe('isReportEmpty', () => {
  test('AU BAS empty when no orders and no sales', () => {
    expect(isReportEmpty('AU', 'bas', { order_count: 0, g1_total_sales_incl_gst: 0 })).toBe(true);
    expect(isReportEmpty('AU', 'bas', { order_count: 3, g1_total_sales_incl_gst: 100 })).toBe(false);
  });
  test('IN summary empty when no orders and no rate rows', () => {
    expect(isReportEmpty('IN', 'summary', { totals: { order_count: 0 }, by_rate: [] })).toBe(true);
    expect(isReportEmpty('IN', 'summary', { totals: { order_count: 5 }, by_rate: [{ rate: 5 }] })).toBe(false);
  });
  test('IN gstr1 empty when no taxable / b2cs / invoices', () => {
    expect(isReportEmpty('IN', 'gstr1', { totals: { taxable: 0 }, b2cs: [], docs: { invoices_count: 0 } })).toBe(true);
    expect(isReportEmpty('IN', 'gstr1', { totals: { taxable: 500 }, b2cs: [{ rate: 5 }], docs: { invoices_count: 2 } })).toBe(false);
  });
  test('IN gstr3b empty when no taxable value and nothing payable', () => {
    expect(isReportEmpty('IN', 'gstr3b', { section_3_1_a: { taxable_value: 0 }, tax_payable: { total: 0 } })).toBe(true);
    expect(isReportEmpty('IN', 'gstr3b', { section_3_1_a: { taxable_value: 100 }, tax_payable: { total: 5 } })).toBe(false);
  });
  test('null payload is empty', () => {
    expect(isReportEmpty('AU', 'bas', null)).toBe(true);
  });
});

describe('rowsToCsv', () => {
  test('joins headers and rows', () => {
    const csv = rowsToCsv(['A', 'B'], [[1, 2], [3, 4]]);
    expect(csv).toBe('A,B\n1,2\n3,4');
  });
  test('escapes commas, quotes and newlines', () => {
    const csv = rowsToCsv(['Field'], [['a,b'], ['say "hi"'], ['line\nbreak']]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line\nbreak"');
  });
  test('null cell becomes empty string', () => {
    expect(rowsToCsv(['X'], [[null]])).toBe('X\n');
  });
});

describe('export builders', () => {
  const bas = {
    g1_total_sales_incl_gst: 1100,
    net_sales_excl_gst: 1000,
    gst_collected: 100,
    gst_paid_on_purchases: 20,
    net_gst_payable: 80,
    order_count: 12,
  };

  test('basCsv includes labelled BAS figures', () => {
    const csv = basCsv(bas, 'This Month');
    expect(csv).toContain('1A GST on Sales,100');
    expect(csv).toContain('1B GST on Purchases,20');
    expect(csv).toContain('Net GST Payable,80');
    expect(csv).toContain('Period,This Month');
  });

  test('gstr1Csv renders rate rows and a totals block', () => {
    const csv = gstr1Csv({
      b2cs: [{ rate: 5, taxable_value: 200, cgst: 5, sgst: 5, igst: 0, cess: 0 }],
      totals: { taxable_value: 200, cgst: 5, sgst: 5, igst: 0, total_tax: 10 },
    });
    expect(csv).toContain('5%,200,5,5,0,0');
    expect(csv).toContain('All,200,5,5,0,10');
  });

  test('gstr1Csv tolerates an empty b2cs list', () => {
    const csv = gstr1Csv({ b2cs: [], totals: {} });
    expect(csv).toContain('—,0,0,0,0,0');
  });

  test('gstr3bCsv renders section 3.1(a) and tax payable', () => {
    const csv = gstr3bCsv({
      section_3_1_a: { taxable_value: 300, igst: 0, cgst: 7.5, sgst: 7.5, cess: 0 },
      tax_payable: { igst: 0, cgst: 7.5, sgst: 7.5, cess: 0 },
    });
    expect(csv).toContain('3.1(a) Outward taxable,300,0,7.5,7.5,0');
    expect(csv).toContain('Tax Payable,,0,7.5,7.5,0');
  });

  test('summaryCsv renders rate-wise rows', () => {
    const csv = summaryCsv({
      by_rate: [{ rate: 18, order_count: 4, taxable: 1000, cgst: 90, sgst: 90, igst: 0, total_tax: 180 }],
    });
    expect(csv).toContain('18%,4,1000,90,90,0,180');
  });

  test('buildExport routes region/tab to the right filename + payload', () => {
    const range = { from: '2026-07-01', to: '2026-07-31' };
    const au = buildExport('AU', 'bas', bas, range, 'This Month');
    expect(au.filename).toBe('BAS_2026-07-01_to_2026-07-31.csv');
    expect(au.csv).toContain('Net GST Payable,80');

    const g1 = buildExport('IN', 'gstr1', { b2cs: [], totals: {} }, range);
    expect(g1.filename).toBe('GSTR1_2026-07-01_to_2026-07-31.csv');

    const sum = buildExport('IN', 'summary', { by_rate: [] }, range);
    expect(sum.filename).toBe('GST_Summary_2026-07-01_to_2026-07-31.csv');
  });
});
