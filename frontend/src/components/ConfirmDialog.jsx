import Modal from './Modal';
import { AlertTriangle, Loader } from 'lucide-react';

/**
 * Reusable confirmation dialog for destructive actions.
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 * @param {function} props.onConfirm
 * @param {string} [props.title='Confirm Delete']
 * @param {string} [props.message='Are you sure? This action cannot be undone.']
 * @param {string} [props.confirmText='Delete']
 * @param {boolean} [props.isLoading=false]
 */
export default function ConfirmDialog({
  isOpen, onClose, onConfirm,
  title = 'Confirm Delete',
  message = 'Are you sure? This action cannot be undone.',
  confirmText = 'Delete',
  isLoading = false
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <p className="text-sm text-surface-300 leading-relaxed">{message}</p>
        <div className="flex gap-3 w-full pt-2">
          <button type="button" onClick={onClose} disabled={isLoading} className="btn-ghost flex-1">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : null}
            {isLoading ? 'Deleting...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
