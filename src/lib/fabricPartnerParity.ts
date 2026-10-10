import { resolvePartnerAccountType, type PartnerAccountTypeId } from './partnerAccountTypes';
import type { PartnerShadowRow } from '../../supabase/functions/_shared/fabricPartnerSnapshot';

export type ParityStatus = 'MATCH' | 'FIELD_DIFFERENCE' | 'PORTAL_ONLY' | 'C5_ONLY' | 'TYPE_CONFLICT' | 'ACCOUNT_CONFLICT' | 'REVIEW_REQUIRED';
export type Ownership = 'AUTO_CANDIDATE' | 'REVIEW_ONLY';
export interface PortalPartnerParity {
  id: string; account_number: string; company_name: string | null; address_line_1: string | null;
  address_line_2: string | null; postal_code: string | null; city: string | null; country: string | null;
  phone: string | null; email: string | null; billing_account_number: string | null;
  customer_type_label: string | null; customer_type: string | null; dealer_type: string | null;
  assigned_seller_initials: string | null;
  parent_account_number?: string | null;
}
export interface FieldComparison {
  field: string; portal: string | null; c5: string | null; proposed: string | null;
  ownership: Ownership; different: boolean;
}
export interface PartnerParity {
  account_number: string; statuses: ParityStatus[]; portal: PortalPartnerParity[];
  c5: PartnerShadowRow[]; fields: FieldComparison[];
  classification: 'MATCH' | 'AUTO_SAFE_CANDIDATE' | 'REVIEW_REQUIRED';
  reason: string;
  invoiceChain: string[];
  proposedDealer: string | null;
  relationParity: 'MATCH' | 'CONFLICT' | 'UNVERIFIED' | 'NOT_APPLICABLE';
}
const proposedTypes: Record<string, PartnerAccountTypeId> = {
  '1': 'dealer', A: 'dealer', '2': 'service_partner', B: 'service_partner',
  '3': 'importer', C: 'importer', '5': 'dealer_customer', E: 'dealer_customer',
};
export const proposeC5PartnerType = (code: string | null) => proposedTypes[code ?? ''] ?? null;
const clean = (value: string | null | undefined) => value?.trim() || null;

