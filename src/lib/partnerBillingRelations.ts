import type { DealerAccount } from './dealerAccountsService';
import type { PartnerAccountRelation } from './partnerRelationsService';
import { mainPartnerAccountNumbersByChild } from './partnerRelationsService';
import { groupDealersByParent } from './dealerAccountsService';
import { resolvePartnerAccountType } from './partnerAccountTypes';
import type { PortalUiLanguage } from './portalLanguages';

export type BillingAction = 'PROPOSE' | 'ACTIVATE' | 'END' | 'SWITCH';
export interface BillingRelation {
  id: string; main_partner_id: string; main_account_number: string; main_company_name: string;
  billing_account_number: string; billing_account_id: string | null; billing_name: string;
  relation_type: 'billing_branch'; active: boolean; approved_by: string | null; approved_at: string | null;
  approval_source: string | null; approval_reason: string | null; ended_at: string | null;
  address: string | null; postal_code: string | null; city: string | null; country: string | null;
  invoice_email: string | null; currency: string | null; payment: string | null; c5_invoice_account: string | null;
  version: number;
}
export interface BillingCandidate {
  account_number: string; company_name: string | null; c5_type: string | null; invoice_account: string | null;
}
export interface BillingHistory {
  id: string; action: BillingAction; version: number; changed_at: string; changed_by: string;
  reason: string; approval_source: string; previous_billing_account_number: string | null;
  new_billing_account_number: string | null; new_parent_account_id: string;
}
export interface BillingPreview {
  enabled: boolean; relations: BillingRelation[]; history: BillingHistory[]; candidates: BillingCandidate[];
}
export const billingBranchLabel = (lang: PortalUiLanguage = 'da') => ({da:'Betalingsfilial',en:'Billing branch',de:'Abrechnungsfiliale',it:'Filiale di fatturazione',hu:'Számlázási fiók',sv:'Faktureringsfilial',fr:'Filiale de facturation',pl:'Oddział rozliczeniowy',cs:'Fakturační pobočka'}[lang]);
export function activeBillingBranches(rows: readonly BillingRelation[], mainId: string): BillingRelation[] {
  return rows.filter(row => row.main_partner_id === mainId && row.relation_type === 'billing_branch'
    && row.active && !!row.approved_by && !!row.approved_at);
}

/** Presentation only: financial edges never become commercial parent pointers. */
export function groupPartnerHierarchy(accounts: DealerAccount[], relations: PartnerAccountRelation[], billing: readonly BillingRelation[]) {
  const parents = mainPartnerAccountNumbersByChild(accounts, relations);
  const anchors = new Set(relations.filter(r => r.active && r.relation_type === 'importer_has_service_partner').map(r => r.source_account_id));
  for (const relation of billing) if (activeBillingBranches([relation],relation.main_partner_id).length) anchors.add(relation.main_partner_id);
  const presentation = accounts.map(account => anchors.has(account.id) && resolvePartnerAccountType(account) === 'importer'
    ? { ...account, parent_account_number: null } : account);
  const originals = new Map(accounts.map(account=>[account.id,account]));
  return groupDealersByParent(presentation, parents).map(group=>({...group,
    main:originals.get(group.main.id)!,branches:group.branches.map(account=>originals.get(account.id)!),
    canonicalMain:anchors.has(group.main.id)&&resolvePartnerAccountType(group.main)==='importer',
  }));
}
