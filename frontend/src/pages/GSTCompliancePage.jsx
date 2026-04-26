import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Calendar, Download, FileText, IndianRupee, Percent,
  TrendingUp, ChevronDown, AlertCircle,
} from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, subMonths, endOfMonth } from 'date-fns';

const DATE_PRESETS = [
  { label: 'Today', getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Yesterday', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: 'This Week', getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: new Date() }) },
  { label: 'This Month', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Last Month', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

const RATE_COLORS = { '0': '#64748b', '5': '#3b82f6', '12': '#10b981', '18': '#f59e0b', '28': '#ef4444' };

function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden group">
      <div
        className="absolute -right-4 -top-4 w-14 h-14 rounded-full opacity-20 group-hover:scale-150 transition-transform"
        style={{ background: accent || 'var(--accent)' }}
      />
      <div className="flex items-center gap-2 text-surface-400 text-xs font-bold uppercase tracking-widest">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub && <p className="text-xs text-surface-500">{sub}</p>}
    </div>
  );
}

export default function GSTCompliancePage() {
  const { user } = useSelector((s) => s.auth);
  const [dateRange, setDateRange] = useState(DATE_PRESETS[3].getValue()); // This Month default
  const [presetIndex, setPresetIndex] = useState(3);
  const [showCustom, setShowCustom] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState(user?.outlet_id || '');
  const [activeTab, setActiveTab] = useState('summary'); // summary | register | hsn

  const fromStr = format(dateRange.from, 'yyyy-MM-dd');
  const toStr = format(dateRange.to, 'yyyy-MM-dd');

  const { data: outlets } = useQuery({
    queryKey: ['outlets'],
    queryFn: () => api.get('/outlets').then((r) => r.data),
    enabled: user?.role === 'owner' || user?.role === 'super_admin',
  });

  const { data: gstData, isLoading } = useQuery({
    queryKey: ['gst', 'detailed', selectedOutlet, fromStr, toStr],
    queryFn: () =>
      api.get(`/reports/gstDetailed?outlet_id=${selectedOutlet}&from=${fromStr}&to=${toStr}`).then((r) => r.data),
    enabled: !!selectedOutlet,
    refetchInterval: 300000,
  });

  const summaryCards = useMemo(() => {
    if (!gstData) return { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, totalOrders: 0 };
    return {
      taxable: gstData.totals?.taxable || 0,
      cgst: gstData.totals?.cgst || 0,
      sgst: gstData.totals?.sgst || 0,
      igst: gstData.totals?.igst || 0,
      totalTax: gstData.totals?.total_tax || 0,
      totalOrders: gstData.totals?.order_count || 0,
    };
  }, [gstData]);

  const rateWiseData = useMemo(() => gstData?.by_rate || [], [gstData]);
  const dailyRegister = useMemo(() => gstData?.daily || [], [gstData]);
  const hsnData = useMemo(() => gstData?.hsn || [], [gstData]);

  const handleExport = (type) => {
    const url = `${import.meta.env.VITE_API_URL || '/api'}/reports/exportGst?outlet_id=${selectedOutlet}&from=${fromStr}&to=${toStr}&type=${type}`;
    window.location.href = url;
  };

  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-surface-900 p-4 rounded-2xl border border-surface-800 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-black text-white">GST & Compliance</h1>
          </div>

          {/* Date Presets */}
          <div className="flex bg-surface-950 p-1 rounded-xl shadow-inner overflow-x-auto">
            {DATE_PRESETS.map((preset, idx) => (
              <button
                key={preset.label}
                onClick={() => { setPresetIndex(idx); setDateRange(preset.getValue()); setShowCustom(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${presetIndex === idx && !showCustom ? 'bg-brand-500 text-white shadow-md' : 'text-surface-400 hover:text-surface-200'}`}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => { setShowCustom(true); setPresetIndex(-1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 whitespace-nowrap ${showCustom ? 'bg-brand-500 text-white shadow-md' : 'text-surface-400 hover:text-surface-200'}`}
            >
              <Calendar className="w-3 h-3" /> Custom
            </button>
          </div>

          {showCustom && (
            <div className="flex items-center gap-2">
              <input type="date" className="input text-xs py-1" value={fromStr} onChange={(e) => setDateRange((p) => ({ ...p, from: new Date(e.target.value) }))} />
              <span className="text-surface-500 text-xs">to</span>
              <input type="date" className="input text-xs py-1" value={toStr} onChange={(e) => setDateRange((p) => ({ ...p, to: new Date(e.target.value) }))} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {outlets?.length > 1 && (
            <select className="input text-sm font-bold" value={selectedOutlet} onChange={(e) => setSelectedOutlet(e.target.value)}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button onClick={() => handleExport('gstr1')} className="btn-surface text-xs font-semibold gap-1.5 shrink-0">
            <Download className="w-3.5 h-3.5" /> GSTR-1 CSV
          </button>
          <button onClick={() => handleExport('gstr3b')} className="btn-success text-xs font-semibold gap-1.5 shrink-0">
            <Download className="w-3.5 h-3.5" /> GSTR-3B Summary
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl px-4 py-3 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>GST figures shown are based on recorded orders. Verify with your CA before filing. Period: <strong>{format(dateRange.from, 'dd MMM yyyy')}</strong> to <strong>{format(dateRange.to, 'dd MMM yyyy')}</strong></span>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-brand-400 gap-4">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-bold tracking-widest uppercase text-sm">Compiling GST Data...</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Orders" value={summaryCards.totalOrders} icon={FileText} accent="#3b82f6" />
            <StatCard label="Taxable Amount" value={fmt(summaryCards.taxable)} icon={IndianRupee} accent="#10b981" />
            <StatCard label="CGST Collected" value={fmt(summaryCards.cgst)} icon={Percent} accent="#8b5cf6" />
            <StatCard label="SGST Collected" value={fmt(summaryCards.sgst)} icon={Percent} accent="#f59e0b" />
            <StatCard label="IGST Collected" value={fmt(summaryCards.igst)} icon={Percent} accent="#ef4444" />
            <StatCard label="Total GST" value={fmt(summaryCards.totalTax)} icon={TrendingUp} accent="var(--accent)" sub="CGST + SGST + IGST" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface-950 p-1 rounded-xl w-fit">
            {[
              { id: 'summary', label: 'Rate-wise Summary' },
              { id: 'register', label: 'Daily Register' },
              { id: 'hsn', label: 'HSN Summary' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-brand-500 text-white shadow' : 'text-surface-400 hover:text-surface-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Rate-wise Summary Tab */}
          {activeTab === 'summary' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rate-wise Chart */}
              <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">Tax Collected by Rate</h3>
                  <button onClick={() => handleExport('rate_wise')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rateWiseData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <XAxis dataKey="rate" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        cursor={{ fill: '#1e293b' }}
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                        formatter={(val, name) => [`₹${Number(val).toLocaleString('en-IN')}`, name]}
                      />
                      <Bar dataKey="total_tax" radius={[6, 6, 0, 0]} name="Total Tax">
                        {rateWiseData.map((entry) => (
                          <Cell key={entry.rate} fill={RATE_COLORS[String(entry.rate)] || '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Rate-wise Table */}
              <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
                <div className="flex justify-between items-center p-4 bg-surface-950 border-b border-surface-800">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">GSTR-3B Rate-wise Breakup</h3>
                  <button onClick={() => handleExport('rate_wise')} className="btn-surface btn-sm text-xs">
                    <Download className="w-3 h-3 mr-1" /> Export
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-surface-950 text-surface-400 text-xs uppercase font-bold border-b border-surface-800">
                      <tr>
                        <th className="p-3">GST Rate</th>
                        <th className="p-3">Orders</th>
                        <th className="p-3">Taxable Amt</th>
                        <th className="p-3">CGST</th>
                        <th className="p-3">SGST</th>
                        <th className="p-3 text-brand-400">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800/50">
                      {rateWiseData.length > 0 ? rateWiseData.map((row) => (
                        <tr key={row.rate} className="hover:bg-surface-800/30">
                          <td className="p-3">
                            <span
                              className="px-2 py-0.5 rounded-full text-white text-xs font-bold"
                              style={{ background: RATE_COLORS[String(row.rate)] || '#3b82f6' }}
                            >
                              {row.rate}%
                            </span>
                          </td>
                          <td className="p-3 text-surface-300">{row.order_count}</td>
                          <td className="p-3 text-surface-200">{fmt(row.taxable)}</td>
                          <td className="p-3 text-purple-400">{fmt(row.cgst)}</td>
                          <td className="p-3 text-amber-400">{fmt(row.sgst)}</td>
                          <td className="p-3 font-bold text-brand-400 bg-brand-500/5">{fmt(row.total_tax)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="6" className="p-8 text-center text-surface-500 italic">No GST data for this period</td></tr>
                      )}
                      {rateWiseData.length > 0 && (
                        <tr className="bg-surface-950 font-bold">
                          <td className="p-3 text-surface-200">TOTAL</td>
                          <td className="p-3 text-surface-200">{rateWiseData.reduce((s, r) => s + r.order_count, 0)}</td>
                          <td className="p-3 text-surface-200">{fmt(rateWiseData.reduce((s, r) => s + r.taxable, 0))}</td>
                          <td className="p-3 text-purple-400">{fmt(rateWiseData.reduce((s, r) => s + r.cgst, 0))}</td>
                          <td className="p-3 text-amber-400">{fmt(rateWiseData.reduce((s, r) => s + r.sgst, 0))}</td>
                          <td className="p-3 text-brand-400">{fmt(rateWiseData.reduce((s, r) => s + r.total_tax, 0))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Daily Register Tab */}
          {activeTab === 'register' && (
            <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
              <div className="flex justify-between items-center p-4 bg-surface-950 border-b border-surface-800">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">Daily GST Register</h3>
                <button onClick={() => handleExport('gstr1')} className="btn-surface btn-sm text-xs">
                  <Download className="w-3 h-3 mr-1" /> Export GSTR-1 CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-950 text-surface-400 text-xs uppercase font-bold border-b border-surface-800">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Orders</th>
                      <th className="p-3">Gross Revenue</th>
                      <th className="p-3">Discount</th>
                      <th className="p-3">Taxable</th>
                      <th className="p-3">CGST</th>
                      <th className="p-3">SGST</th>
                      <th className="p-3">IGST</th>
                      <th className="p-3 text-brand-400 bg-brand-500/5">Total Tax</th>
                      <th className="p-3">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/50">
                    {dailyRegister.length > 0 ? dailyRegister.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-800/30">
                        <td className="p-3 text-surface-200 font-medium whitespace-nowrap">
                          {format(new Date(row.date), 'dd MMM yyyy')}
                        </td>
                        <td className="p-3 text-center text-surface-300">{row.order_count}</td>
                        <td className="p-3 text-surface-300">{fmt(row.gross_revenue)}</td>
                        <td className="p-3 text-red-400">{row.discount > 0 ? `-${fmt(row.discount)}` : '—'}</td>
                        <td className="p-3 text-surface-200">{fmt(row.taxable)}</td>
                        <td className="p-3 text-purple-400">{fmt(row.cgst)}</td>
                        <td className="p-3 text-amber-400">{fmt(row.sgst)}</td>
                        <td className="p-3 text-blue-400">{row.igst > 0 ? fmt(row.igst) : '—'}</td>
                        <td className="p-3 font-bold text-brand-400 bg-brand-500/5">{fmt(row.total_tax)}</td>
                        <td className="p-3 font-bold text-white">{fmt(row.grand_total)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="10" className="p-8 text-center text-surface-500 italic">No data for this period</td></tr>
                    )}
                    {dailyRegister.length > 0 && (
                      <tr className="bg-surface-950 font-bold text-sm">
                        <td className="p-3 text-white">TOTAL</td>
                        <td className="p-3 text-center text-white">{dailyRegister.reduce((s, r) => s + r.order_count, 0)}</td>
                        <td className="p-3 text-white">{fmt(dailyRegister.reduce((s, r) => s + r.gross_revenue, 0))}</td>
                        <td className="p-3 text-red-400">{fmt(dailyRegister.reduce((s, r) => s + r.discount, 0))}</td>
                        <td className="p-3 text-white">{fmt(dailyRegister.reduce((s, r) => s + r.taxable, 0))}</td>
                        <td className="p-3 text-purple-400">{fmt(dailyRegister.reduce((s, r) => s + r.cgst, 0))}</td>
                        <td className="p-3 text-amber-400">{fmt(dailyRegister.reduce((s, r) => s + r.sgst, 0))}</td>
                        <td className="p-3 text-blue-400">{fmt(dailyRegister.reduce((s, r) => s + r.igst, 0))}</td>
                        <td className="p-3 text-brand-400">{fmt(dailyRegister.reduce((s, r) => s + r.total_tax, 0))}</td>
                        <td className="p-3 text-white">{fmt(dailyRegister.reduce((s, r) => s + r.grand_total, 0))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* HSN Summary Tab */}
          {activeTab === 'hsn' && (
            <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
              <div className="flex justify-between items-center p-4 bg-surface-950 border-b border-surface-800">
                <div>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">HSN-wise Summary</h3>
                  <p className="text-xs text-surface-500 mt-0.5">Required for GSTR-1 Table 12 filing</p>
                </div>
                <button onClick={() => handleExport('hsn')} className="btn-surface btn-sm text-xs">
                  <Download className="w-3 h-3 mr-1" /> Export HSN CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-950 text-surface-400 text-xs uppercase font-bold border-b border-surface-800">
                    <tr>
                      <th className="p-3">HSN Code</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">UOM</th>
                      <th className="p-3">Total Qty</th>
                      <th className="p-3">GST Rate</th>
                      <th className="p-3">Taxable Value</th>
                      <th className="p-3">CGST</th>
                      <th className="p-3">SGST</th>
                      <th className="p-3 text-brand-400">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/50">
                    {hsnData.length > 0 ? hsnData.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-800/30">
                        <td className="p-3 font-mono text-surface-200 font-bold">{row.hsn_code || '—'}</td>
                        <td className="p-3 text-surface-300 max-w-[200px] truncate">{row.description || 'General Food Items'}</td>
                        <td className="p-3 text-surface-500">NOS</td>
                        <td className="p-3 text-surface-200">{row.total_qty}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-white text-xs font-bold" style={{ background: RATE_COLORS[String(row.gst_rate)] || '#3b82f6' }}>
                            {row.gst_rate}%
                          </span>
                        </td>
                        <td className="p-3 text-surface-200">{fmt(row.taxable)}</td>
                        <td className="p-3 text-purple-400">{fmt(row.cgst)}</td>
                        <td className="p-3 text-amber-400">{fmt(row.sgst)}</td>
                        <td className="p-3 font-bold text-brand-400 bg-brand-500/5">{fmt(row.total_tax)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="9" className="p-8 text-center text-surface-500 italic">No HSN data — add HSN codes to menu items in Menu Management</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
