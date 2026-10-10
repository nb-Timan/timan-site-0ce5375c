import { proposeC5PartnerType, type PartnerParity } from './fabricPartnerParity';
import { getPartnerAccountTypeLabel, resolvePartnerAccountType } from './partnerAccountTypes';

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'NEEDS_CLARIFICATION', 'IGNORED'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];
export const REVIEW_STATUS_LABELS: Readonly<Record<ReviewStatus, string>> = {
  PENDING: 'Afventer gennemgang', APPROVED: 'Godkendt til import',
  NEEDS_CLARIFICATION: 'Kr\u00e6ver afklaring', IGNORED: 'Ignoreret',
};
export const REVIEW_PARTNER_TYPES = ['dealer', 'service_partner', 'importer', 'dealer_customer'] as const;
export type ReviewPartnerType = typeof REVIEW_PARTNER_TYPES[number];

export const EDITABLE_REVIEW_FIELDS = [
  { field_name: 'company_name', portal_field: 'company_name', label: 'Firmanavn' },
  { field_name: 'address1', portal_field: 'address_line_1', label: 'Adresse 1' },
  { field_name: 'address2', portal_field: 'address_line_2', label: 'Adresse 2' },
  { field_name: 'postal_code', portal_field: 'postal_code', label: 'Postnummer' },
  { field_name: 'city', portal_field: 'city', label: 'By' },
  { field_name: 'country', portal_field: 'country', label: 'Land' },
] as const;
export type ReviewFieldName = typeof EDITABLE_REVIEW_FIELDS[number]['field_name'];
export type ReviewValueSource = 'PORTAL' | 'C5' | 'APPROVED' | 'OVERRIDE';
export type ReviewFieldChoices = Record<ReviewFieldName, ReviewValueSource>;

export interface ReviewField {
  readonly field_name: ReviewFieldName;
  readonly value_source: ReviewValueSource;
  readonly approved_value: string | null;
  readonly portal_value: string | null;
  readonly c5_value: string | null;
}

/** Immutable decision version, enriched by the review preview RPC. */
export interface ReviewRow {
  readonly id: string;
  readonly account_number: string;
  readonly version: number;
  readonly status: ReviewStatus;
  readonly proposed_partner_type: ReviewPartnerType | null;
  readonly parent_dealer_id: string | null;
  readonly comment: string;
  readonly reviewed_by: string;
  readonly reviewer_name: string | null;
  readonly created_at: string;
  readonly snapshot_id: string | null;
  readonly source_partner_type_code?: string | null;
  readonly source_invoice_account_number?: string | null;
  readonly source_invoice_chain?: readonly { account_number: string; invoice_account_number: string | null }[];
  readonly source_fingerprint: string | null;
  readonly portal_fingerprint: string | null;
  readonly materialized_portal_fingerprint?: string | null;
  readonly current_source_fingerprint: string | null;
  readonly current_portal_fingerprint: string | null;
  readonly needs_recheck: boolean;
  readonly fields: readonly ReviewField[];
}

/** Parent-free fingerprints used as optimistic concurrency checks on save. */
export interface ReviewContext {
  readonly account_number: string;
  readonly source_fingerprint: string | null;
  readonly portal_fingerprint: string | null;
  readonly source_count: number;
  readonly portal_count: number;
}

/** The server supplies only valid approved Portal dealers as parent options. */
export interface ReviewParent {
  readonly id: string;
  readonly account_number: string;
  readonly company_name: string | null;
}

export interface PartnerReviewRow extends PartnerParity {
  readonly review: ReviewRow | null;
  readonly context: ReviewContext | null;
  readonly review_status: ReviewStatus;
  readonly needs_recheck: boolean;
  readonly active_approval: ReviewRow | null;
}

export interface ReviewDraft {
  status: ReviewStatus;
  proposed_partner_type: ReviewPartnerType | null;
  parent_dealer_id: string | null;
  comment: string;
  fields: ReviewFieldChoices;
  overrides?: Partial<Record<ReviewFieldName, string | null>>;
}

