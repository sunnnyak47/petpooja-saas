import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';
import { 
  Calendar, IndianRupee, ShoppingBag, TrendingUp, Clock, 
  Download, Printer, ChevronDown, CheckCircle 
} from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, subMonths, endOfMonth, isSameDay } from 'date-fns';

const DATE_PRESETS = [
  { label: 'Today', getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Yesterday', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: 'This Week', getValue: () => ({ from: startOfWeek(new Date(), {weekStartsOn: 1}), to: new Date() }) },
  { label: 'This Month', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Last Month', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

export default function ReportsPage() {
  const { user } = useSelector((s) => s.auth);
  
  // States
  const [dateRange, setDateRange] = useState(DATE_PRESETS[0].getValue());
  const [presetIndex, setPresetIndex] = useState(0);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState(user?.outlet_id || '');
  const [topItemsBy, setTopItemsBy] = useState('revenue'); // revenue or quantity

  // Helpers
  const fromStr = format(dateRange.from, 'yyyy-MM-dd');
  const toStr = format(dateRange.to, 'yyyy-MM-dd');
  const dateParams = `from=${fromStr}&to=${toStr}&date=${fromStr}`;

  // Outlet Fetcher
  const { data: outlets } = useQuery({
    queryKey: ['outlets'],
    queryFn: () => api.get('/outlets').then(r => r.data),
    enabled: user?.role === 'owner' || user?.role === 'super_admin'
  });

  // Data endpoints
  const { data: salesSummary, isLoading: loadingSales } = useQuery({
    queryKey: ['reports', 'salesSummary', selectedOutlet, dateParams],
    queryFn: () => api.get(`/reports/daily-sales?outlet_id=${selectedOutlet}&${dateParams}`).then(r => r.data),
    enabled: !!selectedOutlet, refetchInterval: 300000 // 5 min cache background refetch
  });

  const { data: hourlyData, isLoading: loadingHourly } = useQuery({
    queryKey: ['reports', 'hourlyBreakdown', selectedOutlet, dateParams],
    queryFn: () => api.get(`/reports/hourly?outlet_id=${selectedOutlet}&${dateParams}`).then(r => r.data),
    enabled: !!selectedOutlet, refetchInterval: 300000
  });

  const { data: itemWiseData, isLoading: loadingItems } = useQuery({
    queryKey: ['reports', 'itemWise', selectedOutlet, dateParams],
    queryFn: () => api.get(`/reports/item-wise?outlet_id=${selectedOutlet}&${dateParams}&top=10`).then(r => r.data),
    enabled: !!selectedOutlet, refetchInterval: 300000
  });

  const { data: categoryData, isLoading: loadingCats } = useQuery({
    queryKey: ['reports', 'categoryWise', selectedOutlet, dateParams],
    queryFn: () => api.get(`/reports/categoryWiseSales?outlet_id=${selectedOutlet}&${dateParams}`).then(r => r.data),
    enabled: !!selectedOutlet, refetchInterval: 300000
  });

  const { data: gstData, isLoading: loadingGst } = useQuery({
    queryKey: ['reports', 'gstReport', selectedOutlet, dateParams],
    queryFn: () => api.get(`/reports/gstReport?outlet_id=${selectedOutlet}&${dateParams}`).then(r => r.data),
    enabled: !!selectedOutlet, refetchInterval: 300000
  });

  const { data: staffData, isLoading: loadingStaff } = useQuery({
    queryKey: ['reports', 'staffPerformance', selectedOutlet, dateParams],
    queryFn: () => api.get(`/reports/staffPerformance?outlet_id=${selectedOutlet}&${dateParams}`).then(r => r.data),
    enabled: !!selectedOutlet, refetchInterval: 300000
  });

  // Calculate Peak Hours
  const processedHourly = useMemo(() => {
     if(!hourlyData) return [];
     const maxRev = Math.max(...hourlyData.map(d => d.revenue));
     const sorted = [...hourlyData].sort((a,b)=>b.revenue - a.revenue);
     const peakValues = sorted.slice(0,3).map(d=>d.revenue).filter(v=>v>0);
     return hourlyData.filter(d => d.hour >= 8 && d.hour <= 23).map(h => ({
        name: `${h.hour % 12 || 12}${h.hour >= 12 ? 'PM' : 'AM'}`,
        revenue: h.revenue,
        orders: h.orders,
        isPeak: peakValues.includes(h.revenue)
     }));
  }, [hourlyData]);

  const pieColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
  const paymentData = useMemo(() => {
     if(!salesSummary?.by_payment) return [];
     return Object.entries(salesSummary.by_payment)
        .filter(([_,val]) => val > 0)
        .map(([name, value]) => ({ name: name.toUpperCase(), value }));
  }, [salesSummary]);

  const topItems = (itemWiseData?.items || []).map(i => ({
     name: i.name,
     revenue: i.total_revenue,
     quantity: i.total_quantity
  }));

  const handleExport = (type) => {
     window.location.href = `${import.meta.env.VITE_API_URL || '/api'}/reports/export?type=${type}&outlet_id=${selectedOutlet}&from=${fromStr}&to=${toStr}&format=csv`;
  };

  const handlePrint = () => window.print();

  const ds = salesSummary || {};
  const isGlobalLoading = loadingSales || loadingHourly || loadingItems || loadingCats || loadingGst || loadingStaff;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-surface-900 p-4 rounded-2xl border border-surface-800 shadow-sm print:hidden">
         <div className="flex items-center gap-3">
             <h1 className="text-2xl font-black text-white px-2 pr-4 border-r border-surface-700">Analytics</h1>
             
             {/* Date Presets */}
             <div className="flex bg-surface-950 p-1 rounded-xl shadow-inner overflow-x-auto">
               {DATE_PRESETS.map((preset, idx) => (
                  <button key={preset.label} onClick={() => { setPresetIndex(idx); setDateRange(preset.getValue()); setShowCustomRange(false); }}
                     className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${presetIndex === idx && !showCustomRange ? 'bg-brand-500 text-white shadow-md' : 'text-surface-400 hover:text-surface-200'}`}>
                     {preset.label}
                  </button>
               ))}
               <button onClick={() => { setShowCustomRange(true); setPresetIndex(-1); }} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${showCustomRange ? 'bg-brand-500 text-white shadow-md' : 'text-surface-400 hover:text-surface-200'}`}>
                  <Calendar className="w-3.5 h-3.5"/> Custom
               </button>
             </div>
             
             {showCustomRange && (
                <div className="flex items-center gap-2 animate-slide-right">
                   <input type="date" className="input text-sm py-1" value={fromStr} onChange={e=>setDateRange(p=>({...p, from: new Date(e.target.value)}))} />
                   <span className="text-surface-500">to</span>
                   <input type="date" className="input text-sm py-1" value={toStr} onChange={e=>setDateRange(p=>({...p, to: new Date(e.target.value)}))} />
                </div>
             )}
         </div>

         <div className="flex items-center gap-3 w-full lg:w-auto">
            {outlets?.length > 1 && (
               <select className="input font-bold" value={selectedOutlet} onChange={e=>setSelectedOutlet(e.target.value)}>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
               </select>
            )}
            <button onClick={handlePrint} className="btn-surface font-semibold shrink-0 gap-2"><Printer className="w-4 h-4"/> Print</button>
            <button onClick={()=>handleExport('full_report')} className="btn-success font-semibold shrink-0 gap-2"><Download className="w-4 h-4"/> Export CSV</button>
         </div>
      </div>

      {isGlobalLoading ? (
         <div className="flex flex-col items-center justify-center py-20 text-brand-400 gap-4">
             <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="font-bold tracking-widest uppercase">Compiling Real-Time Data...</p>
         </div>
      ) : (
      <>
         {/* KPI Cards (Report 1) */}
         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
           {[
             { label: 'Total Revenue', value: `₹${(ds.total_revenue || 0).toLocaleString('en-IN')}`, icon: IndianRupee, bg: 'bg-brand-500', trend: '+12.5%' },
             { label: 'Total Orders', value: ds.total_orders || 0, icon: ShoppingBag, bg: 'bg-blue-500', trend: '+5.2%' },
             { label: 'Avg Order Value', value: `₹${ds.avg_order_value || 0}`, icon: TrendingUp, bg: 'bg-purple-500', trend: '-1.4%' },
             { label: 'Dine-In', value: `₹${(ds.by_type?.dine_in || 0).toLocaleString('en-IN')}`, icon: Clock, bg: 'bg-surface-700' },
             { label: 'Takeaway', value: `₹${(ds.by_type?.takeaway || 0).toLocaleString('en-IN')}`, icon: Clock, bg: 'bg-surface-700' },
             { label: 'Delivery', value: `₹${(ds.by_type?.delivery || 0).toLocaleString('en-IN')}`, icon: Clock, bg: 'bg-surface-700' },
           ].map((card, i) => (
             <div key={i} className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden group">
               <div className={`absolute -right-4 -top-4 w-12 h-12 rounded-full ${card.bg} opacity-20 group-hover:scale-150 transition-transform`}></div>
               <p className="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">{card.label}</p>
               <h3 className="text-2xl font-black text-white">{card.value}</h3>
               {card.trend && (
                  <p className={`text-xs mt-1 font-bold ${card.trend.startsWith('+') ? 'text-success-400' : 'text-red-400'}`}>
                     {card.trend} vs Prior
                  </p>
               )}
             </div>
           ))}
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hourly Sales Chart (Report 2) */}
            <div className="col-span-2 bg-surface-900 border border-surface-800 rounded-2xl p-5 shadow-sm">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-white uppercase tracking-wider text-sm">Hourly Sales Trend</h3>
                  <button onClick={()=>handleExport('hourly')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"><Download className="w-4 h-4"/></button>
               </div>
               <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={processedHourly} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                        <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} tickFormatter={(v)=>`₹${v}`} />
                        <Tooltip 
                           cursor={{fill: '#1e293b'}} 
                           contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', color: '#f8fafc', fontSize: '12px'}} 
                           formatter={(val, name) => [`₹${val}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" radius={[6,6,0,0]}>
                          {processedHourly.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={entry.isPeak ? '#ef4444' : '#3b82f6'} />
                          ))}
                        </Bar>
                     </BarChart>
                  </ResponsiveContainer>
               </div>
               <div className="mt-4 flex items-center justify-center gap-4 text-[10px] uppercase font-bold text-surface-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Normal Hours</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Peak Hours</span>
               </div>
            </div>

            {/* Payment Methods (Report 3) */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 shadow-sm flex flex-col">
               <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-white uppercase tracking-wider text-sm">Payment Breakdown</h3>
                  <button onClick={()=>handleExport('payments')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"><Download className="w-4 h-4"/></button>
               </div>
               {paymentData.length > 0 ? (
                  <>
                     <div className="flex-1 min-h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                              <Pie data={paymentData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                                 {paymentData.map((e, i) => <Cell key={`cell-${i}`} fill={pieColors[i % pieColors.length]} />)}
                              </Pie>
                              <Tooltip contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px'}} formatter={(v)=>`₹${v}`} />
                           </PieChart>
                        </ResponsiveContainer>
                     </div>
                     <div className="grid grid-cols-2 gap-2 mt-auto">
                        {paymentData.map((e,i) => (
                           <div key={e.name} className="flex flex-col border border-surface-800 rounded-lg p-2">
                              <span className="text-[10px] uppercase font-bold text-surface-500 flex items-center gap-1">
                                 <span className="w-2 h-2 rounded-full" style={{backgroundColor: pieColors[i % pieColors.length]}}></span> {e.name}
                              </span>
                              <span className="text-sm font-bold text-white">₹{e.value.toLocaleString()}</span>
                           </div>
                        ))}
                     </div>
                  </>
               ) : (
                  <div className="flex flex-1 items-center justify-center text-surface-500 text-sm italic">No payment data</div>
               )}
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Selling Items (Report 4) */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 shadow-sm">
               <div className="flex justify-between items-center mb-6 border-b border-surface-800 pb-4">
                  <h3 className="font-bold text-white uppercase tracking-wider text-sm">Top 10 Sellers</h3>
                  <div className="flex gap-2">
                     <select className="input py-1 text-xs" value={topItemsBy} onChange={(e)=>setTopItemsBy(e.target.value)}>
                        <option value="revenue">By Revenue (₹)</option>
                        <option value="quantity">By Quantity</option>
                     </select>
                     <button onClick={()=>handleExport('items')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors border border-surface-700 bg-surface-950"><Download className="w-3.5 h-3.5"/></button>
                  </div>
               </div>
               <div className="space-y-4">
                  {[...topItems].sort((a,b)=>b[topItemsBy] - a[topItemsBy]).map((item, idx) => {
                     const max = Math.max(...topItems.map(i=>i[topItemsBy]), 1);
                     const pct = (item[topItemsBy] / max) * 100;
                     return (
                        <div key={idx} className="relative group">
                           <div className="flex justify-between items-center mb-1 relative z-10">
                              <span className="text-sm font-bold text-surface-200 drop-shadow-md">{item.name}</span>
                              <span className="text-sm font-black text-brand-400">{topItemsBy==='revenue' ? `₹${item.revenue.toLocaleString()}` : `${item.quantity} Qty`}</span>
                           </div>
                           <div className="h-1.5 w-full bg-surface-950 rounded-full overflow-hidden">
                              <div className="h-full bg-brand-500 rounded-full" style={{width: `${pct}%`}}></div>
                           </div>
                        </div>
                     )
                  })}
                  {topItems.length === 0 && <p className="text-center text-surface-500 py-10">No items sold in this period.</p>}
               </div>
            </div>

            {/* Category Wise Sales (Report 5) */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 shadow-sm">
               <div className="flex justify-between items-center mb-6 border-b border-surface-800 pb-4">
                  <h3 className="font-bold text-white uppercase tracking-wider text-sm">Category Performance</h3>
                  <button onClick={()=>handleExport('category')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 border border-surface-700 transition-colors"><Download className="w-3.5 h-3.5"/></button>
               </div>
               <div className="h-[300px] w-full">
                  {categoryData && categoryData.length > 0 ? (
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryData} layout="vertical" margin={{top: 0, right: 10, left: 30, bottom: 0}}>
                           <XAxis type="number" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                           <YAxis dataKey="category" type="category" tick={{fontSize: 11, fill: '#cbd5e1', fontWeight: 600}} axisLine={false} tickLine={false} width={80} />
                           <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px'}} />
                           <Bar dataKey="revenue" fill="#10b981" radius={[0,6,6,0]} barSize={20} />
                        </BarChart>
                     </ResponsiveContainer>
                  ) : <div className="flex items-center justify-center h-full text-surface-500 italic">No category data</div>}
               </div>
            </div>
         </div>

         {/* Tables Row: GST & Staff Performance */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GST Table (Report 6) */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
               <div className="flex justify-between items-center p-4 bg-surface-950 border-b border-surface-800">
                  <h3 className="font-bold text-white uppercase tracking-wider text-sm">GST Tax Register</h3>
                  <button onClick={()=>handleExport('gst')} className="btn-surface btn-sm"><Download className="w-3.5 h-3.5 mr-1"/> Export CSV</button>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-surface-900 text-surface-400 text-xs uppercase font-bold border-b border-surface-800">
                        <tr><th className="p-3">Date</th><th className="p-3">Taxable</th><th className="p-3">CGST</th><th className="p-3">SGST</th><th className="p-3 bg-brand-500/10 text-brand-400">Total Tax</th></tr>
                     </thead>
                     <tbody className="divide-y divide-surface-800/50">
                        {(gstData||[]).map((row, i) => (
                           <tr key={i} className="hover:bg-surface-800/30">
                              <td className="p-3 text-surface-200">{format(new Date(row.date), 'dd MMM yyyy')}</td>
                              <td className="p-3">₹{row.taxable.toFixed(2)}</td>
                              <td className="p-3">₹{row.cgst.toFixed(2)}</td>
                              <td className="p-3">₹{row.sgst.toFixed(2)}</td>
                              <td className="p-3 font-bold text-brand-400 bg-brand-500/5">₹{row.total_tax.toFixed(2)}</td>
                           </tr>
                        ))}
                        {(!gstData || gstData.length === 0) && <tr><td colSpan="5" className="p-8 text-center text-surface-500">No tax data for period</td></tr>}
                     </tbody>
                  </table>
               </div>
            </div>

            {/* Staff Performance (Report 7) */}
            <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
               <div className="flex justify-between items-center p-4 bg-surface-950 border-b border-surface-800">
                  <h3 className="font-bold text-white uppercase tracking-wider text-sm">Staff Performance</h3>
                  <button onClick={()=>handleExport('staff')} className="btn-surface btn-sm"><Download className="w-3.5 h-3.5 mr-1"/> Export CSV</button>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-surface-900 text-surface-400 text-xs uppercase font-bold border-b border-surface-800">
                        <tr><th className="p-3">Staff Name</th><th className="p-3 text-center">Orders</th><th className="p-3">Revenue generated</th><th className="p-3 text-red-400">Voids</th></tr>
                     </thead>
                     <tbody className="divide-y divide-surface-800/50">
                        {(staffData||[]).map((row, i) => (
                           <tr key={i} className="hover:bg-surface-800/30">
                              <td className="p-3 text-surface-100 font-medium">{row.name}</td>
                              <td className="p-3 text-center bg-surface-950">{row.orders}</td>
                              <td className="p-3 font-bold text-success-400">₹{row.revenue.toLocaleString()}</td>
                              <td className="p-3 text-red-400 font-bold">{row.voids}</td>
                           </tr>
                        ))}
                        {(!staffData || staffData.length === 0) && <tr><td colSpan="4" className="p-8 text-center text-surface-500">No staff data for period</td></tr>}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      </>
      )}
    </div>
  );
}