export function comparePartnerMaster(portal: PortalPartnerParity[], shadow: PartnerShadowRow[]): PartnerParity[] {
  const portalMap = new Map<string, PortalPartnerParity[]>();
  const sourceMap = new Map<string, PartnerShadowRow[]>();
  for (const row of portal) {
    const key = clean(row.account_number) ?? '';
    portalMap.set(key, [...(portalMap.get(key) ?? []), row]);
  }
  for (const row of shadow) {
    const key = clean(row.account_number) ?? '';
    sourceMap.set(key, [...(sourceMap.get(key) ?? []), row]);
  }
  return [...new Set([...portalMap.keys(), ...sourceMap.keys()])].sort().map(account_number => {
    const p = portalMap.get(account_number) ?? [];
    const s = sourceMap.get(account_number) ?? [];
    const result: PartnerParity = { account_number, portal: p, c5: s, statuses: [], fields: [],
      classification: 'REVIEW_REQUIRED', reason: '', invoiceChain: [], proposedDealer: null, relationParity: 'NOT_APPLICABLE' };
    if (!account_number || p.length > 1 || s.length > 1) { result.statuses.push('ACCOUNT_CONFLICT'); return result; }
    const proposedType = s[0] ? proposeC5PartnerType(s[0].c5_partner_type_code) : null;
    if (s[0] && (!proposedType || s[0].zipcity_validation === 'REVIEW_REQUIRED')) result.statuses.push('REVIEW_REQUIRED');
    if (!p.length) result.statuses.push('C5_ONLY');
    if (!s.length) result.statuses.push('PORTAL_ONLY');
    if (!p.length || !s.length) return result;
    const c5 = s[0], existing = p[0];
    const field = (name: string, before: string | null, after: string | null, ownership: Ownership = 'AUTO_CANDIDATE', valid = true) => {
      result.fields.push({ field: name, portal: clean(before), c5: clean(after),
        proposed: valid ? clean(after) : null, ownership, different: clean(before) !== clean(after) });
    };
    field('company_name', existing.company_name, c5.company_name);
    field('address1', existing.address_line_1, c5.address1);
    field('address2', existing.address_line_2, c5.address2);
    field('postal_code', existing.postal_code, c5.postal_code, 'AUTO_CANDIDATE', c5.zipcity_validation !== 'REVIEW_REQUIRED');
    field('city', existing.city, c5.city, 'AUTO_CANDIDATE', c5.zipcity_validation !== 'REVIEW_REQUIRED');
    field('country', existing.country, c5.country);
    field('phone', existing.phone, c5.phone, 'REVIEW_ONLY');
    field('email', existing.email, c5.email, 'REVIEW_ONLY');
    // Informational accounting parity only. No billing/parent relationship is inferred.
    field('c5_invoice_account_number', existing.billing_account_number, c5.c5_invoice_account_number, 'REVIEW_ONLY', false);
    field('partner_type', resolvePartnerAccountType(existing), proposedType, 'REVIEW_ONLY', !!proposedType);
    field('responsible_seller', existing.assigned_seller_initials, c5.c5_salesrep, 'REVIEW_ONLY');
    if (proposedType && resolvePartnerAccountType(existing) !== proposedType) result.statuses.push('TYPE_CONFLICT');
    if (result.fields.some(f => f.different)) result.statuses.push('FIELD_DIFFERENCE');
    if (!result.statuses.length) result.statuses.push('MATCH');
    return result;
  }).map(row => {
    const isCustomer = row.c5.some(s => proposeC5PartnerType(s.c5_partner_type_code) === 'dealer_customer')
      || row.portal.some(p => resolvePartnerAccountType(p) === 'dealer_customer');
    if (isCustomer) {
      row.relationParity = 'UNVERIFIED';
      let current = row.account_number;
      const seen = new Set<string>();
      while (!seen.has(current)) {
        seen.add(current);
        row.invoiceChain.push(current);
        const sources = sourceMap.get(current) ?? [];
        if (sources.length !== 1) break;
        if (proposeC5PartnerType(sources[0].c5_partner_type_code) === 'dealer') {
          const parents = portalMap.get(current) ?? [];
          if (parents.length === 1 && resolvePartnerAccountType(parents[0]) === 'dealer') row.proposedDealer = current;
          break;
        }
        const next = clean(sources[0].c5_invoice_account_number);
        if (!next) break;
        current = next;
      }
      // Accounting chains are evidence, not authority to create Portal hierarchy.
      const existingParent = row.portal.length === 1 ? row.portal[0].parent_account_number : undefined;
      if (row.proposedDealer && existingParent !== undefined && clean(existingParent)) {
        row.relationParity = clean(existingParent) === row.proposedDealer ? 'MATCH' : 'CONFLICT';
      }
    }
    if (row.portal.length !== 1 || row.c5.length !== 1) row.reason = 'Entydigt match til eksisterende Portal-partner mangler. Ingen automatisk oprettelse.';
    else if (row.statuses.some(status => ['ACCOUNT_CONFLICT','TYPE_CONFLICT','REVIEW_REQUIRED'].includes(status))) row.reason = 'Kontonummer, type eller adresse kræver manuel gennemgang.';
    else if (row.c5[0].c5_blocked !== 0 || row.c5[0].c5_approved !== 1) row.reason = 'Rå C5 blocked/approved-koder kræver manuel gennemgang. Portal-adgang ændres ikke.';
    else if (isCustomer && row.relationParity !== 'MATCH') row.reason = 'Invoice-kæden beviser ikke en Portal-relation. Portal-relation kræver kontrol.';
    else if (row.fields.some(field => field.different && field.ownership === 'REVIEW_ONLY')) row.reason = 'Kontakt, type, fakturering eller Portal-ejet sælger kræver manuel gennemgang.';
    else if (row.fields.some(field => field.different)) {
      row.classification = 'AUTO_SAFE_CANDIDATE';
      row.reason = 'Kun SharePoint-lignende masterfelter afviger på en entydigt eksisterende partner. Ingen writes tilladt.';
    } else {
      row.classification = 'MATCH';
      row.reason = 'Sammenlignede masterfelter matcher. Portal-ejede data bevares.';
    }
    return row;
  });
}

export function partnerParityCounts(rows: PartnerParity[]) {
  const statusCounts = Object.fromEntries((['MATCH', 'FIELD_DIFFERENCE', 'PORTAL_ONLY', 'C5_ONLY', 'TYPE_CONFLICT', 'ACCOUNT_CONFLICT', 'REVIEW_REQUIRED'] as const)
    .map(status => [status, rows.filter(row => row.statuses.includes(status)).length]));
  const fields: Record<string, number> = {};
  for (const row of rows) for (const field of row.fields) if (field.different) fields[field.field] = (fields[field.field] ?? 0) + 1;
  const customers = rows.filter(row => row.c5.some(s => proposeC5PartnerType(s.c5_partner_type_code) === 'dealer_customer'));
  return { ...statusCounts,
    AUTO_SAFE_CANDIDATE: rows.filter(row => row.classification === 'AUTO_SAFE_CANDIDATE').length,
    REVIEW_REQUIRED: rows.filter(row => row.classification === 'REVIEW_REQUIRED').length,
    FORHANDLERKUNDER: customers.length,
    matched_dealer_customers: customers.filter(row => row.portal.length === 1 && resolvePartnerAccountType(row.portal[0]) === 'dealer_customer').length,
    dealer_customer_auto_safe: customers.filter(row => row.classification === 'AUTO_SAFE_CANDIDATE').length,
    dealer_customer_review: customers.filter(row => row.classification === 'REVIEW_REQUIRED').length,
    relation_conflicts: customers.filter(row => row.relationParity === 'CONFLICT').length,
    seller_conflicts: rows.filter(row => row.fields.some(field => field.field === 'responsible_seller' && field.different)).length,
    matched: rows.filter(row => row.portal.length === 1 && row.c5.length === 1).length, fields,
    unknown_type_codes: rows.reduce((n, row) => n + row.c5.filter(s => !proposeC5PartnerType(s.c5_partner_type_code)).length, 0) };
}
