import { afterEach, describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  PRODUCTS,
  clearPublishedConfiguratorPricesForTest,
  getAccessoriesFlat,
  getLocalizedName,
  replacePublishedConfiguratorPrices,
} from '@/data/machines';
import { CONFIGURATOR_GERMAN_PRODUCT_TEXT } from '@/data/configuratorGermanProductTranslations';
import { t } from '@/data/translations';
import { currentProductDescription } from '@/lib/configuratorPricing';

const SCREENSHOT_ITEMS = [
  '712147', '712145', '712164', '712178', '712179', '712188', '720485', '720617',
  '730017', '730020', '730114', '712901', '730276', '730036', '730106', '725138',
  '712902', '725120', 'V34-029', 'V34-055', '795018',
];

const ENGLISH_LEAK = /\b(?:attachments?|blade|brush|bucket|cover|door|electric|extra|factory|fitted|hydraulic|light|manual|months?|mower|noise|protection|right|left|roof|spreader|sweeper|trolley|warranty|with|without|working)\b/i;
const DANISH_LEAK = /\b(?:arbejdslys|baglygte|børste|dør|ekstra|forhandler|højre|klipper|lad|manuel|mængdereg|presenning|redskab|rustbeskyttelse|sneslynge|spreder|venstre|vogn)\b/;

function allVisibleCatalogItems() {
  const rows = [
    ...Object.values(PRODUCTS),
    ...Object.keys(ACCESSORIES).flatMap((machine) => getAccessoriesFlat(machine)),
    ...getAccessoriesFlat('LOOSE_TOOL'),
  ];
  const seen = new Set<string>();
  return rows.filter((item) => {
    if ('hidden' in item && item.hidden) return false;
    if ('translationKey' in item && item.translationKey) return false;
    const key = `${item.id}::${item.varenr}::${getLocalizedName(item.name, 'de')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

afterEach(() => clearPublishedConfiguratorPricesForTest());

describe('Configurator canonical German product text', () => {
  it('provides German labels without obvious Danish or English leakage across every catalogue group', () => {
    const leaks = allVisibleCatalogItems().flatMap((item) => {
      const text = getLocalizedName(item.name, 'de');
      if (!text || ENGLISH_LEAK.test(text) || DANISH_LEAK.test(text.toLowerCase())) {
        return [`${item.varenr || item.id}: ${text}`];
      }
      return [];
    });
    expect(leaks).toEqual([]);
  });

  it('keeps machine-card technical values German in DE', () => {
    const leakedValues = Object.values(PRODUCTS).flatMap((machine) => machine.techSpecs.flatMap((spec) => {
      const value = typeof spec.value === 'string' ? spec.value : getLocalizedName(spec.value || '', 'de');
      return /\b(?:HK|grader|km\/t)\b/.test(value) || value.includes('Kubota benzinmotor')
        ? [`${machine.id}: ${value}`]
        : [];
    }));
    expect(leakedValues).toEqual([]);
  });

  it('localizes every visible equipment section heading in DE', () => {
    const untranslated = Object.keys(ACCESSORIES).flatMap((machine) => getAccessoriesFlat(machine)).flatMap((item) => {
      if (!item.sectionStart || ('hidden' in item && item.hidden)) return [];
      const heading = t(item.sectionStart, 'de');
      return heading === item.sectionStart || DANISH_LEAK.test(heading.toLowerCase())
        ? [`${item.id}: ${heading}`]
        : [];
    });
    expect(untranslated).toEqual([]);
  });

  it('covers every item called out in the production screenshots with the correct canonical identity', () => {
    const catalog = Object.keys(ACCESSORIES).flatMap((machine) => getAccessoriesFlat(machine));
    for (const itemNumber of SCREENSHOT_ITEMS) {
      const matches = catalog.filter((item) => item.varenr === itemNumber);
      expect(matches.length, itemNumber).toBeGreaterThan(0);
      for (const item of matches) {
        const german = getLocalizedName(item.name, 'de');
        expect(german, `${itemNumber} missing DE`).toBeTruthy();
        expect(ENGLISH_LEAK.test(german), `${itemNumber}: ${german}`).toBe(false);
        expect(DANISH_LEAK.test(german.toLowerCase()), `${itemNumber}: ${german}`).toBe(false);
      }
    }
  });

  it('uses Product Master German first and the deterministic catalogue translation when DE is missing', () => {
    replacePublishedConfiguratorPrices([{
      item_number: '730017', item_text_da: 'Ny dansk mastertekst', item_text_de: null,
      item_text_en: 'New English master text', price_dkk: null, price_eur: null,
    }]);
    expect(getLocalizedName(getAccessoriesFlat('Timan 3330').find((item) => item.varenr === '730017')!.name, 'de'))
      .toBe(CONFIGURATOR_GERMAN_PRODUCT_TEXT['730017']);
    expect(currentProductDescription('730017', 'de', CONFIGURATOR_GERMAN_PRODUCT_TEXT['730017']))
      .toBe(CONFIGURATOR_GERMAN_PRODUCT_TEXT['730017']);

    replacePublishedConfiguratorPrices([{
      item_number: '730017', item_text_da: 'Ny dansk mastertekst',
      item_text_de: 'Freigegebener deutscher Mastertext', item_text_en: 'New English master text',
      price_dkk: null, price_eur: null,
    }]);
    expect(getLocalizedName(getAccessoriesFlat('Timan 3330').find((item) => item.varenr === '730017')!.name, 'de'))
      .toBe('Freigegebener deutscher Mastertext');
  });

  it('does not change Danish, English, prices or dependency relations while adding German text', () => {
    const item = getAccessoriesFlat('Timan 3330').find((entry) => entry.varenr === '730114')!;
    expect(getLocalizedName(item.name, 'da')).toBe('V-plov 130-150 cm med gummiskær');
    expect(getLocalizedName(item.name, 'en')).toBe('V-plow 130-150 cm with rubber blade');
    expect(item.priceDKK).toBe(30460);
    expect(item.priceEUR).toBe(4100);
    expect(item.requires).toBeUndefined();
  });
});