const isReviewPartnerType = (value: unknown): value is ReviewPartnerType =>
  REVIEW_PARTNER_TYPES.some(type => type === value);
const isReviewFieldName = (value: string): value is ReviewFieldName =>
  EDITABLE_REVIEW_FIELDS.some(field => field.field_name === value);
const isValueSource = (value: unknown): value is ReviewValueSource =>
  value === 'PORTAL' || value === 'C5' || value === 'APPROVED' || value === 'OVERRIDE';
const hasFingerprint = (value: string | null) => typeof value === 'string' && value.trim().length > 0;
const isUuid = (value: string | null) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function reviewNeedsRecheck(review: ReviewRow): boolean {
  // The saved/current Portal hashes include parent facts; context hashes do not.
  return review.needs_recheck || !hasFingerprint(review.current_source_fingerprint)
    || review.source_fingerprint !== review.current_source_fingerprint
    || (review.materialized_portal_fingerprint ?? review.portal_fingerprint) !== review.current_portal_fingerprint;
}

export function buildPartnerReviewRows(
  parity: readonly PartnerParity[], reviews: readonly ReviewRow[], contexts: readonly ReviewContext[],
): PartnerReviewRow[] {
  const latest = new Map<string, ReviewRow>();
  for (const review of reviews) {
    if (review.version > (latest.get(review.account_number)?.version ?? 0)) latest.set(review.account_number, review);
  }
  const contextMap = new Map(contexts.map(context => [context.account_number, context]));
  const parityMap = new Map(parity.map(row => [row.account_number, row]));
  // Keep decisions visible even when both source and Portal account disappear.
  for (const account_number of latest.keys()) {
    if (!parityMap.has(account_number)) parityMap.set(account_number, {
      account_number, portal: [], c5: [], fields: [], statuses: ['REVIEW_REQUIRED'],
      classification: 'REVIEW_REQUIRED', reason: 'Kildekontoen mangler. Gennemg\u00e5 beslutningen igen.',
      invoiceChain: [], proposedDealer: null, relationParity: 'NOT_APPLICABLE',
    });
  }
  return [...parityMap.values()].map(row => {
    const review = latest.get(row.account_number) ?? null;
    const context = contextMap.get(row.account_number) ?? null;
    const revokedAt = Math.max(0, ...reviews.filter(item => item.account_number === row.account_number
      && (item.status === 'PENDING' || item.status === 'IGNORED')).map(item => item.version));
    const active_approval = reviews.filter(item => item.account_number === row.account_number
      && item.status === 'APPROVED' && item.version > revokedAt).sort((a, b) => b.version - a.version)[0] ?? null;
    const needs_recheck = !!review && (reviewNeedsRecheck(active_approval ?? review) || row.c5.length !== 1
      || (context !== null && context.source_count !== 1));
    return { ...row, review, context, needs_recheck, active_approval,
      review_status: review?.status ?? 'PENDING' };
  });
}

export function defaultReviewFieldChoices(row: PartnerParity): ReviewFieldChoices {
  const value: ReviewValueSource = row.portal.length > 0 ? 'PORTAL' : 'C5';
  return Object.fromEntries(EDITABLE_REVIEW_FIELDS.map(field => [field.field_name, value])) as ReviewFieldChoices;
}

export function createReviewDraft(row: PartnerReviewRow): ReviewDraft {
  const fields = defaultReviewFieldChoices(row);
  const overrides: ReviewDraft['overrides'] = {};
  for (const field of row.review?.fields ?? []) {
    if (isReviewFieldName(field.field_name) && isValueSource(field.value_source)) fields[field.field_name] = field.value_source;
  }
  for (const field of row.active_approval?.fields ?? []) fields[field.field_name] = 'APPROVED';
  for (const field of row.review?.fields ?? []) {
    if (field.value_source === 'OVERRIDE') overrides[field.field_name] = field.approved_value;
  }
  const savedType = row.active_approval?.proposed_partner_type ?? row.review?.proposed_partner_type;
  const proposedType = row.c5.length === 1 ? proposeC5PartnerType(row.c5[0].c5_partner_type_code) : null;
  return {
    status: row.review?.status ?? row.review_status,
    proposed_partner_type: isReviewPartnerType(savedType) ? savedType : isReviewPartnerType(proposedType) ? proposedType : null,
    parent_dealer_id: row.active_approval?.parent_dealer_id ?? row.review?.parent_dealer_id ?? null,
    comment: row.review?.comment ?? '', fields, overrides,
  };
}

