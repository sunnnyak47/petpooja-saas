import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import {
  CreditCard, Search, Download,
  DollarSign, Wallet, Banknote,
  TrendingUp, Receipt, RotateCcw
} from 'lucide-react';

const METHOD_ICONS = {
  cash: <Banknote className="w-4 h-4" />,
  card: <CreditCard className="w-4 h-4" />,
  upi: <Wallet className="w-4 h-4" />,
  split: <DollarSign className="w-4 h-4" />,
  online_prepaid: <TrendingUp className="w-4 h-4" />,
};

const METHOD_COLORS = {
  cash: 'bg-emerald-500/20 text-emerald-400',
  card: 'bg-blue-500/20 text-blue-400',
  upi: 'bg-purple-500/20 text-purple-400',
  split: 'bg-orange-500/20 text-orange-400',
  due: 'bg-red-500/20 text-red-400',
  online_prepaid: 'bg-teal-500/20 text-teal-400',
};

/**
 * M6: Payment Processing — Transaction History, Refunds, and Settlement Summary.
 */
export default function PaymentsPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [dateRange, setDateRange] = useState('today');
  const [methodFilter, setMethodFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [managerPin, setManagerPin] = useState('');

  const getDateParams = () => {
    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    switch (dateRange) {
      case 'today': return `&from=${fmt(today)}&to=${fmt(today)}`;
      case 'week': {
        const w = new Date(today);
        w.setDate(w.getDate() - 7);
        return `&from=${fmt(w)}&to=${fmt(today)}`;
      }
      case 'month': {
        const m = new Date(today);
        m.setDate(1);
        return `&from=${fmt(m)}&to=${fmt(today)}`;
      }
      default: return '';
    }
  };

  const { data: orders, isLoading } = useQuery({
    queryKey: ['payments', outletId, dateRange, methodFilter],
    queryFn: () => api.get(`/orders?outlet_id=${outletId}&status=paid&limit=200${getDateParams()}`).then(r => r.data || r),
    enabled: !!outletId,
  });

  const refundMutation = useMutation({
    mutationFn: (data) => api.post(`/orders/${data.orderId}/refund`, {
      reason: data.reason,
      manager_pin: data.pin,
      outlet_id: outletId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Refund processed successfully');
      setShowRefundModal(false);
      setSelectedPayment(null);
      setRefundReason('');
      setManagerPin('');
    },
    onError: (e) => toast.error(e.message),
  });

  const allOrders = useMemo(() => {
    let list = Array.isArray(orders) ? orders : [];
    if (methodFilter !== 'all') {
      list = list.filter(o => o.payments?.some(p => p.method === methodFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.invoice_number?.toLowerCase().includes(q) ||
        o.customer?.full_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, methodFilter, search]);

  const stats = useMemo(() => {
    const total = allOrders.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
    const cash = allOrders.filter(o => o.payments?.some(p => p.method === 'cash')).reduce((s, o) => s + Number(o.grand_total || 0), 0);
    const card = allOrders.filter(o => o.payments?.some(p => p.method === 'card')).reduce((s, o) => s + Number(o.grand_total || 0), 0);
    const upi = allOrders.filter(o => o.payments?.some(p => p.method === 'upi')).reduce((s, o) => s + Number(o.grand_total || 0), 0);
    return { total, cash, card, upi, count: allOrders.length };
  }, [allOrders]);

  const exportCSV = () => {
    const rows = [['Order#', 'Invoice', 'Amount', 'Method', 'Date', 'Customer']];
    allOrders.forEach(o => {
      rows.push([
        o.order_number, o.invoice_number || '', o.grand_total,
        o.payments?.[0]?.method || '', new Date(o.created_at).toLocaleDateString(),
        o.customer?.full_name || 'Walk-in',
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported!');
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <CreditCard className="w-7 h-7 text-brand-400" />
            Payment Transactions
          </h1>
          <p className="text-sm text-surface-400 mt-1">Track all payment activity, settlements, and refunds</p>
        </div>
        <button onClick={exportCSV} className="btn-primary flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Revenue', value: `₹${stats.total.toLocaleString()}`, icon: <TrendingUp className="w-5 h-5" />, color: 'text-brand-400' },
          { label: 'Transactions', value: stats.count, icon: <Receipt className="w-5 h-5" />, color: 'text-blue-400' },
          { label: 'Cash', value: `₹${stats.cash.toLocaleString()}`, icon: <Banknote className="w-5 h-5" />, color: 'text-emerald-400' },
          { label: 'Card', value: `₹${stats.card.toLocaleString()}`, icon: <CreditCard className="w-5 h-5" />, color: 'text-blue-400' },
          { label: 'UPI', value: `₹${stats.upi.toLocaleString()}`, icon: <Wallet className="w-5 h-5" />, color: 'text-purple-400' },
        ].map((s, i) => (
          <div key={i} className="bg-surface-900 rounded-2xl p-4 border border-surface-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-surface-400 uppercase font-bold tracking-wider">{s.label}</span>
              <span className={s.color}>{s.icon}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-64" placeholder="Search order #, invoice, customer..." />
        </div>
        <div className="flex bg-surface-800 rounded-xl p-1 gap-1">
          {['today', 'week', 'month', 'all'].map((d) => (
            <button key={d} onClick={() => setDateRange(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${dateRange === d ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex bg-surface-800 rounded-xl p-1 gap-1">
          {['all', 'cash', 'card', 'upi', 'split'].map((m) => (
            <button key={m} onClick={() => setMethodFilter(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${methodFilter === m ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="flex-1 overflow-y-auto bg-surface-900 rounded-2xl border border-surface-800">
        <table className="w-full">
          <thead className="sticky top-0 bg-surface-900 z-10">
            <tr className="text-left text-xs text-surface-400 uppercase tracking-wider border-b border-surface-800">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800/50">
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-surface-500">Loading transactions...</td></tr>
            ) : allOrders.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-surface-500">No transactions found</td></tr>
            ) : allOrders.map((o) => (
              <tr key={o.id} className="hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm font-bold text-white">#{o.order_number}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-surface-300 font-mono">{o.invoice_number || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-surface-300">{o.customer?.full_name || 'Walk-in'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${METHOD_COLORS[o.payments?.[0]?.method] || 'bg-surface-700 text-surface-300'}`}>
                    {METHOD_ICONS[o.payments?.[0]?.method]}
                    {o.payments?.[0]?.method?.toUpperCase() || 'N/A'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-brand-400">₹{Number(o.grand_total).toLocaleString()}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-surface-400">{new Date(o.created_at).toLocaleDateString()}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => { setSelectedPayment(o); setShowRefundModal(true); }}
                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all" title="Refund">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Refund Modal */}
      <Modal isOpen={showRefundModal} onClose={() => setShowRefundModal(false)} title="Process Refund" size="sm">
        <div className="space-y-4">
          <div className="bg-surface-900 rounded-xl p-4 border border-surface-800">
            <p className="text-xs text-surface-400 mb-1">Order</p>
            <p className="text-lg font-bold text-white">#{selectedPayment?.order_number}</p>
            <p className="text-2xl font-black text-red-400 mt-1">₹{Number(selectedPayment?.grand_total || 0).toLocaleString()}</p>
          </div>
          <textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)}
            className="input w-full resize-none" rows={3} placeholder="Reason for refund..." />
          <input type="password" value={managerPin} onChange={(e) => setManagerPin(e.target.value)}
            className="input w-full text-center text-2xl tracking-[1em]" maxLength={4} placeholder="Manager PIN" />
          <button onClick={() => refundMutation.mutate({ orderId: selectedPayment?.id, reason: refundReason, pin: managerPin })}
            disabled={!refundReason || managerPin.length < 4}
            className="btn-primary w-full py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50">
            Process Refund
          </button>
        </div>
      </Modal>
    </div>
  );
}
