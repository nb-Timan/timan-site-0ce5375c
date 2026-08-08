import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { LocalizedNewsContent } from '@/features/news-cms/templates/types';

export const NEWS_CONTENT_LANGUAGES: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

export function emptyLocalizedContent(): LocalizedNewsContent {
  return NEWS_CONTENT_LANGUAGES.reduce((acc, lang) => {
    acc[lang] = {};
    return acc;
  }, {} as LocalizedNewsContent);
}

export function getLocalizedNewsContent(
  content: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
): Record<string, unknown> {
  if (!content) return {};
  return content[lang] || content.en || content.da || Object.values(content).find(Boolean) || {};
}

export function updateLocalizedNewsField(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fieldKey: string,
  value: unknown,
): LocalizedNewsContent {
  return {
    ...content,
    [lang]: {
      ...(content[lang] || {}),
      [fieldKey]: value,
    },
  };
}

/**
 * Editor view: returns ONLY the content stored for `lang`.
 * No silent fallback to Danish/English so missing translations stay visible.
 */
export function getExactNewsContent(
  content: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
): Record<string, unknown> {
  return (content?.[lang] as Record<string, unknown> | undefined) || {};
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : false;
}

/** Text field keys (of the given template) with no content in `lang`. */
export function missingTranslationFields(
  content: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
  fields: Array<{ key: string; type: string; labelKey: string }>,
): Array<{ key: string; labelKey: string }> {
  const active = getExactNewsContent(content, lang);
  const plain = fields
    .filter((field) => ['text', 'textarea', 'richtext'].includes(field.type))
    .filter((field) => !hasText(active[field.key]))
    .map((field) => ({ key: field.key, labelKey: field.labelKey }));
  // Template 06: a page without a headline in this language counts as missing.
  const flyer = fields
    .filter((field) => field.type === 'flyerPages')
    .filter((field) => {
      const pages = active[field.key];
      if (!Array.isArray(pages) || pages.length === 0) return true;
      return pages.some((page) => !hasText((page as { headline?: unknown })?.headline));
    })
    .map((field) => ({ key: field.key, labelKey: field.labelKey }));
  return [...plain, ...flyer];
}

/** Media/layout fields are shared: copy them from any language that has them. */
export function mergeSharedNewsFields(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fields: Array<{ key: string; type: string }>,
): Record<string, unknown> {
  const active = { ...getExactNewsContent(content, lang) };
  const sharedTypes = ['image', 'file', 'featureBlocks', 'iconBlocks', 'pages', 'url', 'pageCount'];
  for (const field of fields) {
    if (field.type === 'techBlocks') {
      if (Array.isArray(active[field.key])) continue;
      for (const code of NEWS_CONTENT_LANGUAGES) {
        const candidate = content?.[code]?.[field.key];
        if (Array.isArray(candidate)) {
          // Icon/colour are shared, heading + value stay per language.
          active[field.key] = candidate.map((item) => ({ ...(item as Record<string, unknown>), heading: '', description: '' }));
          break;
        }
      }
      continue;
    }
    if (field.type === 'flyerPages') {
      // Page images are shared, headline/subtitle/body stay per language.
      const own = Array.isArray(active[field.key]) ? (active[field.key] as Array<Record<string, unknown>>) : [];
      let shared: Array<Record<string, unknown>> | null = null;
      for (const code of NEWS_CONTENT_LANGUAGES) {
        const candidate = content?.[code]?.[field.key];
        if (Array.isArray(candidate) && candidate.some((item) => (item as { image?: string })?.image)) {
          shared = candidate as Array<Record<string, unknown>>;
          break;
        }
      }
      const length = Math.max(own.length, shared?.length ?? 0);
      if (length > 0) {
        active[field.key] = Array.from({ length }, (_, index) => ({
          headline: '',
          subtitle: '',
          body: '',
          ...(own[index] || {}),
          image: (own[index]?.image as string) || (shared?.[index]?.image as string) || '',
        }));
      }
      continue;
    }
    if (field.type === 'specRows') {
      if (Array.isArray(active[field.key])) continue;
      for (const code of NEWS_CONTENT_LANGUAGES) {
        const candidate = content?.[code]?.[field.key];
        if (Array.isArray(candidate)) {
          active[field.key] = candidate.map(() => ({ label: '', value: '' }));
          break;
        }
      }
      continue;
    }
    if (field.type === 'ctaLinks') {
      if (Array.isArray(active[field.key])) continue;
      for (const code of NEWS_CONTENT_LANGUAGES) {
        const candidate = content?.[code]?.[field.key];
        if (Array.isArray(candidate)) {
          // Structure (enabled/type/url) is shared, labels are per language.
          active[field.key] = candidate.map((item) => ({ ...(item as Record<string, unknown>), label: '' }));
          break;
        }
      }
      continue;
    }
    if (!sharedTypes.includes(field.type)) continue;
    if (active[field.key] !== undefined && active[field.key] !== null && active[field.key] !== '') continue;
    for (const code of NEWS_CONTENT_LANGUAGES) {
      const candidate = content?.[code]?.[field.key];
      if (candidate !== undefined && candidate !== null && candidate !== '') {
        active[field.key] = candidate;
        break;
      }
    }
  }
  return active;
}