export function validatePartnerReview(
  row: PartnerReviewRow, draft: ReviewDraft, approvedParentIds: readonly string[] = [],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!REVIEW_STATUSES.some(status => status === draft.status)) errors.push('V\u00e6lg en gyldig beslutning.');
  if (typeof draft.comment !== 'string' || draft.comment.length > 4000) errors.push('Kommentaren skal v\u00e6re tekst p\u00e5 h\u00f8jst 4000 tegn.');
  const choices: unknown = draft.fields;
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)
    || Object.keys(choices).length !== EDITABLE_REVIEW_FIELDS.length
    || !Object.entries(choices).every(([field, value]) => isReviewFieldName(field) && isValueSource(value))) {
    errors.push('V\u00e6lg en gyldig kilde for de seks tilladte stamdatafelter.');
  }
  if (draft.overrides && Object.keys(draft.overrides).some(field => !isReviewFieldName(field))) {
    errors.push('Kun de seks tilladte stamdatafelter kan korrigeres.');
  }
  for (const field of EDITABLE_REVIEW_FIELDS) {
    const choice = draft.fields?.[field.field_name];
    if (choice === 'APPROVED' && !row.active_approval?.fields.some(saved => saved.field_name === field.field_name)) {
      errors.push('Der findes ingen aktiv godkendt v\u00e6rdi for feltet.');
    }
    const value = draft.overrides?.[field.field_name];
    if (choice === 'OVERRIDE' && (value === undefined || (value !== null && (typeof value !== 'string' || value.length > 1000)))) {
      errors.push('Angiv en Portal-korrektion p\u00e5 h\u00f8jst 1000 tegn.');
    }
  }
  if (draft.proposed_partner_type !== null && !isReviewPartnerType(draft.proposed_partner_type)) {
    errors.push('V\u00e6lg en tilladt Portal-partnertype.');
  }
  if (draft.parent_dealer_id !== null && !isUuid(draft.parent_dealer_id)) errors.push('Forhandleren skal v\u00e6lges med et gyldigt Portal-ID.');
  if (draft.status === 'APPROVED') {
    if (typeof draft.comment !== 'string' || !draft.comment.trim()) errors.push('Skriv en dokumenteret begrundelse for godkendelsen.');
    if (!isReviewPartnerType(draft.proposed_partner_type) && draft.proposed_partner_type === null) {
      errors.push('V\u00e6lg en tilladt Portal-partnertype. Ukendte C5-typer m\u00e5 ikke g\u00e6ttes.');
    }
    if (row.c5.length !== 1 || row.portal.length > 1 || !row.account_number.trim()
      || row.statuses.includes('ACCOUNT_CONFLICT') || row.context?.source_count !== 1
      || row.context.portal_count !== row.portal.length
      || !hasFingerprint(row.context.source_fingerprint) || !hasFingerprint(row.context.portal_fingerprint)) {
      errors.push('Kontoen skal have en entydig aktuel kilde og en opdateret review-kontekst.');
    }
    if (row.c5.length === 1) {
      if (row.c5[0].zipcity_validation === 'REVIEW_REQUIRED'
        && (draft.fields?.postal_code === 'C5' || draft.fields?.city === 'C5')) {
        errors.push('C5-postnummer og by skal afklares f\u00f8r de kan v\u00e6lges til import.');
      }
    }
    if (draft.proposed_partner_type === 'dealer_customer') {
      if (!isUuid(draft.parent_dealer_id) || !approvedParentIds.some(id => id.toLowerCase() === draft.parent_dealer_id?.toLowerCase())
        || row.portal.some(portal => portal.id.toLowerCase() === draft.parent_dealer_id?.toLowerCase())) {
        errors.push('V\u00e6lg eksplicit en gyldig godkendt forhandler som overordnet.');
      }
    }
    if (row.portal.length === 0 && EDITABLE_REVIEW_FIELDS.some(field => draft.fields?.[field.field_name] === 'PORTAL')) {
      errors.push('En ny konto har ingen Portal-v\u00e6rdier. V\u00e6lg C5 for stamdatafelterne.');
    }
  }
  if (draft.proposed_partner_type !== 'dealer_customer' && draft.parent_dealer_id !== null) {
    errors.push('Kun en forhandlerkunde kan have en godkendt overordnet forhandler.');
  }
  return { valid: errors.length === 0, errors };
}

