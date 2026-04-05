import { X } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Reusable modal wrapper with backdrop, close on Escape, and animation.
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {function} props.onClose - Close handler
 * @param {string} props.title - Modal heading
 * @param {string} [props.size='md'] - Size: sm, md, lg, xl
 * @param {React.ReactNode} props.children - Modal body content
 */
export default function Modal({ isOpen, onClose, title, size = 'md', children }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className={`bg-surface-800 rounded-2xl border border-surface-700 w-full ${sizeClasses[size] || sizeClasses.md} shadow-2xl max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700/50 sticky top-0 bg-surface-800 rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1 text-surface-400 hover:text-white transition-colors rounded-lg hover:bg-surface-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
