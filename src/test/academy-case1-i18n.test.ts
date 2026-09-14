import { describe, expect, it } from 'vitest';
import { ACADEMY_TRANSLATIONS } from '@/lib/i18n/academyTranslations';

describe('Academy Case 1 quantity-discount guidance translations', () => {
  it('provides the RC-751 work step in every supported portal language', () => {
    for (const locale of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
      const translations = ACADEMY_TRANSLATIONS[locale];
      expect(translations.academyCase1ChooseRc751).toBeTruthy();
      expect(translations.academyCase1QuantityDiscountExplanation).toBeTruthy();
      expect(translations.academyCase1Rc751Selected).toBeTruthy();
      expect(translations.academyCase1NextMachine).toBeTruthy();
      expect(translations.academyCase1NextRc751).toBeTruthy();
      expect(translations.academyCase1NextOilFlailWorkLight).toBeTruthy();
      expect(translations.academyCase1NextWeedBrushHarness).toBeTruthy();
      expect(translations.academyCase1NextQuote).toBeTruthy();
      expect(translations.academyCase1NextLead).toBeTruthy();
    }
  });

  it('provides the oil and WB-170 wiring-harness work steps in every supported portal language', () => {
    for (const locale of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
      const translations = ACADEMY_TRANSLATIONS[locale];
      expect(translations.academyCase1AddOilFlailAndWorkLight).toBeTruthy();
      expect(translations.academyCase1OilSelected).toBeTruthy();
      expect(translations.academyCase1AddWeedBrushAndHarness).toBeTruthy();
      expect(translations.academyCase1WeedBrushSelected).toBeTruthy();
      expect(translations.academyCase1HarnessAutomaticallyAdded).toBeTruthy();
      expect(translations.academyCase1NextWeedBrushHarness).toBeTruthy();
    }
  });
});
