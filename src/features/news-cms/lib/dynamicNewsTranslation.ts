import { supabase } from '@/lib/supabase';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { LocalizedNewsContent, NewsFieldDefinition } from '@/features/news-cms/templates/types';
import { NEWS_CONTENT_LANGUAGES } from '@/features/news-cms/lib/newsContent';

export const NEWS_TRANSLATION_META_KEY = 'news_translation_meta';

type NewsTranslationMetaEntry = {
  mode: 'auto';
  provider: 'openai';
  model: string;
  sourceLanguage: PortalUiLanguage;
  sourceHash: string;
  translatedAt: string;
};

type NewsTranslationMeta = Partial<Record<PortalUiLanguage, Record<string, NewsTranslationMetaEntry>>>;

type TranslateNewsContentInput = {
  localizedContent: LocalizedNewsContent;
  previousLocalizedContent?: LocalizedNewsContent | null;
  templateData?: Record<string, unknown> | null;
  fields: NewsFieldDefinition[];
  sourceLanguage: PortalUiLanguage;
};

type TranslateNewsContentResult = {
  localizedContent: LocalizedNewsContent;
  templateData: Record<string, unknown>;
  translatedLanguages: PortalUiLanguage[];
  skippedManual: Array<{ language: PortalUiLanguage; path: string }>;
  error: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTranslationMeta(templateData?: Record<string, unknown> | null): NewsTranslationMeta {
  const meta = templateData?.[NEWS_TRANSLATION_META_KEY];
  return isRecord(meta) ? meta as NewsTranslationMeta : {};
}

function cleanFunctionError(error: unknown): string {
  if (!error) return 'Ukendt oversættelsesfejl.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return 'Ukendt oversættelsesfejl.';
}

export function markNewsLanguageAsManual(templateData: Record<string, unknown>, language: PortalUiLanguage): Record<string, unknown> {
  const meta = getTranslationMeta(templateData);
  if (!meta[language]) return templateData;

  const nextMeta: NewsTranslationMeta = { ...meta };
  delete nextMeta[language];
  return {
    ...templateData,
    [NEWS_TRANSLATION_META_KEY]: nextMeta,
  };
}

export async function translateNewsContentDynamically(input: TranslateNewsContentInput): Promise<TranslateNewsContentResult> {
  const templateData = input.templateData || {};
  const translationMeta = getTranslationMeta(templateData);
  const targetLanguages = NEWS_CONTENT_LANGUAGES.filter((language) => language !== input.sourceLanguage);

  const { data, error } = await supabase.functions.invoke('translate-news-content', {
    body: {
      sourceLanguage: input.sourceLanguage,
      targetLanguages,
      fields: input.fields.map((field) => ({ key: field.key, type: field.type })),
      localizedContent: input.localizedContent,
      previousLocalizedContent: input.previousLocalizedContent || null,
      translationMeta,
    },
  });

  if (error) {
    return {
      localizedContent: input.localizedContent,
      templateData,
      translatedLanguages: [],
      skippedManual: [],
      error: cleanFunctionError(error),
    };
  }

  if (!isRecord(data) || !isRecord(data.localizedContent)) {
    return {
      localizedContent: input.localizedContent,
      templateData,
      translatedLanguages: [],
      skippedManual: [],
      error: 'Oversættelsesfunktionen svarede ikke med gyldigt nyhedsindhold.',
    };
  }

  return {
    localizedContent: data.localizedContent as LocalizedNewsContent,
    templateData: {
      ...templateData,
      [NEWS_TRANSLATION_META_KEY]: isRecord(data.translationMeta) ? data.translationMeta : translationMeta,
    },
    translatedLanguages: Array.isArray(data.translatedLanguages)
      ? data.translatedLanguages.filter((language): language is PortalUiLanguage =>
        NEWS_CONTENT_LANGUAGES.includes(language as PortalUiLanguage),
      )
      : [],
    skippedManual: Array.isArray(data.skippedManual)
      ? data.skippedManual.filter((item): item is { language: PortalUiLanguage; path: string } =>
        isRecord(item) &&
        typeof item.path === 'string' &&
        NEWS_CONTENT_LANGUAGES.includes(item.language as PortalUiLanguage),
      )
      : [],
    error: null,
  };
}
