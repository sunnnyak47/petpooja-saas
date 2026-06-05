import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { DollarSign, TrendingUp, Users, CreditCard, CheckCircle, Clock, XCircle, Gauge, AlertTriangle, PlayCircle } from 'lucide-react';
import { useCurrency } from '../hooks/useCurrency';

const PLAN_COLORS = {
  trial:      { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Trial',      border: 'border-l-blue-400',   dot: 'bg-blue-400' },
  starter:    { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'Starter',    border: 'border-l-green-400',  dot: 'bg-green-400' },
  pro:        { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Pro',        border: 'border-l-purple-400', dot: 'bg-purple-400' },
  enterprise: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Enterprise', border: 'border-l-orange-400', dot: 'bg-orange-400' },
};

const STATUS_COLORS = {
  active:    { icon: CheckCircle, text: 'text-green-400',  label: 'Active' },
  trial:     { icon: Clock,       text: 'text-blue-400',   label: 'Trial' },
  suspended: { icon: XCircle,     text: 'text-red-400',    label: 'Suspended' },
  cancelled: { icon: XCircle,     text: 'text-gray-400',   label: 'Cancelled' },
};

const STAT_ICON_COLORS = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400' },
  amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
};

export default function BillingPage() {
  const { symbol } = useCurrency();
  const { data, isLoading } = useQuery({
    queryKey: ['saas-chains'],
    queryFn: () => api.get('/superadmin/chains'),
  });

  const { data: revenueData } = useQuery({
    queryKey: ['saas-revenue'],
    queryFn: () => api.get('/superadmin/revenue'),
  });

  // Usage-based billing (Phase 4): metered overview + manual rollup trigger.
  const { data: usageOverview, refetch: refetchOverview } = useQuery({
    queryKey: ['billing-admin-overview'],
    queryFn: () => api.get('/billing/admin/overview').then(r => r.data?.data),
    staleTime: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/billing/admin/generate').then(r => r.data),
    onSuccess: (res) => {
      toast.success(res?.message || 'Invoices generated');
      refetchOverview();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Rollup failed'),
  });

  const ov = usageOverview;
  const ovCur = (n) => `${symbol}${Number(n || 0).toLocaleString()}`;

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
    { label: 'Total Chains',  value: totalChains,  icon: Users,       accent: 'blue' },
    { label: 'Active Chains', value: activeChains, icon: CheckCircle, accent: 'green' },
    { label: 'Trial Chains',  value: trialChains,  icon: Clock,       accent: 'amber' },
    { label: 'Est. MRR',      value: `${symbol}${mrr.toLocaleString()}`, icon: DollarSign, accent: 'purple' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          SaaS Revenue
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Subscription plans, billing status & monthly recurring revenue
        </p>
      </div>

      {/* Usage-based billing — metered overview (Phase 4) */}
      {ov && (
        <div className="rounded-xl p-5"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Gauge className="w-4 h-4 text-indigo-400" /> Usage-Based Billing
              <span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>({ov.period})</span>
            </h2>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              <PlayCircle className="w-3.5 h-3.5" />
              {generateMutation.isPending ? 'Generating…' : 'Run Monthly Billing'}
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Metered Fees', value: ovCur(ov.metered_fee_total), icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10' },
              { label: 'Gross Volume', value: ovCur(ov.gross_volume), icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { label: 'Transactions', value: Number(ov.txn_count).toLocaleString(), icon: Gauge, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Invoiced', value: `${ovCur(ov.invoiced_total)} (${ov.invoice_count})`, icon: CreditCard, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
              { label: 'Overdue', value: `${ovCur(ov.overdue_total)} (${ov.overdue_count})`, icon: AlertTriangle, color: ov.overdue_count > 0 ? 'text-red-400' : 'text-gray-400', bg: ov.overdue_count > 0 ? 'bg-red-500/10' : 'bg-gray-500/10' },
            ].map(m => (
              <div key={m.label} className="rounded-lg p-3.5" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.bg}`}>
                    <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                  </div>
                </div>
                <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => {
          const colors = STAT_ICON_COLORS[s.accent];
          return (
            <div
              key={s.label}
              className="rounded-xl p-5"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className="text-3xl font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {s.value}
                  </p>
                  <p
                    className="text-xs font-medium uppercase tracking-wider mt-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {s.label}
                  </p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors.bg}`}>
                  <s.icon className={`w-[18px] h-[18px] ${colors.text}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Plan Distribution */}
      <div>
        <h2
          className="text-xs font-medium uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          Plan Distribution
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(PLAN_PRICES).map(([plan, price]) => {
            const count = chains.filter(c => (c.subscription_plan || 'trial') === plan).length;
            const cfg = PLAN_COLORS[plan] || PLAN_COLORS.trial;
            return (
              <div
                key={plan}
                className={`rounded-xl p-5 border-l-4 ${cfg.border} ${cfg.bg}`}
              >
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
                <p
                  className="text-3xl font-semibold mt-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {count}
                </p>
                <p
                  className="text-xs font-medium mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {price === 0 ? 'Free' : `${symbol}${price}/mo`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div
          className="px-5 py-3.5"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
        >
          <h2
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            All Chains
          </h2>
        </div>

        {isLoading ? (
          <div
            className="p-10 text-center text-sm"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}
          >
            Loading...
          </div>
        ) : chains.length === 0 ? (
          <div
            className="p-10 text-center text-sm"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}
          >
            No chains found
          </div>
        ) : (
          <div style={{ background: 'var(--bg-primary)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Chain', 'Email', 'Region', 'Outlets', 'Plan', 'Status', 'MRR'].map(h => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-medium uppercase tracking-wider ${h === 'MRR' ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}
                    >
                      {h}
                    </th>
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
                    <tr
                      key={c.id}
                      className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                            style={{ background: 'var(--accent)' }}
                          >
                            {c.name?.[0]?.toUpperCase() || 'C'}
                          </div>
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>
                        {c.owner_email || <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>
                        {c.region === 'AU' ? '🇦🇺 AU' : '🇮🇳 IN'}
                      </td>
                      <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {c._count?.outlets || 0}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${planCfg.bg} ${planCfg.text}`}>
                          {planCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusCfg.text}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td
                        className="px-5 py-3.5 text-right font-medium tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {revenue === 0
                          ? <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                          : `${c.region === 'AU' ? 'A$' : '₹'}${revenue}`
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
