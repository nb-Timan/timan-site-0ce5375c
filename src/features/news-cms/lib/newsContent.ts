import type { NewsFieldDefinition } from '@/features/news-cms/templates/types';
import { PORTAL_LANGUAGE_CODES, portalLanguageLookupOrder, type PortalUiLanguage } from '@/lib/portalLanguages';
import type { LocalizedNewsContent } from '@/features/news-cms/templates/types';

export const NEWS_CONTENT_LANGUAGES: PortalUiLanguage[] = [...PORTAL_LANGUAGE_CODES];

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
  const contentByLanguage = content as Record<string, Record<string, unknown> | undefined>;
  for (const languageKey of portalLanguageLookupOrder(lang, true)) {
    const value = contentByLanguage[languageKey];
    if (value && Object.keys(value).length > 0) return value;
  }
  return {};
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

function fieldHasTextInAnyLanguage(
  content: LocalizedNewsContent | null | undefined,
  key: string,
): boolean {
  return NEWS_CONTENT_LANGUAGES.some((code) => hasText(content?.[code]?.[key]));
}

function firstArrayForField(
  content: LocalizedNewsContent | null | undefined,
  key: string,
): Array<Record<string, unknown>> {
  for (const code of NEWS_CONTENT_LANGUAGES) {
    const candidate = content?.[code]?.[key];
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function anyLanguageHasArrayText(
  content: LocalizedNewsContent | null | undefined,
  key: string,
  index: number,
  nestedKey: string,
): boolean {
  return NEWS_CONTENT_LANGUAGES.some((code) => {
    const candidate = content?.[code]?.[key];
    if (!Array.isArray(candidate)) return false;
    return hasText((candidate[index] as Record<string, unknown> | undefined)?.[nestedKey]);
  });
}

function blockFieldMissing(
  content: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
  key: string,
  nestedKeys: string[],
): boolean {
  const baseline = firstArrayForField(content, key);
  if (baseline.length === 0) return false;
  const active = content?.[lang]?.[key];
  if (!Array.isArray(active)) return true;
  return baseline.some((_, index) =>
    nestedKeys.some((nestedKey) => {
      const shouldRequire = anyLanguageHasArrayText(content, key, index, nestedKey);
      if (!shouldRequire) return false;
      return !hasText((active[index] as Record<string, unknown> | undefined)?.[nestedKey]);
    }),
  );
}

function ctaLinksMissing(
  content: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
  key: string,
): boolean {
  const baseline = firstArrayForField(content, key);
  if (baseline.length === 0) return false;
  const active = content?.[lang]?.[key];
  if (!Array.isArray(active)) return true;
  return baseline.some((link, index) => {
    const enabled = Boolean(link.enabled);
    if (!enabled) return false;
    return !hasText((active[index] as Record<string, unknown> | undefined)?.label);
  });
}

function flyerPagesMissing(
  content: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
  key: string,
): boolean {
  const baseline = firstArrayForField(content, key);
  if (baseline.length === 0) return true;
  const active = content?.[lang]?.[key];
  if (!Array.isArray(active)) return true;
  return baseline.some((_, index) =>
    ['headline', 'subtitle', 'body'].some((nestedKey) => {
      const shouldRequire = index === 0 && nestedKey === 'headline'
        ? true
        : anyLanguageHasArrayText(content, key, index, nestedKey);
      if (!shouldRequire) return false;
      return !hasText((active[index] as Record<string, unknown> | undefined)?.[nestedKey]);
    }),
  );
}

/** Text field keys (of the given template) with no content in `lang`. */
export function missingTranslationFields(
  content: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
  fields: Array<Pick<NewsFieldDefinition, 'key' | 'type' | 'labelKey' | 'required'>>,
): Array<{ key: string; labelKey: string }> {
  const active = getExactNewsContent(content, lang);
  return fields
    .filter((field) => {
      if (['text', 'textarea', 'richtext'].includes(field.type)) {
        const shouldRequire = Boolean(field.required) || fieldHasTextInAnyLanguage(content, field.key);
        return shouldRequire && !hasText(active[field.key]);
      }
      if (['featureBlocks', 'techBlocks'].includes(field.type)) {
        return blockFieldMissing(content, lang, field.key, ['heading', 'description']);
      }
      if (field.type === 'specRows') {
        return blockFieldMissing(content, lang, field.key, ['label', 'value']);
      }
      if (field.type === 'ctaLinks') {
        return ctaLinksMissing(content, lang, field.key);
      }
      if (field.type === 'flyerPages') {
        return flyerPagesMissing(content, lang, field.key);
      }
      return false;
    })
    .map((field) => ({ key: field.key, labelKey: field.labelKey }));
}

export function completedNewsLanguages(
  content: LocalizedNewsContent | null | undefined,
  fields: Array<Pick<NewsFieldDefinition, 'key' | 'type' | 'labelKey' | 'required'>>,
): PortalUiLanguage[] {
  return NEWS_CONTENT_LANGUAGES.filter((lang) => missingTranslationFields(content, lang, fields).length === 0);
}

export function missingNewsLanguages(
  content: LocalizedNewsContent | null | undefined,
  fields: Array<Pick<NewsFieldDefinition, 'key' | 'type' | 'labelKey' | 'required'>>,
): PortalUiLanguage[] {
  return NEWS_CONTENT_LANGUAGES.filter((lang) => missingTranslationFields(content, lang, fields).length > 0);
}

/** Media/layout fields are shared: copy them from any language that has them. */
export function mergeSharedNewsFields(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fields: Array<{ key: string; type: string }>,
): Record<string, unknown> {
  const active = { ...getExactNewsContent(content, lang) };
  const sharedTypes = ['image', 'file', 'iconBlocks', 'pages', 'url', 'pageCount'];
  for (const field of fields) {
    if (field.type === 'featureBlocks') {
      if (Array.isArray(active[field.key])) continue;
      for (const code of NEWS_CONTENT_LANGUAGES) {
        const candidate = content?.[code]?.[field.key];
        if (Array.isArray(candidate)) {
          // Icon/colour are shared, heading + description stay per language.
          active[field.key] = candidate.map((item) => ({ ...(item as Record<string, unknown>), heading: '', description: '' }));
          break;
        }
      }
      continue;
    }
    if (field.type === 'techBlocks') {
      const own = Array.isArray(active[field.key]) ? (active[field.key] as Array<Record<string, unknown>>) : [];
      let shared: Array<Record<string, unknown>> | null = null;
      for (const code of NEWS_CONTENT_LANGUAGES) {
        const candidate = content?.[code]?.[field.key];
        if (Array.isArray(candidate)) {
          shared = candidate as Array<Record<string, unknown>>;
          break;
        }
      }
      const length = Math.max(own.length, shared?.length ?? 0);
      if (length > 0) {
        // Icon/colour are shared, heading + description stay per language.
        active[field.key] = Array.from({ length }, (_, index) => ({
          ...(shared?.[index] || {}),
          ...(own[index] || {}),
          heading: own[index]?.heading ?? '',
          description: own[index]?.description ?? '',
        }));
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
      const own = Array.isArray(active[field.key]) ? (active[field.key] as Array<Record<string, unknown>>) : [];
      let sharedLength = 0;
      for (const code of NEWS_CONTENT_LANGUAGES) {
        const candidate = content?.[code]?.[field.key];
        if (Array.isArray(candidate)) {
          sharedLength = candidate.length;
          break;
        }
      }
      const length = Math.max(own.length, sharedLength);
      if (length > 0) {
        active[field.key] = Array.from({ length }, (_, index) => ({
          label: own[index]?.label ?? '',
          value: own[index]?.value ?? '',
        }));
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
 * Feature blocks: icon, colour and custom icon are shared across languages,
 * while heading/description are stored per language.
 */
export function updateFeatureBlocksField(
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
