import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APPENDIX_2_PARAGRAPHS,
  renderAppendix2ExampleLines,
  renderAppendix2Paragraphs,
} from '@/lib/contractAppendix2';
import { renderGuidedContractSections, resolveApprovedContractLegalLanguage } from '@/lib/contractSections';
import { getContractAppendixLabel, getContractStepLabel } from '@/lib/contractFlow';
import { formatContractServiceHourlyRatePerHourDkk } from '@/lib/contractServiceTerms';
import { t } from '@/lib/i18n/translations';

const DANISH_APPENDIX_MARKERS = [
  'Målet med rabattstrukturen',
  'Grund rabatten',
  'Leveringstid flere procenter',
  'Egen demonstration',
  'Udregning af rabat',
];

describe('contract i18n', () => {
  it('has non-legal contract UI copy for every supported portal language', () => {
    const pageSource = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const copyBlock = pageSource.match(/const CONTRACT_UI_COPY = \{([\s\S]*?)\n\} as const;/)?.[1] ?? '';
    const supplementBlock = pageSource.match(/const CONTRACT_UI_COPY_SUPPLEMENTS = \{([\s\S]*?)\n\} satisfies/)?.[1] ?? '';
    const supportedLanguages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];
    const supplementLanguages = ['it', 'hu', 'sv', 'fr', 'pl', 'cs'];
    const entries = [...copyBlock.matchAll(/\n  (\w+): \{([^\n]+)\}/g)];
    const missing: string[] = [];

    for (const [, key, value] of entries) {
      for (const language of supportedLanguages) {
        if (new RegExp(`\\b${language}:`).test(value)) continue;
        if (supplementLanguages.includes(language) && new RegExp(`\\b${key}: contractUi6\\(`).test(supplementBlock)) continue;
        missing.push(`${key}:${language}`);
      }
    }

    expect(missing).toEqual([]);
  });

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
    for (const language of ['it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
      const copy = renderAppendix2Paragraphs('dealer', undefined, language).join('\n');
      expect(copy).toContain('Purpose of the discount structure.');
      expect(copy).not.toContain('Målet med rabattstrukturen');
    }
  });

  it('keeps service-partner discount clauses in the legal resolver instead of hardcoded Danish', () => {
    const context = {
      companyName: 'Example Service',
      partnerType: 'service_partner' as const,
      sparePartsDiscountPct: 25,
    };
    const english = JSON.stringify(renderGuidedContractSections(context, 'en').find((section) => section.stepId === 'discount_structure'));
    const german = JSON.stringify(renderGuidedContractSections(context, 'de').find((section) => section.stepId === 'discount_structure'));
    const italian = JSON.stringify(renderGuidedContractSections(context, 'it').find((section) => section.stepId === 'discount_structure'));

    expect(english).toContain('Spare parts discount: 25%.');
    expect(german).toContain('Ersatzteilrabatt: 25%.');
    expect(italian).toContain('Spare parts discount: 25%.');
    expect(english).not.toContain('Reservedelsrabat');
    expect(german).not.toContain('Maskiner købes gennem');
    expect(italian).not.toContain('Reservedelsrabat');
  });

  it('uses localized wizard labels and removes the known Danish Step 3 and confirmation literals', () => {
    expect(getContractStepLabel('territory', 'de').title).toBe('Gebiet');
    expect(getContractStepLabel('discount_structure', 'en').title).toBe('Discount structure');
    expect(getContractStepLabel('territory', 'cs').title).toBe('Území');
    expect(getContractAppendixLabel('cs')).toBe('Příloha');

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

  it('localizes every guided contract reference instead of leaking Danish contract point labels', () => {
    const context = { companyName: 'Example Dealer', partnerType: 'dealer' as const };

    expect(renderGuidedContractSections(context, 'da').map((section) => section.source)).toContain('Kontrakt, punkt 5');
    expect(renderGuidedContractSections(context, 'de').map((section) => section.source)).toEqual([
      'Vertrag, Punkte 1, 2 und 10',
      'Vertrag, Punkt 3 + Anhang 3',
      'Vertrag, Punkt 4 + Anhang 2',
      'Vertrag, Punkt 5',
      'Vertrag, Punkte 6 und 8 + Anhang 1',
      'Vertrag, Punkte 7 und 7.1',
      'Vertrag, Punkt 9 + Anhang 4',
      'Vertrag, Punkt 11',
    ]);
    expect(renderGuidedContractSections(context, 'en').map((section) => section.source)).toEqual([
      'Contract, sections 1, 2 and 10',
      'Contract, section 3 + Appendix 3',
      'Contract, section 4 + Appendix 2',
      'Contract, section 5',
      'Contract, sections 6 and 8 + Appendix 1',
      'Contract, sections 7 and 7.1',
      'Contract, section 9 + Appendix 4',
      'Contract, section 11',
    ]);
  });

  it('renders all Step 5 content in English and German without Danish fallback text', () => {
    const context = { companyName: 'Example Dealer', partnerType: 'dealer' as const };
    const danishStepFiveMarkers = [
      'Kontrakt, punkt 5',
      '5. Demo-maskiner',
      'Det forventes at',
      'Demo-maskiner må ikke videresælges',
      'Demonstrationsmaskinerabat',
    ];

    for (const language of ['en', 'de'] as const) {
      const stepFive = renderGuidedContractSections(context, language)
        .find((section) => section.stepId === 'demo_machines');
      const rendered = JSON.stringify(stepFive);

      for (const marker of danishStepFiveMarkers) {
        expect(rendered).not.toContain(marker);
      }
    }
  });

  it('renders the complete Step 7 marketing content without Danish fallback text', () => {
    const context = { companyName: 'Example Dealer', partnerType: 'importer' as const };
    const danishMarkers = [
      'Kontrakt, punkt 7 og 7.1',
      'Marketingforpligtelser',
      'skal promovere Timan A/S',
      'De nyeste billeder af Timan-maskiner',
      'Brugen af Timan-logo',
      'oplysninger (navn og adresse)',
      'Adgang til Timans digitale platforme',
      'andet digitalt salgsmateriale',
    ];

    for (const language of ['en', 'de'] as const) {
      const stepSeven = renderGuidedContractSections(context, language)
        .find((section) => section.stepId === 'marketing');
      const rendered = JSON.stringify(stepSeven);

      for (const marker of danishMarkers) {
        expect(rendered).not.toContain(marker);
      }
    }

    const english = JSON.stringify(renderGuidedContractSections(context, 'en').find((section) => section.stepId === 'marketing'));
    const german = JSON.stringify(renderGuidedContractSections(context, 'de').find((section) => section.stepId === 'marketing'));

    expect(english).toContain('Marketing obligations of Importer');
    expect(english).toContain('Timan provides brochures and other digital sales material.');
    expect(german).toContain('Marketingpflichten von Importeur');
    expect(german).toContain('Timan stellt Broschüren und weiteres digitales Verkaufsmaterial zur Verfügung.');
  });

  it('renders the complete Step 6 service and warranty appendix without Danish fallback text', () => {
    const context = { companyName: 'Example Dealer', partnerType: 'importer' as const, serviceHourlyRateDkk: 360 };
    const danishMarkers = [
      'Reservedele og service',
      'forpligter sig til at varetage alt support',
      'Salgs- og servicedage',
      'Reklamationsarbejde må først',
      'Garanti registreringer',
      'Garantibetingelser for demomaskiner',
      'Godtgørelse dækkes via kreditnota',
      'Timeløn og Transport',
      'Timesatsen er baseret på dækning',
      'Redskaber fra tredjepartsproducenter',
      'Serviceafdelingen kontaktes pr telefon',
    ];

    for (const language of ['en', 'de'] as const) {
      const stepSix = renderGuidedContractSections(context, language)
        .find((section) => section.stepId === 'spare_parts_service');
      const rendered = JSON.stringify(stepSix);

      for (const marker of danishMarkers) {
        expect(rendered).not.toContain(marker);
      }
    }
  });

  it('localizes the Step 6 summary and reimbursement box while preserving the DKK amount', () => {
    expect(t('contractImportantSparePartsServiceTermsHeading', 'de')).toBe('Wichtige Ersatzteil- und Servicebedingungen');
    expect(t('contractImportantServiceTermsIntro', 'de')).toBe('Kurzer Gesprächsüberblick. Die vollständigen Servicebedingungen stehen unten.');
    expect(t('contractServiceSummaryClaimTitle', 'de')).toBe('Reklamation');
    expect(t('contractServiceSummaryFreightTitle', 'de')).toBe('Fracht und Lieferung');
    expect(t('contractServiceCompensationHeading', 'de')).toBe('Vergütung');
    expect(t('contractServiceHourlyRateUnit', 'de')).toBe('DKK/Stunde');
    expect(t('contractServiceAgreedHourlyRate', 'en')).toBe('Agreed hourly rate');
    expect(t('contractServiceAgreedHourlyRate', 'da')).toBe('Aftalt timetakst');
    expect(formatContractServiceHourlyRatePerHourDkk(360, 'de')).toBe('360 kr./Stunde');
    expect(formatContractServiceHourlyRatePerHourDkk(360, 'en')).toBe('360 kr./hour');
    expect(formatContractServiceHourlyRatePerHourDkk(360, 'da')).toBe('360 kr./time');
  });

  it('localizes Step 8 UI while using English legal fallback for non-approved legal languages', () => {
    const context = { companyName: 'Example Dealer', partnerType: 'dealer' as const, paymentTerm: 'net_21' };
    const expected = {
      da: ['9. Betaling og Levering', 'Bilag 4: Salgs- og leveringsbetingelser', 'Betalingsbetingelser'],
      en: ['9. Payment and delivery', 'Appendix 4: Terms of sale and delivery', 'Payment terms'],
      de: ['9. Zahlung und Lieferung', 'Anhang 4: Verkaufs- und Lieferbedingungen', 'Zahlungsbedingungen'],
      it: ['9. Payment and delivery', 'Appendix 4: Terms of sale and delivery', 'Termini di pagamento'],
      hu: ['9. Payment and delivery', 'Appendix 4: Terms of sale and delivery', 'Fizetési feltételek'],
      sv: ['9. Payment and delivery', 'Appendix 4: Terms of sale and delivery', 'Betalningsvillkor'],
      fr: ['9. Payment and delivery', 'Appendix 4: Terms of sale and delivery', 'Conditions de paiement'],
      pl: ['9. Payment and delivery', 'Appendix 4: Terms of sale and delivery', 'Warunki płatności'],
      cs: ['9. Payment and delivery', 'Appendix 4: Terms of sale and delivery', 'Platební podmínky'],
    } as const;
    const danishOnlyMarkers = [
      '9. Betaling og Levering',
      'Bilag 4: Salgs- og leveringsbetingelser',
      'Se mere om leveringsbetingelser: bilag 4.',
      'Disse almindelige Salgs- og Leveringsbetingelser',
      '16. Lovvalg og værneting:',
    ];

    for (const [language, expectedText] of Object.entries(expected)) {
      const section = renderGuidedContractSections(context, language)
        .find((entry) => entry.stepId === 'payment_delivery');
      const rendered = JSON.stringify(section);

      expect(section).toBeDefined();
      for (const text of expectedText.slice(0, 2)) expect(rendered).toContain(text);
      expect(t('contractPaymentTermsLabel', language)).toBe(expectedText[2]);
      if (!['da', 'en', 'de'].includes(language)) {
        expect(resolveApprovedContractLegalLanguage(language)).toBe('en');
        expect(rendered).toContain('Payment is due net 21 days from the invoice date.');
      }
      if (language !== 'da') {
        for (const marker of danishOnlyMarkers) expect(rendered).not.toContain(marker);
      }
    }
  });

  it('renders Step 9 with deterministic English legal fallback for non-approved legal languages', () => {
    const context = { companyName: 'Example Dealer', partnerType: 'dealer' as const };
    const expected = {
      da: ['Kontrakt, punkt 11', '11. Varighed og opsigelse'],
      en: ['Contract, section 11', '11. Duration and termination'],
      de: ['Vertrag, Punkt 11', '11. Laufzeit und Kündigung'],
      it: ['Contract, section 11', '11. Duration and termination'],
      hu: ['Contract, section 11', '11. Duration and termination'],
      sv: ['Contract, section 11', '11. Duration and termination'],
      fr: ['Contract, section 11', '11. Duration and termination'],
      pl: ['Contract, section 11', '11. Duration and termination'],
      cs: ['Contract, section 11', '11. Duration and termination'],
    } as const;
    const danishMarkers = [
      'Denne kontrakt træder i kraft',
      'Fornyelse af kontrakten sker automatisk',
      'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.',
    ];

    for (const [language, expectedText] of Object.entries(expected)) {
      const section = renderGuidedContractSections(context, language)
        .find((entry) => entry.stepId === 'termination');
      const rendered = JSON.stringify(section);

      expect(section).toBeDefined();
      for (const text of expectedText) expect(rendered).toContain(text);
      if (!['da', 'en', 'de'].includes(language)) {
        expect(resolveApprovedContractLegalLanguage(language)).toBe('en');
        expect(rendered).toContain('This agreement enters into force upon signature');
      }
      if (language !== 'da') {
        for (const marker of danishMarkers) expect(rendered).not.toContain(marker);
      }
    }
  });

  it('localizes the complete Step 10 review and lock surface in every supported portal language', () => {
    const pageSource = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const expected = {
      da: ['Når alt er gennemlæst, kan kontraktversionen låses.', 'Afslut kontraktgennemgang'],
      en: ['Once everything has been reviewed, the contract version can be locked.', 'Complete contract review'],
      de: ['Nachdem alles durchgesehen wurde, kann die Vertragsversion gesperrt werden.', 'Vertragsprüfung abschließen'],
      it: ['Dopo aver esaminato tutto, la versione del contratto può essere bloccata.', 'Completa la revisione del contratto'],
      hu: ['Miután mindent átnéztek, a szerződésverzió zárolható.', 'Szerződés-felülvizsgálat befejezése'],
      sv: ['När allt har granskats kan avtalsversionen låsas.', 'Slutför avtalsgranskning'],
      fr: ['Une fois que tout a été relu, la version du contrat peut être verrouillée.', 'Terminer la révision du contrat'],
      pl: ['Po zapoznaniu się ze wszystkimi treściami można zablokować wersję umowy.', 'Zakończ przegląd umowy'],
      cs: ['Po přečtení všech částí lze verzi smlouvy uzamknout.', 'Dokončit kontrolu smlouvy'],
    } as const;

    for (const [language, text] of Object.entries(expected)) {
      for (const value of text) expect(pageSource).toContain(`${language}: '${value}'`);
      if (language !== 'en') {
        expect(t('contractFullTextHeading', language)).not.toBe('The contract');
        expect(t('contractFullTextIntro', language)).not.toBe('The full agreement in the order used in the final contract.');
      }
    }

    expect(pageSource).toContain("contractUi('reviewLockReady', uiLanguage)");
    expect(pageSource).toContain("contractUi('reviewLockSnapshotHelp', uiLanguage)");
    expect(pageSource).toContain("contractUi('completeContractReview', uiLanguage)");
    expect(pageSource).not.toContain('>Når alt er gennemlæst, kan kontraktversionen låses.</p>');

    for (const key of [
      'reviewCompletionRequired',
      'reviewLockReady',
      'reviewLockSnapshotHelp',
      'reviewComplete',
      'reviewSaving',
      'completeContractReview',
      'reviewPrerequisitesRequired',
      'reviewSaveBeforeLockFailed',
      'reviewCompleteFailed',
      'reviewCompletedAndLocked',
      'reviewRequiredBeforePdf',
      'reviewRequiredBeforePdfGeneration',
      'contractStatus',
      'readyForSignatureHelp',
      'completeContract',
      'pdfFromLockedVersion',
      'openPdf',
    ]) {
      const entry = pageSource.match(new RegExp(`${key}: \\{([^\\n]+)\\}`))?.[1] ?? '';
      for (const language of Object.keys(expected)) expect(entry).toContain(`${language}:`);
    }
  });
});
