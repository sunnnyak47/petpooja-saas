/**
 * useCentralKitchen — data layer for the "Indents & supply" screen (mobile).
 *
 * Central-kitchen indents move stock between a branch and its commissary:
 *   pending → approved → dispatched → received   (or → rejected)
 *
 * The mobile screen monitors + FULFILS indents (create/requisition, which needs
 * a multi-item picker, stays on the web dashboard). Two views:
 *   • mine     — indents this outlet REQUESTED (branch confirms receipt)
 *   • incoming — indents directed TO this outlet as the CK (approve/dispatch/reject)
 *
 * Endpoints (backend central-kitchen/ck.*), all auth'd:
 *   GET   /ck/indents?outlet_id=&status=&role=ck   → indents[] (items included)
 *   PATCH /ck/indents/:id/approve   { items:[{item_id, approved_quantity}] }
 *   PATCH /ck/indents/:id/dispatch  { items:[{item_id, dispatched_quantity}] }
 *   PATCH /ck/indents/:id/receive   (no body)
 *   PATCH /ck/indents/:id/reject    { reason }
 *
 * Pure helpers (status/action logic, payload builders) are unit-tested.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

export const CK_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DISPATCHED: 'dispatched',
  RECEIVED: 'received',
  REJECTED: 'rejected',
};

const num = (v) => Number(v) || 0;

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

export function indentNumber(indent = {}) {
  return String(indent.indent_number ?? indent.number ?? (indent.id ? `#${String(indent.id).slice(0, 8)}` : ''));
}

export function itemCount(indent = {}) {
  return Array.isArray(indent.items) ? indent.items.length : 0;
}

export function itemName(line = {}) {
  return line.inventory_item?.name || line.name || 'Item';
}

export function itemUnit(line = {}) {
  return line.unit || line.inventory_item?.unit || '';
}

/**
 * The actions available for an indent, given the current view/role.
 * incoming (I am the CK): pending → approve/reject · approved → dispatch
 * mine (I am the branch): dispatched → receive
 */
export function nextActions(status, view) {
  if (view === 'incoming') {
    if (status === CK_STATUS.PENDING) return ['approve', 'reject'];
    if (status === CK_STATUS.APPROVED) return ['dispatch'];
    return [];
  }
  if (status === CK_STATUS.DISPATCHED) return ['receive'];
  return [];
}

/** Approve every line at the requested quantity. */
export function approveItemsPayload(indent = {}) {
  const items = (indent.items || []).map((i) => ({ item_id: i.id, approved_quantity: num(i.requested_quantity) }));
  return { items };
}

/** Dispatch every line at its approved quantity (falls back to requested). */
export function dispatchItemsPayload(indent = {}) {
  const items = (indent.items || []).map((i) => ({
    item_id: i.id,
    dispatched_quantity: num(i.approved_quantity != null ? i.approved_quantity : i.requested_quantity),
  }));
  return { items };
}

export function filterIndents(rows = [], status = 'all') {
  const list = Array.isArray(rows) ? rows : [];
  return status === 'all' ? list : list.filter((i) => i.status === status);
}

export function summarizeIndents(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const by = (st) => list.filter((i) => i.status === st).length;
  return {
    total: list.length,
    pending: by(CK_STATUS.PENDING),
    inTransit: by(CK_STATUS.APPROVED) + by(CK_STATUS.DISPATCHED),
    received: by(CK_STATUS.RECEIVED),
    rejected: by(CK_STATUS.REJECTED),
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const CK_KEY = (outletId, view) => ['ck-indents', outletId, view];

export function useCentralKitchen(view = 'mine') {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: CK_KEY(outletId, view),
    enabled: !!outletId,
    staleTime: 20_000,
    queryFn: async () => {
      const res = await api.get('/ck/indents', {
        params: { outlet_id: outletId, ...(view === 'incoming' ? { role: 'ck' } : {}) },
      });
      return Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ck-indents'] });

  const approveMut = useMutation({ mutationFn: (indent) => api.patch(`/ck/indents/${indent.id}/approve`, approveItemsPayload(indent)), onSuccess: invalidate });
  const dispatchMut = useMutation({ mutationFn: (indent) => api.patch(`/ck/indents/${indent.id}/dispatch`, dispatchItemsPayload(indent)), onSuccess: invalidate });
  const receiveMut = useMutation({ mutationFn: (indent) => api.patch(`/ck/indents/${indent.id}/receive`, {}), onSuccess: invalidate });
  const rejectMut = useMutation({ mutationFn: ({ indent, reason }) => api.patch(`/ck/indents/${indent.id}/reject`, { reason }), onSuccess: invalidate });

  return {
    outletId,
    indents: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    approve: (indent) => approveMut.mutateAsync(indent),
    dispatch: (indent) => dispatchMut.mutateAsync(indent),
    receive: (indent) => receiveMut.mutateAsync(indent),
    reject: (indent, reason) => rejectMut.mutateAsync({ indent, reason }),
    isActing: approveMut.isPending || dispatchMut.isPending || receiveMut.isPending || rejectMut.isPending,
    hasOutlet: !!outletId,
  };
}
