import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsCtaLink } from '@/features/news-cms/templates/types';
import {
  NEWS_CTA_LABEL_MAX,
  NEWS_CTA_TYPES,
  isValidCtaUrl,
  normalizeCtaLinks,
} from '@/features/news-cms/lib/ctaLinks';

interface Props {
  lang: PortalUiLanguage;
  value: unknown;
  onChange: (value: NewsCtaLink[]) => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

export default function NewsCtaLinksEditor({ lang, value, onChange }: Props) {
  const links = normalizeCtaLinks(value);

  const patch = (index: number, changes: Partial<NewsCtaLink>) => {
    onChange(links.map((link, i) => (i === index ? { ...link, ...changes } : link)));
  };

  return (
    <div className="space-y-3">
      {links.map((link, index) => {
        const urlInvalid = link.enabled && link.url.trim().length > 0 && !isValidCtaUrl(link.url);
        return (
          <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                {t('newsCmsCta', lang)} {index + 1}
              </span>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={link.enabled}
                  onChange={(event) => patch(index, { enabled: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                {t('newsCmsCtaEnable', lang)}
              </label>
            </div>

            <div className={link.enabled ? 'space-y-3' : 'space-y-3 opacity-50'}>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsCtaType', lang)}</span>
                <select
                  disabled={!link.enabled}
                  value={link.type}
                  onChange={(event) => patch(index, { type: event.target.value as NewsCtaLink['type'] })}
                  className={inputClass}
                >
                  {NEWS_CTA_TYPES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {t(option.labelKey, lang)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
                  {t('newsCmsCtaLabel', lang)}
                  <span className="font-semibold normal-case text-slate-400">
                    {link.label.length}/{NEWS_CTA_LABEL_MAX}
                  </span>
                </span>
                <input
                  type="text"
                  disabled={!link.enabled}
                  maxLength={NEWS_CTA_LABEL_MAX}
                  value={link.label}
                  onChange={(event) => patch(index, { label: event.target.value.slice(0, NEWS_CTA_LABEL_MAX) })}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsCtaUrl', lang)}</span>
                <input
                  type="url"
                  disabled={!link.enabled}
                  value={link.url}
                  placeholder="https://"
                  onChange={(event) => patch(index, { url: event.target.value })}
                  className={`${inputClass} ${urlInvalid ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : ''}`}
                />
                {urlInvalid && <p className="mt-1 text-xs font-semibold text-rose-600">{t('newsCmsCtaInvalidUrl', lang)}</p>}
              </label>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-slate-400">{t('newsCmsCtaUrlShared', lang)}</p>
    </div>
  );
}
