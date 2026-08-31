import { useEffect, useState } from 'react';
import { Clock, FileCheck2, FileSignature, History, LockKeyhole, UnlockKeyhole } from 'lucide-react';

import { fetchPartnerAgreementHistory, type PartnerAgreementHistoryEvent } from '@/lib/dealerContractsService';
import { t } from '@/lib/i18n/translations';
import type { Language } from '@/types/configurator';

function formatDateTime(value: string, language: Language) {
  if (!value) return '';
  const locale = language === 'da' ? 'da-DK' : language === 'de' ? 'de-DE' : 'en-GB';
  try {
    return new Date(value).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
  return <Clock className="h-4 w-4" />;
}

export default function PartnerAgreementHistory({
  dealerAccountNumber,
  language,
}: {
  dealerAccountNumber: string;
  language: Language;
}) {
  const [events, setEvents] = useState<PartnerAgreementHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-950">{t('partnerAgreementHistoryTitle', language)}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('partnerAgreementHistoryIntro', language)}</p>
        </div>
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
          <ol className="divide-y divide-slate-100">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  {eventIcon(event)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-semibold text-slate-950">{event.event_title}</p>
                    <time className="text-xs font-medium text-slate-500">{formatDateTime(event.created_at, language)}</time>
                  </div>
                  {event.event_description && (
                    <p className="mt-1 text-sm leading-6 text-slate-600">{event.event_description}</p>
                  )}
                  {(event.created_by_name || event.created_by_email) && (
                    <p className="mt-1 text-xs text-slate-400">
                      {event.created_by_name || event.created_by_email}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
