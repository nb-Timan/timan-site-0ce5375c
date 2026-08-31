import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canLeaveContractStep,
  canPrepareContractForSignature,
  buildContractSnapshot,
  canTransitionContractStatus,
  EMPTY_CONTRACT_CONFIRMATIONS,
  CONTRACT_STATUS_LABELS_DA,
  CONTRACT_STEPS,
  CONTRACT_APPENDIX_LABELS,
  getContractWorkflowStatusLabel,
  getCompletedContractStepIds,
  getContractStepLabel,
  getContractStatus,
  hasReachedContractStatus,
  hasRequiredPartyData,
  normalizeContractConfirmations,
  normalizeContractStepId,
  TIMAN_COMPANY_INFO,
  type ContractConfirmations,
  type ContractFormData,
} from '@/lib/contractFlow';
import {
  GUIDED_CONTRACT_SECTIONS,
  getGuidedContractDisplayHeading,
  renderGuidedContractSections,
  shouldHideGuidedContractUiText,
  type GuidedContractSection,
} from '@/lib/contractSections';
import { APPENDIX_2_EXAMPLE_LINES, APPENDIX_2_PARAGRAPHS, renderAppendix2Paragraphs } from '@/lib/contractAppendix2';
import {
  buildDealerContractDraftKey,
  getCurrentStepId,
  getDealerContractOverviewStatusGroup,
  getDealerContractOverviewStatusLabel,
} from '@/lib/dealerContractsService';
import {
  CONTRACT_PARTNER_TYPE_LABELS,
  CONTRACT_PARTNER_TYPES,
  inferContractPartnerTypeFromDealerAccount,
} from '@/lib/contractPartnerTerms';
import {
  buildContractTerritorySnapshot,
  buildContractTerritoryAreaFromPostalFields,
  createEmptyContractTerritoryArea,
  describeContractSecondaryTerritoryArea,
  describeContractTerritoryArea,
  getContractTerritoryDisplayGroups,
  getContractTerritoryDisplayItems,
  hasValidContractTerritory,
  parseContractPostalFieldValue,
  parseContractPostalInput,
  serializeContractPostalInput,
} from '@/lib/contractTerritory';
import {
  DEFAULT_CONTRACT_SERVICE_HOURLY_RATE_DKK,
  formatContractServiceHourlyRatePerHourDkk,
  normalizeContractServiceHourlyRateDkk,
  shouldResetContractServiceConfirmation,
} from '@/lib/contractServiceTerms';
import {
  CONTRACT_PAYMENT_TERM_OPTIONS,
  DEFAULT_CONTRACT_PAYMENT_TERM,
  contractPaymentTermHasMissingLegalText,
  getContractPaymentTermLabel,
  renderContractPaymentTermLegalText,
  shouldResetContractPaymentConfirmation,
} from '@/lib/contractPaymentTerms';
import {
  createPendingContractAssociatedPartner,
  normalizeContractAssociatedPartners,
} from '@/lib/contractAssociatedPartners';
import { t } from '@/lib/i18n/translations';

const completeForm: ContractFormData = {
  partnerType: 'dealer',
  dealerName: 'Metec Metal Technology Inc',
  dealerAddress: '20 Terry Fox Dr.',
  dealerPostalCode: 'K0B 1R0',
  dealerCity: 'Vankleek Hill',
  dealerCvr: '12058',
  contactPerson: 'Marc',
  contactTitle: 'Dealer principal',
  timanSellerName: 'Birger Pedersen',
  timanSellerEmail: 'bp@timan.dk',
  timanSellerPhone: '',
  contractDate: '2026-08-29',
  primaryTerritory: {
    country: 'DK',
    wholeCountry: false,
    selectedRegions: [],
    municipalities: [],
    postalCodes: [],
    postalRanges: [{ from: '5000', to: '5999' }],
  },
  secondaryTerritory: {
    country: 'DK',
    wholeCountry: false,
    selectedRegions: [],
    municipalities: [],
    postalCodes: [],
    postalRanges: [],
    enabled: false,
  },
  associatedPartners: [],
  serviceHourlyRateDkk: DEFAULT_CONTRACT_SERVICE_HOURLY_RATE_DKK,
  paymentTerm: DEFAULT_CONTRACT_PAYMENT_TERM,
  signatureDataUrl: null,
};

const confirmed: ContractConfirmations = {
  purpose_prices_orders_portal: { confirmed: true, confirmedAt: '2026-08-29T10:00:00.000Z', confirmedBy: 'Birger Pedersen' },
  territory: { confirmed: true, confirmedAt: '2026-08-29T10:02:00.000Z', confirmedBy: 'Birger Pedersen' },
  discount_structure: { confirmed: true, confirmedAt: '2026-08-29T10:04:00.000Z', confirmedBy: 'Birger Pedersen' },
  demo_machines: { confirmed: true, confirmedAt: '2026-08-29T10:06:00.000Z', confirmedBy: 'Birger Pedersen' },
  spare_parts_service: { confirmed: true, confirmedAt: '2026-08-29T10:08:00.000Z', confirmedBy: 'Birger Pedersen' },
  marketing: { confirmed: true, confirmedAt: '2026-08-29T10:10:00.000Z', confirmedBy: 'Birger Pedersen' },
  payment_delivery: { confirmed: true, confirmedAt: '2026-08-29T10:14:00.000Z', confirmedBy: 'Birger Pedersen' },
  termination: { confirmed: true, confirmedAt: '2026-08-29T10:16:00.000Z', confirmedBy: 'Birger Pedersen' },
  full_contract: { confirmed: true, confirmedAt: '2026-08-29T10:15:00.000Z', confirmedBy: 'Birger Pedersen' },
};

function getVisibleGuidedUiText(section: GuidedContractSection) {
  const sectionContext = `${section.title} ${section.source}`;
  return section.blocks.flatMap((block) => {
    const heading = block.heading ? getGuidedContractDisplayHeading(block.heading) : '';
    return [
      heading && !shouldHideGuidedContractUiText(heading, sectionContext) ? heading : null,
      ...(block.paragraphs ?? []).filter((paragraph) => !shouldHideGuidedContractUiText(paragraph, sectionContext)),
      ...(block.bullets ?? []).filter((bullet) => !shouldHideGuidedContractUiText(bullet, sectionContext)),
    ].filter(Boolean);
  }).join('\n');
}

