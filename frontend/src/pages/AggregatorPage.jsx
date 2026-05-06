/**
 * AggregatorPage — Full management hub for Swiggy, Zomato (India) and DoorDash AU, Menulog AU.
 * Features: connect/disconnect, store ID config, menu push, item availability, test order, sync logs.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import {
  Zap, ZapOff, UploadCloud, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Copy, Eye, EyeOff, Settings, Play, Clock,
  TrendingUp, ShoppingBag, ChevronDown, ChevronUp, Link2,
  Package, ToggleLeft, ToggleRight, Loader2, History,
  IndianRupee, DollarSign, Info, Globe,
} from 'lucide-react';

/* ── platform meta (mirrors backend PLATFORMS) ── */
const PLATFORM_META = {
  swiggy:   { name: 'Swiggy',       emoji: '🧡', color: '#FC8019', bg: 'rgba(252,128,25,0.12)', region: 'IN', hint: 'India' },
  zomato:   { name: 'Zomato',       emoji: '❤️',  color: '#E23744', bg: 'rgba(226,55,68,0.12)',  region: 'IN', hint: 'India' },
  doordash: { name: 'DoorDash AU',  emoji: '🔴',  color: '#FF3008', bg: 'rgba(255,48,8,0.12)',   region: 'AU', hint: 'Australia' },
  menulog:  { name: 'Menulog AU',   emoji: '🍽️',  color: '#E8172B', bg: 'rgba(232,23,43,0.12)',  region: 'AU', hint: 'Australia' },
};

const CURRENCY = { IN: '₹', AU: 'A$' };

function platformWebhookUrl(platformId) {
  const base = import.meta.env.VITE_API_URL || 'https://petpooja-saas.onrender.com/api';
  return `${base}/aggregators/webhook/${platformId}`;
}

