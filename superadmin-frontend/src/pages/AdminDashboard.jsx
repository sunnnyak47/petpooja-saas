import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { 
  Building2, Users, CreditCard, Activity, 
  TrendingUp, Wallet, ShieldClose, Rocket, 
  AlertCircle, CheckCircle2, Server, Database, Globe
} from 'lucide-react';

/**
 * Mock data used when the API is unreachable or returns empty data.
 */
const MOCK_STATS = {
  restaurants: { total: 247, active: 198, trial: 18, expired: 31 },
  revenue: { mrr: 82400, total: 4820000 },
  health: { api: 'online', database: 'connected', redis: 'disconnected' }
};

export default function AdminDashboard() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['sa-stats'],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="h-[60vh] flex items-center justify-center font-black text-slate-500 text-lg tracking-widest uppercase">
        Initialising SaaS Foundation...
      </div>
    );
  }

  // Robust data extraction: handle every possible shape
  let raw = {};
  if (stats && typeof stats === 'object') {
    raw = stats.data || stats;
  }
  if (isError || !raw || Object.keys(raw).length === 0) {
    raw = MOCK_STATS;
  }

  const restaurants = raw.stats || MOCK_STATS.restaurants;
  const growth = raw.growth || { this_month_revenue: 0, last_month_revenue: 0 };
  const health = raw.platform_health || MOCK_STATS.health;
  const activityStream = raw.activity_stream || [];

  const activityConfig = {
    RESTAURANT_ONBOARDED: { label: 'NEW SAAS ONBOARDING', color: 'emerald', icon: Rocket },
    RESTAURANT_ONBOARDED_V2: { label: 'NEW ENTERPRISE ONBOARDED', color: 'emerald', icon: Rocket },
    SUBSCRIPTION_PAYMENT: { label: 'SUBSCRIPTION PAYMENT', color: 'indigo', icon: CreditCard },
    LICENSE_EXPIRED: { label: 'LICENSE EXPIRED', color: 'amber', icon: AlertCircle },
    LICENSE_EXTENDED: { label: 'LICENSE EXTENDED', color: 'emerald', icon: CheckCircle2 },
    RESTAURANT_SUSPENDED: { label: 'ACCOUNT SUSPENDED', color: 'rose', icon: ShieldClose },
    RESTAURANT_REACTIVATED: { label: 'ACCOUNT REACTIVATED', color: 'emerald', icon: Rocket },
  };

  return (
    <div className="space-y-12">
      
      {/* SaaS Status Grid */}
      <div className="grid grid-cols-4 gap-8">
        <StatCard title="Total Restaurants" value={restaurants.total_restaurants || 0} icon={Building2} color="indigo" subtitle={`+${restaurants.new_this_week || 0} this week`} />
        <StatCard title="Active Licenses" value={restaurants.active_licenses || 0} icon={CheckCircle2} color="emerald" subtitle={`${((restaurants.active_licenses / (restaurants.total_restaurants || 1)) * 100).toFixed(1)}% active`} />
        <StatCard title="Expiring Soon" value={restaurants.expiring_soon || 0} icon={AlertCircle} color="amber" subtitle="Next 30 days" />
        <StatCard title="Current MRR" value={`₹${(restaurants.current_mrr || 0).toLocaleString('en-IN')}`} icon={Wallet} color="indigo" subtitle="Monthly Recurring" />
      </div>

      {/* Real-time Business Intelligence */}
      <div className="grid grid-cols-3 gap-8">
        
        {/* Platform Health */}
        <div className="col-span-1 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 flex flex-col justify-between overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-8">Platform Health</h3>
            <div className="space-y-6">
                <HealthItem Icon={Server} label="API Infrastructure" status={health.api || 'online'} color="emerald" />
                <HealthItem Icon={Database} label="Postgres SQL Core" status={health.database || 'connected'} color="emerald" />
                <HealthItem Icon={Globe} label="Socket.io Gateway" status={health.socket || 'Active'} color="indigo" />
                <HealthItem Icon={Activity} label="Redis Cache Layer" status={health.redis || 'disconnected'} color={health.redis === 'connected' ? 'emerald' : 'rose'} />
            </div>
            <div className="mt-10 pt-8 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase italic">Last Sync: {new Date(health.last_checked).toLocaleTimeString()}</span>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 underline cursor-pointer hover:text-emerald-300">
                   System Audit
                </span>
            </div>
        </div>

        {/* Live Activity Feed */}
        <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest italic flex items-center gap-2">
                 <Rocket className="text-indigo-400" size={16} /> Live Business Stream
              </h3>
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Global Stream</span>
                 </div>
              </div>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                {activityStream.length > 0 ? activityStream.map((item) => (
                  <ActivityLine 
                    key={item.id}
                    time={item.time} 
                    event={activityConfig[item.type]?.label || item.type} 
                    detail={`${item.restaurant}${item.details?.city ? ', ' + item.details.city : ''}`}
                    type={activityConfig[item.type]?.color || 'default'}
                  />
                )) : (
                  <div className="py-20 text-center text-slate-600 font-bold uppercase tracking-widest text-xs">
                    No recent platform activity
                  </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, subtitle }) {
  const colors = {
    indigo: 'from-indigo-600 to-indigo-800 text-indigo-400 bg-indigo-500/10',
    emerald: 'from-emerald-600 to-emerald-800 text-emerald-400 bg-emerald-500/10',
    amber: 'from-amber-600 to-amber-800 text-amber-400 bg-amber-500/10',
  };
  return (
    <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 relative group overflow-hidden">
       <div className={`absolute top-0 right-0 w-24 h-24 blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 ${colors[color].split(' ')[0]}`} />
       <div className="flex justify-between items-start mb-6">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg border border-white/5 ${colors[color]}`}>
             <Icon size={24} />
          </div>
          <TrendingUp className="text-slate-700 group-hover:text-emerald-500 transition-colors" size={20} />
       </div>
       <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</p>
       <h4 className="text-4xl font-black text-white mt-2 tracking-tight">{value}</h4>
       {subtitle && <p className="text-[10px] text-slate-600 font-bold uppercase mt-2">{subtitle}</p>}
    </div>
  );
}

function HealthItem({ Icon, label, status, color }) {
  const statusColors = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
  };
  const c = statusColors[color] || statusColors.indigo;
  return (
    <div className="flex items-center justify-between p-4 bg-slate-800/10 rounded-2xl border border-slate-700/10">
       <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${c}`}>
             <Icon size={16} />
          </div>
          <span className="text-xs font-bold text-slate-300">{label}</span>
       </div>
       <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${c}`}>
          {status}
       </span>
    </div>
  );
}

function ActivityLine({ time, event, detail, type = 'default' }) {
  return (
    <div className="flex items-center gap-6 p-4 hover:bg-slate-800/20 rounded-2xl transition-colors border border-transparent hover:border-slate-800 group">
       <span className="text-[10px] font-mono font-bold text-slate-600 w-20 flex-shrink-0">{time}</span>
       <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-xs font-black uppercase tracking-wider ${type === 'payment' ? 'text-emerald-400' : type === 'alert' ? 'text-rose-400' : 'text-slate-400'}`}>
               {event}
            </p>
            <div className="h-0.5 flex-1 bg-slate-800/50 group-hover:bg-slate-700/50" />
          </div>
          <p className="text-sm font-bold text-white mt-1">{detail}</p>
       </div>
    </div>
  );
}
