import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsTemplateDefinition } from '@/features/news-cms/templates/types';
import { clampFlyerPageCount } from '@/features/news-cms/lib/flyerPages';

interface Props {
  lang: PortalUiLanguage;
  template: NewsTemplateDefinition;
  content: Record<string, unknown>;
  templateData?: Record<string, unknown> | null;
  mode?: 'editor' | 'preview' | 'public';
}

/**
 * Renders a template and, for multi-page templates, an editor-only page
 * navigator underneath. The navigator is never part of the A4 design.
 */
export default function NewsRenderSurface({ lang, template, content, templateData, mode = 'preview' }: Props) {
  const Renderer = template.Renderer;
  const pageCount = template.pageMode === 'multiple' ? clampFlyerPageCount(content.pageCount) : 1;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <div>
      <Renderer lang={lang} content={content} templateData={templateData} mode={mode} page={page} />
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label={t('newsCmsPreviewPrevPage', lang)}
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t('newsCmsFlyerPageTitle', lang)} {page} / {pageCount}
          </span>
          <button
            type="button"
            aria-label={t('newsCmsPreviewNextPage', lang)}
            disabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
