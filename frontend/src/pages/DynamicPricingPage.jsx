import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Zap, Plus, Trash2, ToggleLeft, ToggleRight, Clock, Calendar,
  CloudRain, Sun, Snowflake, TrendingUp, TrendingDown, Tag,
  BarChart2, Edit2, X, CheckCircle, AlertCircle, RefreshCw,
  Flame, Coffee, Star, ShoppingBag, ArrowUp, ArrowDown, Settings,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_ALL   = [0,1,2,3,4,5,6];

const TRIGGER_META = {
  time_slot:   { label: 'Time Slot',    icon: Clock,     color: 'text-blue-400',   bg: 'bg-blue-500/15'   },
  day_of_week: { label: 'Day of Week',  icon: Calendar,  color: 'text-purple-400', bg: 'bg-purple-500/15' },
  weather:     { label: 'Weather',      icon: CloudRain,  color: 'text-cyan-400',   bg: 'bg-cyan-500/15'   },
  combo:       { label: 'Combo',        icon: Zap,        color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
};

const ACTION_META = {
  discount:    { label: 'Discount',     icon: TrendingDown, color: 'text-green-400'  },
  surcharge:   { label: 'Surcharge',    icon: TrendingUp,   color: 'text-red-400'    },
  fixed_price: { label: 'Fixed Price',  icon: Tag,          color: 'text-yellow-400' },
};

const SEASON_ICON = { monsoon: CloudRain, summer: Sun, winter: Snowflake, any: Zap };
const WEATHER_OPTS = [
  { value: 'any',   label: 'Any Weather' },
  { value: 'rain',  label: '🌧 Raining' },
  { value: 'sunny', label: '☀️ Sunny' },
  { value: 'cold',  label: '🥶 Cold' },
  { value: 'hot',   label: '🥵 Hot' },
];
const SEASON_OPTS = [
  { value: 'any',     label: 'Any Season' },
  { value: 'monsoon', label: '🌧 Monsoon (Jun–Sep)' },
  { value: 'summer',  label: '☀️ Summer (Mar–May)' },
  { value: 'winter',  label: '❄️ Winter (Oct–Feb)' },
];
const TARGET_OPTS = [
  { value: 'all',         label: 'All Menu Items' },
  { value: 'slow_movers', label: '🐢 Slow Movers (non-bestsellers)' },
  { value: 'bestsellers', label: '⭐ Bestsellers' },
  { value: 'category',    label: '📂 Specific Category' },
  { value: 'specific',    label: '🍽 Specific Items' },
  { value: 'tag',         label: '🏷 By Tag (e.g. hot_beverage)' },
];

const TABS = [
  { id: 'rules',     label: 'Rules',       icon: Zap },
  { id: 'live',      label: 'Live Prices', icon: RefreshCw },
  { id: 'analytics', label: 'Analytics',   icon: BarChart2 },
];

// ─── rule form modal ─────────────────────────────────────────────────────────
const BLANK = {
  name: '', description: '', trigger_type: 'time_slot',
  time_start: '', time_end: '', days_of_week: [],
  weather_trigger: 'any', season_trigger: 'any',
  item_target: 'all', target_ids: [], target_tag: '',
  action_type: 'discount', action_value: 10, action_unit: 'percent',
  max_discount_amt: '', min_order_value: '',
  valid_from: '', valid_until: '',
  priority: 10, is_active: true,
};

function RuleModal({ rule, categories, outletId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!rule;
  const [form, setForm] = useState(isEdit ? {
    ...BLANK, ...rule,
    days_of_week: Array.isArray(rule.days_of_week) ? rule.days_of_week : [],
    target_ids:   Array.isArray(rule.target_ids)   ? rule.target_ids   : [],
    valid_from:  rule.valid_from  ? rule.valid_from.split('T')[0]  : '',
    valid_until: rule.valid_until ? rule.valid_until.split('T')[0] : '',
  } : { ...BLANK });

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked :
              e.target.type === 'number'   ? Number(e.target.value) : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const toggleDay = (d) => setForm(f => ({
    ...f,
    days_of_week: f.days_of_week.includes(d)
      ? f.days_of_week.filter(x => x !== d)
      : [...f.days_of_week, d],
  }));

  const mut = useMutation({
    mutationFn: (d) => {
      // Ensure numeric fields are numbers, not strings
      const payload = {
        ...d,
        outlet_id: outletId,
        action_value: Number(d.action_value),
        priority: Number(d.priority) || 10,
        max_discount_amt: d.max_discount_amt ? Number(d.max_discount_amt) : null,
        min_order_value: d.min_order_value ? Number(d.min_order_value) : null,
        days_of_week: Array.isArray(d.days_of_week) ? d.days_of_week : [],
        target_ids: Array.isArray(d.target_ids) ? d.target_ids : [],
        valid_from: d.valid_from || null,
        valid_until: d.valid_until || null,
      };
      return isEdit
        ? api.patch(`/pricing/rules/${rule.id}`, payload)
        : api.post('/pricing/rules', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Rule updated!' : 'Rule created!');
      qc.invalidateQueries({ queryKey: ['pricing-rules'] });
      qc.invalidateQueries({ queryKey: ['pricing-live'] });
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Failed to save rule'),
  });

  const QUICK_TEMPLATES = [
    { label: '🍱 Lunch 10% off slow items',     fields: { name:'Lunch Slow Item Discount', trigger_type:'time_slot', time_start:'12:00', time_end:'15:00', days_of_week:[1,2,3,4,5], item_target:'slow_movers', action_type:'discount', action_value:10, action_unit:'percent' } },
    { label: '🔥 Friday night surge 15%',        fields: { name:'Friday Night Surge', trigger_type:'day_of_week', time_start:'19:00', time_end:'23:00', days_of_week:[5], item_target:'bestsellers', action_type:'surcharge', action_value:15, action_unit:'percent' } },
    { label: '🌧 Monsoon hot bev 20% off',       fields: { name:'Monsoon Hot Beverages', trigger_type:'weather', season_trigger:'monsoon', item_target:'tag', target_tag:'hot_beverage', action_type:'discount', action_value:20, action_unit:'percent' } },
    { label: '☀️ Summer cold drinks 12% off',   fields: { name:'Summer Coolers Promo', trigger_type:'weather', season_trigger:'summer', item_target:'tag', target_tag:'cold_beverage', action_type:'discount', action_value:12, action_unit:'percent' } },
    { label: '🌄 Weekend breakfast ₹30 off',     fields: { name:'Weekend Breakfast Deal', trigger_type:'time_slot', time_start:'08:00', time_end:'11:00', days_of_week:[6,0], item_target:'all', action_type:'discount', action_value:30, action_unit:'flat' } },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-lg flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-400" />{isEdit ? 'Edit Rule' : 'New Pricing Rule'}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        {/* Quick templates */}
        {!isEdit && (
          <div className="mb-5">
            <p className="text-xs text-surface-400 mb-2 font-bold">QUICK TEMPLATES</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => setForm(f => ({ ...f, ...t.fields }))}
                  className="px-3 py-1.5 text-xs bg-surface-800 rounded-lg hover:bg-brand-500/20 hover:text-brand-400 transition-colors border border-surface-700">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Rule Name *</label>
              <input className="input w-full" value={form.name} onChange={set('name')} placeholder="e.g. Lunch Happy Hour" />
            </div>
            <div className="col-span-2">
              <label className="label">Description</label>
              <input className="input w-full" value={form.description || ''} onChange={set('description')} placeholder="What does this rule do?" />
            </div>
            <div>
              <label className="label">Priority (lower = first)</label>
              <input className="input w-full" type="number" min="1" max="100" value={form.priority} onChange={set('priority')} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" checked={!!form.is_active} onChange={set('is_active')} />
                <span className="text-sm font-medium">Active immediately</span>
              </label>
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="label">Trigger Type *</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(TRIGGER_META).map(([k, m]) => {
                const Icon = m.icon;
                return (
                  <button key={k} onClick={() => setForm(f => ({ ...f, trigger_type: k }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      form.trigger_type === k ? `${m.bg} ${m.color} border-current` : 'border-surface-700 text-surface-400 hover:border-surface-500'
                    }`}>
                    <Icon className="w-4 h-4" />{m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time window */}
          {(form.trigger_type === 'time_slot' || form.trigger_type === 'day_of_week' || form.trigger_type === 'combo') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Start Time</label>
                <input className="input w-full" type="time" value={form.time_start} onChange={set('time_start')} />
              </div>
              <div>
                <label className="label">End Time</label>
                <input className="input w-full" type="time" value={form.time_end} onChange={set('time_end')} />
              </div>
            </div>
          )}

          {/* Days of week */}
          {['day_of_week','time_slot','combo'].includes(form.trigger_type) && (
            <div>
              <label className="label">Days (empty = every day)</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS_ALL.map(d => (
                  <button key={d} onClick={() => toggleDay(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      form.days_of_week.includes(d)
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}>
                    {DAY_LABELS[d]}
                  </button>
                ))}
                <button onClick={() => setForm(f => ({ ...f, days_of_week: f.days_of_week.length === 7 ? [] : [...DAYS_ALL] }))}
                  className="px-3 py-1.5 rounded-lg text-xs bg-surface-800 text-surface-400 hover:bg-surface-700 transition-all">
                  {form.days_of_week.length === 7 ? 'Clear' : 'All'}
                </button>
              </div>
            </div>
          )}

          {/* Weather / Season */}
          {['weather','combo'].includes(form.trigger_type) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Weather Condition</label>
                <select className="input w-full" value={form.weather_trigger || 'any'} onChange={set('weather_trigger')}>
                  {WEATHER_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Season</label>
                <select className="input w-full" value={form.season_trigger || 'any'} onChange={set('season_trigger')}>
                  {SEASON_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Item targeting */}
          <div>
            <label className="label">Apply To</label>
            <select className="input w-full" value={form.item_target} onChange={set('item_target')}>
              {TARGET_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {form.item_target === 'category' && (
            <div>
              <label className="label">Categories (select multiple)</label>
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                {(categories || []).map(cat => (
                  <button key={cat.id} onClick={() => {
                    const ids = form.target_ids.includes(cat.id)
                      ? form.target_ids.filter(i => i !== cat.id)
                      : [...form.target_ids, cat.id];
                    setForm(f => ({ ...f, target_ids: ids }));
                  }}
                    className={`px-3 py-1 rounded-lg text-xs transition-all ${
                      form.target_ids.includes(cat.id) ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400'
                    }`}>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.item_target === 'tag' && (
            <div>
              <label className="label">Tag Name</label>
              <input className="input w-full" value={form.target_tag || ''} onChange={set('target_tag')} placeholder="e.g. hot_beverage, cold_beverage, dessert" />
              <p className="text-xs text-surface-500 mt-1">Tag items in Menu → Item → Tags field</p>
            </div>
          )}

          {/* Action */}
          <div>
            <label className="label">Pricing Action *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ACTION_META).map(([k, m]) => {
                const Icon = m.icon;
                return (
                  <button key={k} onClick={() => setForm(f => ({ ...f, action_type: k }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      form.action_type === k
                        ? `bg-surface-700 ${m.color} border-current`
                        : 'border-surface-700 text-surface-400 hover:border-surface-500'
                    }`}>
                    <Icon className="w-4 h-4" />{m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Value *</label>
              <input className="input w-full" type="number" min="0" value={form.action_value} onChange={set('action_value')} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input w-full" value={form.action_unit} onChange={set('action_unit')}>
                <option value="percent">% Percent</option>
                <option value="flat">₹ Flat Amount</option>
              </select>
            </div>
            {form.action_type === 'discount' && (
              <div>
                <label className="label">Max Discount Cap (₹)</label>
                <input className="input w-full" type="number" min="0" value={form.max_discount_amt || ''} onChange={set('max_discount_amt')} placeholder="No cap" />
              </div>
            )}
            <div>
              <label className="label">Min Order Value (₹)</label>
              <input className="input w-full" type="number" min="0" value={form.min_order_value || ''} onChange={set('min_order_value')} placeholder="No minimum" />
            </div>
          </div>

          {/* Validity window */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Valid From (optional)</label>
              <input className="input w-full" type="date" value={form.valid_from || ''} onChange={set('valid_from')} />
            </div>
            <div>
              <label className="label">Valid Until (optional)</label>
              <input className="input w-full" type="date" value={form.valid_until || ''} onChange={set('valid_until')} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            disabled={mut.isPending || !form.name || !form.action_value}
            onClick={() => mut.mutate(form)}
          >
            <Zap className="w-4 h-4" />
            {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── rule card ────────────────────────────────────────────────────────────────
function RuleCard({ rule, categories, outletId, onEdit }) {
  const qc = useQueryClient();

  const toggleMut = useMutation({
    mutationFn: () => api.post(`/pricing/rules/${rule.id}/toggle`, { outlet_id: outletId }),
    onSuccess: () => { toast.success(rule.is_active ? 'Rule paused' : 'Rule activated'); qc.invalidateQueries({ queryKey: ['pricing-rules'] }); qc.invalidateQueries({ queryKey: ['pricing-live'] }); },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/pricing/rules/${rule.id}?outlet_id=${outletId}`),
    onSuccess: () => { toast.success('Rule deleted'); qc.invalidateQueries({ queryKey: ['pricing-rules'] }); qc.invalidateQueries({ queryKey: ['pricing-live'] }); },
  });

  const tm = TRIGGER_META[rule.trigger_type] || TRIGGER_META.combo;
  const am = ACTION_META[rule.action_type]   || ACTION_META.discount;
  const TIcon = tm.icon;
  const AIcon = am.icon;

  const days = Array.isArray(rule.days_of_week) && rule.days_of_week.length > 0
    ? rule.days_of_week.map(d => DAY_LABELS[d]).join(', ')
    : 'Every day';

  const actionLabel = rule.action_unit === 'percent'
    ? `${rule.action_value}%`
    : `₹${rule.action_value}`;

  return (
    <div className={`card transition-all ${rule.is_active ? '' : 'opacity-50'}`}>
      <div className="flex items-start gap-4">
        {/* Trigger badge */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tm.bg}`}>
          <TIcon className={`w-5 h-5 ${tm.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-black text-sm">{rule.name}</p>
            {rule.is_active
              ? <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full font-bold">Active</span>
              : <span className="px-2 py-0.5 bg-surface-700 text-surface-400 text-xs rounded-full">Paused</span>
            }
            <span className="text-xs text-surface-500">Priority {rule.priority}</span>
          </div>

          {rule.description && <p className="text-xs text-surface-400 mt-0.5 truncate">{rule.description}</p>}

          <div className="flex flex-wrap gap-3 mt-2 text-xs">
            {/* Time */}
            {rule.time_start && rule.time_end && (
              <span className="flex items-center gap-1 text-surface-400">
                <Clock className="w-3 h-3" />{rule.time_start}–{rule.time_end}
              </span>
            )}
            {/* Days */}
            <span className="flex items-center gap-1 text-surface-400">
              <Calendar className="w-3 h-3" />{days}
            </span>
            {/* Season/Weather */}
            {rule.season_trigger && rule.season_trigger !== 'any' && (
              <span className="flex items-center gap-1 text-cyan-400">
                <CloudRain className="w-3 h-3" />{rule.season_trigger}
              </span>
            )}
            {/* Target */}
            <span className="flex items-center gap-1 text-surface-400">
              <Tag className="w-3 h-3" />
              {rule.item_target === 'tag' ? rule.target_tag : TARGET_OPTS.find(t => t.value === rule.item_target)?.label.split(' ').slice(-2).join(' ')}
            </span>
          </div>
        </div>

        {/* Action badge */}
        <div className="text-right shrink-0">
          <div className={`flex items-center gap-1 font-black text-lg ${am.color}`}>
            <AIcon className="w-4 h-4" />
            {rule.action_type === 'discount' ? '−' : rule.action_type === 'surcharge' ? '+' : '='}
            {actionLabel}
          </div>
          <p className="text-xs text-surface-500 capitalize">{rule.action_type}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-700">
        <button onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            rule.is_active ? 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20' : 'text-green-400 bg-green-500/10 hover:bg-green-500/20'
          }`}>
          {rule.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {rule.is_active ? 'Pause' : 'Activate'}
        </button>
        <button onClick={() => onEdit(rule)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 transition-colors font-medium">
          <Edit2 className="w-3 h-3" />Edit
        </button>
        <button onClick={() => { if (confirm('Delete this rule?')) deleteMut.mutate(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors font-medium ml-auto">
          <Trash2 className="w-3 h-3" />Delete
        </button>
      </div>
    </div>
  );
}

// ─── live prices tab ─────────────────────────────────────────────────────────
function LivePricesTab({ outletId }) {
  const [weather, setWeather] = useState('');
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['pricing-live', outletId, weather],
    queryFn: () => api.get(`/pricing/live?outlet_id=${outletId}${weather ? `&weather=${weather}` : ''}`).then(r => r.data),
    refetchInterval: 60000,
  });

  const live = data?.data || {};
  const priceMap = Object.values(live.price_map || {});
  const affected = priceMap.filter(p => p.saving !== 0);
  const ctx = live.context || {};
  const activeRules = live.active_rules || [];

  const season = ctx.season || '—';
  const SeasonIcon = SEASON_ICON[season] || Zap;

  return (
    <div className="space-y-5">
      {/* Context panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <Clock className="w-6 h-6 text-brand-400 mx-auto mb-1" />
          <p className="font-black text-lg">{ctx.timeStr || '—'}</p>
          <p className="text-xs text-surface-400">Current Time (IST)</p>
        </div>
        <div className="card text-center">
          <Calendar className="w-6 h-6 text-purple-400 mx-auto mb-1" />
          <p className="font-black text-lg">{ctx.dayOfWeek !== undefined ? DAY_LABELS[ctx.dayOfWeek] : '—'}</p>
          <p className="text-xs text-surface-400">Day</p>
        </div>
        <div className="card text-center">
          <SeasonIcon className="w-6 h-6 text-cyan-400 mx-auto mb-1" />
          <p className="font-black text-lg capitalize">{season}</p>
          <p className="text-xs text-surface-400">Season</p>
        </div>
        <div className="card text-center">
          <Zap className="w-6 h-6 text-yellow-400 mx-auto mb-1" />
          <p className="font-black text-lg">{activeRules.length}</p>
          <p className="text-xs text-surface-400">Active Rules Now</p>
        </div>
      </div>

      {/* Weather override */}
      <div className="card flex items-center gap-4">
        <CloudRain className="w-5 h-5 text-cyan-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold">Simulate Weather</p>
          <p className="text-xs text-surface-400">Override weather to preview pricing rules</p>
        </div>
        <select className="input w-40 text-sm" value={weather} onChange={e => setWeather(e.target.value)}>
          <option value="">Auto / None</option>
          {WEATHER_OPTS.slice(1).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={() => refetch()} className="p-2 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Active rules now */}
      {activeRules.length > 0 && (
        <div className="card">
          <h3 className="font-bold mb-3 flex items-center gap-2 text-green-400"><CheckCircle className="w-4 h-4" />Currently Firing ({activeRules.length})</h3>
          <div className="flex flex-wrap gap-2">
            {activeRules.map(r => {
              const am = ACTION_META[r.action_type] || ACTION_META.discount;
              return (
                <div key={r.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${r.action_type === 'discount' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {r.action_type === 'discount' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                  {r.name} — {r.action_type === 'discount' ? '−' : '+'}{r.action_value}{r.action_unit === 'percent' ? '%' : '₹'} on {r.item_target}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Affected items */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2">
            <Tag className="w-4 h-4 text-yellow-400" />
            Price Changes ({affected.length} items affected)
          </h3>
          {dataUpdatedAt && <p className="text-xs text-surface-500">Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-IN')}</p>}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : affected.length === 0 ? (
          <div className="text-center py-8 text-surface-500">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-surface-600" />
            <p>No pricing rules are active right now.</p>
            <p className="text-xs mt-1">Create rules or adjust time/day conditions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700">
                  <th className="text-left py-2 px-3 text-surface-400 font-medium">Item</th>
                  <th className="text-right py-2 px-3 text-surface-400 font-medium">Original</th>
                  <th className="text-right py-2 px-3 text-surface-400 font-medium">Active Price</th>
                  <th className="text-right py-2 px-3 text-surface-400 font-medium">Change</th>
                  <th className="text-left py-2 px-3 text-surface-400 font-medium">Rule</th>
                </tr>
              </thead>
              <tbody>
                {affected.map(p => (
                  <tr key={p.item_id} className="border-b border-surface-800 hover:bg-surface-800/50 transition-colors">
                    <td className="py-2 px-3 font-medium">{p.name}</td>
                    <td className="py-2 px-3 text-right text-surface-400 line-through">{fmt(p.base_price)}</td>
                    <td className={`py-2 px-3 text-right font-black ${p.saving > 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(p.active_price)}</td>
                    <td className={`py-2 px-3 text-right font-bold text-xs ${p.saving > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.pct_change > 0 ? '+' : ''}{p.pct_change}%
                      <br/><span className="font-normal">{p.saving > 0 ? `−${fmt(p.saving)}` : `+${fmt(Math.abs(p.saving))}`}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 bg-brand-500/15 text-brand-400 rounded text-xs">{p.rule_applied?.name}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── analytics tab ────────────────────────────────────────────────────────────
function AnalyticsTab({ outletId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pricing-analytics', outletId],
    queryFn: () => api.get(`/pricing/analytics?outlet_id=${outletId}`).then(r => r.data),
  });

  const stats = data?.data || {};
  const byRule = stats.by_rule || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <ShoppingBag className="w-6 h-6 text-brand-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{(stats.total_applications || 0).toLocaleString()}</p>
          <p className="text-xs text-surface-400 mt-1">Total Rule Applications</p>
        </div>
        <div className="card text-center">
          <TrendingDown className="w-6 h-6 text-green-400 mx-auto mb-2" />
          <p className="text-2xl font-black text-green-400">{fmt(stats.total_saving)}</p>
          <p className="text-xs text-surface-400 mt-1">Total Savings Given</p>
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-4">Performance by Rule</h3>
        {isLoading ? <p className="text-surface-400 text-center py-6">Loading…</p> :
         byRule.length === 0 ? (
          <div className="text-center py-10 text-surface-500">
            <BarChart2 className="w-10 h-10 mx-auto mb-2 text-surface-600" />
            <p>No applications logged yet.</p>
            <p className="text-xs mt-1">Analytics fill in as POS uses dynamic prices.</p>
          </div>
         ) : (
          <div className="space-y-3">
            {byRule.map(r => (
              <div key={r.rule_id} className="flex items-center justify-between px-4 py-3 bg-surface-800 rounded-xl">
                <div>
                  <p className="font-bold text-sm">{r.rule_name}</p>
                  <p className="text-xs text-surface-400 capitalize">{r.action_type} · {r.applications} times applied</p>
                </div>
                <div className={`font-black ${r.action_type === 'discount' ? 'text-green-400' : 'text-red-400'}`}>
                  {r.action_type === 'discount' ? '−' : '+'}{fmt(Math.abs(r.total_saving))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function DynamicPricingPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const qc = useQueryClient();

  const [tab, setTab]         = useState('rules');
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule]   = useState(null);

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['pricing-rules', outletId],
    queryFn: () => api.get(`/pricing/rules?outlet_id=${outletId}`).then(r => r.data),
  });

  const { data: catData } = useQuery({
    queryKey: ['menu-categories', outletId],
    queryFn: () => api.get(`/menu/categories?outlet_id=${outletId}`).then(r => r.data),
  });

  const seedMut = useMutation({
    mutationFn: () => api.post('/pricing/seed', { outlet_id: outletId }),
    onSuccess: () => { toast.success('5 default rules seeded!'); qc.invalidateQueries({ queryKey: ['pricing-rules'] }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  // queryFn already calls .then(r => r.data), so rulesData IS the array directly
  const rules = Array.isArray(rulesData) ? rulesData : (rulesData?.data || []);
  // catData is already the categories array after .then(r => r.data)
  const categories = Array.isArray(catData) ? catData : (catData?.categories || catData?.data || []);
  const activeCount = rules.filter(r => r.is_active).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Zap className="w-7 h-7 text-yellow-400" />Dynamic Pricing Engine
          </h1>
          <p className="text-surface-400 text-sm mt-1">
            Auto-adjust prices by time, day, weather & season · {activeCount} rule{activeCount !== 1 ? 's' : ''} active now
          </p>
        </div>
        <div className="flex gap-2">
          {rules.length === 0 && (
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
              className="btn-ghost flex items-center gap-2 text-sm">
              <Settings className="w-4 h-4" />{seedMut.isPending ? 'Seeding…' : 'Load Defaults'}
            </button>
          )}
          <button onClick={() => { setEditRule(null); setShowModal(true); }}
            className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />New Rule
          </button>
        </div>
      </div>

      {/* Example scenarios strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { icon: Coffee, color: 'text-orange-400 bg-orange-500/10', title: 'Lunch 12–3 pm', desc: 'Auto 10% off slow movers → fill seats' },
          { icon: Flame,  color: 'text-red-400 bg-red-500/10',    title: 'Friday Night',  desc: '15% surge on bestsellers → maximise revenue' },
          { icon: CloudRain, color: 'text-blue-400 bg-blue-500/10', title: 'Monsoon',      desc: '20% off hot beverages → drive traffic' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`flex items-center gap-3 p-4 rounded-2xl ${s.color}`}>
              <Icon className="w-8 h-8 shrink-0" />
              <div>
                <p className="font-bold text-sm">{s.title}</p>
                <p className="text-xs opacity-80">{s.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-brand-500 text-white shadow' : 'text-surface-400 hover:text-white'
            }`}>
            <Icon className="w-4 h-4" />{label}
            {id === 'rules' && rules.length > 0 && (
              <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">{rules.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'rules' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : rules.length === 0 ? (
            <div className="card text-center py-16">
              <Zap className="w-14 h-14 text-surface-600 mx-auto mb-4" />
              <p className="font-bold text-surface-300">No pricing rules yet</p>
              <p className="text-surface-500 text-sm mt-1">Click "Load Defaults" to seed 5 ready-made rules, or create your own.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {rules.map(r => (
                <RuleCard key={r.id} rule={r} categories={categories} outletId={outletId}
                  onEdit={(r) => { setEditRule(r); setShowModal(true); }} />
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'live'      && <LivePricesTab  outletId={outletId} />}
      {tab === 'analytics' && <AnalyticsTab   outletId={outletId} />}

      {/* Rule Modal */}
      {showModal && (
        <RuleModal
          rule={editRule}
          categories={categories}
          outletId={outletId}
          onClose={() => { setShowModal(false); setEditRule(null); }}
        />
      )}
    </div>
  );
}