/* ══════════════════════════════════════════════════════ */
export default function AggregatorPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const qc = useQueryClient();

  const [activeTab, setActiveTab]         = useState('connect');   // connect | menu | orders | logs
  const [expandedPlatform, setExpanded]   = useState(null);
  const [showSecrets, setShowSecrets]     = useState({});
  const [configDraft, setConfigDraft]     = useState({});          // { [platform]: { store_id, api_key, ... } }
  const [menuPreviewOpen, setMenuPreview] = useState(false);
  const [simulateOpen, setSimulateOpen]   = useState(null);        // platform id
  const [availOpen, setAvailOpen]         = useState(false);

  /* ── queries ── */
  const { data: configs = {}, isLoading: cfgLoading } = useQuery({
    queryKey: ['agg-configs', outletId],
    queryFn:  () => api.get(`/aggregators/config?outlet_id=${outletId}`).then(r => r.data),
    enabled:  !!outletId,
  });

  const { data: stats } = useQuery({
    queryKey: ['agg-stats', outletId],
    queryFn:  () => api.get(`/aggregators/orders/stats?outlet_id=${outletId}`).then(r => r.data),
    enabled:  !!outletId,
    refetchInterval: 60000,
  });

  const { data: syncLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['agg-logs', outletId],
    queryFn:  () => api.get(`/aggregators/logs?outlet_id=${outletId}&limit=60`).then(r => r.data),
    enabled:  !!outletId && activeTab === 'logs',
    refetchInterval: 30000,
  });

  const { data: menuPreview } = useQuery({
    queryKey: ['agg-menu-preview', outletId],
    queryFn:  () => api.get(`/aggregators/menu/preview?outlet_id=${outletId}`).then(r => r.data),
    enabled:  !!outletId && menuPreviewOpen,
  });

  /* ── mutations ── */
  const saveConfigMut = useMutation({
    mutationFn: ({ platform, fields }) =>
      api.put(`/aggregators/config/${platform}`, { outlet_id: outletId, ...fields }),
    onSuccess: (_, { platform }) => {
      toast.success(`${PLATFORM_META[platform].name} config saved`);
      qc.invalidateQueries({ queryKey: ['agg-configs', outletId] });
    },
    onError: (e) => toast.error(e.message),
  });

  const pushMenuMut = useMutation({
    mutationFn: (platform) =>
      api.post(`/aggregators/menu/push/${platform}`, { outlet_id: outletId }),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(`Menu pushed to ${d.platform} — ${d.items_synced} items${d.simulated ? ' (simulated)' : ''}`);
      qc.invalidateQueries({ queryKey: ['agg-configs', outletId] });
      qc.invalidateQueries({ queryKey: ['agg-logs', outletId] });
    },
    onError: (e) => toast.error(e.message),
  });

  const pushAllMut = useMutation({
    mutationFn: () => api.post('/aggregators/menu/push-all', { outlet_id: outletId }),
    onSuccess: (res) => {
      const results = res.data || [];
      const ok = results.filter(r => r.success).length;
      const fail = results.filter(r => !r.success).length;
      toast.success(`Menu pushed: ${ok} OK${fail ? `, ${fail} failed` : ''}`);
      qc.invalidateQueries({ queryKey: ['agg-configs', outletId] });
      qc.invalidateQueries({ queryKey: ['agg-logs', outletId] });
    },
    onError: (e) => toast.error(e.message),
  });

  const simulateMut = useMutation({
    mutationFn: (platform) =>
      api.post(`/aggregators/simulate/${platform}`, { outlet_id: outletId }),
    onSuccess: (res) => {
      toast.success(`Test order created: #${res.data?.order_number}`, { duration: 5000 });
      setSimulateOpen(null);
      qc.invalidateQueries({ queryKey: ['agg-logs', outletId] });
      qc.invalidateQueries({ queryKey: ['online-orders', outletId] });
    },
    onError: (e) => toast.error(e.message),
  });

  /* ── seed draft from server config ── */
  useEffect(() => {
    const draft = {};
    for (const [p, cfg] of Object.entries(configs)) {
      draft[p] = { store_id: cfg.store_id || '', api_key: cfg.api_key || '', webhook_secret: cfg.webhook_secret || '' };
    }
    setConfigDraft(draft);
  }, [configs]);

  const enabledCount = Object.values(configs).filter(c => c.enabled).length;

  /* ── top stats ── */
  const totalRevenue = stats?.total_revenue || 0;
  const totalOrders  = stats?.total_orders  || 0;

  /* ══ RENDER ══════════════════════════════════════════ */
  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title mb-0 flex items-center gap-2">
            <Globe className="w-6 h-6 text-brand-400" /> Delivery Aggregators
          </h1>
          <p className="text-sm text-surface-500 mt-0.5">
            {enabledCount} of {Object.keys(PLATFORM_META).length} platforms connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMenuPreview(true)}
            className="btn-surface text-sm flex items-center gap-2">
            <Eye className="w-4 h-4" /> Preview Menu
          </button>
          <button
            onClick={() => pushAllMut.mutate()}
            disabled={pushAllMut.isPending || enabledCount === 0}
            className="btn-primary text-sm flex items-center gap-2">
            {pushAllMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <UploadCloud className="w-4 h-4" />}
            Push Menu to All
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Today's Orders", value: totalOrders, icon: ShoppingBag, color: '#3b82f6' },
          { label: "Today's Revenue", value: `₹${Number(totalRevenue).toLocaleString('en-IN')}`, icon: TrendingUp, color: '#22c55e' },
          ...Object.entries(PLATFORM_META).map(([id, m]) => ({
            label: m.name,
            value: `${stats?.by_platform?.[id]?.count || 0} orders`,
            sub: `${CURRENCY[m.region]}${Number(stats?.by_platform?.[id]?.revenue || 0).toLocaleString()} rev`,
            color: m.color,
          })),
        ].slice(0, 4).map((s, i) => (
          <div key={i} className="rounded-2xl border p-4"
            style={{ borderColor: s.color + '30', background: s.color + '10' }}>
            <p className="text-xs text-surface-500 mb-1">{s.label}</p>
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
            {s.sub && <p className="text-xs text-surface-500 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-surface-800">
        {[
          { id: 'connect', label: '🔌 Connect' },
          { id: 'menu',    label: '📋 Menu Sync' },
          { id: 'orders',  label: '📦 Orders' },
          { id: 'logs',    label: '🕓 Sync Logs' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === t.id
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-surface-500 hover:text-surface-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB: CONNECT ══════════════════════════════════ */}
      {activeTab === 'connect' && (
        <div className="space-y-4">
          {Object.entries(PLATFORM_META).map(([platformId, meta]) => {
            const cfg     = configs[platformId] || {};
            const isOpen  = expandedPlatform === platformId;
            const draft   = configDraft[platformId] || {};
            const enabled = cfg.enabled === true || cfg.enabled === 'true';

            return (
              <div key={platformId} className="rounded-2xl border overflow-hidden transition-all"
                style={{ borderColor: enabled ? meta.color + '50' : 'var(--border)' }}>

                {/* platform header row */}
                <div className="flex items-center justify-between p-5 cursor-pointer"
                  style={{ background: enabled ? meta.bg : 'var(--bg-card)' }}
                  onClick={() => setExpanded(isOpen ? null : platformId)}>

                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{meta.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{meta.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border"
                          style={{ color: meta.color, borderColor: meta.color + '40', background: meta.color + '15' }}>
                          {meta.hint}
                        </span>
                        {enabled && cfg.store_id && (
                          <span className="flex items-center gap-1 text-[10px] text-success-400 font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Live
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 mt-0.5">
                        {enabled
                          ? `Store: ${cfg.store_id || 'not set'} · Last push: ${cfg.last_menu_push ? new Date(cfg.last_menu_push).toLocaleString() : 'never'}`
                          : 'Not connected'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* enable toggle */}
                    <button onClick={(e) => {
                      e.stopPropagation();
                      saveConfigMut.mutate({ platform: platformId, fields: { enabled: !enabled } });
                    }} className="p-1">
                      {enabled
                        ? <ToggleRight className="w-8 h-8" style={{ color: meta.color }} />
                        : <ToggleLeft className="w-8 h-8 text-surface-600" />}
                    </button>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
                  </div>
                </div>

                {/* expanded config panel */}
                {isOpen && (
                  <div className="px-5 pb-5 border-t space-y-5" style={{ borderColor: 'var(--border)' }}>

                    {/* step 1 — credentials */}
                    <div className="mt-5">
                      <h4 className="text-xs font-black text-surface-400 uppercase tracking-widest mb-3">
                        Step 1 — Connect Your Account
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-surface-400 mb-1">
                            {platformId === 'swiggy' ? 'Swiggy' : platformId === 'zomato' ? 'Zomato' : platformId === 'doordash' ? 'DoorDash' : 'Menulog'} Store / Restaurant ID *
                          </label>
                          <input type="text" className="input w-full font-mono text-sm"
                            placeholder={platformId === 'swiggy' ? 'e.g. SWG-12345' : platformId === 'zomato' ? 'e.g. 12345678' : platformId === 'doordash' ? 'e.g. store_abc123' : 'e.g. 98765'}
                            value={draft.store_id || ''}
                            onChange={e => setConfigDraft(d => ({ ...d, [platformId]: { ...d[platformId], store_id: e.target.value } }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-surface-400 mb-1">API Key (optional — for live sync)</label>
                          <div className="relative">
                            <input
                              type={showSecrets[platformId] ? 'text' : 'password'}
                              className="input w-full font-mono text-sm pr-10"
                              placeholder="Paste API key from partner dashboard"
                              value={draft.api_key || ''}
                              onChange={e => setConfigDraft(d => ({ ...d, [platformId]: { ...d[platformId], api_key: e.target.value } }))} />
                            <button type="button"
                              onClick={() => setShowSecrets(s => ({ ...s, [platformId]: !s[platformId] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white p-1">
                              {showSecrets[platformId] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => saveConfigMut.mutate({ platform: platformId, fields: { ...draft, enabled: String(enabled) } })}
                        disabled={saveConfigMut.isPending}
                        className="btn-primary mt-3 text-sm px-5">
                        {saveConfigMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Credentials'}
                      </button>
                    </div>

                    {/* step 2 — webhook URL */}
                    <div>
                      <h4 className="text-xs font-black text-surface-400 uppercase tracking-widest mb-3">
                        Step 2 — Paste this Webhook URL in your {meta.name} Partner Dashboard
                      </h4>
                      <div className="flex items-center gap-2 bg-surface-950 border border-surface-700 rounded-xl px-4 py-3">
                        <Link2 className="w-4 h-4 text-surface-500 shrink-0" />
                        <code className="flex-1 text-xs font-mono text-brand-400 truncate">
                          {platformWebhookUrl(platformId)}
                        </code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(platformWebhookUrl(platformId)); toast.success('Copied!'); }}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-surface-800 text-surface-500 hover:text-white transition-colors">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-surface-600 mt-2 flex items-start gap-1">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        When {meta.name} sends a new order, it will POST to this URL and the order will appear instantly in Online Orders.
                      </p>
                    </div>

                    {/* step 3 — actions */}
                    <div>
                      <h4 className="text-xs font-black text-surface-400 uppercase tracking-widest mb-3">
                        Step 3 — Sync Menu & Test
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => pushMenuMut.mutate(platformId)}
                          disabled={pushMenuMut.isPending || !enabled}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-700 text-sm font-medium text-surface-300 hover:bg-surface-800 disabled:opacity-40 transition-colors">
                          {pushMenuMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                          Push Menu Now
                        </button>
                        <button
                          onClick={() => setSimulateOpen(platformId)}
                          disabled={!enabled}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-700 text-sm font-medium text-surface-300 hover:bg-surface-800 disabled:opacity-40 transition-colors">
                          <Play className="w-4 h-4 text-success-400" />
                          Simulate Test Order
                        </button>
                      </div>
                      {!enabled && (
                        <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Enable the platform first using the toggle above.
                        </p>
                      )}
                    </div>

                    {/* last sync info */}
                    {(cfg.last_menu_push || cfg.last_order_pull) && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-surface-800">
                        <div className="text-xs">
                          <span className="text-surface-500">Last menu push:</span>
                          <span className="text-surface-300 ml-2 font-mono">
                            {cfg.last_menu_push ? new Date(cfg.last_menu_push).toLocaleString() : '—'}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-surface-500">Last order received:</span>
                          <span className="text-surface-300 ml-2 font-mono">
                            {cfg.last_order_pull ? new Date(cfg.last_order_pull).toLocaleString() : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ TAB: MENU SYNC ════════════════════════════════ */}
      {activeTab === 'menu' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <h3 className="font-bold text-white mb-1">How Menu Sync Works</h3>
            <p className="text-sm text-surface-400 mb-4">
              Every menu change in MS-RM (price, availability, new item) can be instantly pushed to all connected delivery platforms.
              No more manually updating each platform's tablet.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              {[
                { icon: '1️⃣', title: 'Edit menu in MS-RM', desc: 'Change price, add item, mark sold-out' },
                { icon: '2️⃣', title: 'Click Push Menu', desc: 'One click syncs to all platforms instantly' },
                { icon: '3️⃣', title: 'Customers see updates', desc: 'Swiggy, Zomato, DoorDash all updated live' },
              ].map(s => (
                <div key={s.title} className="bg-surface-800/40 rounded-xl p-4 border border-surface-700">
                  <span className="text-2xl">{s.icon}</span>
                  <p className="font-bold text-white mt-2">{s.title}</p>
                  <p className="text-surface-400 text-xs mt-1">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* per-platform push buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(PLATFORM_META).map(([id, meta]) => {
              const cfg = configs[id] || {};
              const enabled = cfg.enabled === true || cfg.enabled === 'true';
              return (
                <div key={id} className="rounded-2xl border p-4 flex items-center justify-between"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{meta.emoji}</span>
                    <div>
                      <p className="font-bold text-white text-sm">{meta.name}</p>
                      <p className="text-xs text-surface-500">
                        {enabled
                          ? cfg.last_menu_push
                            ? `Last pushed ${new Date(cfg.last_menu_push).toLocaleTimeString()}`
                            : 'Never pushed'
                          : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => pushMenuMut.mutate(id)}
                    disabled={!enabled || pushMenuMut.isPending}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                    style={{ background: meta.color + '20', color: meta.color, border: `1px solid ${meta.color}40` }}>
                    {pushMenuMut.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <UploadCloud className="w-3.5 h-3.5" />}
                    Push
                  </button>
                </div>
              );
            })}
          </div>

          {/* Push all */}
          <button
            onClick={() => pushAllMut.mutate()}
            disabled={pushAllMut.isPending || enabledCount === 0}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm font-bold">
            {pushAllMut.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Pushing…</>
              : <><UploadCloud className="w-4 h-4" /> Push Menu to All {enabledCount} Connected Platforms</>}
          </button>

          {enabledCount === 0 && (
            <p className="text-center text-surface-500 text-sm">
              Go to <strong className="text-white">Connect</strong> tab to enable platforms first.
            </p>
          )}
        </div>
      )}

      {/* ══ TAB: ORDERS ═══════════════════════════════════ */}
      {activeTab === 'orders' && <OrdersTab outletId={outletId} qc={qc} />}

      {/* ══ TAB: SYNC LOGS ════════════════════════════════ */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-surface-400">Last 60 sync events across all platforms</p>
            <button onClick={() => qc.invalidateQueries({ queryKey: ['agg-logs', outletId] })}
              className="btn-surface text-xs flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {logsLoading ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-surface-500" /></div>
          ) : syncLogs.length === 0 ? (
            <div className="py-20 text-center text-surface-500">
              <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No sync activity yet. Push your menu or simulate an order to get started.</p>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-left">
                <thead className="bg-surface-900 text-surface-500 text-[10px] font-black uppercase tracking-widest border-b border-surface-800">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/50 text-sm">
                  {syncLogs.map(log => {
                    const meta = PLATFORM_META[log.platform] || { name: log.platform, color: '#64748b', emoji: '🔗' };
                    return (
                      <tr key={log.id} className="hover:bg-surface-800/20 transition-colors">
                        <td className="px-4 py-3 text-surface-400 font-mono text-xs whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-xs font-bold"
                            style={{ color: meta.color }}>
                            {meta.emoji} {meta.name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-800 text-surface-300 uppercase">
                            {log.sync_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {log.status === 'success'
                            ? <span className="flex items-center gap-1 text-success-400 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" />Success</span>
                            : <span className="flex items-center gap-1 text-red-400 text-xs font-bold"><XCircle className="w-3.5 h-3.5" />Failed</span>}
                        </td>
                        <td className="px-4 py-3 text-surface-300 font-mono">{log.items_synced || '—'}</td>
                        <td className="px-4 py-3 text-surface-500 text-xs truncate max-w-[200px]">
                          {log.error_message || (log.response?.simulated ? '(simulated)' : (log.response?.message || '—'))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ MODALS ══════════════════════════════════════ */}

      {/* Menu Preview Modal */}
      <Modal isOpen={menuPreviewOpen} onClose={() => setMenuPreview(false)} title="Menu Preview — What Gets Pushed" size="xl">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {menuPreview ? (
            <>
              <div className="flex items-center gap-3 text-sm text-surface-400 mb-4">
                <span>{menuPreview.categories} categories</span>
                <span>·</span>
                <span className="text-white font-bold">{menuPreview.total_items} items</span>
              </div>
              {(menuPreview.menu || []).map(cat => (
                <div key={cat.category_id} className="rounded-xl border border-surface-700 overflow-hidden">
                  <div className="px-4 py-2.5 bg-surface-800 font-bold text-sm text-white flex items-center justify-between">
                    <span>{cat.category_name}</span>
                    <span className="text-xs text-surface-400">{cat.items.length} items</span>
                  </div>
                  <div className="divide-y divide-surface-800">
                    {cat.items.map(item => (
                      <div key={item.item_id} className="px-4 py-2.5 flex items-center justify-between hover:bg-surface-800/30">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full border-2 ${item.food_type === 'veg' ? 'border-success-500 bg-success-500/30' : 'border-red-500 bg-red-500/30'}`} />
                          <span className="text-sm text-white">{item.name}</span>
                          {!item.is_available && (
                            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">SOLD OUT</span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-sm text-white">₹{item.base_price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="py-20 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-surface-500" />
            </div>
          )}
        </div>
      </Modal>

      {/* Simulate Order Modal */}
      <Modal isOpen={!!simulateOpen} onClose={() => setSimulateOpen(null)}
        title={`Simulate ${PLATFORM_META[simulateOpen]?.name || ''} Order`} size="sm">
        <div className="space-y-4">
          <div className="bg-surface-800/50 rounded-xl p-4 text-sm text-surface-300 border border-surface-700">
            <p>This will create a <strong className="text-white">real test order</strong> in your system using a sample menu item, exactly as if {PLATFORM_META[simulateOpen]?.name} sent a webhook.</p>
            <p className="mt-2 text-surface-400">The order will appear in Online Orders → New Requests.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSimulateOpen(null)} className="btn-ghost flex-1">Cancel</button>
            <button
              onClick={() => simulateMut.mutate(simulateOpen)}
              disabled={simulateMut.isPending}
              className="btn-primary flex-1">
              {simulateMut.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                : `Fire Test Order →`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   ORDERS TAB — live kanban for all 4 platforms
────────────────────────────────────────────────────── */
function OrdersTab({ outletId, qc }) {
  const [filter, setFilter] = useState('all');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['agg-active-orders', outletId],
    queryFn:  () => api.get(`/aggregators/orders/active?outlet_id=${outletId}`).then(r => r.data),
    enabled:  !!outletId,
    refetchInterval: 20000,
  });

  const acceptMut = useMutation({
    mutationFn: ({ id, prep }) => api.post(`/aggregators/orders/${id}/accept`, { prep_time: prep }),
    onSuccess: () => { toast.success('Order accepted'); qc.invalidateQueries({ queryKey: ['agg-active-orders'] }); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/aggregators/orders/${id}/reject`, { reason }),
    onSuccess: () => { toast.success('Order rejected'); qc.invalidateQueries({ queryKey: ['agg-active-orders'] }); },
    onError: (e) => toast.error(e.message),
  });
  const readyMut = useMutation({
    mutationFn: (id) => api.post(`/aggregators/orders/${id}/ready`),
    onSuccess: () => { toast.success('Marked ready'); qc.invalidateQueries({ queryKey: ['agg-active-orders'] }); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = filter === 'all' ? orders : orders.filter(o => o.aggregator === filter);
  const cols = {
    new:       filtered.filter(o => o.status === 'created'),
    preparing: filtered.filter(o => ['confirmed', 'preparing'].includes(o.status)),
    ready:     filtered.filter(o => o.status === 'ready'),
  };

  if (isLoading) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-surface-500" /></div>;

  return (
    <div className="space-y-4">
      {/* platform filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...Object.keys(PLATFORM_META)].map(p => (
          <button key={p} onClick={() => setFilter(p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${filter === p
              ? 'border-brand-500 bg-brand-500/10 text-brand-400'
              : 'border-surface-700 text-surface-500 hover:text-surface-300'}`}>
            {p === 'all' ? 'All Platforms' : `${PLATFORM_META[p].emoji} ${PLATFORM_META[p].name}`}
          </button>
        ))}
      </div>

      {/* 3-column kanban */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { key: 'new',       label: '🔴 New',      dot: 'bg-red-500 animate-pulse' },
          { key: 'preparing', label: '🟡 Preparing', dot: 'bg-yellow-500' },
          { key: 'ready',     label: '🟢 Ready',     dot: 'bg-success-500' },
        ].map(col => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-xs font-black text-surface-300 uppercase tracking-widest">
                {col.label} ({cols[col.key].length})
              </span>
            </div>
            <div className="space-y-3 min-h-[120px]">
              {cols[col.key].map(order => (
                <AggOrderCard key={order.id} order={order}
                  onAccept={(prep) => acceptMut.mutate({ id: order.id, prep })}
                  onReject={() => {
                    const r = prompt('Reason for rejection?');
                    if (r) rejectMut.mutate({ id: order.id, reason: r });
                  }}
                  onReady={() => readyMut.mutate(order.id)} />
              ))}
              {cols[col.key].length === 0 && (
                <div className="py-10 text-center text-surface-700 text-xs border-2 border-dashed border-surface-800 rounded-2xl italic">
                  No orders
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AggOrderCard({ order, onAccept, onReject, onReady }) {
  const [prep, setPrep] = useState(20);
  const meta = PLATFORM_META[order.aggregator] || { name: order.aggregator, color: '#64748b', emoji: '📦' };

  return (
    <div className="rounded-2xl border p-4 space-y-3"
      style={{ borderColor: meta.color + '40', background: meta.color + '08' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.emoji}</span>
          <div>
            <span className="text-xs font-black" style={{ color: meta.color }}>{meta.name}</span>
            <p className="text-[10px] text-surface-500 font-mono">
              #{(order.aggregator_order_id || '').slice(-8).toUpperCase()}
            </p>
          </div>
        </div>
        <span className="text-xs text-surface-500">
          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="space-y-1.5">
        {(order.order_items || []).map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-white">{item.quantity}× {item.name}</span>
            <span className="text-surface-400 font-mono text-xs">₹{item.item_total}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-surface-800">
        <span className="text-xs text-surface-400">{order.customer_name || 'Online Order'}</span>
        <span className="font-black text-white">₹{order.grand_total}</span>
      </div>

      {order.status === 'created' && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {[15, 20, 30, 45].map(t => (
              <button key={t} onClick={() => setPrep(t)}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all ${prep === t ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
                {t}m
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => onAccept(prep)}
              className="flex-1 py-2 rounded-xl bg-success-600 hover:bg-success-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Accept
            </button>
            <button onClick={onReject}
              className="px-3 py-2 rounded-xl bg-surface-800 hover:bg-red-500/20 text-red-400 transition-colors">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {(order.status === 'confirmed' || order.status === 'preparing') && (
        <button onClick={onReady}
          className="w-full py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold transition-colors">
          Mark Ready ✓
        </button>
      )}
    </div>
  );
}
