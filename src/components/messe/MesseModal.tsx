import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  /** Tailwind max-width class for the panel. */
  widthClass?: string;
}

/**
 * Lightweight, reusable modal shell for the Messe section.
 * Matches the existing Timan portal styling (rounded-2xl, white panel,
 * slate typography) — no new design system.
 */
export default function MesseModal({
  open,
  onClose,
  title,
  closeLabel,
  children,
  widthClass = 'max-w-3xl',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${widthClass} max-h-[92vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 sm:px-7 py-5">{children}</div>
      </div>
    </div>
  );
}
