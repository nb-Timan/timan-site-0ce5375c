import timanLogo from '@/assets/timan-logo-transparent-trimmed.png';
import { Badge, FileText, Image as ImageIcon, ListChecks, Quote } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { t } from '@/lib/i18n/translations';
import { FeatureIconMark, normalizeFeatureBlocks } from '@/features/news-cms/lib/featureIcons';
import { filledSpecRows, normalizeTechBlocks } from '@/features/news-cms/lib/techBlocks';
import { activeCtaLinks, ctaTypeOption, invalidCtaLinks } from '@/features/news-cms/lib/ctaLinks';
import {
  FLYER_BODY_MAX,
  FLYER_HEADLINE_MAX,
  FLYER_SUBTITLE_MAX,
  flyerPagesFromContent,
} from '@/features/news-cms/lib/flyerPages';
import type { NewsRendererProps, NewsTemplateDefinition, NewsTemplateId } from './types';

function placeholderValidate(content: Record<string, unknown>) {
  const issues = ['headline'].flatMap((fieldKey) => {
    const value = content[fieldKey];
    return typeof value === 'string' && value.trim() ? [] : [{ fieldKey, messageKey: 'newsCmsValidationRequired' }];
  });
  return { valid: issues.length === 0, issues };
}

/** Template 01 additionally blocks save/publish on misconfigured CTA links. */
function template01Validate(content: Record<string, unknown>) {
  const base = placeholderValidate(content);
  const ctaBroken =
    invalidCtaLinks(content.ctaLinks).length > 0 ||
    activeCtaLinks(content.ctaLinks).length !==
      (Array.isArray(content.ctaLinks) ? content.ctaLinks.filter((item) => (item as { enabled?: boolean })?.enabled).length : 0);
  const issues = ctaBroken
    ? [...base.issues, { fieldKey: 'ctaLinks', messageKey: 'newsCmsValidationInvalidCta' }]
    : base.issues;
  return { valid: issues.length === 0, issues };
}

/**
 * Template 04 is a fixed A4 page: text must fit the reserved zones, so the
 * editorial fields are hard-capped to the space actually rendered.
 */
const TPL04_HEADLINE_MAX = 70;
const TPL04_SUBTITLE_MAX = 90;
const TPL04_BODY_MAX = 350;

function template04Validate(content: Record<string, unknown>) {
  const base = placeholderValidate(content);
  const limits: Array<[string, number]> = [
    ['headline', TPL04_HEADLINE_MAX],
    ['subtitle', TPL04_SUBTITLE_MAX],
    ['body', TPL04_BODY_MAX],
  ];
  const tooLong = limits.flatMap(([fieldKey, max]) => {
    const value = content[fieldKey];
    return typeof value === 'string' && value.length > max ? [{ fieldKey, messageKey: 'newsCmsValidationTooLong' }] : [];
  });
  const issues = [...base.issues, ...tooLong];
  return { valid: issues.length === 0, issues };
}


/** Template 06: page 1 headline is required; every page respects the hard caps. */
function template06Validate(content: Record<string, unknown>) {
  const pages = flyerPagesFromContent(content);
  const issues: Array<{ fieldKey: string; messageKey: string }> = [];
  if (!pages[0]?.headline.trim()) issues.push({ fieldKey: 'flyerPages', messageKey: 'newsCmsValidationRequired' });
  const tooLong = pages.some(
    (page) =>
      page.headline.length > FLYER_HEADLINE_MAX ||
      page.subtitle.length > FLYER_SUBTITLE_MAX ||
      page.body.length > FLYER_BODY_MAX,
  );
  if (tooLong) issues.push({ fieldKey: 'flyerPages', messageKey: 'newsCmsValidationTooLong' });
  return { valid: issues.length === 0, issues };
}

