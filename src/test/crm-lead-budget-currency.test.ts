import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertCurrency, resolveDisplayCurrency } from '@/lib/currency';

describe('CRM lead budget estimate display currency', () => {
  it.each([
    ['DK', 'DKK'],
    ['SE', 'SEK'],
    ['DE', 'EUR'],
    ['GB', 'EUR'],
    ['IT', 'EUR'],
    ['HU', 'EUR'],
    ['FR', 'EUR'],
    ['PL', 'EUR'],
    ['CZ', 'EUR'],
  ] as const)('maps portal language %s to %s', (language, currency) => {
    expect(resolveDisplayCurrency({ activeLanguage: language })).toBe(currency);
  });

  it('converts the canonical DKK amount only for presentation', () => {
    const canonicalDkk = 361_700;

    expect(convertCurrency(canonicalDkk, 'DKK', 'EUR')).toBeCloseTo(48_485.25, 2);
    expect(convertCurrency(canonicalDkk, 'DKK', 'SEK')).toBeCloseTo(543_909.77, 2);
    expect(canonicalDkk).toBe(361_700);
  });

  it('uses the shared resolver and converter in the lead form rather than a DKK-only formatter', () => {
    const page = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');

    expect(page).toContain("import { usePortalCurrency } from '@/lib/usePortalCurrency';");
    expect(page).toContain("convertCurrency(amount, 'DKK', displayCurrency)");
    expect(page).toContain("convertCurrency(Number(digits), displayCurrency, 'DKK')");
    expect(page).toContain('`${tt(\'lbl_budget\', lang)} (${displayCurrency})`');
    expect(page).not.toContain("Budget-Schätzung (DKK)");
    expect(page).not.toContain('formatDkkEstimate');
  });
});
