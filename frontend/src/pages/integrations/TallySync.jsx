import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Globe, Save, Download, RefreshCw, 
  CheckCircle2, AlertCircle, Calendar,
  ArrowRight, FileText, CreditCard, ShoppingBag
} from 'lucide-react';

const fetchMappings = async (outletId) => {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/integrations/accounting/tally/mappings?outlet_id=${outletId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    return data.data;
};

const updateMapping = async (mapping) => {
    const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/integrations/accounting/tally/mappings`, mapping, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    return data.data;
};

export default function TallySync() {
    const queryClient = useQueryClient();
    const outletId = JSON.parse(localStorage.getItem('user'))?.outlet_id;
    
    const { data: mappings, isLoading } = useQuery({
        queryKey: ['tally-mappings', outletId],
        queryFn: () => fetchMappings(outletId),
        enabled: !!outletId
    });

    const mutation = useMutation({
        mutationFn: updateMapping,
        onSuccess: () => queryClient.invalidateQueries(['tally-mappings', outletId])
    });

    const [dateRange, setDateRange] = useState({
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    const [editingLedger, setEditingLedger] = useState({ method: '', name: '' });

    const handleUpdateMapping = (method, name) => {
        mutation.mutate({ outlet_id: outletId, pos_method: method, tally_ledger_name: name });
    };

    const handleDownload = async (type) => {
        const url = `${import.meta.env.VITE_API_URL}/integrations/accounting/tally/export/${type}?outlet_id=${outletId}&start_date=${dateRange.start}&end_date=${dateRange.end}`;
        window.open(url, '_blank');
    };

    if (isLoading) return <div className="p-8 text-surface-400 animate-pulse font-black uppercase tracking-widest text-xs">SYNCHRONIZING ACCOUNTING SCHEMA...</div>;

    const paymentMethods = [
        { id: 'cash', label: 'Cash Payments', icon: CreditCard },
        { id: 'card_pine_labs', label: 'Card (Pine Labs)', icon: CreditCard },
        { id: 'upi_razorpay', label: 'UPI (Razorpay)', icon: Globe },
        { id: 'zomato', label: 'Zomato Credits', icon: ShoppingBag },
        { id: 'swiggy', label: 'Swiggy Credits', icon: ShoppingBag }
    ];

    const getMappedName = (method) => mappings?.find(m => m.pos_method === method)?.tally_ledger_name || '';

    return (
        <div className="max-w-6xl space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase italic flex items-center gap-3">
                        <Globe className="text-brand-500" size={32} />
                        Tally ERP Sync
                    </h2>
                    <p className="text-surface-500 font-bold uppercase tracking-widest text-[10px] mt-1">Automated Accounting & Ledger Mapping</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-8">
                {/* Left: Ledger Mapping */}
                <div className="col-span-2 space-y-6">
                    <div className="bg-surface-800/40 border border-surface-700/50 rounded-3xl p-8 backdrop-blur-xl">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Save size={18} className="text-brand-400" />
                            Ledger Configuration
                        </h3>
                        
                        <div className="space-y-4">
                            {paymentMethods.map((pm) => (
                                <div key={pm.id} className="flex items-center gap-6 p-4 rounded-2xl bg-surface-900/50 border border-surface-700/30 group hover:border-brand-500/30 transition-all">
                                    <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center text-surface-400 group-hover:text-brand-400 transition-colors">
                                        <pm.icon size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-surface-500 uppercase tracking-widest mb-1">{pm.label}</p>
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="text"
                                                defaultValue={getMappedName(pm.id)}
                                                placeholder={`Tally Ledger Name (e.g. ${pm.id.toUpperCase()} A/C)`}
                                                className="flex-1 bg-transparent border-b border-surface-700 py-1 text-xs font-bold text-white focus:outline-none focus:border-brand-500 transition-colors"
                                                onBlur={(e) => handleUpdateMapping(pm.id, e.target.value)}
                                            />
                                            {getMappedName(pm.id) && <CheckCircle2 size={16} className="text-emerald-500" />}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Export Controls */}
                <div className="col-span-1 space-y-6">
                    <div className="bg-brand-600 rounded-3xl p-8 shadow-2xl shadow-brand-900/20 text-white">
                        <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Download size={18} />
                            Generate XML
                        </h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-brand-200 uppercase tracking-widest mb-2 italic">Select Period</label>
                                <div className="space-y-3">
                                    <input 
                                        type="date" 
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                                        className="w-full bg-brand-700 border border-brand-500/30 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none"
                                    />
                                    <input 
                                        type="date" 
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                                        className="w-full bg-brand-700 border border-brand-500/30 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 pt-4">
                                <button 
                                    onClick={() => handleDownload('sales')}
                                    className="w-full py-4 bg-white rounded-2xl text-[10px] font-black text-brand-600 uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-black/10 flex items-center justify-center gap-2"
                                >
                                    <FileText size={16} />
                                    Download Sales XML
                                </button>
                                <button 
                                    onClick={() => handleDownload('receipts')}
                                    className="w-full py-4 bg-brand-500 border border-brand-400/30 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest hover:bg-brand-400 transition-all flex items-center justify-center gap-2"
                                >
                                    <CreditCard size={16} />
                                    Download Receipts XML
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-surface-800/40 border border-surface-700/50 rounded-3xl p-6">
                        <div className="flex items-start gap-4 text-surface-400">
                            <AlertCircle size={20} className="text-brand-500 flex-shrink-0" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-white">Guidelines</p>
                                <ul className="text-[9px] font-bold space-y-2 uppercase leading-relaxed">
                                    <li>• Ensure Ledger names match Tally EXACTLY</li>
                                    <li>• Sales XML includes GST breakups</li>
                                    <li>• Run a "Sync Status" check in Tally after import</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
