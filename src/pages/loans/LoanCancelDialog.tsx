import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cancelLoanDraft } from '@/lib/loanService';

export interface LoanCancellationTarget {
  id: string;
  loan_number: string;
  updated_at: string;
}

export default function LoanCancelDialog({ target, label, onClose, onCancelled }: {
  target: LoanCancellationTarget | null;
  label: (key: string) => string;
  onClose: () => void;
  onCancelled: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const requestId = useRef('');
  const attempt = useRef<{ reason: string; requestId: string } | null>(null);
  useEffect(() => {
    setReason(''); setError('');
    requestId.current = crypto.randomUUID();
    attempt.current = null;
  }, [target?.id]);

  const confirm = async () => {
    if (!target || saving.current) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500) { setError(label('loansDeleteReasonRequired')); return; }
    if (attempt.current && attempt.current.reason !== trimmed) {
      setError(label('loansDeleteRetrySameReason'));
      return;
    }
    const input = attempt.current ?? { reason: trimmed, requestId: requestId.current };
    attempt.current = input;
    saving.current = true; setBusy(true); setError('');
    try {
      await cancelLoanDraft(target.id, target.updated_at, input.reason, input.requestId);
      await onCancelled();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : label('loansLoadError'));
    } finally { saving.current = false; setBusy(false); }
  };

  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-md overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{label('loansDeleteTitle').replace('{number}', target?.loan_number ?? '')}</DialogTitle>
        <DialogDescription>{label('loansDeleteDescription')}</DialogDescription>
      </DialogHeader>
      <label className="block text-sm font-medium text-slate-700">
        <span className="mb-1 block">{label('loansDeleteReason')}</span>
        <textarea aria-label={label('loansDeleteReason')} aria-invalid={Boolean(error)} value={reason} maxLength={500}
          onChange={(event) => { setReason(event.target.value); setError(''); }} disabled={busy}
          className={`min-h-24 w-full rounded-md border px-3 py-2 text-sm ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-md border border-slate-300 px-3 text-sm">{label('cancel')}</button>
        <button type="button" onClick={() => void confirm()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-medium text-white disabled:opacity-50"><Trash2 className="h-4 w-4" />{label('loansDelete')}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
