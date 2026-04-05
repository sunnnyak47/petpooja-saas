import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Settings, Globe, Shield, CreditCard, 
  Save, RefreshCw, CheckCircle2, AlertCircle,
  Palette, Smartphone, Database, Server
} from 'lucide-react';

const fetchConfig = async () => {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/superadmin/config`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    return data.data;
};

const updateConfig = async (settings) => {
    const { data } = await axios.put(`${import.meta.env.VITE_API_URL}/superadmin/config`, settings, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    return data.data;
};

export default function SystemConfig() {
    const queryClient = useQueryClient();
    const { data: config, isLoading } = useQuery({
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
        if (config) setLocalSettings(config);
    }, [config]);

    const handleSave = () => {
        mutation.mutate(localSettings);
    };

    if (isLoading) return <div className="p-8 text-slate-500 font-black animate-pulse">LOADING CORE CONFIG...</div>;

    const sections = [
        { 
            id: 'general', 
            title: 'Branding & Identity', 
            icon: Globe,
            fields: [
                { key: 'platform_name', label: 'Platform Name', type: 'text', placeholder: 'Petpooja SaaS' },
                { key: 'platform_url', label: 'Primary URL', type: 'text', placeholder: 'https://petpooja-saas.vercel.app' },
                { key: 'support_email', label: 'Support Email', type: 'email', placeholder: 'support@petpooja.com' }
            ]
        },
        { 
            id: 'plans', 
            title: 'SaaS Plans (Monthly)', 
            icon: CreditCard,
            fields: [
                { key: 'plan_trial_days', label: 'Trial Period (Days)', type: 'number', placeholder: '14' },
                { key: 'plan_standard_price', label: 'Standard Plan (₹)', type: 'number', placeholder: '999' },
                { key: 'plan_enterprise_price', label: 'Enterprise Plan (₹)', type: 'number', placeholder: '2499' }
            ]
        },
        { 
            id: 'security', 
            title: 'Security & Access', 
            icon: Shield,
            fields: [
                { key: 'session_timeout', label: 'Session Timeout (Mins)', type: 'number', placeholder: '60' },
                { key: 'max_login_attempts', label: 'Max Login Attempts', type: 'number', placeholder: '5' },
                { key: 'enforce_mfa', label: 'Enforce MFA (Admin)', type: 'toggle', placeholder: '' }
            ]
        },
        { 
            id: 'infra', 
            title: 'Cloud Infrastructure', 
            icon: Server,
            fields: [
                { key: 'redis_cache_ttl', label: 'Cache TTL (Secs)', type: 'number', placeholder: '3600' },
                { key: 'log_retention_days', label: 'Log Retention (Days)', type: 'number', placeholder: '90' }
            ]
        }
    ];

    return (
        <div className="max-w-5xl space-y-8 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase italic">System Config</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Platform Governance & Global Variables</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={mutation.isPending}
                    className="flex items-center gap-3 px-8 py-3 bg-indigo-600 rounded-2xl text-xs font-black text-white uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all disabled:opacity-50"
                >
                    {mutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                    {mutation.isPending ? 'Syncing...' : 'Save Configuration'}
                </button>
            </div>

            {mutation.isSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Platform state synchronized successfully</span>
                </div>
            )}

            <div className="grid grid-cols-2 gap-8">
                {sections.map((section) => (
                    <div key={section.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400">
                                <section.icon size={20} />
                            </div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">{section.title}</h3>
                        </div>
                        
                        <div className="space-y-4">
                            {section.fields.map((field) => (
                                <div key={field.key}>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{field.label}</label>
                                    <input 
                                        type={field.type === 'toggle' ? 'text' : field.type}
                                        value={localSettings[field.key] || ''}
                                        onChange={(e) => setLocalSettings({...localSettings, [field.key]: e.target.value})}
                                        placeholder={field.placeholder}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
