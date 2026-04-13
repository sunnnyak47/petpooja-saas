import Modal from '../Modal';
import { Printer, Share2, ClipboardCheck, X } from 'lucide-react';
import useBranding from '../../hooks/useBranding';

export default function BillPreviewModal({ isOpen, onClose, order, onPrint }) {
  const { branding } = useBranding();
  if (!order) return null;

  const formatDate = (date) => new Date(date).toLocaleString();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bill Preview" size="md">
      <div className="flex flex-col h-[70vh]">
        {/* Receipt Styled Content */}
        <div className="flex-1 bg-white text-gray-900 p-8 rounded-xl shadow-inner overflow-y-auto mb-4 font-mono text-sm leading-tight">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold uppercase tracking-widest">{order.outlet?.name || `${branding.platform_name} Restaurant`}</h2>
            <p className="text-[10px] mt-1">{order.outlet?.address || '123 Food Street, Main City'}</p>
            <p className="text-[10px]">GSTIN: {order.outlet?.gstin || '24AAAAA0000A1Z5'}</p>
            <div className="border-t border-dashed border-gray-300 my-4"></div>
            <h3 className="font-bold underline decoration-double">PROFORMA INVOICE</h3>
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
                <span className="col-span-3 text-right">₹{Number(item.item_total).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
            <div className="flex justify-between text-[11px]">
               <span>Subtotal</span>
               <span>₹{Number(order.subtotal).toFixed(2)}</span>
            </div>
            {Number(order.cgst) > 0 && (
              <div className="flex justify-between text-[10px] opacity-70">
                <span>CGST (2.5%)</span>
                <span>₹{Number(order.cgst).toFixed(2)}</span>
              </div>
            )}
            {Number(order.sgst) > 0 && (
              <div className="flex justify-between text-[10px] opacity-70">
                <span>SGST (2.5%)</span>
                <span>₹{Number(order.sgst).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-double border-gray-900 pt-2 mt-2">
               <span>GRAND TOTAL</span>
               <span>₹{Number(order.grand_total).toFixed(0)}.00</span>
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
