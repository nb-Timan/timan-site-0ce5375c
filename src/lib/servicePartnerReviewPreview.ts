import type { PartnerReviewRow } from './fabricPartnerReview';
import type { PortalPartnerParity } from './fabricPartnerParity';
import { cooperationBillingLabel } from './partnerCooperation';
import { resolveServicePartnerMainRelationType } from './partnerAdminEdit';
import { resolvePartnerAccountType } from './partnerAccountTypes';

/** Accounting evidence only. Empty INVOICEACCOUNT is not a cooperation conflict. */
export function partnerReviewBillingLabel(row: PartnerReviewRow): string {
  if (row.c5.length !== 1) return 'Uafklaret · entydig C5-kilde mangler';
  return cooperationBillingLabel(row.account_number, row.c5[0].c5_invoice_account_number);
}

/** Uses existing account identities/types, without deriving parents from billing. */
export function servicePartnerReviewCandidates(
  row: PartnerReviewRow, partners: readonly PortalPartnerParity[],
): PortalPartnerParity[] {
  const counts = new Map<string, number>();
  for (const partner of partners) counts.set(partner.account_number, (counts.get(partner.account_number) ?? 0) + 1);
  return partners.filter(partner => counts.get(partner.account_number) === 1
    && partner.account_number !== row.account_number && !row.portal.some(child => child.id === partner.id)
    && resolveServicePartnerMainRelationType(partner) !== null);
}

/** Presentation-only proposal. Deliberately has no mutation/RPC or import payload. */
export function previewServicePartnerCooperation(
  row: PartnerReviewRow, parentId: string, partners: readonly PortalPartnerParity[], comment: string,
) {
  const parent = servicePartnerReviewCandidates(row, partners).find(partner => partner.id === parentId);
  const child = row.portal.length === 1 ? row.portal[0] : null;
  const blockers: string[] = [];
  if (!child || resolvePartnerAccountType(child) !== 'service_partner') {
    blockers.push('Entydig eksisterende Portal-Servicepartner skal verificeres.');
  }
  if (!parent) blockers.push('Vælg eksplicit en eksisterende Forhandler eller Importør.');
  if (!comment.trim() || comment.length > 4000) blockers.push('Angiv en dokumenteret begrundelse på højst 4000 tegn.');
  return {
    source_account_id: parent?.id ?? null,
    target_account_id: child?.id ?? null,
    relation_type: parent ? resolveServicePartnerMainRelationType(parent) : null,
    parent_type: parent ? resolvePartnerAccountType(parent) : null,
    cooperation: parent ? `${parent.company_name ?? parent.account_number} #${parent.account_number}` : 'Ikke valgt',
    billing: partnerReviewBillingLabel(row),
    seller: child?.assigned_seller_initials ?? null,
    blockers,
    readyForApproval: blockers.length === 0,
    explicitProductionApprovalRequired: true as const,
    canApply: false as const,
  };
}
