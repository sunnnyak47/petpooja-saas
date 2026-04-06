import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import { 
  Camera, Upload, Sparkles, Loader2, CheckCircle2, 
  Trash2, Edit3, ChevronRight, ChevronDown, Package,
  AlertCircle, X
} from 'lucide-react';

/**
 * AIMenuSyncModal - AI-powered menu extraction from photos.
 */
export default function AIMenuSyncModal({ isOpen, onClose, outletId }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState('upload'); // upload, scanning, review
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [expandedCats, setExpandedCats] = useState(new Set());

  // 1. Scan Mutation
  const scanMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post('/menu/ai/scan-menu', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    },
    onSuccess: (data) => {
      setExtractedData(data);
      setStep('review');
      // Expand all by default
      setExpandedCats(new Set(data.categories.map((_, i) => i)));
    },
    onError: (err) => {
      toast.error('AI Scan failed: ' + (err.response?.data?.message || err.message));
      setStep('upload');
    }
  });

  // 2. Sync Mutation
  const syncMutation = useMutation({
    mutationFn: (data) => api.post('/menu/ai/confirm-sync', { outlet_id: outletId, menu_data: data }),
    onSuccess: () => {
      toast.success('Menu synced successfully!');
      queryClient.invalidateQueries({ queryKey: ['menuItemsAll'] });
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      resetAndClose();
    },
    onError: (err) => toast.error('Sync failed: ' + (err.response?.data?.message || err.message))
  });

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  };

  const startScan = () => {
    if (!file) return;
    setStep('scanning');
    scanMutation.mutate(file);
  };

  const resetAndClose = () => {
    setStep('upload');
    setFile(null);
    setPreviewUrl(null);
    setExtractedData(null);
    onClose();
  };

  const toggleCat = (idx) => {
    const next = new Set(expandedCats);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setExpandedCats(next);
  };

  const removeCategory = (catIdx) => {
    const next = { ...extractedData };
    next.categories = next.categories.filter((_, i) => i !== catIdx);
    setExtractedData(next);
  };

  const removeItem = (catIdx, itemIdx) => {
    const next = { ...extractedData };
    next.categories[catIdx].items = next.categories[catIdx].items.filter((_, i) => i !== itemIdx);
    setExtractedData(next);
  };

  const updateItem = (catIdx, itemIdx, field, value) => {
    const next = { ...extractedData };
    next.categories[catIdx].items[itemIdx][field] = value;
    setExtractedData(next);
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="AI Menu Sync ✨" size={step === 'review' ? 'xl' : 'md'}>
      <div className="mt-4 min-h-[400px] flex flex-col">
        
        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
            <div className="w-20 h-20 bg-brand-500/10 rounded-3xl flex items-center justify-center text-brand-400">
              <Camera className="w-10 h-10" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white">Upload Menu Photo</h3>
              <p className="text-surface-400 text-sm mt-1 max-w-xs mx-auto">
                Snap a clear photo of your physical menu, and we'll digitize it instantly.
              </p>
            </div>

            <div className="w-full max-w-sm">
              {!file ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-surface-700 rounded-2xl p-10 hover:border-brand-500 hover:bg-surface-800/50 cursor-pointer transition-all group">
                  <Upload className="w-8 h-8 text-surface-500 group-hover:text-brand-400 mb-2" />
                  <span className="text-surface-400 font-bold text-sm">Click to choose image</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-surface-700 aspect-[4/3] bg-surface-900">
                  <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" />
                  <button onClick={() => setFile(null)} className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <button disabled={!file} onClick={startScan} className="btn-primary w-full max-w-sm py-4 text-base font-bold shadow-xl shadow-brand-500/20 disabled:opacity-50">
              <Sparkles className="w-5 h-5 mr-2" /> Start AI Scan
            </button>
          </div>
        )}

        {/* STEP 2: SCANNING */}
        {step === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-brand-500/20 border-t-brand-500 animate-spin" />
              <Sparkles className="w-10 h-10 text-brand-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black text-white animate-pulse">Digitizing Menu...</h3>
              <p className="text-surface-400 text-sm mt-2 max-w-sm mx-auto">
                Our AI is extracting categories, items, and pricing. This usually takes 10-15 seconds depending on menu size.
              </p>
            </div>
            <div className="w-full max-w-xs space-y-2 mt-4">
               <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-brand-400">
                  <span>Extracting Metadata</span>
                  <span>75%</span>
               </div>
               <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 w-3/4 animate-progress" />
               </div>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW */}
        {step === 'review' && extractedData && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 p-4 bg-brand-500/5 border-b border-brand-500/10 mb-4 rounded-xl">
               <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400"><CheckCircle2 className="w-5 h-5" /></div>
               <div>
                  <h4 className="text-white font-bold">Extraction Complete</h4>
                  <p className="text-surface-400 text-xs">Review the detected items below and edit if needed.</p>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {extractedData.categories.map((cat, cIdx) => (
                <div key={cIdx} className="bg-surface-800/40 border border-surface-700 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between p-3 bg-surface-800">
                    <button onClick={() => toggleCat(cIdx)} className="flex items-center gap-2 text-white font-black uppercase text-xs tracking-widest">
                      {expandedCats.has(cIdx) ? <ChevronDown className="w-4 h-4 text-brand-400" /> : <ChevronRight className="w-4 h-4 text-brand-400" />}
                      {cat.name}
                      <span className="ml-2 text-surface-500 normal-case font-medium">({cat.items.length} items)</span>
                    </button>
                    <button onClick={() => removeCategory(cIdx)} className="text-surface-500 hover:text-red-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  
                  {expandedCats.has(cIdx) && (
                    <div className="divide-y divide-surface-700/50">
                      {cat.items.map((item, iIdx) => (
                        <div key={iIdx} className="p-4 grid grid-cols-12 gap-4 items-center group hover:bg-surface-800/20 transition-colors">
                           <div className="col-span-1 flex items-center justify-center">
                              <div className={`w-3 h-3 border rounded-sm ${item.food_type === 'non_veg' ? 'border-red-500' : 'border-green-500'} flex items-center justify-center p-[2px]`}>
                                <div className={`w-full h-full rounded-full ${item.food_type === 'non_veg' ? 'bg-red-500' : 'bg-green-500'}`} />
                              </div>
                           </div>
                           <div className="col-span-5">
                              <input className="bg-transparent text-sm font-bold text-white w-full border-none outline-none focus:ring-0 p-0" 
                                value={item.name} onChange={(e) => updateItem(cIdx, iIdx, 'name', e.target.value)} />
                              <p className="text-[10px] text-surface-500 font-medium truncate">{item.description || 'No description'}</p>
                           </div>
                           <div className="col-span-4 flex items-center gap-2 px-3 py-1.5 bg-surface-900 rounded-xl border border-surface-700">
                              <span className="text-xs font-black text-brand-400 uppercase">₹</span>
                              <input type="number" className="bg-transparent border-none outline-none w-16 text-sm font-black text-white p-0" 
                                value={item.base_price} onChange={(e) => updateItem(cIdx, iIdx, 'base_price', e.target.value)} />
                                
                              {item.variants?.length > 0 && (
                                <span className="ml-auto text-[10px] font-black bg-brand-500/20 text-brand-400 px-2 py-0.5 rounded uppercase">+{item.variants.length} Variants</span>
                              )}
                           </div>
                           <div className="col-span-2 flex justify-end gap-2">
                              <button className="text-surface-600 hover:text-white p-1.5"><Edit3 className="w-4 h-4" /></button>
                              <button onClick={() => removeItem(cIdx, iIdx)} className="text-surface-600 hover:text-red-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 border-t border-surface-800 flex items-center justify-between">
               <div className="flex items-center gap-2 text-surface-500">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Prices include 5% Default GST</span>
               </div>
               <div className="flex gap-3">
                  <button onClick={() => setStep('upload')} className="btn-surface px-6 py-2.5 font-bold">Rescan</button>
                  <button onClick={() => syncMutation.mutate(extractedData)} disabled={syncMutation.isPending} className="btn-success px-8 py-2.5 font-black flex items-center gap-2 text-lg shadow-lg shadow-green-500/20">
                    {syncMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    {syncMutation.isPending ? 'Syncing...' : 'Sync to Production'}
                  </button>
               </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
