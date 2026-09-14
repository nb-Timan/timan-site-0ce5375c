import { describe, expect, it } from 'vitest';
import { t } from '@/data/translations';

describe('Configurator German translations', () => {
  it('does not fall back to English for the Step 1-4 tabs and descriptions', () => {
    expect(t('step1Tab', 'de')).toBe('Schritt 1');
    expect(t('step2Tab', 'de')).toBe('Schritt 2');
    expect(t('step3Tab', 'de')).toBe('Schritt 3');
    expect(t('step4Tab', 'de')).toBe('Schritt 4');
    expect(t('step4Desc', 'de')).toContain('Bestellbestätigung');
    expect(t('step4Desc', 'de')).not.toContain('Please fill');
    expect(t('invalidEmailRecipient', 'de')).toBe('Ungültiger E-Mail-Empfänger.');
  });
});
