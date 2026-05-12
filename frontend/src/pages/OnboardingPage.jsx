import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../lib/api';
import {
  Building2, Store, UtensilsCrossed, Users, Settings, Zap, Rocket,
  CheckCircle2, ChevronRight, ChevronLeft, Plus, Trash2, Loader2,
  Sparkles, Globe, Clock, Phone, MapPin, Coffee, ShoppingBag, Truck,
  CreditCard, Smartphone, Wallet, MessageCircle, X, Check,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: 'Business Profile',  icon: Building2,       desc: 'Tell us about your restaurant' },
  { id: 2, title: 'Outlet & Tables',   icon: Store,           desc: 'Setup your outlet location' },
  { id: 3, title: 'Menu Setup',        icon: UtensilsCrossed, desc: 'Add your menu with AI' },
  { id: 4, title: 'Team Setup',        icon: Users,           desc: 'Add your staff members' },
  { id: 5, title: 'POS Config',        icon: Settings,        desc: 'Configure your POS system' },
  { id: 6, title: 'Integrations',      icon: Zap,             desc: 'Connect delivery apps' },
  { id: 7, title: 'Go Live!',          icon: Rocket,          desc: 'Launch your restaurant' },
];

const CUISINES = [
  'Indian', 'Chinese', 'Italian', 'Mexican', 'Thai', 'Japanese',
  'American', 'Mediterranean', 'Fast Food', 'Café', 'Bakery',
  'Pizza', 'Seafood', 'BBQ',
];

const COUNTRIES = [
  { code: 'IN', name: 'India',          flag: '🇮🇳' },
  { code: 'AU', name: 'Australia',      flag: '🇦🇺' },
  { code: 'US', name: 'United States',  flag: '🇺🇸' },
  { code: 'UK', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'AE', name: 'UAE',            flag: '🇦🇪' },
];

const BUSINESS_TYPES = [
  { id: 'qsr',         label: 'QSR',          Icon: Zap,          desc: 'Quick Service' },
  { id: 'fine_dine',   label: 'Fine Dine',    Icon: Globe,        desc: 'Premium dining' },
  { id: 'cloud',       label: 'Cloud Kitchen',Icon: Clock,        desc: 'Delivery only' },
  { id: 'cafe',        label: 'Café / Bakery', Icon: Coffee,       desc: 'Coffee & bakes' },
  { id: 'food_court',  label: 'Food Court',   Icon: ShoppingBag,  desc: 'Multi-vendor' },
  { id: 'bar',         label: 'Bar / Lounge', Icon: Wallet,       desc: 'Drinks & more' },
];

const ROLES = ['Manager', 'Cashier', 'Captain', 'Chef', 'KOT Screen'];

const VOICE_LANGUAGES = [
  { label: 'English',            flag: '🇬🇧', code: 'en-IN' },
  { label: 'Hindi',              flag: '🇮🇳', code: 'hi-IN' },
  { label: 'Hinglish',           flag: '🇮🇳', code: 'hi-IN' },
  { label: 'Tamil',              flag: '🇮🇳', code: 'ta-IN' },
  { label: 'Telugu',             flag: '🇮🇳', code: 'te-IN' },
  { label: 'Kannada',            flag: '🇮🇳', code: 'kn-IN' },
  { label: 'Malayalam',          flag: '🇮🇳', code: 'ml-IN' },
  { label: 'Bengali',            flag: '🇮🇳', code: 'bn-IN' },
  { label: 'Gujarati',           flag: '🇮🇳', code: 'gu-IN' },
  { label: 'Marathi',            flag: '🇮🇳', code: 'mr-IN' },
  { label: 'Punjabi',            flag: '🇮🇳', code: 'pa-IN' },
  { label: 'Australian English', flag: '🇦🇺', code: 'en-AU' },
  { label: 'Arabic',             flag: '🇦🇪', code: 'ar' },
];

