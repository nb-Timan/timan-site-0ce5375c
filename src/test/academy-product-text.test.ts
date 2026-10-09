import { afterEach, describe, expect, it } from 'vitest';
import { clearPublishedConfiguratorPricesForTest, replacePublishedConfiguratorPrices } from '@/data/machines';
import { academyProductInstruction, getAcademyCase1ProductNames } from '@/lib/academyProductText';
import { t } from '@/lib/i18n/translations';

afterEach(() => clearPublishedConfiguratorPricesForTest());

describe('Academy canonical Configurator product text', () => {
  it('uses the canonical Configurator fallback title for work lights', () => {
    expect(getAcademyCase1ProductNames('da').workLight).toBe('Arbejdslys 2 stk.');
    expect(getAcademyCase1ProductNames('de').workLight).toBe('Arbeitsleuchten 2 Stk.');
  });

  it('uses the current Product Master title for 412594 in Danish and German', () => {
    replacePublishedConfiguratorPrices([{
      item_number: '412594',
      item_text_da: 'Arbejdslys 2 stk.',
      item_text_de: 'Arbeitsleuchten 2 Stk.',
      item_text_en: 'Work lights 2 pcs.',
      price_dkk: null,
      price_eur: null,
    }]);

    expect(getAcademyCase1ProductNames('da').workLight).toBe('Arbejdslys 2 stk.');
    expect(getAcademyCase1ProductNames('de').workLight).toBe('Arbeitsleuchten 2 Stk.');
  });

  it('updates Academy automatically when the canonical product title changes', () => {
    replacePublishedConfiguratorPrices([{
      item_number: '412594', item_text_da: 'Canonical title A', price_dkk: null, price_eur: null,
    }]);
    expect(getAcademyCase1ProductNames('da').workLight).toBe('Canonical title A');

    replacePublishedConfiguratorPrices([{
      item_number: '412594', item_text_da: 'Canonical title B', price_dkk: null, price_eur: null,
    }]);
    expect(getAcademyCase1ProductNames('da').workLight).toBe('Canonical title B');
  });

  it('embeds canonical oil, flail mower and work-light names in the pedagogical checklist', () => {
    const names = getAcademyCase1ProductNames('da');
    const copy = academyProductInstruction(t('academyCase1AddOilFlailAndWorkLight', 'da'), names);
    expect(copy).toContain(names.oil);
    expect(copy).toContain(names.flail);
    expect(copy).toContain(names.workLight);
    expect(copy).not.toMatch(/\{(?:oil|flail|workLight)\}/);
  });
});
