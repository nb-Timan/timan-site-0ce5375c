import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadSubmittedOrderTimelineDetails,
  type SubmittedOrderTimelineDetails,
  updateSubmittedOrderTimelineDetails,
} from '@/lib/configurationsService';
import type { CrmConfigurationRow } from '@/lib/crmConfigurationsService';

interface Props {
  row: CrmConfigurationRow;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const fieldClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500';

export default function EditOrderTimelineModal({ row, canEdit, onClose, onSaved }: Props) {
  const [details, setDetails] = useState<SubmittedOrderTimelineDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await loadSubmittedOrderTimelineDetails(row.id);
      if (cancelled) return;
      setDetails(result.details);
      setError(result.error);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [row.id]);

  const save = async () => {
    if (!canEdit || !details) return;
    setSaving(true);
    const result = await updateSubmittedOrderTimelineDetails(row.id, details);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error || 'Kunne ikke gemme ordredatoerne.');
      return;
    }
    toast.success('Ordredatoerne er gemt.');
    onSaved();
    onClose();
  };

  const orderNumber = row.order_number || row.quote_number || row.id.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Redigér ordredatoer {orderNumber}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Kun Backend. Ændringer gemmes med revisionsspor.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Luk">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!canEdit && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>Din aktuelle portalrolle kan ikke redigere denne ordre.</div>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
            </div>
          ) : details && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-700">Oprettet
                  <input type="date" value={details.createdDate} onChange={(event) => setDetails((current) => current ? { ...current, createdDate: event.target.value } : current)} disabled={!canEdit} className={fieldClass} />
                </label>
                <label className="block text-xs font-medium text-slate-700">Sendt
                  <input type="date" value={details.sentDate} onChange={(event) => setDetails((current) => current ? { ...current, sentDate: event.target.value } : current)} disabled={!canEdit} className={fieldClass} />
                </label>
              </div>
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                Ændringen påvirker ikke forventet levering, maskiner, linjer, priser, rabatter, betalingsbetingelser, kunde, sælger, forhandler, ordrestatus eller afsendelse. Budgettet bruger fortsat forventet leveringsdato først.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white">Annullér</button>
          <button onClick={save} disabled={!canEdit || !details || loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#2d5a27] px-4 py-2 text-sm font-medium text-white hover:bg-[#244a20] disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Gem datoer
          </button>
        </div>
      </div>
    </div>
  );
}
