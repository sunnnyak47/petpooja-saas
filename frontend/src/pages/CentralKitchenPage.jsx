import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import {
  ChefHat, Plus, Send, CheckCircle, XCircle, Truck, PackageCheck,
  Clock, Filter, RefreshCw, Eye, Trash2, ArrowRight, Building2,
  Search, Package
} from 'lucide-react';

// ─── Status config ─────────────────────────────────────────────
const STATUS = {
  pending:    { label: 'Pending',    color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  approved:   { label: 'Approved',   color: 'bg-blue-100 text-blue-700 border-blue-200',      icon: CheckCircle },
  dispatched: { label: 'Dispatched', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Truck },
  received:   { label: 'Received',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: PackageCheck },
  rejected:   { label: 'Rejected',   color: 'bg-red-100 text-red-700 border-red-200',         icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

// ─── Create Requisition Modal ───────────────────────────────────
function CreateIndentModal({ isOpen, onClose, outlets, onSuccess }) {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;

  const [ckOutletId, setCkOutletId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ inventory_item_id: '', name: '', requested_quantity: '', unit: 'kg', notes: '' }]);
  const [search, setSearch] = useState('');

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['ck-inventory', ckOutletId],
    queryFn: () => ckOutletId ? api.get(`/ck/inventory/${ckOutletId}`).then(r => r.data.data) : [],
    enabled: !!ckOutletId,
  });

  const filtered = useMemo(() =>
    inventoryItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    [inventoryItems, search]
  );

  const mutation = useMutation({
    mutationFn: (body) => api.post('/ck/indents', body),
    onSuccess: () => { toast.success('Requisition created ✓'); onSuccess(); onClose(); reset(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to create'),
  });

  function reset() {
    setCkOutletId(''); setNotes(''); setSearch('');
    setItems([{ inventory_item_id: '', name: '', requested_quantity: '', unit: 'kg', notes: '' }]);
  }

  function addItem() {
    setItems(p => [...p, { inventory_item_id: '', name: '', requested_quantity: '', unit: 'kg', notes: '' }]);
  }

  function removeItem(idx) {
    setItems(p => p.filter((_, i) => i !== idx));
  }

  function updateItem(idx, key, val) {
    setItems(p => p.map((item, i) => i === idx ? { ...item, [key]: val } : item));
  }

  function selectInventoryItem(idx, invItem) {
    updateItem(idx, 'inventory_item_id', invItem.id);
    updateItem(idx, 'name', invItem.name);
    updateItem(idx, 'unit', invItem.unit);
    setSearch('');
  }

  function submit() {
    if (!ckOutletId) return toast.error('Select central kitchen');
    const validItems = items.filter(i => i.inventory_item_id && parseFloat(i.requested_quantity) > 0);
    if (validItems.length === 0) return toast.error('Add at least one item with quantity');
    mutation.mutate({
      requesting_outlet_id: outletId,
      ck_outlet_id: ckOutletId,
      notes,
      items: validItems.map(i => ({
        inventory_item_id: i.inventory_item_id,
        requested_quantity: parseFloat(i.requested_quantity),
        unit: i.unit,
        notes: i.notes || undefined,
      })),
    });
  }

  // Show all outlets — the CK can be any branch that acts as a central kitchen
  const allOutlets = outlets;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Material Requisition" size="lg">
      <div className="space-y-4">
        {/* Central kitchen selector */}
        <div>
          <label className="label">Request From (Central Kitchen / Branch)</label>
          {allOutlets.length === 0 ? (
            <div className="input text-surface-500 text-sm">Loading outlets… (ensure backend /ck/outlets is returning data)</div>
          ) : (
            <select className="input" value={ckOutletId} onChange={e => setCkOutletId(e.target.value)}>
              <option value="">— Select source outlet —</option>
              {allOutlets.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.id === outletId ? ' (This Outlet)' : ''}
                </option>
              ))}
            </select>
          )}
          {allOutlets.length > 0 && !ckOutletId && (
            <p className="text-xs text-amber-400 mt-1">Select which outlet/central kitchen will supply the goods</p>
          )}
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Items Requested</label>
            <button onClick={addItem} className="btn-sm btn-primary">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>

          {/* Inventory search */}
          {ckOutletId && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <input className="input pl-9" placeholder="Search inventory items…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && filtered.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-auto max-h-44"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  {filtered.map(inv => (
                    <button key={inv.id} onClick={() => {
                      const emptyIdx = items.findIndex(i => !i.inventory_item_id);
                      selectInventoryItem(emptyIdx >= 0 ? emptyIdx : items.length - 1, inv);
                    }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                      style={{ color: 'var(--text-primary)' }}>
                      <span>{inv.name}</span>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{inv.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center p-2 rounded-lg border"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                <div className="flex-1 min-w-0">
                  {item.inventory_item_id ? (
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                  ) : (
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Search & select item above</span>
                  )}
                </div>
                <input
                  type="number" min="0" step="0.001"
                  className="input w-24 text-right"
                  placeholder="Qty"
                  value={item.requested_quantity}
                  onChange={e => updateItem(idx, 'requested_quantity', e.target.value)}
                />
                <span className="text-sm font-medium w-10 text-center" style={{ color: 'var(--text-secondary)' }}>
                  {item.unit}
                </span>
                <button onClick={() => removeItem(idx)} className="btn-ghost btn-sm p-1">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input resize-none" rows={2} value={notes}
            onChange={e => setNotes(e.target.value)} placeholder="Any special instructions…" />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={submit} disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Send className="w-4 h-4" />
            {mutation.isPending ? 'Sending…' : 'Send Requisition'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Indent Detail / Action Modal ──────────────────────────────
function IndentDetailModal({ isOpen, onClose, indent, onAction }) {
  const [approvedQtys, setApprovedQtys] = useState({});
  const [dispatchedQtys, setDispatchedQtys] = useState({});
  const [rejectReason, setRejectReason] = useState('');
  const [actionView, setActionView] = useState(null); // 'approve' | 'dispatch' | 'reject'
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => api.patch(`/ck/indents/${indent.id}/approve`, {
      items: indent.items.map(i => ({ id: i.id, approved_quantity: parseFloat(approvedQtys[i.id] ?? i.requested_quantity) })),
    }),
    onSuccess: () => { toast.success('Indent approved ✓'); queryClient.invalidateQueries({ queryKey: ['ck-indents'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const dispatchMutation = useMutation({
    mutationFn: () => api.patch(`/ck/indents/${indent.id}/dispatch`, {
      items: indent.items.map(i => ({ id: i.id, dispatched_quantity: parseFloat(dispatchedQtys[i.id] ?? i.approved_quantity ?? i.requested_quantity) })),
    }),
    onSuccess: () => { toast.success('Dispatched ✓'); queryClient.invalidateQueries({ queryKey: ['ck-indents'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const receiveMutation = useMutation({
    mutationFn: () => api.patch(`/ck/indents/${indent.id}/receive`, {}),
    onSuccess: () => { toast.success('Receipt confirmed ✓'); queryClient.invalidateQueries({ queryKey: ['ck-indents'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.patch(`/ck/indents/${indent.id}/reject`, { reason: rejectReason }),
    onSuccess: () => { toast.success('Indent rejected'); queryClient.invalidateQueries({ queryKey: ['ck-indents'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  if (!indent) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Indent ${indent.indent_number}`} size="lg">
      <div className="space-y-4">
        {/* Header info */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>FROM BRANCH</p>
            <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Building2 className="w-3.5 h-3.5" />{indent.requesting_outlet?.name}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>TO CENTRAL KITCHEN</p>
            <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <ChefHat className="w-3.5 h-3.5" />{indent.ck_outlet?.name}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>STATUS</p>
            <StatusBadge status={indent.status} />
          </div>
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>DATE</p>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {new Date(indent.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {indent.notes && (
          <p className="text-sm px-3 py-2 rounded-lg border italic"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
            {indent.notes}
          </p>
        )}

        {/* Items table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-hover)' }}>
                <th className="text-left px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>ITEM</th>
                <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>REQUESTED</th>
                {(indent.status === 'approved' || indent.status === 'dispatched' || indent.status === 'received') && (
                  <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>APPROVED</th>
                )}
                {(indent.status === 'dispatched' || indent.status === 'received') && (
                  <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>DISPATCHED</th>
                )}
                {actionView === 'approve' && (
                  <th className="text-right px-3 py-2 text-xs font-semibold text-blue-600">APPROVE QTY</th>
                )}
                {actionView === 'dispatch' && (
                  <th className="text-right px-3 py-2 text-xs font-semibold text-purple-600">DISPATCH QTY</th>
                )}
              </tr>
            </thead>
            <tbody>
              {indent.items?.map((item, idx) => (
                <tr key={item.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.inventory_item?.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.unit}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {parseFloat(item.requested_quantity)} {item.unit}
                  </td>
                  {(indent.status === 'approved' || indent.status === 'dispatched' || indent.status === 'received') && (
                    <td className="px-3 py-2.5 text-right text-blue-600 font-semibold">
                      {item.approved_quantity ? `${parseFloat(item.approved_quantity)} ${item.unit}` : '—'}
                    </td>
                  )}
                  {(indent.status === 'dispatched' || indent.status === 'received') && (
                    <td className="px-3 py-2.5 text-right text-purple-600 font-semibold">
                      {item.dispatched_quantity ? `${parseFloat(item.dispatched_quantity)} ${item.unit}` : '—'}
                    </td>
                  )}
                  {actionView === 'approve' && (
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" min="0" step="0.001"
                        className="input w-24 text-right text-sm"
                        defaultValue={parseFloat(item.requested_quantity)}
                        onChange={e => setApprovedQtys(p => ({ ...p, [item.id]: e.target.value }))} />
                    </td>
                  )}
                  {actionView === 'dispatch' && (
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" min="0" step="0.001"
                        className="input w-24 text-right text-sm"
                        defaultValue={parseFloat(item.approved_quantity || item.requested_quantity)}
                        onChange={e => setDispatchedQtys(p => ({ ...p, [item.id]: e.target.value }))} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reject reason */}
        {actionView === 'reject' && (
          <div>
            <label className="label">Rejection Reason</label>
            <textarea className="input resize-none" rows={2}
              value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…" />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap pt-1">
          {/* CK view — pending */}
          {indent.status === 'pending' && !actionView && (
            <>
              <button onClick={() => setActionView('approve')}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button onClick={() => setActionView('reject')}
                className="btn-danger flex-1 flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </>
          )}

          {/* Approve confirm */}
          {actionView === 'approve' && (
            <>
              <button onClick={() => setActionView(null)} className="btn-ghost flex-1">Back</button>
              <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {approveMutation.isPending ? 'Approving…' : 'Confirm Approve'}
              </button>
            </>
          )}

          {/* CK dispatches */}
          {indent.status === 'approved' && !actionView && (
            <>
              <button onClick={() => setActionView('dispatch')}
                className="flex-1 btn flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Truck className="w-4 h-4" /> Dispatch
              </button>
              <button onClick={() => setActionView('reject')}
                className="btn-danger flex-1 flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </>
          )}

          {/* Dispatch confirm */}
          {actionView === 'dispatch' && (
            <>
              <button onClick={() => setActionView(null)} className="btn-ghost flex-1">Back</button>
              <button onClick={() => dispatchMutation.mutate()} disabled={dispatchMutation.isPending}
                className="flex-1 btn flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Truck className="w-4 h-4" />
                {dispatchMutation.isPending ? 'Dispatching…' : 'Confirm Dispatch'}
              </button>
            </>
          )}

          {/* Branch confirms receipt */}
          {indent.status === 'dispatched' && (
            <button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending}
              className="btn-success flex-1 flex items-center justify-center gap-2">
              <PackageCheck className="w-4 h-4" />
              {receiveMutation.isPending ? 'Confirming…' : 'Confirm Receipt'}
            </button>
          )}

          {/* Reject confirm */}
          {actionView === 'reject' && (
            <>
              <button onClick={() => setActionView(null)} className="btn-ghost flex-1">Back</button>
              <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}
                className="btn-danger flex-1 flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4" />
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </>
          )}

          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function CentralKitchenPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('branch'); // 'branch' | 'ck'
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIndent, setSelectedIndent] = useState(null);

  // Fetch outlets
  const { data: outlets = [] } = useQuery({
    queryKey: ['ck-outlets'],
    queryFn: () => api.get('/ck/outlets').then(r => r.data.data || []),
  });

  // Fetch indents
  const { data: indents = [], isLoading, refetch } = useQuery({
    queryKey: ['ck-indents', tab, statusFilter, outletId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab === 'ck') { params.set('role', 'ck'); params.set('outlet_id', outletId); }
      else params.set('outlet_id', outletId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      return api.get(`/ck/indents?${params}`).then(r => r.data.data || []);
    },
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  // Stats
  const stats = useMemo(() => ({
    total: indents.length,
    pending: indents.filter(i => i.status === 'pending').length,
    dispatched: indents.filter(i => i.status === 'dispatched').length,
    received: indents.filter(i => i.status === 'received').length,
  }), [indents]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ChefHat className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            Central Kitchen
          </h1>
          <p className="page-subtitle">Raw material requisitions · Dispatch tracking · Stock transfers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost btn-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Requisition
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'var(--accent)', bg: 'bg-blue-50' },
          { label: 'Pending', value: stats.pending, color: '#d97706', bg: 'bg-amber-50' },
          { label: 'Dispatched', value: stats.dispatched, color: '#7c3aed', bg: 'bg-purple-50' },
          { label: 'Received', value: stats.received, color: '#16a34a', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
              <Package className="w-5 h-5" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
          <button onClick={() => setTab('branch')}
            className={tab === 'branch' ? 'tab-btn-active' : 'tab-btn'}>
            My Branch Requests
          </button>
          <button onClick={() => setTab('ck')}
            className={tab === 'ck' ? 'tab-btn-active' : 'tab-btn'}>
            Incoming to My Outlet
          </button>
        </div>

        <div className="flex gap-1 flex-wrap">
          {['all', 'pending', 'approved', 'dispatched', 'received', 'rejected'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={statusFilter === s ? 'tab-btn-active' : 'tab-btn'}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Indents list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : indents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 card">
          <ChefHat className="w-12 h-12" style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No requisitions found
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> Create First Requisition
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {indents.map(indent => (
            <div key={indent.id} className="card-hover flex items-center gap-4"
              onClick={() => setSelectedIndent(indent)}>

              {/* Indent number + status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm font-mono" style={{ color: 'var(--accent)' }}>
                    {indent.indent_number}
                  </span>
                  <StatusBadge status={indent.status} />
                </div>
                <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{indent.requesting_outlet?.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                  <ChefHat className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{indent.ck_outlet?.name}</span>
                </div>
              </div>

              {/* Item count */}
              <div className="text-center hidden sm:block">
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{indent.total_items}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>items</p>
              </div>

              {/* Date */}
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {new Date(indent.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {new Date(indent.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <Eye className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateIndentModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        outlets={outlets}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['ck-indents'] })}
      />

      {selectedIndent && (
        <IndentDetailModal
          isOpen={!!selectedIndent}
          onClose={() => setSelectedIndent(null)}
          indent={selectedIndent}
          onAction={() => queryClient.invalidateQueries({ queryKey: ['ck-indents'] })}
        />
      )}
    </div>
  );
}
