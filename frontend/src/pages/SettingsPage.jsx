import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Settings, Printer, Monitor, CreditCard, Palette, Bell,
  Save, RotateCcw, ChevronRight,
  Store, Barcode, DollarSign
} from 'lucide-react';

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

  const [settings, setSettings] = useState({
    // General
    outlet_name: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    language: 'en',
    // Tax
    default_gst_slab: '5',
    gst_inclusive: false,
    service_charge_pct: '0',
    gstin: '',
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

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/ho/settings`, { outlet_id: outletId, settings }),
    onSuccess: () => toast.success('Settings saved'),
    onError: (e) => toast.error(e.message),
  });

  const ToggleSwitch = ({ checked, onChange, label }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-surface-300">{label}</span>
      <button onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-surface-700'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''} shadow-sm`} />
      </button>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">General Settings</h3>
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Restaurant Name</label>
              <input value={settings.outlet_name} onChange={(e) => updateSetting('outlet_name', e.target.value)} className="input w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Currency</label>
                <select value={settings.currency} onChange={(e) => updateSetting('currency', e.target.value)} className="input w-full">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="AED">AED (د.إ)</option>
                  <option value="ZAR">ZAR (R)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Language</label>
                <select value={settings.language} onChange={(e) => updateSetting('language', e.target.value)} className="input w-full">
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="mr">Marathi</option>
                  <option value="ta">Tamil</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 'tax':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Tax & GST Configuration</h3>
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">GSTIN</label>
              <input value={settings.gstin} onChange={(e) => updateSetting('gstin', e.target.value)} className="input w-full font-mono" placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Default GST Slab</label>
                <select value={settings.default_gst_slab} onChange={(e) => updateSetting('default_gst_slab', e.target.value)} className="input w-full">
                  <option value="0">0% (Exempt)</option>
                  <option value="5">5% (Restaurant)</option>
                  <option value="12">12%</option>
                  <option value="18">18% (AC Restaurant)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Service Charge %</label>
                <input type="number" value={settings.service_charge_pct} onChange={(e) => updateSetting('service_charge_pct', e.target.value)} className="input w-full" step="0.5" />
              </div>
            </div>
            <ToggleSwitch label="GST Inclusive Pricing" checked={settings.gst_inclusive} onChange={(v) => updateSetting('gst_inclusive', v)} />
          </div>
        );
      case 'receipt':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Receipt Printer</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Printer Type</label>
                <select value={settings.printer_type} onChange={(e) => updateSetting('printer_type', e.target.value)} className="input w-full">
                  <option value="thermal">Thermal (ESC/POS)</option>
                  <option value="dot_matrix">Dot Matrix</option>
                  <option value="laser">Laser</option>
                  <option value="browser">Browser Print</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Paper Width</label>
                <select value={settings.paper_width} onChange={(e) => updateSetting('paper_width', e.target.value)} className="input w-full">
                  <option value="58">58mm</option>
                  <option value="80">80mm</option>
                  <option value="A4">A4</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Printer IP</label>
                <input value={settings.printer_ip} onChange={(e) => updateSetting('printer_ip', e.target.value)} className="input w-full font-mono" placeholder="192.168.1.100" />
              </div>
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Port</label>
                <input value={settings.printer_port} onChange={(e) => updateSetting('printer_port', e.target.value)} className="input w-full font-mono" placeholder="9100" />
              </div>
            </div>
            <ToggleSwitch label="Print Logo on Receipt" checked={settings.print_logo} onChange={(v) => updateSetting('print_logo', v)} />
            <ToggleSwitch label="Print Address" checked={settings.print_address} onChange={(v) => updateSetting('print_address', v)} />
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Footer Text</label>
              <input value={settings.footer_text} onChange={(e) => updateSetting('footer_text', e.target.value)} className="input w-full" />
            </div>
          </div>
        );
      case 'kds':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Kitchen Display Settings</h3>
            <ToggleSwitch label="Auto-accept new orders" checked={settings.kds_auto_accept} onChange={(v) => updateSetting('kds_auto_accept', v)} />
            <ToggleSwitch label="Sound alerts" checked={settings.kds_sound} onChange={(v) => updateSetting('kds_sound', v)} />
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Alert Threshold (minutes)</label>
              <input type="number" value={settings.kds_alert_threshold} onChange={(e) => updateSetting('kds_alert_threshold', e.target.value)} className="input w-full" />
            </div>
          </div>
        );
      case 'payment':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Payment Methods</h3>
            <ToggleSwitch label="Accept Cash" checked={settings.accept_cash} onChange={(v) => updateSetting('accept_cash', v)} />
            <ToggleSwitch label="Accept Card" checked={settings.accept_card} onChange={(v) => updateSetting('accept_card', v)} />
            <ToggleSwitch label="Accept UPI" checked={settings.accept_upi} onChange={(v) => updateSetting('accept_upi', v)} />
            <div className="border-t border-surface-800 pt-4 mt-4">
              <ToggleSwitch label="Razorpay Integration" checked={settings.razorpay_enabled} onChange={(v) => updateSetting('razorpay_enabled', v)} />
              {settings.razorpay_enabled && (
                <div className="mt-2">
                  <label className="text-xs text-surface-400 font-bold mb-1 block">Razorpay Key ID</label>
                  <input type="password" value={settings.razorpay_key} onChange={(e) => updateSetting('razorpay_key', e.target.value)} className="input w-full font-mono" placeholder="rzp_live_..." />
                </div>
              )}
            </div>
          </div>
        );
      case 'notifications':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Notification Preferences</h3>
            <ToggleSwitch label="SMS Notifications" checked={settings.sms_enabled} onChange={(v) => updateSetting('sms_enabled', v)} />
            <ToggleSwitch label="Email Notifications" checked={settings.email_enabled} onChange={(v) => updateSetting('email_enabled', v)} />
            <ToggleSwitch label="WhatsApp Notifications" checked={settings.whatsapp_enabled} onChange={(v) => updateSetting('whatsapp_enabled', v)} />
            <ToggleSwitch label="Low Stock Alerts" checked={settings.low_stock_alert} onChange={(v) => updateSetting('low_stock_alert', v)} />
          </div>
        );
      case 'appearance':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Appearance & Theme</h3>
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Brand Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={settings.primary_color} onChange={(e) => updateSetting('primary_color', e.target.value)} className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
                <span className="text-sm text-surface-300 font-mono">{settings.primary_color}</span>
              </div>
            </div>
            <ToggleSwitch label="Dark Mode" checked={settings.dark_mode} onChange={(v) => updateSetting('dark_mode', v)} />
            <ToggleSwitch label="Compact Layout" checked={settings.compact_layout} onChange={(v) => updateSetting('compact_layout', v)} />
          </div>
        );
      case 'hardware':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Hardware Configuration</h3>
            <ToggleSwitch label="Cash Drawer" checked={settings.cash_drawer_enabled} onChange={(v) => updateSetting('cash_drawer_enabled', v)} />
            {settings.cash_drawer_enabled && (
              <div>
                <label className="text-xs text-surface-400 font-bold mb-1 block">Cash Drawer Serial Port</label>
                <input value={settings.cash_drawer_port} onChange={(e) => updateSetting('cash_drawer_port', e.target.value)} className="input w-full font-mono" placeholder="/dev/ttyUSB0" />
              </div>
            )}
            <ToggleSwitch label="Barcode Scanner" checked={settings.barcode_scanner_enabled} onChange={(v) => updateSetting('barcode_scanner_enabled', v)} />
            <ToggleSwitch label="Weighing Scale" checked={settings.weighing_scale_enabled} onChange={(v) => updateSetting('weighing_scale_enabled', v)} />
            <ToggleSwitch label="Customer-Facing Display" checked={settings.customer_display_enabled} onChange={(v) => updateSetting('customer_display_enabled', v)} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex p-6 gap-6">
      {/* Sidebar */}
      <div className="w-64 shrink-0 bg-surface-900 rounded-2xl border border-surface-800 p-4">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-6 h-6 text-brand-400" />
          <h2 className="text-lg font-black text-white">Settings</h2>
        </div>
        <nav className="space-y-1">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeSection === s.id ? 'bg-brand-500/20 text-brand-400' : 'text-surface-400 hover:text-white hover:bg-surface-800'}`}>
              {s.icon}
              {s.label}
              <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${activeSection === s.id ? 'rotate-90' : ''}`} />
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 bg-surface-900 rounded-2xl border border-surface-800 p-6 overflow-y-auto">
        {renderSection()}
        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-surface-800">
          <button className="px-6 py-2.5 rounded-xl bg-surface-800 text-surface-300 font-bold text-sm hover:bg-surface-700 transition-all flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button onClick={() => saveMutation.mutate()} className="btn-primary px-8 py-2.5 flex items-center gap-2">
            <Save className="w-4 h-4" /> Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
