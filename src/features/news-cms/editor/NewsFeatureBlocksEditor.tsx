import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import { supabase } from '@/lib/supabase';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFeatureBlock, NewsFeatureIconColor } from '@/features/news-cms/templates/types';
import {
  FEATURE_BLOCK_COUNT,
  FeatureIconMark,
  NEWS_FEATURE_ICONS,
  NEWS_FEATURE_ICON_COLORS,
  iconColorClass,
  normalizeFeatureBlocks,
} from '@/features/news-cms/lib/featureIcons';

interface Props {
  lang: PortalUiLanguage;
  value: unknown;
  onChange: (value: NewsFeatureBlock[]) => void;
}

const HEADING_MAX = 30;
const DESCRIPTION_MAX = 80;

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

export function IconPicker({
  lang,
  block,
  onPick,
  onClose,
}: {
  lang: PortalUiLanguage;
  block: NewsFeatureBlock;
  onPick: (patch: Partial<NewsFeatureBlock>) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'svg';
      const path = `icons/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('news-assets').upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('news-assets').getPublicUrl(path);
      onPick({ customIconUrl: data.publicUrl });
      onClose();
    } catch {
      setUploadError(t('newsCmsIconUploadUnavailable', lang));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-base font-bold text-slate-900">{t('newsCmsChooseIcon', lang)}</h4>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {NEWS_FEATURE_ICONS.map((option) => {
            const active = !block.customIconUrl && block.icon === option.id;
            return (
              <button
                key={option.id}
                type="button"
                title={t(option.labelKey, lang)}
                onClick={() => {
                  onPick({ icon: option.id, customIconUrl: null });
                  onClose();
                }}
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border transition ${
                  active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                }`}
              >
                <option.Icon className={`h-5 w-5 ${iconColorClass(block.iconColor)}`} />
                <span className="max-w-full truncate px-1 text-[10px] font-semibold text-slate-500">{t(option.labelKey, lang)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {t('newsCmsUploadCustomIcon', lang)}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleUpload(file);
            }}
          />
          <p className="mt-2 text-xs text-slate-400">{t('newsCmsUploadCustomIconHelp', lang)}</p>
          {uploadError && <p className="mt-2 text-xs font-semibold text-amber-700">{uploadError}</p>}
        </div>
      </div>
    </div>
  );
}

export default function NewsFeatureBlocksEditor({ lang, value, onChange }: Props) {
  const blocks = normalizeFeatureBlocks(value);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  const patch = (index: number, changes: Partial<NewsFeatureBlock>) => {
    onChange(blocks.map((block, i) => (i === index ? { ...block, ...changes } : block)));
  };

  return (
    <div className="space-y-4">
      {Array.from({ length: FEATURE_BLOCK_COUNT }).map((_, index) => {
        const block = blocks[index];
        return (
          <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">
              {t('newsCmsFeature', lang)} {index + 1}
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
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsFeatureHeading', lang)}</span>
                <span className={`text-[11px] font-semibold ${block.heading.length >= HEADING_MAX ? 'text-rose-600' : 'text-slate-400'}`}>
                  {block.heading.length}/{HEADING_MAX}
                </span>
              </span>
              <input
                type="text"
                value={block.heading}
                maxLength={HEADING_MAX}
                onChange={(event) => patch(index, { heading: event.target.value.slice(0, HEADING_MAX) })}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsFeatureDescription', lang)}</span>
                <span className={`text-[11px] font-semibold ${block.description.length >= DESCRIPTION_MAX ? 'text-rose-600' : 'text-slate-400'}`}>
                  {block.description.length}/{DESCRIPTION_MAX}
                </span>
              </span>
              <textarea
                rows={2}
                value={block.description}
                maxLength={DESCRIPTION_MAX}
                onChange={(event) => patch(index, { description: event.target.value.slice(0, DESCRIPTION_MAX) })}
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
