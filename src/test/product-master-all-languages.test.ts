import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import {
  canonicalLocalizedProductTitles,
  EMPTY_CONTENT,
  localizedDraftTitles,
  resolveMarketingProductIdentity,
} from '@/lib/marketingConfiguratorContentService';
import {
  buildPriceImportPayload,
  buildPreview,
  exportCsv,
  parsePriceCsv,
  type PriceListItem,
} from '@/lib/priceListService';
import {
  PRODUCT_LANGUAGES,
  PRODUCT_LANGUAGE_FIELDS,
  localizedProductTextMap,
  resolveLocalizedProductText,
} from '@/lib/productLanguages';
import {
  publishedProductStoredText,
  replaceProductMaster,
} from '@/lib/publishedProductMaster';

const sku = '712578';
const texts = {
  da: 'LED Rotorblink til tag med blitz lys',
  en: 'LED Beacon for roof with Flashing Light',
  de: 'LED-Rundumleuchte für Dach mit Blitzlicht',
  it: 'Lampeggiante LED per tetto con luce stroboscopica',
  hu: 'LED villogó jelzőlámpa villanófényes tetőhöz',
  sv: 'SE QA', fr: 'FR QA', pl: 'PL QA', cs: 'CZ QA',
} as const;

const priceItem: PriceListItem = {
  id: 'qa-712578', item_number: sku, renamed_from_item_number: null,
  item_text_da: texts.da, item_text_en: texts.en, item_text_de: texts.de,
  item_text_it: texts.it, item_text_hu: texts.hu, item_text_sv: texts.sv,
  item_text_fr: texts.fr, item_text_pl: texts.pl, item_text_cs: texts.cs,
  price_dkk: 705, price_eur: 95, price_sek: null, cost_price_dkk: null,
  cost_price_source: null, cost_price_updated_at: null,
  updated_at: '2026-10-06T00:00:00.000Z', updated_by_email: 'qa@timan.dk',
  is_dirty: false, last_published_at: null,
};

describe('Product Master language isolation', () => {
  it('loads SKU 712578 DA, DE and EN from their exact canonical fields', () => {
    replaceProductMaster([priceItem]);
    expect(publishedProductStoredText(sku, 'da')).toBe(texts.da);
    expect(publishedProductStoredText(sku, 'de')).toBe(texts.de);
    expect(publishedProductStoredText(sku, 'en')).toBe(texts.en);
    expect(canonicalLocalizedProductTitles(sku)).toMatchObject(texts);
    replaceProductMaster([]);
  });

  it('keeps all nine editor values independent across repeated language switches and a DE edit', () => {
    const original = localizedProductTextMap(priceItem);
    const switchingOrder = ['da', 'de', 'en', 'da', 'de'] as const;
    expect(switchingOrder.map((language) => resolveLocalizedProductText(original, language)))
      .toEqual([texts.da, texts.de, texts.en, texts.da, texts.de]);

    const edited = { ...original, de: 'LED-Rundumleuchte mit Blitzlicht' };
    expect(edited.de).toBe('LED-Rundumleuchte mit Blitzlicht');
    expect(edited.da).toBe(texts.da);
    expect(edited.en).toBe(texts.en);
    for (const language of PRODUCT_LANGUAGES.filter((language) => !['da', 'de', 'en'].includes(language))) {
      expect(edited[language]).toBe(original[language]);
    }
  });

  it('preserves exact draft/published language maps and uses the active language in Marketing', () => {
    replaceProductMaster([priceItem]);
    const canonical = canonicalLocalizedProductTitles(sku);
    const draftContent = { ...EMPTY_CONTENT, title: texts.da, localized_titles: canonical };
    const reopened = localizedDraftTitles(draftContent, canonical);
    expect(reopened).toEqual(canonical);
    expect(resolveMarketingProductIdentity(sku, draftContent, 'de').title).toBe(texts.de);
    expect(resolveMarketingProductIdentity(sku, draftContent, 'da').title).toBe(texts.da);

    const germanOverride = { ...draftContent, localized_titles: { ...canonical, de: 'LED-Rundumleuchte mit Blitzlicht' } };
    expect(resolveMarketingProductIdentity(sku, germanOverride, 'de').title).toBe('LED-Rundumleuchte mit Blitzlicht');
    expect(resolveMarketingProductIdentity(sku, germanOverride, 'da').title).toBe(texts.da);
    replaceProductMaster([]);
  });

  it('round-trips all nine price-list language columns', () => {
    const csv = exportCsv([priceItem]);
    const header = Papa.parse<string[]>(csv).data[0];
    expect(header).toEqual(expect.arrayContaining([
      'varetekst_da', 'varetekst_en', 'varetekst_de', 'varetekst_it', 'varetekst_hu',
      'varetekst_se', 'varetekst_fr', 'varetekst_pl', 'varetekst_cz',
    ]));
    const parsed = parsePriceCsv(csv);
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      item_text_da: texts.da, item_text_en: texts.en, item_text_de: texts.de,
      item_text_it: texts.it, item_text_hu: texts.hu, item_text_sv: texts.sv,
      item_text_fr: texts.fr, item_text_pl: texts.pl, item_text_cs: texts.cs,
    });
  });

  it('changes only DE and ignores blank language cells during import', () => {
    const rows = parsePriceCsv([
      'varenr,varetekst_da,varetekst_en,varetekst_de,varetekst_it,varetekst_hu,varetekst_se,varetekst_fr,varetekst_pl,varetekst_cz',
      `${sku},,,LED-Rundumleuchte mit Blitzlicht,,,,,,`,
    ].join('\n')).rows;
    const preview = buildPreview(rows, [priceItem], 'FULL_PRICE_LIST');
    expect(preview[0].changes).toEqual([{ field: 'item_text_de', oldValue: texts.de, newValue: 'LED-Rundumleuchte mit Blitzlicht' }]);
    const payload = buildPriceImportPayload(preview, 'qa.csv', 'FULL_PRICE_LIST', 'all');
    expect(payload.rows[0]).toMatchObject({ item_text_de: 'LED-Rundumleuchte mit Blitzlicht' });
    for (const language of PRODUCT_LANGUAGES.filter((language) => language !== 'de')) {
      expect(payload.rows[0][PRODUCT_LANGUAGE_FIELDS[language]]).toBe('');
    }
  });
});
