import { useSelector } from 'react-redux';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Wrap a page with <FeatureGate feature="pos"> to block access when
 * the chain has that feature toggled off in superadmin.
 *
 * Super admins always see through. Users with no features object
 * (legacy / pre-migration) also see through.
 */
export default function FeatureGate({ feature, children }) {
  const user = useSelector(s => s.auth.user);

  if (!feature) return children;
  if (user?.role === 'super_admin') return children;
  const features = user?.features;
  // Legacy: no features object means everything is on
  if (!features || typeof features !== 'object') return children;
  if (features[feature] !== false) return children;

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div
        className="rounded-2xl p-8 max-w-md text-center"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-yellow-400" />
        </div>
        <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
          Feature Disabled
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          This feature is currently turned off for your restaurant.
          Contact your platform administrator to enable it.
        </p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
