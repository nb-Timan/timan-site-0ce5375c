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
