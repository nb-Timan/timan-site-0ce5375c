import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildStructuredContactInformation,
  parseStructuredContactInformation,
  readCrmLeadStructuredContact,
  splitCrmLeadCompanyAndCvr,
  structuredCrmLeadContactColumns,
} from '@/lib/crmLeadValidation';
import {
  formatLeadNo,
  formatLeadReferenceDisplay,
  formatLeadRelation,
  resolveLeadReferenceType,
} from '@/lib/crmLeadsService';
import { matchesLeadSearch } from '@/lib/crmLeadSearch';

const read = (path: string) => readFileSync(path, 'utf8');

const completeContact = {
  company: 'Axel Knudsen Maskinforr. / 72422619',
  contactPerson: 'Per Knudsen',
  phone: '21 61 50 76',
  email: 'per@ak-maskiner.dk',
  address: 'Kauslundevej 20 Kauslunde',
  postalCode: '5500',
  city: 'Middelfart',
  zipCity: '5500 Middelfart',
  country: 'Danmark',
};

describe('CRM lead canonical structured contact data', () => {
  it('maps every lead form field to one structured database column', () => {
    expect(structuredCrmLeadContactColumns(completeContact)).toEqual({
      company_name: 'Axel Knudsen Maskinforr.',
      company_cvr: '72422619',
      contact_person_name: 'Per Knudsen',
      phone: '21 61 50 76',
      email: 'per@ak-maskiner.dk',
      address: 'Kauslundevej 20 Kauslunde',
      postal_code: '5500',
      city: 'Middelfart',
      country: 'Danmark',
    });
  });

  it('reads canonical columns before stale legacy text', () => {
    expect(readCrmLeadStructuredContact({
      ...structuredCrmLeadContactColumns(completeContact),
      contact_information: 'Firma/CVR: Old company\nTelefon: old phone',
    })).toEqual({ ...completeContact, zipCity: '' });
  });

  it('uses safely parsed legacy values only for missing structured columns', () => {
    expect(readCrmLeadStructuredContact({
      company_name: 'Canonical company',
      contact_information: buildStructuredContactInformation(completeContact),
      country: 'Danmark',
    })).toMatchObject({
      company: 'Canonical company',
      contactPerson: 'Per Knudsen',
      postalCode: '5500',
      city: 'Middelfart',
    });
  });

  it('does not invent a CVR or split ambiguous postal text', () => {
    expect(splitCrmLeadCompanyAndCvr('Company / North division')).toEqual({
      companyName: 'Company / North division', companyCvr: '',
    });
    expect(parseStructuredContactInformation(
      'Firma/CVR: Company / North division\nPostnr. og by: Unknown location',
      null,
    )).toMatchObject({
      company: 'Company / North division', postalCode: '', city: '',
    });
  });

  it('handles empty values without fabricating contact data', () => {
    expect(structuredCrmLeadContactColumns({
      company: '', contactPerson: '', phone: '', email: '', address: '',
      postalCode: '', city: '', zipCity: '', country: '',
    })).toEqual({
      company_name: null, company_cvr: null, contact_person_name: null,
      phone: null, email: null, address: null, postal_code: null, city: null, country: null,
    });
  });
});

