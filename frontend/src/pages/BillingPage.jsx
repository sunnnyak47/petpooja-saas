import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { DollarSign, TrendingUp, Users, CreditCard, CheckCircle, Clock, XCircle } from 'lucide-react';

const PLAN_COLORS = {
  trial:      { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Trial' },
  starter:    { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'Starter' },
  pro:        { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Pro' },
  enterprise: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Enterprise' },
};

const STATUS_COLORS = {
  active:    { icon: CheckCircle, text: 'text-green-400',  label: 'Active' },
  trial:     { icon: Clock,       text: 'text-blue-400',   label: 'Trial' },
  suspended: { icon: XCircle,     text: 'text-red-400',    label: 'Suspended' },
  cancelled: { icon: XCircle,     text: 'text-gray-400',   label: 'Cancelled' },
};

export default function BillingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['saas-chains'],
    queryFn: () => api.get('/superadmin/chains'),
  });

  const { data: revenueData } = useQuery({
    queryKey: ['saas-revenue'],
    queryFn: () => api.get('/superadmin/revenue'),
  });

  const rawData = data?.data;
  const chains = Array.isArray(rawData) ? rawData
    : Array.isArray(rawData?.chains) ? rawData.chains
    : [];

  // Compute summary stats
  const totalChains   = chains.length;
  const activeChains  = chains.filter(c => c.status === 'active').length;
  const trialChains   = chains.filter(c => c.status === 'trial' || !c.status).length;
  const totalOutlets  = chains.reduce((s, c) => s + (c._count?.outlets || 0), 0);

  const PLAN_PRICES = { trial: 0, starter: 999, pro: 2499, enterprise: 4999 };
  const apiMrr = revenueData?.data?.mrr ?? revenueData?.data?.monthly_recurring_revenue;
  const mrr = apiMrr ?? chains.reduce((s, c) => s + (PLAN_PRICES[c.subscription_plan] || 0), 0);

  const stats = [
    { label: 'Total Chains',  value: totalChains,  icon: Users,       color: 'text-blue-400' },
    { label: 'Active Chains', value: activeChains, icon: CheckCircle, color: 'text-green-400' },
    { label: 'Trial Chains',  value: trialChains,  icon: Clock,       color: 'text-yellow-400' },
    { label: 'Est. MRR',      value: `₹${mrr.toLocaleString()}`, icon: DollarSign, color: 'text-purple-400' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>SaaS Revenue</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Subscription plans, billing status & monthly recurring revenue
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl p-5"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Plans breakdown */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          Plan Distribution
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(PLAN_PRICES).map(([plan, price]) => {
            const count = chains.filter(c => (c.subscription_plan || 'trial') === plan).length;
            const cfg = PLAN_COLORS[plan] || PLAN_COLORS.trial;
            return (
              <div key={plan} className={`rounded-xl p-4 ${cfg.bg}`}>
                <p className={`text-xs font-black uppercase ${cfg.text}`}>{cfg.label}</p>
                <p className="text-2xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>{count}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {price === 0 ? 'Free' : `₹${price}/mo`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chains table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            All Chains — Billing Status
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
        ) : chains.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>No chains found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Chain', 'Email', 'Region', 'Outlets', 'Plan', 'Status', 'MRR'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chains.map(c => {
                const plan = c.subscription_plan || 'trial';
                const status = c.status || 'trial';
                const planCfg = PLAN_COLORS[plan] || PLAN_COLORS.trial;
                const statusCfg = STATUS_COLORS[status] || STATUS_COLORS.trial;
                const StatusIcon = statusCfg.icon;
                const revenue = PLAN_PRICES[plan] || 0;
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 font-bold" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white"
                          style={{ background: 'var(--accent)' }}>
                          {c.name?.[0]?.toUpperCase() || 'C'}
                        </div>
                        {c.name}
                      </div>
                    </td>
                    <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{c.owner_email || '—'}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {c.region === 'AU' ? '🇦🇺 AU' : '🇮🇳 IN'}
                    </td>
                    <td className="px-5 py-3 font-bold" style={{ color: 'var(--text-primary)' }}>
                      {c._count?.outlets || 0}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-black ${planCfg.bg} ${planCfg.text}`}>
                        {planCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1 text-xs font-bold ${statusCfg.text}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-black" style={{ color: 'var(--text-primary)' }}>
                      {revenue === 0 ? <span style={{ color: 'var(--text-secondary)' }}>—</span> : `₹${revenue}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
