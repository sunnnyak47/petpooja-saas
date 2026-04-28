import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from '../lib/api';
import {
  Sparkles, MapPin, Calendar, ChefHat, Tag, Palette, Gift,
  ToggleLeft, ToggleRight, Zap, Star, Clock, AlertTriangle,
  CheckCircle, Eye, Trash2, Plus, X, Search,
  Globe, Flag, Flame, Leaf, Sun,
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
  high:   'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/30',
  medium: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30',
  low:    'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/30',
};
const URGENCY_LABEL = { high: '🔴 Starts Soon', medium: '🟡 Coming Up', low: '🟢 Upcoming' };

const SPECIAL_MODE_INFO = {
  sadhya:          { icon: '🍌', label: 'Sadhya Mode',    desc: '26-dish banana leaf meal – authentic Kerala feast' },
  lohri_special:   { icon: '🔥', label: 'Lohri Mode',     desc: 'Sarson, makki, til ladoo – bonfire winter menu' },
  pongal_special:  { icon: '🌾', label: 'Pongal Mode',    desc: 'Ven Pongal, Sakkarai, Vada – harvest feast' },
  baisakhi_special:{ icon: '🌾', label: 'Baisakhi Mode',  desc: 'Amritsari thali, bhangra vibes, dhol beats' },
  satvik:          { icon: '🙏', label: 'Satvik Mode',    desc: 'No onion/garlic – pure vrat-friendly menu' },
  summer_christmas:{ icon: '☀️', label: 'Summer Xmas',    desc: 'BBQ, seafood, pavlova – Aussie outdoor Christmas' },
};

const CATEGORY_ICONS = {
  pan_india:      <Globe size={12} />,
  state_specific: <Flag size={12} />,
  australia:      <span className="text-xs">🇦🇺</span>,
};

function SeasonIcon({ festival }) {
  const key = festival.festival_key || festival.key || '';
  if (['lohri', 'baisakhi'].includes(key)) return <Flame size={12} className="text-orange-500" />;
  if (['onam', 'vishu', 'ganesh_chaturthi'].includes(key)) return <Leaf size={12} className="text-green-500" />;
  if (['pongal'].includes(key)) return <Sun size={12} className="text-yellow-500" />;
  if (['diwali', 'navratri', 'durga_puja'].includes(key)) return <Sparkles size={12} className="text-amber-500" />;
  return <Star size={12} className="text-purple-500" />;
}

