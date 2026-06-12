/**
 * LogoUploader — pick an image, upload it to the backend (S3 with local
 * fallback), and report the resulting public URL via onUploaded(url).
 * Themed with CSS variables. Used by the onboarding wizard and Settings.
 */
import React, { useRef, useState } from 'react';
import { Upload, Loader2, X, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export default function LogoUploader({ value, onUploaded, size = 88 }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    if (file.size > MAX_BYTES) return toast.error('Image must be under 5MB');

    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      // api interceptor returns the response body; the upload payload is at .data.url
      const res = await api.post('/ho/upload-logo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res?.data?.url || res?.url;
      if (!url) throw new Error('Upload did not return a URL');
      onUploaded(url);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err.message || 'Logo upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className="rounded-2xl flex items-center justify-center overflow-hidden border shrink-0"
        style={{ width: size, height: size, borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      >
        {value ? (
          <img src={value} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <ImageIcon className="w-7 h-7" style={{ color: 'var(--text-secondary)' }} />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading…' : value ? 'Replace logo' : 'Upload logo'}
        </button>
        {value && !uploading && (
          <button
            type="button"
            onClick={() => onUploaded('')}
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-3 h-3" /> Remove
          </button>
        )}
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>PNG/SVG, 1:1, &lt; 5MB</span>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}
