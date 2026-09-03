import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useRegion } from '../hooks/useRegion';
import {
  Puzzle, ToggleLeft, ToggleRight, Settings, CheckCircle2,
  AlertTriangle, ArrowRight, Loader2, Link2
} from 'lucide-react';

const INTEGRATIONS_IN = [
  {
    id: 'zomato', name: 'Zomato', category: 'Delivery',
    description: 'Sync menus and receive orders from Zomato',
    logo: '🍕', color: 'bg-red-500/20 text-red-400 border-red-500/30',
    fields: [{ key: 'zomato_id', label: 'Restaurant ID', placeholder: 'res_xxxxx' }],
  },
  {
    id: 'swiggy', name: 'Swiggy', category: 'Delivery',
    description: 'Sync menus and receive orders from Swiggy',
    logo: '🥡', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    fields: [{ key: 'swiggy_id', label: 'Restaurant ID', placeholder: 'xxxxx' }],
  },
  {
    id: 'razorpay', name: 'Razorpay', category: 'Payment',
    description: 'Accept UPI, cards, wallets, and net banking',
    logo: '💳', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    fields: [
      { key: 'razorpay_key', label: 'Key ID', placeholder: 'rzp_live_...' },
      { key: 'razorpay_secret', label: 'Key Secret', placeholder: '***', type: 'password' },
    ],
  },
  {
    id: 'tally', name: 'Tally Prime', category: 'Accounting',
    description: 'Sync daily sales, GST reports, and ledger entries',
    logo: '📊', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    fields: [{ key: 'tally_host', label: 'Tally Server IP', placeholder: '192.168.1.x' }],
  },
  {
    id: 'whatsapp', name: 'WhatsApp Business', category: 'Communication',
    description: 'Send order confirmations and bills via WhatsApp',
    logo: '📱', color: 'bg-green-500/20 text-green-400 border-green-500/30',
    fields: [{ key: 'whatsapp_number', label: 'Business Number', placeholder: '+919876543210' }],
  },
  {
    id: 'google_reviews', name: 'Google Reviews', category: 'Marketing',
    description: 'Auto-request reviews after successful orders',
    logo: '⭐', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    fields: [{ key: 'google_place_id', label: 'Place ID', placeholder: 'ChIJ...' }],
  },
  {
    id: 'pine_labs', name: 'Pine Labs', category: 'Payment',
    description: 'Accept card payments via Pine Labs EDC terminal',
    logo: '🏧', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    fields: [{ key: 'pine_labs_merchant_id', label: 'Merchant ID', placeholder: 'ML-xxxxx' }],
  },
  {
    id: 'gst_portal', name: 'GST Portal', category: 'Tax',
    description: 'Auto-generate GSTR-1 and GSTR-3B returns',
    logo: '🏛️', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    fields: [{ key: 'gstin', label: 'GSTIN', placeholder: '22AAAAA0000A1Z5' }],
  },
];

