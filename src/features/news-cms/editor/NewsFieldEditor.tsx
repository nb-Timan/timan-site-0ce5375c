import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFieldDefinition } from '@/features/news-cms/templates/types';
import NewsFeatureBlocksEditor from './NewsFeatureBlocksEditor';
import NewsCtaLinksEditor from './NewsCtaLinksEditor';
import NewsTechBlocksEditor from './NewsTechBlocksEditor';
import NewsSpecRowsEditor from './NewsSpecRowsEditor';
import NewsFlyerPagesEditor from './NewsFlyerPagesEditor';
import NewsImageUploadField from './NewsImageUploadField';
import { FLYER_MAX_PAGES, clampFlyerPageCount } from '@/features/news-cms/lib/flyerPages';
import type { NewsFlyerPage, NewsImageTransform } from '@/features/news-cms/templates/types';
import {
  NEWS_TYPOGRAPHY_SIZE_STEPS,
  type NewsTypographyMap,
  type NewsTypographySetting,
  type NewsTypographyStyle,
} from '@/features/news-cms/lib/newsTypography';

interface Props {
  lang: PortalUiLanguage;
  field: NewsFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onMetaChange?: (fieldKey: string, value: unknown) => void;
  typography?: NewsTypographyMap;
  onTypographyChange?: (fieldPath: string, setting: NewsTypographySetting | null) => void;
  /** Full active content — needed by fields that depend on siblings (page count). */
  content?: Record<string, unknown>;
}

function isImageTransform(value: unknown): Partial<NewsImageTransform> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<NewsImageTransform>;
  return {
    x: typeof candidate.x === 'number' ? candidate.x : undefined,
    y: typeof candidate.y === 'number' ? candidate.y : undefined,
    scale: typeof candidate.scale === 'number' ? candidate.scale : undefined,
  };
}

function typographyTargets(field: NewsFieldDefinition): Array<{ path: string; label: string }> {
  if (['text', 'textarea', 'richtext'].includes(field.type)) return [{ path: field.key, label: 'Tekst' }];
  if (field.type === 'featureBlocks') {
    return [
      { path: `${field.key}.heading`, label: 'Overskrift' },
      { path: `${field.key}.description`, label: 'Tekst' },
    ];
  }
  if (field.type === 'ctaLinks') return [{ path: `${field.key}.label`, label: 'Knaptekst' }];
  if (field.type === 'techBlocks') {
    return [
      { path: `${field.key}.heading`, label: 'Overskrift' },
      { path: `${field.key}.description`, label: 'Tekst' },
    ];
  }
  if (field.type === 'specRows') {
    return [
      { path: `${field.key}.label`, label: 'Label' },
      { path: `${field.key}.value`, label: 'Værdi' },
    ];
  }
  if (field.type === 'flyerPages') {
    return [
      { path: `${field.key}.headline`, label: 'Overskrift' },
      { path: `${field.key}.subtitle`, label: 'Underoverskrift' },
      { path: `${field.key}.body`, label: 'Brødtekst' },
      { path: `${field.key}.highlights.heading`, label: 'Punktoverskrift' },
      { path: `${field.key}.highlights.description`, label: 'Punkttekst' },
      { path: `${field.key}.specs.label`, label: 'Spec-label' },
      { path: `${field.key}.specs.value`, label: 'Spec-værdi' },
      { path: `${field.key}.links.label`, label: 'CTA-tekst' },
    ];
  }
  return [];
}

function TypographyControls({
  targets,
  typography = {},
  onTypographyChange,
}: {
  targets: Array<{ path: string; label: string }>;
  typography?: NewsTypographyMap;
  onTypographyChange?: (fieldPath: string, setting: NewsTypographySetting | null) => void;
}) {
  if (!onTypographyChange || targets.length === 0) return null;

  const update = (path: string, patch: NewsTypographySetting) => {
    const current = typography[path] || {};
    onTypographyChange(path, { ...current, ...patch });
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-[0.68rem] font-black uppercase tracking-wide text-slate-400">Typografi</p>
      {targets.map((target) => {
        const setting = typography[target.path] || {};
        const size = setting.size || 0;
        const style = setting.style || 'default';
        return (
          <div key={target.path} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-auto min-w-[5.5rem] text-xs font-semibold text-slate-500">{target.label}</span>
            {(['default', 'normal', 'bold', 'italic'] as NewsTypographyStyle[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => update(target.path, { style: option })}
                className={`h-7 rounded-md border px-2 text-xs font-bold transition ${
                  style === option
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
                }`}
              >
                {option === 'default' ? 'Std.' : option === 'normal' ? 'Normal' : option === 'bold' ? 'B' : 'I'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => update(target.path, { size: NEWS_TYPOGRAPHY_SIZE_STEPS[Math.max(0, NEWS_TYPOGRAPHY_SIZE_STEPS.indexOf(size) - 1)] })}
              className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs font-black text-slate-600 transition hover:border-emerald-200"
              aria-label="Gør tekst mindre"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => update(target.path, { size: 0 })}
              className="h-7 min-w-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold tabular-nums text-slate-600 transition hover:border-emerald-200"
            >
              {size > 0 ? `+${size}` : size}
            </button>
            <button
              type="button"
              onClick={() => update(target.path, { size: NEWS_TYPOGRAPHY_SIZE_STEPS[Math.min(NEWS_TYPOGRAPHY_SIZE_STEPS.length - 1, NEWS_TYPOGRAPHY_SIZE_STEPS.indexOf(size) + 1)] })}
              className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs font-black text-slate-600 transition hover:border-emerald-200"
              aria-label="Gør tekst større"
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function NewsFieldEditor({ lang, field, value, onChange, onMetaChange, typography, onTypographyChange, content = {} }: Props) {
  const commonClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';
  const stringValue = typeof value === 'string' ? value : '';
  const typographyControl = (
    <TypographyControls
      targets={typographyTargets(field)}
      typography={typography}
      onTypographyChange={onTypographyChange}
    />
  );

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
        {typographyControl}
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
        {typographyControl}
        {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
      </div>
    );
  }

  if (field.type === 'image') {
    const transformKey = `${field.key}Transform`;
    return (
      <NewsImageUploadField
        lang={lang}
        field={field}
        value={stringValue}
        transform={isImageTransform(content[transformKey])}
        onChange={(next) => onChange(next)}
        onTransformChange={(next) => onMetaChange?.(transformKey, next)}
      />
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
          placeholder={field.type === 'file' ? t('newsCmsStoragePlaceholder', lang) : undefined}
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
      {typographyControl}
      {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
    </label>
  );
}
