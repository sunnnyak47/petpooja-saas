import Modal from '../Modal';
import { Printer, Share2, ClipboardCheck, X } from 'lucide-react';
import useBranding from '../../hooks/useBranding';
import { useCurrency } from '../../hooks/useCurrency';
import { useRegion } from '../../hooks/useRegion';

export default function BillPreviewModal({ isOpen, onClose, order, onPrint }) {
  const { branding } = useBranding();
  const { symbol } = useCurrency();
  const userRegion = useRegion();
  const isAU = userRegion === 'AU';
  if (!order) return null;

  const formatDate = (date) => new Date(date).toLocaleString();

  // Derive the actual tax-component rate: prefer an explicit rate field on the
  // order, otherwise back it out from the component amount vs. the taxable base.
  const taxBase = Number(order.taxable_amount ?? order.subtotal ?? 0);
  const rateFor = (explicitRate, amount) => {
    const r = Number(explicitRate);
    if (Number.isFinite(r) && r > 0) return r;
    const amt = Number(amount || 0);
    if (taxBase > 0 && amt > 0) return (amt / taxBase) * 100;
    return null;
  };
  const fmtRate = (r) => (r == null ? '' : ` (${Number(r.toFixed(2))}%)`);
  const cgstRate = rateFor(order.cgst_rate ?? order.cgst_percent, order.cgst);
  const sgstRate = rateFor(order.sgst_rate ?? order.sgst_percent, order.sgst);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bill Preview" size="md">
      <div className="flex flex-col h-[70vh]">
        {/* Receipt Styled Content */}
        <div className="flex-1 bg-white text-gray-900 p-8 rounded-xl shadow-inner overflow-y-auto mb-4 font-mono text-sm leading-tight">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold uppercase tracking-widest">{order.outlet?.name || `${branding.platform_name} Restaurant`}</h2>
            <p className="text-[10px] mt-1">{order.outlet?.address || '123 Food Street, Main City'}</p>
            {isAU
              ? order.outlet?.abn && <p className="text-[10px]">ABN: {order.outlet.abn}</p>
              : order.outlet?.gstin && <p className="text-[10px]">GSTIN: {order.outlet.gstin}</p>}
            {order.outlet?.fssai_number && !isAU && <p className="text-[10px]">FSSAI: {order.outlet.fssai_number}</p>}
            {order.outlet?.phone && <p className="text-[10px]">Ph: {order.outlet.phone}</p>}
            <div className="border-t border-dashed border-gray-300 my-4"></div>
            {/* A settled order is a final tax invoice; an unpaid one is only a proforma. */}
            <h3 className="font-bold underline decoration-double">
              {(order.is_paid || order.status === 'paid') ? 'TAX INVOICE' : 'PROFORMA INVOICE'}
            </h3>
          </div>

          <div className="flex justify-between mb-1">
            <span>Bill No: {order.invoice_number || 'PENDING'}</span>
            <span>Date: {formatDate(order.created_at)}</span>
          </div>
          <div className="flex justify-between mb-4">
            <span>Table: {order.table?.table_number || 'N/A'}</span>
            <span>Staff: {order.staff?.full_name || 'POS'}</span>
          </div>

          <div className="border-t border-dashed border-gray-300 mb-2"></div>
          <div className="grid grid-cols-12 font-bold mb-2 uppercase text-[10px]">
            <span className="col-span-1">#</span>
            <span className="col-span-7">Item</span>
            <span className="col-span-1 text-center">Qty</span>
            <span className="col-span-3 text-right">Price</span>
          </div>
          <div className="border-t border-dashed border-gray-300 mb-2"></div>

          <div className="space-y-2 mb-4">
            {order.order_items?.map((item, idx) => (
              <div key={item.id} className="grid grid-cols-12 text-[11px]">
                <span className="col-span-1">{idx + 1}</span>
                <div className="col-span-7 pr-2">
                  <p className="font-bold">{item.name}</p>
                  {item.variant_name && <p className="text-[9px] italic"> - {item.variant_name}</p>}
                  {item.addons?.map(a => <p key={a.id} className="text-[9px] pl-2 opacity-70">+ {a.name}</p>)}
                </div>
                <span className="col-span-1 text-center">{item.quantity}</span>
                <span className="col-span-3 text-right">{symbol}{Number(item.item_total).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
            <div className="flex justify-between text-[11px]">
               <span>Subtotal</span>
               <span>{symbol}{Number(order.subtotal).toFixed(2)}</span>
            </div>
            {isAU ? (
              (Number(order.igst) > 0 || Number(order.cgst) > 0 || Number(order.sgst) > 0 || Number(order.gst) > 0) && (
                <div className="flex justify-between text-[10px] opacity-70">
                  <span>GST (10%) incl.</span>
                  <span>{symbol}{Number(order.igst || order.gst || (Number(order.cgst || 0) + Number(order.sgst || 0))).toFixed(2)}</span>
                </div>
              )
            ) : (
              <>
                {Number(order.cgst) > 0 && (
                  <div className="flex justify-between text-[10px] opacity-70">
                    <span>CGST{fmtRate(cgstRate)}</span>
                    <span>{symbol}{Number(order.cgst).toFixed(2)}</span>
                  </div>
                )}
                {Number(order.sgst) > 0 && (
                  <div className="flex justify-between text-[10px] opacity-70">
                    <span>SGST{fmtRate(sgstRate)}</span>
                    <span>{symbol}{Number(order.sgst).toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between font-bold text-base border-t border-double border-gray-900 pt-2 mt-2">
               <span>GRAND TOTAL</span>
               <span>{symbol}{Number(order.grand_total).toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-8 text-center text-[10px] space-y-1">
            <p className="font-bold uppercase tracking-widest italic">Thank You! Visit Again</p>
            <p>Order #{order.order_number}</p>
            <p>Powered by {branding.platform_name}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-surface flex-1 py-3 text-sm">Close</button>
          <button onClick={onPrint} className="btn-brand flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" /> Print Bill
          </button>
          <button className="btn-ghost p-3 rounded-xl border border-surface-700">
            <Share2 className="w-5 h-5 text-surface-400" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
