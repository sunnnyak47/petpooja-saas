import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from '../lib/api';
import {
  Sparkles, MapPin, Calendar, ChefHat, Tag, Palette, Gift,
  ToggleLeft, ToggleRight, Zap, Star, Clock, AlertTriangle,
  CheckCircle, Eye, Trash2, Plus, X, Search, Filter,
  Globe, Flag, Flame, Leaf, Snowflake, Sun, CloudRain,
} from 'lucide-react';

/* ─── API helpers ─────────────────────────────────────────── */
const festApi = {
  detect:       (outletId, days) => axios.get(`/festival/detect?outlet_id=${outletId}&days_ahead=${days}`).then(r => r.data.data),
  master:       (country)        => axios.get(`/festival/master?country=${country}`).then(r => r.data.data),
  active:       (outletId)       => axios.get(`/festival/active?outlet_id=${outletId}`).then(r => r.data.data),
  configs:      (outletId)       => axios.get(`/festival/configs?outlet_id=${outletId}`).then(r => r.data.data),
  saveConfig:   (body)           => axios.post('/festival/configs', body).then(r => r.data.data),
  toggle:       (id, outletId)   => axios.post(`/festival/configs/${id}/toggle`, { outlet_id: outletId }).then(r => r.data.data),
  deleteConfig: (id, outletId)   => axios.delete(`/festival/configs/${id}?outlet_id=${outletId}`).then(r => r.data.data),
  menuSuggestions: (key, outletId) => axios.get(`/festival/menu-suggestions/${key}?outlet_id=${outletId}`).then(r => r.data.data),
};

/* ─── Constants ───────────────────────────────────────────── */
const URGENCY_COLOR = {
  high:   'bg-red-500/20 text-red-300 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
};
const URGENCY_LABEL = { high: '🔴 Starts Soon', medium: '🟡 Coming Up', low: '🟢 Upcoming' };

const SPECIAL_MODE_INFO = {
  sadhya:          { icon: '🍌', label: 'Sadhya Mode', desc: '26-dish banana leaf meal – authentic Kerala feast' },
  lohri_special:   { icon: '🔥', label: 'Lohri Mode', desc: 'Sarson, makki, til ladoo – bonfire winter menu' },
  pongal_special:  { icon: '🌾', label: 'Pongal Mode', desc: 'Ven Pongal, Sakkarai, Vada – harvest feast' },
  baisakhi_special:{ icon: '🌾', label: 'Baisakhi Mode', desc: 'Amritsari thali, bhangra vibes, dhol beats' },
  satvik:          { icon: '🙏', label: 'Satvik Mode', desc: 'No onion/garlic – pure vrat-friendly menu' },
  summer_christmas:{ icon: '☀️', label: 'Summer Xmas', desc: 'BBQ, seafood, pavlova – Aussie outdoor Christmas' },
};

const CATEGORY_ICONS = {
  pan_india: <Globe size={14} />,
  state_specific: <Flag size={14} />,
  australia: <span className="text-xs">🇦🇺</span>,
};

function SeasonIcon({ festival }) {
  const key = festival.festival_key || festival.key || '';
  if (['lohri','baisakhi'].includes(key)) return <Flame size={14} className="text-orange-400" />;
  if (['onam','vishu','ganesh_chaturthi'].includes(key)) return <Leaf size={14} className="text-green-400" />;
  if (['pongal'].includes(key)) return <Sun size={14} className="text-yellow-400" />;
  if (['diwali','navratri','durga_puja'].includes(key)) return <Sparkles size={14} className="text-amber-400" />;
  if (key.includes('eid') || key.includes('muharram')) return <span className="text-xs">🌙</span>;
  return <Star size={14} className="text-purple-400" />;
}

