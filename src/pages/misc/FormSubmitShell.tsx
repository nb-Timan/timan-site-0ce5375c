import { ReactNode, useState, FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useDealerScope } from '@/lib/dealerScope';
import MiscPageShell from './MiscPageShell';
import { Language } from '@/types/configurator';
import {
  PortalFormType,
  submitPortalForm,
  PortalFormSubmission,
} from '@/lib/portalFormsService';

const T: Record<string, Record<Language, string>> = {
  submit:  { da: 'Indsend',     en: 'Submit',     de: 'Absenden',    it: 'Invia',      hu: 'Beküldés' },
  sending: { da: 'Indsender…',  en: 'Submitting…',de: 'Wird gesendet…', it: 'Invio in corso…', hu: 'Beküldés…' },
  thanks:  { da: 'Tak — din indsendelse er modtaget.', en: 'Thanks — your submission has been received.', de: 'Danke — Ihre Einsendung wurde empfangen.', it: 'Grazie — il tuo invio è stato ricevuto.', hu: 'Köszönjük — beküldését megkaptuk.' },
  ref:     { da: 'Reference:',  en: 'Reference:', de: 'Referenz:',   it: 'Riferimento:', hu: 'Hivatkozás:' },
  newOne:  { da: 'Send en ny',  en: 'Submit another', de: 'Weitere einreichen', it: 'Invia un altro', hu: 'Új beküldés' },
  back:    { da: 'Tilbage til formularer', en: 'Back to forms', de: 'Zurück zu Formularen', it: 'Torna ai moduli', hu: 'Vissza az űrlapokhoz' },
  error:   { da: 'Kunne ikke indsende formularen.', en: 'Could not submit the form.', de: 'Formular konnte nicht gesendet werden.', it: 'Impossibile inviare il modulo.', hu: 'Az űrlap nem küldhető be.' },
  dealerWarn: { da: 'Du er ikke koblet til en forhandler. Indsendelsen kræver dealer-tilknytning.', en: 'You are not linked to a dealer. This submission requires dealer linkage.', de: 'Sie sind nicht mit einem Händler verknüpft. Diese Einreichung erfordert eine Händlerzuordnung.', it: 'Non sei collegato a un rivenditore. L\'invio richiede il collegamento al rivenditore.', hu: 'Nincs kereskedőhöz rendelve. A beküldéshez kereskedői kapcsolat szükséges.' },
};

interface Props {
  formType: PortalFormType;
  title: string;
  intro?: string;
  /** Whether this form requires the user to be linked to a dealer (account_number). */
  requireDealer: boolean;
  /** Build the payload object that will be stored as jsonb. */
  buildPayload: () => Record<string, unknown> | null;
  /** Reset internal form state after a successful submission. */
  onReset?: () => void;
  /** Inputs / fields. */
  children: ReactNode;
}

export default function FormSubmitShell({
  formType,
  title,
  intro,
  requireDealer,
  buildPayload,
  onReset,
  children,
}: Props) {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PortalFormSubmission | null>(null);

  const dealerNumber = appUser?.dealer_number ?? null;
  const dealerName = appUser?.company_dealer ?? null;
  const missingDealer = requireDealer && !dealerNumber;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const payload = buildPayload();
    if (!payload) return; // validation handled by child fields
    setSubmitting(true);
    try {
      const row = await submitPortalForm({
        form_type: formType,
        dealer_account_number: dealerNumber,
        dealer_name: dealerName,
        payload,
      });
      setReceipt(row);
      onReset?.();
    } catch (err) {
      console.error('[portal-forms] submit failed', err);
      toast.error(T.error[lang] + ' ' + (err instanceof Error ? err.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MiscPageShell title={title} intro={intro} backTo="/portal/misc/forms">
      <div className="max-w-3xl">
        {receipt ? (
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-7 w-7 text-[#2d5a27]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{T.thanks[lang]}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {T.ref[lang]} <span className="font-mono">{receipt.id.slice(0, 8)}</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(receipt.created_at).toLocaleString(lang === 'da' ? 'da-DK' : undefined)}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="px-4 py-2 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244a20]"
              >
                {T.newOne[lang]}
              </button>
              <button
                type="button"
                onClick={() => navigate('/portal/misc/forms')}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
              >
                {T.back[lang]}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-6"
          >
            {dealerNumber && (
              <div className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{dealerName ?? dealerNumber}</span>
                {dealerName && <span className="ml-2">({dealerNumber})</span>}
              </div>
            )}
            {missingDealer && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
                {T.dealerWarn[lang]}
              </div>
            )}

            {children}

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || missingDealer}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244a20] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? T.sending[lang] : T.submit[lang]}
              </button>
            </div>
          </form>
        )}
      </div>
    </MiscPageShell>
  );
}

// Convenience text-field building blocks reused by form pages.
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-800 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]';
export const textareaCls = inputCls + ' min-h-[120px]';
