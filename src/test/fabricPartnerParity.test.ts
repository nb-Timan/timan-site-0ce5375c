import { describe, expect, it } from 'vitest';
import { comparePartnerMaster, partnerParityCounts, proposeC5PartnerType, type PortalPartnerParity } from '@/lib/fabricPartnerParity';
import { c5Text, normalizePartnerSource, parsePartnerZipCity, validatePartnerPush, PARTNER_SOURCE_FIELDS } from '../../supabase/functions/_shared/fabricPartnerSnapshot';

export const source = (patch: Record<string, unknown> = {}) => ({
  DATASET: ' DAT ', ACCOUNT: ' 10295 ', NAME: 'AB Lauridsen Maskiner ApS', ADDRESS1: 'Testvej 1', ADDRESS2: '\x02',
  ZIPCITY: '4683  Rønnede', COUNTRY: 'Danmark', ISO_LAND: 'DK', PHONE: '1234', EMAIL: 'qa@example.invalid',
  INVOICEACCOUNT: '\x02', GROUP_: 'DK', A_B_KUNDE: 1, SALESREP: 'EM', LANGUAGE_: 0,
  VATNUMBER: '00012', CURRENCY: 'DKK', PAYMENT: '30', BLOCKED: 0, APPROVED: 1,
  ROWNUMBER: 293216581, LASTCHANGED: '2026-10-09T10:00:00', ...patch,
});
export const portal: PortalPartnerParity = {
  id: 'bc6ae72c-b653-4995-a446-dfdd540b01d1', account_number: '10295', company_name: 'AB Lauridsen Maskiner ApS',
  address_line_1: 'Testvej 1', address_line_2: null, postal_code: '4683', city: 'Rønnede', country: 'Danmark',
  phone: '1234', email: 'qa@example.invalid', billing_account_number: null, customer_type_label: 'Forhandler',
  customer_type: 'Forhandler', dealer_type: 'dealer', assigned_seller_initials: 'EM',
};
describe('dedicated C5 partner shadow', () => {
  it('has only the exact approved whitelist', () => expect(PARTNER_SOURCE_FIELDS).toHaveLength(22));
  it('normalizes padding and the empty marker, never account numbers', () => {
    const row = normalizePartnerSource(source({ ACCOUNT: ' 0012041 ', INVOICEACCOUNT: ' 0012040 ' }));
    expect(row.account_number).toBe('0012041'); expect(row.account_raw).toBe(' 0012041 ');
    expect(row.c5_invoice_account_number).toBe('0012040'); expect(row.address2).toBeNull();
    expect(row.source_last_changed).toBe('2026-10-09T10:00:00');
  });
  it.each(['OTHER', null, 123])('rejects a wrong dataset %s', DATASET => expect(() => normalizePartnerSource(source({ DATASET }))).toThrow());
  it('rejects unapproved credential fields', () => expect(() => normalizePartnerSource({ ...source(), PASSWORD: 'not-a-real-secret' })).toThrow());
  it.each([null, '293216581', 1.5])('requires native source row identity %s', ROWNUMBER => expect(() => normalizePartnerSource(source({ ROWNUMBER }))).toThrow());
  it('preserves raw integer language/block/approval semantics', () => expect(normalizePartnerSource(source({ LANGUAGE_: 7, BLOCKED: 3, APPROVED: 2 }))).toMatchObject({ language: 7, c5_blocked: 3, c5_approved: 2 }));
  it('does not erase embedded control markers', () => expect(() => c5Text('A\x02B')).toThrow());
  it('parses only proven Danish ZIPCITY', () => {
    expect(parsePartnerZipCity('4683  Rønnede', 'DK')).toEqual({ postal_code: '4683', city: 'Rønnede', zipcity_validation: 'PARSED_DK' });
    expect(parsePartnerZipCity('12345 Berlin', 'DE').zipcity_validation).toBe('REVIEW_REQUIRED');
    expect(parsePartnerZipCity('12345 City', 'DK').postal_code).toBeNull();
  });
  it.each(['1','A','2','B','3','C','5','E'])('maps approved type %s', code => expect(proposeC5PartnerType(code)).not.toBeNull());
  it.each(['4','6','7','8','9',null])('does not guess type %s', code => expect(proposeC5PartnerType(code)).toBeNull());
  it('matches AB without modifying UUID or input ownership', () => {
    const before = JSON.stringify(portal), row = normalizePartnerSource(source());
    expect(comparePartnerMaster([portal], [row])[0].statuses).toEqual(['MATCH']);
    expect(JSON.stringify(portal)).toBe(before);
  });
  it('keeps JE invoice chain as source-only accounting data', () => {
    const shadow = [normalizePartnerSource(source({ ACCOUNT: '12041', INVOICEACCOUNT: '12040', A_B_KUNDE: 5, ROWNUMBER: 1 })),
      normalizePartnerSource(source({ ACCOUNT: '12040', INVOICEACCOUNT: '10295', A_B_KUNDE: 5, ROWNUMBER: 2 }))];
    const result = comparePartnerMaster([portal], shadow);
    expect(result.find(r => r.account_number === '12041')?.statuses).toEqual(['C5_ONLY']);
    expect(result.find(r => r.account_number === '12040')?.c5[0].c5_invoice_account_number).toBe('10295');
    expect(result.find(r => r.account_number === '10295')?.statuses).toEqual(['PORTAL_ONLY']);
    expect(portal.id).toBe('bc6ae72c-b653-4995-a446-dfdd540b01d1');
  });
  it('flags account duplicates instead of choosing a winner', () => {
    const row = normalizePartnerSource(source());
    expect(comparePartnerMaster([portal], [row, { ...row, source_row_number: 9 }])[0].statuses).toEqual(['ACCOUNT_CONFLICT']);
  });
  it('uses canonical Portal label before legacy dealer type', () => {
    const p = { ...portal, customer_type_label: 'Forhandlerkunde' };
    expect(comparePartnerMaster([p], [normalizePartnerSource(source({ A_B_KUNDE: 5 }))])[0].statuses).toEqual(['MATCH']);
  });
  it('distinguishes review-only seller/type/contact conflicts', () => {
    const result = comparePartnerMaster([portal], [normalizePartnerSource(source({ A_B_KUNDE: 2, SALESREP: 'BP', EMAIL: null }))]);
    expect(result[0].statuses).toContain('TYPE_CONFLICT');
    expect(result[0].fields.find(f => f.field === 'responsible_seller')?.ownership).toBe('REVIEW_ONLY');
    expect(partnerParityCounts(result).fields).toMatchObject({ responsible_seller: 1, partner_type: 1, email: 1 });
  });
  it('reports unsupported ZIPCITY and type for review without a proposed replacement', () => {
    const result = comparePartnerMaster([portal], [normalizePartnerSource(source({ A_B_KUNDE: 9, ISO_LAND: 'DE' }))])[0];
    expect(result.statuses).toContain('REVIEW_REQUIRED');
    expect(result.fields.find(f => f.field === 'postal_code')?.proposed).toBeNull();
  });
  it('rejects empty, mismatched, stale and repeated-source snapshots', () => {
    const now = Date.now(), input = { snapshot_id: '11111111-1111-4111-8111-111111111111', source_as_of: new Date(now).toISOString(), expected_row_count: 1, rows: [source()] };
    expect(validatePartnerPush(input, now).rows).toHaveLength(1);
    expect(() => validatePartnerPush({ ...input, rows: [], expected_row_count: 0 }, now)).toThrow();
    expect(() => validatePartnerPush({ ...input, expected_row_count: 2 }, now)).toThrow();
    expect(() => validatePartnerPush(input, now + 700000)).toThrow();
    expect(() => validatePartnerPush({ ...input, expected_row_count: 2, rows: [source(), source()] }, now)).toThrow('DUPLICATE_SOURCE_ROW');
  });
  it('traces JE through exact invoice accounts but never approves a new Portal relation', () => {
    const shadow = [normalizePartnerSource(source()),
      normalizePartnerSource(source({ ACCOUNT: '12040', INVOICEACCOUNT: '10295', A_B_KUNDE: 5, ROWNUMBER: 2 })),
      normalizePartnerSource(source({ ACCOUNT: '12041', INVOICEACCOUNT: '12040', A_B_KUNDE: 5, ROWNUMBER: 3 }))];
    const before = JSON.stringify({ portal, shadow });
    const rows = comparePartnerMaster([portal], shadow);
    expect(rows.find(row => row.account_number === '12041')).toMatchObject({
      invoiceChain: ['12041','12040','10295'], proposedDealer: '10295', relationParity: 'UNVERIFIED', classification: 'REVIEW_REQUIRED',
    });
    expect(partnerParityCounts(rows)).toMatchObject({ FORHANDLERKUNDER: 2, matched_dealer_customers: 0, dealer_customer_auto_safe: 0, dealer_customer_review: 2 });
    expect(JSON.stringify({ portal, shadow })).toBe(before);
  });
  it.each(['12019','50538'])('checks the existing Portal-owned parent for dealer customer %s', account => {
    const customer = { ...portal, id: account, account_number: account, parent_account_number: '10295', customer_type_label: 'Forhandlerkunde' };
    const shadow = [normalizePartnerSource(source()), normalizePartnerSource(source({ ACCOUNT: account, A_B_KUNDE: 5, INVOICEACCOUNT: '10295', ROWNUMBER: 2 }))];
    expect(comparePartnerMaster([portal, customer], shadow).find(row => row.account_number === account)).toMatchObject({ proposedDealer: '10295', relationParity: 'MATCH' });
    const conflict = { ...customer, parent_account_number: '99999', billing_account_number: '10295' };
    const rows = comparePartnerMaster([portal, conflict], shadow);
    expect(rows.find(row => row.account_number === account)).toMatchObject({ classification: 'REVIEW_REQUIRED', relationParity: 'CONFLICT' });
    expect(partnerParityCounts(rows).relation_conflicts).toBe(1);
    expect(conflict.parent_account_number).toBe('99999');
  });
  it('does not mistake matching billing for verified Portal parent ownership', () => {
    const customer = { ...portal, account_number: '12019', billing_account_number: '10295', customer_type_label: 'Forhandlerkunde' };
    const shadow = [normalizePartnerSource(source()), normalizePartnerSource(source({ ACCOUNT: '12019', A_B_KUNDE: 5, INVOICEACCOUNT: '10295', ROWNUMBER: 2 }))];
    expect(comparePartnerMaster([portal, customer], shadow).find(row => row.account_number === '12019')).toMatchObject({ relationParity: 'UNVERIFIED', classification: 'REVIEW_REQUIRED' });
  });
  it('stops cyclic, missing and duplicate invoice links without guessed dealers', () => {
    const customer = normalizePartnerSource(source({ ACCOUNT: '12041', A_B_KUNDE: 5, INVOICEACCOUNT: '12040', ROWNUMBER: 1 }));
    const hop = normalizePartnerSource(source({ ACCOUNT: '12040', A_B_KUNDE: 5, INVOICEACCOUNT: '12041', ROWNUMBER: 2 }));
    for (const shadow of [[customer, hop], [customer], [customer, hop, { ...hop, source_row_number: 3 }]]) {
      expect(comparePartnerMaster([portal], shadow).find(row => row.account_number === '12041')).toMatchObject({ proposedDealer: null, classification: 'REVIEW_REQUIRED' });
    }
  });
  it('limits safe candidates to existing master-field changes; billing is never proposed', () => {
    const row = comparePartnerMaster([portal], [normalizePartnerSource(source({ NAME: 'Updated C5 name' }))])[0];
    expect(row.classification).toBe('AUTO_SAFE_CANDIDATE');
    expect(partnerParityCounts([row]).AUTO_SAFE_CANDIDATE).toBe(1);
    expect(row.fields.find(field => field.field === 'c5_invoice_account_number')).toMatchObject({ ownership: 'REVIEW_ONLY', proposed: null });
    expect(comparePartnerMaster([portal], [normalizePartnerSource(source({ SALESREP: 'BP' }))])[0].classification).toBe('REVIEW_REQUIRED');
    expect(comparePartnerMaster([portal], [normalizePartnerSource(source({ BLOCKED: 3 }))])[0].classification).toBe('REVIEW_REQUIRED');
  });
});
