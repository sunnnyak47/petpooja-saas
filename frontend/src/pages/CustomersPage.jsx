import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import { useRegion } from '../hooks/useRegion';
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { isValidPhone, isValidEmail, PHONE_MAXLEN, phonePlaceholder } from '../lib/validation';
import {
  Search, Phone, Crown, Plus, Gift, Trash2, Loader2, Eye,
  ShoppingBag, Calendar, User, Send, Star, Cake, Mail,
  Heart, TrendingUp, AlertTriangle, CheckCircle2, X,
  Download, ShieldOff,
} from 'lucide-react';

const SEGMENT_STYLES = {
  new:     'badge badge-neutral',
  regular: 'badge badge-neutral',
  vip:     'badge badge-neutral',
  lapsed:  'badge badge-danger',
};
const SEGMENT_INLINE = {
  new:     { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' },
  regular: {},
  vip:     { background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)', fontWeight: 700 },
  lapsed:  {},
};

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', gender: '',
  date_of_birth: '', anniversary: '',
  dietary_preference: '', notes: '',
  segment: 'new',
  marketing_consent: false,
};

// Upcoming birthday check (within 7 days)
function daysUntilBirthday(dob) {
  if (!dob) return null;
  const today = new Date();
  const bday  = new Date(dob);
  bday.setFullYear(today.getFullYear());
  if (bday < today) bday.setFullYear(today.getFullYear() + 1);
  const diff = Math.ceil((bday - today) / (1000 * 60 * 60 * 24));
  return diff <= 7 ? diff : null;
}

// ── PDF export (print-to-PDF) ───────────────────────────────────
// Escape user-supplied values so a customer's name/notes can't inject markup
// into the generated document.
function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, s => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
  ));
}

/**
 * Build a clean, self-contained A4 HTML document for a customer's data bundle
 * (the DPDP export payload). Rendered in a popup so the OS print dialog can
 * "Save as PDF" — no external PDF dependency required.
 */
