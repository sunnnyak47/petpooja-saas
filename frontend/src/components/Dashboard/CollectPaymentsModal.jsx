/**
 * @fileoverview Collect Payments popup — lists occupied tables with an open bill,
 * searchable, with a one-tap Collect that bills the order and opens POS payment.
 * Avoids the detour through the Tables floor view.
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, CreditCard, Clock } from 'lucide-react';
import Modal from '../Modal';
import api from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import toast from 'react-hot-toast';

const minsAgo = (iso) => {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function CollectPaymentsModal({ isOpen, onClose, outletId }) {
  const navigate = useNavigate();
  const { format, symbol } = useCurrency();
  const [search, setSearch] = useState('');

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['collect-tables', outletId],
    queryFn: () => api.get(`/kitchen/tables?outlet_id=${outletId}&status=occupied`),
    enabled: isOpen && !!outletId,
    refetchInterval: 15_000,
    select: (res) => (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])),
  });

  const collectMut = useMutation({
    mutationFn: (orderId) => api.post(`/orders/${orderId}/bill`, { outlet_id: outletId }),
    onSuccess: (_d, orderId) => { onClose(); navigate(`/pos?order_id=${orderId}&pay=true`); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not start payment'),
  });

  // Only tables with an active (unpaid) order, matched against the search box.
  const q = search.trim().toLowerCase();
  const rows = tables
    .filter((t) => t.orders?.[0])
    .filter((t) => {
      if (!q) return true;
      const o = t.orders[0];
      return [t.table_number, o.order_number, t.area?.name, String(o.grand_total)]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Collect Payments" size="lg">
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <Search className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search table, order #, area or amount…"
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading occupied tables…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {search ? 'No tables match your search' : 'No occupied tables with open bills'}
            </p>
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
            {rows.map((t) => {
              const o = t.orders[0];
              return (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm shrink-0"
                    style={{ background: 'var(--accent)18', color: 'var(--accent)' }}>
                    T{t.table_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      #{(o.order_number || '').split('-').pop() || o.order_number}
                      {t.area?.name && <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>{t.area.name}</span>}
                    </p>
                    <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <Clock className="w-3 h-3" /> {minsAgo(o.created_at)} · {o.status}
                    </p>
                  </div>
                  <span className="text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{format(o.grand_total)}</span>
                  <button
                    onClick={() => collectMut.mutate(o.id)}
                    disabled={collectMut.isPending}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0 disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}>
                    Collect
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-center" style={{ color: 'var(--text-secondary)' }}>
          {rows.length} table{rows.length === 1 ? '' : 's'} awaiting payment · amounts shown in {symbol}
        </p>
      </div>
    </Modal>
  );
}
