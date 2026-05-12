import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import Modal from '../Modal';
import {
  Camera, Upload, Sparkles, Loader2, CheckCircle2,
  Trash2, ChevronRight, ChevronDown,
  AlertCircle, X, RefreshCw, Zap,
} from 'lucide-react';

const SCAN_STEPS = [
  'Uploading image to Gemini Vision…',
  'Analysing menu layout…',
  'Reading categories…',
  'Extracting items & prices…',
  'Detecting variants (R/M/L)…',
  'Structuring menu data…',
];

export default function AIMenuSyncModal({ isOpen, onClose, outletId }) {
  const { symbol } = useCurrency();
  const queryClient = useQueryClient();
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [scanStep, setScanStep] = useState(0);

  const scanMutation = useMutation({
    mutationFn: async (imageFile) => {
      setScanStep(0);

      // Animate progress steps while Gemini processes
      let s = 0;
      const interval = setInterval(() => {
        s = Math.min(s + 1, SCAN_STEPS.length - 1);
        setScanStep(s);
      }, 2000);

      try {
        const formData = new FormData();
        formData.append('image', imageFile);
        const { data } = await api.post('/menu/ai/scan-menu', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return data;
      } finally {
        clearInterval(interval);
      }
    },
    onSuccess: (data) => {
      setExtractedData(data);
      setStep('review');
      setExpandedCats(new Set(data.categories.map((_, i) => i)));
    },
    onError: (err) => {
      toast.error('Scan failed: ' + (err.response?.data?.message || err.message));
      setStep('upload');
    },
  });

  const syncMutation = useMutation({
    mutationFn: (data) => api.post('/menu/ai/confirm-sync', { outlet_id: outletId, menu_data: data }),
    onSuccess: (res) => {
      const r = res.data?.data || res.data || {};
      toast.success(`Synced! ${r.categoriesCreated || 0} categories · ${r.itemsCreated || 0} items · ${r.variantsCreated || 0} variants`);
      queryClient.invalidateQueries({ queryKey: ['menuItemsAll'] });
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      resetAndClose();
    },
    onError: (err) => toast.error('Sync failed: ' + (err.response?.data?.message || err.message)),
  });

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) { setFile(selected); setPreviewUrl(URL.createObjectURL(selected)); }
  };

  const startScan = () => {
    if (!file) return;
    setScanStep(0);
    setStep('scanning');
    scanMutation.mutate(file);
  };

  const resetAndClose = () => {
    setStep('upload'); setFile(null); setPreviewUrl(null);
    setExtractedData(null); setScanStep(0); onClose();
  };

  const toggleCat = (idx) => {
    const next = new Set(expandedCats);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setExpandedCats(next);
  };

  const removeCategory = (catIdx) =>
    setExtractedData(d => ({ ...d, categories: d.categories.filter((_, i) => i !== catIdx) }));

  const removeItem = (catIdx, itemIdx) =>
    setExtractedData(d => {
      const cats = [...d.categories];
      cats[catIdx] = { ...cats[catIdx], items: cats[catIdx].items.filter((_, i) => i !== itemIdx) };
      return { ...d, categories: cats };
    });

  const updateItem = (catIdx, itemIdx, field, value) =>
    setExtractedData(d => {
      const cats = [...d.categories];
      const items = [...cats[catIdx].items];
      items[itemIdx] = { ...items[itemIdx], [field]: value };
      cats[catIdx] = { ...cats[catIdx], items };
      return { ...d, categories: cats };
    });

  const totalItems = extractedData?.categories?.reduce((s, c) => s + c.items.length, 0) || 0;
  const progress = Math.round(((scanStep + 1) / SCAN_STEPS.length) * 100);

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="AI Menu Sync ✨" size={step === 'review' ? 'xl' : 'md'}>
      <div className="mt-4 min-h-[400px] flex flex-col">

        {/* ── UPLOAD ── */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
              <Camera className="w-10 h-10" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Upload Menu Photo</h3>
              <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Snap a clear photo of your physical menu — categories, items, prices, variants all extracted automatically.
              </p>
            </div>

            <div className="w-full max-w-sm">
              {!file ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all group"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <Upload className="w-8 h-8 mb-2" style={{ color: 'var(--text-secondary)' }} />
                  <span className="font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>Click to choose image</span>
                  <span className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>JPG, PNG, WEBP up to 10MB</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border aspect-[4/3]"
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" />
                  <button onClick={() => { setFile(null); setPreviewUrl(null); }}
                    className="absolute top-2 right-2 p-1.5 rounded-full text-white"
                    style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="w-full max-w-sm grid grid-cols-3 gap-2 text-center">
              {[['Categories', '🗂️'], ['Items + Prices', symbol], ['Variants', '📐']].map(([label, icon]) => (
                <div key={label} className="px-3 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                  <div className="text-base mb-0.5">{icon}</div>{label}
                </div>
              ))}
            </div>

            <button disabled={!file} onClick={startScan}
              className="w-full max-w-sm py-4 rounded-xl text-base font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--accent)' }}>
              <Sparkles className="w-5 h-5" /> Start AI Scan
            </button>
          </div>
        )}

        {/* ── SCANNING ── */}
        {step === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full border-4 animate-spin"
                style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', borderTopColor: 'var(--accent)' }} />
              <Sparkles className="w-10 h-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ color: 'var(--accent)' }} />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black animate-pulse" style={{ color: 'var(--text-primary)' }}>
                Digitizing Menu…
              </h3>
              <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
                {SCAN_STEPS[scanStep]}
              </p>
            </div>
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--accent)' }}>
                <span>Processing</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progress}%`, background: 'var(--accent)' }} />
              </div>
              <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                Gemini Vision AI — understands any menu layout
              </p>
            </div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {step === 'review' && extractedData && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 p-4 rounded-xl mb-4"
              style={{ background: 'color-mix(in srgb, var(--success) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)' }}>
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
              <div className="flex-1">
                <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Extraction Complete — {extractedData.categories.length} categories · {totalItems} items found
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Edit names/prices below before syncing. Click the dot to toggle veg/non-veg. Remove anything wrong.
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {extractedData.categories.map((cat, cIdx) => (
                <div key={cIdx} className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => toggleCat(cIdx)}
                      className="flex items-center gap-2 font-black uppercase text-xs tracking-widest"
                      style={{ color: 'var(--accent)' }}>
                      {expandedCats.has(cIdx)
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                      {cat.name}
                      <span className="font-medium normal-case" style={{ color: 'var(--text-secondary)' }}>
                        ({cat.items.length} items)
                      </span>
                    </button>
                    <button onClick={() => removeCategory(cIdx)}
                      className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--danger)' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {expandedCats.has(cIdx) && (
                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {cat.items.map((item, iIdx) => (
                        <div key={iIdx} className="px-4 py-3 grid grid-cols-12 gap-3 items-center"
                          style={{ background: 'var(--bg-card)' }}>
                          <div className="col-span-1 flex justify-center">
                            <button onClick={() => updateItem(cIdx, iIdx, 'food_type', item.food_type === 'veg' ? 'non_veg' : 'veg')}
                              title="Toggle veg/non-veg"
                              className="w-4 h-4 border-2 rounded-sm flex items-center justify-center"
                              style={{ borderColor: item.food_type === 'non_veg' ? 'var(--danger)' : 'var(--success)' }}>
                              <div className="w-2 h-2 rounded-full"
                                style={{ background: item.food_type === 'non_veg' ? 'var(--danger)' : 'var(--success)' }} />
                            </button>
                          </div>

                          <div className="col-span-5">
                            <input
                              className="bg-transparent text-sm font-bold w-full border-none outline-none p-0"
                              style={{ color: 'var(--text-primary)' }}
                              value={item.name}
                              onChange={(e) => updateItem(cIdx, iIdx, 'name', e.target.value)} />
                            {item.description && (
                              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                {item.description}
                              </p>
                            )}
                          </div>

                          <div className="col-span-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <span className="text-xs font-black" style={{ color: 'var(--accent)' }}>{symbol}</span>
                            <input type="number"
                              className="bg-transparent border-none outline-none w-16 text-sm font-black p-0"
                              style={{ color: 'var(--text-primary)' }}
                              value={item.base_price}
                              onChange={(e) => updateItem(cIdx, iIdx, 'base_price', e.target.value)} />
                            {item.variants?.length > 0 && (
                              <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                                +{item.variants.length}V
                              </span>
                            )}
                          </div>

                          <div className="col-span-2 flex justify-end">
                            <button onClick={() => removeItem(cIdx, iIdx)}
                              className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                              style={{ color: 'var(--danger)' }}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 flex items-center justify-between"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <AlertCircle className="w-4 h-4" />
                <span>Default GST 5% will be applied</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('upload')}
                  className="btn-surface px-5 py-2.5 font-bold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Rescan
                </button>
                <button onClick={() => syncMutation.mutate(extractedData)}
                  disabled={syncMutation.isPending || !extractedData?.categories?.length}
                  className="px-8 py-2.5 rounded-xl font-black text-white flex items-center gap-2 disabled:opacity-50 transition-opacity"
                  style={{ background: 'var(--success)' }}>
                  {syncMutation.isPending
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Syncing…</>
                    : <><Zap className="w-5 h-5" /> Sync {totalItems} Items</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
