import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/context/AppUserContext';

vi.mock('@/lib/machineJournalScope', () => ({
  buildJournalScope: vi.fn(),
}));
vi.mock('@/lib/machineRegistryPageService', () => ({
  fetchMachineRegistryPage: vi.fn(),
}));
vi.mock('@/lib/portalAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/portalAccess')>();
  return { ...actual, derivePortalRole: vi.fn(() => 'timan_backend') };
});

import { fetchMachineRegistryPage } from '@/lib/machineRegistryPageService';
import { buildJournalScope } from '@/lib/machineJournalScope';
import {
  buildSparePartsIdentificationContext,
  createSparePartsIdentificationContext,
  isSparePartsIdentificationQuestion,
} from '@/lib/supportSparePartsIdentification';
import { buildSupportHowToContext } from '@/lib/supportHowTo';
import { validatedExternalLinkAction } from '@/lib/supportService';
import { SPARE_PARTS_PORTAL } from '../../supabase/functions/_shared/sparePartsPortal';

const machinePage = {
  total: 1, scopeTotal: 1, normal: 1, historical: 0, healthy: 1,
  needsAttention: 0, critical: 0, approved: 1, needsClarification: 0,
  missingWarrantyAndDealer: 0,
  rows: [{
    serial: '411000-04-1572', normalizedSerial: '411000041572',
    machineModel: 'RC-1000s', machineType: 'RC-1000s', dealerName: 'Hidden', dealerNumber: 'D1',
    deliveryDate: null, operatingHours: null, latestActivityDate: null, latestActivityLabel: null,
    sources: ['warranty'], openTickets: 0, openClaims: 0, openTsb: 0,
    health: 'healthy' as const, warrantyId: null, warrantyIdNumeric: null, warrantyType: 'normal' as const,
  }],
};

