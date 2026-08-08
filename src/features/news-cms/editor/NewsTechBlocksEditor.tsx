import { useState } from 'react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFeatureBlock, NewsFeatureIconColor } from '@/features/news-cms/templates/types';
import { FeatureIconMark, NEWS_FEATURE_ICON_COLORS } from '@/features/news-cms/lib/featureIcons';
import { IconPicker } from './NewsFeatureBlocksEditor';
import { TECH_BLOCK_COUNT, TECH_HEADING_MAX, TECH_VALUE_MAX, normalizeTechBlocks } from '@/features/news-cms/lib/techBlocks';

interface Props {
  lang: PortalUiLanguage;
  value: unknown;
  onChange: (value: NewsFeatureBlock[]) => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

export default function NewsTechBlocksEditor({ lang, value, onChange }: Props) {
  const blocks = normalizeTechBlocks(value);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  const patch = (index: number, changes: Partial<NewsFeatureBlock>) => {
    onChange(blocks.map((block, i) => (i === index ? { ...block, ...changes } : block)));
  };

  return (
    <div className="space-y-4">
      {Array.from({ length: TECH_BLOCK_COUNT }).map((_, index) => {
        const block = blocks[index];
        return (
          <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">
              {t('newsCmsTechBlock', lang)} {index + 1}
            </p>

            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white">
                <FeatureIconMark block={block} size="sm" />
              </div>
              <button
                type="button"
                onClick={() => setPickerIndex(index)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                {t('newsCmsChooseIcon', lang)}
              </button>
              {block.customIconUrl && (
                <button
                  type="button"
                  onClick={() => patch(index, { customIconUrl: null })}
                  className="text-xs font-semibold text-slate-400 underline-offset-2 hover:text-rose-600 hover:underline"
                >
                  {t('newsCmsRemoveCustomIcon', lang)}
                </button>
              )}
            </div>

            <div className="mb-3">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsIconColor', lang)}</span>
              <div className="flex flex-wrap gap-2">
                {NEWS_FEATURE_ICON_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    title={t(color.labelKey, lang)}
                    onClick={() => patch(index, { iconColor: color.id as NewsFeatureIconColor })}
                    className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                      block.iconColor === color.id ? 'border-emerald-500 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full ${color.swatch}`} />
                    {t(color.labelKey, lang)}
                  </button>
                ))}
              </div>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsTechHeading', lang)}</span>
                <span className={`text-[11px] font-semibold ${block.heading.length >= TECH_HEADING_MAX ? 'text-rose-600' : 'text-slate-400'}`}>
                  {block.heading.length}/{TECH_HEADING_MAX}
                </span>
              </span>
              <input
                type="text"
                value={block.heading}
                maxLength={TECH_HEADING_MAX}
                onChange={(event) => patch(index, { heading: event.target.value.slice(0, TECH_HEADING_MAX) })}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsTechValue', lang)}</span>
                <span className={`text-[11px] font-semibold ${block.description.length >= TECH_VALUE_MAX ? 'text-rose-600' : 'text-slate-400'}`}>
                  {block.description.length}/{TECH_VALUE_MAX}
                </span>
              </span>
              <textarea
                rows={2}
                value={block.description}
                maxLength={TECH_VALUE_MAX}
                onChange={(event) => patch(index, { description: event.target.value.slice(0, TECH_VALUE_MAX) })}
                className={inputClass}
              />
            </label>
          </div>
        );
      })}

      {pickerIndex !== null && (
        <IconPicker
          lang={lang}
          block={blocks[pickerIndex]}
          onPick={(changes) => patch(pickerIndex, changes)}
          onClose={() => setPickerIndex(null)}
        />
      )}
    </div>
  );
}
