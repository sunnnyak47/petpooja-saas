import React, { useState } from 'react';
import Modal from '../Modal';
import { AlertTriangle, X } from 'lucide-react';

const PREDEFINED_REASONS = [
  'Customer Left',
  'Entry Error',
  'Item Unavailable',
  'Duplicate Order',
  'Order Delayed',
];

export default function CancelOrderModal({ isOpen, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason || reason.length < 3) return;
    setIsSubmitting(true);
    await onConfirm(reason);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancel Order" size="sm">
      <div className="p-1">
        <div className="flex items-center gap-3 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-xs font-medium uppercase tracking-wider">Warning: This action cannot be undone. All KOTs will be marked as cancelled.</p>
        </div>

        <p className="text-sm text-surface-400 mb-2">Select a reason for cancellation:</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PREDEFINED_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                reason === r ? 'bg-red-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <textarea
          className="input w-full h-24 mb-4 text-sm bg-surface-900 border-surface-800 focus:border-red-500 transition-colors"
          placeholder="Or type a custom reason..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 py-3 text-sm">Close</button>
          <button
            onClick={handleConfirm}
            disabled={!reason || reason.length < 3 || isSubmitting}
            className="btn-danger flex-1 py-3 text-sm font-bold shadow-lg shadow-red-500/20 active:scale-[0.98]"
          >
            {isSubmitting ? 'Cancelling...' : 'Cancel Order'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