describe('Support spare-parts identification routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildJournalScope).mockResolvedValue({
      role: 'timan_backend', dealerLabel: null, dealerNumbers: new Set(), dealerNames: new Set(), unrestricted: true,
    });
    vi.mocked(fetchMachineRegistryPage).mockResolvedValue(machinePage);
  });

  it('asks for model, serial and component for the reported underspecified question', () => {
    const context = createSparePartsIdentificationContext('reservedel skal jeg bruge?', 'da');
    expect(context?.domain).toBe('SPARE_PARTS_IDENTIFICATION');
    expect(context?.clarification_fields).toEqual(['machine_or_model', 'serial_number', 'component']);
    expect(context?.requested_model).toBeNull();
  });

  it('keeps a known model and asks only for serial and component details', () => {
    const context = createSparePartsIdentificationContext('Jeg skal bruge en reservedel til RC-1000s', 'da');
    expect(context?.requested_model).toBe('RC-1000s');
    expect(context?.clarification_fields).toEqual(['serial_number', 'component']);
  });

  it('resolves exact serial context through the existing scoped Machine Registry read', async () => {
    const context = await buildSparePartsIdentificationContext(
      'RC-1000s serienummer 411000-04-1572, jeg skal bruge en del til fremdriften',
      'da',
      { email: 'qa@example.invalid' } as unknown as SessionUser,
      false,
    );
    expect(context?.machine_lookup_status).toBe('MATCHED');
    expect(context?.machine_context).toEqual({
      serial_number: '411000-04-1572', model: 'RC-1000s', source: 'canonical_machine_registry',
    });
    expect(context).not.toHaveProperty('customer_name');
    expect(fetchMachineRegistryPage).toHaveBeenCalledWith(expect.objectContaining({
      query: '411000-04-1572', includeBackendMargins: false,
    }));
  });

  it('never performs a broad registry read while Backend view-as is active', async () => {
    const context = await buildSparePartsIdentificationContext(
      'RC-1000s serienummer 411000-04-1572, reservedel til fremdriften',
      'da',
      { email: 'qa@example.invalid' } as unknown as SessionUser,
      true,
    );
    expect(context?.machine_lookup_status).toBe('SKIPPED_VIEW_AS');
    expect(fetchMachineRegistryPage).not.toHaveBeenCalled();
  });

  it('keeps ordering guidance separate from identification', () => {
    const question = 'hvordan bestiller jeg reservedele?';
    expect(buildSupportHowToContext(question)?.topic).toBe('spare-parts-ordering');
    expect(isSparePartsIdentificationQuestion(question)).toBe(false);
  });

  it.each([
    'hvilken reservedel passer til denne maskine?',
    'hvad er varenummeret på denne del?',
    'jeg skal bruge delen til hydraulikmotoren',
    'kan du hjælpe mig med reservedelsnummer?',
  ])('recognizes identification without treating it as Configurator discovery: %s', (question) => {
    expect(isSparePartsIdentificationQuestion(question)).toBe(true);
  });

  it.each([
    'Hvad er varenummeret på udvidet komponentgaranti til 3330?',
    'Hvad er varenummeret på Skovl Timan 3330?',
    'Kan jeg vælge varenummer 730107 i en ny konfiguration?',
  ])('preserves existing Configurator product and attachment questions: %s', (question) => {
    expect(isSparePartsIdentificationQuestion(question)).toBe(false);
  });

  it('uses the existing canonical Interactive Spares route', () => {
    expect(SPARE_PARTS_PORTAL).toEqual({
      key: 'interactive_spares',
      source: 'canonical_interactive_spares',
      url: 'https://cloud.interactivespares.com/timan/categorie/0000+-+Front+page',
    });
    const contracts = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    expect(contracts).toContain('href={SPARE_PARTS_PORTAL.url}');
    expect(contracts).not.toContain("const SPARE_PARTS_PORTAL_URL =");
  });

  it('accepts only the canonical structured spare-parts link from the server', () => {
    expect(validatedExternalLinkAction({
      type: 'EXTERNAL_LINK',
      key: 'interactive_spares',
      label: 'untrusted server label',
      url: SPARE_PARTS_PORTAL.url,
    }, 'da')).toEqual({
      type: 'EXTERNAL_LINK',
      key: 'interactive_spares',
      label: 'Åbn reservedelsportalen',
      url: SPARE_PARTS_PORTAL.url,
    });
    expect(validatedExternalLinkAction({
      type: 'EXTERNAL_LINK',
      key: 'interactive_spares',
      label: 'Wrong destination',
      url: 'https://example.invalid',
    }, 'da')).toBeUndefined();
  });

  it('enforces the server boundary, authorized retrieval and hallucination guard', () => {
    const assistant = readFileSync('src/lib/assistantSupportService.ts', 'utf8');
    const endpoint = readFileSync('supabase/functions/support-chat/index.ts', 'utf8');
    const runtimeRouting = assistant.slice(assistant.indexOf('const howTo = buildSupportHowToContext(request.content)'));
    expect(runtimeRouting.indexOf('const howTo = buildSupportHowToContext(request.content)'))
      .toBeLessThan(runtimeRouting.indexOf('const sparePartsIdentification = await buildSparePartsIdentificationContext'));
    expect(runtimeRouting.indexOf('const sparePartsIdentification = await buildSparePartsIdentificationContext'))
      .toBeLessThan(runtimeRouting.indexOf('if (!isProductDiscoveryQuestion(request.content))'));
    expect(endpoint).toContain('The normal machine Configurator is never a source of truth for spare-part identification');
    expect(endpoint).toContain("reason: ungroundedPartNumber ? 'UNGROUNDED_PART_NUMBER_BLOCKED'");
    expect(endpoint).toContain('p_include_evaluation_only: false');
    expect(endpoint).toContain("'Technical / Spare-parts identification'");
    expect(endpoint).not.toContain('customer_name: sparePartsIdentification');
  });
});
