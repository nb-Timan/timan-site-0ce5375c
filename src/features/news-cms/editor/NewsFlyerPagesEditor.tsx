import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFeatureBlock, NewsFeatureIconColor, NewsFlyerPage } from '@/features/news-cms/templates/types';
import { FeatureIconMark, NEWS_FEATURE_ICON_COLORS } from '@/features/news-cms/lib/featureIcons';
import { IconPicker } from './NewsFeatureBlocksEditor';
import {
  FLYER_HIGHLIGHT_COUNT,
  FLYER_HIGHLIGHT_HEADING_MAX,
  FLYER_HIGHLIGHT_TEXT_MAX,
  FLYER_LINK_COUNT,
  FLYER_LINK_LABEL_MAX,
  FLYER_SPEC_LABEL_MAX,
  FLYER_SPEC_ROWS,
  FLYER_SPEC_VALUE_MAX,
  flyerTextLimits,
  normalizeFlyerHighlights,
  normalizeFlyerLinks,
  normalizeFlyerPages,
  normalizeFlyerSpecs,
} from '@/features/news-cms/lib/flyerPages';

interface Props {
  lang: PortalUiLanguage;
  value: unknown;
  pageCount: number;
  onChange: (pages: NewsFlyerPage[]) => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <p className={`mt-1 text-right text-xs font-semibold tabular-nums ${length >= max ? 'text-rose-600' : 'text-slate-400'}`}>
      {length}/{max}
    </p>
  );
}

const PAGE_LABEL_KEYS = ['newsCmsFlyerPage1Label', 'newsCmsFlyerPage2Label', 'newsCmsFlyerPage3Label'];

