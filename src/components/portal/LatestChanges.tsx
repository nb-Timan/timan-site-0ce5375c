import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Language } from '@/types/configurator';
import { useChangelog, relativeAge, ChangeLogEntry } from '@/lib/portalChangelog';
import { useAppUser } from '@/context/AppUserContext';
import { PortalAreaId } from '@/lib/portalAreas';

const T: Record<string, Record<Language, string>> = {
  heading: {
    da: 'Hvad er nyt?',
    en: 'What\u2019s new?',
    de: 'Was ist neu?',
    it: 'Cosa c\u2019è di nuovo?',
    hu: 'Mi az új?',
  },
  subheading: {
    da: 'Seneste ændringer i portalen',
    en: 'Latest changes in the portal',
    de: 'Letzte Änderungen im Portal',
    it: 'Ultime modifiche nel portale',
    hu: 'Legutóbbi változások a portálon',
  },
  empty: {
    da: 'Ingen ændringer endnu.',
    en: 'No changes yet.',
    de: 'Noch keine Änderungen.',
    it: 'Ancora nessuna modifica.',
    hu: 'Még nincsenek változások.',
  },
  tagNy: { da: 'Ny', en: 'New', de: 'Neu', it: 'Nuovo', hu: 'Új' },
  tagOpdateret: { da: 'Opdateret', en: 'Updated', de: 'Aktualisiert', it: 'Aggiornato', hu: 'Frissítve' },
};

const AREA_ROUTE: Record<PortalAreaId, string> = {
  teknik_service: '/portal/teknik-service',
  salg_marketing: '/portal/salg-marketing',
  timan_crm: '/portal/crm',
  timan_backend: '/portal/backend',
  dealer_data: '/portal/dealer-data',
};

interface Props {
  language: Language;
  /** How many entries to display. Default 6. */
  limit?: number;
}

export default function LatestChanges({ language, limit = 6 }: Props) {
  const { appUser } = useAppUser();
  const navigate = useNavigate();
  const { entries, isRead, markEntryRead } = useChangelog(appUser, language);

  const shown = entries.slice(0, limit);

  const handleClick = (entry: ChangeLogEntry) => {
    markEntryRead(entry.id);
    const target = entry.href || (entry.areaId ? AREA_ROUTE[entry.areaId] : null);
    if (target) navigate(target);
  };

  const tagLabel = (entry: ChangeLogEntry) =>
    entry.tag === 'ny' ? T.tagNy[language] : T.tagOpdateret[language];

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-[#2d5a27]" />
        <div>
          <h2 className="text-xl font-bold text-gray-900 leading-tight">{T.heading[language]}</h2>
          <p className="text-xs text-gray-500">{T.subheading[language]}</p>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500">
          {T.empty[language]}
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shown.map(entry => {
            const read = isRead(entry.id);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => handleClick(entry)}
                  className={cn(
                    'w-full text-left rounded-xl border p-4 transition-all',
                    read
                      ? 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                      : 'bg-white border-[#2d5a27]/20 shadow-sm hover:shadow-md hover:-translate-y-0.5',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        read
                          ? 'bg-gray-200 text-gray-500'
                          : entry.tag === 'ny'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800',
                      )}
                    >
                      {tagLabel(entry)}
                    </span>
                    <span className={cn('text-[11px]', read ? 'text-gray-400' : 'text-gray-500')}>
                      {relativeAge(entry.publishedAt, language)}
                    </span>
                  </div>
                  <div className={cn('text-sm font-semibold', read ? 'text-gray-600' : 'text-gray-900')}>
                    {entry.title[language] || entry.title.en}
                  </div>
                  {entry.body && (
                    <p className={cn('text-xs mt-1', read ? 'text-gray-400' : 'text-gray-600')}>
                      {entry.body[language] || entry.body.en}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
