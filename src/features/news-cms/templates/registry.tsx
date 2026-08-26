import timanLogo from '@/assets/timan-logo-transparent-trimmed.png';
import { Badge, FileText, Image as ImageIcon, ListChecks, Quote } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { t } from '@/lib/i18n/translations';
import { FeatureIconMark, normalizeFeatureBlocks } from '@/features/news-cms/lib/featureIcons';
import { filledSpecRows, normalizeTechBlocks } from '@/features/news-cms/lib/techBlocks';
import { activeCtaLinks, ctaTypeOption, invalidCtaLinks } from '@/features/news-cms/lib/ctaLinks';
import {
  activeFlyerLinks,

  emptyFlyerPage,
  filledFlyerSpecs,
  flyerPagesFromContent,
  flyerTextLimits,
  normalizeFlyerHighlights,
} from '@/features/news-cms/lib/flyerPages';
import type { NewsFlyerPage, NewsImageTransform, NewsRendererProps, NewsTemplateDefinition, NewsTemplateId } from './types';


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
// Measured on the intrinsic 1123x794 A4 canvas: with a worst-case two-line
// headline and two-line subtitle, the body zone can grow to ~9 lines before
// the 2x2 tech grid reaches its lowest safe position (48px bottom margin).
const TPL04_BODY_MAX = 560;

// Caption block beside the overlapping secondary photo: 2 clamped heading
// lines and 6 clamped text lines in a fixed 8.4rem tall, ~24% wide zone.
const TPL04_SECONDARY_HEADING_MAX = 26;
const TPL04_SECONDARY_TEXT_MAX = 120;



