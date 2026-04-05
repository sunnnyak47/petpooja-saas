import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { 
  Building2, Users, CreditCard, Activity, 
  TrendingUp, Wallet, ShieldClose, Rocket, 
  AlertCircle, CheckCircle2, Server, Database, Globe
} from 'lucide-react';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['sa-stats'],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 30000 // Refresh every 30s for the live feel 🚀
  });

  if (isLoading) return <div className="animate-pulse">Loading SaaS Foundation...</div>;

  const data = stats?.data || {};

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* SaaS Status Grid */}
      <div className="grid grid-cols-4 gap-8">
        <StatCard title="Total Restaurants" value={data.restaurants?.total || 0} icon={<Building2 />} color="indigo" subtitle={`+4 this week`} />
        <StatCard title="Active Licenses" value={data.restaurants?.active || 0} icon={<CheckCircle2 />} color="emerald" subtitle={`98.4% uptime`} />
        <StatCard title="Expiring Soon" value={data.restaurants?.expired || 0} icon={<AlertCircle />} color="amber" subtitle={`Needs follow up`} />
        <StatCard title="Current MRR" value={`₹${data.revenue?.mrr?.toLocaleString() || 0}`} icon={<Wallet />} color="indigo" subtitle={`Monthly Revenue`} />
      </div>

      {/* Real-time Business Intelligence */}
      <div className="grid grid-cols-3 gap-8">
        
        {/* Platform Health */}
        <div className="col-span-1 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 flex flex-col justify-between overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-8">Platform Health</h3>
            <div className="space-y-6">
                <HealthItem icon={<Server />} label="API Infrastructure" status="Online" color="emerald" />
                <HealthItem icon={<Database />} label="Postgres SQL Core" status="Healthy" color="emerald" />
                <HealthItem icon={<Globe />} label="Socket.io Gateway" status="143 Sync" color="indigo" />
                <HealthItem icon={<Activity />} label="Redis Cache Layer" status="Connected" color="emerald" />
            </div>
            <div className="mt-10 pt-8 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase italic">Last Backup: 2 hrs ago</span>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 underline cursor-pointer hover:text-emerald-300">
                   Check AWS S3
                </span>
            </div>
        </div>

        {/* Live Activity Feed (Mocked for Phase 1) */}
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

            <div className="space-y-4">
                <ActivityLine time="2 min ago" event="New SaaS Onboarding" detail="Sharma Foods, Delhi" />
                <ActivityLine time="15 min ago" event="Subscription Payment" detail="₹9,999 (Annual Plan)" type="payment" />
                <ActivityLine time="1 hr ago" event="License Expired" detail="Raj Hotel, Ludhiana" type="alert" />
                <ActivityLine time="3 hr ago" event="New Support Ticket" detail="Printer setup assistance" />
                <ActivityLine time="Today" event="Aggregated Orders" detail="14 new sales processed across platform" />
            </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, subtitle }) {
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
             {icon}
          </div>
          <TrendingUp className="text-slate-700 group-hover:text-emerald-500 transition-colors" size={20} />
       </div>
       <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</p>
       <h4 className="text-4xl font-black text-white mt-2 tracking-tight">{value}</h4>
       {subtitle && <p className="text-[10px] text-slate-600 font-bold uppercase mt-2">{subtitle}</p>}
    </div>
  );
}

function HealthItem({ icon: Icon, label, status, color }) {
  const statusColors = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/10',
  };
  return (
    <div className="flex items-center justify-between p-4 bg-slate-800/10 rounded-2xl border border-slate-700/10">
       <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${statusColors[color]}`}>
             <Icon size={16} />
          </div>
          <span className="text-xs font-bold text-slate-300">{label}</span>
       </div>
       <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${statusColors[color]}`}>
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
