import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { 
  Globe, CreditCard, Save, RefreshCw, CheckCircle2, AlertCircle
} from 'lucide-react';

const fetchConfig = async () => {
    return await api.get('/config');
};

const updateConfig = async (settings) => {
    return await api.put('/config', settings);
};

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
        if (response?.data) setLocalSettings(response.data);
    }, [response]);

    const handleSave = () => {
        mutation.mutate(localSettings);
    };

    if (isLoading) return <div className="p-8 text-slate-500 font-black animate-pulse">LOADING CORE CONFIG...</div>;

    const sections = [
        { 
            id: 'branding', 
            title: 'Platform Branding', 
            icon: Globe,
            fields: [
                { key: 'platform_name', label: 'Platform Name', type: 'text', placeholder: 'Petpooja ERP' },
                { key: 'support_whatsapp', label: 'Support WhatsApp', type: 'text', placeholder: '+91 9999999999' },
                { key: 'support_email', label: 'Support Email', type: 'email', placeholder: 'support@petpooja.com' },
                { key: 'restaurant_app_url', label: 'Restaurant App URL', type: 'text', placeholder: 'petpooja-saas.vercel.app' }
            ]
        },
        { 
            id: 'plans', 
            title: 'Subscription Plans', 
            icon: CreditCard,
            isSpecial: true,
            render: () => {
                const plans = localSettings.plan_settings ? JSON.parse(localSettings.plan_settings) : [
                    { plan: 'trial', name: 'Free Trial', price: 0, duration_days: 14 },
                    { plan: 'monthly', name: 'Monthly', price: 999, duration_days: 30 },
                    { plan: 'annual', name: 'Annual', price: 9999, duration_days: 365 },
                    { plan: '2year', name: '2 Year', price: 17999, duration_days: 730 }
                ];
                return (
                    <div className="space-y-4">
                        {plans.map((plan, idx) => (
                            <div key={plan.plan} className="grid grid-cols-2 gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                <div className="col-span-2 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">{plan.name}</div>
                                <div>
                                    <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Price (₹)</label>
                                    <input 
                                        type="number"
                                        value={plan.price}
                                        onChange={(e) => {
                                            const newPlans = [...plans];
                                            newPlans[idx].price = Number(e.target.value);
                                            setLocalSettings({...localSettings, plan_settings: JSON.stringify(newPlans)});
                                        }}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-bold text-white focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Days</label>
                                    <input 
                                        type="number"
                                        value={plan.duration_days}
                                        onChange={(e) => {
                                            const newPlans = [...plans];
                                            newPlans[idx].duration_days = Number(e.target.value);
                                            setLocalSettings({...localSettings, plan_settings: JSON.stringify(newPlans)});
                                        }}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-bold text-white focus:outline-none"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                );
            }
        },
        { 
            id: 'payment', 
            title: 'Payment Gateway', 
            icon: CreditCard,
            fields: [
                { key: 'razorpay_key_id', label: 'Razorpay Key ID', type: 'text', placeholder: 'rzp_live_...' },
                { key: 'razorpay_active', label: 'Razorpay Active', type: 'toggle' }
            ]
        },
        { 
            id: 'notifications', 
            title: 'Notifications', 
            icon: AlertCircle,
            fields: [
                { key: 'expiry_alert_days', label: 'Expiry Alert Days', type: 'number', placeholder: '30' },
                { key: 'whatsapp_alerts', label: 'WhatsApp Alerts', type: 'toggle' }
            ]
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
                                                    onClick={() => setLocalSettings({...localSettings, [field.key]: localSettings[field.key] === 'true' ? 'false' : 'true'})}
                                                    className={`w-14 h-7 rounded-full p-1 transition-all ${localSettings[field.key] === 'true' ? 'bg-indigo-600' : 'bg-slate-800'}`}
                                                >
                                                    <div className={`w-5 h-5 bg-white rounded-full transition-all ${localSettings[field.key] === 'true' ? 'translate-x-7' : 'translate-x-0'}`} />
                                                </button>
                                            ) : (
                                                <input 
                                                    type={field.type}
                                                    value={localSettings[field.key] || ''}
                                                    onChange={(e) => setLocalSettings({...localSettings, [field.key]: e.target.value})}
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