function template04Validate(content: Record<string, unknown>) {
  const base = placeholderValidate(content);
  const limits: Array<[string, number]> = [
    ['headline', TPL04_HEADLINE_MAX],
    ['subtitle', TPL04_SUBTITLE_MAX],
    ['body', TPL04_BODY_MAX],
    ['secondaryHeading', TPL04_SECONDARY_HEADING_MAX],
    ['secondaryText', TPL04_SECONDARY_TEXT_MAX],

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
  const tooLong = pages.some((page, index) => {
    const limits = flyerTextLimits(index);
    return (
      page.headline.length > limits.headline ||
      page.subtitle.length > limits.subtitle ||
      page.body.length > limits.body
    );
  });

  if (tooLong) issues.push({ fieldKey: 'flyerPages', messageKey: 'newsCmsValidationTooLong' });
  return { valid: issues.length === 0, issues };
}

function text(content: Record<string, unknown>, key: string, fallback: string) {
  const value = content[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function imageTransform(content: Record<string, unknown>, key: string): NewsImageTransform | undefined {
  const value = content[key];
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<NewsImageTransform>;
  const x = typeof candidate.x === 'number' ? candidate.x : 0;
  const y = typeof candidate.y === 'number' ? candidate.y : 0;
  const scale = typeof candidate.scale === 'number' ? candidate.scale : 1;
  return {
    x: Math.min(45, Math.max(-45, x)),
    y: Math.min(45, Math.max(-45, y)),
    scale: Math.min(2.5, Math.max(1, scale)),
  };
}

/** Intrinsic A4 landscape design size (px) used by scale-to-fit templates. */
const A4_BASE_WIDTH = 1123;
const A4_BASE_HEIGHT = 794;

/**
 * Renders a fixed A4 design box and scales the whole composition down to the
 * available width, so the geometry stays proportional at every preview size
 * instead of reflowing. Opt-in: only templates that request it are affected.
 */
function ScaleToFit({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setScale((host.clientWidth || A4_BASE_WIDTH) / A4_BASE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={hostRef} className="relative h-full w-full overflow-hidden">
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: A4_BASE_WIDTH, height: A4_BASE_HEIGHT, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

function TemplateShell({
  children,
  lang,
  logoAlign = 'right',
  logoSize = 'default',
  scaleToFit = false,
  showLogo = true,
  showDecor = true,
}: {
  children: ReactNode;
  lang?: NewsRendererProps['lang'];
  logoAlign?: 'left' | 'right';
  logoSize?: 'default' | 'sm';
  scaleToFit?: boolean;
  /** Pages that place the logo inside their own composition opt out. */
  showLogo?: boolean;
  /** Bottom-left green/red mark; pages that use that corner opt out. */
  showDecor?: boolean;
}) {
  const inner = (
    <div className="relative h-full overflow-hidden rounded-lg border border-slate-200 bg-white">
      {showLogo && (
        <img
          src={timanLogo}
          alt="TIMAN"
          className={`pointer-events-none absolute top-7 z-20 w-auto max-w-[38%] select-none object-contain ${
            logoSize === 'sm' ? 'h-[6.8rem]' : 'h-32'
          } ${logoAlign === 'left' ? 'left-8' : 'right-8'}`}
          draggable={false}
        />
      )}


      {showDecor && (
        <>
          <div className="absolute -left-12 bottom-0 h-32 w-40 -skew-x-12 bg-emerald-600" />
          <div className="absolute left-24 bottom-0 h-32 w-6 -skew-x-12 bg-rose-500" />
        </>
      )}
      <div className="relative h-full p-7">{children}</div>
    </div>
  );

  return (
    <div className="aspect-[1.414/1] w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      {scaleToFit ? <ScaleToFit>{inner}</ScaleToFit> : inner}
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
  const mainImage = text(content, 'mainImage', '');
  return (
    <TemplateShell lang={lang}>
      <div className="grid h-full min-w-0 grid-cols-[1.05fr_0.95fr] gap-8">
        <div className="relative h-full min-w-0">
          <TemplateImage
            url={mainImage}
            label={t('newsCmsWireLargeImage', lang)}
            className="h-full"
            transform={imageTransform(content, 'mainImageTransform')}
          />
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

function TemplateImage({
  url,
  label,
  className = '',
  transform,
}: {
  url: string;
  label: string;
  className?: string;
  transform?: NewsImageTransform;
}) {
  if (!url) return <ImageBox label={label} className={className} />;
  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${className}`}>
      <img
        src={url}
        alt=""
        className={`h-full w-full ${transform ? 'object-contain' : 'object-cover'}`}
        draggable={false}
        style={
          transform
            ? {
                transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.scale})`,
                transformOrigin: 'center',
              }
            : undefined
        }
      />
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
          <TemplateImage
            url={mainImage}
            label={t('newsCmsWireLargeImage', lang)}
            className="h-full"
            transform={imageTransform(content, 'mainImageTransform')}
          />
          <div className="grid min-w-0 grid-cols-[0.9fr_1.1fr] gap-4">
            <TemplateImage
              url={secondaryImage}
              label={t('newsCmsWireSmallImage', lang)}
              className="h-full"
              transform={imageTransform(content, 'secondaryImageTransform')}
            />
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

/**
 * Template 04 left composition: a large primary photo with a slanted right
 * edge (top edge further left, bottom edge further right), a thin Timan-green
 * stripe of constant thickness following that diagonal, and a smaller
 * secondary photo near the bottom that overlaps the primary photo, crosses the
 * green diagonal and reaches into the white area. The secondary caption sits
 * to the right of that photo. Every element is absolutely positioned in
 * percentages of the fixed A4 column, so the geometry scales as one
 * composition and no text can move or resize it.
 */
function Template04Composition({ content, lang }: Pick<NewsRendererProps, 'content' | 'lang'>) {
  const productImage = text(content, 'productImage', '');
  const secondaryImage = text(content, 'secondaryImage', '');
  const secondaryHeading = text(content, 'secondaryHeading', '');
  const secondaryText = text(content, 'secondaryText', '');
  return (
    <div className="relative h-full min-w-0">
      {/* Large photo: wide at the top, only gradually narrower toward the bottom. */}
      <div className="absolute inset-0 z-0 overflow-hidden" style={{ clipPath: 'polygon(0 0, 94% 0, 76% 100%, 0 100%)' }}>
        <TemplateImage
          url={productImage}
          label={t('newsCmsWireProductImage', lang)}
          className="h-full w-full rounded-none border-0 object-cover"
          transform={imageTransform(content, 'productImageTransform')}
        />
      </div>
      {/* Constant-thickness green separator, parallel to the photo edge. */}
      <div
        className="absolute inset-0 z-10 bg-emerald-600"
        style={{ clipPath: 'polygon(94% 0, 97.2% 0, 79.2% 100%, 76% 100%)' }}
      />

      {/* Secondary image: ~25% larger, still overlapping the large photo by ~1/3 of its own width. */}
      <div className="absolute bottom-[1.1rem] left-[54.5%] z-20 h-[13.25rem] w-[65%] overflow-hidden rounded-lg border border-white bg-white shadow-[0_8px_20px_-8px_rgba(15,23,42,0.55)]">
        <TemplateImage
          url={secondaryImage}
          label={t('newsCmsFieldSecondaryImage', lang)}
          className="h-full w-full rounded-none border-0 object-cover"
          transform={imageTransform(content, 'secondaryImageTransform')}
        />
      </div>

      <div className="absolute bottom-[1.1rem] left-[122.5%] z-20 flex h-[13.25rem] w-[46%] min-w-0 flex-col justify-start overflow-hidden pt-1">
        <p className="line-clamp-2 text-[1.5rem] font-bold leading-tight text-emerald-700 [overflow-wrap:anywhere]">
          {secondaryHeading || t('newsCmsWireSecondaryHeading', lang)}
        </p>
        <p className="mt-2 line-clamp-5 text-[1.1rem] font-normal leading-[1.45] text-slate-700 [overflow-wrap:anywhere]">
          {secondaryText || t('newsCmsWireSecondaryText', lang)}
        </p>
      </div>

    </div>
  );
}

function Template04({ content, lang }: NewsRendererProps) {
  const blocks = normalizeTechBlocks(content.techBlocks);
  const specs = filledSpecRows(content.specRows);
  const body = text(content, 'body', '');
  return (
    <TemplateShell lang={lang} logoSize="sm" scaleToFit>

      <div className="grid h-full min-w-0 grid-cols-[0.98fr_1.02fr] gap-6">
        <Template04Composition content={content} lang={lang} />

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
                  className="flex h-[5rem] min-w-0 items-start gap-2.5 overflow-hidden rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-100"
                >
                  <FeatureIconMark block={block} size="sm" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[1rem] font-black leading-tight text-slate-950 [overflow-wrap:anywhere]">
                      {block.heading || t('newsCmsTechHeading', lang)}
                    </p>
                    {block.description ? (
                      <p className="mt-0.5 line-clamp-2 text-[0.8rem] font-medium leading-[1.32] text-slate-600 [overflow-wrap:anywhere]">
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
                  <p className="mb-2 text-[0.75rem] font-black uppercase tracking-[0.14em] text-slate-500">
                    {t('newsCmsSpecificationsTitle', lang)}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-1">
                    {specs.map((row, index) => (
                      <div key={index} className="flex min-w-0 items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
                        <dt className="min-w-0 text-[0.84rem] font-semibold text-slate-500 [overflow-wrap:anywhere]">{row.label}</dt>
                        <dd className="min-w-0 text-right text-[0.84rem] font-bold text-slate-900 [overflow-wrap:anywhere]">{row.value}</dd>
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
 * Template 05 is a fixed A4 story composition. It scales as one surface so the
 * editor preview, overview preview and public modal keep the same wrapping and
 * do not hide body/key-point text in narrower containers.
 */
function Template05({ content, lang }: NewsRendererProps) {
  const body = text(content, 'body', '');
  const quote = text(content, 'quote', '');
  return (
    <TemplateShell lang={lang} logoAlign="left" logoSize="sm" scaleToFit>
      <div className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-7">
        {/* Text column: fixed zones inside the intrinsic A4 canvas. */}
        <div className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
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
              <p className="max-w-full whitespace-pre-line text-[0.86rem] font-normal leading-[1.48] text-slate-700 [overflow-wrap:anywhere]">
                {body}
              </p>
            ) : (
              <TextLines lines={5} />
            )}
          </div>
          <div className="mt-4 min-w-0">
            <div className="rounded-xl border-l-4 border-emerald-600 bg-emerald-50 p-4">
              <p className="text-sm font-semibold leading-snug text-slate-700 [overflow-wrap:anywhere]">
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
 * Template 06 – flyer. Three distinct fixed A4 landscape compositions that
 * share the Timan identity (logo, green, red accent, radius, type scale):
 *   page 1 = hero / intro          (headline column beside a dominant image)
 *   page 2 = product story         (wide hero band, editorial body, 3 highlights)
 *   page 3 = specifications + CTA  (image beside a fact list, closing actions)
 * All zones are fixed rows/columns with overflow hidden, so text can never
 * push an image, resize the canvas or drop the CTA off the page.
 */
function FlyerNewsBadge({ lang }: { lang: NewsRendererProps['lang'] }) {
  return (
    <span className="absolute right-3 top-3 z-10 rounded-[4px] bg-[var(--timan-green)] px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-white shadow-sm">
      {t('newsCmsBadgeNews', lang)}
    </span>
  );
}

/** Page 1 – hero / intro. */
function FlyerPage1({ page, lang }: { page: NewsFlyerPage; lang: NewsRendererProps['lang'] }) {
  return (
    <TemplateShell lang={lang} logoAlign="left" logoSize="sm" scaleToFit>
      <div className="grid h-full min-w-0 grid-cols-[1.04fr_0.96fr] gap-8">
        {/* Text column: fixed rows — branding zone, header zone, body zone. */}
        <div className="grid min-w-0 grid-rows-[7.5rem_auto_minmax(0,1fr)] overflow-hidden">
          <div aria-hidden />
          <div className="min-w-0">
            <div className="mb-4 h-1.5 w-28 rounded-full bg-emerald-600" />
            <h3 className="line-clamp-3 text-[2.35rem] font-black leading-[1.08] tracking-tight text-slate-950 [overflow-wrap:anywhere]">
              {page.headline || t('newsCmsWireHeadline', lang)}
            </h3>
            <p className="mt-3 line-clamp-2 text-xl font-semibold leading-snug text-emerald-700 [overflow-wrap:anywhere]">
              {page.subtitle || t('newsCmsWireSubtitle', lang)}
            </p>
          </div>
          <div className="mt-5 min-h-0 min-w-0 overflow-hidden border-t border-slate-200 pt-4">
            {page.body ? (
              <p className="max-w-full whitespace-pre-line text-[0.95rem] font-normal leading-6 text-slate-700 [overflow-wrap:anywhere]">
                {page.body}
              </p>
            ) : (
              <TextLines lines={5} />
            )}
          </div>
        </div>
        {/* Image column: fixed, never affected by text length. */}
        <div className="relative h-full min-h-0 min-w-0">
          <TemplateImage url={page.image} label={t('newsCmsWirePagePreview', lang)} className="h-full" />
          <FlyerNewsBadge lang={lang} />
        </div>
      </div>
    </TemplateShell>
  );
}

/**
 * Page 2 – product story. Editorial composition: a wide hero band across the
 * top, then a body column beside a small secondary image, closing with three
 * fixed highlight cards.
 */
function FlyerPage2({ page, lang }: { page: NewsFlyerPage; lang: NewsRendererProps['lang'] }) {
  const highlights = normalizeFlyerHighlights(page.highlights);
  return (
    <TemplateShell lang={lang} scaleToFit showLogo={false} showDecor={false}>
      <div className="grid h-full min-w-0 grid-rows-[2.6rem_minmax(0,1fr)_auto_minmax(0,1fr)_6.2rem] gap-4 overflow-hidden">
        {/* Masthead: small logo, thin green rule. */}
        <div className="flex min-w-0 items-center gap-4">
          <img src={timanLogo} alt="TIMAN" className="h-9 w-auto shrink-0 object-contain" draggable={false} />
          <span className="h-1 min-w-0 flex-1 rounded-full bg-emerald-600" />
          <span className="h-1 w-6 shrink-0 rounded-full bg-rose-500" />
        </div>

        {/* Wide hero band. */}
        <div className="relative min-h-0 min-w-0">
          <TemplateImage url={page.image} label={t('newsCmsFlyerMainImage', lang)} className="h-full" />
        </div>

        {/* Header zone. */}
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[1.85rem] font-black leading-[1.1] tracking-tight text-slate-950 [overflow-wrap:anywhere]">
            {page.headline || t('newsCmsWireHeadline', lang)}
          </h3>
          <p className="mt-1.5 line-clamp-1 text-base font-semibold leading-snug text-emerald-700 [overflow-wrap:anywhere]">
            {page.subtitle || t('newsCmsWireSubtitle', lang)}
          </p>
        </div>

        {/* Body beside the smaller secondary image. */}
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_13rem] gap-5 overflow-hidden">
          <div className="min-h-0 min-w-0 overflow-hidden border-t border-slate-200 pt-3">
            {page.body ? (
              <p className="max-w-full whitespace-pre-line text-[0.86rem] font-normal leading-[1.55] text-slate-700 [overflow-wrap:anywhere]">
                {page.body}
              </p>
            ) : (
              <TextLines lines={4} />
            )}
          </div>
          <TemplateImage url={page.secondaryImage} label={t('newsCmsFlyerSecondaryImage', lang)} className="h-full min-h-0" />
        </div>

        {/* Three fixed highlight cards. */}
        <div className="grid min-w-0 grid-cols-3 gap-4 overflow-hidden">
          {highlights.map((block, index) => (
            <div key={index} className="flex min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <FeatureIconMark block={block} size="sm" />
              <div className="min-w-0">
                <p className="line-clamp-1 text-[0.8rem] font-bold leading-tight text-slate-900 [overflow-wrap:anywhere]">
                  {block.heading || `${t('newsCmsFlyerHighlight', lang)} ${index + 1}`}
                </p>
                <p className="mt-1 line-clamp-2 text-[0.72rem] font-normal leading-snug text-slate-600 [overflow-wrap:anywhere]">
                  {block.description || t('newsCmsWireBody', lang)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </TemplateShell>
  );
}

/** Page 3 – specifications and closing call to action. */
function FlyerPage3({ page, lang }: { page: NewsFlyerPage; lang: NewsRendererProps['lang'] }) {
  const specs = filledFlyerSpecs(page.specs);
  const links = activeFlyerLinks(page.links);
  return (
    <TemplateShell lang={lang} scaleToFit showLogo={false} showDecor={false}>
      <div className={`grid h-full min-w-0 gap-5 overflow-hidden ${links.length > 0 ? 'grid-rows-[auto_minmax(0,1fr)_4.4rem]' : 'grid-rows-[auto_minmax(0,1fr)]'}`}>
        {/* Header: medium logo beside headline block. */}
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-6 border-b border-slate-200 pb-4">
          <img src={timanLogo} alt="TIMAN" className="h-16 w-auto shrink-0 object-contain" draggable={false} />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[1.7rem] font-black leading-[1.1] tracking-tight text-slate-950 [overflow-wrap:anywhere]">
              {page.headline || t('newsCmsWireHeadline', lang)}
            </h3>
            <p className="mt-1 line-clamp-1 text-[0.95rem] font-semibold leading-snug text-emerald-700 [overflow-wrap:anywhere]">
              {page.subtitle || t('newsCmsWireSubtitle', lang)}
            </p>
            <p className="mt-1.5 line-clamp-2 text-[0.82rem] font-normal leading-[1.5] text-slate-600 [overflow-wrap:anywhere]">
              {page.body || t('newsCmsWireBody', lang)}
            </p>
          </div>
        </div>

        {/* Image beside the specification list. */}
        <div className="grid min-h-0 min-w-0 grid-cols-[0.86fr_1.14fr] gap-7 overflow-hidden">
          <div className="relative min-h-0 min-w-0">
            <TemplateImage url={page.image} label={t('newsCmsFlyerMainImage', lang)} className="h-full" />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-slate-500">
                {t('newsCmsFlyerSpecTitle', lang)}
              </span>
              <span className="h-1 w-10 rounded-full bg-emerald-600" />
            </div>
            {specs.length > 0 ? (
              <dl className="min-h-0 overflow-hidden">
                {specs.map((row, index) => (
                  <div
                    key={index}
                    className="flex items-baseline justify-between gap-4 border-b border-dotted border-slate-300 py-[0.52rem]"
                  >
                    <dt className="line-clamp-1 min-w-0 text-[0.85rem] font-medium text-slate-600 [overflow-wrap:anywhere]">{row.label}</dt>
                    <dd className="line-clamp-1 shrink-0 text-[0.9rem] font-bold text-slate-900 [overflow-wrap:anywhere]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <TextLines lines={6} />
            )}
          </div>
        </div>

        {/* Closing CTA — collapses completely when no link is configured. */}
        {links.length > 0 && (
          <div className="flex min-w-0 items-center gap-3 overflow-hidden border-t border-slate-200 pt-3">
            {links.map((link, index) => (
              <a
                key={index}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex max-w-[18rem] items-center gap-2 rounded-lg px-5 py-2.5 text-[0.85rem] font-bold leading-tight transition ${
                  index === 0
                    ? 'bg-[var(--timan-green)] text-white'
                    : 'border-2 border-[var(--timan-green)] bg-white text-emerald-700'
                }`}
              >
                <span className="line-clamp-1 [overflow-wrap:anywhere]">{link.label}</span>
              </a>
            ))}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="h-6 w-4 -skew-x-12 rounded-[2px] bg-emerald-600" />
              <span className="h-6 w-1.5 -skew-x-12 rounded-[2px] bg-rose-500" />
            </span>
          </div>
        )}
      </div>
    </TemplateShell>
  );
}

function Template06({ content, lang, page = 1 }: NewsRendererProps) {
  const pages = flyerPagesFromContent(content);
  const index = Math.min(Math.max(page, 1), pages.length) - 1;
  const current = pages[index] || emptyFlyerPage(index);
  if (index === 1) return <FlyerPage2 page={current} lang={lang} />;
  if (index === 2) return <FlyerPage3 page={current} lang={lang} />;
  return <FlyerPage1 page={current} lang={lang} />;
}

function CustomTiman3330Seat({ content, lang }: NewsRendererProps) {
  const mainImage = text(content, 'mainImage', '');
  const headline = text(content, 'headline', 'Superior operator comfort');
  const subtitle = text(content, 'subtitle', 'Timan 3330');
  const body = text(content, 'body', '');
  const ctaLabel = text(content, 'cta_label', 'Læs mere');
  const ctaUrl = text(content, 'cta_url', '');

  return (
    <TemplateShell lang={lang} scaleToFit showLogo={false} showDecor={false}>
      <div className="grid h-full grid-cols-[0.92fr_1.08fr] gap-8 overflow-hidden bg-white">
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-black p-4">
          {mainImage ? (
            <img src={mainImage} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
          ) : (
            <ImageBox label={t('newsCmsFieldMainImage', lang)} className="h-full w-full" />
          )}
        </div>
        <div className="flex min-h-0 flex-col justify-center overflow-hidden pr-6">
          <img src={timanLogo} alt="TIMAN" className="mb-10 h-24 w-auto self-start object-contain" draggable={false} />
          <span className="mb-5 inline-flex w-fit rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-black uppercase tracking-[0.12em] text-emerald-700">
            {t('newsCmsBadgeNews', lang)}
          </span>
          <h2 className="max-w-[30rem] text-5xl font-black leading-[0.98] tracking-normal text-slate-950">{headline}</h2>
          <p className="mt-4 max-w-[31rem] text-2xl font-bold leading-snug text-emerald-700">{subtitle}</p>
          {body && <p className="mt-6 max-w-[33rem] text-lg leading-8 text-slate-700">{body}</p>}
          {ctaUrl && (
            <a
              href={ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex w-fit rounded-xl bg-[var(--timan-green)] px-6 py-3 text-base font-bold text-white shadow-sm"
            >
              {ctaLabel}
            </a>
          )}
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
  'custom-timan-3330-seat': CustomTiman3330Seat,
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
      { key: 'secondaryImage', labelKey: 'newsCmsFieldSecondaryImage', type: 'image' },
      {
        key: 'secondaryHeading',
        labelKey: 'newsCmsFieldSecondaryHeading',
        type: 'text',
        maxLength: TPL04_SECONDARY_HEADING_MAX,
      },
      {
        key: 'secondaryText',
        labelKey: 'newsCmsFieldSecondaryText',
        type: 'textarea',
        maxLength: TPL04_SECONDARY_TEXT_MAX,
      },

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
  {
    id: 'custom-timan-3330-seat',
    number: 'CUSTOM',
    nameKey: 'newsCmsCustomTiman3330SeatName',
    purposeKey: 'newsCmsCustomTiman3330SeatPurpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    availableInPicker: false,
    fields: [
      ...baseFields,
      { key: 'mainImage', labelKey: 'newsCmsFieldMainImage', type: 'image', required: true },
      { key: 'cta_label', labelKey: 'newsCmsFieldCtaLabel', type: 'text', maxLength: 60 },
      { key: 'cta_url', labelKey: 'newsCmsFieldCtaUrl', type: 'url' },
    ],
    validate: placeholderValidate,
    Renderer: RENDERERS['custom-timan-3330-seat'],
  },
];

export function getNewsTemplate(id: string | null | undefined): NewsTemplateDefinition {
  return NEWS_TEMPLATE_REGISTRY.find((template) => template.id === id) || NEWS_TEMPLATE_REGISTRY[0];
}

export function isNewsTemplateId(id: string | null | undefined): id is NewsTemplateId {
  return NEWS_TEMPLATE_REGISTRY.some((template) => template.id === id);
}