function buildCustomerPdfHtml(bundle, { format, locale } = {}) {
  const fmtMoney = typeof format === 'function' ? format : (n => String(n ?? 0));
  const cust     = bundle?.customer || {};
  const loyalty  = bundle?.loyalty  || {};
  const points   = loyalty.points   || {};
  const txns     = Array.isArray(loyalty.transactions) ? loyalty.transactions : [];
  const orders   = bundle?.orders   || {};
  const orderItems = Array.isArray(orders.items) ? orders.items : [];
  const addresses  = Array.isArray(bundle?.addresses) ? bundle.addresses : [];

  const dOnly = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale || undefined, { day: '2-digit', month: 'short', year: 'numeric' }); };
  const dTime = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString(locale || undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

  const name    = cust.full_name || cust.phone || 'Customer';
  const initial = (cust.full_name || cust.phone || '#').charAt(0).toUpperCase();
  const segment = (cust.segment || 'new');

  const infoRow = (label, value) => (value == null || value === '')
    ? ''
    : `<tr><td class="k">${escHtml(label)}</td><td class="v">${escHtml(value)}</td></tr>`;

  const profileRows = [
    infoRow('Phone', cust.phone),
    infoRow('Email', cust.email),
    infoRow('Gender', cust.gender),
    infoRow('Date of Birth', cust.date_of_birth ? dOnly(cust.date_of_birth) : ''),
    infoRow('Anniversary', cust.anniversary ? dOnly(cust.anniversary) : ''),
    infoRow('Diet Preference', cust.dietary_preference),
    infoRow('Allergens', cust.allergens),
    infoRow('Marketing Consent', cust.marketing_consent ? 'Yes' : 'No'),
    infoRow('Total Visits', cust.total_visits),
    infoRow('Total Spend', cust.total_spend != null ? fmtMoney(Number(cust.total_spend)) : ''),
    infoRow('Last Visit', cust.last_visit_at ? dOnly(cust.last_visit_at) : ''),
    infoRow('Customer Since', cust.created_at ? dOnly(cust.created_at) : ''),
    infoRow('Notes', cust.notes),
  ].join('');

  const orderRows = orderItems.slice(0, 50).map(o =>
    `<tr><td>#ORD-${escHtml(String(o.order_number ?? '').padStart(5, '0'))}</td><td>${escHtml(dTime(o.created_at))}</td><td class="num">${escHtml(fmtMoney(Number(o.grand_total ?? 0)))}</td></tr>`
  ).join('') || `<tr><td colspan="3" class="empty">No orders yet</td></tr>`;

  const txnRows = txns.slice(0, 40).map(t =>
    `<tr><td>${escHtml(dTime(t.created_at))}</td><td class="cap">${escHtml(t.type ?? '')}</td><td>${escHtml(t.description ?? '')}</td><td class="num">${(t.points ?? 0) > 0 ? '+' : ''}${escHtml(String(t.points ?? 0))}</td></tr>`
  ).join('') || `<tr><td colspan="4" class="empty">No loyalty activity</td></tr>`;

  const addressBlock = addresses.length
    ? `<div class="section"><h2>Addresses</h2>${addresses.map(a =>
        `<p class="addr"><b>${escHtml(a.label || 'Address')}:</b> ${escHtml([a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(', '))}</p>`
      ).join('')}</div>`
    : '';

  const fileTitle = `Customer_${String(name).replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escHtml(fileTitle)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 12px; line-height: 1.5; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #6d28d9; padding-bottom: 14px; margin-bottom: 18px; }
  .avatar { width: 52px; height: 52px; border-radius: 14px; background: #6d28d9; color: #fff; font-size: 24px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .head h1 { margin: 0; font-size: 20px; }
  .head .sub { color: #666; font-size: 12px; margin-top: 2px; }
  .badge { display: inline-block; margin-top: 4px; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; background: #ede9fe; color: #6d28d9; }
  .cards { display: flex; gap: 12px; margin-bottom: 18px; }
  .card { flex: 1; border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px; text-align: center; }
  .card .n { font-size: 20px; font-weight: 800; color: #6d28d9; }
  .card .l { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }
  .section { margin-bottom: 18px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .6px; color: #6d28d9; border-bottom: 1px solid #eee; padding-bottom: 5px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  .kv td { padding: 5px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .kv td.k { color: #777; width: 38%; }
  .kv td.v { color: #1a1a1a; font-weight: 500; }
  .grid td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
  .grid thead td { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #999; border-bottom: 1px solid #ddd; font-weight: 700; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .cap { text-transform: capitalize; }
  .empty { text-align: center; color: #aaa; padding: 12px 0; }
  .addr { margin: 4px 0; }
  .foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #eee; color: #999; font-size: 10px; }
</style>
</head>
<body>
  <div class="head">
    <div class="avatar">${escHtml(initial)}</div>
    <div>
      <h1>${escHtml(name)}</h1>
      <div class="sub">${escHtml(cust.phone || '')}${cust.email ? ' · ' + escHtml(cust.email) : ''}</div>
      <span class="badge">${escHtml(segment)}</span>
    </div>
  </div>

  <div class="cards">
    <div class="card"><div class="n">${escHtml(String(orders.count ?? orderItems.length ?? 0))}</div><div class="l">Orders</div></div>
    <div class="card"><div class="n">${escHtml(String(points.current_balance ?? 0))}</div><div class="l">Loyalty Pts</div></div>
    <div class="card"><div class="n">${escHtml(fmtMoney(Number(cust.total_spend ?? 0)))}</div><div class="l">Lifetime Spend</div></div>
  </div>

  <div class="section">
    <h2>Profile</h2>
    <table class="kv">${profileRows || '<tr><td class="empty" colspan="2">No profile details</td></tr>'}</table>
  </div>

  <div class="section">
    <h2>Loyalty — balance ${escHtml(String(points.current_balance ?? 0))} pts (earned ${escHtml(String(points.total_earned ?? 0))}, redeemed ${escHtml(String(points.total_redeemed ?? 0))})</h2>
    <table class="grid">
      <thead><tr><td>Date</td><td>Type</td><td>Description</td><td class="num">Points</td></tr></thead>
      <tbody>${txnRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Recent Orders${orders.count != null ? ' (' + escHtml(String(orders.count)) + ' total)' : ''}</h2>
    <table class="grid">
      <thead><tr><td>Order</td><td>Date</td><td class="num">Amount</td></tr></thead>
      <tbody>${orderRows}</tbody>
    </table>
  </div>

  ${addressBlock}

  <div class="foot">
    Generated ${escHtml(dTime(bundle?.generated_at || new Date()))} · Customer data export (DPDP Act 2023 — right to access). Order history retained per tax law.
  </div>

  <script>
    window.onload = function () {
      setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 350);
    };
  </script>
</body>
</html>`;
}

/** Open the generated HTML in a popup so the browser print dialog can Save-as-PDF. */
function openCustomerPrintWindow(html) {
  if (typeof window === 'undefined') return false;
  const w = window.open('', '_blank');
  if (!w) {
    toast.error('Popup blocked — allow popups to export the PDF');
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export default function CustomersPage() {
  const { user }  = useSelector(s => s.auth);
  const outletId  = user?.outlet_id;
  const { format, locale } = useCurrency();
  const region    = useRegion();
  const isAU      = region === 'AU';
  const qc        = useQueryClient();

  const [search, setSearch]   = useState('');
  const [segFilter, setSegFilter] = useState('');

  const [isAddOpen, setIsAddOpen]         = useState(false);
  const [isEditOpen, setIsEditOpen]       = useState(false);
  const [isDeleteOpen, setIsDeleteOpen]   = useState(false);
  const [isEraseOpen, setIsEraseOpen]     = useState(false);
  const [isExporting, setIsExporting]     = useState(false);
  const [isDetailOpen, setIsDetailOpen]   = useState(false);
  const [isCampaignOpen, setCampaignOpen] = useState(false);
  const [selectedCustomer, setSelected]   = useState(null);
  const [detailTab, setDetailTab]         = useState('profile');
  const [formData, setFormData]           = useState({ ...EMPTY_FORM });
  const [campaignData, setCampaignData]   = useState({ name: '', type: 'whatsapp', target_segment: 'all', message: '' });

  // ── Queries ─────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, segFilter],
    queryFn: () => api.get(`/customers?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}${segFilter ? `&segment=${segFilter}` : ''}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: customerDetail } = useQuery({
    queryKey: ['customerDetail', selectedCustomer?.id],
    queryFn: () => api.get(`/customers/${selectedCustomer.id}`).then(r => r.data),
    enabled: !!selectedCustomer?.id && isDetailOpen,
  });

  const { data: campaignList } = useQuery({
    queryKey: ['campaigns', outletId],
    queryFn: () => api.get(`/customers/campaigns?outlet_id=${outletId}`).then(r => r.data),
    enabled: isCampaignOpen,
  });

  // ── DPDP consent persistence ─────────────────────────────────
  // The /customers create/update schema strips unknown fields, so marketing
  // consent is recorded via the dedicated privacy endpoint once we have an id.
  async function persistConsent(id, consent) {
    if (!id) return;
    try {
      await api.patch(`/privacy/customers/${id}/consent`, { marketing_consent: !!consent, source: 'pos' });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save marketing consent');
    }
  }

  // ── Mutations ────────────────────────────────────────────────
  const addMut = useMutation({
    mutationFn: d => api.post('/customers', d),
    onSuccess: async (res, vars) => {
      const newId = res?.data?.id || res?.id;
      // New customers default to no consent server-side; only call when opted in.
      if (vars?.marketing_consent) await persistConsent(newId, true);
      toast.success('Customer added & linked to loyalty program');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setIsAddOpen(false);
      setFormData({ ...EMPTY_FORM });
    },
    onError: e => toast.error(e.response?.data?.message || e.message || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/customers/${id}`, data),
    onSuccess: async (res, vars) => {
      await persistConsent(vars?.id, vars?.data?.marketing_consent);
      toast.success('Customer updated');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerDetail'] });
      setIsEditOpen(false);
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const eraseMut = useMutation({
    mutationFn: id => api.post(`/privacy/customers/${id}/erase`),
    onSuccess: () => {
      toast.success('Customer personal data erased (DPDP)');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerDetail'] });
      setIsEraseOpen(false);
      setIsDetailOpen(false);
      setIsEditOpen(false);
    },
    onError: e => toast.error(e.response?.data?.message || e.message || 'Failed to erase customer'),
  });

  // ── DPDP data export (right to access / portability) ─────────
  // Produces a real, print-ready PDF (via the browser print dialog → "Save as
  // PDF") from the customer's data bundle — no external PDF dependency.
  async function exportCustomerData(c) {
    if (!c?.id) return;
    setIsExporting(true);
    try {
      const res = await api.get(`/privacy/customers/${c.id}/export`);
      const bundle = res?.data ?? res;
      const html = buildCustomerPdfHtml(bundle, { format, locale });
      const opened = openCustomerPrintWindow(html);
      if (opened) toast.success('Customer PDF ready — choose “Save as PDF” in the print dialog');
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  }

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/customers/${id}`),
    onSuccess: () => {
      toast.success('Customer deleted');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setIsDeleteOpen(false);
    },
    onError: e => toast.error(e.message || 'Failed'),
  });

  const campaignMut = useMutation({
    mutationFn: d => api.post(`/customers/campaigns?outlet_id=${outletId}`, d),
    onSuccess: () => {
      toast.success('Campaign created & broadcast initiated!');
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      setCampaignOpen(false);
      setCampaignData({ name: '', type: 'whatsapp', target_segment: 'all', message: '' });
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed to send campaign'),
  });

  // ── Derived ──────────────────────────────────────────────────
  const customers  = useMemo(() => data?.items || data || [], [data]);
  const campaigns  = useMemo(() => campaignList?.items || campaignList || [], [campaignList]);
  const upcoming   = useMemo(() => customers.filter(c => daysUntilBirthday(c.date_of_birth) !== null), [customers]);

  function openEdit(c) {
    setSelected(c);
    setFormData({
      full_name: c.full_name || '', phone: c.phone || '', email: c.email || '',
      gender: c.gender || '',
      date_of_birth: c.date_of_birth ? c.date_of_birth.slice(0, 10) : '',
      anniversary: c.anniversary ? c.anniversary.slice(0, 10) : '',
      dietary_preference: c.dietary_preference || '', notes: c.notes || '',
      segment: c.segment || 'new',
      marketing_consent: !!c.marketing_consent,
    });
    setIsEditOpen(true);
  }

  function openDetail(c) { setSelected(c); setDetailTab('profile'); setIsDetailOpen(true); }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Customer Management</h1>
          <p className="text-surface-500 text-sm">{customers.length} customers · linked to loyalty program</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCampaignOpen(true)} className="btn-surface gap-2">
            <Send className="w-4 h-4 text-brand-400" /> Marketing Campaign
          </button>
          <button onClick={() => { setFormData({ ...EMPTY_FORM }); setIsAddOpen(true); }} className="btn-primary gap-2">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
      </div>

      {/* Birthday alert */}
      {upcoming.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
          <Cake className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>🎂 Upcoming Birthdays!</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {upcoming.map(c => `${c.full_name || c.phone} (in ${daysUntilBirthday(c.date_of_birth)}d)`).join(', ')}
            </p>
          </div>
          <button onClick={() => { setCampaignData(d => ({ ...d, target_segment: 'all', name: 'Birthday Special', message: 'Happy Birthday! 🎂 Enjoy a special treat from us today. Visit us to claim your birthday discount!' })); setCampaignOpen(true); }}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap btn-secondary">
            Send Birthday Campaign
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input className="input pl-10 w-full" placeholder="Search by name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['', 'new', 'regular', 'vip', 'lapsed'].map(s => (
            <button key={s} onClick={() => setSegFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${segFilter === s ? 'btn-primary' : 'btn-secondary'}`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs uppercase border-b text-surface-500" style={{ borderColor: 'var(--border)' }}>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">DOB</th>
              <th className="px-4 py-3 text-left">Segment</th>
              <th className="px-4 py-3 text-left">Orders</th>
              <th className="px-4 py-3 text-left">Loyalty Pts</th>
              <th className="px-4 py-3 text-left">Last Visit</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700/40">
            {isLoading
              ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-4"><div className="h-4 rounded bg-surface-800 animate-pulse" /></td></tr>)
              : customers.length === 0
              ? <tr><td colSpan={8} className="px-4 py-12 text-center text-surface-500">No customers found</td></tr>
              : customers.map(c => {
                  const bdays = daysUntilBirthday(c.date_of_birth);
                  return (
                    <tr key={c.id} className="hover:bg-surface-800/40 group transition-colors cursor-pointer" onClick={() => openDetail(c)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-sm flex-shrink-0">
                            {c.full_name?.charAt(0)?.toUpperCase() || '#'}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.full_name || 'Unknown'}</p>
                            <p className="text-xs text-surface-500">{c.email || c.dietary_preference || ''}</p>
                          </div>
                          {bdays !== null && <Cake className="w-4 h-4" style={{ color: 'var(--accent)' }} title={`Birthday in ${bdays} day${bdays !== 1 ? 's' : ''}!`} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-300">
                        <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-surface-500" />{c.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-400">
                        {c.date_of_birth ? new Date(c.date_of_birth).toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${SEGMENT_STYLES[c.segment] || SEGMENT_STYLES.new}`} style={SEGMENT_INLINE[c.segment] || SEGMENT_INLINE.new}>
                          {c.segment === 'vip' && <Crown className="w-3 h-3 inline mr-0.5" />}
                          {c.segment || 'new'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-300">{c._count?.orders || 0}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                          <Star className="w-3 h-3" />{c.loyalty_points?.current_balance || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-500">
                        {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString(locale) : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openDetail(c)} className="p-1.5 text-surface-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(c)} className="p-1.5 text-surface-500 hover:text-white hover:bg-surface-700 rounded-lg transition-colors" title="Edit"><User className="w-4 h-4" /></button>
                          <button onClick={() => exportCustomerData(c)} disabled={isExporting} className="p-1.5 text-surface-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors disabled:opacity-50" title="Export data (DPDP)"><Download className="w-4 h-4" /></button>
                          <button onClick={() => { setSelected(c); setIsEraseOpen(true); }} className="p-1.5 text-surface-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors" title="Erase personal data (DPDP)"><ShieldOff className="w-4 h-4" /></button>
                          <button onClick={() => { setSelected(c); setIsDeleteOpen(true); }} className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* ══ MODAL: Add Customer ══ */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Customer" size="md">
        <CustomerForm
          formData={formData} setFormData={setFormData}
          onSubmit={d => addMut.mutate(d)}
          loading={addMut.isPending}
          onCancel={() => setIsAddOpen(false)}
          submitLabel="Add Customer"
        />
      </Modal>

      {/* ══ MODAL: Edit Customer ══ */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Customer" size="md">
        <CustomerForm
          formData={formData} setFormData={setFormData}
          onSubmit={d => updateMut.mutate({ id: selectedCustomer?.id, data: d })}
          loading={updateMut.isPending}
          onCancel={() => setIsEditOpen(false)}
          submitLabel="Save Changes"
          customer={selectedCustomer}
          onExport={() => exportCustomerData(selectedCustomer)}
          onErase={() => setIsEraseOpen(true)}
          exporting={isExporting}
        />
      </Modal>

      {/* ══ MODAL: Customer Detail ══ */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Customer Profile" size="md">
        {selectedCustomer && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/20 flex items-center justify-center text-brand-400 font-black text-2xl flex-shrink-0">
                {selectedCustomer.full_name?.charAt(0)?.toUpperCase() || '#'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{selectedCustomer.full_name || 'Unknown'}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}><Phone className="w-3 h-3" />{selectedCustomer.phone}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${SEGMENT_STYLES[selectedCustomer.segment] || SEGMENT_STYLES.new}`} style={SEGMENT_INLINE[selectedCustomer.segment] || SEGMENT_INLINE.new}>{selectedCustomer.segment}</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
              {['profile', 'loyalty', 'orders'].map(t => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className="px-4 py-2 text-xs font-bold capitalize transition-all border-b-2"
                  style={{ borderColor: detailTab === t ? 'var(--accent)' : 'transparent', color: detailTab === t ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {t}
                </button>
              ))}
            </div>

            {detailTab === 'profile' && (
              <div className="space-y-3">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-hover)' }}>
                    <ShoppingBag className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--accent)' }} />
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{selectedCustomer._count?.orders || 0}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Orders</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-hover)' }}>
                    <Star className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--accent)' }} />
                    <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{selectedCustomer.loyalty_points?.current_balance || 0}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Loyalty Pts</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-hover)' }}>
                    <TrendingUp className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--success)' }} />
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{format(selectedCustomer.total_spend || 0)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Lifetime</p>
                  </div>
                </div>

                {/* Profile fields */}
                <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: 'var(--bg-hover)' }}>
                  {selectedCustomer.email && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Email</span><span style={{ color: 'var(--text-primary)' }}>{selectedCustomer.email}</span></div>}
                  {selectedCustomer.gender && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Gender</span><span className="capitalize" style={{ color: 'var(--text-primary)' }}>{selectedCustomer.gender}</span></div>}
                  {selectedCustomer.date_of_birth && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Birthday</span>
                      <span className="flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                        {new Date(selectedCustomer.date_of_birth).toLocaleDateString(locale, { day: '2-digit', month: 'long' })}
                        {daysUntilBirthday(selectedCustomer.date_of_birth) !== null && <Cake className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />}
                      </span>
                    </div>
                  )}
                  {selectedCustomer.anniversary && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Anniversary</span><span style={{ color: 'var(--text-primary)' }}>{new Date(selectedCustomer.anniversary).toLocaleDateString(locale, { day: '2-digit', month: 'long' })}</span></div>}
                  {selectedCustomer.dietary_preference && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Diet</span><span className="capitalize" style={{ color: 'var(--text-primary)' }}>{selectedCustomer.dietary_preference}</span></div>}
                  {selectedCustomer.last_visit_at && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Last Visit</span><span style={{ color: 'var(--text-primary)' }}>{new Date(selectedCustomer.last_visit_at).toLocaleDateString(locale)}</span></div>}
                  {selectedCustomer.notes && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Notes</span><span className="text-xs" style={{ color: 'var(--text-primary)' }}>{selectedCustomer.notes}</span></div>}
                </div>

                <button onClick={() => { setIsDetailOpen(false); openEdit(selectedCustomer); }} className="btn-surface w-full text-sm">Edit Profile</button>
              </div>
            )}

            {detailTab === 'loyalty' && (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                <div className="flex justify-between items-center rounded-xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Current Balance</p>
                    <p className="text-2xl font-black" style={{ color: 'var(--accent)' }}>{selectedCustomer.loyalty_points?.current_balance || 0} pts</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Lifetime Earned</p>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedCustomer.loyalty_points?.total_earned || 0}</p>
                  </div>
                </div>
                {(customerDetail?.loyalty_transactions || []).map(tx => (
                  <div key={tx.id} className="flex justify-between items-center rounded-xl px-4 py-2" style={{ background: 'var(--bg-hover)' }}>
                    <div>
                      <p className="text-xs font-bold capitalize" style={{ color: 'var(--text-primary)' }}>{tx.type}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{new Date(tx.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                    <p className="text-sm font-black" style={{ color: tx.points > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {tx.points > 0 ? '+' : ''}{tx.points} pts
                    </p>
                  </div>
                ))}
                {(customerDetail?.loyalty_transactions || []).length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No loyalty transactions yet</p>
                )}
              </div>
            )}

            {detailTab === 'orders' && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {(customerDetail?.orders || []).map(o => (
                  <div key={o.id} className="flex justify-between items-center rounded-xl px-4 py-2" style={{ background: 'var(--bg-hover)' }}>
                    <div>
                      <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>#ORD-{String(o.order_number).padStart(5,'0')}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{new Date(o.created_at).toLocaleDateString(locale)}</p>
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{format(o.grand_total || 0)}</p>
                  </div>
                ))}
                {(customerDetail?.orders || []).length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No orders yet</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ══ MODAL: Marketing Campaign ══ */}
      <Modal isOpen={isCampaignOpen} onClose={() => setCampaignOpen(false)} title="Marketing Campaign" size="lg">
        <div className="mt-4 space-y-5">
          {/* Past campaigns */}
          {campaigns.length > 0 && (
            <div className="bg-surface-800/40 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-400 uppercase tracking-widest mb-3">Recent Campaigns</p>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {campaigns.slice(0, 5).map(c => (
                  <div key={c.id} className="flex justify-between items-center text-sm">
                    <span className="text-white font-medium">{c.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-surface-400 text-xs">{c.type} · {c.target_segment}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.status === 'sent' ? 'badge-success' : 'badge-neutral'}`}>{c.status || 'draft'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New campaign form */}
          <div className="border border-surface-700 rounded-xl p-4 space-y-4">
            <p className="text-sm font-bold text-white">New Campaign</p>
            <div>
              <label className="label">Campaign Name *</label>
              <input className="input w-full" required placeholder="e.g. Weekend Special Offer" value={campaignData.name} onChange={e => setCampaignData(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Channel</label>
                <select className="input w-full" value={campaignData.type} onChange={e => setCampaignData(d => ({ ...d, type: e.target.value }))}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div>
                <label className="label">Target Segment</label>
                <select className="input w-full" value={campaignData.target_segment} onChange={e => setCampaignData(d => ({ ...d, target_segment: e.target.value }))}>
                  <option value="all">All Customers ({customers.length})</option>
                  <option value="new">New Customers</option>
                  <option value="regular">Regulars</option>
                  <option value="vip">VIPs Only</option>
                  <option value="lapsed">Lapsed (Re-engage)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Message *</label>
              <textarea className="input w-full min-h-[90px] resize-none text-sm" required placeholder="Hi {name}! We have a special offer waiting for you…" value={campaignData.message} onChange={e => setCampaignData(d => ({ ...d, message: e.target.value }))} />
              <p className="text-[10px] text-surface-500 mt-1">{campaignData.message.length}/160 chars · Use {'{name}'} for personalisation</p>
            </div>
            <button
              onClick={() => { if (!campaignData.name || !campaignData.message) return toast.error('Fill in name and message'); campaignMut.mutate({ ...campaignData, outlet_id: outletId }); }}
              disabled={campaignMut.isPending}
              className="btn-primary w-full py-3 gap-2"
            >
              {campaignMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {campaignMut.isPending ? 'Sending…' : 'Launch Campaign'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMut.mutate(selectedCustomer?.id)}
        title="Delete Customer"
        message={`Delete "${selectedCustomer?.full_name || selectedCustomer?.phone}"? This cannot be undone.`}
        isLoading={deleteMut.isPending}
      />

      {/* Erase Confirm (DPDP right to erasure) */}
      <ConfirmDialog
        isOpen={isEraseOpen}
        onClose={() => setIsEraseOpen(false)}
        onConfirm={() => eraseMut.mutate(selectedCustomer?.id)}
        title="Erase Personal Data (DPDP)"
        message="This permanently anonymises the customer's personal data and cannot be undone. Order history is retained for tax law."
        confirmText="Erase Data"
        isLoading={eraseMut.isPending}
      />
    </div>
  );
}

// ── Reusable customer form ──────────────────────────────────────
function CustomerForm({ formData, setFormData, onSubmit, loading, onCancel, submitLabel, customer, onExport, onErase, exporting }) {
  const region = useRegion();
  const isAU = region === 'AU';
  const set = (key) => e => setFormData(f => ({ ...f, [key]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    if (!formData.phone || !isValidPhone(formData.phone)) return toast.error('Please enter a valid phone number');
    if (formData.email && !isValidEmail(formData.email)) return toast.error('Please enter a valid email address');
    const data = { ...formData };
    if (!data.date_of_birth) delete data.date_of_birth;
    if (!data.anniversary)   delete data.anniversary;
    Object.keys(data).forEach(k => data[k] === '' && delete data[k]);
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input w-full" placeholder={isAU ? 'James Smith' : 'Rahul Sharma'} value={formData.full_name} onChange={set('full_name')} />
        </div>
        <div>
          <label className="label">Phone *</label>
          <input required className="input w-full" type="tel" maxLength={PHONE_MAXLEN} placeholder={phonePlaceholder(isAU ? 'AU' : 'IN')} value={formData.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input w-full" type="email" placeholder={isAU ? 'james@email.com' : 'rahul@email.com'} value={formData.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label">Gender</label>
          <select className="input w-full" value={formData.gender} onChange={set('gender')}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label flex items-center gap-1"><Cake className="w-3 h-3 text-pink-400" /> Date of Birth</label>
          <input className="input w-full" type="date" value={formData.date_of_birth} onChange={set('date_of_birth')} />
          <p className="text-[10px] text-surface-500 mt-0.5">Used for birthday reminders & campaigns</p>
        </div>
        <div>
          <label className="label flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" /> Anniversary</label>
          <input className="input w-full" type="date" value={formData.anniversary} onChange={set('anniversary')} />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Crown className="w-3 h-3 text-amber-400" /> Segment</label>
          <select className="input w-full" value={formData.segment || 'new'} onChange={set('segment')}>
            <option value="new">New</option>
            <option value="regular">Regular</option>
            <option value="vip">VIP</option>
          </select>
          <p className="text-[10px] text-surface-500 mt-0.5">Used to target marketing campaigns</p>
        </div>
        <div>
          <label className="label">Diet Preference</label>
          <select className="input w-full" value={formData.dietary_preference} onChange={set('dietary_preference')}>
            <option value="">—</option>
            <option value="veg">Vegetarian</option>
            <option value="non_veg">Non-Veg</option>
            <option value="vegan">Vegan</option>
            <option value="jain">Jain</option>
          </select>
        </div>
        <div>
          <label className="label">Loyalty — auto-enrolled ✓</label>
          <div className="input text-xs flex items-center gap-2 h-10" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Enrolled on save
          </div>
        </div>
      </div>
      <div>
        <label className="label">Notes / Preferences</label>
        <textarea className="input w-full h-16 text-sm py-2 resize-none" placeholder="Allergies, preferences, special notes…" value={formData.notes} onChange={set('notes')} />
      </div>

      {/* ── Marketing consent (India DPDP Act 2023) ── */}
      <div className="rounded-xl p-3" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 flex-shrink-0 accent-current"
            style={{ accentColor: 'var(--accent)' }}
            checked={!!formData.marketing_consent}
            onChange={e => setFormData(f => ({ ...f, marketing_consent: e.target.checked }))}
          />
          <span className="flex-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Marketing consent (WhatsApp/SMS)</span>
            <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Required under DPDP Act 2023 to send marketing messages.</span>
          </span>
        </label>
      </div>

      {/* ── Data & Privacy actions (existing customer only, DPDP) ── */}
      {customer?.id && (onExport || onErase) && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Data &amp; Privacy</p>
          <div className="flex gap-2 flex-wrap">
            {onExport && (
              <button type="button" onClick={onExport} disabled={exporting} className="btn-surface gap-2 text-sm flex-1 disabled:opacity-50">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? 'Exporting…' : 'Export data'}
              </button>
            )}
            {onErase && (
              <button type="button" onClick={onErase} className="gap-2 text-sm flex-1 px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                <ShieldOff className="w-4 h-4" /> Erase (DPDP)
              </button>
            )}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Export opens a print-ready PDF of the customer&apos;s data (use &ldquo;Save as PDF&rdquo;). Erase permanently anonymises personal data (order history is retained for tax law).</p>
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t border-surface-700/50">
        <button type="button" onClick={onCancel} className="btn-surface flex-1">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
