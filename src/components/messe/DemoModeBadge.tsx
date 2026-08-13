import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';

export default function DemoModeBadge({ className = '' }: { className?: string }) {
  const { uiLanguage } = useLanguage();

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ${className}`}
      title={t('messeDemoModeTitle', uiLanguage)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {t('messeDemoMode', uiLanguage)}
    </span>
  );
}
