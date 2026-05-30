/**
 * NotificationCenter — bell + drawer with per-notification actions.
 *
 * Action kinds:
 *   { kind: 'route',  label, path }            → navigate, dismiss
 *   { kind: 'po',     label, payload }         → open editable PO-creation modal
 *                                                 (real /api/purchase-orders call)
 *   { kind: 'none' }                            → mark-read only
 *
 * Read notifications are filtered out of the visible list and persisted in
 * localStorage so they stay gone across reloads.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../lib/api';
import {
  Bell, X, CheckCheck, Info, AlertTriangle, Gift, Clock,
  Megaphone, Package, ChefHat, ShoppingCart, Loader2, Plus, Minus,
} from 'lucide-react';

const TYPE_CFG = {
  INFO:        { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  icon: Info },
  WARNING:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: AlertTriangle },
  MAINTENANCE: { color: '#f87171', bg: 'rgba(239,68,68,0.15)',   icon: Clock },
  PROMO:       { color: '#4ade80', bg: 'rgba(34,197,94,0.15)',   icon: Gift },
  ANNOUNCEMENT:{ color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', icon: Megaphone },
  STOCK:       { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: Package },
  KOT:         { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  icon: ChefHat },
  ORDER:       { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  icon: ShoppingCart },
};

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function todayPlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSelector(s => s.auth);
  const headOfficeId = user?.head_office_id;
  const outletId     = user?.outlet_id || user?.outlet?.id;

  const [open, setOpen] = useState(false);
  const [poModal, setPoModal] = useState(null); // { notif, form }
  const [working, setWorking] = useState(false);
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('notif_read') || '[]')); }
    catch { return new Set(); }
  });
  const drawerRef = useRef(null);

  /* ── Data sources ── */
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements-notif', headOfficeId],
    queryFn: () => {
      if (user?.role === 'super_admin') {
        return api.get('/superadmin/announcements').then(r => r.data).catch(() => []);
      }
      return api.get(`/superadmin/announcements/for-chain/${headOfficeId}`).then(r => r.data).catch(() => []);
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['low-stock-notif', outletId],
    queryFn: () => api.get('/inventory/low-stock').then(r => r.data || []).catch(() => []),
    enabled: !!user,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const { data: dashData } = useQuery({
    queryKey: ['dashboard-notif'],
    queryFn: () => api.get('/reports/dashboard').then(r => r.data).catch(() => null),
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Lazy-load suppliers only when PO modal opens
  const { data: suppliers = [], isFetching: suppliersLoading } = useQuery({
    queryKey: ['suppliers-for-po', outletId],
    queryFn: () => api.get(`/suppliers?outlet_id=${outletId}`).then(r => r.data || []).catch(() => []),
    enabled: !!outletId && !!poModal, // only fetch when modal is open
    staleTime: 5 * 60_000,
  });

  /* ── Build notification list ── */
  const notifications = [];

  announcements.forEach(a => {
    notifications.push({
      id: `ann-${a.id}`,
      title: a.title,
      body: a.body || a.message || '',
      type: a.type || 'ANNOUNCEMENT',
      created_at: a.created_at || a.sent_at,
      action: { kind: 'route', label: 'View details', path: '/announcements' },
    });
  });

  lowStockItems.slice(0, 8).forEach(item => {
    const itemName    = item.name || item.item_name || 'Item';
    const unit        = item.unit || 'units';
    const current     = parseFloat(item.current_stock ?? 0);
    const min         = parseFloat(item.min_threshold ?? item.minimum_stock ?? 0);
    const reorderQty  = parseFloat(item.reorder_qty ?? 0);
    const costPerUnit = parseFloat(item.cost_per_unit ?? 0);
    const suggestedQty = reorderQty > 0 ? reorderQty : Math.max(min * 3 - current, 10);

    notifications.push({
      id: `stock-${item.id}`,
      title: `Low stock: ${itemName}`,
      body: `${current} ${unit} remaining (min ${min}). Reorder recommended.`,
      type: 'STOCK',
      created_at: item.updated_at || new Date().toISOString(),
      action: {
        kind: 'po',
        label: 'Create PO',
        payload: {
          inventoryItemId: item.id,
          name: itemName,
          unit,
          current,
          min,
          suggestedQty,
          costPerUnit,
          preferredSupplierId: item.preferred_supplier_id || null,
        },
      },
    });
  });

  if (dashData?.live?.pending_kots > 0) {
    notifications.push({
      id: 'pending-kots',
      title: `${dashData.live.pending_kots} pending KOT${dashData.live.pending_kots > 1 ? 's' : ''}`,
      body: 'Kitchen orders waiting to be prepared',
      type: 'KOT',
      created_at: new Date().toISOString(),
      action: { kind: 'route', label: 'Open Kitchen Display', path: '/kitchen-display' },
    });
  }

  if (dashData?.today?.running_orders > 0) {
    notifications.push({
      id: 'running-orders',
      title: `${dashData.today.running_orders} running order${dashData.today.running_orders > 1 ? 's' : ''}`,
      body: 'Orders in progress awaiting payment',
      type: 'ORDER',
      created_at: new Date().toISOString(),
      action: { kind: 'route', label: 'View running orders', path: '/running-orders' },
    });
  }

  const visible = notifications.filter(n => !readIds.has(n.id));

  /* ── Read-state helpers ── */
  const persist = (newSet) => {
    setReadIds(newSet);
    localStorage.setItem('notif_read', JSON.stringify([...newSet]));
  };
  const markRead    = (id) => persist(new Set([...readIds, id]));
  const markAllRead = () => persist(new Set([...readIds, ...notifications.map(n => n.id)]));

  /* ── Click dispatcher ── */
  const handleNotificationClick = (n) => {
    if (!n.action || n.action.kind === 'none') { markRead(n.id); return; }
    if (n.action.kind === 'route') {
      markRead(n.id); navigate(n.action.path); setOpen(false); return;
    }
    if (n.action.kind === 'po') {
      const p = n.action.payload;
      setPoModal({
        notif: n,
        form: {
          supplier_id:    p.preferredSupplierId || '',
          quantity:       p.suggestedQty,
          unit_price:     p.costPerUnit > 0 ? p.costPerUnit : '',
          expected_date:  todayPlusDays(3),
          notes:          `Auto-reorder: ${p.name} is below minimum threshold (${p.current} ${p.unit} on hand, min ${p.min} ${p.unit}).`,
        },
      });
    }
  };

  // Once suppliers load, pre-select the first one if no preferred supplier
  useEffect(() => {
    if (poModal && !poModal.form.supplier_id && suppliers.length > 0) {
      setPoModal(m => ({ ...m, form: { ...m.form, supplier_id: suppliers[0].id } }));
    }
  }, [suppliers, poModal]);

  const updateForm = (field, val) => {
    setPoModal(m => ({ ...m, form: { ...m.form, [field]: val } }));
  };

  /* ── Submit the PO to the real endpoint ── */
  const submitPo = async () => {
    if (!poModal) return;
    const { form, notif } = poModal;
    const p = notif.action.payload;

    if (!form.supplier_id) {
      toast.error('Please select a supplier.');
      return;
    }
    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.unit_price);
    if (!qty || qty < 1) {
      toast.error('Quantity must be at least 1.');
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      toast.error('Please enter a valid unit price.');
      return;
    }

    setWorking(true);
    try {
      const body = {
        outlet_id: outletId,
        supplier_id: form.supplier_id,
        status: 'draft',
        expected_date: form.expected_date || undefined,
        notes: form.notes || undefined,
        items: [{
          inventory_item_id: p.inventoryItemId,
          quantity: qty,
          unit_price: price,
          unit: p.unit,
        }],
      };
      const res = await api.post('/purchase-orders', body);
      const po = res.data || res;
      const poNumber = po?.po_number || po?.reference_number || po?.id?.slice(0, 8);
      toast.success(`Purchase order ${poNumber ? `#${poNumber}` : ''} created for ${qty} ${p.unit} of ${p.name}`);

      // Mark notification as read so it disappears
      markRead(notif.id);

      // Refresh related caches
      queryClient.invalidateQueries({ queryKey: ['low-stock-notif'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });

      setPoModal(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to create purchase order.');
    } finally {
      setWorking(false);
    }
  };

  /* ── Outside click closes drawer (not modal) ── */
  useEffect(() => {
    if (!open || poModal) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, poModal]);

  const total = useMemo(() => {
    if (!poModal) return 0;
    const q = parseFloat(poModal.form.quantity) || 0;
    const p = parseFloat(poModal.form.unit_price) || 0;
    return q * p;
  }, [poModal]);

  return (
    <>
      <div className="relative" ref={drawerRef}>
        {/* Bell */}
        <button onClick={() => setOpen(o => !o)}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
          style={{ background: open ? 'var(--bg-secondary)' : 'transparent' }}>
          <Bell className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          {visible.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: '#ef4444', color: '#fff' }}>
              {visible.length > 9 ? '9+' : visible.length}
            </span>
          )}
        </button>

        {/* Drawer */}
        {open && (
          <div className="absolute right-0 top-10 w-[360px] rounded-xl shadow-2xl z-50 overflow-hidden"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Notifications</span>
                {visible.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                    {visible.length} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {visible.length > 0 && (
                  <button onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium hover:underline"
                    style={{ color: '#818cf8' }}>
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} aria-label="Close">
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <CheckCheck className="w-5 h-5" style={{ color: '#10b981' }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>You&rsquo;re all caught up</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No new notifications right now</p>
                </div>
              ) : (
                visible.map((n, i) => {
                  const cfg = TYPE_CFG[n.type] || TYPE_CFG.ANNOUNCEMENT;
                  return (
                    <div key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className="px-4 py-3 cursor-pointer transition-all hover:bg-black/5 dark:hover:bg-white/5"
                      style={{
                        borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none',
                        background: `${cfg.color}06`,
                      }}>
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: cfg.bg }}>
                          <cfg.icon className="w-4 h-4" style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                          </div>
                          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{timeAgo(n.created_at)}</p>
                            {n.action && n.action.kind !== 'none' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleNotificationClick(n); }}
                                className="text-[11px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md transition-all"
                                style={{ background: `${cfg.color}1c`, color: cfg.color }}>
                                {n.action.label} →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {visible.length > 0 && (
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {visible.length} active · {readIds.size} cleared
                </p>
                <button onClick={() => persist(new Set())}
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: 'var(--text-secondary)' }}>
                  Reset cleared
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═════ Real PO creation modal ═════ */}
      {poModal && (() => {
        const p = poModal.notif.action.payload;
        const f = poModal.form;
        const selectedSupplier = suppliers.find(s => s.id === f.supplier_id);
        const hasSuppliers = suppliers.length > 0;

        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 overflow-y-auto"
            style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget && !working) setPoModal(null); }}>
            <div
              className="w-full max-w-[520px] rounded-2xl shadow-2xl my-auto"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

              {/* Header */}
              <div className="px-6 pt-6 pb-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <ShoppingCart className="w-5 h-5" style={{ color: '#f59e0b' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>
                    Create Purchase Order
                  </div>
                  <div className="text-base font-bold leading-tight mt-0.5" style={{ color: 'var(--text-primary)' }}>
                    {p.name}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    On hand: <strong>{p.current} {p.unit}</strong> · Min threshold: <strong>{p.min} {p.unit}</strong>
                  </div>
                </div>
                <button onClick={() => !working && setPoModal(null)}
                  className="p-1.5 rounded-md transition-colors hover:bg-black/5">
                  <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              {/* Body — form */}
              <div className="px-6 py-5 space-y-4">

                {/* Supplier */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Supplier <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {suppliersLoading ? (
                    <div className="px-3 py-2.5 rounded-lg text-sm flex items-center gap-2"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading suppliers…
                    </div>
                  ) : !hasSuppliers ? (
                    <div className="px-3 py-2.5 rounded-lg text-xs"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                      No suppliers found.{' '}
                      <button
                        type="button"
                        onClick={() => { setPoModal(null); setOpen(false); navigate('/suppliers'); }}
                        className="underline font-semibold">
                        Add a supplier first →
                      </button>
                    </div>
                  ) : (
                    <select
                      value={f.supplier_id}
                      onChange={e => updateForm('supplier_id', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.contact_person ? ` — ${s.contact_person}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedSupplier && (
                    <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                      {selectedSupplier.phone && <>📞 {selectedSupplier.phone}</>}
                      {selectedSupplier.email && <> · ✉ {selectedSupplier.email}</>}
                      {selectedSupplier.payment_terms && <> · 💳 {selectedSupplier.payment_terms}</>}
                    </div>
                  )}
                </div>

                {/* Qty + Unit Price row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                      Quantity ({p.unit}) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div className="flex items-center rounded-lg overflow-hidden"
                      style={{ border: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => updateForm('quantity', Math.max(1, (parseFloat(f.quantity) || 0) - 1))}
                        className="px-2.5 py-2.5 transition-colors hover:bg-black/5"
                        style={{ color: 'var(--text-secondary)' }}>
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={f.quantity}
                        onChange={e => updateForm('quantity', e.target.value)}
                        className="flex-1 px-2 py-2.5 text-sm font-semibold text-center outline-none"
                        style={{ background: 'transparent', color: 'var(--text-primary)' }}
                      />
                      <button
                        type="button"
                        onClick={() => updateForm('quantity', (parseFloat(f.quantity) || 0) + 1)}
                        className="px-2.5 py-2.5 transition-colors hover:bg-black/5"
                        style={{ color: 'var(--text-secondary)' }}>
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                      Unit price <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={f.unit_price}
                      onChange={e => updateForm('unit_price', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {p.costPerUnit > 0 && parseFloat(f.unit_price) !== p.costPerUnit && (
                      <button
                        type="button"
                        onClick={() => updateForm('unit_price', p.costPerUnit)}
                        className="text-[11px] mt-1 hover:underline font-medium"
                        style={{ color: '#818cf8' }}>
                        Use last cost: {p.costPerUnit}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expected delivery */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Expected delivery
                  </label>
                  <input
                    type="date"
                    value={f.expected_date}
                    onChange={e => updateForm('expected_date', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Add a note for the supplier (optional)"
                    value={f.notes}
                    onChange={e => updateForm('notes', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                {/* Total */}
                <div className="p-3 rounded-lg flex items-center justify-between"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400e' }}>
                      Order total
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {f.quantity || 0} {p.unit} × {f.unit_price || 0}
                    </div>
                  </div>
                  <div className="text-xl font-bold" style={{ color: '#f59e0b' }}>
                    {total.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 flex items-center justify-end gap-2"
                style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <button
                  onClick={() => setPoModal(null)}
                  disabled={working}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  Cancel
                </button>
                <button
                  onClick={submitPo}
                  disabled={working || !hasSuppliers || !f.supplier_id}
                  className="px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                    color: '#fff',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.35)',
                  }}>
                  {working ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <>Create draft PO</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
