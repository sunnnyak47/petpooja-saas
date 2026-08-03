/**
 * @fileoverview Tests for "email me the report" (Item 3c). The assistant
 * generates the report and emails it to the requesting user's OWN address with
 * the file attached — never a third party. Mail/DB/report services mocked.
 * @module tests/assistant-email.test
 */

const mockMail = { sendMail: jest.fn().mockResolvedValue({ transport: 'test' }) };
const mockReports = { getRevenueTrendRange: jest.fn(), getDailySales: jest.fn(), getItemWiseSales: jest.fn() };
const mockPrisma = {
  outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Test Cafe', head_office_id: null }) },
  user: { findUnique: jest.fn() },
};

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/utils/llm', () => ({ callLLM: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/utils/mail.service', () => mockMail);
jest.mock('../src/modules/reports/reports.service', () => mockReports);

const assistant = require('../src/modules/assistant/assistant.service');

const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ email: 'owner@cafe.com', full_name: 'Ada Owner' });
  mockReports.getRevenueTrendRange.mockResolvedValue([{ date: '2026-07-01', revenue: 1000, orders: 20 }]);
});

describe('email the report', () => {
  test('"email me the sales report" generates + emails it to the user, with an attachment', async () => {
    const res = await assistant.ask(OWNER, 'email me the sales report for this month');
    expect(res.source).toBe('email');
    expect(res.tool).toBe('email_report');
    expect(mockMail.sendMail).toHaveBeenCalledTimes(1);
    const arg = mockMail.sendMail.mock.calls[0][0];
    expect(arg.to).toBe('owner@cafe.com');
    expect(arg.attachments).toHaveLength(1);
    expect(arg.attachments[0].filename).toMatch(/^sales-.*\.pdf$/); // defaults to PDF when no format named
    expect(Buffer.isBuffer(arg.attachments[0].content)).toBe(true);
    expect(res.answer).toMatch(/emailed .* to owner@cafe\.com/i);
  });

  test('honours an explicit format (excel → xlsx attachment)', async () => {
    const res = await assistant.ask(OWNER, 'email me the sales report as excel');
    const arg = mockMail.sendMail.mock.calls[0][0];
    expect(arg.attachments[0].filename).toMatch(/\.xlsx$/);
    expect(res.source).toBe('email');
  });

  test('no email on file → tells the user, does not send', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: null, full_name: 'Ada' });
    const res = await assistant.ask(OWNER, 'email me the sales report');
    expect(mockMail.sendMail).not.toHaveBeenCalled();
    expect(res.answer).toMatch(/don't have an email address/i);
  });

  test('a plain download request is NOT emailed', async () => {
    const res = await assistant.ask(OWNER, 'download the sales report');
    expect(mockMail.sendMail).not.toHaveBeenCalled();
    expect(res.source).toBe('export');
    expect(res.download).toBeTruthy();
  });
});
