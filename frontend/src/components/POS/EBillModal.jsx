import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { Send, Phone, Mail, MessageCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useRegion } from '../../hooks/useRegion';

const METHODS = [
  { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, color: '#25D366', bg: 'rgba(37,211,102,0.1)' },
  { id: 'sms',      label: 'SMS',      Icon: Phone,          color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  { id: 'email',    label: 'Email',    Icon: Mail,           color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
];

// Country dial-code prefix based on region
function defaultPrefix(region) {
  return region === 'AU' ? '61' : '91';
}

// Strip non-digits; ensure no leading + so wa.me works
function normalizePhone(raw) {
  return raw.replace(/\D/g, '');
}

export default function EBillModal({ isOpen, onClose, customer, orderId }) {
  const region = useRegion();
  const isAU   = region === 'AU';

  const [method,   setMethod]   = useState('whatsapp');
  const [phone,    setPhone]    = useState('');
  const [email,    setEmail]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);

  // Sync customer when prop changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setSent(false);
      setPhone(customer?.phone || '');
      setEmail(customer?.email || '');
    }
  }, [isOpen, customer]);

  const handleSend = async () => {
    if (!orderId) {
      toast.error('No active order — punch KOT first');
      return;
    }

    const needsPhone = method === 'whatsapp' || method === 'sms';
    if (needsPhone && !phone.trim()) {
      toast.error('Enter a phone number');
      return;
    }
    if (method === 'email' && !email.trim()) {
      toast.error('Enter an email address');
      return;
    }

    setSending(true);
    try {
      const payload = { method, phone: normalizePhone(phone), email };
      const res = await api.post(`/orders/${orderId}/ebill`, payload);
      const data = res.data?.data ?? res.data;

      if (method === 'whatsapp' && data?.waUrl) {
        // WhatsApp requires the user to actually tap Send in the app —
        // open the pre-filled wa.me link in a new tab
        window.open(data.waUrl, '_blank', 'noopener');
        toast.success('WhatsApp opened — tap Send to deliver the bill');
      } else {
        toast.success(
          method === 'email'
            ? `Bill emailed to ${email}`
            : `Bill sent via SMS to ${phone}`
        );
      }

      setSent(true);
      setTimeout(() => onClose(), 1400);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to send eBill';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const activeMethod = METHODS.find(m => m.id === method);
  const needsPhone   = method === 'whatsapp' || method === 'sms';

  return (
    <Modal isOpen={isOpen} onClose={() => onClose()} title="Send eBill" size="sm">
      <div className="space-y-5">

        {/* Method picker */}
        <div className="flex gap-2">
          {METHODS.map(({ id, label, Icon, color, bg }) => {
            const active = method === id;
            return (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className="flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all text-sm font-semibold"
                style={{
                  background: active ? bg : 'var(--bg-secondary)',
                  border: `1.5px solid ${active ? color : 'var(--border)'}`,
                  color: active ? color : 'var(--text-secondary)',
                }}>
                <Icon className="w-5 h-5" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Input */}
        {needsPhone ? (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--text-secondary)' }}>
              Phone Number
            </label>
            <div className="flex items-center gap-2 rounded-xl overflow-hidden"
              style={{ border: '1.5px solid var(--border)', background: 'var(--bg-card)' }}>
              {/* Country prefix badge */}
              <span className="pl-3 pr-1 text-sm font-bold shrink-0"
                style={{ color: 'var(--text-secondary)' }}>
                +{defaultPrefix(region)}
              </span>
              <input
                type="tel"
                autoFocus
                className="flex-1 py-3 pr-3 text-sm bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
                placeholder={isAU ? '400 000 000' : '98765 43210'}
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            {method === 'whatsapp' && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                WhatsApp will open with the bill pre-filled — customer taps Send.
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--text-secondary)' }}>
              Email Address
            </label>
            <div className="flex items-center gap-2 rounded-xl overflow-hidden"
              style={{ border: '1.5px solid var(--border)', background: 'var(--bg-card)' }}>
              <Mail className="w-4 h-4 ml-3 shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <input
                type="email"
                autoFocus
                className="flex-1 py-3 pr-3 text-sm bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
                placeholder="customer@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || sent}
          className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: sent
              ? 'linear-gradient(135deg,#16a34a,#15803d)'
              : activeMethod
                ? `linear-gradient(135deg, ${activeMethod.color}dd, ${activeMethod.color})`
                : 'var(--accent)',
            color: '#fff',
            boxShadow: sent ? '0 4px 14px -4px rgba(22,163,74,0.5)' : '0 4px 14px -4px rgba(99,102,241,0.4)',
          }}>
          {sent ? (
            <><CheckCircle className="w-4 h-4" /> Sent!</>
          ) : sending ? (
            <>Sending…</>
          ) : (
            <><Send className="w-4 h-4" /> Send via {activeMethod?.label}</>
          )}
        </button>

      </div>
    </Modal>
  );
}
