import { type FormEvent, useEffect, useState } from 'react';
import { Clock, FileCheck2, FileSignature, History, Link as LinkIcon, LockKeyhole, Plus, UnlockKeyhole, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createPartnerAgreementHistoryEvent,
  fetchPartnerAgreementHistory,
  fetchPartnerAgreementHistoryDocumentUrl,
  type PartnerAgreementHistoryEvent,
  type PartnerAgreementHistoryEventType,
} from '@/lib/dealerContractsService';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { Language } from '@/types/configurator';

type AgreementLanguage = Language | PortalUiLanguage;
type AgreementText = Partial<Record<AgreementLanguage, string>> & { da: string; en: string };

const H: Record<string, AgreementText> = {
  addEvent: { da: 'Tilføj aftalehændelse', en: 'Add agreement event', de: 'Vertragsereignis hinzufügen', fr: 'Ajouter un événement d’accord' },
  openDocument: { da: 'Åbn dokument', en: 'Open document', de: 'Dokument öffnen', fr: 'Ouvrir le document' },
  openingDocument: { da: 'Åbner...', en: 'Opening...', de: 'Wird geöffnet...', fr: 'Ouverture...' },
  documentOpenError: { da: 'Dokumentet kunne ikke åbnes.', en: 'The document could not be opened.', de: 'Das Dokument konnte nicht geöffnet werden.', fr: 'Le document n’a pas pu être ouvert.' },
  eventType: { da: 'Type', en: 'Type', de: 'Typ', fr: 'Type' },
  eventDate: { da: 'Dato', en: 'Date', de: 'Datum', fr: 'Date' },
  eventTitle: { da: 'Kort titel', en: 'Short title', de: 'Kurzer Titel', fr: 'Titre court' },
  eventDescription: { da: 'Beskrivelse/notat', en: 'Description/note', de: 'Beschreibung/Notiz', fr: 'Description/note' },
  cancel: { da: 'Annullér', en: 'Cancel', de: 'Abbrechen', fr: 'Annuler' },
  save: { da: 'Gem', en: 'Save', de: 'Speichern', fr: 'Enregistrer' },
  saving: { da: 'Gemmer...', en: 'Saving...', de: 'Speichern...', fr: 'Enregistrement...' },
  partnerInfoReceived: { da: 'Partner-/virksomhedsoplysninger modtaget', en: 'Partner/company information received', de: 'Partner-/Unternehmensdaten erhalten', fr: 'Informations partenaire/entreprise reçues' },
  partnerApproved: { da: 'Partner godkendt', en: 'Partner approved', de: 'Partner genehmigt', fr: 'Partenaire approuvé' },
  contractReviewCompleted: { da: 'Kontrakt gennemgået', en: 'Contract reviewed', de: 'Vertrag geprüft', fr: 'Contrat examiné' },
  contractReceived: { da: 'Kontrakt underskrevet/modtaget', en: 'Contract signed/received', de: 'Vertrag unterschrieben/erhalten', fr: 'Contrat signé/reçu' },
  contractApproved: { da: 'Kontrakt godkendt', en: 'Contract approved', de: 'Vertrag genehmigt', fr: 'Contrat approuvé' },
  newAgreement: { da: 'Ny samarbejdsaftale', en: 'New cooperation agreement', de: 'Neue Kooperationsvereinbarung', fr: 'Nouvel accord de coopération' },
  collaborationPartnerAdded: { da: 'Samarbejdspartner tilføjet', en: 'Collaboration partner added', de: 'Kooperationspartner hinzugefügt', fr: 'Partenaire de collaboration ajouté' },
  partnerRelationChanged: { da: 'Partnerrelation ændret', en: 'Partner relation changed', de: 'Partnerbeziehung geändert', fr: 'Relation partenaire modifiée' },
  servicePartnerAdded: { da: 'Servicepartner tilføjet', en: 'Service partner added', de: 'Servicepartner hinzugefügt', fr: 'Partenaire service ajouté' },
  dealerCustomerAdded: { da: 'Forhandlerkunde tilføjet', en: 'Dealer customer added', de: 'Händlerkunde hinzugefügt', fr: 'Client revendeur ajouté' },
  cooperationEnded: { da: 'Samarbejde ophørt', en: 'Cooperation ended', de: 'Zusammenarbeit beendet', fr: 'Coopération terminée' },
};

