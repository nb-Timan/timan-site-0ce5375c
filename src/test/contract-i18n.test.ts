import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APPENDIX_2_PARAGRAPHS,
  renderAppendix2ExampleLines,
  renderAppendix2Paragraphs,
} from '@/lib/contractAppendix2';
import { getContractAppendixLabel, getContractStepLabel } from '@/lib/contractFlow';

const DANISH_APPENDIX_MARKERS = [
  'Målet med rabattstrukturen',
  'Grund rabatten',
  'Leveringstid flere procenter',
  'Egen demonstration',
  'Udregning af rabat',
];

describe('contract i18n', () => {
  it('keeps Danish Appendix 2 source text while rendering English and German wizard copy', () => {
    expect(APPENDIX_2_PARAGRAPHS).toContain('1. Målet med rabattstrukturen.');

    const english = renderAppendix2Paragraphs('dealer', { machineDiscountPct: 25 }, 'en').join('\n');
    const german = renderAppendix2Paragraphs('dealer', { machineDiscountPct: 25 }, 'de').join('\n');

    for (const marker of DANISH_APPENDIX_MARKERS) {
      expect(english).not.toContain(marker);
      expect(german).not.toContain(marker);
    }
    expect(english).toContain('Base discount: 25%.');
    expect(german).toContain('Grundrabatt: 25%.');
    expect(renderAppendix2ExampleLines('en')[0]).toContain('maximum discount');
    expect(renderAppendix2ExampleLines('de')[0]).toContain('maximal erreichbare Rabatt');
  });

  it('uses English instead of Danish for portal languages without dedicated Appendix 2 copy', () => {
    for (const language of ['it', 'hu', 'sv', 'fr', 'pl', 'cs', 'tr']) {
      const copy = renderAppendix2Paragraphs('dealer', undefined, language).join('\n');
      expect(copy).toContain('Purpose of the discount structure.');
      expect(copy).not.toContain('Målet med rabattstrukturen');
    }
  });

  it('uses localized wizard labels and removes the known Danish Step 3 and confirmation literals', () => {
    expect(getContractStepLabel('territory', 'de').title).toBe('Gebiet');
    expect(getContractStepLabel('discount_structure', 'en').title).toBe('Discount structure');
    expect(getContractStepLabel('territory', 'tr').title).toBe('Territory');
    expect(getContractAppendixLabel('tr')).toBe('Appendix');

    const pageSource = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    expect(pageSource).toContain("confirmedAtBy: { da: 'Bekræftet {date} af {name}'");
    expect(pageSource).toContain("contractUi('confirmedAtBy', uiLanguage");
    expect(pageSource).toContain("contractUi('postalHelp', uiLanguage)");
    expect(pageSource).toContain("contractUi('addSecondaryTerritory', uiLanguage)");
    expect(pageSource).toContain("contractUi('noAssociatedPartners', uiLanguage)");
    expect(pageSource).toContain("sellerPhoneAuto: { da: 'Telefon vises automatisk");
    expect(pageSource).toContain("contractUi('sellerPhoneAuto', uiLanguage)");
    expect(pageSource).toContain('function formatContractConfirmationDateTime');
    expect(pageSource).not.toContain("Bekræftet {new Date(confirmation.confirmedAt).toLocaleString('da-DK')}");
    expect(pageSource).toContain("postalHelp: { da: 'Angiv mindst ét postnummer");
  });
});
