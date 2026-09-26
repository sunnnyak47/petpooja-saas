import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Globe, CreditCard, Save, RefreshCw, CheckCircle2, AlertCircle, Palette, ShieldCheck
} from 'lucide-react';
import ThemeSelector from '../themes/ThemeSelector';

// Backend endpoints (superadmin.routes.js):
//   GET /api/superadmin/platform-settings  → { success, data: settings }
//   PUT /api/superadmin/platform-settings  ← settings object (Joi: savePlatformSettingsSchema)
// Settings shape: maintenance_mode, registration_open (bool); platform_name,
// support_email (string); default_trial_days, min_password_length,
// session_timeout_hours (int); plan_pricing, max_outlets_per_plan (objects
// keyed by plan code → number).
const fetchConfig = async () => {
    return await api.get('/platform-settings');
};

const updateConfig = async (settings) => {
    // updated_at is server-managed; everything else round-trips as-is.
    const { updated_at, ...payload } = settings;
    return await api.put('/platform-settings', payload);
};

const PLAN_ORDER = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];

export default function SystemConfig() {
    const queryClient = useQueryClient();
    const { data: response, isLoading } = useQuery({
        queryKey: ['system-config'],
        queryFn: fetchConfig
    });

    const mutation = useMutation({
        mutationFn: updateConfig,
        onSuccess: () => {
            queryClient.invalidateQueries(['system-config']);
        }
    });

    const [localSettings, setLocalSettings] = useState({});

    useEffect(() => {
        // api interceptor unwraps axios → envelope; envelope.data is the settings object.
        if (response?.data) setLocalSettings(response.data);
    }, [response]);

    const handleSave = () => {
        mutation.mutate(localSettings);
    };

    const setField = (key, value) => setLocalSettings(prev => ({ ...prev, [key]: value }));
    const setPlanField = (mapKey, plan, value) => setLocalSettings(prev => ({
        ...prev,
        [mapKey]: { ...(prev[mapKey] || {}), [plan]: value },
    }));

    if (isLoading) return <div className="p-8 text-slate-500 font-black animate-pulse">LOADING CORE CONFIG...</div>;

    const numberInputCls = "w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-bold text-white focus:outline-none";

    const sections = [
        {
            id: 'branding',
            title: 'Platform Branding',
            icon: Globe,
            fields: [
                { key: 'platform_name', label: 'Platform Name', type: 'text', placeholder: 'MS-RM System' },
                { key: 'support_email', label: 'Support Email', type: 'email', placeholder: 'support@madsundigital.com' }
            ]
        },
        {
            id: 'access',
            title: 'Access Controls',
            icon: AlertCircle,
            fields: [
                { key: 'registration_open', label: 'Registration Open', type: 'toggle' },
                { key: 'maintenance_mode', label: 'Maintenance Mode', type: 'toggle' },
                { key: 'allow_impersonation', label: 'Allow Impersonation', type: 'toggle' },
                { key: 'onboarding_required', label: 'Onboarding Required', type: 'toggle' }
            ]
        },
        {
            id: 'plans',
            title: 'Subscription Plans',
            icon: CreditCard,
            isSpecial: true,
            render: () => {
                const pricing = localSettings.plan_pricing || {};
                const maxOutlets = localSettings.max_outlets_per_plan || {};
                const plans = PLAN_ORDER.filter(p => p in pricing || p in maxOutlets);
                const planList = plans.length ? plans : PLAN_ORDER;
                return (
                    <div className="space-y-4">
                        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                            <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Default Trial Days</label>
                            <input
                                type="number"
                                min="0"
                                value={localSettings.default_trial_days ?? ''}
                                onChange={(e) => setField('default_trial_days', Number(e.target.value))}
                                className={numberInputCls}
                            />
                        </div>
                        {planList.map((plan) => (
                            <div key={plan} className="grid grid-cols-2 gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                <div className="col-span-2 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">{plan}</div>
                                <div>
                                    <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Price (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={pricing[plan] ?? 0}
                                        onChange={(e) => setPlanField('plan_pricing', plan, Number(e.target.value))}
                                        className={numberInputCls}
                                    />
                                </div>
                                <div>
                                    <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Max Outlets</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={maxOutlets[plan] ?? 0}
                                        onChange={(e) => setPlanField('max_outlets_per_plan', plan, Number(e.target.value))}
                                        className={numberInputCls}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                );
            }
        },
        {
            id: 'security',
            title: 'Security & Sessions',
            icon: ShieldCheck,
            fields: [
                { key: 'min_password_length', label: 'Min Password Length', type: 'number', placeholder: '8' },
                { key: 'session_timeout_hours', label: 'Session Timeout (Hours)', type: 'number', placeholder: '24' }
            ]
        },
        {
            id: 'appearance',
            title: 'Platform Theme',
            icon: Palette,
            isSpecial: true,
            render: () => (
                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                    <ThemeSelector />
                </div>
            )
        }
    ];

    return (
        <div className="max-w-6xl space-y-8 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase italic">System Config</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Platform Governance • Essential Settings Only</p>
                </div>
            </div>

            {mutation.isSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-emerald-400 max-w-md">
                    <CheckCircle2 size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Settings saved ✅</span>
                </div>
            )}

            <div className="grid grid-cols-2 gap-8">
                {sections.map((section) => (
                    <div key={section.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 flex flex-col h-full hover:border-indigo-500/30 transition-colors">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-indigo-400 group">
                                    <section.icon size={24} className="group-hover:rotate-12 transition-transform" />
                                </div>
                                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] italic">{section.title}</h3>
                            </div>
                        </div>

                        <div className="flex-grow">
                            {section.isSpecial ? section.render() : (
                                <div className="space-y-6">
                                    {section.fields.map((field) => (
                                        <div key={field.key}>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">{field.label}</label>
                                            {field.type === 'toggle' ? (
                                                <button
                                                    onClick={() => setField(field.key, !localSettings[field.key])}
                                                    className={`w-14 h-7 rounded-full p-1 transition-all ${localSettings[field.key] ? 'bg-indigo-600' : 'bg-slate-800'}`}
                                                >
                                                    <div className={`w-5 h-5 bg-white rounded-full transition-all ${localSettings[field.key] ? 'translate-x-7' : 'translate-x-0'}`} />
                                                </button>
                                            ) : (
                                                <input
                                                    type={field.type}
                                                    value={localSettings[field.key] ?? ''}
                                                    onChange={(e) => setField(
                                                        field.key,
                                                        field.type === 'number' ? Number(e.target.value) : e.target.value
                                                    )}
                                                    placeholder={field.placeholder}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-800"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={mutation.isPending}
                            className="mt-8 flex items-center justify-center gap-3 w-full py-4 bg-slate-800 hover:bg-indigo-600 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest transition-all disabled:opacity-50"
                        >
                            {mutation.isPending ? <RefreshCw className="animate-spin text-white" size={16} /> : <Save size={16} />}
                            {mutation.isPending ? 'Saving...' : 'Update Section'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
