import { CheckCircle2 } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { NEWS_TEMPLATE_REGISTRY } from '@/features/news-cms/templates/registry';
import type { NewsTemplateId } from '@/features/news-cms/templates/types';

interface Props {
  lang: PortalUiLanguage;
  selectedId: NewsTemplateId;
  onSelect: (id: NewsTemplateId) => void;
  compact?: boolean;
}

export default function NewsTemplatePicker({ lang, selectedId, onSelect, compact = false }: Props) {
  return (
    <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'}>
      {NEWS_TEMPLATE_REGISTRY.filter((template) => template.availableInPicker !== false).map((template) => {
        const selected = template.id === selectedId;
        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template.id)}
            className={`rounded-xl border text-left transition ${compact ? 'p-3' : 'p-4'} ${
              selected ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Template {template.number}</span>
              {selected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            </div>
            <h3 className={`${compact ? 'mt-2 text-sm' : 'mt-3 text-base'} font-bold text-slate-900`}>{t(template.nameKey, lang)}</h3>
            <p className="mt-1 text-sm text-slate-500">{t(template.purposeKey, lang)}</p>
          </button>
        );
      })}
    </div>
  );
}
