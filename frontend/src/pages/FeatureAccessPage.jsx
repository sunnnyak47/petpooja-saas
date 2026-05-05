import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  ToggleLeft, ToggleRight, ShoppingCart, ClipboardList, UtensilsCrossed,
  LayoutGrid, Users, UserCog, CreditCard, Tag, ChefHat, Clock, QrCode,
  Package, ShoppingBag, Warehouse, Globe2, Truck, Network, Heart,
  BarChart3, FileText, Timer, ShieldAlert, Zap, Sparkles, CalendarDays,
  Puzzle, Shield, CheckCircle2, XCircle, ChevronDown, Search, Layers,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// Icon map for feature keys
const FEATURE_ICONS = {
  pos: ShoppingCart, orders: ClipboardList, menu: UtensilsCrossed,
  tables: LayoutGrid, customers: Users, staff: UserCog,
  payments: CreditCard, discounts: Tag, kitchen: ChefHat,
  running_orders: Clock, qr_orders: QrCode, qr_codes: QrCode,
  inventory: Package, purchase_orders: ShoppingBag, central_kitchen: Warehouse,
  online_orders: Globe2, aggregators: Truck, ondc: Network, crm: Heart,
  reports: BarChart3, eod_report: FileText, prep_analytics: Timer,
  fraud: ShieldAlert, dynamic_pricing: Zap, festival_mode: Sparkles,
  rostering: CalendarDays, integrations: Puzzle, audit_log: Shield,
};

