import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Puzzle, ToggleLeft, ToggleRight, Settings, CheckCircle2,
  AlertTriangle, ArrowRight
} from 'lucide-react';

const INTEGRATIONS = [
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

const CATEGORIES = ['All', ...new Set(INTEGRATIONS.map(i => i.category))];

/**
 * M14: Integrations Hub Page
 */
export default function IntegrationsPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
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

                {isExpanded && isEnabled && (
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
