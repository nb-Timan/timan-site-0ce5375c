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
import type { Language } from '@/types/configurator';

const EVENT_OPTIONS: Array<{ type: PartnerAgreementHistoryEventType; label: string }> = [
  { type: 'partner_info_received', label: 'Partner-/virksomhedsoplysninger modtaget' },
  { type: 'partner_approved', label: 'Partner godkendt' },
  { type: 'contract_review_completed', label: 'Kontrakt gennemgået' },
  { type: 'contract_received', label: 'Kontrakt underskrevet/modtaget' },
  { type: 'contract_approved', label: 'Kontrakt godkendt' },
  { type: 'new_agreement', label: 'Ny samarbejdsaftale' },
  { type: 'collaboration_partner_added', label: 'Samarbejdspartner tilføjet' },
  { type: 'partner_relation_changed', label: 'Partnerrelation ændret' },
  { type: 'service_partner_added', label: 'Servicepartner tilføjet' },
  { type: 'dealer_customer_added', label: 'Forhandlerkunde tilføjet' },
  { type: 'cooperation_ended', label: 'Samarbejde ophørt' },
];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string, language: Language) {
  if (!value) return '';
  const locale = language === 'da' ? 'da-DK' : language === 'de' ? 'de-DE' : 'en-GB';
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
}: {
  dealerAccountId?: string | null;
  dealerAccountNumber: string;
  language: Language;
  canManage?: boolean;
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
      toast.error('Dokumentet kunne ikke åbnes.');
      return;
    }
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-950">{t('partnerAgreementHistoryTitle', language)}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('partnerAgreementHistoryIntro', language)}</p>
          </div>
        </div>
        {canManage && dealerAccountId && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateDialog(true)} className="h-8 rounded-md">
            <Plus className="h-4 w-4" />
            Tilføj aftalehændelse
          </Button>
        )}
      </div>

      <div className="mt-5">
        {loading && <p className="text-sm text-slate-500">{t('partnerAgreementHistoryLoading', language)}</p>}
        {!loading && error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('partnerAgreementHistoryError', language)}
          </p>
        )}
        {!loading && !error && events.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {t('partnerAgreementHistoryEmpty', language)}
          </p>
        )}
        {!loading && !error && events.length > 0 && (
          <ol className="divide-y divide-slate-100 border-y border-slate-100">
            {events.map((event) => (
              <li key={event.id} className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                <time className="text-sm font-semibold text-slate-500">{formatDate(event.occurred_at || event.created_at, language)}</time>
                <div className="min-w-0 border-l border-slate-200 pl-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      {eventIcon(event)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-950">{event.event_title}</p>
                      {event.event_description && (
                        <p className="mt-1 text-sm leading-6 text-slate-600">{event.event_description}</p>
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
                          {openingDocumentId === event.id ? 'Åbner...' : 'Åbn dokument'}
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
            <DialogTitle>Tilføj aftalehændelse</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateEvent}>
            <label className="block text-sm font-semibold text-slate-700">
              Type
              <select
                value={eventType}
                onChange={(event) => setEventType(event.target.value as PartnerAgreementHistoryEventType)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {EVENT_OPTIONS.map((option) => (
                  <option key={option.type} value={option.type}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Dato
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Kort titel
              <input
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                required
                maxLength={120}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Beskrivelse/notat
              <textarea
                value={eventDescription}
                onChange={(event) => setEventDescription(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Annullér</Button>
              <Button type="submit" disabled={saving || !eventTitle.trim()}>{saving ? 'Gemmer...' : 'Gem'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