export type PartnerReviewFilter = ReviewStatus | 'MATCHED' | 'C5_ONLY' | 'DEALER_CUSTOMERS'
  | 'TYPE_CONFLICT' | 'FIELD_DIFFERENCE' | 'NEEDS_RECHECK' | '';

function rowMatchesFilter(row: PartnerReviewRow, filter: PartnerReviewFilter): boolean {
  if (!filter) return true;
  if (REVIEW_STATUSES.some(status => status === filter)) return row.review_status === filter;
  switch (filter) {
    case 'MATCHED': return row.portal.length === 1 && row.c5.length === 1;
    case 'C5_ONLY': return row.portal.length === 0 && row.c5.length > 0;
    case 'DEALER_CUSTOMERS': return row.review?.proposed_partner_type === 'dealer_customer'
      || row.c5.some(source => proposeC5PartnerType(source.c5_partner_type_code) === 'dealer_customer')
      || row.portal.some(portal => resolvePartnerAccountType(portal) === 'dealer_customer');
    case 'TYPE_CONFLICT': case 'FIELD_DIFFERENCE': return row.statuses.includes(filter);
    case 'NEEDS_RECHECK': return row.needs_recheck;
    default: return false;
  }
}

export function filterPartnerReviewRows(
  rows: readonly PartnerReviewRow[], filter: PartnerReviewFilter = '', search = '', parents: readonly ReviewParent[] = [],
): PartnerReviewRow[] {
  const terms = search.trim().toLocaleLowerCase('da-DK').split(/\s+/).filter(Boolean);
  const parentMap = new Map(parents.map(parent => [parent.id.toLowerCase(), parent]));
  const parentAccounts = new Map(parents.map(parent => [parent.account_number, parent]));
  return rows.filter(row => {
    if (!rowMatchesFilter(row, filter)) return false;
    const parent = parentMap.get(row.review?.parent_dealer_id?.toLowerCase() ?? '');
    const relatedParents = [parent, parentAccounts.get(row.proposedDealer ?? ''),
      ...row.portal.map(portal => parentAccounts.get(portal.parent_account_number ?? '')),
      ...row.invoiceChain.map(account => parentAccounts.get(account))];
    const types = [row.review?.proposed_partner_type,
      ...row.c5.map(source => proposeC5PartnerType(source.c5_partner_type_code)),
      ...row.portal.map(portal => resolvePartnerAccountType(portal))].filter(isReviewPartnerType);
    const text = [row.account_number, ...row.portal.flatMap(portal => [portal.company_name, portal.country,
      portal.customer_type_label, portal.customer_type, portal.dealer_type, portal.parent_account_number]),
    ...row.c5.flatMap(source => [source.company_name, source.country, source.iso_country, source.c5_partner_type_code,
      source.c5_invoice_account_number]), ...types.flatMap(type => [type, getPartnerAccountTypeLabel(type, 'da')]),
    row.proposedDealer, ...row.invoiceChain, ...relatedParents.flatMap(dealer => [dealer?.id, dealer?.account_number, dealer?.company_name])]
      .filter(value => value !== null && value !== undefined).join(' ').toLocaleLowerCase('da-DK');
    return terms.every(term => text.includes(term));
  });
}

