import { describe, expect, it } from 'vitest';
import { comparePartnerMaster, type PartnerParity, type PortalPartnerParity } from '@/lib/fabricPartnerParity';
import {
  REVIEW_STATUSES, REVIEW_STATUS_LABELS, EDITABLE_REVIEW_FIELDS,
  buildPartnerReviewRows, createReviewDraft, defaultReviewFieldChoices, filterPartnerReviewRows,
  groupPartnerImportQueue, partnerReviewCounts, reviewNeedsRecheck, validatePartnerReview, resolvePartnerReviewValues,
  type ReviewContext, type ReviewDraft, type ReviewFieldChoices, type ReviewParent, type ReviewRow,
} from '@/lib/fabricPartnerReview';
import type { PartnerShadowRow } from '../../supabase/functions/_shared/fabricPartnerSnapshot';

const portal: PortalPartnerParity = {
  id: '11111111-1111-4111-8111-111111111111', account_number: '00120', company_name: 'Portal Machinery',
  address_line_1: 'Portal road 1', address_line_2: null, postal_code: '8000', city: 'Aarhus', country: 'Danmark',
  phone: '1234', email: 'portal@example.invalid', billing_account_number: null, customer_type_label: 'Forhandler',
  customer_type: 'Forhandler', dealer_type: 'dealer', assigned_seller_initials: 'EM',
};
const source = (patch: Partial<PartnerShadowRow> = {}): PartnerShadowRow => ({
  company: 'DAT', account_number: '00120', account_raw: '00120', company_name: 'Portal Machinery',
  address1: 'Portal road 1', address2: null, postal_code: '8000', city: 'Aarhus', zipcity_raw: '8000 Aarhus',
  zipcity_validation: 'PARSED_DK', country: 'Danmark', iso_country: 'DK', phone: '1234', email: 'portal@example.invalid',
  c5_invoice_account_number: null, c5_group: 'DK', c5_partner_type_code: '1', c5_salesrep: 'EM',
  language: 0, vat_number: null, currency: 'DKK', payment: '30', c5_blocked: 0, c5_approved: 1,
  source_row_number: 1, source_last_changed: '2026-10-10T10:00:00', ...patch,
});
const parity = (sources = [source()], portals = [portal]) => comparePartnerMaster(portals, sources);
const context = (row: PartnerParity, patch: Partial<ReviewContext> = {}): ReviewContext => ({
  account_number: row.account_number, source_fingerprint: 'sql-source-1', portal_fingerprint: 'sql-portal-1',
  source_count: row.c5.length, portal_count: row.portal.length, ...patch,
});
const choices: ReviewFieldChoices = {
  company_name: 'PORTAL', address1: 'PORTAL', address2: 'PORTAL', postal_code: 'PORTAL', city: 'PORTAL', country: 'PORTAL',
};
const review = (patch: Partial<ReviewRow> = {}): ReviewRow => ({
  id: '22222222-2222-4222-8222-222222222222', account_number: '00120', version: 1, status: 'APPROVED',
  proposed_partner_type: 'dealer', parent_dealer_id: null, comment: 'Verified with partner record.',
  reviewed_by: '33333333-3333-4333-8333-333333333333', reviewer_name: 'Backend reviewer',
  created_at: '2026-10-10T10:00:00Z', snapshot_id: '44444444-4444-4444-8444-444444444444',
  source_fingerprint: 'sql-source-1', current_source_fingerprint: 'sql-source-1',
  portal_fingerprint: 'sql-portal-1', current_portal_fingerprint: 'sql-portal-1', needs_recheck: false,
  fields: Object.entries(choices).map(([field_name, value_source]) => ({
    field_name: field_name as keyof ReviewFieldChoices, value_source, approved_value: null, portal_value: null, c5_value: null,
  })), ...patch,
});
const rows = (saved: ReviewRow[] = [], compared = parity()) => buildPartnerReviewRows(compared, saved, compared.map(row => context(row)));
const approval = (row = rows()[0], patch: Partial<ReviewDraft> = {}): ReviewDraft => ({
  ...createReviewDraft(row), status: 'APPROVED', comment: 'Verified with partner record.', ...patch,
});
const parent: ReviewParent = {
  id: '55555555-5555-4555-8555-555555555555', account_number: '10295', company_name: 'AB Lauridsen',
};

