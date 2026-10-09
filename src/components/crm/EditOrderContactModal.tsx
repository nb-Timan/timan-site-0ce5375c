/**
 * Backend-only administrative contact editor for an already submitted order.
 * It uses the same Configurator state snapshot as the original order and has
 * no controls for commercial, ownership, or send-history values.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadSubmittedOrderContactDetails,
  SubmittedOrderContactDetails,
  updateSubmittedOrderContactDetails,
} from '@/lib/configurationsService';
import { CrmConfigurationRow } from '@/lib/crmConfigurationsService';

interface Props {
  row: CrmConfigurationRow;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const fieldClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500';

export default function EditOrderContactModal({ row, canEdit, onClose, onSaved }: Props) {
  const [details, setDetails] = useState<SubmittedOrderContactDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const result = await loadSubmittedOrderContactDetails(row.id);
      if (cancelled) return;
      setDetails(result.details);
      setError(result.error);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [row.id]);

  const setField = (key: keyof SubmittedOrderContactDetails, value: string) => {
    setDetails((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!canEdit || !details) return;
    setSaving(true);
    const result = await updateSubmittedOrderContactDetails(row.id, details);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error || 'Kunne ikke gemme ordreoplysningerne.');
      return;
    }
    toast.success('Ordreoplysningerne er gemt.');
    onSaved();
    onClose();
  };

  const orderNumber = row.order_number || row.quote_number || row.id.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Redigér ordre {orderNumber}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Kun kontakt- og administrative ordreoplysninger.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Luk">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
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
              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Kontaktoplysninger</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-700">Firma *
                    <input value={details.firmanavn} onChange={(e) => setField('firmanavn', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">Kontaktperson *
                    <input value={details.kontaktperson} onChange={(e) => setField('kontaktperson', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">Telefon
                    <input value={details.telefon} onChange={(e) => setField('telefon', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">E-mail *
                    <input type="email" value={details.email} onChange={(e) => setField('email', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700 sm:col-span-2">Adresse
                    <input value={details.address} onChange={(e) => setField('address', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">Postnr.
                    <input value={details.postalCode} onChange={(e) => setField('postalCode', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">By
                    <input value={details.city} onChange={(e) => setField('city', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700 sm:col-span-2">Land
                    <input value={details.country} onChange={(e) => setField('country', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                </div>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Ordreoplysninger</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-700 sm:col-span-2">Kommentar
                    <textarea value={details.comment} onChange={(e) => setField('comment', e.target.value)} disabled={!canEdit} rows={3} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700 sm:col-span-2">Alternativ leveringsadresse
                    <input value={details.alternativeDeliveryAddress} onChange={(e) => setField('alternativeDeliveryAddress', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">Rekvisitionsnr. / PO nr.
                    <input value={details.purchaseOrderNumber} onChange={(e) => setField('purchaseOrderNumber', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">Ønsket leveringsdato
                    <input type="date" value={details.date} onChange={(e) => setField('date', e.target.value)} disabled={!canEdit} className={fieldClass} />
                  </label>
                </div>
              </section>

              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                Redigeringen ændrer ikke maskiner, linjer, antal, priser, rabatter, betalingsbetingelser, sælger, forhandler, ordrestatus eller afsendelseshistorik. Den sender heller ikke en ny e-mail.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white">Annullér</button>
          <button onClick={save} disabled={!canEdit || !details || loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#2d5a27] px-4 py-2 text-sm font-medium text-white hover:bg-[#244a20] disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Gem ændringer
          </button>
        </div>
      </div>
    </div>
  );
}
