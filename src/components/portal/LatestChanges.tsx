import { useNavigate } from 'react-router-dom';
import { Sparkles, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useChangelog,
  formatChangedDate,
  hrefForEntry,
  areaForModule,
  isStillNew,
  ChangeLogEntry,
} from '@/lib/portalChangelog';
import { useAppUser } from '@/context/AppUserContext';
import { PortalAreaId } from '@/lib/portalAreas';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { portalLanguageLookupOrder } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';

const AREA_ROUTE: Record<PortalAreaId, string> = {
  teknik_service: '/portal/teknik-service',
  salg_marketing: '/portal/salg-marketing',
  marketing: '/portal/salg-marketing',
  timan_crm: '/portal/crm',
  timan_backend: '/portal/backend',
  dealer_data: '/portal/dealer-data',
};

interface Props {
  language: PortalUiLanguage;
  /** Max rows to display. Default 5. */
  limit?: number;
}

function pickLocalizedRecord(values: Partial<Record<string, string>>, language: PortalUiLanguage): string {
  for (const key of portalLanguageLookupOrder(language, true)) {
    const value = values[key];
    if (value) return value;
  }

  return Object.values(values).find(Boolean) || '';
}

export default function LatestChanges({ language, limit = 5 }: Props) {
  const { appUser } = useAppUser();
  const navigate = useNavigate();
  const { entries, isRead, markEntryRead } = useChangelog(appUser, language);

  const shown = entries.slice(0, limit);

  const handleClick = (entry: ChangeLogEntry) => {
    markEntryRead(entry.id);
    const area = areaForModule(entry.module_key);
    const target = hrefForEntry(entry) || (area ? AREA_ROUTE[area] : null);
    if (target) navigate(target);
  };

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-[#2d5a27]" />
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">{t('portalWhatsNewHeading', language)}</h2>
          <p className="text-xs text-gray-500">{t('portalLatestChangesLabel', language)}</p>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
          {t('portalLatestChangesEmpty', language)}
        </div>
      ) : (
        <ul className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-100 overflow-hidden">
          {shown.map(entry => {
            const read = isRead(entry.id);
            const showNew = !read && isStillNew(entry);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => handleClick(entry)}
                  className={cn(
                    'w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                    read ? 'text-gray-500 hover:bg-gray-50' : 'text-gray-900 hover:bg-gray-50',
                  )}
                >
                  <span className={cn('font-mono text-xs tabular-nums shrink-0', read ? 'text-gray-400' : 'text-gray-500')}>
                    {formatChangedDate(entry.changed_at)}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className={cn('font-semibold shrink-0', read ? 'text-gray-500' : 'text-[#2d5a27]')}>
                    {pickLocalizedRecord(entry.module_name, language)}:
                  </span>
                  <span className="truncate">{pickLocalizedRecord(entry.title, language)}</span>
                  <span className="flex items-center gap-1.5 ml-auto shrink-0">
                    {showNew && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold uppercase">
                        {t('portalNewTag', language)}
                      </span>
                    )}
                    {entry.is_major && (
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        read ? 'bg-gray-200 text-gray-500' : 'bg-rose-100 text-rose-700',
                      )}>
                        <Star className="h-3 w-3" />
                        {t('portalImportantTag', language)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
