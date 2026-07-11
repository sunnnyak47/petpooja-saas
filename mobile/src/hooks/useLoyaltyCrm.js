/**
 * useLoyaltyCrm — data + pure transforms for the Loyalty & CRM screen
 * ("Rewards & campaigns").
 *
 * Backend (customers module, mounted at /api/customers):
 *   GET  /customers/crm/dashboard?outlet_id=       → CRM KPIs
 *        { total_customers,
 *          segments: { new, regular, vip, lapsed },
 *          top_spenders: [{ id, full_name, phone, segment, total_visits,
 *                           total_spend, last_visit_at,
 *                           loyalty_points: { current_balance } }],
 *          birthday_upcoming: [{ id, full_name, phone, date_of_birth }],
 *          recent_transactions: [...],
 *          loyalty_stats: { total_points_outstanding, total_points_earned,
 *                           total_points_redeemed },
 *          loyalty_config: {...} }
 *   GET  /customers/crm/birthdays?days=            → upcoming-birthday customers
 *        [{ id, full_name, phone, email, date_of_birth, birth_day, birth_month }]
 *   POST /customers/crm/birthday-campaign          → { outlet_id, message_template }
 *   GET  /customers/campaigns?outlet_id=           → paginated campaigns
 *        [{ id, name, type, target_segment, message_template, total_recipients,
 *           status, sent_at, scheduled_at, sent_count, delivered_count, created_at }]
 *   POST /customers/campaigns                       → { outlet_id, name, type,
 *                                                       target_segment, message, schedule_at? }
 *   GET  /customers/loyalty/config?outlet_id=      → loyalty programme config
 *   PUT  /customers/loyalty/config                 → { outlet_id, ...config fields }
 *   GET  /customers?outlet_id=&limit=              → customers (incl. loyalty_points)
 *   POST /customers/:id/loyalty/adjust             → { outlet_id, points, reason }
 *
 * Every list-fetch is scoped by the SELECTED outlet (useOutlet().outletId) — an
 * owner's user row often carries a null outlet_id, so we never rely on that.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

export const CRM_KEYS = {
  dashboard: (outletId) => ['crm', 'dashboard', outletId],
  birthdays: (outletId, days) => ['crm', 'birthdays', outletId, days],
  campaigns: (outletId) => ['crm', 'campaigns', outletId],
  config: (outletId) => ['crm', 'loyalty-config', outletId],
  customers: (outletId) => ['crm', 'customers', outletId],
};

// Marketing segments the backend understands (createCampaignSchema / customer.segment).
export const SEGMENTS = [
  { key: 'all', label: 'All customers' },
  { key: 'new', label: 'New' },
  { key: 'regular', label: 'Regular' },
  { key: 'vip', label: 'VIP' },
  { key: 'lapsed', label: 'Lapsed' },
];

// Channels accepted by createCampaignSchema.type.
export const CAMPAIGN_TYPES = [
  { key: 'sms', label: 'SMS', icon: 'chatbubble-ellipses-outline' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' },
  { key: 'email', label: 'Email', icon: 'mail-outline' },
];

// Editable loyalty-config fields (whitelist mirrors customer.service LOYALTY_CONFIG_FIELDS).
export const LOYALTY_FIELDS = [
  { key: 'earn_rate',       label: 'Earn rate',        hint: 'Points earned per spend unit below' },
  { key: 'earn_per_amount', label: 'Per amount spent', hint: 'Spend this to earn 1× earn rate' },
  { key: 'redeem_value',    label: 'Redeem value',     hint: 'Cash value of 1 point' },
  { key: 'min_redemption',  label: 'Min. to redeem',   hint: 'Fewest points a customer can redeem' },
  { key: 'signup_bonus',    label: 'Signup bonus',     hint: 'Points on new signup' },
  { key: 'birthday_bonus',  label: 'Birthday bonus',   hint: 'Points on birthday' },
  { key: 'vip_threshold',   label: 'VIP threshold',    hint: 'Total spend to reach VIP' },
  { key: 'vip_multiplier',  label: 'VIP multiplier',   hint: 'Earn multiplier for VIPs' },
  { key: 'expiry_months',   label: 'Expiry (months)',  hint: '0 = points never expire' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Response unwrapping ──────────────────────────────────────────────────────
// The axios interceptor returns the { success, data, message, meta } envelope.

/** Unwrap a list payload: envelope.data (array) → array, else [] */
export function unwrapList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.items)) return res.data.items;
  if (Array.isArray(res.items)) return res.items;
  return [];
}

/** Unwrap an object payload: envelope.data → object, else the raw object. */
export function unwrapObj(res) {
  if (!res || typeof res !== 'object') return null;
  if ('data' in res && res.data && typeof res.data === 'object') return res.data;
  return res;
}

