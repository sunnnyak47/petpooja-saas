/**
 * @fileoverview OrderOperationsModals — Five operational modal components for
 * the Running Orders page: TransferTable, MergeOrders, EBill, CustomerAssign,
 * and WaiterAssign.
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import { useRegion } from '../../hooks/useRegion';
import {
  ArrowLeftRight, GitMerge, Mail, Phone, UserPlus, User,
  Search, ChefHat, Users, Loader2, AlertTriangle, CheckCircle2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function Spinner() {
  return <Loader2 className="w-4 h-4 animate-spin" />;
}

function InlineError({ message }) {
  if (!message) return null;
  return (
    <div
      className="flex items-center gap-2 p-3 rounded-lg text-sm"
      style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      {message}
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--bg-hover)' }}
      >
        <Icon className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
    </div>
  );
}

function PrimaryButton({ onClick, disabled, loading, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
      style={{
        background: disabled || loading ? 'var(--bg-hover)' : 'var(--accent)',
        color: disabled || loading ? 'var(--text-secondary)' : '#fff',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
      style={{
        background: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component 1: TransferTableModal
// ---------------------------------------------------------------------------

export function TransferTableModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [inlineError, setInlineError] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTableId(null);
      setInlineError('');
    }
  }, [isOpen]);

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['tables-available', outletId],
    queryFn: () => api.get(`/tables?outlet_id=${outletId}&status=available`),
    enabled: isOpen && !!outletId,
    select: (res) => res?.data?.tables || res?.tables || res?.data || [],
  });

  const tables = Array.isArray(tablesData) ? tablesData : [];

  const transferMutation = useMutation({
    mutationFn: () =>
      api.post(`/orders/${order.id}/transfer-table`, {
        table_id: selectedTableId,
        outlet_id: outletId,
      }),
    onSuccess: () => {
      toast.success('Table transferred!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const msg = err?.message || 'Failed to transfer table';
      setInlineError(msg);
      toast.error(msg);
    },
  });

  const statusColor = (status) => {
    if (status === 'available') return '#4ade80';
    if (status === 'occupied') return '#f87171';
    return '#facc15';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Table" size="lg">
      {/* Subtitle */}
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Current: Table {order?.table?.table_number || '—'}
        </span>
        {' '}· Select a new table below
      </p>

      <InlineError message={inlineError} />

      {/* Table grid */}
      {tablesLoading ? (
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Spinner /> Loading tables…
        </div>
      ) : tables.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} message="No available tables found" />
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-6 max-h-64 overflow-y-auto pr-1">
          {tables.map((table) => {
            const isSelected = selectedTableId === table.id;
            const isCurrentTable = table.id === order?.table_id;
            return (
              <button
                key={table.id}
                disabled={isCurrentTable}
                onClick={() => {
                  setSelectedTableId(isSelected ? null : table.id);
                  setInlineError('');
                }}
                className="relative flex flex-col items-center justify-center p-3 rounded-xl border text-sm font-medium transition-all"
                style={{
                  background: isSelected
                    ? 'rgba(99,102,241,0.15)'
                    : 'var(--bg-hover)',
                  borderColor: isSelected ? '#6366f1' : 'var(--border)',
                  color: isCurrentTable ? 'var(--text-secondary)' : 'var(--text-primary)',
                  cursor: isCurrentTable ? 'not-allowed' : 'pointer',
                  opacity: isCurrentTable ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  if (!isSelected && !isCurrentTable) {
                    e.currentTarget.style.borderColor = '#4ade80';
                    e.currentTarget.style.background = 'rgba(74,222,128,0.08)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected && !isCurrentTable) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }
                }}
              >
                {isSelected && (
                  <CheckCircle2 className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-indigo-400" />
                )}
                <span className="text-base font-bold">{table.table_number}</span>
                <span className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Cap: {table.capacity}
                </span>
                <span className="flex items-center gap-1 text-xs mt-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ background: statusColor(table.status) }}
                  />
                  <span style={{ color: statusColor(table.status) }}>{table.status}</span>
                </span>
                {isCurrentTable && (
                  <span className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    (current)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton
          onClick={() => transferMutation.mutate()}
          disabled={!selectedTableId}
          loading={transferMutation.isPending}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Transfer Table
        </PrimaryButton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 2: MergeOrdersModal
// ---------------------------------------------------------------------------

export function MergeOrdersModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const { format } = useCurrency();
  const [selectedId, setSelectedId] = useState(null);
  const [inlineError, setInlineError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setInlineError('');
    }
  }, [isOpen]);

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['active-orders-merge', outletId],
    queryFn: () =>
      api.get(
        `/orders?outlet_id=${outletId}&status=created,confirmed,held,billed&limit=50`
      ),
    enabled: isOpen && !!outletId,
    select: (res) => res?.data?.orders || res?.orders || res?.data || [],
  });

  const otherOrders = Array.isArray(ordersData)
    ? ordersData.filter((o) => o.id !== order?.id)
    : [];

  const mergeMutation = useMutation({
    mutationFn: () =>
      api.post(`/orders/${order.id}/merge`, {
        target_order_id: selectedId,
        outlet_id: outletId,
      }),
    onSuccess: () => {
      toast.success('Orders merged!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const msg = err?.message || 'Failed to merge orders';
      setInlineError(msg);
      toast.error(msg);
    },
  });

  const statusBadge = (status) => {
    const map = {
      created: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
      confirmed: { bg: 'rgba(249,115,22,0.12)', color: '#fb923c' },
      held: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
      billed: { bg: 'rgba(168,85,247,0.12)', color: '#c084fc' },
    };
    return map[status] || { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' };
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Merge Orders" size="lg">
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Select one order to merge into. Items from{' '}
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          #{order?.order_number || order?.id?.slice(-6)}
        </span>{' '}
        will be moved to the target order.
      </p>

      {/* Warning banner */}
      <div
        className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4"
        style={{ background: 'rgba(234,179,8,0.08)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.2)' }}
      >
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        Items from this order will be moved to the selected order. This cannot be undone.
      </div>

      <InlineError message={inlineError} />

      {/* Orders list */}
      {ordersLoading ? (
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Spinner /> Loading orders…
        </div>
      ) : otherOrders.length === 0 ? (
        <EmptyState icon={GitMerge} message="No other active orders to merge with" />
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1 mb-6">
          {otherOrders.map((o) => {
            const isSelected = selectedId === o.id;
            const badge = statusBadge(o.status);
            return (
              <button
                key={o.id}
                onClick={() => {
                  setSelectedId(isSelected ? null : o.id);
                  setInlineError('');
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all"
                style={{
                  background: isSelected ? 'rgba(99,102,241,0.1)' : 'var(--bg-hover)',
                  borderColor: isSelected ? '#6366f1' : 'var(--border)',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Selection indicator */}
                  <div
                    className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                    style={{
                      borderColor: isSelected ? '#6366f1' : 'var(--border)',
                      background: isSelected ? '#6366f1' : 'transparent',
                    }}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      #{o.order_number || o.id?.slice(-6)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {o.table?.table_number
                        ? `Table ${o.table.table_number}`
                        : o.customer_name || 'Walk-in'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {o._count?.order_items ?? '—'} items
                    </p>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {format(o.total_amount || 0)}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {o.status}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton
          onClick={() => mergeMutation.mutate()}
          disabled={!selectedId}
          loading={mergeMutation.isPending}
        >
          <GitMerge className="w-4 h-4" />
          Merge Orders
        </PrimaryButton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 3: EBillModal
// ---------------------------------------------------------------------------

export function EBillModal({ isOpen, onClose, order, onSuccess }) {
  const { format } = useCurrency();
  const region = useRegion();
  const defaultCountryCode = region === 'AU' ? '+61' : '+91';
  const defaultPhone = order?.customer?.phone || order?.customer_phone || '';
  const defaultEmail = order?.customer?.email || '';

  const [activeTab, setActiveTab] = useState(defaultPhone ? 'sms' : 'email');
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [inlineError, setInlineError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPhone(order?.customer?.phone || order?.customer_phone || '');
      setEmail(order?.customer?.email || '');
      setActiveTab(order?.customer?.phone || order?.customer_phone ? 'sms' : 'email');
      setInlineError('');
    }
  }, [isOpen, order]);

  const sendMutation = useMutation({
    mutationFn: () => {
      const body =
        activeTab === 'sms'
          ? { method: 'sms', phone: `${countryCode}${phone}` }
          : { method: 'email', email };
      return api.post(`/orders/${order.id}/ebill`, body);
    },
    onSuccess: () => {
      toast.success('Bill sent!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const msg = err?.message || 'Failed to send bill';
      setInlineError(msg);
      toast.error(msg);
    },
  });

  const canSend =
    activeTab === 'sms'
      ? phone.replace(/\D/g, '').length >= 8
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const totalItems =
    order?._count?.order_items ?? order?.order_items?.length ?? '—';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send Digital Bill" size="md">
      {/* Tabs */}
      <div
        className="flex rounded-xl p-1 mb-5"
        style={{ background: 'var(--bg-hover)' }}
      >
        {[
          { key: 'sms', label: 'SMS', icon: Phone },
          { key: 'email', label: 'Email', icon: Mail },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setInlineError(''); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === key ? 'var(--bg-card)' : 'transparent',
              color: activeTab === key ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === key ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Input */}
      {activeTab === 'sms' ? (
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Phone Number
          </label>
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="px-3 py-2.5 rounded-xl text-sm border"
              style={{
                background: 'var(--bg-hover)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="+91">+91 IN</option>
              <option value="+61">+61 AU</option>
              <option value="+1">+1 US</option>
              <option value="+44">+44 UK</option>
            </select>
            <input
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setInlineError(''); }}
              placeholder="9876543210"
              className="flex-1 px-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{
                background: 'var(--bg-hover)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setInlineError(''); }}
            placeholder="customer@example.com"
            className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
            style={{
              background: 'var(--bg-hover)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      )}

      <InlineError message={inlineError} />

      {/* Preview */}
      <div
        className="rounded-xl p-4 mb-5 space-y-1.5"
        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
          Bill Preview
        </p>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Order #</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {order?.order_number || order?.id?.slice(-6) || '—'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Items</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{totalItems}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold">
          <span style={{ color: 'var(--text-secondary)' }}>Total</span>
          <span style={{ color: 'var(--text-primary)' }}>
            {format(order?.total_amount || 0)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton
          onClick={() => sendMutation.mutate()}
          disabled={!canSend}
          loading={sendMutation.isPending}
        >
          {activeTab === 'sms' ? <Phone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
          Send via {activeTab === 'sms' ? 'SMS' : 'Email'}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 4: CustomerAssignModal
// ---------------------------------------------------------------------------

export function CustomerAssignModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [inlineError, setInlineError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setDebouncedQuery('');
      setSelectedCustomer(null);
      setShowCreateForm(false);
      setNewName('');
      setNewPhone('');
      setInlineError('');
    }
  }, [isOpen]);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  const { data: customersData, isLoading: searchLoading } = useQuery({
    queryKey: ['customers-search', outletId, debouncedQuery],
    queryFn: () =>
      api.get(`/customers?outlet_id=${outletId}&search=${encodeURIComponent(debouncedQuery)}&limit=10`),
    enabled: isOpen && !!outletId && debouncedQuery.length >= 2,
    select: (res) => res?.data?.customers || res?.customers || res?.data || [],
  });

  const customers = Array.isArray(customersData) ? customersData : [];

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/customers', {
        outlet_id: outletId,
        full_name: newName,
        phone: newPhone,
      }),
    onSuccess: (res) => {
      const created = res?.data || res;
      setSelectedCustomer(created);
      setShowCreateForm(false);
      toast.success('Customer created!');
    },
    onError: (err) => {
      const msg = err?.message || 'Failed to create customer';
      setInlineError(msg);
      toast.error(msg);
    },
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.patch(`/orders/${order.id}/assign-customer`, {
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.full_name,
        customer_phone: selectedCustomer.phone,
      }),
    onSuccess: () => {
      toast.success('Customer linked!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      // If endpoint doesn't exist yet, inform user and still close gracefully
      if (err?.response?.status === 404 || err?.response?.status === 405 ||
          err?.message?.includes('404') || err?.message?.includes('405')) {
        toast.error('Endpoint not available — use POS to assign customer');
      } else {
        const msg = err?.message || 'Failed to assign customer';
        setInlineError(msg);
        toast.error(msg);
      }
    },
  });

  const loyaltyColor = (pts) => {
    if (!pts || pts < 100) return 'var(--text-secondary)';
    if (pts >= 500) return '#f59e0b';
    return '#60a5fa';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link Customer" size="md">
      {!showCreateForm ? (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--text-secondary)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedCustomer(null); setInlineError(''); }}
              placeholder="Search by name or phone…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{
                background: 'var(--bg-hover)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner />
              </div>
            )}
          </div>

          <InlineError message={inlineError} />

          {/* Results */}
          {debouncedQuery.length >= 2 && (
            <div className="space-y-1.5 max-h-52 overflow-y-auto mb-4">
              {customers.length === 0 && !searchLoading ? (
                <p className="text-center text-sm py-4" style={{ color: 'var(--text-secondary)' }}>
                  No customers found
                </p>
              ) : (
                customers.map((c) => {
                  const isSelected = selectedCustomer?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCustomer(isSelected ? null : c)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all"
                      style={{
                        background: isSelected ? 'rgba(99,102,241,0.1)' : 'var(--bg-hover)',
                        borderColor: isSelected ? '#6366f1' : 'var(--border)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
                        >
                          {(c.full_name || c.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {c.full_name || c.name}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {c.phone || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold" style={{ color: loyaltyColor(c.loyalty_points) }}>
                          {c.loyalty_points ?? 0} pts
                        </p>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5 ml-auto" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Create new */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-dashed transition-colors mb-4"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = '#6366f1'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <UserPlus className="w-4 h-4" />
            Create New Customer
          </button>

          <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={() => assignMutation.mutate()}
              disabled={!selectedCustomer}
              loading={assignMutation.isPending}
            >
              <User className="w-4 h-4" />
              Link Customer
            </PrimaryButton>
          </div>
        </>
      ) : (
        /* Create new customer form */
        <>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Quick-create a new customer record
          </p>

          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Full Name *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Customer name"
                className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                style={{
                  background: 'var(--bg-hover)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Phone *
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                style={{
                  background: 'var(--bg-hover)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <InlineError message={inlineError} />

          <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <SecondaryButton onClick={() => setShowCreateForm(false)}>Back</SecondaryButton>
            <PrimaryButton
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || !newPhone.trim()}
              loading={createMutation.isPending}
            >
              <UserPlus className="w-4 h-4" />
              Create & Select
            </PrimaryButton>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 5: WaiterAssignModal
// ---------------------------------------------------------------------------

export function WaiterAssignModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [inlineError, setInlineError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedStaff(null);
      setInlineError('');
    }
  }, [isOpen]);

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ['staff-list', outletId],
    queryFn: () => api.get(`/staff?outlet_id=${outletId}&limit=50`),
    enabled: isOpen && !!outletId,
    select: (res) => res?.data?.staff || res?.staff || res?.data || [],
  });

  const staffList = Array.isArray(staffData) ? staffData : [];

  const assignMutation = useMutation({
    mutationFn: (staffId) =>
      api.patch(`/orders/${order.id}/assign-staff`, { staff_id: staffId }),
    onSuccess: () => {
      toast.success('Waiter assigned!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      if (err?.response?.status === 404 || err?.response?.status === 405 ||
          err?.message?.includes('404') || err?.message?.includes('405')) {
        toast.error('Endpoint not available');
        onClose();
      } else {
        const msg = err?.message || 'Failed to assign waiter';
        setInlineError(msg);
        toast.error(msg);
      }
    },
  });

  const unassignMutation = useMutation({
    mutationFn: () =>
      api.patch(`/orders/${order.id}/assign-staff`, { staff_id: null }),
    onSuccess: () => {
      toast.success('Waiter unassigned!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const msg = err?.message || 'Failed to unassign waiter';
      setInlineError(msg);
      toast.error(msg);
    },
  });

  const currentStaffId = order?.staff_id || order?.assigned_staff_id;
  const isMutating = assignMutation.isPending || unassignMutation.isPending;

  const getInitials = (name = '') =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const avatarColor = (id = '') => {
    const colors = [
      ['rgba(99,102,241,0.2)', '#818cf8'],
      ['rgba(239,68,68,0.2)', '#f87171'],
      ['rgba(34,197,94,0.2)', '#4ade80'],
      ['rgba(249,115,22,0.2)', '#fb923c'],
      ['rgba(168,85,247,0.2)', '#c084fc'],
      ['rgba(20,184,166,0.2)', '#2dd4bf'],
    ];
    const idx = id.charCodeAt(id.length - 1) % colors.length;
    return colors[idx];
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Waiter" size="lg">
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Select a staff member to assign to this order
      </p>

      {currentStaffId && (
        <div className="flex items-center justify-between p-3 rounded-xl mb-4" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: '#4ade80' }}>
            <CheckCircle2 className="w-4 h-4" />
            <span>Waiter currently assigned to this order</span>
          </div>
          <button
            onClick={() => unassignMutation.mutate()}
            disabled={isMutating}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#f87171',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {unassignMutation.isPending ? 'Removing…' : 'Unassign'}
          </button>
        </div>
      )}

      <InlineError message={inlineError} />

      {staffLoading ? (
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Spinner /> Loading staff…
        </div>
      ) : staffList.length === 0 ? (
        <EmptyState icon={Users} message="No staff members found" />
      ) : (
        <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1 mb-6">
          {staffList.map((staff) => {
            const isCurrentlyAssigned = staff.id === currentStaffId;
            const isSelected = selectedStaff?.id === staff.id;
            const [bgColor, textColor] = avatarColor(staff.id || '');

            return (
              <button
                key={staff.id}
                onClick={() => {
                  if (!isCurrentlyAssigned) {
                    setSelectedStaff(isSelected ? null : staff);
                    setInlineError('');
                  }
                }}
                disabled={isMutating}
                className="flex flex-col items-center p-3 rounded-xl border text-center transition-all"
                style={{
                  background: isSelected || isCurrentlyAssigned
                    ? 'rgba(99,102,241,0.1)'
                    : 'var(--bg-hover)',
                  borderColor:
                    isCurrentlyAssigned
                      ? '#4ade80'
                      : isSelected
                      ? '#6366f1'
                      : 'var(--border)',
                  outline: isCurrentlyAssigned ? '2px solid #4ade8040' : 'none',
                  cursor: isMutating ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={e => {
                  if (!isSelected && !isCurrentlyAssigned && !isMutating) {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected && !isCurrentlyAssigned) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }
                }}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-2 relative"
                  style={{ background: bgColor, color: textColor }}
                >
                  {getInitials(staff.full_name || staff.name || '?')}
                  {isCurrentlyAssigned && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                      style={{ background: '#4ade80', borderColor: 'var(--bg-card)' }}
                    >
                      <CheckCircle2 className="w-2 h-2 text-white" />
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold leading-tight truncate w-full" style={{ color: 'var(--text-primary)' }}>
                  {staff.full_name || staff.name || 'Staff'}
                </p>
                <p className="text-xs mt-0.5 truncate w-full" style={{ color: 'var(--text-secondary)' }}>
                  {staff.role || staff.designation || 'Staff'}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <SecondaryButton onClick={onClose} disabled={isMutating}>Cancel</SecondaryButton>
        <PrimaryButton
          onClick={() => assignMutation.mutate(selectedStaff?.id)}
          disabled={!selectedStaff}
          loading={assignMutation.isPending}
        >
          <ChefHat className="w-4 h-4" />
          Assign Waiter
        </PrimaryButton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Named exports (also re-exported individually above via export keyword)
// ---------------------------------------------------------------------------

export { TransferTableModal as default };