describe('Fabric Partnerdata review decisions', () => {
  it('uses verified materialization without rewriting original approval fingerprints', () => {
    const saved = review({ portal_fingerprint: 'before-import', materialized_portal_fingerprint: 'after-import',
      current_portal_fingerprint: 'after-import' });
    expect(reviewNeedsRecheck(saved)).toBe(false);
    expect(saved.portal_fingerprint).toBe('before-import');
    expect(reviewNeedsRecheck({ ...saved, current_source_fingerprint: 'changed-source' })).toBe(true);
    expect(reviewNeedsRecheck({ ...saved, current_portal_fingerprint: 'changed-relation' })).toBe(true);
    expect(reviewNeedsRecheck({ ...saved, needs_recheck: true })).toBe(true);
    expect(reviewNeedsRecheck({ ...saved, materialized_portal_fingerprint: null })).toBe(true);
  });
  it('exports the four shared statuses with Danish labels and exactly six writable fields', () => {
    expect(REVIEW_STATUSES).toEqual(['PENDING', 'APPROVED', 'NEEDS_CLARIFICATION', 'IGNORED']);
    expect(REVIEW_STATUS_LABELS.APPROVED).toBe('Godkendt til import');
    expect(EDITABLE_REVIEW_FIELDS.map(field => field.field_name)).toEqual([
      'company_name', 'address1', 'address2', 'postal_code', 'city', 'country',
    ]);
  });

  it('never autoapproves matches, safe candidates, known C5-only accounts or unknown codes', () => {
    const cases = [parity(), parity([source({ company_name: 'Changed name' })]), parity([source()], []),
      parity([source({ c5_partner_type_code: '0' })], [])];
    expect(cases[1][0].classification).toBe('AUTO_SAFE_CANDIDATE');
    for (const compared of cases) {
      const result = rows([], compared);
      expect(result[0].review_status).toBe('PENDING');
      expect(createReviewDraft(result[0]).status).toBe('PENDING');
      expect(groupPartnerImportQueue(result)).toEqual([]);
    }
    expect(createReviewDraft(rows([], cases[3])[0]).proposed_partner_type).toBeNull();
  });

  it('uses the greatest immutable version, not array order or timestamp', () => {
    const history = [review({ version: 2, status: 'IGNORED', created_at: '2026-10-09T10:00:00Z' }), review()];
    const compared = parity();
    const before = JSON.stringify({ history, compared });
    const result = rows(history, compared);
    expect(result[0].review?.version).toBe(2);
    expect(result[0].review_status).toBe('IGNORED');
    expect(JSON.stringify({ history, compared })).toBe(before);
  });

  it.each([
    { current_source_fingerprint: 'sql-source-2' },
    { current_portal_fingerprint: 'sql-portal-2' },
    { current_source_fingerprint: null },
    { current_source_fingerprint: '' },
    { current_portal_fingerprint: null },
    { needs_recheck: true },
  ])('preserves approval status but excludes changed or missing fingerprints from import: %j', patch => {
    const saved = review(patch);
    expect(reviewNeedsRecheck(saved)).toBe(true);
    const result = rows([saved]);
    expect(result[0].needs_recheck).toBe(true);
    expect(result[0].review?.status).toBe('APPROVED');
    expect(result[0].review_status).toBe('APPROVED');
    expect(createReviewDraft(result[0]).status).toBe('APPROVED');
    expect(result[0].active_approval?.id).toBe(saved.id);
    expect(filterPartnerReviewRows(result, 'APPROVED')).toHaveLength(1);
    expect(filterPartnerReviewRows(result, 'NEEDS_RECHECK')).toHaveLength(1);
    expect(partnerReviewCounts(result)).toMatchObject({ APPROVED: 1, NEEDS_CLARIFICATION: 0, NEEDS_RECHECK: 1 });
    expect(groupPartnerImportQueue(result)).toEqual([]);
  });

  it('preserves unchanged decisions across snapshots without comparing snapshot IDs', () => {
    const first = rows([review()])[0];
    const next = rows([review({ snapshot_id: '66666666-6666-4666-8666-666666666666' })])[0];
    expect(first.needs_recheck).toBe(false);
    expect(next.needs_recheck).toBe(false);
    expect(groupPartnerImportQueue([next])).toHaveLength(0);
  });

  it('compares parent-aware saved hashes with parent-aware current hashes only', () => {
    const compared = parity();
    const result = buildPartnerReviewRows(compared, [review({ portal_fingerprint: 'with-parent', current_portal_fingerprint: 'with-parent' })],
      [context(compared[0], { portal_fingerprint: 'without-parent' })]);
    expect(result[0].context?.portal_fingerprint).toBe('without-parent');
    expect(result[0].needs_recheck).toBe(false);
    expect(validatePartnerReview(result[0], approval(result[0])).valid).toBe(true);
  });

  it('keeps vanished accounts visible and requires recheck even when hashes appear unchanged', () => {
    const vanished = buildPartnerReviewRows([], [review()], []);
    expect(vanished[0]).toMatchObject({ account_number: '00120', needs_recheck: true, review_status: 'APPROVED' });
    expect(groupPartnerImportQueue(vanished)).toEqual([]);
    const portalOnly = rows([review()], parity([], [portal]));
    expect(portalOnly[0].needs_recheck).toBe(true);
  });

  it.each(['PENDING', 'IGNORED', 'NEEDS_CLARIFICATION'] as const)('retains %s while exposing stale evidence', status => {
    const result = rows([review({ status, current_source_fingerprint: null })]);
    expect(result[0].review_status).toBe(status);
    expect(result[0].needs_recheck).toBe(true);
    expect(groupPartnerImportQueue(result)).toEqual([]);
  });
});

