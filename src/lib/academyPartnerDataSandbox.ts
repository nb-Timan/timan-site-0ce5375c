import { academySandbox } from '@/lib/academySandbox';
import { getLocalAcademyUser } from '@/lib/academyCurriculum';
import { rowToDealer, type DealerAccount, type UpdateDealerAccountPatch } from '@/lib/dealerAccountsService';
import type { DealerContact, UpsertDealerContactInput } from '@/lib/dealerContactsService';
import type { PartnerAgreementHistoryEvent, CreatePartnerAgreementHistoryEventInput } from '@/lib/dealerContractsService';
import type { PortalFormSubmission, PortalFormSubmissionInput } from '@/lib/portalFormsService';

export const ACADEMY_PARTNERDATA_PART_1 = 'partnerdata.part_1_profile';
export const ACADEMY_PARTNERDATA_PART_2 = 'partnerdata.part_2_relations';
export const ACADEMY_PARTNER_ACCOUNT = 'ACADEMY-100';
export const ACADEMY_PARTNER_CHANGED = 'timan:academy-partnerdata-changed';
export const ACADEMY_PARTNER_USER = {
  ...getLocalAcademyUser(), dealer_number: ACADEMY_PARTNER_ACCOUNT, company_dealer: 'Academy Maskiner',
  allowed_modules: [...(getLocalAcademyUser().allowed_modules ?? []), 'sales_tools', 'dealer_data'],
  module_access: [...(getLocalAcademyUser().module_access ?? []), 'sales_tools', 'dealer_data'],
};
// v1 recorded completion in replacement pages, not the canonical forms.
const KEY = 'timan.academy.partnerdata.v2';
const DEALER_ID = 'academy-dealer-100';
const STAMP = '2026-01-01T12:00:00.000Z';
type State = {
  part1Started: boolean; part2Started: boolean; activePart: 1 | 2 | null;
  dealers: DealerAccount[]; contacts: DealerContact[];
  relationReviewed: boolean; submissions: PortalFormSubmission[]; historyEvents?: PartnerAgreementHistoryEvent[];
};
function initial(): State {
  const parent = rowToDealer({
    id: DEALER_ID, account_number: ACADEMY_PARTNER_ACCOUNT, company_name: 'Academy Maskiner',
    customer_type: 'dealer', customer_type_label: 'Forhandler', country: 'DK', city: 'Viborg',
    address_line_1: 'Academyvej 1', postal_code: '8800', latitude: 56.453, longitude: 9.402,
    is_main_account: true, assigned_seller_id: 'academy-local-sales-user',
    assigned_seller_initials: 'ACA', assigned_seller_email: 'academy.sales@localhost',
    created_at: STAMP, updated_at: STAMP,
  });
  const child = rowToDealer({ ...parent, id: 'academy-dealer-101', account_number: 'ACADEMY-101',
    company_name: 'Academy Servicepartner', customer_type: 'service_partner', customer_type_label: 'Servicepartner',
    parent_account_number: ACADEMY_PARTNER_ACCOUNT, is_main_account: false, latitude: 56.36, longitude: 9.32 });
  return { part1Started: false, part2Started: false, activePart: null, dealers: [parent, child], contacts: [], relationReviewed: false, submissions: [] };
}
function read(): State {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? initial(); } catch { return initial(); }
}
function assertActive() {
  if (!academySandbox.isActive()) throw new Error('Academy data adapter requires an active local session.');
}
function write(state: State) {
  assertActive();
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(ACADEMY_PARTNER_CHANGED));
  return state;
}
function requireDealer(state: State, id: string) {
  const dealer = state.dealers.find((row) => row.id === id);
  if (!dealer) throw new Error('Account is outside the Academy sandbox.');
  return dealer;
}
function progress(state = read()) {
  const contact = state.contacts.find((row) => row.dealer_account_id === DEALER_ID && row.is_primary && row.name?.trim());
  const channel = state.dealers.find((row) => row.id === DEALER_ID)?.social_youtube ?? '';
  const part1Completed = state.part1Started && !!contact && /^https?:\/\/(www\.)?youtube\.com\//i.test(channel);
  const invoiceFlowReviewed = state.submissions.some((row) => row.form_type === 'dealer_invoice_accept');
  return { part1Completed, part2Completed: part1Completed && state.part2Started && state.relationReviewed && invoiceFlowReviewed, invoiceFlowReviewed };
}
export const academyPartnerDataSandbox = {
  isActive: () => academySandbox.isActive(), getState: read, getProgress: () => progress(),
  leaveCase() { return write({ ...read(), activePart: null }); },
  start(part: 1 | 2) {
    assertActive();
    const state = read();
    if (part === 2 && !progress(state).part1Completed) throw new Error('Complete Partnerdata Part 1 first.');
    return write({ ...state, activePart: part, part1Started: true, part2Started: part === 2 || state.part2Started });
  },
  listDealers() { assertActive(); return read().dealers; },
  listContacts(id: string) { assertActive(); return read().contacts.filter((row) => row.dealer_account_id === id); },
  async updateDealerAccount(id: string, patch: UpdateDealerAccountPatch) {
    assertActive();
    const state = read(); const dealer = requireDealer(state, id);
    const row = { ...dealer, ...patch, id: dealer.id, account_number: dealer.account_number, updated_at: new Date().toISOString() };
    write({ ...state, dealers: state.dealers.map((old) => old.id === id ? row : old) });
    return { ok: true, row };
  },
  async upsertDealerContact(input: UpsertDealerContactInput) {
    assertActive();
    const state = read(); requireDealer(state, input.dealer_account_id);
    const existing = input.id ? state.contacts.find((row) => row.id === input.id && row.dealer_account_id === input.dealer_account_id) : null;
    if (input.id && !existing) throw new Error('Contact is outside the Academy sandbox.');
    const row: DealerContact = {
      id: existing?.id ?? `academy-contact-${crypto.randomUUID()}`, dealer_account_id: input.dealer_account_id,
      contact_area: input.contact_area, role_title: input.role_title ?? null, name: input.name ?? null,
      phone: input.phone ?? null, email: input.email ?? null, is_primary: input.is_primary ?? false,
      created_at: existing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const contacts = state.contacts.filter((old) => old.id !== row.id).map((old) => row.is_primary && old.dealer_account_id === row.dealer_account_id ? { ...old, is_primary: false } : old);
    write({ ...state, contacts: [...contacts, row] });
    return { ok: true, row };
  },
  async deleteDealerContact(id: string) {
    assertActive(); const state = read();
    if (!state.contacts.some((row) => row.id === id)) throw new Error('Contact is outside the Academy sandbox.');
    write({ ...state, contacts: state.contacts.filter((row) => row.id !== id) });
    return { ok: true };
  },
  async createHistoryEvent(input: CreatePartnerAgreementHistoryEventInput) {
    assertActive(); const state = read(); const dealer = requireDealer(state, input.dealerAccountId);
    if (!input.eventTitle.trim()) return { row: null, error: 'Enter an event title.' };
    const now = new Date().toISOString();
    const row: PartnerAgreementHistoryEvent = {
      id: `academy-history-${crypto.randomUUID()}`, dealer_account_id: dealer.id, dealer_account_number: dealer.account_number,
      event_type: input.eventType, event_title: input.eventTitle, event_description: input.eventDescription ?? null,
      contract_id: null, upload_version_id: null, partner_relation_id: null, document_bucket: null, document_path: null,
      metadata: input.metadata ?? {}, created_by_user_id: 'academy-local-sales-user', created_by_name: 'Academy Sales',
      created_by_email: 'academy.sales@localhost', occurred_at: input.occurredAt ?? now, created_at: now,
    };
    write({ ...state, historyEvents: [...(state.historyEvents ?? []), row] });
    return { row, error: null };
  },
  history(accountNumber: string): PartnerAgreementHistoryEvent[] {
    assertActive();
    if (accountNumber !== ACADEMY_PARTNER_ACCOUNT) return [];
    return [...(read().historyEvents ?? []).filter((event) => event.dealer_account_number === accountNumber), { id: 'academy-relation-history', dealer_account_id: DEALER_ID, dealer_account_number: accountNumber,
      event_type: 'service_partner_added', event_title: 'Academy Servicepartner',
      event_description: 'Servicepartneren er tilknyttet Academy Maskiner. Reservedelsfakturering dokumenteres med Forhandler Accept - Fakturering.',
      contract_id: null, upload_version_id: null, partner_relation_id: 'academy-relation', document_bucket: null, document_path: null,
      metadata: {}, created_by_user_id: null, created_by_name: 'Academy', created_by_email: null, occurred_at: STAMP, created_at: STAMP }];
  },
  reviewPartnerRelation(accountNumber: string) {
    const state = read();
    if (state.part2Started && accountNumber === ACADEMY_PARTNER_ACCOUNT) write({ ...state, relationReviewed: true });
  },
  async submitInvoice(input: PortalFormSubmissionInput): Promise<PortalFormSubmission> {
    assertActive(); const state = read();
    if (!state.part2Started || !progress(state).part1Completed || input.form_type !== 'dealer_invoice_accept' || input.dealer_account_number !== ACADEMY_PARTNER_ACCOUNT) throw new Error('Form is outside the active Academy case.');
    const p = input.payload;
    if (!['accept', 'reject', 'decline'].includes(String(p.decision)) || !p.your_company_name || !p.your_name || !p.third_party_company_name || !p.third_party_cvr) throw new Error('Complete the invoice acceptance fields.');
    const row: PortalFormSubmission = {
      ...input, id: state.submissions[0]?.id ?? `academy-form-${crypto.randomUUID()}`, created_at: new Date().toISOString(),
      dealer_name: input.dealer_name ?? null, submitted_by_user_id: 'academy-local-sales-user', submitted_by_email: 'academy.sales@localhost',
      review_status: 'pending', reviewed_at: null, reviewed_by_user_id: null, review_note: null, approved_dealer_account_id: null,
    };
    write({ ...state, submissions: [row] }); return row;
  },
};
