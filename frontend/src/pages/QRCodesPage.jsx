/**
 * @fileoverview QR Code Generator — Owner generates table-specific QR codes.
 * Workflow: Select table → Generate QR → Download/Print → Paste on table
 * @module pages/QRCodesPage
 */
import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { QRCodeSVG } from 'qrcode.react';
import api from '../lib/api';
import {
  QrCode, Download, Printer, Table2, CheckCircle2,
  ExternalLink, Copy, ChevronRight, ScanLine, Smartphone
} from 'lucide-react';
import toast from 'react-hot-toast';
import useBranding from '../hooks/useBranding';

export default function QRCodesPage() {
  const { branding } = useBranding();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const [selectedTable, setSelectedTable] = useState(null);
  const [generatedQRs, setGeneratedQRs] = useState({}); // tableId -> true
  const qrRef = useRef(null);

  // Fetch tables
  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables', outletId],
    queryFn: () => api.get(`/orders/tables?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  // Build the ordering URL for a table
  const getOrderUrl = (tableId) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/order?outlet=${outletId}&table=${tableId}`;
  };

  // Generate QR for a table
  const handleGenerate = (table) => {
    setSelectedTable(table);
    setGeneratedQRs(prev => ({ ...prev, [table.id]: true }));
  };

  // Download QR as image
  const handleDownload = () => {
    if (!qrRef.current || !selectedTable) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 800, 1000);

      // Restaurant name
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 28px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(user?.outlet?.name || `${branding.platform_name} Restaurant`, 400, 60);

      // QR code centered
      ctx.drawImage(img, 150, 100, 500, 500);

      // Table info
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 42px Inter, system-ui, sans-serif';
      ctx.fillText(`Table ${selectedTable.table_number}`, 400, 680);

      // Instruction
      ctx.fillStyle = '#6b7280';
      ctx.font = '22px Inter, system-ui, sans-serif';
      ctx.fillText('Scan to view menu & order', 400, 730);
      ctx.fillText('directly from your phone', 400, 760);

      // Branding
      ctx.fillStyle = '#d1d5db';
      ctx.font = '16px Inter, system-ui, sans-serif';
      ctx.fillText(`Powered by ${branding.platform_name}`, 400, 960);

      const link = document.createElement('a');
      link.download = `QR-Table-${selectedTable.table_number}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success(`QR for Table ${selectedTable.table_number} downloaded!`);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  // Print QR
  const handlePrint = () => {
    if (!qrRef.current || !selectedTable) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Please allow popups'); return; }
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>QR - Table ${selectedTable.table_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui, sans-serif; }
        .card { text-align: center; padding: 40px; border: 3px solid #f97316; border-radius: 24px; max-width: 400px; }
        .card h1 { font-size: 18px; color: #374151; margin-bottom: 24px; }
        .card svg { width: 280px; height: 280px; }
        .card h2 { font-size: 32px; color: #f97316; margin-top: 24px; font-weight: 900; }
        .card p { font-size: 14px; color: #9ca3af; margin-top: 8px; }
        .card .brand { font-size: 11px; color: #d1d5db; margin-top: 24px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      <div class="card">
        <h1>${user?.outlet?.name || `${branding.platform_name} Restaurant`}</h1>
        ${qrRef.current.innerHTML}
        <h2>Table ${selectedTable.table_number}</h2>
        <p>Scan to view menu &amp; order</p>
        <p class="brand">Powered by ${branding.platform_name}</p>
      </div>
      <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  // Copy URL
  const handleCopy = (url) => {
    navigator.clipboard.writeText(url).then(() => toast.success('URL copied!')).catch(() => toast.error('Copy failed'));
  };

  const availableTables = (tables || []).filter(t => !t.is_deleted);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-surface-900 border border-surface-800 p-6 rounded-3xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center text-brand-400">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white flex items-center gap-2">
                QR Code Generator
              </h1>
              <p className="text-sm text-surface-500 mt-0.5">
                Generate table QR codes → Customers scan → Order directly
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface-950 px-4 py-2.5 rounded-2xl border border-surface-800">
            <ScanLine className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-black text-surface-400 uppercase tracking-widest">
              {Object.keys(generatedQRs).length} Generated
            </span>
          </div>
        </div>
      </div>

      {/* How It Works Banner */}
      <div className="bg-gradient-to-r from-brand-500/10 to-brand-600/5 border border-brand-500/20 p-5 rounded-3xl">
        <h3 className="text-sm font-black text-brand-400 uppercase tracking-widest mb-3">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { icon: Table2, label: 'Select Table', desc: 'Pick from your table list' },
            { icon: QrCode, label: 'Generate QR', desc: 'Unique QR for each table' },
            { icon: Printer, label: 'Print & Paste', desc: 'Stick on restaurant table' },
            { icon: Smartphone, label: 'Customer Scans', desc: 'Orders appear on your POS' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-900 flex items-center justify-center text-brand-400 shrink-0">
                <step.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-white uppercase tracking-wider">{step.label}</p>
                <p className="text-[10px] text-surface-500 truncate">{step.desc}</p>
              </div>
              {i < 3 && <ChevronRight className="w-4 h-4 text-surface-700 hidden md:block shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Table Selection */}
        <div className="bg-surface-900 border border-surface-800 rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-black text-surface-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Table2 className="w-4 h-4 text-brand-400" />
            Select a Table
          </h2>
          {isLoading ? (
            <div className="py-12 text-center text-surface-600">Loading tables...</div>
          ) : availableTables.length === 0 ? (
            <div className="py-12 text-center text-surface-600">
              <Table2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No tables found. Create tables in the Tables module first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
              {availableTables.map(table => {
                const isSelected = selectedTable?.id === table.id;
                const isGenerated = generatedQRs[table.id];
                return (
                  <button key={table.id} onClick={() => handleGenerate(table)}
                    className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10'
                        : isGenerated
                          ? 'border-success-500/30 bg-success-500/5'
                          : 'border-surface-800 bg-surface-950 hover:border-surface-600'
                    }`}>
                    {isGenerated && (
                      <div className="absolute top-1.5 right-1.5">
                        <CheckCircle2 className="w-4 h-4 text-success-500" />
                      </div>
                    )}
                    <span className="text-2xl font-black text-white">{table.table_number}</span>
                    <span className="text-[9px] font-bold text-surface-500 uppercase tracking-widest mt-1">
                      {table.seating_capacity || 4} seats
                    </span>
                    <span className={`text-[8px] font-black uppercase tracking-widest mt-1 px-2 py-0.5 rounded-full ${
                      table.status === 'available' ? 'bg-success-500/10 text-success-400' : 'bg-orange-500/10 text-orange-400'
                    }`}>{table.status}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: QR Preview & Actions */}
        <div className="bg-surface-900 border border-surface-800 rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-black text-surface-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-brand-400" />
            QR Code Preview
          </h2>

          {selectedTable ? (
            <div className="text-center">
              {/* QR Display */}
              <div ref={qrRef} className="inline-block bg-white p-6 rounded-3xl shadow-xl mb-6">
                <QRCodeSVG
                  value={getOrderUrl(selectedTable.id)}
                  size={240}
                  level="H"
                  includeMargin={true}
                  fgColor="#111827"
                  imageSettings={{
                    src: '',
                    x: undefined,
                    y: undefined,
                    height: 0,
                    width: 0,
                  }}
                />
              </div>

              {/* Table Info */}
              <div className="mb-6">
                <h3 className="text-3xl font-black text-brand-400">Table {selectedTable.table_number}</h3>
                <p className="text-xs text-surface-500 mt-1">{selectedTable.seating_capacity || 4} seats · {selectedTable.area?.name || 'Main Area'}</p>
              </div>

              {/* URL Display */}
              <div className="bg-surface-950 border border-surface-800 rounded-2xl p-3 mb-6 flex items-center gap-2">
                <code className="text-[10px] text-surface-400 flex-1 truncate">{getOrderUrl(selectedTable.id)}</code>
                <button onClick={() => handleCopy(getOrderUrl(selectedTable.id))}
                  className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-500 hover:text-white transition-colors shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <a href={getOrderUrl(selectedTable.id)} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-500 hover:text-white transition-colors shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleDownload}
                  className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-black py-3.5 rounded-2xl transition-colors shadow-lg shadow-brand-500/20">
                  <Download className="w-5 h-5" />
                  Download PNG
                </button>
                <button onClick={handlePrint}
                  className="flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 text-white font-black py-3.5 rounded-2xl transition-colors border border-surface-700">
                  <Printer className="w-5 h-5" />
                  Print QR
                </button>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-surface-950 flex items-center justify-center">
                <QrCode className="w-10 h-10 text-surface-700" />
              </div>
              <p className="text-surface-500 font-medium mb-1">No table selected</p>
              <p className="text-surface-600 text-xs">Click a table on the left to generate its QR code</p>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Generate Hint */}
      {availableTables.length > 0 && (
        <div className="bg-surface-950 border border-surface-800 p-4 rounded-2xl text-center">
          <p className="text-xs text-surface-500">
            <span className="font-black text-surface-400">Pro Tip:</span> Click each table to generate its QR code, then download or print. Each table gets a unique QR linked to your menu.
          </p>
        </div>
      )}
    </div>
  );
}