const INTEGRATIONS_AU = [
  {
    id: 'ubereats', name: 'Uber Eats', category: 'Delivery',
    description: 'Sync menus and receive orders from Uber Eats',
    logo: '🛵', color: 'bg-black/20 text-gray-300 border-gray-500/30',
    fields: [{ key: 'ubereats_store_id', label: 'Store ID', placeholder: 'store_xxxxx' }],
  },
  {
    id: 'doordash', name: 'DoorDash', category: 'Delivery',
    description: 'Sync menus and receive orders from DoorDash',
    logo: '🚪', color: 'bg-red-500/20 text-red-400 border-red-500/30',
    fields: [{ key: 'doordash_store_id', label: 'Store ID', placeholder: 'xxxxx' }],
  },
  {
    id: 'menulog', name: 'Menulog', category: 'Delivery',
    description: 'Sync menus and receive orders from Menulog',
    logo: '🍔', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    fields: [{ key: 'menulog_id', label: 'Restaurant ID', placeholder: 'xxxxx' }],
  },
  {
    id: 'tyro', name: 'Tyro', category: 'Payment',
    description: 'Accept card payments via Tyro EFTPOS terminal',
    logo: '💳', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    // custom: true means render TyroPanel instead of the generic field list
    custom: 'tyro',
    fields: [],
  },
  {
    id: 'square', name: 'Square', category: 'Payment',
    description: 'Accept card payments via Square terminal',
    logo: '◼️', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    fields: [{ key: 'square_location_id', label: 'Location ID', placeholder: 'L-xxxxx' }],
  },
  {
    id: 'xero', name: 'Xero', category: 'Accounting',
    description: 'Sync daily sales, GST, and BAS to Xero',
    logo: '🔵', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    fields: [{ key: 'xero_tenant_id', label: 'Tenant ID', placeholder: 'org_xxxxx' }],
  },
  {
    id: 'myob', name: 'MYOB', category: 'Accounting',
    description: 'Sync sales and invoices to MYOB AccountRight',
    logo: '📒', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    fields: [{ key: 'myob_company_file', label: 'Company File ID', placeholder: 'cf_xxxxx' }],
  },
  {
    id: 'whatsapp', name: 'WhatsApp Business', category: 'Communication',
    description: 'Send order confirmations and bills via WhatsApp',
    logo: '📱', color: 'bg-green-500/20 text-green-400 border-green-500/30',
    fields: [{ key: 'whatsapp_number', label: 'Business Number', placeholder: '+61xxxxxxxxx' }],
  },
  {
    id: 'google_reviews', name: 'Google Reviews', category: 'Marketing',
    description: 'Auto-request reviews after successful orders',
    logo: '⭐', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    fields: [{ key: 'google_place_id', label: 'Place ID', placeholder: 'ChIJ...' }],
  },
  {
    id: 'ato_bas', name: 'ATO BAS', category: 'Tax',
    description: 'Auto-generate BAS returns and lodge to ATO',
    logo: '🏛️', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    fields: [{ key: 'abn', label: 'ABN', placeholder: '11 222 333 444' }],
  },
];

/**
 * M14: Integrations Hub Page
 */
