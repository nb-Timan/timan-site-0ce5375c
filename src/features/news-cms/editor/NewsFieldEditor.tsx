import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFieldDefinition } from '@/features/news-cms/templates/types';
import NewsFeatureBlocksEditor from './NewsFeatureBlocksEditor';
import NewsCtaLinksEditor from './NewsCtaLinksEditor';

interface Props {
  lang: PortalUiLanguage;
  field: NewsFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function NewsFieldEditor({ lang, field, value, onChange }: Props) {
  const commonClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';
  const stringValue = typeof value === 'string' ? value : '';

  if (field.type === 'featureBlocks' || field.type === 'ctaLinks') {
    return (
      <div>
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">{t(field.labelKey, lang)}</span>
        {field.type === 'featureBlocks' ? (
          <NewsFeatureBlocksEditor lang={lang} value={value} onChange={onChange} />
        ) : (
          <NewsCtaLinksEditor lang={lang} value={value} onChange={onChange} />
        )}
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
      {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
    </label>
  );
}
