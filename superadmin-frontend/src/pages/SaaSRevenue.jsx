import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { 
  TrendingUp, CreditCard, Users, Wallet,
  ArrowUpRight, ArrowDownRight, Calendar
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';

const fetchRevenue = async () => {
    return await api.get('/revenue');
};

export default function SaaSRevenue() {
    const { data: raw, isLoading } = useQuery({
        queryKey: ['saas-revenue'],
        queryFn: fetchRevenue
    });

    if (isLoading) return <div className="p-8 text-slate-500 font-black animate-pulse">ANALYZING FINANCIAL STREAMS...</div>;

    const summary = raw?.summary || { total_paying: 0, recent_payments: [] };
    const trend = raw?.monthly_trend || [];

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase italic">SaaS Revenue</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Financial Intelligence & Growth Tracking</p>
                </div>
                <div className="flex gap-4">
                    <button className="px-6 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-800 transition-colors">Export Ledger</button>
                    <button className="px-6 py-2.5 bg-indigo-600 rounded-xl text-[10px] font-black text-white uppercase tracking-widest shadow-xl shadow-indigo-500/20">Audit Records</button>
                </div>
            </div>

            {/* Top Cards */}
            <div className="grid grid-cols-3 gap-8">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                   <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                         <Wallet size={24} />
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/10 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-widest">+12.5%</span>
                   </div>
                   <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Total ARR</h3>
                   <p className="text-4xl font-black text-white mt-1 italic">₹{(trend.reduce((a,b)=>a+b.revenue, 0) * 2).toLocaleString('en-IN')}</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                   <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                         <TrendingUp size={24} />
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/10 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-widest">Growth Peak</span>
                   </div>
                   <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Paying Chains</h3>
                   <p className="text-4xl font-black text-white mt-1 italic">{summary.total_paying}</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                   <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                         <Users size={24} />
                      </div>
                   </div>
                   <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Average Contract Value</h3>
                   <p className="text-4xl font-black text-white mt-1 italic">₹9,999</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-3 gap-8">
                {/* Monthly Revenue Trend */}
                <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-8">
                   <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-8 italic">Revenue Growth Trend (6 Mo)</h3>
                   <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={trend}>
                            <defs>
                               <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                               </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="month" stroke="#475569" fontSize={10} fontWeight="bold" />
                            <YAxis stroke="#475569" fontSize={10} fontWeight="bold" tickFormatter={(v) => `₹${v/1000}k`} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                            />
                            <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                         </AreaChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                {/* Subscriptions by Plan */}
                <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-8 italic">Recent Subscriptions</h3>
                    <div className="space-y-6">
                        {summary.recent_payments.map((pay, i) => (
                            <div key={i} className="flex items-center justify-between group cursor-pointer">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        <CreditCard size={18} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-white group-hover:text-indigo-400 transition-colors uppercase truncate max-w-[120px]">{pay.restaurant}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">{pay.plan}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-emerald-400">₹{pay.amount.toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-600 font-bold uppercase">{new Date(pay.date).toLocaleDateString()}</p>
                                </div>
                            </div>
                        ))}
                        {summary.recent_payments.length === 0 && (
                            <div className="py-12 text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                No recent SaaS payments
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