/* ─── Festival Card ───────────────────────────────────────── */
function FestivalCard({ festival, savedConfig, outletId, onActivate, onView, onConfigure }) {
  const isActive   = savedConfig?.is_active;
  const configured = !!savedConfig;
  const special    = festival.special_mode ? SPECIAL_MODE_INFO[festival.special_mode] : null;
  const theme      = festival.theme || {};

  return (
    <div className={`relative rounded-2xl border overflow-hidden transition-all duration-300 hover:scale-[1.01] ${
      isActive
        ? 'border-amber-400/60 shadow-lg shadow-amber-500/20'
        : 'border-white/10 hover:border-white/20'
    }`}
      style={isActive ? { background: `linear-gradient(135deg, ${theme.bg || '#1a1a00'}cc, #0f0f1a)` } : { background: 'rgba(255,255,255,0.04)' }}
    >
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` }} />
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{theme.emoji || '🎉'}</span>
              <div>
                <h3 className="font-bold text-white text-sm leading-tight">{festival.name || festival.festival_name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  {festival.days_until_start !== undefined && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${URGENCY_COLOR[festival.urgency]}`}>
                      {festival.is_ongoing ? '🟠 Ongoing' : URGENCY_LABEL[festival.urgency]}
                    </span>
                  )}
                  {festival.category && (
                    <span className="flex items-center gap-1 text-xs text-white/40">
                      {CATEGORY_ICONS[festival.category]}
                      {festival.category.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          {isActive && (
            <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 text-xs px-2 py-1 rounded-full border border-amber-500/30">
              <Zap size={10} /> ACTIVE
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="flex items-center gap-2 text-xs text-white/50 mb-3">
          <Calendar size={12} />
          <span>{new Date(festival.start || festival.start_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</span>
          <span>→</span>
          <span>{new Date(festival.end || festival.end_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</span>
          {festival.days_until_start !== undefined && festival.days_until_start > 0 && (
            <span className="ml-auto text-white/30">{festival.days_until_start}d away</span>
          )}
        </div>

        {/* Special Mode Badge */}
        {special && (
          <div className="flex items-center gap-2 bg-white/5 rounded-lg p-2 mb-3 border border-white/10">
            <span className="text-base">{special.icon}</span>
            <div>
              <div className="text-xs font-bold text-white">{special.label}</div>
              <div className="text-xs text-white/40">{special.desc}</div>
            </div>
          </div>
        )}

        {/* Theme preview */}
        {theme.primary && (
          <div className="flex items-center gap-1.5 mb-3">
            <Palette size={11} className="text-white/30" />
            <span className="text-xs text-white/30">Theme:</span>
            <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: theme.primary }} />
            <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: theme.accent }} />
            <span className="text-xs text-white/40 ml-1">{theme.style?.replace(/-/g,' ')}</span>
          </div>
        )}

        {/* Menu tags */}
        {(festival.menu_tags || []).slice(0, 4).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {(festival.menu_tags || []).slice(0, 4).map(t => (
              <span key={t} className="text-xs bg-white/5 text-white/40 px-2 py-0.5 rounded-full border border-white/10">
                {t.replace(/_/g,' ')}
              </span>
            ))}
          </div>
        )}

        {/* Offer */}
        {(festival.offer_structure) && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-3">
            <Gift size={11} />
            <span>{festival.offer_structure.label} — {festival.offer_structure.value}{festival.offer_structure.unit === 'percent' ? '%' : '₹'} off</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <button onClick={() => onView(festival)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors">
            <Eye size={12} /> Preview
          </button>
          <button onClick={() => onConfigure(festival)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors">
            <Plus size={12} /> {configured ? 'Edit' : 'Configure'}
          </button>
          {configured && (
            <button onClick={() => onActivate(savedConfig.id)}
              className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
              }`}>
              {isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {isActive ? 'On' : 'Off'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Menu Suggestions Modal ──────────────────────────────── */
function MenuSuggestionsModal({ festival, outletId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['festival-menu', festival.key || festival.festival_key, outletId],
    queryFn:  () => festApi.menuSuggestions(festival.key || festival.festival_key, outletId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{festival.theme?.emoji || '🎉'}</span>
            <div>
              <h2 className="font-bold text-white">{festival.name || festival.festival_name}</h2>
              <p className="text-xs text-white/40">Menu Suggestions & Matches</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
            </div>
          ) : data ? (
            <>
              {/* Special Mode */}
              {data.festival?.special_mode && SPECIAL_MODE_INFO[data.festival.special_mode] && (
                <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <span className="text-3xl">{SPECIAL_MODE_INFO[data.festival.special_mode].icon}</span>
                  <div>
                    <div className="font-bold text-amber-400">{SPECIAL_MODE_INFO[data.festival.special_mode].label}</div>
                    <div className="text-xs text-white/50">{SPECIAL_MODE_INFO[data.festival.special_mode].desc}</div>
                  </div>
                </div>
              )}

              {/* Offer Suggestion */}
              {data.offer_suggestion && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Gift size={14} className="text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">Suggested Offer</span>
                  </div>
                  <p className="text-white text-sm">{data.offer_suggestion.label}</p>
                  <p className="text-xs text-white/50 mt-1">
                    {data.offer_suggestion.value}{data.offer_suggestion.unit === 'percent' ? '%' : '₹'} off · Min order ₹{data.offer_suggestion.min_order}
                  </p>
                </div>
              )}

              {/* Your menu matches */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <ChefHat size={14} className="text-amber-400" />
                  Your Menu Matches ({data.total_matched})
                </h3>
                {data.menu_matches?.length > 0 ? (
                  <div className="space-y-2">
                    {data.menu_matches.map(item => (
                      <div key={item.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                        <div className={`w-2 h-2 rounded-full ${item.food_type === 'veg' ? 'bg-green-400' : 'bg-red-400'}`} />
                        <div className="flex-1">
                          <div className="text-sm text-white">{item.name}</div>
                          <div className="text-xs text-white/40">{item.category_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-white">₹{Number(item.base_price).toFixed(0)}</div>
                          <div className="flex gap-1 justify-end mt-1">
                            {Array.from({ length: Math.min(item.relevance_score, 3) }).map((_,i) => (
                              <Star key={i} size={8} className="text-amber-400 fill-amber-400" />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-white/30 text-sm bg-white/5 rounded-xl">
                    No exact menu matches found. Consider adding festival specials!
                  </div>
                )}
              </div>

              {/* Suggested items to add */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-400" />
                  Suggested Items to Add
                </h3>
                <div className="flex flex-wrap gap-2">
                  {data.suggested_items?.map(item => (
                    <span key={item} className="text-xs bg-purple-500/10 text-purple-300 px-3 py-1.5 rounded-full border border-purple-500/20">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Décor tips */}
              {data.decor_tips?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <Palette size={14} className="text-pink-400" />
                    Décor Tips
                  </h3>
                  <div className="space-y-1.5">
                    {data.decor_tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-white/60">
                        <span className="text-pink-400 mt-0.5">✦</span> {tip}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Configure Modal ─────────────────────────────────────── */
function ConfigureModal({ festival, savedConfig, outletId, onClose, onSave }) {
  const def = festival;
  const [form, setForm] = useState({
    festival_key:    def.key || def.festival_key || '',
    festival_name:   savedConfig?.festival_name || def.name || def.festival_name || '',
    start_date:      savedConfig?.start_date ? savedConfig.start_date.slice(0,10) : (def.start || ''),
    end_date:        savedConfig?.end_date   ? savedConfig.end_date.slice(0,10)   : (def.end   || ''),
    is_active:       savedConfig?.is_active ?? false,
    custom_banner:   savedConfig?.custom_banner || def.theme?.banner || '',
    offer_structure: savedConfig?.offer_structure || def.offer_structure || {},
    theme:           savedConfig?.theme || def.theme || {},
    menu_suggestions: savedConfig?.menu_suggestions || def.suggested_items || [],
    special_mode:    savedConfig?.special_mode || def.special_mode || '',
    outlet_id:       outletId,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="font-bold text-white">Configure Festival Mode</h2>
            <p className="text-xs text-white/40">{def.name || def.festival_name}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1 block">Festival Name</label>
            <input value={form.festival_name} onChange={e => set('festival_name', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">End Date</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1 block">Custom Banner Message</label>
            <input value={form.custom_banner} onChange={e => set('custom_banner', e.target.value)}
              placeholder="e.g. Happy Diwali! Special combos available."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
          </div>

          {/* Offer structure */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2"><Gift size={12} className="text-emerald-400" /> Offer Configuration</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Offer Label</label>
                <input value={form.offer_structure?.label || ''} onChange={e => set('offer_structure', { ...form.offer_structure, label: e.target.value })}
                  placeholder="e.g. Diwali Special Combo"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Discount %</label>
                <input type="number" value={form.offer_structure?.value || ''} onChange={e => set('offer_structure', { ...form.offer_structure, value: +e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-white/40 mb-1 block">Min Order Value (₹)</label>
              <input type="number" value={form.offer_structure?.min_order || ''} onChange={e => set('offer_structure', { ...form.offer_structure, min_order: +e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
            </div>
          </div>

          <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-sm text-white">Activate Now</div>
              <div className="text-xs text-white/40">Enable this festival mode for your restaurant</div>
            </div>
            <button onClick={() => set('is_active', !form.is_active)}
              className={`w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-amber-500' : 'bg-white/10'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5 ${form.is_active ? 'translate-x-6' : ''}`} />
            </button>
          </div>
        </div>

        <div className="p-5 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm text-white/60 border border-white/10 hover:border-white/20 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-black transition-all"
            style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)' }}>
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Active Mode Banner ──────────────────────────────────── */
function ActiveModeBanner({ activeMode, outletId, onToggle }) {
  if (!activeMode) return null;
  const theme = activeMode.theme || {};

  return (
    <div className="relative rounded-2xl overflow-hidden mb-6 border border-amber-400/30"
      style={{ background: `linear-gradient(135deg, ${theme.bg || '#1a1a00'}, #0f0f1a)` }}>
      <div className="absolute inset-0 opacity-10"
        style={{ background: `radial-gradient(circle at 30% 50%, ${theme.primary}, transparent 60%)` }} />
      <div className="relative p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-4xl">{theme.emoji || '🎉'}</span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Festival Mode Active</span>
            </div>
            <h2 className="text-xl font-bold text-white">{activeMode.festival_name}</h2>
            <p className="text-sm text-white/60 mt-0.5">{activeMode.custom_banner}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <div className="text-right">
              <div className="text-xs text-white/40">Until</div>
              <div className="text-sm font-semibold text-white">
                {new Date(activeMode.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </div>
            </div>
          </div>
          <button onClick={() => onToggle(activeMode.id)}
            className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full hover:bg-red-500/30 transition-colors">
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────── */
export default function FestivalModePage() {
  const outletId = localStorage.getItem('outlet_id') || '';
  const [tab, setTab]             = useState('upcoming');
  const [search, setSearch]       = useState('');
  const [countryFilter, setCountryFilter] = useState('IN');
  const [viewModal, setViewModal] = useState(null);
  const [configModal, setConfigModal] = useState(null);
  const qc = useQueryClient();

  const { data: detected, isLoading: loadingDetect } = useQuery({
    queryKey: ['festival-detect', outletId],
    queryFn:  () => festApi.detect(outletId, 60),
    enabled:  !!outletId,
    refetchInterval: 60000,
  });

  const { data: activeMode } = useQuery({
    queryKey: ['festival-active', outletId],
    queryFn:  () => festApi.active(outletId),
    enabled:  !!outletId,
    refetchInterval: 30000,
  });

  const { data: allFestivals } = useQuery({
    queryKey: ['festival-master', countryFilter],
    queryFn:  () => festApi.master(countryFilter),
    enabled:  tab === 'calendar',
  });

  const { data: savedConfigs } = useQuery({
    queryKey: ['festival-configs', outletId],
    queryFn:  () => festApi.configs(outletId),
    enabled:  !!outletId,
  });

  const saveMut = useMutation({
    mutationFn: festApi.saveConfig,
    onSuccess: () => {
      qc.invalidateQueries(['festival-detect', outletId]);
      qc.invalidateQueries(['festival-active', outletId]);
      qc.invalidateQueries(['festival-configs', outletId]);
      setConfigModal(null);
    },
  });

  const toggleMut = useMutation({
    mutationFn: (id) => festApi.toggle(id, outletId),
    onSuccess: () => {
      qc.invalidateQueries(['festival-detect', outletId]);
      qc.invalidateQueries(['festival-active', outletId]);
      qc.invalidateQueries(['festival-configs', outletId]);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => festApi.deleteConfig(id, outletId),
    onSuccess: () => qc.invalidateQueries(['festival-configs', outletId]),
  });

  const savedMap = Object.fromEntries((savedConfigs || []).map(s => [s.festival_key, s]));

  const upcomingFiltered = (detected?.upcoming || [])
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  const calendarFiltered = (Array.isArray(allFestivals) ? allFestivals : [])
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  const TABS = [
    { key: 'upcoming', label: 'Upcoming', icon: <Clock size={14} /> },
    { key: 'calendar', label: 'Full Calendar', icon: <Calendar size={14} /> },
    { key: 'configured', label: `My Configs (${savedConfigs?.length || 0})`, icon: <CheckCircle size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">🎊</span>
            Hyperlocal Festival Mode
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Auto-detect upcoming festivals · Region-specific menus · Instant theme activation
            {detected?.outlet && (
              <span className="ml-2 text-white/30">
                · <MapPin size={10} className="inline" /> {detected.outlet.region} · {detected.outlet.country}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            <option value="IN">🇮🇳 India</option>
            <option value="AU">🇦🇺 Australia</option>
          </select>
        </div>
      </div>

      {/* Active Mode Banner */}
      <ActiveModeBanner activeMode={activeMode} outletId={outletId} onToggle={toggleMut.mutate} />

      {/* Stats row */}
      {detected && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Upcoming (60d)', value: detected.upcoming?.length || 0, icon: '📅', color: 'text-blue-400' },
            { label: 'This Week', value: detected.upcoming?.filter(f => f.days_until_start <= 7).length || 0, icon: '⚡', color: 'text-amber-400' },
            { label: 'Ongoing Now', value: detected.upcoming?.filter(f => f.is_ongoing).length || 0, icon: '🔴', color: 'text-red-400' },
            { label: 'Configured', value: savedConfigs?.length || 0, icon: '✅', color: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <span>{s.icon}</span>
                <span className="text-xs text-white/40">{s.label}</span>
              </div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search festivals…"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50" />
      </div>

      {/* ── UPCOMING TAB ── */}
      {tab === 'upcoming' && (
        <>
          {loadingDetect ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
            </div>
          ) : upcomingFiltered.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Sparkles size={40} className="mx-auto mb-3 opacity-30" />
              <p>No upcoming festivals in the next 60 days for your region.</p>
              <p className="text-xs mt-2">Check the Full Calendar for all festivals.</p>
            </div>
          ) : (
            <>
              {/* Ongoing */}
              {upcomingFiltered.filter(f => f.is_ongoing).length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    Happening Now
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {upcomingFiltered.filter(f => f.is_ongoing).map(f => (
                      <FestivalCard key={f.key} festival={f} savedConfig={savedMap[f.key]}
                        outletId={outletId}
                        onActivate={toggleMut.mutate}
                        onView={() => setViewModal(f)}
                        onConfigure={() => setConfigModal(f)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Coming up */}
              {upcomingFiltered.filter(f => !f.is_ongoing).length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-white/50 mb-3">Coming Up</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {upcomingFiltered.filter(f => !f.is_ongoing).map(f => (
                      <FestivalCard key={f.key} festival={f} savedConfig={savedMap[f.key]}
                        outletId={outletId}
                        onActivate={toggleMut.mutate}
                        onView={() => setViewModal(f)}
                        onConfigure={() => setConfigModal(f)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── CALENDAR TAB ── */}
      {tab === 'calendar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {calendarFiltered.map(f => (
            <FestivalCard key={f.key} festival={f} savedConfig={savedMap[f.key]}
              outletId={outletId}
              onActivate={toggleMut.mutate}
              onView={() => setViewModal(f)}
              onConfigure={() => setConfigModal(f)} />
          ))}
        </div>
      )}

      {/* ── CONFIGURED TAB ── */}
      {tab === 'configured' && (
        <>
          {!savedConfigs?.length ? (
            <div className="text-center py-16 text-white/30">
              <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
              <p>No festival modes configured yet.</p>
              <p className="text-xs mt-2">Go to Upcoming and click Configure on any festival.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedConfigs.map(cfg => {
                const theme = cfg.theme || {};
                return (
                  <div key={cfg.id} className={`rounded-xl border p-4 flex items-center gap-4 ${
                    cfg.is_active ? 'border-amber-400/40 bg-amber-500/5' : 'border-white/10 bg-white/3'
                  }`}>
                    <span className="text-2xl">{theme.emoji || '🎉'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{cfg.festival_name}</span>
                        {cfg.is_active && (
                          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">ACTIVE</span>
                        )}
                        {cfg.special_mode && SPECIAL_MODE_INFO[cfg.special_mode] && (
                          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/30">
                            {SPECIAL_MODE_INFO[cfg.special_mode].icon} {SPECIAL_MODE_INFO[cfg.special_mode].label}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/40 mt-0.5">
                        {new Date(cfg.start_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })} →{' '}
                        {new Date(cfg.end_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
                        {cfg.custom_banner && <span className="ml-2 text-white/30">· {cfg.custom_banner.slice(0, 40)}…</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleMut.mutate(cfg.id)}
                        className={`p-2 rounded-lg text-xs transition-colors ${
                          cfg.is_active
                            ? 'bg-amber-500/20 text-amber-400 hover:bg-red-500/20 hover:text-red-400'
                            : 'bg-white/5 text-white/40 hover:bg-emerald-500/20 hover:text-emerald-400'
                        }`}>
                        {cfg.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => deleteMut.mutate(cfg.id)}
                        className="p-2 rounded-lg bg-white/5 text-white/30 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {viewModal && (
        <MenuSuggestionsModal festival={viewModal} outletId={outletId} onClose={() => setViewModal(null)} />
      )}
      {configModal && (
        <ConfigureModal
          festival={configModal}
          savedConfig={savedMap[configModal.key || configModal.festival_key]}
          outletId={outletId}
          onClose={() => setConfigModal(null)}
          onSave={(form) => saveMut.mutate(form)}
        />
      )}
    </div>
  );
}
