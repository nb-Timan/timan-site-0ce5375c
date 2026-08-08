import { Plus, Trash2 } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsSpecRow } from '@/features/news-cms/templates/types';
import { SPEC_LABEL_MAX, SPEC_VALUE_MAX, normalizeSpecRows } from '@/features/news-cms/lib/techBlocks';

interface Props {
  lang: PortalUiLanguage;
  value: unknown;
  onChange: (value: NewsSpecRow[]) => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

export default function NewsSpecRowsEditor({ lang, value, onChange }: Props) {
  const rows = normalizeSpecRows(value);

  const patch = (index: number, changes: Partial<NewsSpecRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  };

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('newsCmsSpecLabel', lang)}</span>
            <input
              type="text"
              value={row.label}
              maxLength={SPEC_LABEL_MAX}
              onChange={(event) => patch(index, { label: event.target.value.slice(0, SPEC_LABEL_MAX) })}
              className={inputClass}
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('newsCmsSpecValue', lang)}</span>
            <input
              type="text"
              value={row.value}
              maxLength={SPEC_VALUE_MAX}
              onChange={(event) => patch(index, { value: event.target.value.slice(0, SPEC_VALUE_MAX) })}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            title={t('newsCmsRemoveSpec', lang)}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="mb-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, { label: '', value: '' }])}
        disabled={rows.length >= 12}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {t('newsCmsAddSpec', lang)}
      </button>
    </div>
  );
}
