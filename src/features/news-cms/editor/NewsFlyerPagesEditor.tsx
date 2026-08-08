import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFlyerPage } from '@/features/news-cms/templates/types';
import {
  FLYER_BODY_MAX,
  FLYER_HEADLINE_MAX,
  FLYER_SUBTITLE_MAX,
  normalizeFlyerPages,
} from '@/features/news-cms/lib/flyerPages';

interface Props {
  lang: PortalUiLanguage;
  value: unknown;
  pageCount: number;
  onChange: (pages: NewsFlyerPage[]) => void;
}

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <p className={`mt-1 text-right text-xs font-semibold tabular-nums ${length >= max ? 'text-rose-600' : 'text-slate-400'}`}>
      {length}/{max}
    </p>
  );
}

export default function NewsFlyerPagesEditor({ lang, value, pageCount, onChange }: Props) {
  const pages = normalizeFlyerPages(value, pageCount);
  const [openIndex, setOpenIndex] = useState(0);
  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

  const update = (index: number, patch: Partial<NewsFlyerPage>) => {
    onChange(pages.map((page, current) => (current === index ? { ...page, ...patch } : page)));
  };

  return (
    <div className="space-y-3">
      {pages.map((page, index) => {
        const open = openIndex === index;
        return (
          <div key={index} className="overflow-hidden rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? -1 : index)}
              className="flex w-full items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {t('newsCmsFlyerPageTitle', lang)} {index + 1}
              </span>
              <span className="truncate text-xs text-slate-400">{page.headline}</span>
            </button>
            {open && (
              <div className="space-y-3 p-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t('newsCmsFieldHeadline', lang)}
                    {index === 0 && <span className="ml-1 text-rose-500">*</span>}
                  </span>
                  <input
                    className={inputClass}
                    value={page.headline}
                    maxLength={FLYER_HEADLINE_MAX}
                    onChange={(event) => update(index, { headline: event.target.value })}
                  />
                  <Counter length={page.headline.length} max={FLYER_HEADLINE_MAX} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsFieldSubtitle', lang)}</span>
                  <input
                    className={inputClass}
                    value={page.subtitle}
                    maxLength={FLYER_SUBTITLE_MAX}
                    onChange={(event) => update(index, { subtitle: event.target.value })}
                  />
                  <Counter length={page.subtitle.length} max={FLYER_SUBTITLE_MAX} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsFieldBody', lang)}</span>
                  <textarea
                    rows={4}
                    className={inputClass}
                    value={page.body}
                    maxLength={FLYER_BODY_MAX}
                    onChange={(event) => update(index, { body: event.target.value })}
                  />
                  <Counter length={page.body.length} max={FLYER_BODY_MAX} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsFlyerImage', lang)}</span>
                  <input
                    className={inputClass}
                    value={page.image}
                    placeholder={t('newsCmsStoragePlaceholder', lang)}
                    onChange={(event) => update(index, { image: event.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