// ─── Pure transforms (unit-tested) ────────────────────────────────────────────

/** Coerce anything (Prisma Decimal string, number, null) to a finite number. */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalise the CRM dashboard payload into flat KPI fields for the cards.
 * "Active" = engaged customers (regular + vip); "At risk" = lapsed.
 */
export function normalizeCrm(dashboard) {
  const d = dashboard || {};
  const seg = d.segments || {};
  const ls = d.loyalty_stats || {};
  const newCount = num(seg.new);
  const regularCount = num(seg.regular);
  const vipCount = num(seg.vip);
  const lapsedCount = num(seg.lapsed);
  return {
    totalCustomers: num(d.total_customers),
    newCount,
    regularCount,
    vipCount,
    lapsedCount,
    activeCount: regularCount + vipCount,
    atRiskCount: lapsedCount,
    pointsOutstanding: num(ls.total_points_outstanding),
    pointsEarned: num(ls.total_points_earned),
    pointsRedeemed: num(ls.total_points_redeemed),
  };
}

/** Extract 'YYYY-MM-DD' calendar parts from a date string or Date (TZ-safe). */
function ymdParts(dob) {
  if (!dob) return null;
  let s;
  if (typeof dob === 'string') s = dob;
  else {
    const dt = new Date(dob);
    if (Number.isNaN(dt.getTime())) return null;
    s = dt.toISOString();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/**
 * Whole days until the next occurrence of a customer's birthday.
 * Returns 0 on the birthday itself, null for a missing/invalid date.
 * `now` is injectable for deterministic tests.
 */
export function daysUntilBirthday(dob, now = new Date()) {
  const p = ymdParts(dob);
  if (!p) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), p.m - 1, p.d);
  if (next.getTime() < today.getTime()) {
    next = new Date(now.getFullYear() + 1, p.m - 1, p.d);
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/** Human label for a days-away count. */
export function birthdayLabel(days) {
  if (days == null) return '';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** 'Mar 14' style birthday date (locale-independent). */
export function formatDob(dob) {
  const p = ymdParts(dob);
  if (!p) return '';
  return `${MONTHS[p.m - 1] || '?'} ${p.d}`;
}

/**
 * Build sorted birthday rows (soonest first) with derived label + display date.
 * `now` injectable for tests.
 */
export function buildBirthdayRows(list, now = new Date()) {
  return (list || [])
    .map((c) => {
      const days = daysUntilBirthday(c.date_of_birth, now);
      return {
        id: c.id,
        name: c.full_name || 'Guest',
        phone: c.phone || '',
        dobLabel: formatDob(c.date_of_birth),
        days: days == null ? 999 : days,
        label: birthdayLabel(days),
        isToday: days === 0,
      };
    })
    .sort((a, b) => a.days - b.days);
}

/** Balance of a customer's loyalty points, tolerant of shape variants. */
export function pointsBalance(customer) {
  if (!customer) return 0;
  const lp = customer.loyalty_points;
  if (lp && typeof lp === 'object') return num(lp.current_balance);
  return num(customer.loyalty_balance);
}

/**
 * Map + sort customers into loyalty-member rows, highest balance first.
 * Drops customers with a zero balance so the list highlights real members.
 */
export function topLoyaltyMembers(customers, limit = 50) {
  return (customers || [])
    .map((c) => ({
      id: c.id,
      name: c.full_name || 'Guest',
      phone: c.phone || '',
      segment: c.segment || 'new',
      points: pointsBalance(c),
      totalSpend: num(c.total_spend),
      visits: num(c.total_visits),
    }))
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

/** Convert a loyalty config object into string form values for text inputs. */
export function configToForm(cfg) {
  const c = cfg || {};
  const form = {};
  for (const f of LOYALTY_FIELDS) {
    const v = c[f.key];
    form[f.key] = v == null ? '' : String(v);
  }
  return form;
}

/**
 * Build the PUT /loyalty/config body from the editable form + enabled toggle.
 * Coerces every field to a finite number; only sends known keys.
 */
export function formToConfigPayload(form, enabled) {
  const payload = { enabled: !!enabled };
  for (const f of LOYALTY_FIELDS) {
    payload[f.key] = num(form?.[f.key]);
  }
  if (payload.earn_per_amount <= 0) payload.earn_per_amount = 1;
  return payload;
}

/** Status → { label, tone } for campaign pills. tone is a colors key. */
export function campaignStatusMeta(status) {
  switch ((status || '').toLowerCase()) {
    case 'sent':
    case 'completed':
      return { label: 'Sent', tone: 'success' };
    case 'scheduled':
      return { label: 'Scheduled', tone: 'warning' };
    case 'sending':
      return { label: 'Sending', tone: 'accent' };
    case 'failed':
      return { label: 'Failed', tone: 'error' };
    case 'draft':
    default:
      return { label: status ? status[0].toUpperCase() + status.slice(1) : 'Draft', tone: 'textMuted' };
  }
}

/** Readable audience label from a target_segment key. */
export function audienceLabel(seg) {
  const found = SEGMENTS.find((s) => s.key === seg);
  if (found) return found.label;
  if (seg === 'birthday') return 'Birthday';
  return seg || 'All customers';
}

/** Shape a raw campaign row for the list UI. */
export function buildCampaignRow(c) {
  const meta = campaignStatusMeta(c.status);
  return {
    id: c.id,
    name: c.name || 'Untitled campaign',
    type: c.type || 'sms',
    audience: audienceLabel(c.target_segment),
    message: c.message_template || '',
    recipients: num(c.total_recipients),
    delivered: num(c.delivered_count),
    status: c.status,
    statusLabel: meta.label,
    statusTone: meta.tone,
    sentAt: c.sent_at || c.scheduled_at || c.created_at || null,
  };
}

export function buildCampaignRows(list) {
  return (list || []).map(buildCampaignRow);
}

/**
 * Validate + build the POST /campaigns body from the New Campaign form.
 * Throws Error(message) on invalid input so the screen can surface it.
 */
export function buildCampaignPayload(form) {
  const name = (form?.name || '').trim();
  const message = (form?.message || '').trim();
  const type = form?.type || 'sms';
  const target_segment = form?.target_segment || 'all';
  if (!name) throw new Error('Campaign name is required');
  if (name.length > 100) throw new Error('Campaign name is too long (max 100)');
  if (!message) throw new Error('Message is required');
  if (message.length > 1000) throw new Error('Message is too long (max 1000)');
  if (!CAMPAIGN_TYPES.some((t) => t.key === type)) throw new Error('Pick a valid channel');
  return { name, type, target_segment, message };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** CRM dashboard KPIs for the selected outlet. */
export function useCrmDashboard() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: CRM_KEYS.dashboard(outletId),
    queryFn: async () => {
      const res = await api.get('/customers/crm/dashboard', { params: { outlet_id: outletId } });
      return unwrapObj(res);
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

/** Upcoming-birthday customers (next `days` days). */
export function useBirthdays(days = 7) {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: CRM_KEYS.birthdays(outletId, days),
    queryFn: async () => {
      const res = await api.get('/customers/crm/birthdays', { params: { outlet_id: outletId, days } });
      return unwrapList(res);
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

/** Campaigns for the selected outlet. */
export function useCampaigns() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: CRM_KEYS.campaigns(outletId),
    queryFn: async () => {
      const res = await api.get('/customers/campaigns', { params: { outlet_id: outletId, limit: 100 } });
      return unwrapList(res);
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
  });
}

/** Loyalty programme config for the selected outlet. */
export function useLoyaltyConfig() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: CRM_KEYS.config(outletId),
    queryFn: async () => {
      const res = await api.get('/customers/loyalty/config', { params: { outlet_id: outletId } });
      return unwrapObj(res);
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

/** Customers list (used to derive top loyalty members). */
export function useCrmCustomers() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: CRM_KEYS.customers(outletId),
    queryFn: async () => {
      const res = await api.get('/customers', { params: { outlet_id: outletId, limit: 100 } });
      return unwrapList(res);
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Send the birthday campaign to everyone whose birthday is today. */
export function useSendBirthdayCampaign() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageTemplate) =>
      api.post('/customers/crm/birthday-campaign', {
        outlet_id: outletId,
        message_template: messageTemplate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CRM_KEYS.campaigns(outletId) });
      qc.invalidateQueries({ queryKey: CRM_KEYS.dashboard(outletId) });
    },
  });
}

/** Create (and immediately send) a campaign. */
export function useCreateCampaign() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      api.post('/customers/campaigns', { outlet_id: outletId, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CRM_KEYS.campaigns(outletId) });
    },
  });
}

/** Save the loyalty programme config. */
export function useUpdateLoyaltyConfig() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      api.put('/customers/loyalty/config', { outlet_id: outletId, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CRM_KEYS.config(outletId) });
      qc.invalidateQueries({ queryKey: CRM_KEYS.dashboard(outletId) });
    },
  });
}

/** Manually adjust a customer's loyalty balance (+ add / − deduct) with a reason. */
export function useAdjustPoints() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, points, reason }) =>
      api.post(`/customers/${customerId}/loyalty/adjust`, {
        outlet_id: outletId,
        points,
        reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CRM_KEYS.customers(outletId) });
      qc.invalidateQueries({ queryKey: CRM_KEYS.dashboard(outletId) });
    },
  });
}