function text(content: Record<string, unknown>, key: string, fallback: string) {
  const value = content[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function TemplateShell({
  children,
  lang,
  logoAlign = 'right',
  logoSize = 'default',
}: {
  children: ReactNode;
  lang?: NewsRendererProps['lang'];
  logoAlign?: 'left' | 'right';
  logoSize?: 'default' | 'sm';
}) {
  return (
    <div className="aspect-[1.414/1] w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="relative h-full overflow-hidden rounded-lg border border-slate-200 bg-white">
        <img
          src={timanLogo}
          alt="TIMAN"
          className={`pointer-events-none absolute top-7 z-20 w-auto max-w-[38%] select-none object-contain ${
            logoSize === 'sm' ? 'h-[6.8rem]' : 'h-32'
          } ${logoAlign === 'left' ? 'left-8' : 'right-8'}`}
          draggable={false}
        />


        <div className="absolute -left-12 bottom-0 h-32 w-40 -skew-x-12 bg-emerald-600" />
        <div className="absolute left-24 bottom-0 h-32 w-6 -skew-x-12 bg-rose-500" />
        <div className="relative h-full p-7">{children}</div>
      </div>
    </div>
  );
}

function ImageBox({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-slate-400 ${className}`}>
      <div className="flex flex-col items-center gap-2 text-center text-xs font-semibold uppercase tracking-wide">
        <ImageIcon className="h-7 w-7" />
        {label}
      </div>
    </div>
  );
}

function TextLines({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className={`h-2 rounded-full bg-slate-200 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

function CtaRow({ content, lang }: NewsRendererProps) {
  const ctas = activeCtaLinks(content.ctaLinks);
  if (ctas.length === 0) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {ctas.map((cta, index) => {
        const Icon = ctaTypeOption(cta.type).Icon;
        const primary = index === 0;
        return (
          <a
            key={index}
            href={cta.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex max-w-[16rem] items-center gap-2 rounded-lg px-4 py-2 text-[0.8rem] font-bold leading-tight transition ${
              primary
                ? 'bg-[var(--timan-green)] text-white hover:opacity-90'
                : 'border border-[var(--timan-green)] bg-white text-[var(--timan-green)] hover:bg-emerald-50'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{cta.label}</span>
          </a>
        );
      })}
    </div>
  );
}

function Template01({ content, lang, mode }: NewsRendererProps) {
  const features = normalizeFeatureBlocks(content.features);
  return (
    <TemplateShell lang={lang}>
      <div className="grid h-full min-w-0 grid-cols-[1.05fr_0.95fr] gap-8">
        <div className="relative h-full min-w-0">
          <ImageBox label={t('newsCmsWireLargeImage', lang)} className="h-full" />
          <span className="absolute left-3 top-3 z-10 rounded-[4px] bg-[var(--timan-green)] px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-white shadow-sm">
            {t('newsCmsBadgeNews', lang)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col justify-center pt-24">

          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700">
            <Badge className="h-4 w-4" />
            {t('newsCmsCategoryProductAnnouncement', lang)}
          </div>
          <h3 className="text-[2.15rem] font-black leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere]">
            {text(content, 'headline', t('newsCmsWireHeadline', lang))}
          </h3>
          <p className="mt-2 text-xl font-semibold not-italic leading-snug text-emerald-700 [overflow-wrap:anywhere]">
            {text(content, 'subtitle', t('newsCmsWireSubtitle', lang))}
          </p>
          {text(content, 'body', '') ? (
            <p className="mt-3 max-w-prose whitespace-pre-line text-[0.95rem] font-normal leading-6 text-slate-700 [overflow-wrap:anywhere]">
              {text(content, 'body', '')}
            </p>
          ) : null}
          <div className="mt-6 grid grid-cols-3 items-stretch gap-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex min-h-[7.5rem] min-w-0 flex-col overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50 p-3"
              >
                <FeatureIconMark block={feature} />
                <p className="mt-2 min-w-0 text-[0.8rem] font-bold leading-tight text-slate-950 [hyphens:auto] [overflow-wrap:anywhere]">
                  {feature.heading || t('newsCmsFeatureHeading', lang)}
                </p>
                {feature.description ? (
                  <p className="mt-1 min-w-0 text-[0.68rem] font-normal leading-[1.35] text-slate-600 [hyphens:auto] [overflow-wrap:anywhere]">
                    {feature.description}
                  </p>
                ) : (
                  <div className="mt-2 h-2 w-16 rounded-full bg-emerald-200" />
                )}
              </div>
            ))}
          </div>
          <CtaRow content={content} lang={lang} mode={mode} />
        </div>
      </div>
    </TemplateShell>
  );
}

function TemplateImage({ url, label, className = '' }: { url: string; label: string; className?: string }) {
  if (!url) return <ImageBox label={label} className={className} />;
  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${className}`}>
      <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

function Template02({ content, lang }: NewsRendererProps) {
  const body = text(content, 'body', '');
  const caption = text(content, 'imageCaption', '');
  const mainImage = text(content, 'mainImage', '');
  const secondaryImage = text(content, 'secondaryImage', '');
  return (
    <TemplateShell lang={lang} logoAlign="left">
      <div className="grid h-full min-w-0 grid-cols-[1.05fr_0.95fr] gap-8">
        <div className="flex min-w-0 flex-col pt-[44%]">
          <div className="mb-4 h-1.5 w-28 shrink-0 rounded-full bg-emerald-600" />
          <h3 className="text-[2.15rem] font-black leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere]">
            {text(content, 'headline', t('newsCmsWireHeadline', lang))}
          </h3>
          <p className="mt-2 text-lg font-semibold leading-snug text-slate-600 [overflow-wrap:anywhere]">
            {text(content, 'subtitle', t('newsCmsWireSubtitle', lang))}
          </p>
          <div className="mt-4 rounded-xl border-l-4 border-rose-500 bg-rose-50 p-3.5">
            <Quote className="mb-1.5 h-4 w-4 text-rose-500" />
            <p className="text-sm font-semibold leading-snug text-slate-700 [overflow-wrap:anywhere]">
              {text(content, 'quote', t('newsCmsWireQuote', lang))}
            </p>
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-hidden">
            {body ? (
              <p className="whitespace-pre-line text-[0.9rem] font-normal leading-6 text-slate-700 [overflow-wrap:anywhere]">
                {body}
              </p>
            ) : (
              <TextLines lines={5} />
            )}
          </div>
        </div>
        <div className="grid h-full min-w-0 grid-rows-[1.25fr_0.75fr] gap-4">
          <TemplateImage url={mainImage} label={t('newsCmsWireLargeImage', lang)} className="h-full" />
          <div className="grid min-w-0 grid-cols-[0.9fr_1.1fr] gap-4">
            <TemplateImage url={secondaryImage} label={t('newsCmsWireSmallImage', lang)} className="h-full" />
            <div className="flex min-w-0 flex-col justify-center border-l-2 border-emerald-500 pl-3">
              {caption ? (
                <p className="line-clamp-3 text-[0.78rem] font-medium leading-[1.35] text-slate-600 [overflow-wrap:anywhere]">
                  {caption}
                </p>
              ) : (
                <p className="text-[0.78rem] italic leading-[1.35] text-slate-400">{t('newsCmsWireCaption', lang)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </TemplateShell>
  );
}


function Template03({ content, lang }: NewsRendererProps) {
  return (
    <TemplateShell lang={lang}>
      <div className="relative h-full overflow-hidden rounded-xl">
        <ImageBox label={t('newsCmsWireHeroImage', lang)} className="absolute inset-0 h-full border-none bg-slate-200" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/30 to-transparent" />
        <div className="relative flex h-full max-w-lg flex-col justify-center text-white">
          <h3 className="text-4xl font-black leading-tight">{text(content, 'headline', t('newsCmsWireHeroHeadline', lang))}</h3>
          <p className="mt-4 text-lg">{text(content, 'subtitle', t('newsCmsWireIntro', lang))}</p>
          <div className="mt-7 flex gap-3">
            {[1, 2, 3].map((item) => <span key={item} className="h-12 w-28 rounded-lg bg-white/20" />)}
          </div>
        </div>
      </div>
    </TemplateShell>
  );
}

function Template04({ content, lang }: NewsRendererProps) {
  const blocks = normalizeTechBlocks(content.techBlocks);
  const specs = filledSpecRows(content.specRows);
  const body = text(content, 'body', '');
  const productImage = text(content, 'productImage', '');
  return (
    <TemplateShell lang={lang}>
      <div className="grid h-full min-w-0 grid-cols-[0.9fr_1.1fr] gap-7">
        <TemplateImage url={productImage} label={t('newsCmsWireProductImage', lang)} className="h-full" />
        {/* Right column = fixed branding zone (logo) + content zone strictly below it. */}
        <div className="grid min-h-0 min-w-0 grid-rows-[10.5rem_minmax(0,1fr)] overflow-hidden">
          <div aria-hidden />
          {/*
            Flex column: the body zone starts at a fixed minimum height (so the
            2x2 grid keeps its current start position for short text) and may
            grow with longer body text, pushing the grid downward. The grid is
            flex-none, so once vertical space runs out the body zone shrinks /
            clips instead of pushing the boxes past the safe bottom margin.
          */}
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="min-w-0 flex-none overflow-hidden">
              <h3 className="line-clamp-2 text-3xl font-black leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere]">
                {text(content, 'headline', t('newsCmsWireTechnicalFeature', lang))}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-lg font-semibold leading-snug text-emerald-700 [overflow-wrap:anywhere]">
                {text(content, 'subtitle', t('newsCmsWireMachineFunction', lang))}
              </p>
            </div>
            <div className="mt-2.5 min-h-[6rem] min-w-0 max-w-full flex-[0_1_auto] overflow-hidden">
              {body ? (
                <p className="max-w-full whitespace-pre-line text-[0.9rem] font-normal leading-6 text-slate-700 [overflow-wrap:anywhere]">
                  {body}
                </p>
              ) : null}
            </div>

            <div className="mt-3 grid flex-none grid-cols-2 grid-rows-2 gap-3">

              {blocks.map((block, index) => (
                <div
                  key={index}
                  className="flex h-[4.6rem] min-w-0 items-start gap-2.5 overflow-hidden rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-100"
                >
                  <FeatureIconMark block={block} size="sm" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[0.9rem] font-black leading-tight text-slate-950 [overflow-wrap:anywhere]">
                      {block.heading || t('newsCmsTechHeading', lang)}
                    </p>
                    {block.description ? (
                      <p className="mt-0.5 line-clamp-2 text-[0.7rem] font-medium leading-[1.35] text-slate-600 [overflow-wrap:anywhere]">
                        {block.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 min-h-0 min-w-0 flex-[1_1_0%] overflow-hidden">
              {specs.length > 0 ? (
                <div className="h-full overflow-hidden rounded-xl bg-slate-100 p-3.5">
                  <p className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">
                    {t('newsCmsSpecificationsTitle', lang)}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-1">
                    {specs.map((row, index) => (
                      <div key={index} className="flex min-w-0 items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
                        <dt className="min-w-0 text-[0.72rem] font-semibold text-slate-500 [overflow-wrap:anywhere]">{row.label}</dt>
                        <dd className="min-w-0 text-right text-[0.72rem] font-bold text-slate-900 [overflow-wrap:anywhere]">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          </div>

        </div>
      </div>
    </TemplateShell>
  );
}

/**
 * Template 05 uses fixed independent zones: the text column and the image
 * column are separate fixed tracks, and headline/subtitle/body/quote each own
 * a reserved row so long translations never move any other element.
 */
function Template05({ content, lang }: NewsRendererProps) {
  const body = text(content, 'body', '');
  const quote = text(content, 'quote', '');
  return (
    <TemplateShell lang={lang} logoAlign="left" logoSize="sm">
      <div className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-7">
        {/* Text column: fixed rows — header block, body zone, quote zone. */}
        <div className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)_9rem] overflow-hidden">
          <div className="min-w-0 pt-[7.5rem]">
            <h3 className="line-clamp-2 text-[2.1rem] font-black leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere]">
              {text(content, 'headline', t('newsCmsWireStoryHeadline', lang))}
            </h3>
            <p className="mt-2.5 line-clamp-2 text-lg font-semibold leading-snug text-emerald-700 [overflow-wrap:anywhere]">
              {text(content, 'subtitle', t('newsCmsWireSubtitle', lang))}
            </p>
          </div>
          <div className="mt-5 min-h-0 min-w-0 max-w-full overflow-hidden">
            {body ? (
              <p className="max-w-full whitespace-pre-line text-[0.9rem] font-normal leading-6 text-slate-700 [overflow-wrap:anywhere]">
                {body}
              </p>
            ) : (
              <TextLines lines={5} />
            )}
          </div>
          <div className="mt-4 min-h-0 min-w-0 overflow-hidden">
            <div className="h-full overflow-hidden rounded-xl border-l-4 border-emerald-600 bg-emerald-50 p-4">
              <p className="line-clamp-4 text-sm font-semibold leading-snug text-slate-700 [overflow-wrap:anywhere]">
                {quote || t('newsCmsWireHighlightQuote', lang)}
              </p>
            </div>
          </div>
        </div>
        {/* Image column: fixed rows, never affected by text length. */}
        <div className="grid h-full min-w-0 grid-rows-[1.25fr_0.75fr] gap-4 overflow-hidden">
          <div className="relative h-full min-h-0 min-w-0">
            <TemplateImage url={text(content, 'mainImage', '')} label={t('newsCmsWireLargeImage', lang)} className="h-full" />
            <span className="absolute right-3 top-3 z-10 rounded-[4px] bg-[var(--timan-green)] px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-white shadow-sm">
              {t('newsCmsBadgeNews', lang)}
            </span>
          </div>
          <TemplateImage url={text(content, 'secondaryImage', '')} label={t('newsCmsWireSecondaryImage', lang)} className="h-full" />
        </div>
      </div>
    </TemplateShell>
  );
}


/**
 * Template 06 – flyer. Fixed A4 landscape page rendering headline, subtitle
 * and body next to a full-height image. Text zones are fixed so no content
 * can push the image or the branding out of the page.
 */
function Template06({ content, lang, page = 1 }: NewsRendererProps) {
  const pages = flyerPagesFromContent(content);
  const index = Math.min(Math.max(page, 1), pages.length) - 1;
  const current = pages[index] || { headline: '', subtitle: '', body: '', image: '' };
  return (
    <TemplateShell lang={lang} logoAlign="left" logoSize="sm">
      <div className="grid h-full min-w-0 grid-cols-[1.04fr_0.96fr] gap-8">
        {/* Text column: fixed rows — branding zone, header zone, body zone. */}
        <div className="grid min-w-0 grid-rows-[7.5rem_auto_minmax(0,1fr)] overflow-hidden">
          <div aria-hidden />
          <div className="min-w-0">
            <div className="mb-4 h-1.5 w-28 rounded-full bg-emerald-600" />
            <h3 className="line-clamp-3 text-[2.35rem] font-black leading-[1.08] tracking-tight text-slate-950 [overflow-wrap:anywhere]">
              {current.headline || t('newsCmsWireHeadline', lang)}
            </h3>
            <p className="mt-3 line-clamp-2 text-xl font-semibold leading-snug text-emerald-700 [overflow-wrap:anywhere]">
              {current.subtitle || t('newsCmsWireSubtitle', lang)}
            </p>
          </div>
          <div className="mt-5 min-h-0 min-w-0 overflow-hidden border-t border-slate-200 pt-4">
            {current.body ? (
              <p className="max-w-full whitespace-pre-line text-[0.95rem] font-normal leading-6 text-slate-700 [overflow-wrap:anywhere]">
                {current.body}
              </p>
            ) : (
              <TextLines lines={5} />
            )}
          </div>
        </div>
        {/* Image column: fixed, never affected by text length. */}
        <div className="relative h-full min-h-0 min-w-0">
          <TemplateImage url={current.image} label={t('newsCmsWirePagePreview', lang)} className="h-full" />
          <span className="absolute right-3 top-3 z-10 rounded-[4px] bg-[var(--timan-green)] px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-white shadow-sm">
            {t('newsCmsBadgeNews', lang)}
          </span>
        </div>
      </div>
    </TemplateShell>
  );
}

const RENDERERS: Record<NewsTemplateId, ComponentType<NewsRendererProps>> = {
  'template-01-product-announcement': Template01,
  'template-02-split-story': Template02,
  'template-03-hero-news': Template03,
  'template-04-technical-feature': Template04,
  'template-05-story-layout': Template05,
  'template-06-flyer': Template06,
};

const baseFields = [
  { key: 'headline', labelKey: 'newsCmsFieldHeadline', type: 'text', required: true, maxLength: 120 },
  { key: 'subtitle', labelKey: 'newsCmsFieldSubtitle', type: 'text', maxLength: 180 },
  { key: 'body', labelKey: 'newsCmsFieldBody', type: 'textarea' },
] satisfies NewsTemplateDefinition['fields'];

export const NEWS_TEMPLATE_REGISTRY: NewsTemplateDefinition[] = [
  {
    id: 'template-01-product-announcement',
    number: '01',
    nameKey: 'newsCmsTemplate01Name',
    purposeKey: 'newsCmsTemplate01Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [
      ...baseFields,
      { key: 'mainImage', labelKey: 'newsCmsFieldMainImage', type: 'image', required: true },
      { key: 'features', labelKey: 'newsCmsFieldFeatures', type: 'featureBlocks', helpKey: 'newsCmsFieldFeaturesHelp' },
      { key: 'ctaLinks', labelKey: 'newsCmsFieldCtaLinks', type: 'ctaLinks', helpKey: 'newsCmsFieldCtaLinksHelp' },
    ],
    validate: template01Validate,
    Renderer: RENDERERS['template-01-product-announcement'],
  },
  {
    id: 'template-02-split-story',
    number: '02',
    nameKey: 'newsCmsTemplate02Name',
    purposeKey: 'newsCmsTemplate02Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [
      ...baseFields,
      { key: 'mainImage', labelKey: 'newsCmsFieldLargeImage', type: 'image', required: true },
      { key: 'secondaryImage', labelKey: 'newsCmsFieldSmallImage', type: 'image' },
      { key: 'imageCaption', labelKey: 'newsCmsFieldImageCaption', type: 'textarea' },
      { key: 'quote', labelKey: 'newsCmsFieldQuote', type: 'textarea' },
    ],
    validate: placeholderValidate,
    Renderer: RENDERERS['template-02-split-story'],
  },
  {
    id: 'template-03-hero-news',
    number: '03',
    nameKey: 'newsCmsTemplate03Name',
    purposeKey: 'newsCmsTemplate03Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [...baseFields, { key: 'heroImage', labelKey: 'newsCmsFieldHeroImage', type: 'image', required: true }],
    validate: placeholderValidate,
    Renderer: RENDERERS['template-03-hero-news'],
  },
  {
    id: 'template-04-technical-feature',
    number: '04',
    nameKey: 'newsCmsTemplate04Name',
    purposeKey: 'newsCmsTemplate04Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [
      { key: 'headline', labelKey: 'newsCmsFieldHeadline', type: 'text', required: true, maxLength: TPL04_HEADLINE_MAX },
      { key: 'subtitle', labelKey: 'newsCmsFieldSubtitle', type: 'text', maxLength: TPL04_SUBTITLE_MAX },
      { key: 'body', labelKey: 'newsCmsFieldBody', type: 'textarea', maxLength: TPL04_BODY_MAX },
      { key: 'productImage', labelKey: 'newsCmsWireProductImage', type: 'image' },
      { key: 'techBlocks', labelKey: 'newsCmsFieldTechBlocks', type: 'techBlocks', helpKey: 'newsCmsFieldTechBlocksHelp' },
      { key: 'specRows', labelKey: 'newsCmsFieldSpecRows', type: 'specRows', helpKey: 'newsCmsFieldSpecRowsHelp' },
    ],
    validate: template04Validate,
    Renderer: RENDERERS['template-04-technical-feature'],
  },
  {
    id: 'template-05-story-layout',
    number: '05',
    nameKey: 'newsCmsTemplate05Name',
    purposeKey: 'newsCmsTemplate05Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [
      ...baseFields.filter((field) => field.key !== 'body'),
      { key: 'body', labelKey: 'newsCmsFieldBody', type: 'textarea', maxLength: 900 },
      { key: 'mainImage', labelKey: 'newsCmsFieldMainImage', type: 'image' },
      { key: 'secondaryImage', labelKey: 'newsCmsFieldSecondaryImage', type: 'image' },
      { key: 'quote', labelKey: 'newsCmsFieldQuote', type: 'textarea', maxLength: 180 },
    ],
    validate: placeholderValidate,
    Renderer: RENDERERS['template-05-story-layout'],
  },
  {
    id: 'template-06-flyer',
    number: '06',
    nameKey: 'newsCmsTemplate06Name',
    purposeKey: 'newsCmsTemplate06Purpose',
    pageMode: 'multiple',
    orientation: 'a4-landscape',
    fields: [
      { key: 'pageCount', labelKey: 'newsCmsFieldPageCount', type: 'pageCount', helpKey: 'newsCmsFieldPageCountHelp' },
      { key: 'flyerPages', labelKey: 'newsCmsFieldPages', type: 'flyerPages', required: true, helpKey: 'newsCmsFlyerPagesHelp' },
    ],
    validate: template06Validate,
    Renderer: RENDERERS['template-06-flyer'],
  },
];

export function getNewsTemplate(id: string | null | undefined): NewsTemplateDefinition {
  return NEWS_TEMPLATE_REGISTRY.find((template) => template.id === id) || NEWS_TEMPLATE_REGISTRY[0];
}

export function isNewsTemplateId(id: string | null | undefined): id is NewsTemplateId {
  return NEWS_TEMPLATE_REGISTRY.some((template) => template.id === id);
}
