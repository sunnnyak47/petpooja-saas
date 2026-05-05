import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut } from 'lucide-react';
import { logout, loginSuccess } from '../store/slices/authSlice';

// Decode a JWT without jwt-decode library (using built-in atob)
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch {
    return null;
  }
}

export default function ImpersonationBanner() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(s => s.auth.user);

  // Show banner if impersonated flag is on the user object
  const isImpersonating = user?.impersonated === true;

  if (!isImpersonating) return null;

  const handleExit = () => {
    const adminToken = localStorage.getItem('admin_restore_token');
    const adminUserRaw = localStorage.getItem('admin_restore_user');

    // Restore admin session in localStorage before reload
    if (adminToken) {
      localStorage.setItem('accessToken', adminToken);
      if (adminUserRaw) localStorage.setItem('user', adminUserRaw);
    }

    // Clean up impersonation keys
    localStorage.removeItem('impersonate_token');
    localStorage.removeItem('admin_restore_token');
    localStorage.removeItem('admin_restore_user');

    // Full reload to reinitialize Redux from localStorage
    window.location.href = window.location.origin + window.location.pathname + '#/super-admin';
    window.location.reload();
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 z-50"
      style={{ background: '#1e293b', color: '#fff' }}
    >
      <div className="flex items-center gap-2.5 text-sm">
        <Eye className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="font-medium">
          You are viewing as{' '}
          <span className="text-amber-300 font-semibold">
            {user?.full_name || 'restaurant owner'}
          </span>
          {user?.head_office?.name && (
            <span className="opacity-70 font-normal ml-1">
              ({user.head_office.name})
            </span>
          )}
        </span>
        <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'rgba(251,191,36,0.15)', color: '#FCD34D' }}>
          Impersonation Mode
        </span>
      </div>

      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 flex-shrink-0"
        style={{ background: 'rgba(239,68,68,0.2)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.3)' }}>
        <LogOut className="w-3.5 h-3.5" />
        Exit Impersonation
      </button>
    </div>
  );
}
