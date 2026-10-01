import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildContractSnapshot,
  EMPTY_CONTRACT_CONFIRMATIONS,
  type ContractFormData,
} from '@/lib/contractFlow';
import { getSnapshotLegalSections } from '@/lib/contractPdfDocument';
import {
  buildContractPdfPresentation,
  getContractPdfLegalContent,
  loadContractPdfTerritoryMaps,
  stripContractPdfHeadingPrefix,
} from '@/lib/contractPdfPresentation';
import {
  createEmptyContractTerritoryArea,
  createEmptySecondaryContractTerritoryArea,
} from '@/lib/contractTerritory';

const form: ContractFormData = {
  contractLanguage: 'da',
  partnerType: 'service_partner',
  dealerName: 'Service Partner QA A/S',
  dealerAddress: 'Testvej 10',
  dealerPostalCode: '8000',
  dealerCity: 'Aarhus C',
  dealerCountry: 'Danmark',
  dealerCvr: '12345678',
  contactPerson: 'QA Kontakt',
  contactTitle: 'Servicechef',
  timanSellerName: 'Esben Madsen',
  timanSellerEmail: 'em@timan.dk',
  timanSellerPhone: '',
  contractDate: '2026-09-25',
  primaryTerritory: {
    ...createEmptyContractTerritoryArea('DK'),
    wholeCountry: true,
  },
  secondaryTerritory: createEmptySecondaryContractTerritoryArea('DK'),
  serviceHourlyRateDkk: 360,
  paymentTerm: 'net_21',
  signatureDataUrl: null,
};

function servicePartnerSnapshot() {
  return buildContractSnapshot(form, EMPTY_CONTRACT_CONFIRMATIONS, {
    contractNumber: 'DC-2026-1763',
    completedGuidedReviewAt: '2026-09-25T10:00:00.000Z',
  });
}

describe('professional partner agreement PDF presentation', () => {
  it('uses one sequential hierarchy without PDF-facing appendix labels', () => {
    const snapshot = servicePartnerSnapshot();
    const legalSections = getSnapshotLegalSections(snapshot, 'da');
    const presentation = buildContractPdfPresentation(snapshot, legalSections, 'da');

    expect(presentation.parties).toEqual({ number: 1, title: 'Parterne' });
    expect(presentation.sections.map((section) => `${section.number}. ${section.title}`)).toEqual([
      '2. Samarbejde, priser & portal',
      '3. Område',
      '4. Maskinsalg & henvisning',
      '5. Reservedele & Service',
      '6. Marketing',
      '7. Salgs- og servicedage',
      '8. Betaling og levering',
      '9. Varighed & opsigelse',
    ]);
    expect(presentation.signature).toEqual({ number: 10, title: 'Underskrift' });

    const visibleText = JSON.stringify(presentation);
    expect(visibleText).not.toMatch(/Bilag\s+[1-4]/i);
    expect(visibleText).not.toContain('Bilag 3: Området');
    expect(presentation.sections.flatMap((section) => section.blocks.map((block) => block.heading)).filter(Boolean))
      .toEqual(expect.arrayContaining(['3.1 Aftalen (salg og reservedele)', '5.1 Reklamation', '5.2 Garanti registreringer']));
  });

  it('preserves every frozen legal clause while changing only numbering and references', () => {
    const snapshot = servicePartnerSnapshot();
    const legalSections = getSnapshotLegalSections(snapshot, 'da');
    const presentation = buildContractPdfPresentation(snapshot, legalSections, 'da');
    const visibleText = presentation.sections.flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) => [block.heading ?? '', ...block.paragraphs, ...block.bullets]),
    ]).join('\n');

    getContractPdfLegalContent(legalSections).forEach((clause) => {
      const normalized = stripContractPdfHeadingPrefix(clause)
        .replace(/\bBilag\s+[1-4]\b/gi, '')
        .trim();
      expect(visibleText).toContain(normalized);
    });
  });

  it('uses the stored territory snapshot to build a static print map', async () => {
    const snapshot = servicePartnerSnapshot();
    const loadJson = async (url: string) => JSON.parse(readFileSync(`public${url}`, 'utf8')) as unknown;
    const maps = await loadContractPdfTerritoryMaps(snapshot.territory, 'da', loadJson);

    expect(maps).toHaveLength(1);
    expect(maps[0].title).toBe('Primært område');
    expect(maps[0].features).toHaveLength(1);
    expect(maps[0].features[0]).toMatchObject({ key: 'DK', selected: true });
    expect(maps[0].attribution).toContain('Natural Earth');
  });

  it('keeps detailed historical geometry tied to the saved municipality IDs', async () => {
    const detailedForm: ContractFormData = {
      ...form,
      primaryTerritory: {
        ...createEmptyContractTerritoryArea('DK'),
        selectedRegions: [{ id: '0760', name: 'Ringkøbing-Skjern' }],
        municipalities: [{ id: '0760', name: 'Ringkøbing-Skjern' }],
      },
    };
    const snapshot = buildContractSnapshot(detailedForm, EMPTY_CONTRACT_CONFIRMATIONS, {
      contractNumber: 'DC-2026-1763',
    });
    detailedForm.primaryTerritory = {
      ...createEmptyContractTerritoryArea('DK'),
      selectedRegions: [{ id: '0751', name: 'Aarhus' }],
      municipalities: [{ id: '0751', name: 'Aarhus' }],
    };
    const loadJson = async (url: string) => JSON.parse(readFileSync(`public${url}`, 'utf8')) as unknown;
    const [map] = await loadContractPdfTerritoryMaps(snapshot.territory, 'da', loadJson);

    expect(map.features.find((feature) => feature.key === '0760')?.selected).toBe(true);
    expect(map.features.find((feature) => feature.key === '0751')?.selected).toBe(false);
  });

  it.each(['da', 'en', 'de'] as const)('localizes the complete PDF hierarchy for %s', (language) => {
    const snapshot = servicePartnerSnapshot();
    const legalSections = getSnapshotLegalSections(snapshot, language);
    const presentation = buildContractPdfPresentation(snapshot, legalSections, language);

    expect(presentation.sections).toHaveLength(8);
    expect(presentation.sections.every((section, index) => section.number === index + 2)).toBe(true);
    expect(JSON.stringify(presentation)).not.toMatch(/Bilag\s+[1-4]|Appendix\s+[1-4]|Anhang\s+[1-4]/i);
  });

  it('keeps the generator free of a printed TOC and web UI chrome', () => {
    const source = readFileSync('src/lib/contractPdfDocument.ts', 'utf8');

    expect(source).not.toContain('INDHOLDSFORTEGNELSE');
    expect(source).not.toContain('CONTENTS');
    expect(source).not.toContain("pdf.text('TIMAN'");
    expect(source).not.toContain('Trin 5 af 11');
    expect(source).toContain('pdf.outline.add');
    expect(source).toContain('partyColumn(left');
    expect(source).toContain('partyColumn(108');
    expect(source).toContain('drawContractTerritoryMap');
    expect(source).toContain('TIMAN_COMPANY_INFO.address');
  });
});