describe('contract flow', () => {
  it('requires Timan seller and dealer party data before signature', () => {
    expect(hasRequiredPartyData(completeForm)).toBe(true);
    expect(hasRequiredPartyData({ ...completeForm, partnerType: '' })).toBe(false);
    expect(hasRequiredPartyData({ ...completeForm, timanSellerEmail: '' })).toBe(false);
    expect(hasRequiredPartyData({ ...completeForm, dealerCity: '' })).toBe(false);
  });

  it('stores associated partners in the contract snapshot without requiring legacy drafts to have the field', () => {
    expect(normalizeContractAssociatedPartners(undefined)).toEqual([]);

    const associatedPartner = createPendingContractAssociatedPartner('service_partner', {
      companyName: 'Nord Service ApS',
      cvr: 'DK12345678',
      country: 'Danmark',
      address: 'Servicevej 1',
      postalCode: '5000',
      city: 'Odense',
    });
    const snapshot = buildContractSnapshot(
      { ...completeForm, associatedPartners: [associatedPartner, associatedPartner] },
      confirmed,
    );

    expect(snapshot.associatedPartners).toHaveLength(1);
    expect(snapshot.associatedPartners[0]).toMatchObject({
      kind: 'service_partner',
      status: 'pending',
      companyName: 'Nord Service ApS',
      postalCode: '5000',
      city: 'Odense',
    });
  });

  it('blocks leaving steps that need confirmation until confirmed', () => {
    expect(canLeaveContractStep('territory', EMPTY_CONTRACT_CONFIRMATIONS)).toBe(false);
    expect(canLeaveContractStep('territory', confirmed)).toBe(true);
    expect(canLeaveContractStep('parties', EMPTY_CONTRACT_CONFIRMATIONS)).toBe(true);
  });

  it('only prepares contract for signature after all confirmations are complete', () => {
    expect(canPrepareContractForSignature(completeForm, EMPTY_CONTRACT_CONFIRMATIONS)).toBe(false);
    expect(canPrepareContractForSignature(completeForm, confirmed)).toBe(true);
  });

  it('requires a valid primary territory before signature readiness', () => {
    const emptyTerritoryForm: ContractFormData = {
      ...completeForm,
      primaryTerritory: createEmptyContractTerritoryArea('DK'),
    };

    expect(hasValidContractTerritory(emptyTerritoryForm)).toBe(false);
    expect(canPrepareContractForSignature(emptyTerritoryForm, confirmed)).toBe(false);
    expect(hasValidContractTerritory({ ...emptyTerritoryForm, primaryTerritory: { ...emptyTerritoryForm.primaryTerritory, wholeCountry: true } })).toBe(true);
  });

  it('stores territory postal codes as ordered field entries with first field required', () => {
    const emptyArea = createEmptyContractTerritoryArea('DK');
    const secondOnly = buildContractTerritoryAreaFromPostalFields(emptyArea, ['', '5000', '', '', '', '']);
    const firstValid = buildContractTerritoryAreaFromPostalFields(emptyArea, ['5000', '5200', '', '', '', '5000-5999']);

    expect(secondOnly.postalEntries).toHaveLength(6);
    expect(secondOnly.postalCodes).toEqual(['5000']);
    expect(hasValidContractTerritory({ primaryTerritory: secondOnly })).toBe(false);
    expect(firstValid.postalEntries.map((entry) => entry.input)).toEqual(['5000', '5200', '', '', '', '5000-5999']);
    expect(firstValid.postalCodes).toEqual(['5000', '5200']);
    expect(firstValid.postalRanges).toEqual([{ from: '5000', to: '5999' }]);
    expect(hasValidContractTerritory({ primaryTerritory: firstValid })).toBe(true);
    expect(serializeContractPostalInput(firstValid)).toBe('5000, 5200, 5000-5999');
  });

  it('accepts Danish, German and Swedish postal field values and intervals', () => {
    expect(parseContractPostalFieldValue('5000', 'DK')).toEqual({ input: '5000', postalCode: '5000' });
    expect(parseContractPostalFieldValue('5000-5999', 'DK')).toEqual({ input: '5000-5999', postalRange: { from: '5000', to: '5999' } });
    expect(parseContractPostalFieldValue('10115', 'DE')).toEqual({ input: '10115', postalCode: '10115' });
    expect(parseContractPostalFieldValue('29999-20000', 'DE')).toEqual({ input: '20000-29999', postalRange: { from: '20000', to: '29999' } });
    expect(parseContractPostalFieldValue('5000', 'DE')).toEqual({ input: '5000' });
    expect(parseContractPostalFieldValue('12345', 'SE')).toEqual({ input: '123 45', postalCode: '123 45' });
    expect(parseContractPostalFieldValue('123 45', 'SE')).toEqual({ input: '123 45', postalCode: '123 45' });
    expect(parseContractPostalFieldValue('12345-12399', 'SE')).toEqual({ input: '123 45-123 99', postalRange: { from: '123 45', to: '123 99' } });
    expect(parseContractPostalFieldValue('1234', 'SE')).toEqual({ input: '1234' });
  });

  it('keeps old territory drafts with postalCodes and postalRanges backward compatible', () => {
    const oldDraftArea = {
      country: 'DK',
      wholeCountry: false,
      postalCodes: ['6000'],
      postalRanges: [{ from: '5000', to: '5999' }],
    };
    const snapshot = buildContractTerritorySnapshot({ primaryTerritory: oldDraftArea });

    expect(snapshot.primaryTerritory.postalEntries).toEqual([
      { input: '5000-5999', postalRange: { from: '5000', to: '5999' } },
      { input: '6000', postalCode: '6000' },
    ]);
    expect(snapshot.primaryDescription).toBe('Land: Danmark, Postnummer: 5000–5999, Postnummer: 6000 Kolding');
  });

  it('enriches known Danish postal codes with city names without changing stored values', () => {
    const parsed = parseContractPostalInput('6950, 6940, 5000-5999, 1234', 'DK');
    const area = {
      country: 'DK',
      wholeCountry: false,
      selectedRegions: [
        { id: '0760', name: 'Ringkøbing-Skjern' },
        { id: '0657', name: 'Herning' },
      ],
      municipalities: [
        { id: '0760', name: 'Ringkøbing-Skjern' },
        { id: '0657', name: 'Herning' },
      ],
      postalEntries: parsed.postalEntries,
      postalCodes: parsed.postalCodes,
      postalRanges: parsed.postalRanges,
    };

    expect(serializeContractPostalInput(area)).toBe('6950, 6940, 5000-5999, 1234');
    expect(getContractTerritoryDisplayItems(area, 'da')).toEqual([
      'Land: Danmark',
      'Kommune: Herning Kommune',
      'Kommune: Ringkøbing-Skjern Kommune',
      'Postnummer: 6950 Ringkøbing',
      'Postnummer: 6940 Lem St',
      'Postnummer: 5000–5999',
      'Postnummer: 1234',
    ]);
    expect(describeContractTerritoryArea(area, 'da')).toBe('Land: Danmark, Kommune: Herning Kommune, Kommune: Ringkøbing-Skjern Kommune, Postnummer: 6950 Ringkøbing, Postnummer: 6940 Lem St, Postnummer: 5000–5999, Postnummer: 1234');
  });

  it('groups Danish territory display into compact region and postal chip data', () => {
    const parsed = parseContractPostalInput('6950, 6980, 6990, 7500, 7570, 7550', 'DK');
    const groups = getContractTerritoryDisplayGroups({
      country: 'DK',
      wholeCountry: false,
      selectedRegions: [
        { id: '0661', name: 'Holstebro' },
        { id: '0760', name: 'Ringkøbing-Skjern' },
      ],
      municipalities: [
        { id: '0661', name: 'Holstebro' },
        { id: '0760', name: 'Ringkøbing-Skjern' },
      ],
      postalEntries: parsed.postalEntries,
      postalCodes: parsed.postalCodes,
      postalRanges: parsed.postalRanges,
    }, 'da');

    expect(groups.countryLine).toBe('Land: Danmark');
    expect(groups.regionLabel).toBe('Kommuner');
    expect(groups.regions).toEqual(['Holstebro Kommune', 'Ringkøbing-Skjern Kommune']);
    expect(groups.postalLabel).toBe('Postnumre');
    expect(groups.postals).toEqual(['6950 Ringkøbing', '6980 Tim', '6990 Ulfborg', '7500 Holstebro', '7570 Vemb', '7550 Sørvad']);
  });

  it('renders Swedish municipalities and manual postal values from the structured territory model', () => {
    const parsed = parseContractPostalInput('12345, 211 20, 12345-12399', 'SE');
    const area = {
      country: 'SE',
      wholeCountry: false,
      selectedRegions: [
        { id: '1280', name: 'Malmö' },
        { id: '1281', name: 'Lund' },
      ],
      municipalities: [
        { id: '1280', name: 'Malmö' },
        { id: '1281', name: 'Lund' },
      ],
      postalEntries: parsed.postalEntries,
      postalCodes: parsed.postalCodes,
      postalRanges: parsed.postalRanges,
    };

    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.postalCodes).toEqual(['123 45', '211 20']);
    expect(parsed.postalRanges).toEqual([{ from: '123 45', to: '123 99' }]);
    expect(getContractTerritoryDisplayItems(area, 'da')).toEqual([
      'Land: Sverige',
      'Kommune: Lund',
      'Kommune: Malmö',
      'Postnummer: 123 45',
      'Postnummer: 211 20',
      'Postnummer: 123 45–123 99',
    ]);
    expect(describeContractTerritoryArea(area, 'da')).toBe('Land: Sverige, Kommune: Lund, Kommune: Malmö, Postnummer: 123 45, Postnummer: 211 20, Postnummer: 123 45–123 99');
    expect(getContractTerritoryDisplayGroups(area, 'da')).toMatchObject({
      countryLine: 'Land: Sverige',
      regionLabel: 'Kommuner',
      regions: ['Lund', 'Malmö'],
      postalLabel: 'Postnumre',
      postals: ['123 45', '211 20', '123 45–123 99'],
    });
  });

  it('requires a valid service hourly rate before signature readiness', () => {
    expect(canPrepareContractForSignature(completeForm, confirmed)).toBe(true);
    expect(canPrepareContractForSignature({ ...completeForm, serviceHourlyRateDkk: 0 }, confirmed)).toBe(false);
    expect(normalizeContractServiceHourlyRateDkk(undefined)).toBe(360);
    expect(normalizeContractServiceHourlyRateDkk('425')).toBe(425);
    expect(formatContractServiceHourlyRatePerHourDkk(425)).toBe('425 kr./time');
  });

  it('defaults new contracts to net 21 payment terms', () => {
    expect(completeForm.paymentTerm).toBe('net_21');
    expect(DEFAULT_CONTRACT_PAYMENT_TERM).toBe('net_21');
    expect(CONTRACT_PAYMENT_TERM_OPTIONS).toEqual(['net_21', 'net_30', 'cbs']);
    expect(getContractPaymentTermLabel('net_21', 'da')).toBe('Netto 21 dage');
    expect(getContractPaymentTermLabel('net_30', 'da')).toBe('Netto 30 dage');
    expect(getContractPaymentTermLabel('cbs', 'da')).toBe('CBS');
  });

  it('marks signed only after signature exists on a fully confirmed contract', () => {
    expect(getContractStatus(completeForm, EMPTY_CONTRACT_CONFIRMATIONS)).toBe('Draft');
    expect(getContractStatus(completeForm, confirmed)).toBe('Ready for signature');
    expect(getContractStatus({ ...completeForm, signatureDataUrl: 'data:image/png;base64,test' }, confirmed)).toBe('Signed');
  });

  it('builds completed steps for server-side persistence', () => {
    expect(getCurrentStepId(0)).toBe('parties');
    expect(getCurrentStepId(99)).toBe('signature');
    expect(getCompletedContractStepIds(4, confirmed)).toEqual([
      'parties',
      'purpose_prices_orders_portal',
      'territory',
      'discount_structure',
    ]);
  });

  it('uses the new guided contract step order and Danish labels', () => {
    expect(CONTRACT_STEPS.map((step) => step.id)).toEqual([
      'parties',
      'purpose_prices_orders_portal',
      'territory',
      'discount_structure',
      'demo_machines',
      'spare_parts_service',
      'marketing',
      'payment_delivery',
      'termination',
      'full_contract',
      'signature',
    ]);
    expect(CONTRACT_STEPS.map((step) => getContractStepLabel(step.id, 'da').title)).toEqual([
      'Oplysninger',
      'Formål, priser, ordre og forhandlerportal',
      'Område',
      'Rabatstruktur',
      'Demo-maskiner',
      'Reservedele og service',
      'Marketing',
      'Betaling og levering',
      'Opsigelse og afsluttende vilkår',
      'Gennemlæs',
      'Underskrift',
    ]);
    expect(getContractStepLabel('purpose_prices_orders_portal', 'da').shortTitle).toBe('Formål');
  });

  it('defines guided contract step labels for every portal language', () => {
    const languages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;
    for (const language of languages) {
      expect(CONTRACT_APPENDIX_LABELS[language]).toBeTruthy();
      for (const step of CONTRACT_STEPS) {
        expect(getContractStepLabel(step.id, language).title).toBeTruthy();
        expect(getContractStepLabel(step.id, language).shortTitle).toBeTruthy();
      }
    }
  });

  it('defines the allowed contract partner labels for every portal language without dealer customers', () => {
    const languages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;
    expect(CONTRACT_PARTNER_TYPES).toEqual(['dealer', 'importer', 'service_partner']);
    for (const partnerType of CONTRACT_PARTNER_TYPES) {
      for (const language of languages) {
        expect(CONTRACT_PARTNER_TYPE_LABELS[partnerType][language]).toBeTruthy();
      }
    }
    expect(JSON.stringify(CONTRACT_PARTNER_TYPE_LABELS).toLowerCase()).not.toContain('forhandlerkunde');
    expect(JSON.stringify(CONTRACT_PARTNER_TYPE_LABELS).toLowerCase()).not.toContain('dealer customer');
  });

  it('infers contract partner type from existing dealer account type fields only when safe', () => {
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type: 'Forhandler' })).toBe('dealer');
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type_label: 'Importør' })).toBe('importer');
    expect(inferContractPartnerTypeFromDealerAccount({ dealer_type: 'Service Partner' })).toBe('service_partner');
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type: 'Forhandlerkunde' })).toBeNull();
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type: 'Slutkunde' })).toBeNull();
  });

  it('marks the discount and service steps as appendices', () => {
    expect(CONTRACT_STEPS.find((step) => step.id === 'discount_structure')?.appendix).toBe(true);
    expect(CONTRACT_STEPS.find((step) => step.id === 'spare_parts_service')?.appendix).toBe(true);
    expect(CONTRACT_STEPS.find((step) => step.id === 'territory')?.appendix).toBe(true);
    expect(CONTRACT_STEPS.find((step) => step.id === 'payment_delivery')?.appendix).toBe(true);
  });

  it('hides appendix labels and source references from territory and discount guided step UI', () => {
    const territoryStep = CONTRACT_STEPS.find((step) => step.id === 'territory');
    const discountStep = CONTRACT_STEPS.find((step) => step.id === 'discount_structure');
    const territorySection = GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'territory');
    const discountSection = GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'discount_structure');
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');

    expect(getContractStepLabel('territory', 'da').title).toBe('Område');
    expect(getContractStepLabel('discount_structure', 'da').title).toBe('Rabatstruktur');
    expect(getContractStepLabel('territory', 'en').title).toBe('Territory');
    expect(getContractStepLabel('discount_structure', 'en').title).toBe('Discount structure');
    expect(getContractStepLabel('territory', 'de').title).toBe('Gebiet');
    expect(getContractStepLabel('discount_structure', 'de').title).toBe('Rabattstruktur');

    expect(territoryStep?.appendix).toBe(true);
    expect(discountStep?.appendix).toBe(true);
    expect(territorySection?.title).toBe('Område og Bilag 3');
    expect(discountSection?.title).toBe('Rabatstruktur og Bilag 2');
    expect(territorySection?.guidedTitle).toBe('Område');
    expect(discountSection?.guidedTitle).toBe('Rabatstruktur');
    expect(territorySection?.source).toBe('Kontrakt, punkt 3 + Bilag 3');
    expect(discountSection?.source).toBe('Kontrakt, punkt 4 + Bilag 2');
    expect(territorySection?.hideGuidedSource).toBe(true);
    expect(discountSection?.hideGuidedSource).toBe(true);
    expect(source).toContain("activeStep.id !== 'territory'");
    expect(source).toContain("activeStep.id !== 'discount_structure'");
    expect(source).toContain("activeStep.id !== 'spare_parts_service'");
    expect(source).toContain('section.guidedTitle ?? section.title');
    expect(source).toContain('!section.hideGuidedSource');
  });

  it('renders territory postal values as compact input fields instead of a free-text textarea', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const start = source.indexOf('function TerritoryAreaEditor');
    const end = source.indexOf('function SparePartsServiceSection');
    const territoryEditor = source.slice(start, end);

    expect(territoryEditor).toContain('getContractPostalFieldValues');
    expect(territoryEditor).toContain('chunkPostalFields');
    expect(territoryEditor).toContain('Postnr. {fieldIndex + 1}');
    expect(territoryEditor).toContain('+ Tilføj flere postnumre');
    expect(territoryEditor).toContain('Fjern række');
    expect(territoryEditor).toContain('buildContractTerritoryAreaFromPostalFields');
    expect(source).toContain('<ContractTerritoryMap');
    expect(territoryEditor).not.toContain('<textarea');
  });

  it('keeps map region selection separate from manual postal fields', () => {
    const contractsSource = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const mapSource = readFileSync('src/components/contracts/ContractTerritoryMap.tsx', 'utf8');
    const start = contractsSource.indexOf('function TerritoryAreaEditor');
    const end = contractsSource.indexOf('function SparePartsServiceSection');
    const territoryEditor = contractsSource.slice(start, end);

    expect(territoryEditor).toContain('Valgte kommuner');
    expect(territoryEditor).toContain('Klik kommuner på kortet. Postnumre indtastes manuelt nedenfor.');
    expect(territoryEditor).toContain('Valgte områder');
    expect(territoryEditor).toContain('Klik PLZ2-områder på kortet. Postnumre indtastes manuelt nedenfor.');
    expect(territoryEditor).toContain('removeTerritoryRegion');
    expect(territoryEditor).toContain('selectedRegions');
    expect(territoryEditor).toContain('buildContractTerritoryAreaFromPostalFields');
    expect(contractsSource).toContain('regionSelectionTarget');
    expect(contractsSource).toContain('onPrimaryTerritoryChange={setPrimaryTerritory}');
    expect(contractsSource).toContain('onSecondaryTerritoryChange={setSecondaryTerritory}');
    expect(mapSource).toContain('config.parseGeoJson(geoJson)');
    expect(mapSource).toContain('toggleContractTerritoryRegionSelection');
    expect(mapSource).not.toContain('postalCodes.push(region');
  });

  it('keeps the appendix 2 web diagram constrained to the contract width', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const start = source.indexOf('function Appendix2DiscountSection');
    const end = source.indexOf('function ProgressSteps');
    const appendixSection = source.slice(start, end);

    expect(appendixSection).toContain('max-w-full');
    expect(appendixSection).toContain('min-w-0');
    expect(appendixSection).toContain('overflow-hidden');
    expect(appendixSection).not.toContain('overflow-x-auto');
    expect(appendixSection).not.toContain('min-w-[980px]');
  });

  it('builds the appendix 2 discount diagram from translatable DOM text without the demo icon', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const start = source.indexOf('function Appendix2DiscountSection');
    const end = source.indexOf('function ProgressSteps');
    const appendixSection = source.slice(start, end);
    const discountLabelKeys = [
      'contractDiscountMachineOrderGroup',
      'contractDiscountWarrantyRefundGroup',
      'contractDiscountBaseDiscount',
      'contractDiscountQuantityDiscount',
      'contractDiscountDeliveryDiscount',
      'contractDiscountDemoDiscount',
      'contractDiscountBaseDiscountLabel',
      'contractDiscountOnePiece',
      'contractDiscountTwoThreePieces',
      'contractDiscountFourPlusPieces',
      'contractDiscountDeliveryTime',
      'contractDiscountOverThreeMonths',
      'contractDiscountDeliveryExplanation',
      'contractDiscountOwnDemoDiscount',
      'contractDiscountDemoRefundExplanation',
      'contractDiscountExample',
      'contractDiscountExampleText',
      'contractDiscountStairAria',
    ];

    for (const key of discountLabelKeys) {
      expect(appendixSection).toContain(key);
      for (const language of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
        expect(t(key, language)).toBeTruthy();
        expect(t(key, language)).not.toBe(key);
      }
    }

    expect(appendixSection).toContain("aria-label={t('contractDiscountStairAria', language)}");
    expect(appendixSection).toContain('rounded-2xl border border-[#79a45e] bg-[#fbfdf9] px-3 py-4');
    expect(appendixSection).toContain('relative flex aspect-square w-32 items-center justify-center rounded-full border border-[#79a45e]');
    expect(appendixSection).toContain('md:w-32 lg:w-[8.25rem]');
    expect(appendixSection).toContain('items-center justify-center rounded-2xl border border-[#79a45e]');
    expect(appendixSection).not.toContain('rotate-[-38deg]');
    expect(appendixSection).not.toContain('rounded-lg border-[3px] border-gray-950');
    expect(appendixSection).not.toContain('<img');
    expect(appendixSection).not.toContain('canvas');
  });

  it('does not duplicate the legal document box on the full appendix 2 step', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');

    expect(source).not.toContain('Læs hele afsnittet');
    expect(source).toContain("const fullContract = stepId === 'full_contract';");
  });

  it('keeps the review and signature top cards separate from full-width contract text', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const topAreaStart = source.indexOf('function ContractReviewTopArea');
    const topAreaEnd = source.indexOf('function ContractStatusCard');
    const topArea = source.slice(topAreaStart, topAreaEnd);

    expect(source).not.toContain('CONTRACT_SIDEBAR_STEP_ID');
    expect(source).not.toContain('showContractSidebar');
    expect(source).toContain('contractFullTextHeading');
    expect(source).toContain('contractFullTextIntro');
    expect(topArea).toContain('xl:grid-cols-[minmax(0,1fr)_340px]');
    expect(topArea).toContain('<ContractSummary form={form} />');
    expect(topArea).toContain('<ContractStatusCard status={workflowStatusLabel} readyForSignature={readyForSignature} />');
    expect(topArea).toContain('<DocumentList />');
    expect(t('contractFullTextHeading', 'da')).toBe('Kontrakten');
  });

  it('keeps the guided contract step navigation compact on desktop', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const start = source.indexOf('function ProgressSteps');
    const end = source.indexOf('function ContractSummary');
    const progressSteps = source.slice(start, end);

    expect(progressSteps).toContain('lg:grid-cols-11');
    expect(progressSteps).toContain('lg:overflow-x-visible');
    expect(progressSteps).toContain('auto-cols-[5.9rem]');
    expect(progressSteps).toContain('<div className="relative flex min-w-0 items-center justify-center gap-1">');
    expect(progressSteps).toContain('<span className="text-[9px] font-bold uppercase leading-none tracking-wide">Trin {index + 1}</span>');
    expect(progressSteps).toContain('<p className="mt-0.5 break-words text-center text-[10px] font-medium leading-tight">{label.shortTitle}</p>');
    expect(progressSteps).toContain("active ? 'border-gray-950 bg-gray-950 text-white'");
    expect(progressSteps).toContain("complete ? 'border-emerald-200 bg-emerald-50 text-emerald-950'");
    expect(progressSteps).toContain("'border-gray-200 bg-white text-gray-600'");
    expect(progressSteps).not.toContain('<CheckCircle2');
    expect(progressSteps).not.toContain('absolute right-0 top-1/2 h-3 w-3');
    expect(progressSteps).not.toContain('w-32');
    expect(progressSteps).not.toContain('auto-cols-[8rem]');
  });

  it('maps old draft confirmations into the new section ids', () => {
    const legacy = normalizeContractConfirmations({
      collaboration: { confirmed: true, confirmedAt: '2026-08-29T10:00:00.000Z', confirmedBy: 'Birger Pedersen' },
      responsibilities: { confirmed: true, confirmedAt: '2026-08-29T10:05:00.000Z', confirmedBy: 'Birger Pedersen' },
      commercial_terms: { confirmed: true, confirmedAt: '2026-08-29T10:10:00.000Z', confirmedBy: 'Birger Pedersen' },
      full_contract: { confirmed: true, confirmedAt: '2026-08-29T10:15:00.000Z', confirmedBy: 'Birger Pedersen' },
    });

    expect(legacy.purpose_prices_orders_portal.confirmed).toBe(true);
    expect(legacy.territory.confirmed).toBe(true);
    expect(legacy.discount_structure.confirmed).toBe(true);
    expect(legacy.demo_machines.confirmed).toBe(true);
    expect(legacy.spare_parts_service.confirmed).toBe(true);
    expect(legacy.payment_delivery.confirmed).toBe(true);
  });

  it('maps legacy sales and service step state into the combined spare parts step', () => {
    const legacyConfirmation = { confirmed: true, confirmedAt: '2026-08-29T10:12:00.000Z', confirmedBy: 'Birger Pedersen' };
    const legacy = normalizeContractConfirmations({ sales_service_days: legacyConfirmation });

    expect(normalizeContractStepId('sales_service_days')).toBe('spare_parts_service');
    expect(legacy.spare_parts_service).toEqual(legacyConfirmation);
    expect(CONTRACT_STEPS.map((step) => step.id)).not.toContain('sales_service_days');
  });

  it('places appendices in the requested guided steps', () => {
    expect(GUIDED_CONTRACT_SECTIONS.map((section) => section.stepId)).toEqual([
      'purpose_prices_orders_portal',
      'territory',
      'discount_structure',
      'demo_machines',
      'spare_parts_service',
      'marketing',
      'payment_delivery',
      'termination',
    ]);
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'territory')?.source).toContain('Bilag 3');
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'discount_structure')?.source).toContain('Bilag 2');
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'spare_parts_service')?.source).toContain('Bilag 1');
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'payment_delivery')?.source).toContain('Bilag 4');
  });

  it('combines spare parts and sales service content in the guided spare parts step', () => {
    const spareParts = GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'spare_parts_service');
    const text = JSON.stringify(spareParts);

    expect(spareParts?.source).toBe('Kontrakt, punkt 6 og 8 + Bilag 1');
    expect(spareParts?.hideGuidedSource).toBe(true);
    expect(text).toContain("Reservedele bestilles via Timan A/S' webshop.");
    expect(text).toContain('8. Salgs- og servicedage');
    expect(text).toContain('Bilag 1: Service og garanti betingelser');
    expect(text).not.toContain('Service betingelser: se Bilag 1.');
    expect(GUIDED_CONTRACT_SECTIONS.map((section) => section.stepId)).not.toContain('sales_service_days');
  });

  it('renders the contract service hourly rate in key legal service terms', () => {
    const defaultSections = renderGuidedContractSections({
      companyName: completeForm.dealerName,
      partnerType: completeForm.partnerType,
      primaryTerritory: completeForm.primaryTerritory,
      secondaryTerritory: completeForm.secondaryTerritory,
      serviceHourlyRateDkk: completeForm.serviceHourlyRateDkk,
    });
    const changedSections = renderGuidedContractSections({
      companyName: completeForm.dealerName,
      partnerType: completeForm.partnerType,
      primaryTerritory: completeForm.primaryTerritory,
      secondaryTerritory: completeForm.secondaryTerritory,
      serviceHourlyRateDkk: 425,
    });
    const defaultText = JSON.stringify(defaultSections);
    const changedText = JSON.stringify(changedSections);

    expect(defaultText).toContain('Timan betaler 360 kr. pr. forbrugt time');
    expect(defaultText).toContain('360 kr. pr. køretime');
    expect(defaultText).not.toContain('360kr');
    expect(changedText).toContain('Timan betaler 425 kr. pr. forbrugt time');
    expect(changedText).toContain('425 kr. pr. køretime');
    expect(changedText).not.toContain('360 kr. pr. forbrugt time');
  });

  it('stores the contract-specific service hourly rate in the snapshot', () => {
    const form: ContractFormData = { ...completeForm, serviceHourlyRateDkk: 425 };
    const legalSections = renderGuidedContractSections({
      companyName: form.dealerName,
      partnerType: form.partnerType,
      primaryTerritory: form.primaryTerritory,
      secondaryTerritory: form.secondaryTerritory,
      serviceHourlyRateDkk: form.serviceHourlyRateDkk,
    });
    const snapshot = buildContractSnapshot(form, confirmed, { legalSections });

    expect(snapshot.serviceTerms).toEqual({
      currency: 'DKK',
      hourlyRateDkk: 425,
      laborHourlyRateDkk: 425,
      travelHourlyRateDkk: 425,
      rateModel: 'shared_labor_and_travel_rate',
    });
    expect(JSON.stringify(snapshot.legalSections)).toContain('425 kr. pr. forbrugt time');
  });

  it('renders and stores dynamic contract payment terms', () => {
    const form: ContractFormData = { ...completeForm, paymentTerm: 'net_30' };
    const legalSections = renderGuidedContractSections({
      companyName: form.dealerName,
      partnerType: form.partnerType,
      primaryTerritory: form.primaryTerritory,
      secondaryTerritory: form.secondaryTerritory,
      serviceHourlyRateDkk: form.serviceHourlyRateDkk,
      paymentTerm: form.paymentTerm,
    });
    const snapshot = buildContractSnapshot(form, confirmed, { legalSections });
    const text = JSON.stringify(snapshot.legalSections);

    expect(renderContractPaymentTermLegalText('net_21')).toBe('Betalingsbetingelser: Betaling forfalder netto 21 dage fra fakturadato.');
    expect(renderContractPaymentTermLegalText('net_30')).toBe('Betalingsbetingelser: Betaling forfalder netto 30 dage fra fakturadato.');
    expect(text).toContain('Betalingsbetingelser: Betaling forfalder netto 30 dage fra fakturadato. Ved manglende betaling');
    expect(text).not.toContain('netto 21 dage fra fakturadato. Ved manglende betaling');
    expect(snapshot.paymentTerms).toEqual({
      paymentTerm: 'net_30',
      label: 'Netto 30 dage',
      legalText: 'Betalingsbetingelser: Betaling forfalder netto 30 dage fra fakturadato.',
      cbsLegalTextMissing: false,
    });
  });

  it('keeps CBS selectable while flagging the missing legal source text', () => {
    expect(contractPaymentTermHasMissingLegalText('cbs')).toBe(true);
    expect(renderContractPaymentTermLegalText('cbs')).toBe('Betalingsbetingelser: CBS.');
    expect(buildContractSnapshot({ ...completeForm, paymentTerm: 'cbs' }, confirmed).paymentTerms.cbsLegalTextMissing).toBe(true);
  });

  it('invalidates the spare parts service confirmation when the hourly rate changes', () => {
    expect(shouldResetContractServiceConfirmation(360, 425, true)).toBe(true);
    expect(shouldResetContractServiceConfirmation(360, 425, false)).toBe(false);
    expect(shouldResetContractServiceConfirmation('360', 360, true)).toBe(false);
  });

  it('invalidates payment delivery confirmation when payment terms change', () => {
    expect(shouldResetContractPaymentConfirmation('net_21', 'net_30', true)).toBe(true);
    expect(shouldResetContractPaymentConfirmation('net_21', 'net_30', false)).toBe(false);
    expect(shouldResetContractPaymentConfirmation('net_21', 'net_21', true)).toBe(false);
  });

  it('shows the important service terms panel and editable hourly rate in step 6', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const start = source.indexOf('function SparePartsServiceSection');
    const end = source.indexOf('function ContractLegalSectionHeader');
    const sparePartsServiceSection = source.slice(start, end);

    expect(source).toContain('contractImportantSparePartsServiceTermsHeading');
    expect(source).toContain('contractImportantServiceTermsIntro');
    expect(source).toContain('Aftalt timetakst for reklamationsarbejde');
    expect(source).toContain('Reklamationsarbejde må først påbegyndes');
    expect(source).toContain('Fragt og levering');
    expect(source).toContain('Levering af reservedele er frit leveret med den transportør, der vælges af Timan. Timan betaler fragt tur/retur for reklamationsdele i forbindelse med godkendt reklamation.');
    expect(source).toContain('Maksimalt 6 timers kørsel pr. reklamation dækkes af Timan med samme timetakst.');
    expect(source).toContain('shouldResetContractServiceConfirmation');
    expect(source).toContain("activeStep.id !== 'spare_parts_service'");
    expect(sparePartsServiceSection).toContain('heading: undefined');
    expect(sparePartsServiceSection).toContain("key={`${section.title}-intro-${index}`}");
    expect(sparePartsServiceSection).toContain('<ul className="space-y-2.5 text-sm leading-6 text-gray-700">');
    expect(sparePartsServiceSection).not.toContain('<ContractLegalSectionHeader section={section} />');
    expect(sparePartsServiceSection).not.toContain("['Fragt', 'Timan betaler fragt tur/retur");
    expect(sparePartsServiceSection).not.toContain('className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"');
  });

  it('shows the payment terms dropdown in the payment delivery step', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');

    expect(source).toContain('PaymentDeliverySection');
    expect(source).toContain('contractPaymentTermsLabel');
    expect(source).toContain('CONTRACT_PAYMENT_TERM_OPTIONS.map');
    expect(source).toContain('shouldResetContractPaymentConfirmation');
    expect(t('contractPaymentTermsLabel', 'da')).toBe('Betalingsbetingelser');
    expect(t('contractPaymentTermsLabel', 'en')).toBe('Payment terms');
  });

  it('renders the spare parts portal link text through portal translations', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');

    expect(source).toContain('SPARE_PARTS_PORTAL_URL');
    expect(source).toContain('https://cloud.interactivespares.com/timan/categorie/0000+-+Front+page');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noreferrer noopener"');
    expect(t('contractSparePartsPortalLink', 'da')).toBe('Reservedelsportal');
    expect(t('contractSparePartsPortalLink', 'en')).toBe('Spare parts portal');
    expect(t('contractImportantSparePartsServiceTermsHeading', 'da')).toBe('Vigtige reservedels- og servicevilkår');
    expect(t('contractImportantSparePartsServiceTermsHeading', 'en')).toBe('Important spare parts and service terms');
    expect(t('contractImportantServiceTermsIntro', 'da')).toBe('Kort samtaleoverblik. De fulde servicebetingelser står nedenfor.');
    expect(t('contractImportantServiceTermsIntro', 'en')).toBe('Brief conversation overview. The full service terms are below.');
  });

  it('uses neutral guided contract source references without changing official document titles', () => {
    expect(GUIDED_CONTRACT_SECTIONS.map((section) => section.source)).toEqual([
      'Kontrakt, punkt 1, 2 og 10',
      'Kontrakt, punkt 3 + Bilag 3',
      'Kontrakt, punkt 4 + Bilag 2',
      'Kontrakt, punkt 5',
      'Kontrakt, punkt 6 og 8 + Bilag 1',
      'Kontrakt, punkt 7 og 7.1',
      'Kontrakt, punkt 9 + Bilag 4',
      'Kontrakt, punkt 11',
    ]);
    expect(JSON.stringify(GUIDED_CONTRACT_SECTIONS)).not.toContain('Forhandlerkontrakt Timan, punkt');

    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    expect(source).toContain("'Forhandlerkontrakt Timan'");
    expect(source).toContain('FORHANDLERKONTRAKT - GENNEMGANG OG UNDERSKRIFT');
    expect(source).toContain('Timan_Forhandlerkontrakt_');
  });

  it('removes the redundant demo discount helper from complete rendered contracts', () => {
    for (const partnerType of CONTRACT_PARTNER_TYPES) {
      const legalSections = renderGuidedContractSections({
        companyName: partnerType === 'importer' ? 'ABC Maschinen GmbH' : partnerType === 'service_partner' ? 'Service Pro ApS' : 'Dealer House A/S',
        partnerType,
      });
      const bodyText = JSON.stringify(legalSections);

      expect(bodyText).not.toContain('Demo-rabat: Rabat på demo-maskiner. Bilag 2.');
      expect(bodyText).toContain('Demo-maskiner må ikke videresælges før 9 måneder efter levering fra Timan A/S.');
    }
  });

  it('removes the redundant territory intro and starts directly at Appendix 3 content', () => {
    const territory = GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'territory');
    expect(territory?.blocks[0].heading).toBe('Bilag 3: Området');
    expect(shouldHideGuidedContractUiText('Bilag 3: Området', territory!.title)).toBe(true);
    expect(JSON.stringify(territory)).not.toContain('3. Område');
    expect(JSON.stringify(territory)).not.toContain('Se bilag 3.');
  });

  it('renders Appendix 3 territory text from structured primary and secondary data', () => {
    const germanPrimary = parseContractPostalInput('10115, 20000-29999', 'DE');
    const germanSecondary = parseContractPostalInput('70000-79999', 'DE');
    const form: ContractFormData = {
      ...completeForm,
      partnerType: 'dealer',
      primaryTerritory: {
        country: 'DE',
        wholeCountry: false,
        selectedRegions: [
          { id: '20', name: 'PLZ2 20' },
          { id: '34', name: 'PLZ2 34' },
        ],
        municipalities: [],
        postalEntries: germanPrimary.postalEntries,
        postalCodes: germanPrimary.postalCodes,
        postalRanges: germanPrimary.postalRanges,
      },
      secondaryTerritory: {
        country: 'DE',
        wholeCountry: false,
        selectedRegions: [{ id: '70', name: 'PLZ2 70' }],
        municipalities: [],
        postalEntries: germanSecondary.postalEntries,
        postalCodes: germanSecondary.postalCodes,
        postalRanges: germanSecondary.postalRanges,
        enabled: true,
      },
    };
    const territory = renderGuidedContractSections({
      companyName: form.dealerName,
      partnerType: form.partnerType,
      primaryTerritory: form.primaryTerritory,
      secondaryTerritory: form.secondaryTerritory,
    }).find((section) => section.stepId === 'territory');
    const text = JSON.stringify(territory);

    expect(describeContractTerritoryArea(form.primaryTerritory, 'da')).toBe('Land: Tyskland, Valgt område: PLZ2 20, Valgt område: PLZ2 34, Postnummer: 10115, Postnummer: 20000–29999');
    expect(describeContractSecondaryTerritoryArea(form.secondaryTerritory, 'da')).toBe('Land: Tyskland, Valgt område: PLZ2 70, Postnummer: 70000–79999');
    expect(getContractTerritoryDisplayGroups(form.primaryTerritory, 'da')).toMatchObject({
      countryLine: 'Land: Tyskland',
      regionLabel: 'Valgte områder',
      regions: ['PLZ2 20', 'PLZ2 34'],
      postalLabel: 'PLZ/postnumre',
      postals: ['10115', '20000–29999'],
    });
    expect(text).toContain('Land: Tyskland');
    expect(text).toContain('Valgt område: PLZ2 20');
    expect(text).toContain('Valgt område: PLZ2 34');
    expect(text).toContain('Valgt område: PLZ2 70');
    expect(text).toContain('Postnummer: 20000–29999');
    expect(text).toContain('Postnummer: 10115');
    expect(text).toContain('Postnummer: 70000–79999');
    expect(text).not.toContain('Fyn, Tåsinge');
    expect(text).not.toContain('Hobro');
  });

  it.each([
    ['dealer', 'DK', false, '5000-5999', 'Land: Danmark, Postnummer: 5000–5999'],
    ['importer', 'DE', true, '', 'Tyskland - Hele landet'],
    ['service_partner', 'DK', false, '6000', 'Land: Danmark, Postnummer: 6000 Kolding'],
  ] as const)('renders complete territory snapshots for %s contracts', (partnerType, country, wholeCountry, postalInput, expectedDescription) => {
    const parsed = parseContractPostalInput(postalInput, country);
    const form: ContractFormData = {
      ...completeForm,
      partnerType,
      primaryTerritory: {
        country,
        wholeCountry,
        selectedRegions: [],
        municipalities: [],
        postalEntries: parsed.postalEntries,
        postalCodes: parsed.postalCodes,
        postalRanges: parsed.postalRanges,
      },
      secondaryTerritory: {
        country,
        wholeCountry: false,
        selectedRegions: [],
        municipalities: [],
        postalEntries: [],
        postalCodes: [],
        postalRanges: [],
        enabled: false,
      },
    };
    const legalSections = renderGuidedContractSections({
      companyName: form.dealerName,
      partnerType: form.partnerType,
      primaryTerritory: form.primaryTerritory,
      secondaryTerritory: form.secondaryTerritory,
    });
    const snapshot = buildContractSnapshot(form, confirmed, { legalSections });
    const text = JSON.stringify(snapshot.legalSections);

    expect(buildContractTerritorySnapshot(form).primaryDescription).toBe(expectedDescription);
    expect(snapshot.territory.primaryDescription).toBe(expectedDescription);
    for (const item of getContractTerritoryDisplayItems(form.primaryTerritory, 'da')) {
      expect(text).toContain(item);
    }
    expect(text).not.toContain('{{primaryTerritoryDescription}}');
    expect(text).not.toContain('Sekundær område');
  });

  it('hides redundant appendix labels in the guided UI without changing legal source text', () => {
    const sections = renderGuidedContractSections({
      companyName: completeForm.dealerName,
      partnerType: completeForm.partnerType,
    });
    const byStep = Object.fromEntries(sections.map((section) => [section.stepId, section]));

    expect(JSON.stringify(byStep.discount_structure)).toContain('Se bilag 2.');
    expect(getVisibleGuidedUiText(byStep.discount_structure)).not.toContain('Se bilag 2.');

    expect(JSON.stringify(byStep.spare_parts_service)).toContain('Bilag 1: Service og garanti betingelser');
    expect(getVisibleGuidedUiText(byStep.spare_parts_service)).not.toContain('Bilag 1: Service og garanti betingelser');
    expect(JSON.stringify(byStep.spare_parts_service)).not.toContain('Service betingelser: se Bilag 1.');

    expect(JSON.stringify(byStep.territory)).toContain('Bilag 3: Området');
    expect(getVisibleGuidedUiText(byStep.territory)).not.toContain('Bilag 3: Området');

    expect(JSON.stringify(byStep.payment_delivery)).toContain('Bilag 4: Salgs- og leveringsbetingelser');
    expect(JSON.stringify(byStep.payment_delivery)).toContain('Se mere om leveringsbetingelser: bilag 4.');
    expect(getVisibleGuidedUiText(byStep.payment_delivery)).not.toContain('Bilag 4: Salgs- og leveringsbetingelser');
    expect(getVisibleGuidedUiText(byStep.payment_delivery)).not.toContain('Se mere om leveringsbetingelser: bilag 4.');

    const appendix2SourceParagraphs = renderAppendix2Paragraphs('dealer');
    const appendix2UiParagraphs = appendix2SourceParagraphs.filter(
      (paragraph) => !shouldHideGuidedContractUiText(paragraph, 'Rabatstruktur og Bilag 2'),
    );
    expect(appendix2SourceParagraphs[0]).toBe('Bilag 2: Rabat.');
    expect(appendix2UiParagraphs).not.toContain('Bilag 2: Rabat.');
  });

  it('hides legal point numbers in guided UI headings without changing source headings', () => {
    const rendered = renderGuidedContractSections({
      companyName: completeForm.dealerName,
      partnerType: completeForm.partnerType,
    });
    const sourceHeadings = rendered.flatMap((section) => section.blocks.map((block) => block.heading).filter(Boolean));
    const displayHeadings = sourceHeadings.map((heading) => getGuidedContractDisplayHeading(heading!));

    expect(sourceHeadings).toContain('1. Formål');
    expect(sourceHeadings).toContain('2. Priser, ordre og forhandlerportal');
    expect(sourceHeadings).toContain('10. Årligt forhandlermøde');
    expect(sourceHeadings).toContain('7.1 Marketingforpligtelser Timan');
    expect(displayHeadings).toContain('Formål');
    expect(displayHeadings).toContain('Priser, ordre og forhandlerportal');
    expect(displayHeadings).toContain('Årligt forhandlermøde');
    expect(displayHeadings).toContain('Marketingforpligtelser Timan');
    expect(displayHeadings).toContain('Bilag 3: Området');
    expect(displayHeadings).not.toContain('1. Formål');
    expect(displayHeadings).not.toContain('10. Årligt forhandlermøde');
    expect(displayHeadings).not.toContain('7.1 Marketingforpligtelser Timan');
  });

  it.each([
    ['dealer', 'forhandler', 'forhandleren', 'forhandlere', 'forhandlerportalen'],
    ['importer', 'importør', 'importøren', 'importører', 'importørportalen'],
    ['service_partner', 'servicepartner', 'servicepartneren', 'servicepartnere', 'servicepartnerportalen'],
  ] as const)('renders contract party text dynamically for %s', (partnerType, singular, definite, plural, portal) => {
    const companyName = partnerType === 'importer' ? 'ABC Maschinen GmbH' : partnerType === 'service_partner' ? 'Service Pro ApS' : 'Dealer House A/S';
    const legalSections = renderGuidedContractSections({ companyName, partnerType });
    const appendix2Paragraphs = renderAppendix2Paragraphs(partnerType);
    const text = `${JSON.stringify(legalSections)} ${appendix2Paragraphs.join(' ')}`;

    expect(text).toContain(`Timan A/S og ${companyName}, herefter nævnt som ${singular}`);
    expect(text).toContain(definite);
    expect(text).toContain(plural);
    expect(text).toContain(portal);
    expect(text).not.toContain('xxxx');
    expect(text).not.toContain('xxx');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('}}');
  });

  it.each(CONTRACT_PARTNER_TYPES)('keeps the end-customer choice sentence neutral for %s contracts', (partnerType) => {
    const legalSections = renderGuidedContractSections({
      companyName: partnerType === 'importer' ? 'ABC Maschinen GmbH' : partnerType === 'service_partner' ? 'Service Pro ApS' : 'Dealer House A/S',
      partnerType,
    });
    const text = JSON.stringify(legalSections);

    expect(text).toContain('Slutkunden bestemmer selv, hvilken Timan-samarbejdspartner de ønsker at handle med.');
    expect(text).not.toContain('Slutkunderne vælger selv hvilken');
    expect(text).not.toContain('hvilken importør de ønsker at handle med');
    expect(text).not.toContain('hvilken forhandler de ønsker at handle med');
    expect(text).not.toContain('hvilken servicepartner de ønsker at handle med');
  });

  it.each([
    ['importer', 'ABC Maschinen GmbH', ['forhandleren', 'forhandlerens', 'forhandler portalen', 'forhandlerportalen']],
    ['service_partner', 'Service Pro ApS', ['forhandleren', 'forhandlerens', 'importøren', 'importørens', 'forhandler portalen', 'forhandlerportalen']],
    ['dealer', 'Dealer House A/S', ['importøren', 'importørens', 'servicepartneren', 'servicepartnerens', 'importørportalen', 'servicepartnerportalen']],
  ] as const)('does not render the contract party as another partner type for %s', (partnerType, companyName, forbiddenTerms) => {
    const legalSections = renderGuidedContractSections({ companyName, partnerType });
    const appendix2Paragraphs = renderAppendix2Paragraphs(partnerType);
    const bodyText = [
      ...legalSections.flatMap((section) => section.blocks.flatMap((block) => [
        block.heading,
        ...(block.paragraphs ?? []),
        ...(block.bullets ?? []),
      ])),
      ...appendix2Paragraphs,
    ].filter(Boolean).join('\n').toLowerCase();

    for (const forbidden of forbiddenTerms) {
      expect(bodyText).not.toContain(forbidden);
    }
  });

  it('stores the contract snapshot with Timan data and signature state', () => {
    const signedForm = { ...completeForm, signatureDataUrl: 'data:image/png;base64,test' };
    const snapshot = buildContractSnapshot(signedForm, confirmed);
    expect(snapshot.status).toBe('Signed');
    expect(snapshot.timan.company).toBe(TIMAN_COMPANY_INFO.company);
    expect(snapshot.timan.sellerEmail).toBe('bp@timan.dk');
    expect(snapshot.dealer.name).toBe('Metec Metal Technology Inc');
    expect(snapshot.signatureDataUrl).toBe('data:image/png;base64,test');
  });

  it('uses stable workflow status ids with Danish labels', () => {
    expect(Object.keys(CONTRACT_STATUS_LABELS_DA)).toEqual([
      'draft',
      'guided_review',
      'ready_for_signature',
      'awaiting_signed_upload',
      'submitted_for_approval',
      'changes_requested',
      'approved',
      'archived',
    ]);
    expect(getContractWorkflowStatusLabel('submitted_for_approval')).toBe('Sendt til Timan-godkendelse');
    expect(getContractWorkflowStatusLabel('unknown')).toBe('Kladde');
  });

  it('allows only the intended contract status transitions', () => {
    expect(canTransitionContractStatus('draft', 'ready_for_signature')).toBe(true);
    expect(canTransitionContractStatus('ready_for_signature', 'awaiting_signed_upload')).toBe(true);
    expect(canTransitionContractStatus('submitted_for_approval', 'changes_requested')).toBe(true);
    expect(canTransitionContractStatus('submitted_for_approval', 'approved')).toBe(true);
    expect(canTransitionContractStatus('approved', 'awaiting_signed_upload')).toBe(false);
    expect(canTransitionContractStatus('archived', 'draft')).toBe(false);
    expect(hasReachedContractStatus('approved', 'awaiting_signed_upload')).toBe(true);
  });

  it('freezes legal text and review actor details into the locked snapshot', () => {
    const changedRateForm: ContractFormData = { ...completeForm, serviceHourlyRateDkk: 425 };
    const legalSections = renderGuidedContractSections({
      companyName: changedRateForm.dealerName,
      partnerType: changedRateForm.partnerType,
      primaryTerritory: changedRateForm.primaryTerritory,
      secondaryTerritory: changedRateForm.secondaryTerritory,
      serviceHourlyRateDkk: changedRateForm.serviceHourlyRateDkk,
    });
    const snapshot = buildContractSnapshot(changedRateForm, confirmed, {
      contractId: 'contract-1',
      contractNumber: 'DC-2026-1000',
      workflowStatus: 'ready_for_signature',
      legalSections,
      appendices: { appendix2Paragraphs: renderAppendix2Paragraphs(completeForm.partnerType) },
      completedGuidedReviewAt: '2026-08-30T08:00:00.000Z',
      completedGuidedReviewBy: 'Birger Pedersen',
      completedGuidedReviewByEmail: 'bp@timan.dk',
      expectedSignedPages: 5,
    });

    expect(snapshot.contractId).toBe('contract-1');
    expect(snapshot.contractNumber).toBe('DC-2026-1000');
    expect(snapshot.workflowStatus).toBe('ready_for_signature');
    expect(JSON.stringify(snapshot.legalSections)).toContain('Timan A/S og Metec Metal Technology Inc');
    expect(JSON.stringify(snapshot.legalSections)).toContain('425 kr. pr. forbrugt time');
    expect(JSON.stringify(snapshot.legalSections)).not.toContain('500 kr. pr. forbrugt time');
    expect(snapshot.appendices).toEqual({ appendix2Paragraphs: renderAppendix2Paragraphs(completeForm.partnerType) });
    expect(snapshot.completedGuidedReviewByEmail).toBe('bp@timan.dk');
    expect(snapshot.expectedSignedPages).toBe(5);
  });

  it('defines database workflow primitives for uploads, approval, RLS and private storage', () => {
    const migration = readFileSync('supabase/migrations/20260830081914_dealer_contract_approval_workflow.sql', 'utf8');

    expect(migration).toContain("'dealer-contracts'");
    expect(migration).toContain('public.dealer_contract_upload_versions');
    expect(migration).toContain('public.dealer_contract_upload_files');
    expect(migration).toContain('complete_dealer_contract_guided_review');
    expect(migration).toContain('submit_dealer_contract_upload');
    expect(migration).toContain('request_dealer_contract_new_upload');
    expect(migration).toContain('approve_dealer_contract_upload');
    expect(migration).toContain('public.can_approve_dealer_contract');
    expect(migration).toContain('public.can_access_dealer_contract_storage');
    expect(migration).toContain("public.audit_dealer_contract_event");
    expect(migration).toContain("uv.status = 'draft'");
    expect(migration).toContain("contract_status = 'approved'");
  });

  it('uses a stable draft key per seller and dealer account', () => {
    expect(buildDealerContractDraftKey('BP@Timan.dk', ' 11913 ')).toBe('bp@timan.dk:11913');
    expect(buildDealerContractDraftKey('em@timan.dk', '')).toBe('em@timan.dk:manual');
  });

  it('maps workflow statuses to the internal overview groups', () => {
    expect(getDealerContractOverviewStatusGroup('draft')).toBe('draft');
    expect(getDealerContractOverviewStatusGroup('guided_review')).toBe('draft');
    expect(getDealerContractOverviewStatusGroup('ready_for_signature')).toBe('pending');
    expect(getDealerContractOverviewStatusGroup('awaiting_signed_upload')).toBe('pending');
    expect(getDealerContractOverviewStatusGroup('submitted_for_approval')).toBe('pending');
    expect(getDealerContractOverviewStatusGroup('changes_requested')).toBe('rejected');
    expect(getDealerContractOverviewStatusGroup('approved')).toBe('approved');
    expect(getDealerContractOverviewStatusGroup('archived')).toBe('terminated');
  });

  it('uses the internal contract overview status labels', () => {
    expect(getDealerContractOverviewStatusLabel('draft')).toBe('Kladde');
    expect(getDealerContractOverviewStatusLabel('guided_review')).toBe('Klargjort / klar til gennemgang');
    expect(getDealerContractOverviewStatusLabel('ready_for_signature')).toBe('Gennemgang / afventer partner');
    expect(getDealerContractOverviewStatusLabel('submitted_for_approval')).toBe('Modtaget / afventer Timan');
    expect(getDealerContractOverviewStatusLabel('approved')).toBe('Godkendt');
    expect(getDealerContractOverviewStatusLabel('changes_requested')).toBe('Ikke godkendt / afvist');
    expect(getDealerContractOverviewStatusLabel('archived')).toBe('Opsagt / ophørt');
  });

  it('keeps contract deletion backend-only in the overview UI and database helper', () => {
    const overviewSource = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const serviceSource = readFileSync('src/lib/dealerContractsService.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260831210500_dealer_contract_backend_delete.sql', 'utf8');

    expect(overviewSource).toContain("const isBackend = portalRole === 'timan_backend';");
    expect(overviewSource).toContain('{isBackend && (');
    expect(overviewSource).toContain('Slet kontrakt');
    expect(overviewSource).toContain('Er du sikker på, at du vil slette denne kontrakt?');
    expect(serviceSource).toContain('export async function deleteDealerContract');
    expect(serviceSource).toContain('supabase.rpc("delete_dealer_contract"');
    expect(migration).toContain('create or replace function public.delete_dealer_contract');
    expect(migration).toContain('if not public.is_timan_backend() then');
    expect(migration).toContain("delete from storage.objects");
    expect(migration).toContain("delete from public.dealer_contracts");
    expect(migration).toContain("grant execute on function public.delete_dealer_contract(uuid) to authenticated, service_role");
  });

  it('keeps appendix 2 discount text verbatim', () => {
    expect(APPENDIX_2_PARAGRAPHS).toEqual([
      'Bilag 2: Rabat.',
      '1. Målet med rabattstrukturen.',
      'Vores mål med rabattstrukturen er at sikre en ensartet og fair behandling af alle {{partnerPlural}} med gensidig respekt, men samtidig belønne de {{partnerPlural}} der yder en ekstra instans.',
      '2. Grund rabatten.',
      'Grund rabat: 25%.',
      'Demonstrationsmaskine rabat: 25%-10%',
      '3. Rabat 1. køb flere få flere procenter.',
      'Timan giver mulighed for at få ekstra rabat som skemaet herunder viser, hvis man køber flere maskiner pr. ordre.',
      'Hvis flere af samme slags redskab ønskes på samme ordre, giver redskabsrabaten standartrabat 25%.',
      '4. Rabat 2. Leveringstid flere procenter.',
      'Er leveringstiden over 3mdr. fra ordren bliver afgivet, vil man kunne opnå ekstra rabat.',
      'Der ydes ikke bestillingsrabat på demomaskiner.',
      '5. Rabat 3. Egen demonstration - egen salg.',
      'Opnår {{partnerDefinite}} et salg uden Timan har været involveret i en demonstration, til skønnes dette.',
      'Demorabatten ydes på grundmaskinen eksklusivt udstyr.',
      'Demonstrationsrabatten gives som en kreditnota, der modregnes ved fremtidige køb hos Timan.',
      '6. Udregning af rabat.',
      'Rabatten udregnes ud fra kombinerede rabatter eller efterfølgende rabatter. Og udregnes altid som kæderabat: Grundrabatten + Rabat 1 + Rabat 2 + Rabat 3 (Grund rabatten + Flere stk. + Leveringstid + Demonstrations rabat)',
    ]);
    expect(APPENDIX_2_EXAMPLE_LINES[0]).toBe('Den maximale rabat, som kan opnåes på en maskine og redskaber er: 25% + 4% + 2% = 29,44 %');
    expect(APPENDIX_2_EXAMPLE_LINES[0]).not.toContain('31');
    expect(APPENDIX_2_EXAMPLE_LINES[1]).toBe('Når garantiregistreringen er gennemført, vil beløbet på 3.100 kr. blive udstedt som en kreditnota, der kan anvendes ved fremtidige køb hos Timan.');
    expect(renderAppendix2Paragraphs('importer')[2]).toContain('alle importører');
    expect(renderAppendix2Paragraphs('importer')[13]).toBe('Opnår importøren et salg uden Timan har været involveret i en demonstration, til skønnes dette.');
  });
});
