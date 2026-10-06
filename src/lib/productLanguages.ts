import {
  PORTAL_LANGUAGE_CODES,
  PORTAL_LANGUAGES,
  type PortalUiLanguage,
} from '@/lib/portalLanguages';

export const PRODUCT_LANGUAGES = PORTAL_LANGUAGE_CODES;

export const PRODUCT_TEXT_FIELDS = [
  'item_text_da', 'item_text_en', 'item_text_de', 'item_text_it', 'item_text_hu',
  'item_text_sv', 'item_text_fr', 'item_text_pl', 'item_text_cs',
] as const;

export type ProductTextField = typeof PRODUCT_TEXT_FIELDS[number];

export const PRODUCT_LANGUAGE_FIELDS: Record<PortalUiLanguage, ProductTextField> = {
  da: 'item_text_da',
  en: 'item_text_en',
  de: 'item_text_de',
  it: 'item_text_it',
  hu: 'item_text_hu',
  sv: 'item_text_sv',
  fr: 'item_text_fr',
  pl: 'item_text_pl',
  cs: 'item_text_cs',
};

export type ProductTextSource = Partial<Record<ProductTextField, string | null | undefined>>;
export type LocalizedProductText = Record<PortalUiLanguage, string>;

export const emptyLocalizedProductText = (): LocalizedProductText => ({
  da: '', en: '', de: '', it: '', hu: '', sv: '', fr: '', pl: '', cs: '',
});

export function productLanguageLabel(language: PortalUiLanguage): string {
  return PORTAL_LANGUAGES.find((option) => option.code === language)?.label || language.toUpperCase();
}

export function productLanguageDisplayCode(language: PortalUiLanguage): string {
  return PORTAL_LANGUAGES.find((option) => option.code === language)?.flag || language.toUpperCase();
}

export function storedProductText(source: ProductTextSource | null | undefined, language: PortalUiLanguage): string {
  return source?.[PRODUCT_LANGUAGE_FIELDS[language]]?.trim() || '';
}

export function localizedProductTextMap(
  source: ProductTextSource | null | undefined,
  fallbackDa = '',
): LocalizedProductText {
  const values = emptyLocalizedProductText();
  for (const language of PRODUCT_LANGUAGES) values[language] = storedProductText(source, language);
  values.da ||= fallbackDa;
  return values;
}

export function normalizeLocalizedProductText(value: unknown): LocalizedProductText {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const normalized = emptyLocalizedProductText();
  for (const language of PRODUCT_LANGUAGES) {
    normalized[language] = typeof source[language] === 'string' ? String(source[language]).trim() : '';
  }
  return normalized;
}

export function resolveLocalizedProductText(
  values: Partial<LocalizedProductText> | null | undefined,
  language: PortalUiLanguage,
): string {
  return values?.[language]?.trim() || values?.da?.trim() || '';
}
