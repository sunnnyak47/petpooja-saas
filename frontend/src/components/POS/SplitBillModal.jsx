import React, { useState } from 'react';
import Modal from '../Modal';
import { CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function SplitBillModal({ isOpen, onClose, orderTotal, cartItems, orderId, outletId }) {
  const [splitMode, setSplitMode] = useState('equal'); // equal, custom
  const [splitCount, setSplitCount] = useState(2);
  const [customSplits, setCustomSplits] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const total = Number(orderTotal) || 0;

  const handleEqualSplit = () => {
    const amount = +(total / splitCount).toFixed(2);
    const splits = Array(splitCount).fill({ amount, method: 'cash' });
    // Adjust last one if rounding error
    const sum = amount * splitCount;
    if (sum !== total) splits[splits.length - 1].amount += +(total - sum).toFixed(2);
    return splits;
  };

  const currentSplits = splitMode === 'equal' ? handleEqualSplit() : customSplits;

  const processSplitPayment = async () => {
    setIsProcessing(true);
    try {
      // Create/Get Order is assumed done before entering modal
      // Send split payment request
      await api.post(`/orders/${orderId}/payment`, {
        method: 'split',
        amount: total,
        splits: currentSplits.map(s => ({ method: s.method, amount: s.amount }))
      });
      toast.success('Split bill payment successful!');
      onClose(true); // pass success
    } catch (err) {
      toast.error(err.message || 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => onClose()} title="Split Bill" size="lg">
      <div className="space-y-4">
        <div className="flex bg-surface-800 rounded-xl p-1 mb-4">
          {['equal', 'custom'].map(m => (
            <button key={m} onClick={() => setSplitMode(m)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg ${splitMode === m ? 'bg-brand-500 text-white' : 'text-surface-400'}`}>
              By {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {splitMode === 'equal' && (
          <div className="space-y-4">
             <div className="flex items-center gap-4">
                <span className="text-sm text-surface-300">Number of people:</span>
                <input type="number" min="2" max="20" className="input w-24" value={splitCount} onChange={e => setSplitCount(Number(e.target.value))} />
             </div>
             <div className="grid grid-cols-2 gap-4">
                {currentSplits.map((s, i) => (
                  <div key={i} className="bg-surface-800/50 p-4 rounded-xl border border-surface-700">
                     <p className="text-surface-400 text-sm">Bill {i + 1}</p>
                     <p className="text-2xl font-bold text-white mb-2">₹{s.amount.toFixed(2)}</p>
                     <select className="input w-full text-sm" value={s.method} onChange={(e) => {}}>
                       <option value="cash">Cash</option>
                       <option value="card">Card</option>
                       <option value="upi">UPI</option>
                     </select>
                  </div>
                ))}
             </div>
          </div>
        )}

        <div className="pt-4 mt-4 border-t border-surface-800">
           <button onClick={processSplitPayment} disabled={isProcessing} className="btn-success w-full py-4 text-lg">
             <CreditCard className="w-5 h-5 inline mr-2" /> Process All Bills
           </button>
        </div>
      </div>
    </Modal>
  );
}