const EVENT_OPTIONS: Array<{ type: PartnerAgreementHistoryEventType; labelKey: keyof typeof H }> = [
  { type: 'partner_info_received', labelKey: 'partnerInfoReceived' },
  { type: 'partner_approved', labelKey: 'partnerApproved' },
  { type: 'contract_review_completed', labelKey: 'contractReviewCompleted' },
  { type: 'contract_received', labelKey: 'contractReceived' },
  { type: 'contract_approved', labelKey: 'contractApproved' },
  { type: 'new_agreement', labelKey: 'newAgreement' },
  { type: 'collaboration_partner_added', labelKey: 'collaborationPartnerAdded' },
  { type: 'partner_relation_changed', labelKey: 'partnerRelationChanged' },
  { type: 'service_partner_added', labelKey: 'servicePartnerAdded' },
  { type: 'dealer_customer_added', labelKey: 'dealerCustomerAdded' },
  { type: 'cooperation_ended', labelKey: 'cooperationEnded' },
];

function ht(key: keyof typeof H, language: AgreementLanguage) {
  return H[key][language] ?? H[key].en ?? H[key].da;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string, language: AgreementLanguage) {
  if (!value) return '';
  const locale =
    language === 'da' ? 'da-DK'
      : language === 'de' ? 'de-DE'
        : language === 'fr' ? 'fr-FR'
          : language === 'it' ? 'it-IT'
            : language === 'hu' ? 'hu-HU'
              : language === 'sv' ? 'sv-SE'
                : language === 'pl' ? 'pl-PL'
                  : language === 'cs' ? 'cs-CZ'
                    : 'en-GB';
  try {
    return new Date(value).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function eventIcon(event: PartnerAgreementHistoryEvent) {
  if (event.event_type === 'contract_access_activated') return <UnlockKeyhole className="h-4 w-4" />;
  if (event.event_type === 'contract_access_revoked') return <LockKeyhole className="h-4 w-4" />;
  if (event.event_type === 'contract_received') return <FileSignature className="h-4 w-4" />;
  if (event.event_type === 'contract_approved') return <FileCheck2 className="h-4 w-4" />;
  if (event.event_type === 'collaboration_partner_added' || event.event_type === 'service_partner_added' || event.event_type === 'dealer_customer_added') {
    return <Users className="h-4 w-4" />;
  }
  return <Clock className="h-4 w-4" />;
}

export default function PartnerAgreementHistory({
  dealerAccountId,
  dealerAccountNumber,
  language,
  canManage = false,
  compact = false,
}: {
  dealerAccountId?: string | null;
  dealerAccountNumber: string;
  language: AgreementLanguage;
  canManage?: boolean;
  compact?: boolean;
}) {
  const [events, setEvents] = useState<PartnerAgreementHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [eventType, setEventType] = useState<PartnerAgreementHistoryEventType>('partner_info_received');
  const [eventDate, setEventDate] = useState(todayInputValue());
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPartnerAgreementHistory(dealerAccountNumber).then(({ rows, error: loadError }) => {
      if (cancelled) return;
      setEvents(rows);
      setError(loadError);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [dealerAccountNumber]);

  async function reloadHistory() {
    setLoading(true);
    setError(null);
    const { rows, error: loadError } = await fetchPartnerAgreementHistory(dealerAccountNumber);
    setEvents(rows);
    setError(loadError);
    setLoading(false);
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealerAccountId || !eventTitle.trim()) return;
    setSaving(true);
    const occurredAt = eventDate ? new Date(`${eventDate}T12:00:00`).toISOString() : null;
    const { error: createError } = await createPartnerAgreementHistoryEvent({
      dealerAccountId,
      eventType,
      eventTitle: eventTitle.trim(),
      eventDescription: eventDescription.trim() || null,
      occurredAt,
    });
    setSaving(false);
    if (createError) {
      toast.error(createError);
      return;
    }
    setShowCreateDialog(false);
    setEventType('partner_info_received');
    setEventDate(todayInputValue());
    setEventTitle('');
    setEventDescription('');
    await reloadHistory();
  }

  async function openDocument(event: PartnerAgreementHistoryEvent) {
    setOpeningDocumentId(event.id);
    const signedUrl = await fetchPartnerAgreementHistoryDocumentUrl(event);
    setOpeningDocumentId(null);
    if (!signedUrl) {
      toast.error(ht('documentOpenError', language));
      return;
    }
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className={compact ? "rounded-lg border border-slate-200 bg-white p-4" : "border-t border-slate-200 pt-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <History className={compact ? "h-4 w-4" : "h-5 w-5"} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-950">{t('partnerAgreementHistoryTitle', language as PortalUiLanguage)}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('partnerAgreementHistoryIntro', language as PortalUiLanguage)}</p>
          </div>
        </div>
        {canManage && dealerAccountId && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateDialog(true)} className="h-8 rounded-md">
            <Plus className="h-4 w-4" />
            {ht('addEvent', language)}
          </Button>
        )}
      </div>

      <div className="mt-5">
        {loading && <p className="text-sm text-slate-500">{t('partnerAgreementHistoryLoading', language as PortalUiLanguage)}</p>}
        {!loading && error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('partnerAgreementHistoryError', language as PortalUiLanguage)}
          </p>
        )}
        {!loading && !error && events.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {t('partnerAgreementHistoryEmpty', language as PortalUiLanguage)}
          </p>
        )}
        {!loading && !error && events.length > 0 && (
          <ol className="divide-y divide-slate-100 border-y border-slate-100">
            {events.map((event) => (
              <li key={event.id} className={compact ? "py-3" : "grid grid-cols-1 gap-3 py-3 sm:grid-cols-[120px_minmax(0,1fr)]"}>
                <time className="text-sm font-semibold text-slate-500">{formatDate(event.occurred_at || event.created_at, language)}</time>
                <div className={compact ? "mt-2 min-w-0" : "min-w-0 border-l border-slate-200 pl-4"}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      {eventIcon(event)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-950">{event.event_title}</p>
                      {event.event_description && (
                        <p className={compact ? "mt-1 text-sm leading-5 text-slate-600" : "mt-1 text-sm leading-6 text-slate-600"}>{event.event_description}</p>
                      )}
                      {(event.created_by_name || event.created_by_email) && (
                        <p className="mt-1 text-xs text-slate-400">
                          {event.created_by_name || event.created_by_email}
                        </p>
                      )}
                      {event.document_bucket && event.document_path && (
                        <button
                          type="button"
                          onClick={() => openDocument(event)}
                          disabled={openingDocumentId === event.id}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline disabled:text-slate-400"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          {openingDocumentId === event.id ? ht('openingDocument', language) : ht('openDocument', language)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ht('addEvent', language)}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateEvent}>
            <label className="block text-sm font-semibold text-slate-700">
              {ht('eventType', language)}
              <select
                value={eventType}
                onChange={(event) => setEventType(event.target.value as PartnerAgreementHistoryEventType)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {EVENT_OPTIONS.map((option) => (
                  <option key={option.type} value={option.type}>{ht(option.labelKey, language)}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              {ht('eventDate', language)}
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              {ht('eventTitle', language)}
              <input
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                required
                maxLength={120}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              {ht('eventDescription', language)}
              <textarea
                value={eventDescription}
                onChange={(event) => setEventDescription(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>{ht('cancel', language)}</Button>
              <Button type="submit" disabled={saving || !eventTitle.trim()}>{saving ? ht('saving', language) : ht('save', language)}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
