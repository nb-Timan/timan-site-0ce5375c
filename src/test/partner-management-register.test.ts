import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { partnerManagementCounts } from '@/lib/fabricPartnerManagement';
import { comparePartnerMaster, type PortalPartnerParity } from '@/lib/fabricPartnerParity';
import { buildPartnerReviewRows, EDITABLE_REVIEW_FIELDS, type ReviewRow } from '@/lib/fabricPartnerReview';
import { resolvePartnerAccountType } from '@/lib/partnerAccountTypes';
import { isActivePartnerMapAccount, partnerMapCoordinates } from '@/lib/partnerMapAccount';
import type { PartnerShadowRow } from '../../supabase/functions/_shared/fabricPartnerSnapshot';

const source: PartnerShadowRow = {
  company: 'DAT', account_number: '12041', account_raw: '12041', company_name: 'JE Service',
  address1: 'Symbiosen 7', address2: null, postal_code: '4683', city: 'Ronnede', zipcity_raw: '4683 Ronnede',
  zipcity_validation: 'PARSED_DK', country: 'Danmark', iso_country: 'DK', phone: null, email: null,
  c5_invoice_account_number: null, c5_group: null, c5_partner_type_code: '1', c5_salesrep: 'EM', language: 0,
  vat_number: null, currency: 'DKK', payment: null, c5_blocked: 0, c5_approved: 1, source_row_number: 1, source_last_changed: null,
};
const account: PortalPartnerParity = { id: 'portal-id', account_number: '12041', company_name: 'JE Service',
  address_line_1: 'Symbiosen 7', address_line_2: null, postal_code: '4683', city: 'Ronnede', country: 'Danmark',
  phone: null, email: null, billing_account_number: null, customer_type_label: 'Forhandlerkunde', customer_type: null,
  dealer_type: 'dealer', assigned_seller_initials: null };
const review: ReviewRow = { id: 'approval-id', account_number: '12041', version: 1, status: 'APPROVED',
  proposed_partner_type: 'dealer', parent_dealer_id: null, comment: 'Verified fixture', reviewed_by: 'actor',
  reviewer_name: null, created_at: '2026-10-10T12:00:00Z', snapshot_id: 'snapshot', source_fingerprint: 'source',
  portal_fingerprint: 'portal', current_source_fingerprint: 'source', current_portal_fingerprint: 'portal', needs_recheck: false,
  fields: EDITABLE_REVIEW_FIELDS.map(({ field_name }) => ({ field_name, value_source: 'C5', approved_value: source[field_name],
    portal_value: null, c5_value: source[field_name] })) };
const rows = (reviews: ReviewRow[] = [], portals: PortalPartnerParity[] = []) => {
  const parity = comparePartnerMaster(portals, [source]);
  return buildPartnerReviewRows(parity, reviews, [{ account_number: '12041', source_fingerprint: 'source',
    portal_fingerprint: 'portal', source_count: 1, portal_count: portals.length }]);
};
const receipt = { id: 'receipt', account_id: account.id, account_number: account.account_number,
  approval_id: review.id, imported_at: '2026-10-10T12:19:20Z' };

describe('Partner management source transition', () => {
  it('never treats a saved approval or a shadow-only row as an imported partner', () => {
    expect(partnerManagementCounts(rows([review]), [], [], []).approved).toBe(1);
    expect(partnerManagementCounts(rows([review]), [], [], []).transferred).toBe(0);
    expect(partnerManagementCounts(rows(), [], [], []).portalPartners).toBe(0);
  });
  it('uses receipt UUID and account identity, not company names', () => {
    expect(partnerManagementCounts(rows(), [account], [receipt, receipt], []).transferred).toBe(1);
    expect(partnerManagementCounts(rows(), [{ ...account, id: 'different-uuid' }], [receipt], []).transferred).toBe(0);
    expect(partnerManagementCounts(rows(), [], undefined, []).transferred).toBeNull();
  });
  it('keeps recheck visible after import rather than clearing a permanent decision', () => {
    const result = partnerManagementCounts(rows([{ ...review, needs_recheck: true }], [account]), [account], [receipt], []);
    expect(result.transferred).toBe(1);
    expect(result.needsReview).toBe(1);
    expect(result.approved).toBe(0);
  });
  it('does not count ordinary debtors, leads or demo locations as partner-register types', () => {
    const portal = ['Forhandler', 'Forhandlerkunde', 'Servicepartner', 'Importor', 'Slutkunde', 'Demo'].map((type, index) =>
      ({ ...account, id: `id-${index}`, account_number: String(index), customer_type_label: type, dealer_type: null }));
    expect(partnerManagementCounts([], portal, [], []).portalPartners).toBe(4);
  });
  it('opens Fabric first and leaves legacy/source tools collapsed without removing them', () => {
    const page = readFileSync('src/pages/backend/BackendDealerAccountsPage.tsx', 'utf8');
    expect(page).toContain('Partnerstyring</h1>');
    expect(page).toContain('[showFabricComparison, setShowFabricComparison] = useState(true)');
    expect(page.indexOf('<FabricPartnerComparisonPanel')).toBeLessThan(page.indexOf('<SharePointSyncPanel />'));
    expect(page).toContain('Legacy / system · SharePoint er fortsat aktiv stamdatakilde');
    expect(page).not.toContain('<details open');
  });
});

describe('Canonical Portal map identity and coordinates', () => {
  it.each([['Forhandler', 'dealer'], ['Forhandlerkunde', 'dealer_customer'], ['Servicepartner', 'service_partner'], ['Importor', 'importer']])(
    'uses the same materialized %s type in Partnerdata and the map', (label, type) => {
      expect(resolvePartnerAccountType({ ...account, customer_type_label: label })).toBe(type);
    });
  it.each([{ is_blocked: true }, { is_deleted: true }, { is_active: false }, { status: 'inactive' }])(
    'excludes an inactive canonical partner %j', patch => {
      expect(isActivePartnerMapAccount({ is_blocked: false, is_deleted: false, is_active: true, status: 'active', ...patch })).toBe(false);
    });
  it('preserves the legacy active fallback without inventing a coordinate', () => {
    expect(isActivePartnerMapAccount({ is_blocked: false, is_deleted: false })).toBe(true);
    expect(partnerMapCoordinates({ latitude: null, longitude: null })).toBeNull();
    expect(partnerMapCoordinates({ latitude: 55.26, longitude: 12 })).toEqual([55.26, 12]);
  });
  it.each([[NaN, 12], [55, Infinity], [91, 12], [55, 181]])('rejects an invalid position %s/%s', (latitude, longitude) => {
    expect(partnerMapCoordinates({ latitude, longitude })).toBeNull();
  });
  it('keeps source boundaries and existing public/internal authorization', () => {
    const map = readFileSync('src/pages/misc/PartnerMapPage.tsx', 'utf8');
    expect(map).toContain('isPublicMesseMapView ? fetchPublicPartnerMapAccounts() : fetchDealerAccounts({})');
    expect(map).not.toContain('fabric_partner_shadow');
    expect(map).not.toContain('fabric_partner_review');
    expect(map).toContain('if (isDealerCustomer && !canOpenCrm) return false;');
    expect(map).toContain('fetchWarrantyMachinePins()');
    expect(map).toContain('if (!canSeeDemoLocations');
    expect(map).toContain('const canSeeMachineLayer = !isPublicMesseMapView');
  });
});
