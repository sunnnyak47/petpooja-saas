import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  ShoppingCart, ClipboardList, UtensilsCrossed,
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
  Core:       { accent: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  text: 'text-blue-400' },
  Operations: { accent: '#22c55e', bg: 'rgba(34,197,94,0.08)',   text: 'text-green-400' },
  Growth:     { accent: '#a855f7', bg: 'rgba(168,85,247,0.08)',  text: 'text-purple-400' },
  Analytics:  { accent: '#f97316', bg: 'rgba(249,115,22,0.08)',  text: 'text-orange-400' },
  Advanced:   { accent: '#ec4899', bg: 'rgba(236,72,153,0.08)',  text: 'text-pink-400' },
};

function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-600'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      role="switch"
      aria-checked={enabled}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function FeatureCard({ feature, enabled, onChange, saving }) {
  const Icon = FEATURE_ICONS[feature.key] || Layers;
  const catColor = CATEGORY_COLORS[feature.category] || CATEGORY_COLORS.Core;

  return (
    <div
      className="rounded-lg p-3.5 transition-all duration-200"
      style={{
        background: enabled ? catColor.bg : 'var(--bg-tertiary, rgba(255,255,255,0.02))',
        border: '1px solid var(--border)',
        borderLeft: enabled ? `3px solid ${catColor.accent}` : '1px solid var(--border)',
        opacity: enabled ? 1 : 0.65,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: enabled ? catColor.bg : 'rgba(255,255,255,0.04)' }}
          >
            <Icon className={`w-4 h-4 ${enabled ? catColor.text : 'text-gray-500'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {feature.label}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {feature.description}
            </p>
          </div>
        </div>
        <ToggleSwitch
          enabled={enabled}
          onChange={() => onChange(feature.key, !enabled)}
          disabled={saving}
        />
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
    // Backend listChains defaults to limit=20 (page 1 only); raise it so every
    // chain is configurable here, not just the 20 most-recently-created.
    queryFn: () => api.get('/superadmin/chains', { params: { limit: 500 } }),
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
    // The api interceptor rejects with new Error(message); the real reason lives
    // on err.message, not err.response.data.message (which is always undefined here).
    onError: (err) => toast.error(err?.message || 'Failed to save'),
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
    <div className="p-6 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Feature Access
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Enable or disable platform features per restaurant chain
          </p>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Chain Selector Card */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Restaurant Chain
            </label>
            <div className="relative">
              <select
                value={selectedChainId}
                onChange={e => { setSelectedChainId(e.target.value); setDirty(false); }}
                className="w-full rounded-lg px-3 py-2 text-sm font-medium appearance-none pr-9 cursor-pointer focus:outline-none focus:ring-1 focus:ring-white/10"
                style={{ background: 'var(--bg-tertiary, var(--bg-primary))', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                {chains.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.region === 'AU' ? 'Australia' : 'India'}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
            </div>
          </div>

          {selectedChain && (
            <div className="flex items-center gap-3 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ background: 'rgba(34,197,94,0.08)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-green-400">{enabledCount}</span>
                <span>enabled</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ background: 'rgba(239,68,68,0.06)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-red-400">{featureDefs.length - enabledCount}</span>
                <span>disabled</span>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                of {featureDefs.length} total
              </span>
            </div>
          )}
        </div>

        {/* Search + bulk actions */}
        {selectedChain && !isLoading && (
          <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search features..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-white/10"
                style={{ background: 'var(--bg-tertiary, var(--bg-primary))', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
            <button
              onClick={handleEnableAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Enable All
            </button>
            <button
              onClick={handleDisableAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <XCircle className="w-3.5 h-3.5" /> Disable All
            </button>
          </div>
        )}

        {/* Category filter pills */}
        {selectedChain && !isLoading && featureDefs.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {categories.map(cat => {
              const col = CATEGORY_COLORS[cat];
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? 'text-white'
                      : 'hover:bg-white/5'
                  }`}
                  style={{
                    background: isActive ? (col?.accent || 'rgba(255,255,255,0.15)') : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                  }}
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
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading features...</p>
        </div>
      )}

      {/* Feature grids by category */}
      {!isLoading && featureDefs.length > 0 && (
        <div className="space-y-5">
          {Object.entries(grouped).map(([category, features]) => {
            if (features.length === 0) return null;
            const col = CATEGORY_COLORS[category] || CATEGORY_COLORS.Core;
            const catEnabled = features.filter(f => localFeatures[f.key]).length;
            return (
              <div key={category}>
                {/* Category header */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-medium ${col.text}`}
                      style={{ background: col.bg }}
                    >
                      {category}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {catEnabled}/{features.length}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        const upd = { ...localFeatures };
                        features.forEach(f => { upd[f.key] = true; });
                        setLocalFeatures(upd); setDirty(true);
                      }}
                      className="text-xs font-medium transition-colors hover:opacity-80"
                      style={{ color: col.accent }}
                    >
                      All On
                    </button>
                    <button
                      onClick={() => {
                        const upd = { ...localFeatures };
                        features.forEach(f => { upd[f.key] = false; });
                        setLocalFeatures(upd); setDirty(true);
                      }}
                      className="text-xs font-medium transition-colors hover:opacity-80"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      All Off
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {features.map(feature => (
                    <FeatureCard
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

      {/* Unsaved changes bar */}
      {dirty && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-3 rounded-xl shadow-2xl z-50 backdrop-blur-xl"
          style={{ background: 'rgba(0,0,0,0.8)', color: '#fff' }}
        >
          <span className="text-sm font-medium">Unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => { setLocalFeatures(savedFeatures); setDirty(false); }}
            className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
