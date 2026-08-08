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
  return fields
    .filter((field) => ['text', 'textarea', 'richtext'].includes(field.type))
    .filter((field) => !hasText(active[field.key]))
    .map((field) => ({ key: field.key, labelKey: field.labelKey }));
}

/** Media/layout fields are shared: copy them from any language that has them. */
export function mergeSharedNewsFields(
  content: LocalizedNewsContent,
  lang: PortalUiLanguage,
  fields: Array<{ key: string; type: string }>,
): Record<string, unknown> {
  const active = { ...getExactNewsContent(content, lang) };
  const sharedTypes = ['image', 'file', 'featureBlocks', 'iconBlocks', 'pages', 'url'];
  for (const field of fields) {
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