export function partnerReviewCounts(rows: readonly PartnerReviewRow[]) {
  const count = (filter: PartnerReviewFilter) => rows.filter(row => rowMatchesFilter(row, filter)).length;
  return { ALL: rows.length, PENDING: count('PENDING'), APPROVED: count('APPROVED'),
    NEEDS_CLARIFICATION: count('NEEDS_CLARIFICATION'), IGNORED: count('IGNORED'),
    MATCHED: count('MATCHED'), C5_ONLY: count('C5_ONLY'), DEALER_CUSTOMERS: count('DEALER_CUSTOMERS'),
    TYPE_CONFLICT: count('TYPE_CONFLICT'), FIELD_DIFFERENCE: count('FIELD_DIFFERENCE'), NEEDS_RECHECK: count('NEEDS_RECHECK') };
}

export interface PartnerImportQueueGroup {
  partner_type: ReviewPartnerType;
  kind: 'NEW' | 'EXISTING';
  rows: PartnerReviewRow[];
}

/** Read-only proposed values; never applies them to Portal masterdata. */
export function resolvePartnerReviewValues(row: PartnerReviewRow) {
  const approval = row.active_approval;
  const portal = row.portal.length === 1 ? row.portal[0] : null;
  const source = row.c5.length === 1 ? row.c5[0] : null;
  const fields = EDITABLE_REVIEW_FIELDS.map(field => {
    const saved = approval?.fields.find(item => item.field_name === field.field_name);
    const portalValue = portal?.[field.portal_field] ?? null;
    return { field_name: field.field_name, value: saved ? saved.approved_value
      : portal ? portalValue : source?.[field.field_name] ?? null,
    origin: saved ? 'APPROVED' : portal ? 'PORTAL' : 'C5' } as const;
  });
  return { fields, partner_type: approval?.proposed_partner_type ?? (portal
    ? resolvePartnerAccountType(portal) : source ? proposeC5PartnerType(source.c5_partner_type_code) : null),
  parent_dealer_id: approval ? approval.parent_dealer_id : null,
  parent_account_number: approval ? null : portal?.parent_account_number ?? null,
  approval_active: !!approval, needs_recheck: row.needs_recheck };
}

export function groupPartnerImportQueue(
  rows: readonly PartnerReviewRow[], approvedParentIds: readonly string[] = [],
): PartnerImportQueueGroup[] {
  const groups: PartnerImportQueueGroup[] = [];
  for (const partner_type of REVIEW_PARTNER_TYPES) {
    for (const kind of ['NEW', 'EXISTING'] as const) {
      const members = rows.filter(row => {
        const review = row.review;
        if (!review || review.status !== 'APPROVED' || row.needs_recheck || review.proposed_partner_type !== partner_type
          || (row.portal.length === 0 ? 'NEW' : 'EXISTING') !== kind || review.fields.length !== EDITABLE_REVIEW_FIELDS.length) return false;
        if (kind === 'EXISTING' && !review.fields.some(field => field.value_source !== 'PORTAL'
          && field.approved_value !== field.portal_value)) return false;
        // Queue entries must use saved choices; form defaults cannot complete an approval.
        return validatePartnerReview(row, {
          status: review.status, proposed_partner_type: review.proposed_partner_type,
          parent_dealer_id: review.parent_dealer_id, comment: review.comment,
          fields: Object.fromEntries(review.fields.map(field => [field.field_name, field.value_source])) as ReviewFieldChoices,
          overrides: Object.fromEntries(review.fields.filter(field => field.value_source === 'OVERRIDE')
            .map(field => [field.field_name, field.approved_value])),
        }, approvedParentIds).valid;
      });
      if (members.length) groups.push({ partner_type, kind, rows: members });
    }
  }
  return groups;
}