/* ─── Festival Card ───────────────────────────────────────── */
function FestivalCard({ festival, savedConfig, outletId, onActivate, onView, onConfigure }) {
  const isActive   = savedConfig?.is_active;
  const configured = !!savedConfig;
  const special    = festival.special_mode ? SPECIAL_MODE_INFO[festival.special_mode] : null;
  const theme      = festival.theme || {};

  return (
    <div className={`relative rounded-2xl border overflow-hidden transition-all duration-300 hover:shadow-md bg-surface-900 ${
      isActive
        ? 'border-amber-400 shadow-sm shadow-amber-200 dark:shadow-amber-500/20'
        : 'border-surface-800 hover:border-surface-700'
    }`}>
      {/* Active accent bar */}
      {isActive && theme.primary && (
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent || theme.primary})` }} />
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-2xl">{theme.emoji || '🎉'}</span>
            <div>
              <h3 className="font-bold text-surface-50 text-sm leading-tight">{festival.name || festival.festival_name}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                {festival.days_until_start !== undefined && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${URGENCY_COLOR[festival.urgency]}`}>
                    {festival.is_ongoing ? '🟠 Ongoing' : URGENCY_LABEL[festival.urgency]}
                  </span>
                )}
                {festival.category && (
                  <span className="flex items-center gap-1 text-xs text-surface-400">
                    {CATEGORY_ICONS[festival.category]}
                    {festival.category.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>
          {isActive && (
            <div className="flex items-center gap-1 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs px-2 py-1 rounded-full border border-amber-300 dark:border-amber-500/30 shrink-0">
              <Zap size={10} /> ACTIVE
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="flex items-center gap-2 text-xs text-surface-400 mb-3">
          <Calendar size={11} />
          <span>{new Date(festival.start || festival.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          <span>→</span>
          <span>{new Date(festival.end || festival.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          {festival.days_until_start !== undefined && festival.days_until_start > 0 && (
            <span className="ml-auto text-surface-500">{festival.days_until_start}d away</span>
          )}
        </div>

        {/* Special Mode Badge */}
        {special && (
          <div className="flex items-center gap-2 bg-surface-800 rounded-lg p-2 mb-3 border border-surface-700">
            <span className="text-base">{special.icon}</span>
            <div>
              <div className="text-xs font-bold text-surface-100">{special.label}</div>
              <div className="text-xs text-surface-400">{special.desc}</div>
            </div>
          </div>
        )}

        {/* Theme preview */}
        {theme.primary && (
          <div className="flex items-center gap-1.5 mb-3">
            <Palette size={11} className="text-surface-400" />
            <span className="text-xs text-surface-400">Theme:</span>
            <div className="w-4 h-4 rounded-full border border-surface-600 shadow-sm" style={{ background: theme.primary }} />
            {theme.accent && <div className="w-4 h-4 rounded-full border border-surface-600 shadow-sm" style={{ background: theme.accent }} />}
            <span className="text-xs text-surface-400 ml-1">{theme.style?.replace(/-/g, ' ')}</span>
          </div>
        )}

        {/* Menu tags */}
        {(festival.menu_tags || []).slice(0, 4).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {(festival.menu_tags || []).slice(0, 4).map(t => (
              <span key={t} className="text-xs bg-surface-800 text-surface-400 px-2 py-0.5 rounded-full border border-surface-700">
                {t.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Offer */}
        {festival.offer_structure && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-3">
            <Gift size={11} />
            <span>{festival.offer_structure.label} — {festival.offer_structure.value}{festival.offer_structure.unit === 'percent' ? '%' : '₹'} off</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-2 pt-3 border-t border-surface-800">
          <button onClick={() => onView(festival)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-colors bg-surface-800">
            <Eye size={12} /> Preview
          </button>
          <button onClick={() => onConfigure(festival)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs border border-blue-300 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
            <Plus size={12} /> {configured ? 'Edit' : 'Configure'}
          </button>
          {configured && (
            <button onClick={() => onActivate(savedConfig.id)}
              className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                isActive
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-500/30'
                  : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/30'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{festival.theme?.emoji || '🎉'}</span>
            <div>
              <h2 className="font-bold text-surface-50">{festival.name || festival.festival_name}</h2>
              <p className="text-xs text-surface-400">Menu Suggestions & Matches</p>
            </div>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            </div>
          ) : data ? (
            <>
              {/* Special Mode */}
              {data.festival?.special_mode && SPECIAL_MODE_INFO[data.festival.special_mode] && (
                <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4">
                  <span className="text-3xl">{SPECIAL_MODE_INFO[data.festival.special_mode].icon}</span>
                  <div>
                    <div className="font-bold text-amber-700 dark:text-amber-400">{SPECIAL_MODE_INFO[data.festival.special_mode].label}</div>
                    <div className="text-xs text-surface-400">{SPECIAL_MODE_INFO[data.festival.special_mode].desc}</div>
                  </div>
                </div>
              )}

              {/* Offer Suggestion */}
              {data.offer_suggestion && (
                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Gift size={14} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Suggested Offer</span>
                  </div>
                  <p className="text-surface-50 text-sm">{data.offer_suggestion.label}</p>
                  <p className="text-xs text-surface-400 mt-1">
                    {data.offer_suggestion.value}{data.offer_suggestion.unit === 'percent' ? '%' : '₹'} off · Min order ₹{data.offer_suggestion.min_order}
                  </p>
                </div>
              )}

              {/* Menu matches */}
              <div>
                <h3 className="text-sm font-semibold text-surface-50 mb-2 flex items-center gap-2">
                  <ChefHat size={14} className="text-amber-500" />
                  Your Menu Matches ({data.total_matched})
                </h3>
                {data.menu_matches?.length > 0 ? (
                  <div className="space-y-2">
                    {data.menu_matches.map(item => (
                      <div key={item.id} className="flex items-center gap-3 bg-surface-800 rounded-lg p-3 border border-surface-700">
                        <div className={`w-2 h-2 rounded-full ${item.food_type === 'veg' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div className="flex-1">
                          <div className="text-sm text-surface-50">{item.name}</div>
                          <div className="text-xs text-surface-400">{item.category_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-surface-50">₹{Number(item.base_price).toFixed(0)}</div>
                          <div className="flex gap-0.5 justify-end mt-1">
                            {Array.from({ length: Math.min(item.relevance_score, 3) }).map((_, i) => (
                              <Star key={i} size={8} className="text-amber-500 fill-amber-500" />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-surface-400 text-sm bg-surface-800 rounded-xl border border-surface-700">
                    No exact menu matches found. Consider adding festival specials!
                  </div>
                )}
              </div>

              {/* Suggested items to add */}
              <div>
                <h3 className="text-sm font-semibold text-surface-50 mb-2 flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-500" />
                  Suggested Items to Add
                </h3>
                <div className="flex flex-wrap gap-2">
                  {data.suggested_items?.map(item => (
                    <span key={item} className="text-xs bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-full border border-purple-300 dark:border-purple-500/20">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Décor tips */}
              {data.decor_tips?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-surface-50 mb-2 flex items-center gap-2">
                    <Palette size={14} className="text-pink-500" />
                    Décor Tips
                  </h3>
                  <div className="space-y-1.5">
                    {data.decor_tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-surface-300">
                        <span className="text-pink-500 mt-0.5">✦</span> {tip}
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
    festival_key:     def.key || def.festival_key || '',
    festival_name:    savedConfig?.festival_name || def.name || def.festival_name || '',
    start_date:       savedConfig?.start_date ? savedConfig.start_date.slice(0, 10) : (def.start || ''),
    end_date:         savedConfig?.end_date   ? savedConfig.end_date.slice(0, 10)   : (def.end   || ''),
    is_active:        savedConfig?.is_active ?? false,
    custom_banner:    savedConfig?.custom_banner || def.theme?.banner || '',
    offer_structure:  savedConfig?.offer_structure || def.offer_structure || {},
    theme:            savedConfig?.theme || def.theme || {},
    menu_suggestions: savedConfig?.menu_suggestions || def.suggested_items || [],
    special_mode:     savedConfig?.special_mode || def.special_mode || '',
    outlet_id:        outletId,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-800">
          <div>
            <h2 className="font-bold text-surface-50">Configure Festival Mode</h2>
            <p className="text-xs text-surface-400">{def.name || def.festival_name}</p>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="text-xs text-surface-400 mb-1 block font-semibold">Festival Name</label>
            <input value={form.festival_name} onChange={e => set('festival_name', e.target.value)}
              className="input w-full" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-surface-400 mb-1 block font-semibold">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                className="input w-full" />
            </div>
            <div>
              <label className="text-xs text-surface-400 mb-1 block font-semibold">End Date</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)}
                className="input w-full" />
            </div>
          </div>

          <div>
            <label className="text-xs text-surface-400 mb-1 block font-semibold">Custom Banner Message</label>
            <input value={form.custom_banner} onChange={e => set('custom_banner', e.target.value)}
              placeholder="e.g. Happy Diwali! Special combos available."
              className="input w-full" />
          </div>

          {/* Offer structure */}
          <div className="bg-surface-800 rounded-xl p-4 border border-surface-700">
            <h4 className="text-xs font-bold text-surface-200 mb-3 flex items-center gap-2">
              <Gift size={12} className="text-emerald-500" /> Offer Configuration
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-surface-400 mb-1 block">Offer Label</label>
                <input value={form.offer_structure?.label || ''} onChange={e => set('offer_structure', { ...form.offer_structure, label: e.target.value })}
                  placeholder="e.g. Diwali Special Combo" className="input w-full text-xs py-1.5" />
              </div>
              <div>
                <label className="text-xs text-surface-400 mb-1 block">Discount %</label>
                <input type="number" value={form.offer_structure?.value || ''} onChange={e => set('offer_structure', { ...form.offer_structure, value: +e.target.value })}
                  className="input w-full text-xs py-1.5" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-surface-400 mb-1 block">Min Order Value (₹)</label>
              <input type="number" value={form.offer_structure?.min_order || ''} onChange={e => set('offer_structure', { ...form.offer_structure, min_order: +e.target.value })}
                className="input w-full text-xs py-1.5" />
            </div>
          </div>

          {/* Activate toggle */}
          <div className="flex items-center justify-between bg-surface-800 rounded-xl p-4 border border-surface-700">
            <div>
              <div className="text-sm font-semibold text-surface-50">Activate Now</div>
              <div className="text-xs text-surface-400">Enable this festival mode for your restaurant</div>
            </div>
            <button onClick={() => set('is_active', !form.is_active)}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-amber-500' : 'bg-surface-700'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="p-5 border-t border-surface-800 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-colors bg-surface-800">
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            className="flex-1 py-2 rounded-lg text-sm font-bold text-black bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 transition-all shadow-sm">
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
    <div className="relative rounded-2xl overflow-hidden mb-2 border border-amber-300 dark:border-amber-400/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 shadow-sm">
      {/* Decorative colour stripe from theme */}
      {theme.primary && (
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent || theme.primary})` }} />
      )}
      <div className="relative p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-4xl">{theme.emoji || '🎉'}</span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Festival Mode Active</span>
            </div>
            <h2 className="text-xl font-bold text-surface-50">{activeMode.festival_name}</h2>
            {activeMode.custom_banner && (
              <p className="text-sm text-surface-400 mt-0.5">{activeMode.custom_banner}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <div className="text-xs text-surface-400">Active until</div>
            <div className="text-sm font-semibold text-surface-50">
              {new Date(activeMode.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </div>
          </div>
          <button onClick={() => onToggle(activeMode.id)}
            className="text-xs bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/30 px-3 py-1 rounded-full hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors">
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
  const [tab, setTab]                         = useState('upcoming');
  const [search, setSearch]                   = useState('');
  const [countryFilter, setCountryFilter]     = useState('IN');
  const [viewModal, setViewModal]             = useState(null);
  const [configModal, setConfigModal]         = useState(null);
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
    { key: 'upcoming',   label: 'Upcoming',                              icon: <Clock size={14} /> },
    { key: 'calendar',   label: 'Full Calendar',                         icon: <Calendar size={14} /> },
    { key: 'configured', label: `My Configs (${savedConfigs?.length || 0})`, icon: <CheckCircle size={14} /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-900 border border-surface-800 rounded-2xl p-5">
        <div>
          <h1 className="text-2xl font-black text-surface-50 flex items-center gap-3">
            <span className="text-3xl">🎊</span>
            Hyperlocal Festival Mode
          </h1>
          <p className="text-surface-400 text-sm mt-1">
            Auto-detect upcoming festivals · Region-specific menus · Instant theme activation
            {detected?.outlet && (
              <span className="ml-2 text-surface-500">
                · <MapPin size={10} className="inline" /> {detected.outlet.region} · {detected.outlet.country}
              </span>
            )}
          </p>
        </div>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="input shrink-0">
          <option value="IN">🇮🇳 India</option>
          <option value="AU">🇦🇺 Australia</option>
        </select>
      </div>

      {/* Active Mode Banner */}
      <ActiveModeBanner activeMode={activeMode} outletId={outletId} onToggle={toggleMut.mutate} />

      {/* Stats row */}
      {detected && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Upcoming (60d)', value: detected.upcoming?.length || 0,                            icon: '📅', color: 'text-blue-600 dark:text-blue-400' },
            { label: 'This Week',      value: detected.upcoming?.filter(f => f.days_until_start <= 7).length || 0, icon: '⚡', color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Ongoing Now',    value: detected.upcoming?.filter(f => f.is_ongoing).length || 0,  icon: '🔴', color: 'text-red-600 dark:text-red-400' },
            { label: 'Configured',     value: savedConfigs?.length || 0,                                 icon: '✅', color: 'text-emerald-600 dark:text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="bg-surface-900 rounded-xl p-4 border border-surface-800">
              <div className="flex items-center gap-2 mb-1">
                <span>{s.icon}</span>
                <span className="text-xs text-surface-400 font-medium">{s.label}</span>
              </div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 bg-surface-950 p-1 rounded-xl">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                tab === t.key ? 'bg-amber-500 text-black shadow-sm' : 'text-surface-400 hover:text-surface-200'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search festivals…"
            className="input w-full pl-8 text-sm" />
        </div>
      </div>

      {/* ── UPCOMING TAB ── */}
      {tab === 'upcoming' && (
        <>
          {loadingDetect ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            </div>
          ) : upcomingFiltered.length === 0 ? (
            <div className="text-center py-16 text-surface-400">
              <Sparkles size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No upcoming festivals in the next 60 days for your region.</p>
              <p className="text-xs mt-2">Check the Full Calendar for all festivals.</p>
            </div>
          ) : (
            <>
              {/* Ongoing */}
              {upcomingFiltered.filter(f => f.is_ongoing).length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Happening Now
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {upcomingFiltered.filter(f => f.is_ongoing).map(f => (
                      <FestivalCard key={f.key} festival={f} savedConfig={savedMap[f.key]}
                        outletId={outletId} onActivate={toggleMut.mutate}
                        onView={() => setViewModal(f)} onConfigure={() => setConfigModal(f)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Coming up */}
              {upcomingFiltered.filter(f => !f.is_ongoing).length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-surface-400 mb-3">Coming Up</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {upcomingFiltered.filter(f => !f.is_ongoing).map(f => (
                      <FestivalCard key={f.key} festival={f} savedConfig={savedMap[f.key]}
                        outletId={outletId} onActivate={toggleMut.mutate}
                        onView={() => setViewModal(f)} onConfigure={() => setConfigModal(f)} />
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
              outletId={outletId} onActivate={toggleMut.mutate}
              onView={() => setViewModal(f)} onConfigure={() => setConfigModal(f)} />
          ))}
        </div>
      )}

      {/* ── CONFIGURED TAB ── */}
      {tab === 'configured' && (
        <>
          {!savedConfigs?.length ? (
            <div className="text-center py-16 text-surface-400">
              <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No festival modes configured yet.</p>
              <p className="text-xs mt-2">Go to Upcoming and click Configure on any festival.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedConfigs.map(cfg => {
                const theme = cfg.theme || {};
                return (
                  <div key={cfg.id} className={`rounded-xl border p-4 flex items-center gap-4 bg-surface-900 ${
                    cfg.is_active ? 'border-amber-300 dark:border-amber-400/40' : 'border-surface-800'
                  }`}>
                    <span className="text-2xl">{theme.emoji || '🎉'}</span>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-surface-50 text-sm">{cfg.festival_name}</span>
                        {cfg.is_active && (
                          <span className="text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-500/30">ACTIVE</span>
                        )}
                        {cfg.special_mode && SPECIAL_MODE_INFO[cfg.special_mode] && (
                          <span className="text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full border border-purple-300 dark:border-purple-500/30">
                            {SPECIAL_MODE_INFO[cfg.special_mode].icon} {SPECIAL_MODE_INFO[cfg.special_mode].label}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-surface-400 mt-0.5">
                        {new Date(cfg.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} →{' '}
                        {new Date(cfg.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {cfg.custom_banner && <span className="ml-2 text-surface-500">· {cfg.custom_banner.slice(0, 40)}…</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleMut.mutate(cfg.id)}
                        className={`p-2 rounded-lg text-xs transition-colors border ${
                          cfg.is_active
                            ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-500/30'
                            : 'bg-surface-800 text-surface-400 border-surface-700 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-500/30'
                        }`}>
                        {cfg.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => deleteMut.mutate(cfg.id)}
                        className="p-2 rounded-lg bg-surface-800 text-surface-400 border border-surface-700 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-500/30 transition-colors">
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