export default function IntegrationsPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const region = useRegion();
  const INTEGRATIONS = region === 'AU' ? INTEGRATIONS_AU : INTEGRATIONS_IN;
  const CATEGORIES = ['All', ...new Set(INTEGRATIONS.map(i => i.category))];
  const [activeCategory, setActiveCategory] = useState('All');
  const [enabledMap, setEnabledMap] = useState({});
  const [configMap, setConfigMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const saveMutation = useMutation({
    mutationFn: ({ integrationId, config }) =>
      api.put('/integrations/config', { outlet_id: outletId, integration: integrationId, config }),
    onSuccess: () => toast.success('Integration settings saved'),
    onError: (e) => toast.error(e.message),
  });

  const filtered = activeCategory === 'All' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === activeCategory);

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Puzzle className="w-7 h-7 text-brand-400" /> Integrations Hub
          </h1>
          <p className="text-sm text-surface-400 mt-1">Connect your restaurant to third-party services</p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setActiveCategory(c)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === c ? 'tab-btn-active' : 'tab-btn'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Integration Cards */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {filtered.map((integ) => {
          const isEnabled = enabledMap[integ.id];
          const isExpanded = expandedId === integ.id;
          return (
            <div key={integ.id} className={`bg-surface-900 rounded-2xl border transition-all ${isEnabled ? 'border-brand-500/50' : 'border-surface-800'}`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl p-2 rounded-xl border ${integ.color}`}>{integ.logo}</span>
                    <div>
                      <h3 className="text-white font-bold">{integ.name}</h3>
                      <span className="text-xs text-surface-400">{integ.category}</span>
                    </div>
                  </div>
                  <button onClick={() => setEnabledMap({ ...enabledMap, [integ.id]: !isEnabled })}
                    className="text-surface-400 hover:text-brand-400 transition-colors">
                    {isEnabled ? <ToggleRight className="w-7 h-7 text-brand-400" /> : <ToggleLeft className="w-7 h-7" />}
                  </button>
                </div>
                <p className="text-sm text-surface-400 mb-4">{integ.description}</p>

                {isEnabled && (
                  <button onClick={() => setExpandedId(isExpanded ? null : integ.id)}
                    className="flex items-center gap-1 text-xs text-brand-400 font-bold hover:text-brand-300 transition-colors">
                    <Settings className="w-3.5 h-3.5" /> Configure <ArrowRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                )}

                {isExpanded && isEnabled && integ.custom === 'tyro' && (
                  <TyroPanel outletId={outletId} />
                )}
                {isExpanded && isEnabled && !integ.custom && (
                  <div className="mt-4 pt-4 border-t border-surface-800 space-y-3 animate-slide-down">
                    {integ.fields.map((f) => (
                      <div key={f.key}>
                        <label className="text-xs text-surface-400 font-bold mb-1 block">{f.label}</label>
                        <input type={f.type || 'text'}
                          value={configMap[`${integ.id}_${f.key}`] || ''}
                          onChange={(e) => setConfigMap({ ...configMap, [`${integ.id}_${f.key}`]: e.target.value })}
                          className="input w-full font-mono text-sm" placeholder={f.placeholder} />
                      </div>
                    ))}
                    <button onClick={() => {
                      const config = {};
                      integ.fields.forEach(f => { config[f.key] = configMap[`${integ.id}_${f.key}`] || ''; });
                      saveMutation.mutate({ integrationId: integ.id, config });
                    }} className="btn-primary w-full py-2 text-sm">Save Configuration</button>
                  </div>
                )}
              </div>

              {/* Status Footer */}
              <div className={`px-5 py-2.5 border-t flex items-center gap-2 text-xs font-bold ${isEnabled ? 'border-brand-500/30 text-brand-400 bg-brand-500/5' : 'border-surface-800 text-surface-500'}`}>
                {isEnabled ? <><CheckCircle2 className="w-3.5 h-3.5" /> Connected</> : <><AlertTriangle className="w-3.5 h-3.5" /> Disconnected</>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Tyro EFTPOS configuration + pairing panel.
 * Persists to /api/integrations/tyro/config; "Test Connection" hits /test,
 * "Pair Terminal" hits /pair. Secrets are stored server-side; the UI receives
 * masked values (••••1234) and re-sends a blank api_key to preserve the stored
 * secret unchanged.
 */
function TyroPanel({ outletId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    mid: '', tid: '', merchant_name: '',
    api_key: '',
    pos_product_name: 'PetPooja POS',
    pos_product_vendor: 'PetPooja',
    pos_product_version: '1.0.0',
    environment: 'sandbox',
  });
  const [testResult, setTestResult] = useState(null);

  const { data: saved } = useQuery({
    queryKey: ['tyro-config', outletId],
    queryFn: () => api.get('/integrations/tyro/config', { params: { outlet_id: outletId } }).then(r => r.data?.data || r.data),
    enabled: !!outletId,
  });

  useEffect(() => {
    if (!saved) return;
    setForm(f => ({
      ...f,
      mid: saved.mid || '',
      tid: saved.tid || '',
      merchant_name: saved.merchant_name || '',
      pos_product_name: saved.pos_product_name || f.pos_product_name,
      pos_product_vendor: saved.pos_product_vendor || f.pos_product_vendor,
      pos_product_version: saved.pos_product_version || f.pos_product_version,
      environment: saved.environment || 'sandbox',
      // leave api_key blank — user only types it when rotating
    }));
  }, [saved]);

  const save = useMutation({
    mutationFn: () => api.put('/integrations/tyro/config', { outlet_id: outletId, ...form }),
    onSuccess: () => {
      toast.success('Tyro configuration saved');
      qc.invalidateQueries({ queryKey: ['tyro-config', outletId] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message),
  });

  const test = useMutation({
    mutationFn: () => api.post('/integrations/tyro/test', { outlet_id: outletId }).then(r => r.data),
    onSuccess: (res) => {
      const payload = res?.data || res;
      setTestResult({ ok: true, ...payload });
      toast.success('Setup successful — Tyro is reachable');
    },
    onError: (e) => {
      const payload = e?.response?.data;
      setTestResult({ ok: false, ...(payload || { errors: [e.message] }) });
      toast.error(payload?.message || e.message || 'Tyro test failed');
    },
  });

  const pair = useMutation({
    mutationFn: () => api.post('/integrations/tyro/pair', { outlet_id: outletId }).then(r => r.data),
    onSuccess: () => {
      toast.success('Terminal paired with Tyro');
      qc.invalidateQueries({ queryKey: ['tyro-config', outletId] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message),
  });

  const field = (key, label, opts = {}) => (
    <div>
      <label className="text-xs text-surface-400 font-bold mb-1 block">
        {label}{opts.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={opts.type || 'text'}
        inputMode={opts.inputMode}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="input w-full font-mono text-sm"
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
      />
      {opts.help && <p className="text-[10px] text-surface-500 mt-1">{opts.help}</p>}
    </div>
  );

  return (
    <div className="mt-4 pt-4 border-t border-surface-800 space-y-3 animate-slide-down">
      <div className="grid grid-cols-2 gap-3">
        {field('mid', 'Merchant ID (MID)', { required: true, placeholder: 'e.g. 12345678', help: 'Provided by Tyro when you sign up.' })}
        {field('tid', 'Terminal ID (TID)', { required: true, placeholder: '8 digits', inputMode: 'numeric', maxLength: 8, help: 'On the sticker on the back of your Tyro terminal.' })}
      </div>
      {field('merchant_name', 'Merchant / Trading Name', { required: true, placeholder: 'Printed on receipts' })}

      <div className="grid grid-cols-3 gap-3">
        {field('pos_product_name', 'POS Product Name')}
        {field('pos_product_vendor', 'POS Vendor')}
        {field('pos_product_version', 'POS Version')}
      </div>

      <div>
        <label className="text-xs text-surface-400 font-bold mb-1 block">API Key {saved?.has_api_key && <span className="text-emerald-400 font-normal">(saved · {saved.api_key_masked})</span>}</label>
        <input
          type="password"
          value={form.api_key}
          onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          className="input w-full font-mono text-sm"
          placeholder={saved?.has_api_key ? 'Leave blank to keep existing key' : 'Bearer token from Tyro dashboard'}
        />
      </div>

      <div>
        <label className="text-xs text-surface-400 font-bold mb-1 block">Environment</label>
        <select
          value={form.environment}
          onChange={(e) => setForm({ ...form, environment: e.target.value })}
          className="input w-full text-sm">
          <option value="sandbox">Sandbox (test)</option>
          <option value="production">Production (live payments)</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary flex-1 py-2 text-sm">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Configuration'}
        </button>
        <button onClick={() => test.mutate()} disabled={test.isPending} className="btn-secondary flex-1 py-2 text-sm">
          {test.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test Connection'}
        </button>
      </div>

      <button
        onClick={() => pair.mutate()}
        disabled={pair.isPending || !saved?.mid}
        className="w-full py-2 text-sm rounded-lg border border-brand-500/40 text-brand-300 hover:bg-brand-500/10 flex items-center justify-center gap-2 disabled:opacity-50">
        <Link2 className="w-4 h-4" />
        {pair.isPending ? 'Pairing…' : (saved?.paired ? `Re-pair Terminal (paired · ${saved.integration_key_masked})` : 'Pair Terminal')}
      </button>

      {testResult && (
        <div className={`mt-2 p-3 rounded-lg text-xs border ${
          testResult.ok
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {testResult.ok ? (
            <>
              <div className="flex items-center gap-2 font-bold mb-1">
                <CheckCircle2 className="w-4 h-4" /> Setup successful
              </div>
              <div className="opacity-90">{testResult.message || 'Ready to pair terminal.'}</div>
              {testResult.details && (
                <ul className="mt-1 space-y-0.5 opacity-75 font-mono text-[10px]">
                  <li>MID: {testResult.details.mid} · TID: {testResult.details.tid}</li>
                  <li>Env: {testResult.details.environment} · Host: {testResult.details.host}</li>
                  <li>Paired: {testResult.details.paired ? 'yes' : 'no'}</li>
                </ul>
              )}
              {testResult.warnings?.length > 0 && (
                <ul className="mt-2 text-yellow-300/90 list-disc pl-4">
                  {testResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 font-bold mb-1">
                <AlertTriangle className="w-4 h-4" /> {testResult.message || 'Test failed'}
              </div>
              {testResult.errors?.length > 0 && (
                <ul className="list-disc pl-4 opacity-90">
                  {testResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
