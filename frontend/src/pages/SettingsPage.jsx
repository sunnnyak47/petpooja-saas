import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Settings, Printer, Monitor, CreditCard, Palette, Bell,
  Save, RotateCcw, ChevronRight, CheckCircle2,
  Store, Barcode, DollarSign, Mic, History, Trash2, Lock
} from 'lucide-react';
import ThemeSelector from '../themes/ThemeSelector';
import { useRegion } from '../hooks/useRegion';
import { updateUser } from '../store/slices/authSlice';
import LogoUploader from '../components/branding/LogoUploader';
import {
  VOICE_LANGUAGES, DEFAULT_VOICE_SETTINGS,
  loadVoiceSettings, saveVoiceSettings,
  loadVoiceHistory, clearVoiceHistory
} from '../hooks/useVoiceOrder';

const SECTIONS = [
  { id: 'general', label: 'General', icon: <Store className="w-5 h-5" /> },
  { id: 'tax', label: 'Tax & GST', icon: <DollarSign className="w-5 h-5" /> },
  { id: 'voice', label: 'Voice POS', icon: <Mic className="w-5 h-5" /> },
  { id: 'receipt', label: 'Receipt Printer', icon: <Printer className="w-5 h-5" /> },
  { id: 'kds', label: 'KDS Display', icon: <Monitor className="w-5 h-5" /> },
  { id: 'payment', label: 'Payment', icon: <CreditCard className="w-5 h-5" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-5 h-5" /> },
  { id: 'hardware', label: 'Hardware', icon: <Barcode className="w-5 h-5" /> },
];

/**
 * M13/M17: Settings & Hardware Configuration Page
 */
export default function SettingsPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const region = useRegion();
  const isAU = region === 'AU';
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const [activeSection, setActiveSection] = useState('general');

  // Brand identity (chain colour + logo) — owner only, saved via /ho/my-branding.
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const [brand, setBrand] = useState({
    primary_color: user?.head_office?.primary_color || user?.primary_color || '#4F46E5',
    logo_url: user?.head_office?.logo_url || user?.logo_url || '',
  });
  const applyAccentLive = (hex) => {
    if (HEX.test(hex)) {
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-hover', hex + 'dd');
    }
  };
  const brandingMutation = useMutation({
    mutationFn: (payload) => api.patch('/ho/my-branding', payload),
    onSuccess: (_res, payload) => {
      dispatch(updateUser({
        primary_color: payload.primary_color,
        logo_url: payload.logo_url,
        head_office: { ...(user?.head_office || {}), primary_color: payload.primary_color, logo_url: payload.logo_url },
      }));
      applyAccentLive(payload.primary_color);
      toast.success('Branding saved');
    },
    onError: (e) => toast.error(e.message || 'Could not save branding'),
  });

  // Self-service password change (owner) — verifies current password server-side.
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const changePasswordMutation = useMutation({
    mutationFn: () => api.post('/auth/change-password', { current_password: pw.current, new_password: pw.next }),
    onSuccess: () => { toast.success('Password changed successfully'); setPw({ current: '', next: '', confirm: '' }); },
    onError: (e) => toast.error(e?.message || e?.response?.data?.message || 'Could not change password'),
  });
  const submitPasswordChange = (e) => {
    e.preventDefault();
    if (pw.next.length < 8) return toast.error('New password must be at least 8 characters');
    if (pw.next !== pw.confirm) return toast.error('New password and confirmation do not match');
    if (pw.next === pw.current) return toast.error('New password must be different from the current one');
    changePasswordMutation.mutate();
  };
  // ThemeSelector component handles theme switching via its own useTheme hook.
  // No theme state needed directly in this page.


  const [settings, setSettings] = useState({
    // General — region-aware defaults
    outlet_name: '',
    currency: isAU ? 'AUD' : 'INR',
    timezone: isAU ? 'Australia/Sydney' : 'Asia/Kolkata',
    language: 'en',
    // Dine-in / POS behaviour
    require_table_for_dine_in: false,
    auto_free_enabled: false,
    auto_free_grace_seconds: 30,
    // Tax / Compliance
    default_gst_slab: '5',
    gst_inclusive: false,
    service_charge_pct: '0',
    gstin: '',
    fssai_number: '',
    abn: '',
    acn: '',
    // Receipt
    printer_type: 'thermal',
    printer_ip: '',
    printer_port: '9100',
    paper_width: '80',
    print_logo: true,
    print_address: true,
    footer_text: 'Thank you for dining with us!',
    // KDS
    kds_auto_accept: false,
    kds_alert_threshold: '10',
    kds_sound: true,
    // Payment
    accept_cash: true,
    accept_card: true,
    // UPI is an India-only method; EFTPOS is the AU card-present default.
    accept_upi: !isAU,
    accept_eftpos: isAU,
    upi_vpa: '',
    merchant_name: '',
    razorpay_enabled: false,
    razorpay_key: '',
    // Notifications
    sms_enabled: false,
    email_enabled: true,
    whatsapp_enabled: false,
    low_stock_alert: true,
    // Appearance
    primary_color: '#4F46E5',
    dark_mode: true,
    compact_layout: false,
    // Hardware
    cash_drawer_enabled: false,
    cash_drawer_port: '',
    barcode_scanner_enabled: false,
    weighing_scale_enabled: false,
    customer_display_enabled: false,
  });

  const updateSetting = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  // Revert any unsaved edits back to the last-saved values from the backend.
  const resetSettings = () => {
    setSettings(prev => ({
      ...prev,
      outlet_name: savedSettings?.outlet_name || outletInfo?.name || prev.outlet_name,
      ...(savedSettings || {}),
    }));
    toast.success('Reverted to last saved settings');
  };

  // Load saved settings from backend on mount
  const { data: savedSettings } = useQuery({
    queryKey: ['outlet-settings', outletId],
    queryFn: async () => {
      if (!outletId) return null;
      const res = await api.get(`/ho/settings?outlet_id=${outletId}`);
      return res.data?.data || res.data;
    },
    enabled: !!outletId,
    staleTime: 60000,
  });

  // Also fetch the outlet record itself for name/branding fallbacks
  const { data: outletInfo } = useQuery({
    queryKey: ['outlet-info', outletId],
    queryFn: async () => {
      if (!outletId) return null;
      try {
        const res = await api.get(`/ho/outlets/${outletId}`);
        return res.data?.data || res.data;
      } catch { return null; }
    },
    enabled: !!outletId,
    staleTime: 60000,
  });

  // Merge saved settings into local state once they load
  useEffect(() => {
    if (savedSettings || outletInfo) {
      setSettings(prev => ({
        ...prev,
        // Outlet name from outlet record if settings doesn't have it
        outlet_name: savedSettings?.outlet_name || outletInfo?.name || prev.outlet_name,
        ...(savedSettings || {}),
      }));
      // Hydrate Voice POS settings (voice_* keys) from the DB back into the
      // localStorage the live mic reads, so they sync across devices.
      if (savedSettings) {
        const voice = {};
        Object.entries(savedSettings).forEach(([k, val]) => {
          if (k.startsWith('voice_')) voice[k.slice(6)] = val;
        });
        if (Object.keys(voice).length) { try { saveVoiceSettings(voice); } catch { /* optional */ } }
      }
    }
  }, [savedSettings, outletInfo]);

  // Theme preference is saved locally (localStorage) by ThemeContext.
  // All other settings are persisted via the API.
  const saveMutation = useMutation({
    mutationFn: () => {
      const { primary_color, dark_mode, ...apiSettings } = settings;
      // Don't persist the payment flag that is irrelevant to the active region
      // (UPI is hidden on AU outlets; EFTPOS is hidden on non-AU outlets).
      if (isAU) {
        delete apiSettings.accept_upi;
      } else {
        delete apiSettings.accept_eftpos;
      }
      // Voice POS settings live in localStorage for the live mic; mirror them to
      // the DB (voice_* keys) so they sync across devices and survive a reinstall.
      try {
        const v = loadVoiceSettings();
        Object.entries(v).forEach(([k, val]) => { apiSettings[`voice_${k}`] = val; });
      } catch { /* voice settings optional */ }
      return api.put(`/ho/settings`, { outlet_id: outletId, settings: apiSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['outlet-settings', outletId]);
      // Persist payment settings locally for PaymentModal
      try {
        const saved = JSON.parse(localStorage.getItem('msrm_settings') || '{}');
        localStorage.setItem('msrm_settings', JSON.stringify({
          ...saved,
          upi_vpa: settings.upi_vpa,
          merchant_name: settings.merchant_name,
          razorpay_key: settings.razorpay_key,
          razorpay_enabled: settings.razorpay_enabled,
        }));
      } catch {}
      toast.success('Settings saved successfully');
    },
    onError: (e) => toast.error(e.message || 'Failed to save settings'),
  });

  const ToggleSwitch = ({ checked, onChange, label, description }) => (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 pr-4">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
        style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );

  const Field = ({ label, children }) => (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );

  const SectionTitle = ({ title, subtitle }) => (
    <div className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-5">
            <SectionTitle title="General Settings" subtitle="Basic outlet information and regional preferences" />
            <Field label="Restaurant Name">
              <input value={settings.outlet_name} onChange={(e) => updateSetting('outlet_name', e.target.value)} className="input" placeholder="e.g. Madsun Kitchen" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Currency">
                <select value={settings.currency} onChange={(e) => updateSetting('currency', e.target.value)} className="input">
                  <option value="INR">₹ Indian Rupee (INR)</option>
                  <option value="AUD">A$ Australian Dollar (AUD)</option>
                  <option value="USD">USD ($)</option>
                  <option value="AED">AED (د.إ)</option>
                  <option value="ZAR">ZAR (R)</option>
                </select>
              </Field>
              <Field label="Language">
                <select value={settings.language} onChange={(e) => updateSetting('language', e.target.value)} className="input">
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="mr">Marathi</option>
                  <option value="ta">Tamil</option>
                </select>
              </Field>
            </div>
            <Field label="Timezone">
              <select value={settings.timezone} onChange={(e) => updateSetting('timezone', e.target.value)} className="input">
                <option value="Asia/Kolkata">IST — India Standard Time (UTC+5:30)</option>
                <option value="Australia/Sydney">AEST — Australian Eastern (Sydney/Melbourne)</option>
                <option value="Australia/Melbourne">AEST — Melbourne</option>
                <option value="Australia/Brisbane">AEST — Brisbane (no DST)</option>
                <option value="Australia/Perth">AWST — Perth (UTC+8)</option>
                <option value="Australia/Adelaide">ACST — Adelaide (UTC+9:30)</option>
                <option value="Australia/Darwin">ACST — Darwin</option>
              </select>
            </Field>

            <div className="pt-2 border-t border-border/60">
              <SectionTitle title="Dine-In Orders" subtitle="Control how dine-in orders are placed at the POS" />
              <ToggleSwitch
                label="Require table selection for dine-in"
                description="When ON, a dine-in order cannot be placed until a table is selected. Turn OFF to make the table optional."
                checked={settings.require_table_for_dine_in}
                onChange={(v) => updateSetting('require_table_for_dine_in', v)}
              />
            </div>

            <div className="pt-2 border-t border-border/60">
              <SectionTitle title="Auto-Free Table" subtitle="Predictively free a table after it is billed and the kitchen marks the order served" />
              <ToggleSwitch
                label="Enable predictive auto-free"
                description="After a dine-in order is paid and served, the table is scheduled to free automatically based on dishes and seats. A reminder popup lets staff free now, snooze, or cancel."
                checked={settings.auto_free_enabled}
                onChange={(v) => updateSetting('auto_free_enabled', v)}
              />
              {settings.auto_free_enabled && (
                <Field label="Reminder grace countdown">
                  <select
                    value={String(settings.auto_free_grace_seconds)}
                    onChange={(e) => updateSetting('auto_free_grace_seconds', Number(e.target.value))}
                    className="input"
                  >
                    <option value="15">15 seconds</option>
                    <option value="30">30 seconds</option>
                    <option value="45">45 seconds</option>
                    <option value="60">1 minute</option>
                    <option value="120">2 minutes</option>
                  </select>
                  <p className="text-xs text-secondary mt-1">How long the popup counts down before the table frees itself if no one responds.</p>
                </Field>
              )}
            </div>
          </div>
        );
      case 'tax': {
        const isAUSett = settings.currency === 'AUD' || isAU;
        return (
          <div className="space-y-5">
            <SectionTitle title={isAUSett ? 'Tax & Compliance (AU)' : 'Tax & GST'} subtitle={isAUSett ? 'Configure ABN/ACN and GST settings for Australian operations' : 'Configure GST registration and applicable tax slabs'} />
            {isAUSett ? (
              <>
                <Field label="ABN (Australian Business Number)">
                  <input value={settings.abn} onChange={(e) => updateSetting('abn', e.target.value)} className="input font-mono" placeholder="12 345 678 901" maxLength={11} />
                </Field>
                <Field label="ACN (Australian Company Number)">
                  <input value={settings.acn} onChange={(e) => updateSetting('acn', e.target.value)} className="input font-mono" placeholder="123 456 789" maxLength={9} />
                </Field>
              </>
            ) : (
              <>
                <Field label="GSTIN">
                  <input value={settings.gstin} onChange={(e) => updateSetting('gstin', e.target.value)} className="input font-mono" placeholder="22AAAAA0000A1Z5" maxLength={15} />
                </Field>
                <Field label="FSSAI Number">
                  <input value={settings.fssai_number} onChange={(e) => updateSetting('fssai_number', e.target.value)} className="input font-mono" placeholder="FSSAI licence number" maxLength={14} />
                </Field>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Default GST Slab">
                <select value={settings.default_gst_slab} onChange={(e) => updateSetting('default_gst_slab', e.target.value)} className="input">
                  {isAUSett ? (
                    <>
                      <option value="0">0% — GST Free</option>
                      <option value="10">10% — Standard GST</option>
                    </>
                  ) : (
                    <>
                      <option value="0">0% — Exempt</option>
                      <option value="5">5% — Non-AC Restaurant</option>
                      <option value="12">12%</option>
                      <option value="18">18% — AC Restaurant</option>
                    </>
                  )}
                </select>
              </Field>
              <Field label="Service Charge (%)">
                <input type="number" value={settings.service_charge_pct} onChange={(e) => updateSetting('service_charge_pct', e.target.value)} className="input" step="0.5" min="0" max="20" />
              </Field>
            </div>
            <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <ToggleSwitch label={isAUSett ? 'GST Inclusive Pricing (10%)' : 'GST Inclusive Pricing'} description="Menu prices already include GST" checked={settings.gst_inclusive} onChange={(v) => updateSetting('gst_inclusive', v)} />
            </div>
          </div>
        );
      }
      case 'voice':
        return <VoicePOSSection />;
      case 'receipt':
        return (
          <div className="space-y-5">
            <SectionTitle title="Receipt Printer" subtitle="Configure thermal or network printer settings" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Printer Type">
                <select value={settings.printer_type} onChange={(e) => updateSetting('printer_type', e.target.value)} className="input">
                  <option value="thermal">Thermal (ESC/POS)</option>
                  <option value="dot_matrix">Dot Matrix</option>
                  <option value="laser">Laser</option>
                  <option value="browser">Browser Print</option>
                </select>
              </Field>
              <Field label="Paper Width">
                <select value={settings.paper_width} onChange={(e) => updateSetting('paper_width', e.target.value)} className="input">
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                  <option value="A4">A4</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Printer IP Address">
                <input value={settings.printer_ip} onChange={(e) => updateSetting('printer_ip', e.target.value)} className="input font-mono" placeholder="192.168.1.100" />
              </Field>
              <Field label="Port">
                <input value={settings.printer_port} onChange={(e) => updateSetting('printer_port', e.target.value)} className="input font-mono" placeholder="9100" />
              </Field>
            </div>
            <div className="pt-1 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
              <ToggleSwitch label="Print Logo" description="Include outlet logo on receipts" checked={settings.print_logo} onChange={(v) => updateSetting('print_logo', v)} />
              <ToggleSwitch label="Print Address" description="Show outlet address on receipts" checked={settings.print_address} onChange={(v) => updateSetting('print_address', v)} />
            </div>
            <Field label="Footer Message">
              <input value={settings.footer_text} onChange={(e) => updateSetting('footer_text', e.target.value)} className="input" placeholder="Thank you for dining with us!" />
            </Field>
          </div>
        );
      case 'kds':
        return (
          <div className="space-y-5">
            <SectionTitle title="Kitchen Display" subtitle="Control how orders appear on KDS screens" />
            <div className="space-y-1">
              <ToggleSwitch label="Auto-accept Orders" description="Automatically accept incoming orders without manual confirmation" checked={settings.kds_auto_accept} onChange={(v) => updateSetting('kds_auto_accept', v)} />
              <ToggleSwitch label="Sound Alerts" description="Play audio when new orders arrive" checked={settings.kds_sound} onChange={(v) => updateSetting('kds_sound', v)} />
            </div>
            <Field label="Alert Threshold (minutes)">
              <input type="number" value={settings.kds_alert_threshold} onChange={(e) => updateSetting('kds_alert_threshold', e.target.value)} className="input" min="1" max="60" />
            </Field>
          </div>
        );
      case 'payment':
        return (
          <div className="space-y-5">
            <SectionTitle title="Payment Methods" subtitle="Enable payment modes accepted at your outlet" />
            <div className="space-y-1">
              <ToggleSwitch label="Cash" checked={settings.accept_cash} onChange={(v) => updateSetting('accept_cash', v)} />
              <ToggleSwitch label="Card / POS Machine" checked={settings.accept_card} onChange={(v) => updateSetting('accept_card', v)} />
              {isAU ? (
                <ToggleSwitch label="EFTPOS" checked={settings.accept_eftpos} onChange={(v) => updateSetting('accept_eftpos', v)} />
              ) : (
                <ToggleSwitch label="UPI" checked={settings.accept_upi} onChange={(v) => updateSetting('accept_upi', v)} />
              )}
            </div>
            {!isAU && settings.accept_upi && (
              <div className="space-y-4 pl-4 border-l-2" style={{ borderColor: 'var(--accent)' }}>
                <Field label="UPI VPA">
                  <input type="text" value={settings.upi_vpa} onChange={(e) => updateSetting('upi_vpa', e.target.value)} className="input" placeholder="yourstore@ybl" />
                </Field>
                <Field label="Merchant Display Name">
                  <input type="text" value={settings.merchant_name} onChange={(e) => updateSetting('merchant_name', e.target.value)} className="input" placeholder="My Restaurant" />
                </Field>
              </div>
            )}
            {!isAU && (
              <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Razorpay Gateway</p>
                <ToggleSwitch label="Enable Razorpay" description="Online payment collection via Razorpay" checked={settings.razorpay_enabled} onChange={(v) => updateSetting('razorpay_enabled', v)} />
                {settings.razorpay_enabled && (
                  <Field label="Razorpay Key ID">
                    <input type="password" value={settings.razorpay_key} onChange={(e) => updateSetting('razorpay_key', e.target.value)} className="input font-mono" placeholder="rzp_live_..." />
                  </Field>
                )}
              </div>
            )}
            {isAU && (
              <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Square Payments</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Configure Square payments via the <a href="#/au-integrations" style={{ color: 'var(--accent)' }}>Integrations</a> page.</p>
              </div>
            )}
          </div>
        );
      case 'notifications':
        return (
          <div className="space-y-5">
            <SectionTitle title="Notifications" subtitle="Choose how staff and customers receive alerts" />
            <div className="space-y-1">
              <ToggleSwitch label="SMS" description="Send order confirmations via SMS" checked={settings.sms_enabled} onChange={(v) => updateSetting('sms_enabled', v)} />
              <ToggleSwitch label="Email" description="Send receipts and updates by email" checked={settings.email_enabled} onChange={(v) => updateSetting('email_enabled', v)} />
              <ToggleSwitch label="WhatsApp" description="Send order updates on WhatsApp" checked={settings.whatsapp_enabled} onChange={(v) => updateSetting('whatsapp_enabled', v)} />
            </div>
            <div className="pt-4 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Operations</p>
              <ToggleSwitch label="Low Stock Alerts" description="Notify when inventory items fall below threshold" checked={settings.low_stock_alert} onChange={(v) => updateSetting('low_stock_alert', v)} />
            </div>
          </div>
        );
      case 'appearance':
        return (
          <div className="space-y-5">
            <SectionTitle title="Appearance" subtitle="Customize the look and feel of the interface" />

            {user?.role === 'owner' && (
              <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Brand identity</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Your colour and logo appear across the POS, receipts and QR menu.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Brand colour</label>
                    <div className="flex items-center gap-3 p-2.5 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                      <input type="color" value={HEX.test(brand.primary_color) ? brand.primary_color : '#4F46E5'}
                        onChange={(e) => { setBrand((b) => ({ ...b, primary_color: e.target.value })); applyAccentLive(e.target.value); }}
                        className="w-10 h-10 rounded-lg border cursor-pointer bg-transparent" style={{ borderColor: 'var(--border)' }} />
                      <input type="text" value={brand.primary_color}
                        onChange={(e) => { setBrand((b) => ({ ...b, primary_color: e.target.value })); applyAccentLive(e.target.value); }}
                        className="flex-1 min-w-0 font-mono text-sm px-2 py-1 rounded-lg outline-none border"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Logo</label>
                    <LogoUploader value={brand.logo_url} onUploaded={(url) => setBrand((b) => ({ ...b, logo_url: url }))} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (brand.primary_color && !HEX.test(brand.primary_color)) return toast.error('Enter a valid hex colour (e.g. #4F46E5)');
                      brandingMutation.mutate({ primary_color: brand.primary_color, logo_url: brand.logo_url || '' });
                    }}
                    disabled={brandingMutation.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: 'var(--accent)' }}>
                    <Save className="w-4 h-4" /> {brandingMutation.isPending ? 'Saving…' : 'Save branding'}
                  </button>
                </div>
              </div>
            )}

            <ThemeSelector />
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <ToggleSwitch label="Compact Layout" description="Reduce spacing to show more content on screen" checked={settings.compact_layout} onChange={(v) => updateSetting('compact_layout', v)} />
            </div>
          </div>
        );
      case 'hardware':
        return (
          <div className="space-y-5">
            <SectionTitle title="Hardware" subtitle="Connect peripherals and point-of-sale hardware" />
            <div className="space-y-1">
              <ToggleSwitch label="Cash Drawer" description="Automatically open drawer on payment" checked={settings.cash_drawer_enabled} onChange={(v) => updateSetting('cash_drawer_enabled', v)} />
            </div>
            {settings.cash_drawer_enabled && (
              <Field label="Cash Drawer Serial Port">
                <input value={settings.cash_drawer_port} onChange={(e) => updateSetting('cash_drawer_port', e.target.value)} className="input font-mono" placeholder="/dev/ttyUSB0" />
              </Field>
            )}
            <div className="pt-4 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
              <ToggleSwitch label="Barcode Scanner" description="Enable barcode scanning for quick item lookup" checked={settings.barcode_scanner_enabled} onChange={(v) => updateSetting('barcode_scanner_enabled', v)} />
              <ToggleSwitch label="Weighing Scale" description="Auto-read weight for sold-by-weight items" checked={settings.weighing_scale_enabled} onChange={(v) => updateSetting('weighing_scale_enabled', v)} />
              <ToggleSwitch label="Customer-Facing Display" description="Show order total on a second screen" checked={settings.customer_display_enabled} onChange={(v) => updateSetting('customer_display_enabled', v)} />
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-5">
            <SectionTitle title="Security" subtitle="Change the password you use to sign in" />
            <form onSubmit={submitPasswordChange} className="space-y-4 max-w-md">
              <Field label="Current Password">
                <input type="password" autoComplete="current-password" className="input"
                  value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  placeholder="Enter your current password" />
              </Field>
              <Field label="New Password">
                <input type="password" autoComplete="new-password" className="input"
                  value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  placeholder="At least 8 characters" />
              </Field>
              <Field label="Confirm New Password">
                <input type="password" autoComplete="new-password" className="input"
                  value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  placeholder="Re-enter the new password" />
              </Field>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Use 8–50 characters with upper &amp; lower case, a number and a special character.
              </p>
              <button type="submit"
                disabled={changePasswordMutation.isPending || !pw.current || !pw.next || !pw.confirm}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                <Lock className="w-4 h-4" />
                {changePasswordMutation.isPending ? 'Changing…' : 'Change Password'}
              </button>
            </form>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Configure your outlet preferences and integrations</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Sidebar nav */}
        <div className="md:w-52 shrink-0">
          <nav className="card p-2 space-y-0.5">
            {[...SECTIONS, ...(user?.role === 'owner' ? [{ id: 'security', label: 'Security', icon: <Lock className="w-5 h-5" /> }] : [])].map((s) => {
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
                  style={{
                    background: isActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className={isActive ? '' : 'opacity-70'}>{s.icon}</span>
                  {s.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content panel */}
        <div className="flex-1 min-w-0">
          <div className="card p-6">
            {renderSection()}
            <div className="flex justify-end gap-3 mt-8 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={resetSettings}
                className="btn-secondary flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   VOICE POS SECTION
   ============================================================ */
function VoicePOSSection() {
  const [v, setV] = useState(loadVoiceSettings());
  const [history, setHistory] = useState(loadVoiceHistory());
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const refresh = () => setHistory(loadVoiceHistory());
    window.addEventListener('voice-history-changed', refresh);
    return () => window.removeEventListener('voice-history-changed', refresh);
  }, []);

  const update = (key, value) => {
    const next = { ...v, [key]: value };
    setV(next);
    saveVoiceSettings({ [key]: value });
  };

  const resetDefaults = () => {
    saveVoiceSettings(DEFAULT_VOICE_SETTINGS);
    setV({ ...DEFAULT_VOICE_SETTINGS });
    toast.success('Voice settings reset to defaults');
  };

  const testMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      toast.success('Microphone access OK');
    } catch (e) {
      toast.error('Microphone blocked. Please allow mic access in browser settings.');
    }
  };

  const testTTS = () => {
    if (!window.speechSynthesis) {
      toast.error('Speech synthesis not supported in this browser');
      return;
    }
    const utter = new SpeechSynthesisUtterance(
      v.language?.startsWith('hi') ? 'नमस्ते, यह आवाज़ का परीक्षण है।' :
      v.language?.startsWith('en-AU') ? "G'day! This is your voice POS speaking." :
      'Hello! This is your voice POS speaking.'
    );
    utter.lang = v.language || 'en-IN';
    utter.rate = Number(v.ttsRate) || 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 mb-2 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Mic className="w-4 h-4" /> Voice POS
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Configure how voice ordering listens, speaks, and remembers your conversations.
          </p>
        </div>
        <button onClick={resetDefaults} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
        </button>
      </div>

      {/* Language */}
      <div>
        <label className="label">Recognition & Speech Language</label>
        <select value={v.language} onChange={e => update('language', e.target.value)} className="input">
          {VOICE_LANGUAGES.map(l => (
            <option key={l.code} value={l.code}>{l.label} ({l.short})</option>
          ))}
        </select>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          Used for speech-to-text and the assistant's spoken reply. POS terminal language picker stays in sync.
        </p>
      </div>

      {/* Behaviour toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: 'var(--border)' }}>
        <div className="md:pr-6">
          <SettingRow
            label="Confirm Before Adding to Cart"
            description="After you finish speaking, show a review modal with every parsed item. Bump quantities, fix variants, remove anything the mic misheard, then tap Confirm. Strongly recommended for busy counters."
            checked={v.confirmBeforeAdding}
            onChange={x => update('confirmBeforeAdding', x)}
          />
          <SettingRow
            label="Continuous Multi-Item Mode"
            description="After each command, the mic re-arms automatically so you can keep adding items. Say 'done' or 'checkout' to stop."
            checked={v.continuousMode}
            onChange={x => update('continuousMode', x)}
          />
          <SettingRow
            label="Speak Responses Aloud"
            description="Use device speakers to read back the assistant's confirmation."
            checked={v.speakResponses}
            onChange={x => update('speakResponses', x)}
          />
          <SettingRow
            label="Show Toast Notifications"
            description="Pop-up the assistant's reply on screen too (helpful in noisy kitchens)."
            checked={v.showToasts}
            onChange={x => update('showToasts', x)}
          />
        </div>
        <div className="md:pl-6">
          <SettingRow
            label="Save Conversation History"
            description="Keep the last 100 voice orders on this device for review and audit."
            checked={v.saveHistory}
            onChange={x => update('saveHistory', x)}
          />
          <SettingRow
            label="Wake On Open"
            description="Start listening automatically when you tap the Voice button (otherwise it waits for a second tap)."
            checked={v.wakeOnOpen}
            onChange={x => update('wakeOnOpen', x)}
          />
        </div>
      </div>

      {/* Numeric controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Silence Timeout</label>
          <div className="flex items-center gap-2">
            <input type="range" min="800" max="6000" step="200" value={v.silenceTimeoutMs}
              onChange={e => update('silenceTimeoutMs', Number(e.target.value))} className="flex-1" />
            <span className="text-xs font-mono w-14 text-right" style={{ color: 'var(--text-secondary)' }}>{(v.silenceTimeoutMs/1000).toFixed(1)}s</span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>How long the mic waits in silence before submitting what you said.</p>
        </div>
        <div>
          <label className="label">Max Session Length</label>
          <div className="flex items-center gap-2">
            <input type="range" min="15" max="180" step="15" value={v.maxSessionSec}
              onChange={e => update('maxSessionSec', Number(e.target.value))} className="flex-1" />
            <span className="text-xs font-mono w-14 text-right" style={{ color: 'var(--text-secondary)' }}>{v.maxSessionSec}s</span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>Hard cap on a single mic session; resets if you keep talking.</p>
        </div>
        <div>
          <label className="label">Speech Rate</label>
          <div className="flex items-center gap-2">
            <input type="range" min="0.6" max="1.6" step="0.05" value={v.ttsRate}
              onChange={e => update('ttsRate', Number(e.target.value))} className="flex-1" />
            <span className="text-xs font-mono w-14 text-right" style={{ color: 'var(--text-secondary)' }}>{Number(v.ttsRate).toFixed(2)}×</span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>Speed at which the assistant speaks back.</p>
        </div>
      </div>

      {/* Diagnostics */}
      <div className="flex flex-wrap gap-2">
        <button onClick={testMic} className="btn-surface btn-sm">Test Microphone</button>
        <button onClick={testTTS} className="btn-surface btn-sm">Test Speech Output</button>
        <button onClick={() => setShowHistory(s => !s)} className="btn-surface btn-sm flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          {showHistory ? 'Hide' : 'Show'} History ({history.length})
        </button>
        {history.length > 0 && (
          <button onClick={() => { clearVoiceHistory(); toast.success('History cleared'); }}
            className="btn-surface btn-sm flex items-center gap-1.5 text-red-400">
            <Trash2 className="w-3.5 h-3.5" /> Clear History
          </button>
        )}
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <h4 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Recent Voice Orders</h4>
          {history.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No voice conversations yet. Try the Voice button on the POS Terminal.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {history.map((h, i) => (
                <div key={i} className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="text-[10px] uppercase tracking-wider opacity-60" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(h.ts).toLocaleString()} · {h.lang}{h.action ? ` · ${h.action}` : ''}
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-semibold" style={{ color: 'var(--accent)' }}>You:</span> <span style={{ color: 'var(--text-primary)' }}>{h.user}</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold" style={{ color: 'var(--success)' }}>Assistant:</span> <span style={{ color: 'var(--text-primary)' }}>{h.assistant}</span>
                  </div>
                  {Array.isArray(h.cart_after) && h.cart_after.length > 0 && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Cart after: {h.cart_after.map(c => `${c.name}×${c.quantity}`).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
        style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
