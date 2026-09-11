import { describe, expect, it } from 'vitest';
import {
  CONTRACT_DEMO_COMPENSATION_DKK,
  CONTRACT_DEMO_COMPENSATION_EUR,
  formatContractDemoCompensation,
  getContractDemoCompensationAmount,
} from '@/lib/contractCommercialTerms';
import { resolveDisplayCurrency } from '@/lib/currency';

describe('contract demo compensation display currency', () => {
  it('keeps the canonical Danish compensation amount in DKK', () => {
    expect(CONTRACT_DEMO_COMPENSATION_DKK).toBe(3100);
    expect(formatContractDemoCompensation('DKK')).toContain('kr.');
  });

  it('uses the agreed EUR compensation amount instead of relabelling DKK', () => {
    expect(CONTRACT_DEMO_COMPENSATION_EUR).toBe(425);
    expect(formatContractDemoCompensation('EUR')).toBe('425 EUR');
  });

  it('uses the canonical SEK conversion model', () => {
    expect(getContractDemoCompensationAmount('SEK')).toBeGreaterThan(CONTRACT_DEMO_COMPENSATION_DKK);
    expect(formatContractDemoCompensation('SEK')).toContain('SEK');
  });

  it.each([
    ['DE', 'EUR'],
    ['FR', 'EUR'],
    ['CZ', 'EUR'],
    ['GB', 'EUR'],
    ['DK', 'DKK'],
    ['SE', 'SEK'],
  ])('resolves portal language %s to %s', (language, currency) => {
    expect(resolveDisplayCurrency({ activeLanguage: language })).toBe(currency);
  });
});
