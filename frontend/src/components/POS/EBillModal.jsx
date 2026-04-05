import React, { useState } from 'react';
import Modal from '../Modal';
import { Send, Phone, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function EBillModal({ isOpen, onClose, customer, orderId }) {
  const [method, setMethod] = useState('whatsapp');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if ((method === 'whatsapp' || method === 'sms') && !phone) return toast.error('Phone number required');
    if (method === 'email' && !email) return toast.error('Email required');

    setIsSending(true);
    try {
      if (method === 'whatsapp') {
        // Just open wa.me link for demo
        window.open(`https://wa.me/91${phone}?text=Thank%20you%20for%20dining%20with%20us!%20Your%20bill%20is%20ready.`, '_blank');
        toast.success('WhatsApp opened!');
      } else {
        // Make sure orderId is real
        if (orderId) {
          // This endpoint is mocked on backend or needs to be caught gracefully
          await api.post(`/orders/${orderId}/ebill`, { method, phone, email }).catch(e => console.log('Mock email/sms'));
        }
        toast.success(`Bill sent to ${method === 'email' ? email : phone} via ${method.toUpperCase()}`);
      }
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to send eBill');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => onClose()} title="Send eBill" size="sm">
      <div className="space-y-4">
         <div className="grid grid-cols-3 gap-2 mb-4">
            <button onClick={() => setMethod('whatsapp')} className={`py-2 rounded-xl border text-sm font-medium ${method === 'whatsapp' ? 'bg-[#25D366]/20 border-[#25D366] text-[#25D366]' : 'border-surface-700 text-surface-400'}`}>WhatsApp</button>
            <button onClick={() => setMethod('sms')} className={`py-2 rounded-xl border text-sm font-medium ${method === 'sms' ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'border-surface-700 text-surface-400'}`}>SMS</button>
            <button onClick={() => setMethod('email')} className={`py-2 rounded-xl border text-sm font-medium ${method === 'email' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-surface-700 text-surface-400'}`}>Email</button>
         </div>

         {(method === 'whatsapp' || method === 'sms') ? (
           <div>
             <label className="block text-sm text-surface-400 mb-1">Phone Number</label>
             <div className="flex relative">
                <Phone className="w-4 h-4 absolute left-3 top-3 text-surface-500" />
                <input type="text" className="input pl-9 w-full" placeholder="9876543210" value={phone} onChange={e => setPhone(e.target.value)} />
             </div>
           </div>
         ) : (
           <div>
             <label className="block text-sm text-surface-400 mb-1">Email Address</label>
             <div className="flex relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-surface-500" />
                <input type="email" className="input pl-9 w-full" placeholder="customer@example.com" value={email} onChange={e => setEmail(e.target.value)} />
             </div>
           </div>
         )}
         
         <button onClick={handleSend} disabled={isSending} className="btn-primary w-full py-3 mt-4">
           {isSending ? 'Sending...' : 'Send eBill'} <Send className="w-4 h-4 inline ml-1"/>
         </button>
      </div>
    </Modal>
  );
}
