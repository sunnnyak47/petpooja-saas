/**
 * AIMenuSyncModal — 5-way AI menu importer.
 *   📷 Image    photo of a paper menu (Gemini Vision)
 *   📄 PDF      multi-page PDF (Gemini multimodal)
 *   📝 Text     paste menu copied from email / Word / website
 *   🌐 URL      restaurant's existing public webpage
 *   📊 Spread.  CSV/TSV export from another POS
 *
 * Every mode lands on the same Review step where the owner edits
 * categories, items, prices, then taps Sync to commit to the cart.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import Modal from '../Modal';
import {
  Camera, Upload, FileText, Globe, FileSpreadsheet, Sparkles,
  Loader2, CheckCircle2, Trash2, ChevronRight, ChevronDown,
  AlertCircle, X, RefreshCw, Zap,
} from 'lucide-react';

const MODES = [
  { id: 'image', label: 'Image',  Icon: Camera,          hint: 'JPG, PNG, WEBP up to 10 MB' },
  { id: 'pdf',   label: 'PDF',    Icon: FileText,        hint: 'Multi-page PDFs work' },
  { id: 'text',  label: 'Paste',  Icon: Upload,          hint: 'Paste from email, Word, anywhere' },
  { id: 'url',   label: 'URL',    Icon: Globe,           hint: 'Restaurant website / online menu' },
  { id: 'csv',   label: 'Spreadsheet', Icon: FileSpreadsheet, hint: 'CSV, TSV or Excel export' },
];

const SCAN_STEPS = [
  'Sending to Gemini AI…',
  'Reading content…',
  'Detecting categories…',
  'Extracting items & prices…',
  'Detecting variants (R/M/L)…',
  'Structuring menu data…',
];

export default function AIMenuSyncModal({ isOpen, onClose, outletId }) {
  const { symbol } = useCurrency();
  const queryClient = useQueryClient();

  // Wizard step: 'upload' → 'scanning' → 'review'
  const [step, setStep] = useState('upload');
  const [mode, setMode] = useState('image');

  // Inputs (one per mode)
  const [file, setFile] = useState(null);              // image / pdf / csv
  const [previewUrl, setPreviewUrl] = useState(null);  // image preview only
  const [pasteText, setPasteText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  // URL crawler: when on, the backend also follows up to 10 menu-related
  // sub-pages on the same domain and merges them into one extraction.
  const [urlCrawl, setUrlCrawl] = useState(true);

  // Result
  const [extractedData, setExtractedData] = useState(null);
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [scanStep, setScanStep] = useState(0);

  /* ── Network: each mode has its own endpoint, same response shape ── */
  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanStep(0);
      // animate progress
      let s = 0;
      const interval = setInterval(() => {
        s = Math.min(s + 1, SCAN_STEPS.length - 1);
        setScanStep(s);
      }, 2000);
      try {
        // Multi-page crawl + Gemini parse can easily take 30–60s.
        // Override the default axios 20s timeout for every AI extraction call.
        const aiTimeout = { timeout: 300000 };
        let resp;
        if (mode === 'image') {
          if (!file) throw new Error('Please choose an image');
          const fd = new FormData();
          fd.append('image', file);
          resp = await api.post('/menu/ai/scan-menu', fd, { ...aiTimeout, headers: { 'Content-Type': 'multipart/form-data' } });
        } else if (mode === 'pdf') {
          if (!file) throw new Error('Please choose a PDF');
          const fd = new FormData();
          fd.append('pdf', file);
          resp = await api.post('/menu/ai/scan-pdf', fd, { ...aiTimeout, headers: { 'Content-Type': 'multipart/form-data' } });
        } else if (mode === 'text') {
          if (!pasteText.trim()) throw new Error('Please paste some menu text');
          resp = await api.post('/menu/ai/parse-text', { text: pasteText }, aiTimeout);
        } else if (mode === 'url') {
          if (!urlInput.trim()) throw new Error('Please enter a URL');
          resp = await api.post('/menu/ai/parse-url', {
            url: urlInput.trim(),
            crawl: urlCrawl,
          }, aiTimeout);
        } else if (mode === 'csv') {
          if (!file) throw new Error('Please choose a spreadsheet');
          const fd = new FormData();
          fd.append('file', file);
          resp = await api.post('/menu/ai/parse-csv', fd, { ...aiTimeout, headers: { 'Content-Type': 'multipart/form-data' } });
        }
        // api interceptor unwraps to {success, data, message}; data is our menu
        return resp?.data ?? resp;
      } finally {
        clearInterval(interval);
      }
    },
    onSuccess: (data) => {
      if (!data?.categories?.length) {
        toast.error('No items found. Try a clearer/larger source.');
        setStep('upload');
        return;
      }
      setExtractedData(data);
      setStep('review');
      setExpandedCats(new Set(data.categories.map((_, i) => i)));
    },
    onError: (err) => {
      toast.error('Extraction failed: ' + (err.response?.data?.message || err.message));
      setStep('upload');
    },
  });

  const syncMutation = useMutation({
    mutationFn: (data) => api.post('/menu/ai/confirm-sync', { outlet_id: outletId, menu_data: data }),
    onSuccess: (res) => {
      const r = res?.data ?? res ?? {};
      toast.success(`Synced! ${r.categoriesCreated || 0} categories · ${r.itemsCreated || 0} items · ${r.variantsCreated || 0} variants`);
      queryClient.invalidateQueries({ queryKey: ['menuItemsAll'] });
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      resetAndClose();
    },
    onError: (err) => toast.error('Sync failed: ' + (err.response?.data?.message || err.message)),
  });

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    if (mode === 'image' && selected.type?.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(selected));
    } else {
      setPreviewUrl(null);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setFile(null); setPreviewUrl(null);
  };

  const startScan = () => {
    setScanStep(0);
    setStep('scanning');
    scanMutation.mutate();
  };

  const resetAndClose = () => {
    setStep('upload'); setMode('image');
    setFile(null); setPreviewUrl(null);
    setPasteText(''); setUrlInput(''); setUrlCrawl(true);
    setExtractedData(null); setScanStep(0);
    onClose();
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

  const canStart =
    (mode === 'image' && !!file) ||
    (mode === 'pdf'   && !!file) ||
    (mode === 'csv'   && !!file) ||
    (mode === 'text'  && pasteText.trim().length > 0) ||
    (mode === 'url'   && /^https?:\/\//i.test(urlInput.trim()));

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="AI Menu Sync ✨" size={step === 'review' ? 'xl' : 'lg'}>
      <div className="mt-2 min-h-[420px] flex flex-col">

        {/* ── UPLOAD ── */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col">
            {/* Tab bar */}
            <div className="flex gap-1 p-1 mb-5 rounded-xl overflow-x-auto" style={{ background: 'var(--bg-secondary)' }}>
              {MODES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => switchMode(id)}
                  className={`flex-1 min-w-[90px] flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-all`}
                  style={mode === id
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { color: 'var(--text-secondary)' }
                  }>
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center space-y-5 py-4">

              {/* IMAGE mode */}
              {mode === 'image' && (
                <ModeBlock title="Upload Menu Photo"
                  subtitle="Snap a clear photo of your physical menu — categories, items, prices, variants all extracted automatically.">
                  {!file ? (
                    <UploadDropZone hint={MODES[0].hint} accept="image/*" onChange={handleFileChange} />
                  ) : (
                    <FilePreview previewUrl={previewUrl} file={file} onClear={() => { setFile(null); setPreviewUrl(null); }} />
                  )}
                </ModeBlock>
              )}

              {/* PDF mode */}
              {mode === 'pdf' && (
                <ModeBlock title="Upload PDF Menu"
                  subtitle="Drop a multi-page PDF — every page is read, items merged automatically.">
                  {!file
                    ? <UploadDropZone hint={MODES[1].hint} accept="application/pdf,.pdf" onChange={handleFileChange} />
                    : <FilePreview file={file} onClear={() => setFile(null)} />}
                </ModeBlock>
              )}

              {/* TEXT mode */}
              {mode === 'text' && (
                <ModeBlock title="Paste Menu Text"
                  subtitle="Paste anything — copied from email, Word, an online menu page. AI structures it for you.">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="STARTERS&#10;Spring Rolls — $8&#10;Garlic Bread — $6&#10;&#10;MAINS&#10;Fish and Chips — $22&#10;Chicken Parmigiana — $26"
                    className="w-full p-3 rounded-xl border text-sm font-mono outline-none resize-y"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', minHeight: '180px', maxHeight: '320px' }}
                  />
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Tip: include category names on their own lines. Prices can be anywhere — AI matches them to items.
                  </p>
                </ModeBlock>
              )}

              {/* URL mode */}
              {mode === 'url' && (
                <ModeBlock title="Import from Website URL"
                  subtitle="Paste any page on the restaurant's website — homepage or menu landing page works.">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://my-restaurant.com.au"
                    className="w-full p-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />

                  <label
                    className="mt-2 flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
                    style={{
                      borderColor: urlCrawl ? 'var(--accent)' : 'var(--border)',
                      background: urlCrawl ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'var(--bg-secondary)',
                    }}>
                    <input
                      type="checkbox"
                      checked={urlCrawl}
                      onChange={(e) => setUrlCrawl(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        Also follow menu sub-pages (recommended)
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Auto-discovers up to 10 same-domain pages like /starters, /mains, /drinks, /lunch and merges them into one extraction. Turn off for a faster single-page scan.
                      </div>
                    </div>
                  </label>

                  <p className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>
                    Works best with static HTML menus. JavaScript-rendered SPAs (Squarespace newer themes, Wix) may return no content.
                  </p>
                </ModeBlock>
              )}

              {/* CSV mode */}
              {mode === 'csv' && (
                <ModeBlock title="Upload Spreadsheet"
                  subtitle="Drop a CSV / TSV / XLSX export from your previous POS or any spreadsheet. AI maps the columns.">
                  {!file
                    ? <UploadDropZone hint={MODES[4].hint} accept=".csv,.tsv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} />
                    : <FilePreview file={file} onClear={() => setFile(null)} />}
                </ModeBlock>
              )}

              <div className="w-full max-w-md grid grid-cols-3 gap-2 text-center">
                {[['Categories', '🗂️'], ['Items + Prices', symbol], ['Variants', '📐']].map(([label, icon]) => (
                  <div key={label} className="px-3 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                    <div className="text-base mb-0.5">{icon}</div>{label}
                  </div>
                ))}
              </div>

              <button disabled={!canStart} onClick={startScan}
                className="w-full max-w-md py-4 rounded-xl text-base font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--accent)' }}>
                <Sparkles className="w-5 h-5" /> Start AI Extraction
              </button>
            </div>
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
              <h3 className="text-2xl font-black animate-pulse" style={{ color: 'var(--text-primary)' }}>Digitizing Menu…</h3>
              <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
                {SCAN_STEPS[scanStep]}
              </p>
            </div>
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                <span>Processing</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progress}%`, background: 'var(--accent)' }} />
              </div>
              <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                Gemini AI — understands any menu layout
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
                <div key={cIdx} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => toggleCat(cIdx)}
                      className="flex items-center gap-2 font-black uppercase text-xs tracking-widest"
                      style={{ color: 'var(--accent)' }}>
                      {expandedCats.has(cIdx) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
                              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{item.description}</p>
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

            <div className="mt-4 pt-4 flex items-center justify-between flex-wrap gap-3"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <AlertCircle className="w-4 h-4" />
                <span>Default GST applied to all new items</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('upload')}
                  className="btn-surface px-5 py-2.5 font-bold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Restart
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

/* ─────────────────────────────────────────────────────────────
   Small presentational helpers
───────────────────────────────────────────────────────────── */
function ModeBlock({ title, subtitle, children }) {
  return (
    <div className="w-full max-w-md space-y-3">
      <div className="text-center">
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function UploadDropZone({ hint, accept, onChange }) {
  return (
    <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all group"
      style={{ borderColor: 'var(--border)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      <Upload className="w-7 h-7 mb-2" style={{ color: 'var(--text-secondary)' }} />
      <span className="font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>Click to choose file</span>
      <span className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{hint}</span>
      <input type="file" className="hidden" accept={accept} onChange={onChange} />
    </label>
  );
}

function FilePreview({ previewUrl, file, onClear }) {
  if (previewUrl) {
    // Image
    return (
      <div className="relative rounded-2xl overflow-hidden border aspect-[4/3]"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" />
        <button onClick={onClear}
          className="absolute top-2 right-2 p-1.5 rounded-full text-white"
          style={{ background: 'rgba(0,0,0,0.6)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  // Non-image (PDF/CSV) — show file name + size
  return (
    <div className="rounded-2xl border p-4 flex items-center gap-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <FileText className="w-7 h-7 shrink-0" style={{ color: 'var(--accent)' }} />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{(file.size / 1024).toFixed(1)} KB</div>
      </div>
      <button onClick={onClear} className="p-1.5 rounded-full hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
