import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { toast } from 'react-hot-toast';
import { 
  Rocket, Palette, ShieldCheck, CheckCircle2, 
  ArrowRight, ArrowLeft, Upload, Scissors
} from 'lucide-react';

export default function OwnerWizard({ headOffice }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    logo_url: headOffice?.logo_url || '',
    primary_color: headOffice?.primary_color || '#4F46E5',
    gstin: headOffice?.gstin || '',
    legal_name: headOffice?.legal_name || headOffice?.name,
  });

  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: (data) => api.patch('/ho/setup-complete', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['auth-user']);
      toast.success('Your Petpooja ERP is ready! Go Live!');
      window.location.reload(); // Refresh to clear wizard overlay
    }
  });

  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => s - 1);

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/20">
        
        {/* Progress Header */}
        <div className="bg-slate-50 p-8 border-b flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
               <Rocket size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Welcome to Petpooja!</h1>
              <p className="text-sm text-slate-500 font-medium">Let's set up your {headOffice.name} workspace</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className={`w-10 h-1.5 rounded-full transition-all duration-500 ${step >= i ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>

        <div className="p-10">
          {step === 1 && (
            <div className="space-y-6 animate-slide-in">
              <div className="flex items-center gap-3 text-indigo-600 mb-2">
                 <Palette size={20} /> <span className="font-bold uppercase tracking-wider text-sm">Visual Identity</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900">Brand Your POS</h2>
              <p className="text-slate-500">How do you want your storefront and reports to look?</p>
              
              <div className="grid grid-cols-2 gap-8 mt-4">
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase">Primary Brand Color</label>
                  <div className="flex items-center gap-4 p-4 border rounded-2xl bg-slate-50">
                    <input 
                      type="color" 
                      value={formData.primary_color} 
                      onChange={(e) => setFormData({...formData, primary_color: e.target.value})}
                      className="w-12 h-12 rounded-xl border-2 border-white shadow-sm cursor-pointer"
                    />
                    <span className="font-mono text-sm font-bold text-slate-600">{formData.primary_color}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase">Brand Logo</label>
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-slate-400 gap-2 hover:border-indigo-300 hover:text-indigo-400 transition cursor-pointer">
                    <Upload size={24} />
                    <span className="text-[10px] font-bold">1:1 Square Recommended</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-slide-in">
              <div className="flex items-center gap-3 text-emerald-600 mb-2">
                 <ShieldCheck size={20} /> <span className="font-bold uppercase tracking-wider text-sm">Compliance & Tax</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900">Legal Details</h2>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">Registered Company Name</label>
                  <input 
                    type="text" 
                    className="w-full px-5 py-4 bg-slate-50 border rounded-2xl text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition"
                    value={formData.legal_name}
                    onChange={(e) => setFormData({...formData, legal_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">GSTIN Number (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="27AAAAAAAAAAAAA"
                    className="w-full px-5 py-4 bg-slate-50 border rounded-2xl text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition"
                    value={formData.gstin}
                    onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 text-center animate-slide-in">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                 <CheckCircle2 size={48} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-3">Almost There!</h2>
                <p className="text-slate-500 mx-auto max-w-sm">We've applied your settings. Your first outlet (Flagship) is ready for sales.</p>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl text-left flex gap-4">
                 <div className="text-indigo-600"><Rocket size={24} /></div>
                 <div>
                   <h4 className="font-bold text-indigo-900">Launch Tip:</h4>
                   <p className="text-sm text-indigo-700">Open the POS on your tablet or mobile and use code "CASH" to try a dummy sale.</p>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="p-8 bg-slate-50 border-t flex justify-between">
          <button 
            onClick={prev}
            disabled={step === 1}
            className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition ${step === 1 ? 'opacity-0' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <ArrowLeft size={18} /> Previous
          </button>
          
          {step < 3 ? (
            <button 
              onClick={next}
              className="bg-indigo-600 text-white px-10 py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2 transition active:scale-95"
            >
              Continue <ArrowRight size={18} />
            </button>
          ) : (
            <button 
              onClick={() => completeMutation.mutate(formData)}
              disabled={completeMutation.isPending}
              className="bg-emerald-600 text-white px-12 py-3 rounded-xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
            >
              {completeMutation.isPending ? 'Launching...' : 'Finish Setup'} <Rocket size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
