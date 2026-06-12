/**
 * OwnerWizard — first-login setup for a restaurant owner.
 * Shown once (until head_office.setup_completed). Themed with CSS variables,
 * skippable, and it applies branding to the live session on finish so the
 * accent colour + logo take effect without a reload.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../lib/api';
import { toast } from 'react-hot-toast';
import {
  Rocket, Palette, ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft, X,
} from 'lucide-react';
import { updateUser } from '../../store/slices/authSlice';
import useBranding from '../../hooks/useBranding';
import { useRegion } from '../../hooks/useRegion';
import LogoUploader from '../branding/LogoUploader';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export default function OwnerWizard({ headOffice }) {
  const { branding } = useBranding();
  const region = useRegion();
  const isAU = region === 'AU';
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    logo_url: headOffice?.logo_url || '',
    primary_color: headOffice?.primary_color || '#4F46E5',
    gstin: headOffice?.gstin || '',
    abn: headOffice?.abn || '',
    legal_name: headOffice?.legal_name || headOffice?.name || '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Live-preview the accent while they pick.
  const applyColorLive = (hex) => {
    set('primary_color', hex);
    if (HEX.test(hex)) {
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-hover', hex + 'dd');
    }
  };

  const finalize = (payload) => {
    // Reflect into the live session so the wizard closes and branding sticks.
    const ho = { ...(user?.head_office || {}), setup_completed: true };
    if (payload.primary_color) ho.primary_color = payload.primary_color;
    if (payload.logo_url !== undefined) ho.logo_url = payload.logo_url;
    dispatch(updateUser({
      head_office: ho,
      ...(payload.primary_color ? { primary_color: payload.primary_color } : {}),
      ...(payload.logo_url !== undefined ? { logo_url: payload.logo_url } : {}),
    }));
  };

  const completeMutation = useMutation({
    mutationFn: (data) => api.patch('/ho/setup-complete', data),
    onSuccess: (_res, data) => {
      finalize(data || {});
      toast.success('Your workspace is ready 🚀');
    },
    onError: (e) => toast.error(e.message || 'Could not save setup'),
  });

  const finish = () => {
    if (form.primary_color && !HEX.test(form.primary_color)) {
      return toast.error('Pick a valid colour (e.g. #4F46E5)');
    }
    completeMutation.mutate({
      primary_color: form.primary_color || undefined,
      logo_url: form.logo_url ?? '',
      legal_name: form.legal_name || undefined,
      ...(isAU ? { abn: form.abn || '' } : { gstin: form.gstin || '' }),
    });
  };

  // Skip = flip setup_completed with no data, so it never re-appears.
  const skip = () => completeMutation.mutate({});

  const STEPS = 3;
  const ACCENT = HEX.test(form.primary_color) ? form.primary_color : 'var(--accent)';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: 'rgba(2,6,23,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-3xl overflow-hidden border shadow-2xl"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>

        {/* Header */}
        <div className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: ACCENT }}>
              <Rocket size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                Welcome to {branding?.platform_name || 'MS-RM'}
              </h1>
              <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                Let’s set up {headOffice?.name || 'your restaurant'} — takes a minute
              </p>
            </div>
          </div>
          <button onClick={skip} title="Skip setup" disabled={completeMutation.isPending}
            className="p-2 rounded-lg hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Progress */}
        <div className="px-8 pt-5 flex gap-2">
          {Array.from({ length: STEPS }, (_, i) => i + 1).map((i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full transition-all"
              style={{ background: step >= i ? ACCENT : 'var(--border)' }} />
          ))}
        </div>

        {/* Body */}
        <div className="px-8 py-7 min-h-[300px]">
          {step === 1 && (
            <div className="space-y-5">
              <Label icon={<Palette size={16} />} accent={ACCENT}>Visual identity</Label>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Brand your workspace</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Your colour and logo appear across the POS, receipts and QR menu.</p>

              <div className="grid sm:grid-cols-2 gap-6 pt-2">
                <div className="space-y-2">
                  <FieldLabel>Brand colour</FieldLabel>
                  <div className="flex items-center gap-3 p-3 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                    <input type="color" value={HEX.test(form.primary_color) ? form.primary_color : '#4F46E5'}
                      onChange={(e) => applyColorLive(e.target.value)}
                      className="w-11 h-11 rounded-xl border cursor-pointer bg-transparent" style={{ borderColor: 'var(--border)' }} />
                    <input type="text" value={form.primary_color} onChange={(e) => applyColorLive(e.target.value)}
                      className="flex-1 min-w-0 font-mono text-sm px-2 py-1 rounded-lg outline-none border"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Logo</FieldLabel>
                  <LogoUploader value={form.logo_url} onUploaded={(url) => set('logo_url', url)} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Label icon={<ShieldCheck size={16} />} accent={ACCENT}>Compliance & tax</Label>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Legal details</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Used on tax invoices. You can change these later in Settings.</p>

              <div className="space-y-4 pt-2">
                <div>
                  <FieldLabel>Registered business name</FieldLabel>
                  <Input value={form.legal_name} onChange={(v) => set('legal_name', v)} placeholder="e.g. Garden State Eatery Pty Ltd" />
                </div>
                <div>
                  <FieldLabel>{isAU ? 'ABN (optional)' : 'GSTIN (optional)'}</FieldLabel>
                  <Input value={isAU ? form.abn : form.gstin}
                    onChange={(v) => set(isAU ? 'abn' : 'gstin', v)}
                    placeholder={isAU ? '51 824 753 556' : '27AAAAA0000A1Z5'} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center space-y-5 py-4">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'color-mix(in srgb, var(--success, #16a34a) 14%, transparent)', color: 'var(--success, #16a34a)' }}>
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>You’re ready to go live</h2>
              <p className="text-sm mx-auto max-w-md" style={{ color: 'var(--text-secondary)' }}>
                Your settings are saved and your first outlet is ready. Next: add a few menu items and ring up a test order — we’ll guide you with a checklist on your dashboard.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          {step > 1 ? (
            <button onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <button onClick={skip} disabled={completeMutation.isPending} className="text-sm font-medium disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>
              Skip for now
            </button>
          )}

          {step < STEPS ? (
            <button onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: ACCENT }}>
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={finish} disabled={completeMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: ACCENT }}>
              {completeMutation.isPending ? 'Finishing…' : 'Finish setup'} <Rocket size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ icon, accent, children }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
      {icon} {children}
    </div>
  );
}
function FieldLabel({ children }) {
  return <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-secondary)' }}>{children}</label>;
}
function Input({ value, onChange, placeholder }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl text-sm outline-none border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
  );
}