describe('safe field choices and approval validation', () => {
  it('defaults all existing values to Portal and all new values to C5, without proposed parents', () => {
    expect(defaultReviewFieldChoices(parity()[0])).toEqual(choices);
    const fresh = rows([], parity([source({ c5_partner_type_code: '5', c5_invoice_account_number: '10295' })], []))[0];
    expect(Object.values(defaultReviewFieldChoices(fresh))).toEqual(Array(6).fill('C5'));
    expect(createReviewDraft(fresh).parent_dealer_id).toBeNull();
  });

  it('restores mixed choices in a fresh draft without changing saved values or decisions', () => {
    const saved = review({ fields: review().fields.map(field => field.field_name === 'company_name'
      ? { ...field, value_source: 'C5', approved_value: 'Frozen historical name' } : field) });
    const before = JSON.stringify(saved);
    const draft = createReviewDraft(rows([saved])[0]);
    expect(Object.values(draft.fields)).toEqual(Array(6).fill('APPROVED'));
    draft.fields.city = 'C5';
    expect(JSON.stringify(saved)).toBe(before);
  });

  it.each(['phone', 'email', 'responsible_seller', 'partner_type', 'id', 'account_number', 'billing_account_number', 'reviewed_by'])(
    'rejects writable metadata/contact field %s even for pending reviews', field => {
      const row = rows()[0];
      const draft = createReviewDraft(row);
      draft.fields = { ...draft.fields, [field]: 'C5' };
      expect(validatePartnerReview(row, draft).valid).toBe(false);
    });

  it.each(['CUSTOM', 'keepPortal', null, 'C5; UPDATE'])('rejects unsafe field sources %s', value => {
    const row = rows()[0];
    const draft = { ...approval(row), fields: { ...choices, city: value } } as unknown as ReviewDraft;
    expect(validatePartnerReview(row, draft).valid).toBe(false);
  });

  it('rejects missing fields and client-supplied values', () => {
    const row = rows()[0];
    const missing = { ...approval(row), fields: { company_name: 'C5' } } as unknown as ReviewDraft;
    expect(validatePartnerReview(row, missing).valid).toBe(false);
    const values = { ...approval(row), fields: { ...choices, city: { value_source: 'C5', approved_value: 'Injected' } } } as unknown as ReviewDraft;
    expect(validatePartnerReview(row, values).valid).toBe(false);
  });

  it('requires an approval comment but permits an undocumented pending/ignored decision', () => {
    const row = rows()[0];
    expect(validatePartnerReview(row, approval(row, { comment: '  ' })).valid).toBe(false);
    expect(validatePartnerReview(row, createReviewDraft(row)).valid).toBe(true);
    expect(validatePartnerReview(row, { ...createReviewDraft(row), status: 'IGNORED' }).valid).toBe(true);
  });

  it('validates status and comment limits before saving any decision', () => {
    const row = rows()[0];
    expect(validatePartnerReview(row, { ...createReviewDraft(row), status: 'AUTO_APPROVED' } as unknown as ReviewDraft).valid).toBe(false);
    expect(validatePartnerReview(row, { ...createReviewDraft(row), comment: 'x'.repeat(4001) }).valid).toBe(false);
    expect(validatePartnerReview(row, { ...createReviewDraft(row), comment: null } as unknown as ReviewDraft).valid).toBe(false);
  });

  it('permits a documented manual type for an unknown code and never guesses', () => {
    const row = rows([], parity([source({ c5_partner_type_code: '0' })], []))[0];
    expect(createReviewDraft(row).proposed_partner_type).toBeNull();
    expect(validatePartnerReview(row, approval(row)).valid).toBe(false);
    const draft = approval(row, { proposed_partner_type: 'importer', comment: 'Importer confirmed in contract.' });
    expect(validatePartnerReview(row, draft).valid).toBe(true);
    expect(validatePartnerReview(row, { ...draft, comment: '' }).valid).toBe(false);
    expect(validatePartnerReview(row, { ...draft, proposed_partner_type: 'supplier' } as unknown as ReviewDraft).valid).toBe(false);
    expect(validatePartnerReview(row, { ...draft, proposed_partner_type: 'toString' } as unknown as ReviewDraft).valid).toBe(false);
  });

  it('requires an explicitly selected valid approved parent UUID for dealer customers', () => {
    const row = rows([], parity([source({ c5_partner_type_code: '5' })], []))[0];
    const draft = approval(row);
    expect(validatePartnerReview(row, draft, [parent.id]).valid).toBe(false);
    expect(validatePartnerReview(row, { ...draft, parent_dealer_id: '10295' }, [parent.id]).valid).toBe(false);
    expect(validatePartnerReview(row, { ...draft, parent_dealer_id: parent.id }).valid).toBe(false);
    expect(validatePartnerReview(row, { ...draft, parent_dealer_id: parent.id }, [parent.id]).valid).toBe(true);
    expect(validatePartnerReview(row, { ...draft, parent_dealer_id: '00000000-0000-0000-0000-000000000000' },
      ['00000000-0000-0000-0000-000000000000']).valid).toBe(false);
  });

  it('rejects self-parenting and parents on non-customer decisions', () => {
    const customer = { ...portal, customer_type_label: 'Forhandlerkunde', customer_type: 'Forhandlerkunde', dealer_type: 'dealer_customer' };
    const row = rows([], parity([source({ c5_partner_type_code: '5' })], [customer]))[0];
    expect(validatePartnerReview(row, approval(row, { parent_dealer_id: customer.id }), [customer.id]).valid).toBe(false);
    expect(validatePartnerReview(rows()[0], approval(rows()[0], { parent_dealer_id: parent.id }), [parent.id]).valid).toBe(false);
  });

  it('blocks missing/duplicate sources, duplicate Portal accounts and missing context', () => {
    const conflicting = [parity([], [portal]), parity([source(), source({ source_row_number: 2 })]),
      parity([source()], [portal, { ...portal, id: parent.id }])];
    for (const compared of conflicting) {
      const row = rows([], compared)[0];
      expect(validatePartnerReview(row, approval(row)).valid).toBe(false);
    }
    const noContext = buildPartnerReviewRows(parity(), [], [])[0];
    expect(validatePartnerReview(noContext, approval(noContext)).valid).toBe(false);
    expect(validatePartnerReview(rows()[0], approval(rows()[0], { proposed_partner_type: 'importer', comment: '' })).valid).toBe(false);
  });

  it('blocks importing unparsed C5 postal fields and using Portal values for a new account', () => {
    const row = rows([], parity([source({ zipcity_validation: 'REVIEW_REQUIRED', postal_code: null, city: null })]))[0];
    expect(validatePartnerReview(row, approval(row)).valid).toBe(true);
    expect(validatePartnerReview(row, approval(row, { fields: { ...choices, city: 'C5' } })).valid).toBe(false);
    const newRow = rows([], parity([source()], []))[0];
    expect(validatePartnerReview(newRow, approval(newRow, { fields: choices })).valid).toBe(false);
  });

  it('allows explicit reapproval against current context despite a stale previous decision', () => {
    const row = rows([review({ current_source_fingerprint: 'sql-source-2' })])[0];
    expect(row.needs_recheck).toBe(true);
    expect(validatePartnerReview(row, approval(row)).valid).toBe(true);
    expect(groupPartnerImportQueue([row])).toEqual([]);
  });
});

