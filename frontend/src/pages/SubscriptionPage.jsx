/**
 * SubscriptionPage — Owner's plan info, usage, upgrade options, invoice history
 * Route: /subscription
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useCurrency } from '../hooks/useCurrency';
import {
  CreditCard, CheckCircle2, ArrowUp, Download, Calendar,
  Store, Users, Zap, Star, Crown, Building2, Clock,
  TrendingUp, Package, FileText
} from 'lucide-react';

const PLAN_ICONS = { TRIAL: Zap, STARTER: Star, PRO: Crown, ENTERPRISE: Building2 };
const PLAN_COLORS = { TRIAL: '#94a3b8', STARTER: '#60a5fa', PRO: '#a78bfa', ENTERPRISE: '#4ade80' };
const PLAN_GRADIENTS = {
  TRIAL:      'linear-gradient(135deg, #475569, #334155)',
  STARTER:    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  PRO:        'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  ENTERPRISE: 'linear-gradient(135deg, #22c55e, #15803d)',
};

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'Today';
  if (d < 30) return `${d} days ago`;
  return `${Math.floor(d / 30)} months ago`;
}

export default function SubscriptionPage() {
  const { user } = useSelector(s => s.auth);
  const { format, symbol, locale } = useCurrency();
  const headOfficeId = user?.head_office_id;

  const { data: sub, isLoading } = useQuery({
    queryKey: ['subscription', headOfficeId],
    queryFn: () => api.get('/ho/my-subscription').then(r => r.data),
    enabled: true,
    staleTime: 60_000,
  });

  const PlanIcon = PLAN_ICONS[sub?.plan] || Zap;
  const planColor = PLAN_COLORS[sub?.plan] || '#94a3b8';
  const planGradient = PLAN_GRADIENTS[sub?.plan] || PLAN_GRADIENTS.TRIAL;

  const outletPct = sub ? Math.min(100, (sub.outlets_used / (sub.plan_limits?.outlets || 1)) * 100) : 0;
  const staffPct  = sub ? Math.min(100, (sub.staff_used  / (sub.plan_limits?.staff  || 1)) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Subscription & Billing</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Manage your MS-RM plan and billing history
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      ) : !sub ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <Package className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
          <p style={{ color: 'var(--text-primary)' }}>Unable to load subscription data</p>
        </div>
      ) : (
        <>
          {/* Current Plan Card */}
          <div className="rounded-2xl p-6 text-white relative overflow-hidden"
            style={{ background: planGradient }}>
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: 'white', transform: 'translate(30%, -30%)' }} />
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <PlanIcon className="w-5 h-5 opacity-90" />
                    <span className="text-sm font-medium opacity-80">Current Plan</span>
                  </div>
                  <h2 className="text-3xl font-bold">{sub.plan}</h2>
                  <p className="text-lg opacity-80 mt-1">
                    {sub.plan_price === 0 ? 'Free' : `${format(sub.plan_price)}/month`}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${sub.is_active ? 'bg-white/20' : 'bg-red-500/30'}`}>
                    {sub.is_active ? <CheckCircle2 className="w-3 h-3" /> : null}
                    {sub.is_active ? 'Active' : 'Inactive'}
                  </div>
                  <p className="text-xs opacity-60 mt-2">
                    Member since {new Date(sub.member_since).toLocaleDateString(locale, { month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Usage */}
            <div className="rounded-xl p-5 space-y-4"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <TrendingUp className="w-4 h-4 text-indigo-400" /> Usage
              </h3>
              {[
                { label: 'Outlets',     used: sub.outlets_used, max: sub.plan_limits?.outlets, pct: outletPct, icon: Store,  color: '#6366f1' },
                { label: 'Staff Users', used: sub.staff_used,   max: sub.plan_limits?.staff,   pct: staffPct,  icon: Users, color: '#22c55e' },
              ].map(u => (
                <div key={u.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <u.icon className="w-3.5 h-3.5" style={{ color: u.color }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.label}</span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{u.used} / {u.max}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${u.pct}%`, background: u.pct > 90 ? '#ef4444' : u.color }} />
                  </div>
                  {u.pct > 80 && (
                    <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                      ⚠ Approaching limit — consider upgrading
                    </p>
                  )}
                </div>
              ))}

              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Included Features</p>
                <div className="flex flex-wrap gap-1.5">
                  {(sub.plan_limits?.features || []).map(f => (
                    <span key={f} className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: `${planColor}15`, color: planColor }}>
                      {f === 'all' ? '✓ All Features' : f.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Upgrade Options */}
            <div className="space-y-3">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Upgrade Plan</h3>
              {(sub.next_plans || []).map(np => {
                const NPIcon = PLAN_ICONS[np.plan] || Star;
                const npColor = PLAN_COLORS[np.plan] || '#94a3b8';
                return (
                  <div key={np.plan} className="rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
                    onClick={() => toast('Contact support@madsundigital.com to upgrade your plan')}
                    style={{ background: 'var(--bg-secondary)', border: `1px solid ${npColor}40` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${npColor}20` }}>
                          <NPIcon className="w-4 h-4" style={{ color: npColor }} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{np.plan}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {np.limits?.outlets} outlets · {np.limits?.staff} staff
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm" style={{ color: npColor }}>{format(np.price)}/mo</p>
                        <div className="flex items-center gap-1 mt-1">
                          <ArrowUp className="w-3 h-3" style={{ color: npColor }} />
                          <span className="text-xs" style={{ color: npColor }}>Upgrade</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!sub.next_plans || sub.next_plans.length === 0) && (
                <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <Crown className="w-8 h-8 mx-auto mb-2" style={{ color: '#4ade80' }} />
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>You're on the highest plan!</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Enterprise — all features unlocked</p>
                </div>
              )}
              <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                Contact support@madsundigital.com to upgrade
              </p>
            </div>
          </div>

          {/* Invoice History */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <FileText className="w-4 h-4 text-indigo-400" /> Invoice History
              </h3>
            </div>
            {!sub.invoices || sub.invoices.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <FileText className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No invoices yet</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {sub.invoices.map(inv => (
                  <div key={inv.id} className="px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(99,102,241,0.1)' }}>
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {inv.invoice_number || inv.id?.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(inv.created_at || inv.invoice_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: inv.status === 'PAID' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                          color: inv.status === 'PAID' ? '#4ade80' : '#f59e0b',
                        }}>
                        {inv.status}
                      </span>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {format(inv.amount || inv.total_amount || 0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
