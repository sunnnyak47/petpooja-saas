import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api, { SOCKET_URL } from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { Users, Plus, Trash2, Loader, Eye, CheckCircle, XCircle, Ban } from 'lucide-react';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const STATUS_CONFIG = {
  available: { color: 'border-success-500/50 bg-success-500/10', text: 'text-success-400', label: 'Available' },
  occupied: { color: 'border-brand-500/50 bg-brand-500/10', text: 'text-brand-400', label: 'Occupied' },
  reserved: { color: 'border-blue-500/50 bg-blue-500/10', text: 'text-blue-400', label: 'Reserved' },
  blocked: { color: 'border-surface-500/50 bg-surface-500/10', text: 'text-surface-400', label: 'Inactive' },
  held: { color: 'border-yellow-500/50 bg-yellow-500/10', text: 'text-yellow-400', label: 'Held' },
  part_paid: { color: 'border-orange-500/50 bg-orange-500/10', text: 'text-orange-400', label: 'Part Paid' },
};

export default function TablesPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [formData, setFormData] = useState({ table_number: '', capacity: 4, area_id: '' });
  
  const [voidPin, setVoidPin] = useState('');
  const [voidReason, setVoidReason] = useState('');

  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables', outletId],
    queryFn: () => api.get(`/kitchen/tables?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: areas } = useQuery({
    queryKey: ['tableAreas', outletId],
    queryFn: () => api.get(`/kitchen/table-areas?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });
  
  useEffect(() => {
    if(!outletId) return;
    const s = io(`${SOCKET_URL}/orders`, { 
      transports: ['websocket'],
      withCredentials: true
    });
    s.emit('join_outlet', outletId);
    
    s.on('table_status_change', () => {
       queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
    });
    return () => { s.disconnect(); };
  }, [outletId, queryClient]);

  const addMutation = useMutation({
    mutationFn: (d) => api.post('/kitchen/tables', d),
    onSuccess: () => {
      toast.success('Table added!');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsAddOpen(false);
      setFormData({ table_number: '', capacity: 4, area_id: '' });
    },
    onError: (e) => toast.error(e.message || 'Failed to add table'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/kitchen/tables/${id}`),
    onSuccess: () => {
      toast.success('Table removed!');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsDeleteOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to delete table'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/kitchen/tables/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Table status updated');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsDetailOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to update status'),
  });

  const handleVoidOrder = async () => {
    if(!voidPin) return toast.error('PIN Required');
    if(!voidReason) return toast.error('Reason Required');
    const orderId = selectedTable?.orders?.[0]?.id;
    if(!orderId) return toast.error('No order on this table');

    try {
      await api.post(`/orders/${orderId}/void`, { pin: voidPin, reason: voidReason });
      toast.success('Order Voided Successfully');
      setIsVoidOpen(false);
      setIsDetailOpen(false);
      setVoidPin('');
      setVoidReason('');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    } catch(e) {
      toast.error(e.response?.data?.message || e.message || 'Void failed');
    }
  };

  const tableList = tables || [];
  const counts = {
    total: tableList.length,
    available: tableList.filter(t => t.status === 'available').length,
    occupied: tableList.filter(t => t.status === 'occupied').length,
    held: tableList.filter(t => t.status === 'held').length,
  };

  const openTableDetail = (table) => { setSelectedTable(table); setIsDetailOpen(true); };

  // Timer component 
  function ElapsedTimer({ timestamp }) {
     const [mils, setMils] = useState(Date.now() - new Date(timestamp).getTime());
     useEffect(() => { const i = setInterval(()=>setMils(Date.now() - new Date(timestamp).getTime()), 1000); return ()=>clearInterval(i);}, [timestamp]);
     const hrs = Math.floor(mils/3600000).toString().padStart(2,'0');
     const mins = Math.floor((mils % 3600000) / 60000).toString().padStart(2,'0');
     const secs = Math.floor((mils % 60000) / 1000).toString().padStart(2,'0');
     return `${hrs}:${mins}:${secs}`;
  }

  return (
    <div className="space-y-4 animate-fade-in relative z-0">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Table Floor Plan</h1>
        <button onClick={() => setIsAddOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Table
        </button>
      </div>

      <div className="flex gap-3">
        {[
          { label: 'Total', value: counts.total, color: 'bg-surface-700 text-white' },
          { label: 'Available', value: counts.available, color: 'bg-success-500/20 text-success-400' },
          { label: 'Occupied', value: counts.occupied, color: 'bg-brand-500/20 text-brand-400' },
          { label: 'Held', value: counts.held, color: 'bg-yellow-500/20 text-yellow-400' },
        ].map(s => (
          <div key={s.label} className={`${s.color} px-4 py-2 rounded-xl flex items-center gap-2 border border-current`}>
            <span className="text-lg font-bold">{s.value}</span>
            <span className="text-xs">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
        {isLoading
          ? [...Array(14)].map((_, i) => <div key={i} className="h-32 bg-surface-800 rounded-2xl animate-pulse" />)
          : tableList.map(table => {
              const cfg = STATUS_CONFIG[table.status] || STATUS_CONFIG.available;
              const order = table.orders?.[0];
              return (
                <div key={table.id} className="relative group">
                  <button onClick={() => openTableDetail(table)}
                    className={`w-full h-32 border-2 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-lg ${cfg.color}`}
                  >
                    {table.status === 'held' && <span className="absolute top-2 left-2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 rounded uppercase">Held</span>}
                    <span className="text-2xl font-black text-white">T{table.table_number}</span>
                    <span className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
                    {order && (
                      <div className="text-center mt-1">
                        <span className="block text-[10px] text-surface-400"><ElapsedTimer timestamp={order.created_at} /></span>
                        <span className="block text-sm font-bold text-white mt-0.5">₹{Number(order.grand_total || 0).toFixed(0)}</span>
                      </div>
                    )}
                    {(!order && (table.seating_capacity || table.capacity)) && (
                      <div className="flex items-center gap-1 text-xs text-surface-500 mt-2">
                        <Users className="w-3 h-3" /> {table.seating_capacity || table.capacity}
                      </div>
                    )}
                  </button>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setSelectedTable(table); setIsDeleteOpen(true); }} className="p-1.5 bg-surface-900 border border-surface-700 rounded-lg text-red-400 hover:bg-surface-800"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* Add Table */ }
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Table" size="sm">
         <form onSubmit={e => { e.preventDefault(); addMutation.mutate({ ...formData, capacity: Number(formData.capacity) }); }} className="space-y-4">
             <div><label className="block text-sm font-medium text-surface-300 mb-1">Table Number *</label><input required type="text" className="input w-full" value={formData.table_number} onChange={e => setFormData({ ...formData, table_number: e.target.value })} /></div>
             <div><label className="block text-sm font-medium text-surface-300 mb-1">Capacity</label><input required type="number" min="1" className="input w-full" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: e.target.value })} /></div>
             {areas?.length > 0 && (
                <div><label className="block text-sm text-surface-300 mb-1">Area</label><select className="input w-full" value={formData.area_id} onChange={e=>setFormData({...formData, area_id: e.target.value})}><option value="">No Specific Area</option>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
             )}
             <div className="pt-4 flex gap-2"><button type="button" onClick={()=>setIsAddOpen(false)} className="btn-ghost flex-1">Cancel</button><button type="submit" disabled={addMutation.isPending} className="btn-primary flex-1">Save</button></div>
         </form>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title={`Table T${selectedTable?.table_number} Controls`} size="sm">
        {selectedTable && (
          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <div className="flex-1 bg-surface-800 p-3 rounded-xl text-center border-l-4 border-l-brand-500">
                <p className="text-xs text-surface-500">Status</p>
                <p className={`text-sm font-bold mt-1 ${(STATUS_CONFIG[selectedTable.status] || STATUS_CONFIG.available).text}`}>{(STATUS_CONFIG[selectedTable.status] || STATUS_CONFIG.available).label}</p>
              </div>
              <div className="flex-1 bg-surface-800 p-3 rounded-xl text-center border-l-4 border-l-surface-500">
                <p className="text-xs text-surface-500">Capacity</p>
                <p className="text-sm font-bold text-white mt-1">{selectedTable.seating_capacity || selectedTable.capacity} persons</p>
              </div>
            </div>

            {selectedTable.orders?.[0] && (
               <button onClick={() => { setIsDetailOpen(false); setIsVoidOpen(true); }} className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors">
                  <Ban className="w-4 h-4"/> VOID ORDER
               </button>
            )}

            <div className="pt-4 border-t border-surface-800">
              <p className="text-xs text-surface-500 mb-2 font-bold uppercase">Manual Overrides</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => statusMutation.mutate({ id: selectedTable.id, status: 'available' })} className="py-2 rounded-lg bg-surface-800 hover:bg-success-500/20 text-success-400 text-sm font-medium transition-colors">Mark Free</button>
                <button onClick={() => statusMutation.mutate({ id: selectedTable.id, status: 'reserved' })} className="py-2 rounded-lg bg-surface-800 hover:bg-blue-500/20 text-blue-400 text-sm font-medium transition-colors">Reserve</button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Void Modal (A3) */}
      <Modal isOpen={isVoidOpen} onClose={() => setIsVoidOpen(false)} title="Void Order (Manager PIN Required)" size="sm">
         <div className="space-y-4 mt-2">
            <div>
               <label className="block text-sm text-surface-400 mb-1">Manager PIN</label>
               <input type="password" maxLength={4} className="input w-full text-center text-3xl tracking-[1em]" placeholder="****" value={voidPin} onChange={e=>setVoidPin(e.target.value)} autoFocus />
            </div>
            <div>
               <label className="block text-sm text-surface-400 mb-1">Reason for Void</label>
               <textarea className="input w-full resize-none text-sm h-16" placeholder="Customer left abruptly..." value={voidReason} onChange={e=>setVoidReason(e.target.value)} />
            </div>
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex items-start gap-2 text-xs text-red-400">
               <Ban className="w-4 h-4 shrink-0" />
               <p>Warning: This action is permanent and will be recorded in the audit logs.</p>
            </div>
            <div className="flex gap-2 pt-2">
               <button onClick={() => setIsVoidOpen(false)} className="btn-surface flex-1">Cancel</button>
               <button onClick={handleVoidOrder} className="btn-primary bg-red-500 hover:bg-red-600 flex-1">Confirm Void</button>
            </div>
         </div>
      </Modal>

      <ConfirmDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={() => deleteMutation.mutate(selectedTable?.id)} title="Remove Table" message={`Remove Table T${selectedTable?.table_number}?`} isLoading={deleteMutation.isPending} />
    </div>
  );
}