describe('permanent Portal-owned approval precedence', () => {
  it.each([
    { company_name: 'New C5 name' }, { address1: 'New C5 address' },
    { c5_invoice_account_number: '99999' }, { c5_partner_type_code: '2' },
  ])('preserves approved relation/type/values when C5 changes: %j', patch => {
    const approved = review({ proposed_partner_type: 'dealer_customer', parent_dealer_id: parent.id,
      current_source_fingerprint: 'changed', fields: review().fields.map(field => ({ ...field,
        approved_value: field.field_name === 'company_name' ? 'Approved JE' : null })) });
    const row = rows([approved], parity([source(patch)]))[0];
    const values = resolvePartnerReviewValues(row);
    expect(values).toMatchObject({ approval_active: true, needs_recheck: true,
      partner_type: 'dealer_customer', parent_dealer_id: parent.id });
    expect(values.fields.find(field => field.field_name === 'company_name')?.value).toBe('Approved JE');
    expect(row.c5[0]).toMatchObject(patch);
    expect(groupPartnerImportQueue([row], [parent.id])).toEqual([]);
  });

  it('keeps an approval active during explicit clarification, and revokes only by Backend decision', () => {
    const approved = review();
    const clarification = review({ id: parent.id, version: 2, status: 'NEEDS_CLARIFICATION' });
    const pending = review({ id: portal.id, version: 3, status: 'PENDING' });
    expect(rows([clarification, approved])[0].active_approval?.id).toBe(approved.id);
    expect(rows([pending, clarification, approved])[0].active_approval).toBeNull();
    expect(rows([review({ version: 3, status: 'IGNORED' }), approved])[0].active_approval).toBeNull();
    expect(rows([review({ version: 4 }), pending, approved])[0].active_approval?.version).toBe(4);
  });

  it('preserves approved null/blank values instead of falling back to new C5 values', () => {
    const row = rows([review()], parity([source({ city: 'New city' })]))[0];
    expect(resolvePartnerReviewValues(row).fields.find(field => field.field_name === 'city')).toMatchObject({ value: null, origin: 'APPROVED' });
  });

  it('falls back to existing Portal values before C5 proposals without active approval', () => {
    expect(resolvePartnerReviewValues(rows([], parity([source({ city: 'Different' })]))[0]).fields
      .find(field => field.field_name === 'city')).toMatchObject({ value: 'Aarhus', origin: 'PORTAL' });
    expect(resolvePartnerReviewValues(rows([], parity([source()], []))[0]).fields
      .find(field => field.field_name === 'city')).toMatchObject({ value: 'Aarhus', origin: 'C5' });
  });

  it('permits documented Backend type corrections without changing Portal or guessing C5 types', () => {
    const row = rows([], parity([source({ c5_partner_type_code: '2' })]))[0];
    expect(validatePartnerReview(row, approval(row, { proposed_partner_type: 'importer' })).valid).toBe(true);
    expect(row.portal[0]).toEqual(portal);
    expect(row.c5[0].c5_partner_type_code).toBe('2');
  });

  it('allows explicit Portal corrections but rejects oversized/missing/unknown correction fields', () => {
    const row = rows()[0];
    const draft = approval(row, { fields: { ...choices, city: 'OVERRIDE' }, overrides: { city: 'Corrected city' } });
    expect(validatePartnerReview(row, draft).valid).toBe(true);
    expect(validatePartnerReview(row, { ...draft, overrides: {} }).valid).toBe(false);
    expect(validatePartnerReview(row, { ...draft, overrides: { city: 'x'.repeat(1001) } }).valid).toBe(false);
    expect(validatePartnerReview(row, { ...draft, overrides: { seller: 'NB' } } as unknown as ReviewDraft).valid).toBe(false);
    expect(validatePartnerReview(row, approval(row, { fields: { ...choices, city: 'APPROVED' } })).valid).toBe(false);
  });
});

