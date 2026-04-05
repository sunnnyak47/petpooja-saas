import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { 
  Building2, Users, Search, 
  CheckCircle2, AlertCircle, Trash2, 
  ExternalLink, MapPin, MoreVertical,
  Filter, Plus, Calendar
} from 'lucide-react';

export default function ChainManagement() {
  const queryClient = useQueryClient();
  const { data: chains, isLoading, isError } = useQuery({
    queryKey: ['sa-chains'],
    queryFn: () => api.get('/chains'),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const impersonateMutation = useMutation({
    mutationFn: (id) => api.post('/impersonate', { head_office_id: id }),
    onSuccess: (res) => {
      const token = res?.data?.token;
      if (token) {
        localStorage.setItem('impersonation_token', token);
        toast.success('Impersonation token generated!');
      }
    }
  });

  if (isLoading) return <div className="h-[40vh] flex items-center justify-center font-black text-slate-500 text-lg tracking-widest uppercase">Fetching Clients...</div>;

  // Safely extract the chains array
  const chainList = chains?.data || chains || [];
  const hasChains = Array.isArray(chainList) && chainList.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Search & Actions Header */}
      <div className="flex items-center justify-between gap-6">
        <div className="relative flex-1 max-w-xl">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
           <input 
             type="text" 
             placeholder="Search by restaurant name, owner, or city..."
             className="w-full pl-12 pr-6 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-white font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition shadow-sm"
           />
        </div>
        <div className="flex items-center gap-4">
           <button className="flex items-center gap-2 px-6 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 font-bold hover:text-white transition">
              <Filter size={18} /> Filter Status
           </button>
           <button className="flex items-center gap-2 px-8 py-4 bg-indigo-600 rounded-2xl text-white font-black hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 active:scale-95">
              <Plus size={18} /> Onboard New Restaurant
           </button>
        </div>
      </div>

      {/* Main Merchants Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
         <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950/50">
               <tr>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Restaurant / Chain</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Founder & City</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Subscription</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Status</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-bold">
               {hasChains ? chainList.map((chain) => (
                 <tr key={chain.id} className="hover:bg-indigo-500/5 transition-colors group">
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                             {chain.logo_url ? <img src={chain.logo_url} className="w-full h-full object-cover rounded-xl" /> : <Building2 size={24} />}
                          </div>
                          <div>
                            <p className="text-white text-sm font-black">{chain.name}</p>
                            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">ID: {String(chain.id).slice(0, 8)} • {chain._count?.outlets || 0} Outlets</p>
                          </div>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div>
                         <p className="text-white text-sm">{chain.users?.[0]?.full_name || 'N/A'}</p>
                         <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1 uppercase tracking-widest mt-1">
                            <MapPin size={10} /> Delhi, IN
                         </p>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-3">
                          <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white">
                             {chain.plan || 'TRIAL'}
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 uppercase tracking-widest">
                             <Calendar size={10} /> Jan 2027
                          </span>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest 
                          ${chain.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {chain.is_active ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                          {chain.is_active ? 'Active' : 'Expired'}
                       </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => impersonateMutation.mutate(chain.id)}
                            disabled={impersonateMutation.isPending}
                            className="p-3 bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-all active:scale-95" title="Login as client"
                          >
                             <ExternalLink size={18} />
                          </button>
                          <button className="p-3 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white rounded-xl transition-all">
                             <MoreVertical size={18} />
                          </button>
                       </div>
                    </td>
                 </tr>
               )) : (
                 <tr>
                   <td colSpan={5} className="px-8 py-16 text-center">
                     <div className="space-y-4">
                       <Building2 className="mx-auto text-slate-600" size={48} />
                       <p className="text-lg font-black text-slate-400">No Restaurants Onboarded Yet</p>
                       <p className="text-xs text-slate-600 uppercase tracking-widest">Use the "Onboard New Restaurant" button above to add your first client.</p>
                     </div>
                   </td>
                 </tr>
               )}
            </tbody>
         </table>
      </div>
    </div>
  );
}