/**
 * CTA links: `label` is stored per language, while `enabled`, `type` and `url`
 * are shared across every language version.
 */
export function updateCtaLinksField(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fieldKey: string,
  links: Array<Record<string, unknown>>,
): LocalizedNewsContent {
  return NEWS_CONTENT_LANGUAGES.reduce((acc, code) => {
    const existing = (content?.[code]?.[fieldKey] as Array<Record<string, unknown>> | undefined) || [];
    acc[code] = {
      ...(content?.[code] || {}),
      [fieldKey]: links.map((link, index) => ({
        ...link,
        label: code === lang ? link.label : (existing[index]?.label ?? ''),
      })),
    };
    return acc;
  }, { ...content } as LocalizedNewsContent);
}


/**
 * Technical highlight blocks: icon, colour and custom icon are shared across
 * languages, while heading/description are stored per language.
 */
export function updateTechBlocksField(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fieldKey: string,
  blocks: Array<Record<string, unknown>>,
): LocalizedNewsContent {
  return NEWS_CONTENT_LANGUAGES.reduce((acc, code) => {
    const existing = (content?.[code]?.[fieldKey] as Array<Record<string, unknown>> | undefined) || [];
    acc[code] = {
      ...(content?.[code] || {}),
      [fieldKey]: blocks.map((block, index) => ({
        ...block,
        heading: code === lang ? block.heading : (existing[index]?.heading ?? ''),
        description: code === lang ? block.description : (existing[index]?.description ?? ''),
      })),
    };
    return acc;
  }, { ...content } as LocalizedNewsContent);
}

/** Specification rows: row count is shared, label/value are per language. */
export function updateSpecRowsField(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fieldKey: string,
  rows: Array<Record<string, unknown>>,
): LocalizedNewsContent {
  return NEWS_CONTENT_LANGUAGES.reduce((acc, code) => {
    const existing = (content?.[code]?.[fieldKey] as Array<Record<string, unknown>> | undefined) || [];
    acc[code] = {
      ...(content?.[code] || {}),
      [fieldKey]: rows.map((row, index) =>
        code === lang ? { ...row } : { label: existing[index]?.label ?? '', value: existing[index]?.value ?? '' },
      ),
    };
    return acc;
  }, { ...content } as LocalizedNewsContent);
}

/** Writes a shared (non-text) field into every language version at once. */
export function updateSharedNewsField(
  content: LocalizedNewsContent,
  fieldKey: string,
  value: unknown,
): LocalizedNewsContent {
  return NEWS_CONTENT_LANGUAGES.reduce((acc, code) => {
    acc[code] = { ...(content?.[code] || {}), [fieldKey]: value };
    return acc;
  }, { ...content } as LocalizedNewsContent);
}


/**
 * Template 06 flyer pages: `image` is shared across every language while
 * headline/subtitle/body are stored per language. The first page headline is
 * mirrored to the top-level `headline` so the news title stays in sync.
 */
export function updateFlyerPagesField(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fieldKey: string,
  pages: Array<Record<string, unknown>>,
): LocalizedNewsContent {
  return NEWS_CONTENT_LANGUAGES.reduce((acc, code) => {
    const existing = (content?.[code]?.[fieldKey] as Array<Record<string, unknown>> | undefined) || [];
    const mine = code === lang;
    const next = pages.map((page, index) => {
      const prev = (existing[index] || {}) as Record<string, unknown>;
      const prevHighlights = (prev.highlights as Array<Record<string, unknown>> | undefined) || [];
      const prevSpecs = (prev.specs as Array<Record<string, unknown>> | undefined) || [];
      const prevLinks = (prev.links as Array<Record<string, unknown>> | undefined) || [];
      // Icons, images, colours and URLs are shared; all wording is per language.
      const highlights = ((page.highlights as Array<Record<string, unknown>> | undefined) || []).map((block, i) => ({
        ...block,
        heading: mine ? block.heading ?? '' : prevHighlights[i]?.heading ?? '',
        description: mine ? block.description ?? '' : prevHighlights[i]?.description ?? '',
      }));
      const specs = ((page.specs as Array<Record<string, unknown>> | undefined) || []).map((row, i) => ({
        label: mine ? row.label ?? '' : prevSpecs[i]?.label ?? '',
        value: mine ? row.value ?? '' : prevSpecs[i]?.value ?? '',
      }));
      const links = ((page.links as Array<Record<string, unknown>> | undefined) || []).map((link, i) => ({
        label: mine ? link.label ?? '' : prevLinks[i]?.label ?? '',
        url: link.url ?? '',
      }));
      return {
        headline: mine ? page.headline ?? '' : prev.headline ?? '',
        subtitle: mine ? page.subtitle ?? '' : prev.subtitle ?? '',
        body: mine ? page.body ?? '' : prev.body ?? '',
        image: page.image ?? '',
        secondaryImage: page.secondaryImage ?? '',
        highlights,
        specs,
        links,
      };
    });

    acc[code] = {
      ...(content?.[code] || {}),
      [fieldKey]: next,
      headline: (next[0]?.headline as string) || (content?.[code]?.headline as string) || '',
    };
    return acc;
  }, { ...content } as LocalizedNewsContent);
}
