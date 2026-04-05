import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { 
  Building2, Plus, Users, Utensils, CreditCard, 
  Search, ExternalLink, ShieldCheck, AlertCircle 
} from 'lucide-react';

export default function SuperAdminPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', password: '', city: 'Mumbai'
  });

  const { data: chains, isLoading } = useQuery({
    queryKey: ['admin-chains'],
    queryFn: () => api.get('/ho/chains').then(res => res.data)
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/ho/dashboard').then(res => res.data)
  });

  const onboardingMutation = useMutation({
    mutationFn: (data) => api.post('/ho/register', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success('Restaurant Chain Onboarded Successfully!');
      setShowModal(false);
      setFormData({ name: '', email: '', phone: '', password: '', city: 'Mumbai' });
    },
    onError: (err) => {
      toast.error(err.message || 'Onboarding Failed');
    }
  });

  const syncMutation = useMutation({
    mutationFn: (chainId) => api.post('/ho/menu-sync', {
        source_outlet_id: '37bb34ff-bbc4-46a4-a32b-58d4b8f4d7a5',
        target_outlet_ids: chains.find(c => c.id === chainId).outlets.map(o => o.id),
        options: { categories: true, items: true, prices: true }
    }),
    onSuccess: (data) => toast.success(`Starter Menu Deployed! ${data.synced} items synced.`),
    onError: (err) => toast.error(err.message)
  });

  const updateBranding = useMutation({
    mutationFn: ({ headOfficeId, color }) => api.patch('/ho/branding', { head_office_id: headOfficeId, primary_color: color }),
    onSuccess: () => {
        queryClient.invalidateQueries(['admin-chains']);
        toast.success('Branding Updated!');
    },
    onError: (err) => toast.error(err.message)
  });

  if (isLoading) return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">Loading SaaS Infrastructure...</div>;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* SaaS Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <StatCard title="Total Clients" value={stats?.outlets?.total || 0} icon={<Building2 className="text-blue-500" />} />
        <StatCard title="Overall Revenue" value={`₹${(stats?.today?.revenue || 0).toLocaleString()}`} icon={<CreditCard className="text-amber-500" />} subtitle="Total across all outlets" />
        <StatCard title="Total Customers" value={stats?.total_customers || 0} icon={<Users className="text-indigo-500" />} />
        <StatCard title="System Wastage" value={`₹${(stats?.total_wastage || 0).toLocaleString()}`} icon={<AlertCircle className="text-red-500" />} subtitle="Loss across all clients" />
        <StatCard title="Star Outlet" value={stats?.top_outlet?.name || 'N/A'} icon={<ShieldCheck className="text-emerald-500" />} subtitle={stats?.top_outlet ? `₹${stats.top_outlet.revenue.toLocaleString()} today` : 'No sales yet'} />
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800">Restaurant Chains (Clients)</h2>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition"
        >
          <Plus size={18} /> Onboard New Restaurant
        </button>
      </div>

      {/* Grid of Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
        {chains?.map((chain) => (
          <div key={chain.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition group relative">
            <div className="p-5 flex gap-4">
              <div 
                className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-black text-2xl uppercase shadow-inner"
                style={{ backgroundColor: chain.primary_color || '#4F46E5' }}
              >
                {chain.name.substring(0, 1)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">{chain.name}</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{chain.id.substring(0, 8)}</p>
                  </div>
                  <span className={`h-fit px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    chain.subscriptions?.[0]?.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {chain.subscriptions?.[0]?.status || 'In-trial'}
                  </span>
                </div>
                
                <div className="flex gap-4 mt-4">
                  <div className="text-center">
                    <span className="block text-xl font-black text-slate-800">{chain._count.outlets}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Outlets</span>
                  </div>
                  <div className="text-center border-l pl-4">
                    <span className="block text-xl font-black text-slate-800">{chain._count.users}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Staff</span>
                  </div>
                  <div className="text-center border-l pl-4">
                    <span className="block text-xl font-black text-emerald-500">
                      {chain.subscriptions?.[0]?.plan_name || 'Free'}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Plan</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <button 
                  onClick={() => syncMutation.mutate(chain.id)}
                  disabled={syncMutation.isPending}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition flex items-center gap-2 disabled:opacity-50"
                 >
                   <Utensils size={14} /> {syncMutation.isPending ? 'Syncing...' : 'Deploy Starter Menu'}
                 </button>

                 <input 
                   type="color"
                   value={chain.primary_color || '#4F46E5'}
                   onChange={(e) => updateBranding.mutate({ headOfficeId: chain.id, color: e.target.value })}
                   className="w-8 h-8 rounded-lg cursor-pointer border-2 border-white shadow-sm"
                 />
              </div>
              
              <button className="text-indigo-600 font-bold text-xs hover:underline flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Manage Chain <ExternalLink size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Onboarding Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 bg-indigo-50">
              <h3 className="text-xl font-bold text-indigo-900">Sign Up New Restaurant</h3>
              <p className="text-sm text-indigo-600">Create a new chain and flagship outlet.</p>
            </div>
            <div className="p-6 space-y-4">
              <input 
                type="text" placeholder="Restaurant Chain Name" 
                className="w-full p-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
              />
              <input 
                type="email" placeholder="Owner Email (Login User)" 
                className="w-full p-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
              />
              <input 
                type="text" placeholder="Phone Number" 
                className="w-full p-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
              />
              <input 
                type="password" placeholder="Initial Password" 
                className="w-full p-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
              />
              <div className="grid grid-cols-2 gap-4">
                 <button 
                  onClick={() => setShowModal(false)}
                  className="p-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl"
                 >
                  Cancel
                 </button>
                 <button 
                  onClick={() => onboardingMutation.mutate(formData)}
                  disabled={onboardingMutation.isPending}
                  className="p-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition disabled:opacity-50"
                 >
                  {onboardingMutation.isPending ? 'Onboarding...' : 'Create Account'}
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, subtitle }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between hover:shadow-sm">
      <div className="flex justify-between items-start">
        <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-lg">{icon}</div>
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</p>
        <h4 className="text-3xl font-black text-slate-900 mt-1">{value}</h4>
        {subtitle && <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
