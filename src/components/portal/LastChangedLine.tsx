// Compact "Senest ændret: 06-06-26 · 09:32 · Note" line for module/subcategory pages.
// Reads from the shared portal changelog system. Renders nothing when no
// visible change exists for the module (respects role/language filtering).

import { useEffect } from 'react';
import { Clock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useChangelog, formatChangedAt, t, ModuleKey } from '@/lib/portalChangelog';

interface Props {
  moduleKey: ModuleKey;
  /** Mark the module's entries as read for this user when the line mounts. Defaults to true. */
  markReadOnMount?: boolean;
  className?: string;
}

export default function LastChangedLine({ moduleKey, markReadOnMount = true, className }: Props) {
  const { appUser } = useAppUser();
  const { language: lang, uiLanguage } = useLanguage();
  const { latestForModule, markModuleRead } = useChangelog(appUser, uiLanguage);
  const entry = latestForModule(moduleKey);

  useEffect(() => {
    if (markReadOnMount && entry) markModuleRead(moduleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey, entry?.id, markReadOnMount]);

  if (!entry) return null;

  const note = entry.note?.[uiLanguage] || entry.note?.[lang] || entry.note?.en;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 text-xs text-gray-500',
        className,
      )}
    >
      <Clock className="h-3.5 w-3.5 text-gray-400" />
      <span className="font-medium text-gray-600">{t('lastChanged', uiLanguage)}:</span>
      <span className="tabular-nums">{formatChangedAt(entry.changed_at)}</span>
      {note && (
        <>
          <span className="text-gray-300">·</span>
          <span className="text-gray-700">{note}</span>
        </>
      )}
      {entry.is_major && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 px-1.5 py-0.5 text-[10px] font-bold uppercase">
          <Star className="h-3 w-3" />
          {t('important', uiLanguage)}
        </span>
      )}
    </div>
  );
}
