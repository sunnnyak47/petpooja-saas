import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CreditCard, X } from 'lucide-react';
import useBranding from '../../hooks/useBranding';

export default function DunningBanner({ user }) {
  const { branding } = useBranding();
  const [visible, setVisible] = useState(true);
  
  if (!user?.expires_at || !visible) return null;

  const expiryDate = new Date(user.expires_at);
  const now = new Date();
  const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

  // Only show if expiring in 7 days or already expired
  if (diffDays > 7) return null;

  const isExpired = diffDays <= 0;

  return (
    <div className={`sticky top-0 z-[99] w-full px-6 py-2 flex items-center justify-between text-white shadow-lg animate-slide-down ${isExpired ? 'bg-red-600' : 'bg-amber-500'}`}>
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-1.5 rounded-lg">
           <AlertCircle size={18} />
        </div>
        <p className="text-sm font-bold">
          {isExpired 
            ? "SUBSCRIPTION EXPIRED! Your POS is locked. Please renew immediately to continue sales." 
            : `Your trial expires in ${diffDays} days. Upgrade now to keep using ${branding.platform_name} Premium.`}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Link 
          to="/settings/billing" 
          className="bg-white text-slate-900 px-4 py-1.5 rounded-lg text-xs font-black uppercase hover:bg-slate-100 transition flex items-center gap-2"
        >
          <CreditCard size={14} /> {isExpired ? 'Pay Now' : 'Upgrade Plan'}
        </Link>
        <button onClick={() => setVisible(false)} className="hover:bg-black/10 p-1 rounded-md transition text-white/80">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
