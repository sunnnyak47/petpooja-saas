import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import {
  TrendingUp, TrendingDown, ShoppingBag, IndianRupee,
  Users, ChefHat, ArrowUpRight, ArrowDownRight, AlertTriangle
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', outletId],
    queryFn: () => api.get(`/reports/dashboard?outlet_id=${outletId}`).then((r) => r.data),
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  const { data: topItems } = useQuery({
    queryKey: ['topSelling', outletId],
    queryFn: () => api.get(`/reports/topSellingItems?outlet_id=${outletId}&limit=5`).then(r => r.data),
    enabled: !!outletId
  });

  const d = dashboard || { today: {}, comparison: {}, live: {} };

  const statCards = [
    {
      label: "Today's Revenue",
      value: `₹${(d.today?.revenue || 0).toLocaleString('en-IN')}`,
      change: d.comparison?.revenue_growth_pct || 0,
      icon: IndianRupee,
      color: 'from-brand-500 to-brand-700',
    },
    {
      label: "Today's Orders",
      value: d.today?.orders || 0,
      change: d.comparison?.yesterday_orders
        ? Math.round(((d.today?.orders - d.comparison.yesterday_orders) / d.comparison.yesterday_orders) * 100)
        : 0,
      icon: ShoppingBag,
      color: 'from-info-500 to-blue-700',
    },
    {
      label: 'Avg Order Value',
      value: `₹${(d.today?.avg_order_value || 0).toLocaleString('en-IN')}`,
      icon: TrendingUp,
      color: 'from-success-500 to-green-700',
    },
    {
      label: 'Table Occupancy',
      value: `${d.live?.occupancy_pct || 0}%`,
      sub: `${d.live?.active_tables || 0}/${d.live?.total_tables || 0} tables`,
      icon: Users,
      color: 'from-warning-500 to-yellow-700',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-surface-700 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <div key={i} className="h-32 bg-surface-800 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-surface-400 text-sm mt-1">Here's what's happening at your restaurant today</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className="card-hover group" id={`stat-${card.label.replace(/\s+/g, '-').toLowerCase()}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="stat-label">{card.label}</p>
                <p className="stat-value mt-1">{card.value}</p>
                {card.change !== undefined && card.change !== 0 && (
                  <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${card.change > 0 ? 'text-success-400' : 'text-red-400'}`}>
                    {card.change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(card.change)}% vs yesterday
                  </div>
                )}
                {card.sub && <p className="text-xs text-surface-500 mt-2">{card.sub}</p>}
              </div>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Running Orders */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Live Status</h3>
            <span className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-surface-700/30 rounded-xl">
              <span className="text-sm text-surface-400">Running Orders</span>
              <span className="text-lg font-bold text-warning-400">{d.today?.running_orders || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-700/30 rounded-xl">
              <span className="text-sm text-surface-400">Pending KOTs</span>
              <span className="text-lg font-bold text-brand-400">{d.live?.pending_kots || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-700/30 rounded-xl">
              <span className="text-sm text-surface-400">Paid Orders</span>
              <span className="text-lg font-bold text-success-400">{d.today?.paid_orders || 0}</span>
            </div>
          </div>
        </div>

        {/* Yesterday Comparison */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Yesterday Comparison</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-surface-400">Revenue</span>
                <span className="text-white font-medium">₹{(d.comparison?.yesterday_revenue || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, d.comparison?.yesterday_revenue ? (d.today?.revenue / d.comparison?.yesterday_revenue) * 100 : 0)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-surface-400">Orders</span>
                <span className="text-white font-medium">{d.comparison?.yesterday_orders || 0}</span>
              </div>
              <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-info-500 to-info-400 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, d.comparison?.yesterday_orders ? (d.today?.orders / d.comparison?.yesterday_orders) * 100 : 0)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <a href="/pos" className="flex flex-col items-center gap-2 p-4 bg-brand-500/10 hover:bg-brand-500/20 rounded-xl transition-all group" id="qa-new-order">
              <ShoppingBag className="w-6 h-6 text-brand-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-surface-300">New Order</span>
            </a>
            <a href="/tables" className="flex flex-col items-center gap-2 p-4 bg-info-500/10 hover:bg-info-500/20 rounded-xl transition-all group" id="qa-tables">
              <Users className="w-6 h-6 text-info-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-surface-300">Tables</span>
            </a>
            <a href="/menu" className="flex flex-col items-center gap-2 p-4 bg-success-500/10 hover:bg-success-500/20 rounded-xl transition-all group" id="qa-menu">
              <ChefHat className="w-6 h-6 text-success-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-surface-300">Menu</span>
            </a>
            <a href="/reports" className="flex flex-col items-center gap-2 p-4 bg-warning-500/10 hover:bg-warning-500/20 rounded-xl transition-all group" id="qa-reports">
              <TrendingUp className="w-6 h-6 text-warning-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-surface-300">Reports</span>
            </a>
          </div>
        </div>
      </div>

      {/* Lower Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Selling Items */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Top Selling Items</h3>
            <span className="text-[10px] uppercase font-bold text-surface-500 tracking-widest">This Month</span>
          </div>
          <div className="space-y-3">
            {topItems?.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-surface-700/20 rounded-xl hover:bg-surface-700/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-400 font-bold text-xs uppercase shadow-sm">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white line-clamp-1">{item.name}</p>
                    <p className="text-[10px] text-surface-500 uppercase font-black tracking-tighter mt-0.5">{item.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-400">{item.count} <span className="text-[10px] text-surface-500 font-normal">pts</span></p>
                  <p className="text-[10px] text-surface-500 font-medium">₹{Number(item.revenue || 0).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {(!topItems || topItems.length === 0) && <p className="text-center py-6 text-surface-600 text-xs">Waiting for sales data...</p>}
          </div>
        </div>

        {/* Low Stock Alerts (Quick Access) */}
        <div className="card border border-warning-500/10">
           <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                 <AlertTriangle className="w-4 h-4 text-warning-400"/> Critical Stock
              </h3>
              <a href="/inventory" className="text-[10px] uppercase font-bold text-brand-400 hover:text-brand-300 transition-colors tracking-widest">Manage All</a>
           </div>
           <div className="space-y-2">
              <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-ping"/>
                    <span className="text-sm text-surface-300">Tomato Juice (Ltr)</span>
                 </div>
                 <span className="text-xs font-black text-red-400 uppercase">OUT OF STOCK</span>
              </div>
              <div className="p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"/>
                    <span className="text-sm text-surface-300">Paneer Fresh (Kg)</span>
                 </div>
                 <span className="text-xs font-black text-yellow-500 uppercase">Below Threshold</span>
              </div>
              <p className="text-[10px] text-surface-600 italic text-center mt-4">Demo inventory data shown above</p>
           </div>
        </div>
      </div>
    </div>
  );
}