export default function NewsFlyerPagesEditor({ lang, value, pageCount, onChange }: Props) {
  const pages = normalizeFlyerPages(value, pageCount);
  const [openIndex, setOpenIndex] = useState(0);
  const [picker, setPicker] = useState<{ page: number; block: number } | null>(null);

  const update = (index: number, patch: Partial<NewsFlyerPage>) => {
    onChange(pages.map((page, current) => (current === index ? { ...page, ...patch } : page)));
  };

  const patchHighlight = (pageIndex: number, blockIndex: number, changes: Partial<NewsFeatureBlock>) => {
    const blocks = normalizeFlyerHighlights(pages[pageIndex]?.highlights);
    update(pageIndex, {
      highlights: blocks.map((block, index) => (index === blockIndex ? { ...block, ...changes } : block)),
    });
  };

  return (
    <div className="space-y-3">
      {pages.map((page, index) => {
        const open = openIndex === index;
        const limits = flyerTextLimits(index);
        const highlights = normalizeFlyerHighlights(page.highlights);
        const specs = normalizeFlyerSpecs(page.specs);
        const links = normalizeFlyerLinks(page.links);
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
                <span className="font-semibold normal-case text-slate-400">· {t(PAGE_LABEL_KEYS[index] || PAGE_LABEL_KEYS[0], lang)}</span>
              </span>
              <span className="truncate text-xs text-slate-400">{page.headline}</span>
            </button>
            {open && (
              <div className="space-y-3 p-3">
                <label className="block">
                  <span className={labelClass}>
                    {t('newsCmsFieldHeadline', lang)}
                    {index === 0 && <span className="ml-1 text-rose-500">*</span>}
                  </span>
                  <input
                    className={inputClass}
                    value={page.headline}
                    maxLength={limits.headline}
                    onChange={(event) => update(index, { headline: event.target.value })}
                  />
                  <Counter length={page.headline.length} max={limits.headline} />
                </label>

                <label className="block">
                  <span className={labelClass}>{t('newsCmsFieldSubtitle', lang)}</span>
                  <input
                    className={inputClass}
                    value={page.subtitle}
                    maxLength={limits.subtitle}
                    onChange={(event) => update(index, { subtitle: event.target.value })}
                  />
                  <Counter length={page.subtitle.length} max={limits.subtitle} />
                </label>

                <label className="block">
                  <span className={labelClass}>{t(index === 2 ? 'newsCmsFlyerIntro' : 'newsCmsFieldBody', lang)}</span>
                  <textarea
                    rows={4}
                    className={inputClass}
                    value={page.body}
                    maxLength={limits.body}
                    onChange={(event) => update(index, { body: event.target.value })}
                  />
                  <Counter length={page.body.length} max={limits.body} />
                </label>

                <label className="block">
                  <span className={labelClass}>{t(index === 0 ? 'newsCmsFlyerImage' : 'newsCmsFlyerMainImage', lang)}</span>
                  <input
                    className={inputClass}
                    value={page.image}
                    placeholder={t('newsCmsStoragePlaceholder', lang)}
                    onChange={(event) => update(index, { image: event.target.value })}
                  />
                </label>

                {/* Page 2 only: secondary image + three highlights. */}
                {index === 1 && (
                  <>
                    <label className="block">
                      <span className={labelClass}>{t('newsCmsFlyerSecondaryImage', lang)}</span>
                      <input
                        className={inputClass}
                        value={page.secondaryImage}
                        placeholder={t('newsCmsStoragePlaceholder', lang)}
                        onChange={(event) => update(index, { secondaryImage: event.target.value })}
                      />
                    </label>

                    {Array.from({ length: FLYER_HIGHLIGHT_COUNT }).map((_, blockIndex) => {
                      const block = highlights[blockIndex];
                      return (
                        <div key={blockIndex} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                            {t('newsCmsFlyerHighlight', lang)} {blockIndex + 1}
                          </p>
                          <div className="mb-2 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white">
                              <FeatureIconMark block={block} size="sm" />
                            </div>
                            <button
                              type="button"
                              onClick={() => setPicker({ page: index, block: blockIndex })}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                            >
                              {t('newsCmsChooseIcon', lang)}
                            </button>
                            {block.customIconUrl && (
                              <button
                                type="button"
                                onClick={() => patchHighlight(index, blockIndex, { customIconUrl: null })}
                                className="text-xs font-semibold text-slate-400 underline-offset-2 hover:text-rose-600 hover:underline"
                              >
                                {t('newsCmsRemoveCustomIcon', lang)}
                              </button>
                            )}
                          </div>
                          <div className="mb-2">
                            <span className={labelClass}>{t('newsCmsIconColor', lang)}</span>
                            <div className="flex flex-wrap gap-2">
                              {NEWS_FEATURE_ICON_COLORS.map((color) => (
                                <button
                                  key={color.id}
                                  type="button"
                                  title={t(color.labelKey, lang)}
                                  onClick={() => patchHighlight(index, blockIndex, { iconColor: color.id as NewsFeatureIconColor })}
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
                          <label className="mb-2 block">
                            <span className={labelClass}>{t('newsCmsFlyerHighlightHeading', lang)}</span>
                            <input
                              className={inputClass}
                              value={block.heading}
                              maxLength={FLYER_HIGHLIGHT_HEADING_MAX}
                              onChange={(event) => patchHighlight(index, blockIndex, { heading: event.target.value })}
                            />
                            <Counter length={block.heading.length} max={FLYER_HIGHLIGHT_HEADING_MAX} />
                          </label>
                          <label className="block">
                            <span className={labelClass}>{t('newsCmsFlyerHighlightText', lang)}</span>
                            <textarea
                              rows={2}
                              className={inputClass}
                              value={block.description}
                              maxLength={FLYER_HIGHLIGHT_TEXT_MAX}
                              onChange={(event) => patchHighlight(index, blockIndex, { description: event.target.value })}
                            />
                            <Counter length={block.description.length} max={FLYER_HIGHLIGHT_TEXT_MAX} />
                          </label>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Page 3 only: specification rows + up to two CTA links. */}
                {index === 2 && (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{t('newsCmsFlyerSpecTitle', lang)}</p>
                      <div className="space-y-2">
                        {Array.from({ length: FLYER_SPEC_ROWS }).map((_, rowIndex) => {
                          const row = specs[rowIndex];
                          return (
                            <div key={rowIndex} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-2">
                              <input
                                className={inputClass}
                                value={row.label}
                                maxLength={FLYER_SPEC_LABEL_MAX}
                                placeholder={`${t('newsCmsFlyerSpecLabel', lang)} ${rowIndex + 1}`}
                                onChange={(event) =>
                                  update(index, {
                                    specs: specs.map((item, current) =>
                                      current === rowIndex ? { ...item, label: event.target.value } : item,
                                    ),
                                  })
                                }
                              />
                              <input
                                className={inputClass}
                                value={row.value}
                                maxLength={FLYER_SPEC_VALUE_MAX}
                                placeholder={t('newsCmsFlyerSpecValue', lang)}
                                onChange={(event) =>
                                  update(index, {
                                    specs: specs.map((item, current) =>
                                      current === rowIndex ? { ...item, value: event.target.value } : item,
                                    ),
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {Array.from({ length: FLYER_LINK_COUNT }).map((_, linkIndex) => {
                      const link = links[linkIndex];
                      return (
                        <div key={linkIndex} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                            {t('newsCmsFlyerLink', lang)} {linkIndex + 1}
                          </p>
                          <label className="mb-2 block">
                            <span className={labelClass}>{t('newsCmsFlyerLinkLabel', lang)}</span>
                            <input
                              className={inputClass}
                              value={link.label}
                              maxLength={FLYER_LINK_LABEL_MAX}
                              onChange={(event) =>
                                update(index, {
                                  links: links.map((item, current) =>
                                    current === linkIndex ? { ...item, label: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                            <Counter length={link.label.length} max={FLYER_LINK_LABEL_MAX} />
                          </label>
                          <label className="block">
                            <span className={labelClass}>{t('newsCmsFlyerLinkUrl', lang)}</span>
                            <input
                              className={inputClass}
                              type="url"
                              value={link.url}
                              placeholder="https://"
                              onChange={(event) =>
                                update(index, {
                                  links: links.map((item, current) =>
                                    current === linkIndex ? { ...item, url: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-400">{t('newsCmsFlyerCtaHelp', lang)}</p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {picker && (
        <IconPicker
          lang={lang}
          block={normalizeFlyerHighlights(pages[picker.page]?.highlights)[picker.block]}
          onPick={(changes) => patchHighlight(picker.page, picker.block, changes)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