describe('review filters, search and import queue', () => {
  it('groups only explicitly approved fresh decisions by canonical type and existing/new', () => {
    const compared = comparePartnerMaster([portal], [source(),
      source({ account_number: '200', c5_partner_type_code: '2', source_row_number: 2 }),
      source({ account_number: '300', c5_partner_type_code: '3', source_row_number: 3 }),
      source({ account_number: '500', c5_partner_type_code: '5', source_row_number: 4 }),
      source({ account_number: '900', c5_partner_type_code: '1', source_row_number: 5 })]);
    const saved = compared.filter(row => row.account_number !== '900').map(row => review({
      account_number: row.account_number,
      proposed_partner_type: row.account_number === '200' ? 'service_partner' : row.account_number === '300' ? 'importer'
        : row.account_number === '500' ? 'dealer_customer' : 'dealer',
      parent_dealer_id: row.account_number === '500' ? parent.id : null,
      fields: review().fields.map(field => ({ ...field, value_source: 'C5',
        approved_value: field.field_name === 'city' ? 'C5 city' : null,
        portal_value: row.portal.length && field.field_name === 'city' ? 'Portal city' : null })),
    }));
    const result = rows(saved, compared);
    const groups = groupPartnerImportQueue(result, [parent.id]);
    expect(groups.map(group => [group.partner_type, group.kind, group.rows.map(row => row.account_number)])).toEqual([
      ['dealer', 'EXISTING', ['00120']], ['service_partner', 'NEW', ['200']], ['importer', 'NEW', ['300']], ['dealer_customer', 'NEW', ['500']],
    ]);
    expect(groupPartnerImportQueue(result).flatMap(group => group.rows).map(row => row.account_number)).not.toContain('500');
    expect(partnerReviewCounts(result)).toMatchObject({ ALL: 5, APPROVED: 4, PENDING: 1, C5_ONLY: 4, MATCHED: 1 });
  });

  it('rejects invalid saved approvals rather than falling back to guessed draft values in the queue', () => {
    expect(groupPartnerImportQueue(rows([review({ proposed_partner_type: null })]))).toEqual([]);
    expect(groupPartnerImportQueue(rows([review({ fields: [] })]))).toEqual([]);
    expect(groupPartnerImportQueue(rows([review({ comment: '' })]))).toEqual([]);
  });

  it('searches account, both companies, country, raw/canonical type and current/proposed parent/invoice chain', () => {
    const compared = parity([source({ company_name: 'C5 Machinery', c5_partner_type_code: '5', c5_invoice_account_number: '12040' })],
      [{ ...portal, customer_type_label: 'Forhandlerkunde', parent_account_number: '11841' }]);
    compared[0].invoiceChain = ['00120', '12040', '10295'];
    compared[0].proposedDealer = '10295';
    const result = rows([review({ proposed_partner_type: 'dealer_customer', parent_dealer_id: parent.id })], compared);
    for (const term of ['00120', 'portal machinery', 'c5 machinery', 'danmark', 'dk', '5', 'dealer_customer',
      'FORHANDLERKUNDE', '11841', '10295', '12040', 'ab lauridsen', ' c5   danmark ']) {
      expect(filterPartnerReviewRows(result, '', term, [parent]), term).toHaveLength(1);
    }
    expect(filterPartnerReviewRows(result, '', '120')).toHaveLength(1);
    expect(filterPartnerReviewRows(result, '', 'unknown company')).toEqual([]);
    expect(filterPartnerReviewRows(result, 'DEALER_CUSTOMERS', 'danmark')).toHaveLength(1);
    expect(filterPartnerReviewRows(result, 'IGNORED', 'danmark')).toEqual([]);
  });

  it('counts decision status separately from parity classification and filters both', () => {
    const compared = parity([source({ company_name: 'Different name' })]);
    const result = rows([review({ status: 'IGNORED' })], compared);
    expect(filterPartnerReviewRows(result, 'MATCHED')).toHaveLength(1);
    expect(filterPartnerReviewRows(result, 'FIELD_DIFFERENCE')).toHaveLength(1);
    expect(filterPartnerReviewRows(result, 'C5_ONLY')).toEqual([]);
    expect(partnerReviewCounts(result)).toMatchObject({ IGNORED: 1, MATCHED: 1, FIELD_DIFFERENCE: 1, APPROVED: 0 });
  });

  it('finds current and proposed parent company names before a parent has been selected', () => {
    const compared = parity([source()], [{ ...portal, parent_account_number: parent.account_number }]);
    compared[0].proposedDealer = '77777';
    const proposed = { ...parent, id: '77777777-7777-4777-8777-777777777777', account_number: '77777', company_name: 'Proposed Dealer' };
    const result = rows([], compared);
    expect(createReviewDraft(result[0]).parent_dealer_id).toBeNull();
    expect(filterPartnerReviewRows(result, '', 'AB Lauridsen', [parent, proposed])).toHaveLength(1);
    expect(filterPartnerReviewRows(result, '', 'Proposed Dealer', [parent, proposed])).toHaveLength(1);
  });
});
