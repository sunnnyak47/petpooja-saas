import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Settings, Printer, Monitor, CreditCard, Palette, Bell,
  Save, RotateCcw, ChevronRight, CheckCircle2,
  Store, Barcode, DollarSign
} from 'lucide-react';
import ThemeSelector from '../themes/ThemeSelector';

const SECTIONS = [
  { id: 'general', label: 'General', icon: <Store className="w-5 h-5" /> },
  { id: 'tax', label: 'Tax & GST', icon: <DollarSign className="w-5 h-5" /> },
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
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('general');
  // ThemeSelector component handles theme switching via its own useTheme hook.
  // No theme state needed directly in this page.


  const [settings, setSettings] = useState({
    // General
    outlet_name: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    language: 'en',
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
    accept_upi: true,
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

  // Merge saved settings into local state once they load
  useEffect(() => {
    if (savedSettings) {
      setSettings(prev => ({ ...prev, ...savedSettings }));
    }
  }, [savedSettings]);

  // Theme preference is saved locally (localStorage) by ThemeContext.
  // All other settings are persisted via the API.
  const saveMutation = useMutation({
    mutationFn: () => {
      const { primary_color, dark_mode, ...apiSettings } = settings;
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
          </div>
        );
      case 'tax': {
        const isAUSett = settings.currency === 'AUD';
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
                  <option value="0">0% — Exempt</option>
                  <option value="5">5% — Non-AC Restaurant</option>
                  <option value="12">12%</option>
                  <option value="18">18% — AC Restaurant</option>
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
              <ToggleSwitch label="UPI" checked={settings.accept_upi} onChange={(v) => updateSetting('accept_upi', v)} />
            </div>
            {settings.accept_upi && (
              <div className="space-y-4 pl-4 border-l-2" style={{ borderColor: 'var(--accent)' }}>
                <Field label="UPI VPA">
                  <input type="text" value={settings.upi_vpa} onChange={(e) => updateSetting('upi_vpa', e.target.value)} className="input" placeholder="yourstore@ybl" />
                </Field>
                <Field label="Merchant Display Name">
                  <input type="text" value={settings.merchant_name} onChange={(e) => updateSetting('merchant_name', e.target.value)} className="input" placeholder="My Restaurant" />
                </Field>
              </div>
            )}
            <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Razorpay Gateway</p>
              <ToggleSwitch label="Enable Razorpay" description="Online payment collection via Razorpay" checked={settings.razorpay_enabled} onChange={(v) => updateSetting('razorpay_enabled', v)} />
              {settings.razorpay_enabled && (
                <Field label="Razorpay Key ID">
                  <input type="password" value={settings.razorpay_key} onChange={(e) => updateSetting('razorpay_key', e.target.value)} className="input font-mono" placeholder="rzp_live_..." />
                </Field>
              )}
            </div>
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
            {SECTIONS.map((s) => {
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
                onClick={() => toast('Reset not yet implemented')}
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
