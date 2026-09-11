import { describe, expect, it } from 'vitest';
import {
  convertCurrency,
  currencyFromLanguage,
  formatConvertedMoney,
  resolveDisplayCurrency,
} from '@/lib/currency';

describe('portal display currency resolver', () => {
  it('maps the active portal language to the canonical display currency', () => {
    expect(currencyFromLanguage('DK')).toBe('DKK');
    expect(currencyFromLanguage('DE')).toBe('EUR');
    expect(currencyFromLanguage('SE')).toBe('SEK');
    for (const language of ['GB', 'DE', 'IT', 'HU', 'FR', 'PL', 'CZ']) {
      expect(currencyFromLanguage(language)).toBe('EUR');
    }
  });

  it('uses the active portal language before the saved preference and keeps DKK as fallback', () => {
    expect(resolveDisplayCurrency({ activeLanguage: 'da', preferredLanguage: 'de' })).toBe('DKK');
    expect(resolveDisplayCurrency({ activeLanguage: 'de', preferredLanguage: 'da' })).toBe('EUR');
    expect(resolveDisplayCurrency({ activeLanguage: 'sv', preferredLanguage: 'de' })).toBe('SEK');
    expect(resolveDisplayCurrency({ preferredLanguage: 'sv' })).toBe('SEK');
    expect(resolveDisplayCurrency()).toBe('DKK');
  });

  it('converts only the display value and retains the source amount', () => {
    const sourceDkk = 1_000;

    expect(convertCurrency(sourceDkk, 'DKK', 'EUR')).toBeCloseTo(134.048, 3);
    expect(convertCurrency(sourceDkk, 'DKK', 'SEK')).toBeCloseTo(1503.759, 3);
    expect(sourceDkk).toBe(1_000);
    expect(formatConvertedMoney(sourceDkk, 'DKK', 'SEK')).toContain('SEK');
  });
});
