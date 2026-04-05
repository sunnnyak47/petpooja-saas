import { Loader } from 'lucide-react';

/**
 * A simple, centered loading spinner.
 * @param {object} props
 * @param {string} [props.text='Loading...']
 */
export default function LoadingSpinner({ text = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader className="w-8 h-8 text-brand-400 animate-spin" />
      <span className="text-sm text-surface-400">{text}</span>
    </div>
  );
}