const PAYMENT_MODES = [
  { id: 'cash',      label: 'Cash',            emoji: '💵' },
  { id: 'upi',       label: 'UPI',             emoji: '📱' },
  { id: 'card',      label: 'Card',            emoji: '💳' },
  { id: 'razorpay',  label: 'Razorpay Online', emoji: '🌐' },
  { id: 'paytm',     label: 'Paytm',           emoji: '💙' },
  { id: 'phonepe',   label: 'PhonePe',         emoji: '💜' },
];

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const inputCls = 'border border-gray-200 rounded-xl px-4 py-2.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 placeholder-gray-400 bg-white';
const labelCls = 'text-sm font-medium text-gray-700 mb-1 block';
const sectionHeading = 'text-lg font-semibold text-gray-900 mb-4';

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ data, onChange }) {
  const toggle = (field, value) => {
    const arr = data[field] || [];
    onChange({ [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">🚀 Business Profile</h2>
        <p className="text-gray-500 mt-1">Tell us about your restaurant so we can personalise your experience.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Restaurant Name <span className="text-red-500">*</span></label>
          <input className={inputCls} placeholder="e.g. Spice Garden" value={data.restaurant_name}
            onChange={e => onChange({ restaurant_name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Legal / Registered Name</label>
          <input className={inputCls} placeholder="e.g. Spice Garden Pvt Ltd" value={data.legal_name}
            onChange={e => onChange({ legal_name: e.target.value })} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Country</label>
        <div className="grid grid-cols-5 gap-2">
          {COUNTRIES.map(c => (
            <button key={c.code} type="button"
              onClick={() => onChange({ country: c.code })}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-sm font-medium
                ${data.country === c.code ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
              <span className="text-2xl">{c.flag}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Cuisine Types</label>
        <div className="flex flex-wrap gap-2">
          {CUISINES.map(c => (
            <button key={c} type="button"
              onClick={() => toggle('cuisine_types', c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all
                ${(data.cuisine_types || []).includes(c) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Business Type</label>
        <div className="grid grid-cols-3 gap-3">
          {BUSINESS_TYPES.map(bt => {
            const Icon = bt.Icon;
            return (
              <button key={bt.id} type="button"
                onClick={() => onChange({ business_type: bt.id })}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                  ${data.business_type === bt.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <Icon size={20} className={data.business_type === bt.id ? 'text-indigo-600' : 'text-gray-400'} />
                <div>
                  <div className="text-sm font-semibold text-gray-800">{bt.label}</div>
                  <div className="text-xs text-gray-400">{bt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {data.country === 'IN' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>GSTIN</label>
            <input className={inputCls} placeholder="22AAAAA0000A1Z5" value={data.gstin}
              onChange={e => onChange({ gstin: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>FSSAI License</label>
            <input className={inputCls} placeholder="12345678901234" value={data.fssai}
              onChange={e => onChange({ fssai: e.target.value })} />
          </div>
        </div>
      )}
      {data.country === 'AU' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>ABN</label>
            <input className={inputCls} placeholder="51 824 753 556" value={data.abn}
              onChange={e => onChange({ abn: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>ACN</label>
            <input className={inputCls} placeholder="000 000 019" value={data.acn}
              onChange={e => onChange({ acn: e.target.value })} />
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Logo URL (optional)</label>
        <input className={inputCls} placeholder="https://..." value={data.logo_url}
          onChange={e => onChange({ logo_url: e.target.value })} />
      </div>
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function Step2({ data, onChange, restaurantName }) {
  useEffect(() => {
    if (!data.outlet_name && restaurantName) onChange({ outlet_name: restaurantName });
  }, [restaurantName]); // eslint-disable-line react-hooks/exhaustive-deps

  const SERVICE_MODES = [
    { id: 'dine_in',  label: 'Dine-in',  Icon: UtensilsCrossed },
    { id: 'takeaway', label: 'Takeaway', Icon: ShoppingBag },
    { id: 'delivery', label: 'Delivery', Icon: Truck },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Store Outlet & Tables</h2>
        <p className="text-gray-500 mt-1">Setup your outlet location and service preferences.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Outlet Name</label>
          <input className={inputCls} placeholder="Main Branch" value={data.outlet_name}
            onChange={e => onChange({ outlet_name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>City</label>
          <input className={inputCls} placeholder="Mumbai" value={data.city}
            onChange={e => onChange({ city: e.target.value })} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Full Address</label>
        <textarea className={inputCls} rows={2} placeholder="123 Main Street, Bandra West"
          value={data.address} onChange={e => onChange({ address: e.target.value })} />
      </div>

      <div>
        <label className={labelCls}>Outlet Phone</label>
        <input className={inputCls} type="tel" placeholder="+91 98765 43210" value={data.phone}
          onChange={e => onChange({ phone: e.target.value })} />
      </div>

      <div>
        <label className={labelCls}>Service Modes</label>
        <div className="grid grid-cols-3 gap-3">
          {SERVICE_MODES.map(({ id, label, Icon }) => {
            const active = data[id] === true;
            return (
              <button key={id} type="button"
                onClick={() => onChange({ [id]: !active })}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                  ${active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <Icon size={22} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                <span className={`text-sm font-medium ${active ? 'text-indigo-700' : 'text-gray-500'}`}>{label}</span>
                {active && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">Active</span>}
              </button>
            );
          })}
        </div>
      </div>

      {data.dine_in && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center gap-3">
            <div>
              <label className={labelCls}>Number of Tables</label>
              <input className={`${inputCls} w-28`} type="number" min={1} max={500}
                value={data.table_count} onChange={e => onChange({ table_count: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">Enable QR Ordering</div>
              <div className="text-xs text-gray-400">Customers scan QR code to order from their phone</div>
            </div>
            <button type="button" onClick={() => onChange({ enable_qr: !data.enable_qr })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${data.enable_qr ? 'bg-indigo-600' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                ${data.enable_qr ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

function Step3({ data, onChange, country }) {
  const [parsing, setParsing] = useState(false);

  const parseMenu = async () => {
    if (!data.menu_text.trim()) { toast.error('Paste some menu text first'); return; }
    setParsing(true);
    try {
      const res = await api.post('/onboarding/parse-menu', {
        menu_text: data.menu_text,
        currency: country === 'AU' ? 'AUD' : 'INR',
      });
      const items = (res.data?.data || res.data?.items || []).map((item, i) => ({
        id: i,
        name: item.name || '',
        category: item.category || 'Main Course',
        price: item.price || 0,
        food_type: item.food_type || 'veg',
      }));
      onChange({ parsed_items: items, approved_items: items });
      toast.success(`Parsed ${items.length} items!`);
    } catch {
      toast.error('Parse failed. Please try again.');
    } finally {
      setParsing(false);
    }
  };

  const updateItem = (idx, field, value) => {
    const items = [...(data.approved_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ approved_items: items });
  };

  const removeItem = (idx) => {
    const items = (data.approved_items || []).filter((_, i) => i !== idx);
    onChange({ approved_items: items });
  };

  const addItem = () => {
    const items = [...(data.approved_items || []), { id: Date.now(), name: '', category: '', price: 0, food_type: 'veg' }];
    onChange({ approved_items: items });
  };

  const FOOD_TYPE_COLORS = { veg: 'text-green-600', 'non-veg': 'text-red-600', egg: 'text-yellow-600' };
  const FOOD_TYPE_DOTS = { veg: 'bg-green-500', 'non-veg': 'bg-red-500', egg: 'bg-yellow-500' };
  const MODES = [
    { id: 'ai_text',  label: '📝 Paste Menu Text' },
    { id: 'scratch',  label: '✏️ Start from Scratch' },
    { id: 'photo',    label: '📸 AI Photo Scan',    disabled: true },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Build Your Menu with AI ✨</h2>
        <p className="text-gray-500 mt-1">Import your existing menu in seconds.</p>
      </div>

      <div className="flex gap-2">
        {MODES.map(m => (
          <button key={m.id} type="button" disabled={m.disabled}
            onClick={() => !m.disabled && onChange({ input_mode: m.id })}
            className={`relative px-4 py-2 rounded-xl text-sm font-medium border transition-all
              ${m.disabled ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400' : ''}
              ${!m.disabled && data.input_mode === m.id ? 'bg-indigo-600 text-white border-indigo-600' : ''}
              ${!m.disabled && data.input_mode !== m.id ? 'border-gray-200 text-gray-600 hover:border-indigo-300' : ''}`}>
            {m.label}
            {m.disabled && <span className="ml-1 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">Soon</span>}
          </button>
        ))}
      </div>

      {data.input_mode === 'ai_text' && (
        <div className="space-y-3">
          <textarea className={inputCls} rows={8}
            placeholder={country === 'AU'
              ? "Paste your full menu here — e.g.\nGrilled Barramundi - A$28\nLamb Rack (Half/Full) - A$22/A$38\nGarlic Bread - A$8"
              : "Paste your full menu here — e.g.\nPaneer Butter Masala - ₹250\nChicken Biryani (Half/Full) - ₹180/₹320\nGarlic Naan - ₹40"}
            value={data.menu_text}
            onChange={e => onChange({ menu_text: e.target.value })} />
          <button type="button" onClick={parseMenu} disabled={parsing}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-60">
            {parsing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {parsing ? 'Parsing...' : 'Parse with AI ✨'}
          </button>

          {(data.approved_items || []).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={sectionHeading}>
                  Menu Items
                  <span className="ml-2 text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    {data.approved_items.length} items ready to import
                  </span>
                </span>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Type</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Name</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Category</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Price</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.approved_items.map((item, idx) => (
                      <tr key={item.id ?? idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-1.5">
                          <select value={item.food_type}
                            onChange={e => updateItem(idx, 'food_type', e.target.value)}
                            className={`text-xs font-semibold border-0 bg-transparent outline-none ${FOOD_TYPE_COLORS[item.food_type]}`}>
                            <option value="veg">🟢 Veg</option>
                            <option value="non-veg">🔴 Non-Veg</option>
                            <option value="egg">🟡 Egg</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <input className="w-full border-0 bg-transparent outline-none text-gray-800 focus:ring-0 text-sm"
                            value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Item name" />
                        </td>
                        <td className="px-3 py-1.5">
                          <input className="w-full border-0 bg-transparent outline-none text-gray-600 focus:ring-0 text-sm"
                            value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)} placeholder="Category" />
                        </td>
                        <td className="px-3 py-1.5">
                          <input className="w-20 border-0 bg-transparent outline-none text-gray-800 focus:ring-0 text-sm"
                            type="number" value={item.price} onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" onClick={addItem}
                  className="flex items-center gap-1 w-full px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-gray-100">
                  <Plus size={14} /> Add Item
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {data.input_mode === 'scratch' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
          <span className="text-2xl">💡</span>
          <span>You can add items from the <strong>Menu page</strong> after setup is complete. No worries!</span>
        </div>
      )}
    </div>
  );
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────

function Step4({ data, onChange }) {
  const [form, setForm] = useState({ name: '', phone: '', role: 'Cashier', pin: '' });

  const addMember = () => {
    if (!form.name.trim()) { toast.error('Enter staff name'); return; }
    if (form.pin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    onChange({ staff_members: [...(data.staff_members || []), { ...form, id: Date.now() }] });
    setForm({ name: '', phone: '', role: 'Cashier', pin: '' });
  };

  const removeMember = (id) => {
    onChange({ staff_members: (data.staff_members || []).filter(m => m.id !== id) });
  };

  const ROLE_COLORS = {
    Manager:     'bg-purple-100 text-purple-700',
    Cashier:     'bg-blue-100 text-blue-700',
    Captain:     'bg-green-100 text-green-700',
    Chef:        'bg-orange-100 text-orange-700',
    'KOT Screen':'bg-gray-100 text-gray-700',
  };

  const initials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const AVATAR_COLORS = ['bg-indigo-500', 'bg-pink-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-blue-500'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Build Your Team</h2>
        <p className="text-gray-500 mt-1">Add staff members who will use MS-RM POS.</p>
      </div>

      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
        <p className={sectionHeading}>Add Staff Member</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} placeholder="John Doe" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} type="tel" placeholder="+91 99999 00000" value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select className={inputCls} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>4-Digit PIN</label>
            <input className={inputCls} type="number" maxLength={4} placeholder="1234" value={form.pin}
              onChange={e => setForm(p => ({ ...p, pin: e.target.value.slice(0, 4) }))} />
          </div>
        </div>
        <button type="button" onClick={addMember}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:shadow-lg transition-all">
          <Plus size={16} /> Add Member
        </button>
      </div>

      {(data.staff_members || []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400">
          <Users size={48} className="mb-3 opacity-30" />
          <p className="font-medium">Your team will appear here</p>
          <p className="text-sm">Add at least one staff member above</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(data.staff_members || []).map((m, idx) => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                {initials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{m.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[m.role] || 'bg-gray-100 text-gray-600'}`}>{m.role}</span>
                  <span className="text-xs text-gray-400">{m.phone || '–'}</span>
                </div>
                <div className="text-xs text-gray-300 tracking-widest mt-0.5">••••</div>
              </div>
              <button type="button" onClick={() => removeMember(m.id)} className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 5 ───────────────────────────────────────────────────────────────────

function Step5({ data, onChange }) {
  const togglePayment = (id) => {
    const modes = data.payment_modes || [];
    onChange({ payment_modes: modes.includes(id) ? modes.filter(m => m !== id) : [...modes, id] });
  };

  const ORDER_TYPES = [
    { id: 'dine_in',  label: 'Dine-in',  Icon: UtensilsCrossed },
    { id: 'takeaway', label: 'Takeaway', Icon: ShoppingBag },
    { id: 'delivery', label: 'Delivery', Icon: Truck },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configure Your POS</h2>
        <p className="text-gray-500 mt-1">Set defaults for your Point-of-Sale system.</p>
      </div>

      <div>
        <p className={sectionHeading}>Default Order Type</p>
        <div className="grid grid-cols-3 gap-3">
          {ORDER_TYPES.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => onChange({ default_order_type: id })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                ${data.default_order_type === id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <Icon size={22} className={data.default_order_type === id ? 'text-indigo-600' : 'text-gray-400'} />
              <span className={`text-sm font-medium ${data.default_order_type === id ? 'text-indigo-700' : 'text-gray-500'}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={sectionHeading}>Payment Modes</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_MODES.map(({ id, label, emoji }) => {
            const active = (data.payment_modes || []).includes(id);
            return (
              <button key={id} type="button" onClick={() => togglePayment(id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all
                  ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                <span>{emoji}</span> {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={labelCls}>Receipt Footer Message</label>
        <textarea className={inputCls} rows={1}
          value={data.receipt_footer}
          onChange={e => onChange({ receipt_footer: e.target.value })} />
      </div>

      <div>
        <p className={sectionHeading}>Voice POS Language</p>
        <div className="flex flex-wrap gap-2">
          {VOICE_LANGUAGES.map(lang => {
            const active = data.voice_language === lang.code && (
              // handle Hinglish uniqueness by label
              lang.label === 'Hinglish'
                ? data.voice_language_label === 'Hinglish'
                : data.voice_language_label !== 'Hinglish'
            );
            const isSelected = data.voice_language_label === lang.label ||
              (!data.voice_language_label && data.voice_language === lang.code && lang.label === 'English');
            return (
              <button key={lang.label} type="button"
                onClick={() => onChange({ voice_language: lang.code, voice_language_label: lang.label })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all
                  ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                <span>{lang.flag}</span> {lang.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 6 ───────────────────────────────────────────────────────────────────

function Step6({ data, onChange, onSkip }) {
  const INTEGRATIONS = [
    { id: 'swiggy_key',      label: 'Swiggy',            color: 'bg-orange-500', letter: 'S', desc: 'Sync Swiggy orders', placeholder: 'Swiggy API Key' },
    { id: 'zomato_key',      label: 'Zomato',            color: 'bg-red-500',    letter: 'Z', desc: 'Sync Zomato orders', placeholder: 'Zomato API Key' },
    { id: 'ubereats_key',    label: 'UberEats',          color: 'bg-green-600',  letter: 'U', desc: 'Sync UberEats orders', placeholder: 'UberEats API Key' },
    { id: 'menulog_key',     label: 'Menulog',           color: 'bg-orange-600', letter: 'M', desc: 'AU — Menulog orders', placeholder: 'Menulog API Key' },
    { id: 'whatsapp_number', label: 'WhatsApp Business', color: 'bg-green-500',  letter: 'W', desc: 'Send order updates via WhatsApp', placeholder: '+91 98765 43210' },
    { id: 'razorpay_key_id', label: 'Razorpay',          color: 'bg-indigo-600', letter: 'R', desc: 'Online payments', placeholder: 'rzp_live_xxxxxxxxxx' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Connect Your Delivery Apps</h2>
        <p className="text-gray-500 mt-1">All optional — connect anytime from Settings.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {INTEGRATIONS.map(({ id, label, color, letter, desc, placeholder }) => {
          const filled = !!data[id];
          return (
            <div key={id} className={`p-4 bg-white border-2 rounded-xl transition-all ${filled ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {letter}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-800">{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </div>
                {filled
                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Check size={10} /> Connected</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Optional</span>}
              </div>
              <input className={inputCls} placeholder={placeholder} value={data[id] || ''}
                onChange={e => onChange({ [id]: e.target.value })} />
            </div>
          );
        })}
      </div>

      <button type="button" onClick={onSkip}
        className="block w-full text-center text-gray-400 hover:text-gray-600 text-sm py-2 transition-colors">
        Skip All &amp; Continue →
      </button>
    </div>
  );
}

// ─── Step 7 ───────────────────────────────────────────────────────────────────

function Step7({ wizardData, completedSteps, onComplete, saving }) {
  const menuCount = (wizardData.step3?.approved_items || []).length;
  const staffCount = (wizardData.step4?.staff_members || []).length;
  const tableCount = wizardData.step2?.table_count || 0;

  const CHECKLIST = [
    { step: 1, label: 'Business Profile' },
    { step: 2, label: 'Outlet Configured' },
    { step: 3, label: 'Menu Added' },
    { step: 4, label: 'Team Setup' },
    { step: 5, label: 'POS Configured' },
    { step: 6, label: 'Integrations' },
  ];

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(600px) rotate(720deg); opacity: 0; }
        }
        @keyframes rocket-bounce {
          0%, 100% { transform: translateY(0) rotate(-10deg); }
          50%       { transform: translateY(-18px) rotate(-10deg); }
        }
        .confetti-dot { position: absolute; width: 8px; height: 8px; border-radius: 2px; animation: confetti-fall 3s ease-in infinite; }
        .rocket-icon  { animation: rocket-bounce 1.4s ease-in-out infinite; }
      `}</style>

      {/* Confetti */}
      <div className="absolute inset-x-0 top-0 h-full overflow-hidden pointer-events-none">
        {['#6366f1','#a855f7','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444'].map((color, i) => (
          <div key={i} className="confetti-dot"
            style={{ left: `${10 + i * 13}%`, backgroundColor: color, animationDelay: `${i * 0.4}s`, animationDuration: `${2.5 + i * 0.3}s` }} />
        ))}
      </div>

      <div className="flex flex-col items-center text-center space-y-6 py-4 relative">
        <div className="rocket-icon text-6xl select-none">🚀</div>

        <div>
          <h2 className="text-3xl font-bold text-gray-900">You're All Set! 🎉</h2>
          <p className="text-gray-500 mt-2">Your restaurant is ready to launch on MS-RM.</p>
        </div>

        <div className="w-full max-w-sm space-y-2 text-left">
          {CHECKLIST.map(({ step, label }) => {
            const done = completedSteps.includes(step);
            return (
              <div key={step} className="flex items-center gap-3">
                {done
                  ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                  : <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 flex-shrink-0" />}
                <span className={`text-sm ${done ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-8 py-4 px-8 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-700">{menuCount}</div>
            <div className="text-xs text-gray-500">Menu Items</div>
          </div>
          <div className="h-8 w-px bg-indigo-200" />
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-700">{staffCount}</div>
            <div className="text-xs text-gray-500">Staff Members</div>
          </div>
          <div className="h-8 w-px bg-indigo-200" />
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-700">{tableCount}</div>
            <div className="text-xs text-gray-500">Tables</div>
          </div>
        </div>

        <button type="button" onClick={onComplete} disabled={saving}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-2xl text-lg font-bold hover:shadow-xl transition-all disabled:opacity-60">
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Rocket size={20} />}
          {saving ? 'Launching...' : 'Open My Restaurant 🚀'}
        </button>

        <button type="button" onClick={() => window.location.href = '/'}
          className="text-gray-400 hover:text-gray-600 text-sm underline transition-colors">
          Explore Dashboard First →
        </button>
      </div>
    </>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ currentStep, completedSteps }) {
  return (
    <div className="px-8 pt-8 pb-6 border-b border-gray-100">
      <div className="relative flex items-center justify-between">
        {/* connecting line */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200" />
        <div className="absolute top-5 left-5 h-0.5 bg-indigo-500 transition-all duration-500"
          style={{ width: `${((Math.max(currentStep, Math.max(0, ...completedSteps)) - 1) / (STEPS.length - 1)) * 100}%` }} />

        {STEPS.map((step) => {
          const Icon = step.icon;
          const isCompleted = completedSteps.includes(step.id);
          const isActive = currentStep === step.id;
          const isFuture = !isCompleted && !isActive;

          return (
            <div key={step.id} className="relative flex flex-col items-center z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
                ${isCompleted ? 'bg-green-500' : isActive ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                {isCompleted
                  ? <Check size={16} className="text-white" />
                  : <Icon size={16} className={isActive ? 'text-white' : 'text-gray-400'} />}
              </div>
              <div className="mt-1.5 text-center">
                <div className={`text-xs font-medium ${isActive ? 'text-indigo-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                  {step.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user } = useSelector((s) => s.auth);

  // Derive default country from user's head_office region or outlet country
  const defaultCountry = user?.head_office?.region === 'AU' || user?.outlet?.currency === 'AUD' || user?.outlet?.country === 'Australia' ? 'AU' : 'IN';
  const isAU = defaultCountry === 'AU';

  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [saving, setSaving] = useState(false);

  const [wizardData, setWizardData] = useState({
    step1: { restaurant_name: '', legal_name: '', cuisine_types: [], business_type: '', country: defaultCountry, gstin: '', abn: '', acn: '', fssai: '', logo_url: '', operating_hours: {} },
    step2: { outlet_name: '', address: '', city: '', phone: '', dine_in: true, takeaway: true, delivery: false, table_count: 10, enable_qr: true },
    step3: { menu_text: '', parsed_items: [], approved_items: [], input_mode: 'ai_text' },
    step4: { staff_members: [] },
    step5: { default_order_type: 'dine_in', payment_modes: isAU ? ['cash', 'eftpos'] : ['cash', 'upi'], receipt_footer: 'Thank you for dining with us!', voice_language: isAU ? 'en-AU' : 'en-IN', voice_language_label: isAU ? 'Australian English' : 'English' },
    step6: { swiggy_key: '', zomato_key: '', ubereats_key: '', menulog_key: '', whatsapp_number: '', razorpay_key_id: '' },
    step7: {},
  });

  // Load saved progress
  useEffect(() => {
    const savedStep = parseInt(localStorage.getItem('onboarding_step')) || 1;
    if (savedStep > 1) setCurrentStep(savedStep);
    api.get('/onboarding/status').then(r => {
      if (r.data?.data?.current_step > 1) setCurrentStep(r.data.data.current_step);
      if (r.data?.data?.completed_steps) setCompletedSteps(r.data.data.completed_steps);
    }).catch(() => {});
  }, []);

  const updateStep = useCallback((stepKey, patch) => {
    setWizardData(prev => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], ...patch },
    }));
  }, []);

  const handleNext = async (stepData = {}) => {
    setSaving(true);
    const merged = { ...wizardData[`step${currentStep}`], ...stepData };
    setWizardData(prev => ({ ...prev, [`step${currentStep}`]: merged }));
    try {
      await api.post(`/onboarding/step/${currentStep}`, { data: merged });
    } catch {
      // advance offline
    } finally {
      setCompletedSteps(prev => [...new Set([...prev, currentStep])]);
      localStorage.setItem('onboarding_step', String(currentStep + 1));
      setCurrentStep(c => c + 1);
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(c => c - 1);
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding_step', String(currentStep + 1));
    setCurrentStep(c => c + 1);
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await api.post('/onboarding/complete');
      localStorage.setItem('msrm_onboarding_complete', 'true');
      try {
        const raw = localStorage.getItem('msrm_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u?.head_office) u.head_office.setup_completed = true;
          localStorage.setItem('msrm_user', JSON.stringify(u));
        }
      } catch { /* ignore */ }
      toast.success("Welcome to MS-RM! Let's build something great 🚀");
      window.location.href = '/';
    } catch {
      toast.error('Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const isLastStep = currentStep === STEPS.length;
  const currentStepKey = `step${currentStep}`;

  return (
    <div className="fixed inset-0 z-[999] overflow-y-auto">
      {/* Background */}
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-900 relative">
        {/* Animated blobs */}
        <div className="absolute top-[-100px] left-[-100px] w-96 h-96 bg-indigo-600 rounded-full opacity-20 blur-3xl animate-pulse" />
        <div className="absolute bottom-[-80px] right-[-80px] w-80 h-80 bg-purple-600 rounded-full opacity-20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-pink-600 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

        <div className="relative max-w-4xl mx-auto my-8 px-4">
          {/* Card */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <ProgressBar currentStep={currentStep} completedSteps={completedSteps} />

            {/* Step content */}
            <div className="p-8 min-h-[480px] relative">
              {currentStep === 1 && (
                <Step1
                  data={wizardData.step1}
                  onChange={patch => updateStep('step1', patch)}
                />
              )}
              {currentStep === 2 && (
                <Step2
                  data={wizardData.step2}
                  onChange={patch => updateStep('step2', patch)}
                  restaurantName={wizardData.step1.restaurant_name}
                />
              )}
              {currentStep === 3 && (
                <Step3
                  data={wizardData.step3}
                  onChange={patch => updateStep('step3', patch)}
                  country={wizardData.step1.country}
                />
              )}
              {currentStep === 4 && (
                <Step4
                  data={wizardData.step4}
                  onChange={patch => updateStep('step4', patch)}
                />
              )}
              {currentStep === 5 && (
                <Step5
                  data={wizardData.step5}
                  onChange={patch => updateStep('step5', patch)}
                />
              )}
              {currentStep === 6 && (
                <Step6
                  data={wizardData.step6}
                  onChange={patch => updateStep('step6', patch)}
                  onSkip={handleNext}
                />
              )}
              {currentStep === 7 && (
                <Step7
                  wizardData={wizardData}
                  completedSteps={completedSteps}
                  onComplete={handleComplete}
                  saving={saving}
                />
              )}
            </div>

            {/* Bottom navigation */}
            {!isLastStep && (
              <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-3xl">
                <button type="button" onClick={handleBack} disabled={currentStep === 1}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm disabled:opacity-30 transition-colors">
                  <ChevronLeft size={16} /> Back
                </button>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={handleSkip}
                    className="text-gray-400 hover:text-gray-600 text-sm underline transition-colors">
                    Skip
                  </button>
                  <button type="button" onClick={() => handleNext()} disabled={saving}
                    className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-2xl font-semibold hover:shadow-lg transition-all disabled:opacity-60">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                    {saving ? 'Saving...' : currentStep === 6 ? 'Almost Done →' : 'Next'}
                    {!saving && <ChevronRight size={16} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer note */}
          <p className="text-center text-slate-400 text-sm mt-4 pb-4">
            MS-RM System &mdash; You can change these settings anytime from the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
