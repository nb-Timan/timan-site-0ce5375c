import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsTemplateDefinition } from '@/features/news-cms/templates/types';

interface Props {
  lang: PortalUiLanguage;
  template: NewsTemplateDefinition;
  content: Record<string, unknown>;
}

export default function NewsPreviewPane({ lang, template, content }: Props) {
  const Renderer = template.Renderer;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t('newsCmsPreview', lang)}</h2>
          <p className="text-xs text-slate-500">{t(template.nameKey, lang)}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">A4 landscape</span>
      </div>
      <Renderer lang={lang} content={content} mode="preview" />
    </section>
  );
}
