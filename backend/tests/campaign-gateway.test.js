/**
 * @fileoverview Unit test — the assistant's send_campaign path
 * (customer.createCampaign) dispatches through the REAL SMS/WhatsApp gateway
 * (notification.service), not a simulation. Verifies:
 *   - one gateway call per recipient, on the right channel, with the message body;
 *   - a per-recipient gateway failure is recorded as `failed` and never aborts the
 *     batch, and counts reflect only real successes;
 *   - scheduled campaigns are NOT dispatched now (deferred to their scheduler).
 * DB + gateway are mocked, so this runs credential-free and offline.
 * @module tests/campaign-gateway.test
 */

const mockNotifications = {
  sendSMS: jest.fn().mockResolvedValue({ success: true, mode: 'dev' }),
  sendWhatsApp: jest.fn().mockResolvedValue({ success: true, mode: 'dev' }),
};

const mockPrisma = {
  customer: { findMany: jest.fn() },
  campaign: { create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  campaignLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
};

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/modules/integrations/notification.service', () => mockNotifications);

const customer = require('../src/modules/customers/customer.service');

const RECIPIENTS = [
  { id: 'c1', phone: '9990001111', email: 'a@x.com', full_name: 'Aa' },
  { id: 'c2', phone: '9990002222', email: 'b@x.com', full_name: 'Bb' },
  { id: 'c3', phone: '9990003333', email: 'c@x.com', full_name: 'Cc' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.customer.findMany.mockResolvedValue(RECIPIENTS);
  mockPrisma.campaign.create.mockResolvedValue({ id: 'camp1', name: 'x', type: 'sms' });
});

describe('send_campaign → real gateway dispatch', () => {
  test('SMS campaign dispatches one sendSMS per recipient with the message body', async () => {
    await customer.createCampaign('o1', { name: 'Promo', type: 'sms', target_segment: 'all', message: 'Hi there' });

    expect(mockNotifications.sendSMS).toHaveBeenCalledTimes(3);
    expect(mockNotifications.sendWhatsApp).not.toHaveBeenCalled();
    expect(mockNotifications.sendSMS).toHaveBeenCalledWith('9990001111', 'Hi there');

    const logs = mockPrisma.campaignLog.createMany.mock.calls[0][0].data;
    expect(logs.every((l) => l.status === 'sent')).toBe(true);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sent_count: 3, delivered_count: 3 } }),
    );
  });

  test('WhatsApp campaign dispatches via sendWhatsApp with the message as a template param', async () => {
    mockPrisma.campaign.create.mockResolvedValue({ id: 'camp2', name: 'x', type: 'whatsapp' });

    await customer.createCampaign('o1', { name: 'WA', type: 'whatsapp', target_segment: 'all', message: 'Weekend deal' });

    expect(mockNotifications.sendWhatsApp).toHaveBeenCalledTimes(3);
    expect(mockNotifications.sendSMS).not.toHaveBeenCalled();
    const [phone, , params] = mockNotifications.sendWhatsApp.mock.calls[0];
    expect(phone).toBe('9990001111');
    expect(params).toContain('Weekend deal');
  });

  test('a per-recipient gateway failure is recorded as failed but never aborts the batch', async () => {
    mockNotifications.sendSMS
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('MSG91 500'))
      .mockResolvedValueOnce({ success: true });

    const res = await customer.createCampaign('o1', { name: 'Promo', type: 'sms', target_segment: 'all', message: 'Hi' });

    expect(mockNotifications.sendSMS).toHaveBeenCalledTimes(3); // all recipients attempted
    const logs = mockPrisma.campaignLog.createMany.mock.calls[0][0].data;
    expect(logs.filter((l) => l.status === 'sent')).toHaveLength(2);
    expect(logs.filter((l) => l.status === 'failed')).toHaveLength(1);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sent_count: 2, delivered_count: 2 } }),
    );
    expect(res.total_recipients).toBe(3);
  });

  test('scheduled campaign does NOT dispatch now (deferred to scheduler)', async () => {
    await customer.createCampaign('o1', {
      name: 'Later', type: 'sms', target_segment: 'all', message: 'Hi',
      schedule_at: '2030-01-01T00:00:00Z',
    });

    expect(mockNotifications.sendSMS).not.toHaveBeenCalled();
    expect(mockNotifications.sendWhatsApp).not.toHaveBeenCalled();
    expect(mockPrisma.campaign.update).not.toHaveBeenCalled();
  });
});
