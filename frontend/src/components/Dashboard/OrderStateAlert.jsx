/**
 * @fileoverview Order State Alert — live dashboard pipeline of open orders moving
 * Confirmed → Ready → Served → Paid, with stuck-order alerts. "Served" is derived
 * server-side from KOT statuses (see dashboard.controller.getOrderPipeline).
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { Activity, ChefHat, CheckCircle2, HandPlatter, CreditCard, AlertTriangle } from 'lucide-react';
import api, { SOCKET_URL } from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import OrderPipelineModal from './OrderPipelineModal';

const STAGES = [
  { key: 'confirmed', label: 'Confirmed', sub: 'In kitchen',       color: '#d97706', Icon: ChefHat },
  { key: 'ready',     label: 'Ready',     sub: 'Food up',          color: '#2563eb', Icon: CheckCircle2 },
  { key: 'served',    label: 'Served',    sub: 'Awaiting payment', color: '#8b5cf6', Icon: HandPlatter },
  { key: 'paid',      label: 'Paid',      sub: 'Today',            color: '#16a34a', Icon: CreditCard },
];

export default function OrderStateAlert() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [openStage, setOpenStage] = useState(null); // which stage's drill-down popup is open

  const { data, isLoading } = useQuery({
    queryKey: ['order-pipeline', outletId],
    queryFn: () => api.get(`/dashboard/order-pipeline?outlet_id=${outletId}`),
    enabled: !!outletId,
    refetchInterval: 20_000,
    select: (res) => res?.data ?? res,
  });

  // Live refresh: any order status change in this outlet re-fetches the pipeline.
  useEffect(() => {
    if (!outletId) return;
    const socket = io(`${SOCKET_URL}/orders`, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket'],
      withCredentials: true,
    });
    socket.on('connect', () => socket.emit('join_outlet', outletId));
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['order-pipeline', outletId] });
    socket.on('order_status_change', refresh);
    socket.on('new_order', refresh);
    socket.on('order_complete', refresh);
    return () => socket.disconnect();
  }, [outletId, queryClient]);

  const stages = data?.stages || {};
  const totalOpen = ['confirmed', 'ready', 'served'].reduce((n, k) => n + (stages[k]?.count || 0), 0);
  const alertCount = ['confirmed', 'ready', 'served'].reduce(
    (n, k) => n + (stages[k]?.orders || []).filter((o) => o.alert).length, 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Order Pipeline</p>
          {alertCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: '#ef444418', color: '#ef4444' }}>
              <AlertTriangle className="w-3 h-3" /> {alertCount} stuck
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
          {totalOpen} open
        </span>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading pipeline…</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STAGES.map(({ key, label, sub, color, Icon }) => {
            const stage = stages[key] || { count: 0, orders: [] };
            const top = stage.orders?.[0]; // most-stuck order in this stage
            const hasAlert = (stage.orders || []).some((o) => o.alert);
            return (
              <button
                key={key}
                onClick={() => setOpenStage(key)}
                className="text-left rounded-xl p-3 border transition-all hover:shadow-sm"
                style={{
                  background: hasAlert ? '#ef44440d' : 'var(--bg-card)',
                  borderColor: hasAlert ? '#ef444455' : 'var(--border)',
                }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
                  </div>
                  <span className="text-xl font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{stage.count}</span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{sub}</p>

                {key !== 'paid' && top && (
                  <div className="mt-2 pt-2 border-t flex items-center gap-1" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[11px] font-medium truncate" style={{ color: top.alert ? '#ef4444' : 'var(--text-secondary)' }}>
                      {top.table_number ? `T${top.table_number}` : `#${(top.order_number || '').split('-').pop()}`} · {top.stuck_mins}m
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Drill-down popup — list of orders in the clicked stage → order detail (history + served/pending). */}
      {openStage && (
        <OrderPipelineModal
          isOpen={!!openStage}
          onClose={() => setOpenStage(null)}
          stageKey={openStage}
          stageLabel={STAGES.find((s) => s.key === openStage)?.label || ''}
          color={STAGES.find((s) => s.key === openStage)?.color}
          orders={stages[openStage]?.orders || []}
          format={format}
        />
      )}
    </div>
  );
}
