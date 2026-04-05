import { useState } from 'react';
import { X, Building2, User, Mail, Phone, Lock, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OnboardModal({ isOpen, onClose, onOnboard }) {
  const [formData, setFormData] = useState({
    name: '',
    legal_name: '',
    contact_email: '',
    contact_phone: '',
    owner_name: '',
    password: '',
    city: '',
    address: '',
    plan: 'TRIAL'
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.contact_email || !formData.owner_name || !formData.password) {
      return toast.error('Please fill required fields');
    }

    setLoading(true);
    try {
      await onOnboard(formData);
      onClose();
      setFormData({
        name: '',
        legal_name: '',
        contact_email: '',
        contact_phone: '',
        owner_name: '',
        password: '',
        city: '',
        address: '',
        plan: 'TRIAL'
      });
    } catch (error) {
      // Error handled by parent or mutation
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
        
        {/* Header */}
        <div className="relative px-8 py-6 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Building2 className="text-indigo-500" size={24} />
              Onboard New Restaurant
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Setup Head Office & Owner Account</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          <div className="grid grid-cols-2 gap-6">
            
            {/* Section 1: Business Details */}
            <div className="col-span-2">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Business Information</h3>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400">Brand / Name *</label>
              <div className="relative">
                <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                <input 
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="e.g. Burger King"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400">City *</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                <input 
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="e.g. Mumbai"
                />
              </div>
            </div>

            {/* Section 2: Owner Details */}
            <div className="col-span-2 pt-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Owner Account setup</h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400">Founder Name *</label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                <input 
                  name="owner_name"
                  value={formData.owner_name}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="e.g. John Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400">Login Password *</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                <input 
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400">Work Email *</label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                <input 
                  name="contact_email"
                  type="email"
                  value={formData.contact_email}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="owner@brand.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400">Contact Number *</label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                <input 
                  name="contact_phone"
                  value={formData.contact_phone}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="9988XXXXXX"
                />
              </div>
            </div>

            <div className="col-span-2 pt-6">
               <button 
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] flex items-center justify-center gap-3"
               >
                 {loading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                 Complete Onboarding
               </button>
            </div>

          </div>
        </form>

      </div>
    </div>
  );
}