const CATEGORY_COLORS = {
  Core:       { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20' },
  Operations: { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20' },
  Growth:     { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  Analytics:  { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  Advanced:   { bg: 'bg-pink-500/10',   text: 'text-pink-400',   border: 'border-pink-500/20' },
};

function FeatureToggle({ feature, enabled, onChange, saving }) {
  const Icon = FEATURE_ICONS[feature.key] || Layers;
  const catColor = CATEGORY_COLORS[feature.category] || CATEGORY_COLORS.Core;

  return (
    <div
      className={`rounded-xl p-4 border transition-all duration-200 ${
        enabled
          ? `${catColor.bg} ${catColor.border}`
          : 'bg-white/2 border-white/5 opacity-60'
      }`}
      style={{ background: enabled ? undefined : 'var(--bg-tertiary, rgba(255,255,255,0.02))' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? catColor.bg : 'bg-white/5'}`}>
            <Icon className={`w-4 h-4 ${enabled ? catColor.text : 'text-gray-500'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {feature.label}
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {feature.description}
            </p>
          </div>
        </div>
        <button
          onClick={() => onChange(feature.key, !enabled)}
          disabled={saving}
          className="flex-shrink-0 transition-opacity disabled:opacity-40"
          title={enabled ? 'Click to disable' : 'Click to enable'}
        >
          {enabled
            ? <ToggleRight className={`w-8 h-8 ${catColor.text}`} />
            : <ToggleLeft className="w-8 h-8 text-gray-500" />}
        </button>
      </div>
    </div>
  );
}

export default function FeatureAccessPage() {
  const queryClient = useQueryClient();
  const [selectedChainId, setSelectedChainId] = useState('');
  const [localFeatures, setLocalFeatures] = useState({});
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  // Load all chains for the selector
  const { data: chainsData } = useQuery({
    queryKey: ['saas-chains'],
    queryFn: () => api.get('/superadmin/chains'),
  });
  const rawChains = chainsData?.data;
  const chains = Array.isArray(rawChains)
    ? rawChains
    : Array.isArray(rawChains?.chains) ? rawChains.chains : [];

  // Auto-select first chain
  useEffect(() => {
    if (chains.length > 0 && !selectedChainId) {
      setSelectedChainId(chains[0].id);
    }
  }, [chains, selectedChainId]);

  // Load features for selected chain
  const { data: featuresData, isLoading } = useQuery({
    queryKey: ['chain-features', selectedChainId],
    queryFn: () => api.get(`/superadmin/chains/${selectedChainId}/features`),
    enabled: !!selectedChainId,
  });

  const featureDefs = featuresData?.data?.feature_definitions || [];
  const savedFeatures = featuresData?.data?.features || {};

  // Sync local state when server data arrives
  useEffect(() => {
    if (featuresData?.data?.features) {
      setLocalFeatures(featuresData.data.features);
      setDirty(false);
    }
  }, [featuresData]);

  const { mutate: saveFeatures, isPending: saving } = useMutation({
    mutationFn: (features) =>
      api.patch(`/superadmin/chains/${selectedChainId}/features`, { features }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chain-features', selectedChainId] });
      setDirty(false);
      toast.success('Feature access updated!');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to save'),
  });

  const handleToggle = (key, value) => {
    setLocalFeatures(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleEnableAll = () => {
    const all = featureDefs.reduce((acc, f) => ({ ...acc, [f.key]: true }), {});
    setLocalFeatures(all);
    setDirty(true);
  };

  const handleDisableAll = () => {
    const none = featureDefs.reduce((acc, f) => ({ ...acc, [f.key]: false }), {});
    setLocalFeatures(none);
    setDirty(true);
  };

  const handleSave = () => saveFeatures(localFeatures);

  // Filter features by search + category
  const categories = ['All', ...new Set(featureDefs.map(f => f.category))];
  const filtered = featureDefs.filter(f => {
    const matchesSearch = !search
      || f.label.toLowerCase().includes(search.toLowerCase())
      || f.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === 'All' || f.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  const grouped = categories
    .filter(c => c !== 'All')
    .reduce((acc, cat) => {
      acc[cat] = filtered.filter(f => f.category === cat);
      return acc;
    }, {});

  const enabledCount = featureDefs.filter(f => localFeatures[f.key]).length;
  const selectedChain = chains.find(c => c.id === selectedChainId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Feature Access Control</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Enable or disable platform features per restaurant chain
          </p>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        )}
      </div>

      {/* Chain Selector */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <label className="text-xs font-black uppercase tracking-wide block mb-2" style={{ color: 'var(--text-secondary)' }}>
              Select Restaurant Chain
            </label>
            <div className="relative">
              <select
                value={selectedChainId}
                onChange={e => { setSelectedChainId(e.target.value); setDirty(false); }}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold appearance-none pr-10 cursor-pointer"
                style={{ background: 'var(--bg-tertiary, var(--bg-primary))', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                {chains.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.region === 'AU' ? '🇦🇺 Australia' : '🇮🇳 India'}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
            </div>
          </div>

          {selectedChain && (
            <div className="flex gap-3">
              {/* Stats pills */}
              <div className="rounded-xl px-4 py-2.5 text-center" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Enabled</p>
                <p className="text-xl font-black text-green-400">{enabledCount}</p>
              </div>
              <div className="rounded-xl px-4 py-2.5 text-center" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Disabled</p>
                <p className="text-xl font-black text-red-400">{featureDefs.length - enabledCount}</p>
              </div>
              <div className="rounded-xl px-4 py-2.5 text-center" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Total</p>
                <p className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{featureDefs.length}</p>
              </div>
            </div>
          )}
        </div>

        {/* Bulk actions + search */}
        {selectedChain && !isLoading && (
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search features…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
            <button
              onClick={handleEnableAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-green-400 hover:bg-green-500/10 transition-colors"
              style={{ border: '1px solid rgba(34,197,94,0.3)' }}
            >
              <CheckCircle2 className="w-4 h-4" /> Enable All
            </button>
            <button
              onClick={handleDisableAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors"
              style={{ border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <XCircle className="w-4 h-4" /> Disable All
            </button>
          </div>
        )}

        {/* Category filter pills */}
        {selectedChain && !isLoading && featureDefs.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {categories.map(cat => {
              const col = CATEGORY_COLORS[cat];
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    isActive
                      ? `${col?.bg || 'bg-white/10'} ${col?.text || 'text-white'}`
                      : 'hover:bg-white/5'
                  }`}
                  style={{ color: isActive ? undefined : 'var(--text-secondary)', border: `1px solid ${isActive ? 'transparent' : 'var(--border)'}` }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading features…</p>
        </div>
      )}

      {/* Feature grids by category */}
      {!isLoading && featureDefs.length > 0 && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, features]) => {
            if (features.length === 0) return null;
            const col = CATEGORY_COLORS[category] || CATEGORY_COLORS.Core;
            const catEnabled = features.filter(f => localFeatures[f.key]).length;
            return (
              <div key={category}>
                {/* Category header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wide ${col.bg} ${col.text}`}>
                      {category}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {catEnabled}/{features.length} enabled
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const upd = { ...localFeatures };
                        features.forEach(f => { upd[f.key] = true; });
                        setLocalFeatures(upd); setDirty(true);
                      }}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors ${col.bg} ${col.text} hover:opacity-80`}
                    >
                      All On
                    </button>
                    <button
                      onClick={() => {
                        const upd = { ...localFeatures };
                        features.forEach(f => { upd[f.key] = false; });
                        setLocalFeatures(upd); setDirty(true);
                      }}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors bg-white/5 hover:bg-white/10"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      All Off
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {features.map(feature => (
                    <FeatureToggle
                      key={feature.key}
                      feature={feature}
                      enabled={!!localFeatures[feature.key]}
                      onChange={handleToggle}
                      saving={saving}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unsaved changes footer bar */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-2xl shadow-2xl z-50"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          <span className="text-sm font-bold">You have unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-xl text-sm font-black transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Now'}
          </button>
          <button
            onClick={() => { setLocalFeatures(savedFeatures); setDirty(false); }}
            className="text-white/60 hover:text-white text-sm font-bold transition-colors"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