describe('CRM lead L/G canonical relation', () => {
  it('uses the stored relation and only keeps the historic number fallback for local data', () => {
    expect(resolveLeadReferenceType(1100, 'G')).toBe('G');
    expect(resolveLeadReferenceType(5500, 'L')).toBe('L');
    expect(resolveLeadReferenceType(1100)).toBe('L');
    expect(resolveLeadReferenceType(5500)).toBe('G');
    expect(formatLeadRelation(1100, 'L')).toBe('L-');
    expect(formatLeadNo(5500, 'G')).toBe('G-5500');
  });

  it('formats compact references without merging or mutating the canonical fields', () => {
    expect(formatLeadReferenceDisplay(1149, 'L')).toBe('L-1149');
    expect(formatLeadReferenceDisplay(1149, 'L-')).toBe('L-1149');
    expect(formatLeadReferenceDisplay(5040, 'G')).toBe('G-5040');
    expect(formatLeadReferenceDisplay(5040, 'G-')).toBe('G-5040');
    expect(formatLeadReferenceDisplay(1149, null)).toBe('1149');
    expect(formatLeadReferenceDisplay(null, 'G-')).toBe('G-');
    expect(formatLeadReferenceDisplay(null, null)).toBe('');
  });

  it('stores, queries and displays the canonical relation without parsing display text', () => {
    const service = read('src/lib/crmLeadsService.ts');
    const overview = read('src/pages/crm/CrmLeadsPage.tsx');
    const detail = read('src/pages/crm/CrmNewLeadPage.tsx');
    expect(service).toContain('lead_reference_type');
    expect(service).toContain("reference_type: lead.lead_reference_type === 'G' ? 'G' : 'L'");
    expect(overview).not.toContain("tt('col_number', lang)");
    expect(overview).not.toContain("tt('col_relation', lang)");
    expect(overview).not.toContain('data-testid="crm-leads-relation-header"');
    expect(overview).not.toContain('data-testid="crm-leads-relation-cell"');
    expect(overview).toContain('data-testid="crm-leads-compact-reference"');
    expect(overview).toContain('formatLeadReferenceDisplay(r.reference_no, r.reference_type)');
    const typeCell = overview.slice(
      overview.indexOf('data-testid="crm-leads-type-cell"'),
      overview.indexOf('data-testid="crm-leads-title-customer-cell"'),
    );
    const titleCustomerCell = overview.slice(
      overview.indexOf('data-testid="crm-leads-title-customer-cell"'),
      overview.indexOf('<td className="px-4 py-3.5 text-gray-600'),
    );
    expect(typeCell).toContain('data-testid="crm-leads-compact-reference"');
    expect(typeCell).toContain('{compactReference}');
    expect(titleCustomerCell).not.toContain('crm-leads-compact-reference');
    expect(titleCustomerCell).toContain('{r.customer}');
    expect(titleCustomerCell).toContain("tt('incomplete_chip', lang)");
    expect(detail).toContain('data-testid="crm-lead-detail-relation"');
  });

  it('keeps compact and number-only reference searches equivalent', () => {
    const searchableFields = ['L-1149', 'Widhopf GmbH Garten- und Kt.'];
    expect(matchesLeadSearch(searchableFields, '1149')).toBe(true);
    expect(matchesLeadSearch(searchableFields, 'L-1149')).toBe(true);
    expect(matchesLeadSearch(searchableFields, 'widhopf')).toBe(true);
    expect(matchesLeadSearch(searchableFields, 'G-5040')).toBe(false);
  });
});

describe('CRM lead migration and write-path regression', () => {
  const migration = read('supabase/migrations/20260930111157_normalize_crm_lead_contact_and_reference.sql');
  const form = read('src/pages/crm/CrmNewLeadPage.tsx');
  const importer = read('src/lib/legacyLeadsImportService.ts');
  const edgeImporter = read('supabase/functions/import-legacy-leads/index.ts');
  const legacyReferenceCompatibility = read('supabase/migrations/20260930113926_preserve_legacy_g_import_reference.sql');

  it('keeps raw contact text and leaves existing RLS policies untouched', () => {
    expect(migration).toContain('add column if not exists company_name text');
    expect(migration).toContain('structured contact columns are canonical');
    expect(migration).not.toMatch(/drop column\s+contact_information/i);
    expect(migration).not.toMatch(/create\s+policy|drop\s+policy|disable\s+row\s+level\s+security/i);
  });

  it('writes structured fields for dealer and manual form modes and preserves the raw field on edit', () => {
    expect(form).toContain('...structuredContactColumns');
    expect(form).toContain("linked_dealer_contact_id: contactMode === 'dealer'");
    expect(form).toContain('contact_information: isEdit ? legacyContactInformation');
    expect(form).toContain("setContactMode(lead.linked_dealer_contact_id ? 'dealer' : 'manual')");
  });

  it('keeps legacy import compatibility while writing structured exportable columns', () => {
    for (const source of [importer, edgeImporter]) {
      expect(source).toContain('lead_reference_type');
      expect(source).toContain('company_name');
      expect(source).toContain('contact_person_name');
      expect(source).toContain('postal_code');
      expect(source).toContain('contact_information');
    }
    expect(legacyReferenceCompatibility).toContain("new.notes like '%G-nummer: G-%'");
    expect(legacyReferenceCompatibility).toContain("new.lead_reference_type := 'G'");
  });
});
