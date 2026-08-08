import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFieldDefinition } from '@/features/news-cms/templates/types';
import NewsFeatureBlocksEditor from './NewsFeatureBlocksEditor';
import NewsCtaLinksEditor from './NewsCtaLinksEditor';
import NewsTechBlocksEditor from './NewsTechBlocksEditor';
import NewsSpecRowsEditor from './NewsSpecRowsEditor';
import NewsFlyerPagesEditor from './NewsFlyerPagesEditor';
import { FLYER_MAX_PAGES, clampFlyerPageCount } from '@/features/news-cms/lib/flyerPages';
import type { NewsFlyerPage } from '@/features/news-cms/templates/types';

interface Props {
  lang: PortalUiLanguage;
  field: NewsFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Full active content — needed by fields that depend on siblings (page count). */
  content?: Record<string, unknown>;
}

export default function NewsFieldEditor({ lang, field, value, onChange, content = {} }: Props) {
  const commonClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';
  const stringValue = typeof value === 'string' ? value : '';

  if (field.type === 'pageCount') {
    const current = clampFlyerPageCount(value);
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{t(field.labelKey, lang)}</span>
        <select
          className={commonClass}
          value={current}
          onChange={(event) => onChange(clampFlyerPageCount(event.target.value))}
        >
          {Array.from({ length: FLYER_MAX_PAGES }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count} {t(count === 1 ? 'newsCmsPageUnitOne' : 'newsCmsPageUnitMany', lang)}
            </option>
          ))}
        </select>
        {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
      </label>
    );
  }

  if (field.type === 'flyerPages') {
    return (
      <div>
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">{t(field.labelKey, lang)}</span>
        <NewsFlyerPagesEditor
          lang={lang}
          value={value}
          pageCount={clampFlyerPageCount(content.pageCount)}
          onChange={(pages: NewsFlyerPage[]) => onChange(pages)}
        />
        {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
      </div>
    );
  }

  if (['featureBlocks', 'ctaLinks', 'techBlocks', 'specRows'].includes(field.type)) {
    return (
      <div>
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">{t(field.labelKey, lang)}</span>
        {field.type === 'featureBlocks' && <NewsFeatureBlocksEditor lang={lang} value={value} onChange={onChange} />}
        {field.type === 'ctaLinks' && <NewsCtaLinksEditor lang={lang} value={value} onChange={onChange} />}
        {field.type === 'techBlocks' && <NewsTechBlocksEditor lang={lang} value={value} onChange={onChange} />}
        {field.type === 'specRows' && <NewsSpecRowsEditor lang={lang} value={value} onChange={onChange} />}
        {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        {t(field.labelKey, lang)}
        {field.required && <span className="text-rose-500">*</span>}
      </span>
      {field.type === 'textarea' || field.type === 'richtext' || field.type === 'iconBlocks' || field.type === 'pages' ? (
        <textarea
          rows={field.type === 'pages' ? 5 : 3}
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
          className={commonClass}
          maxLength={field.maxLength}
        />
      ) : (
        <input
          type={field.type === 'url' ? 'url' : 'text'}
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
          className={commonClass}
          maxLength={field.maxLength}
          placeholder={field.type === 'image' || field.type === 'file' ? t('newsCmsStoragePlaceholder', lang) : undefined}
        />
      )}
      {field.maxLength ? (
        <p
          className={`mt-1 text-right text-xs font-semibold tabular-nums ${
            stringValue.length >= field.maxLength ? 'text-rose-600' : 'text-slate-400'
          }`}
        >
          {stringValue.length}/{field.maxLength}
        </p>
      ) : null}
      {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
    </label>
  );
}
