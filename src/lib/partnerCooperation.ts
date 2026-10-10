import { resolvePartnerAccountType, getPartnerAccountTypeLabel, type PartnerAccountTypeId } from './partnerAccountTypes';
import type { PartnerAccountRelationType } from './partnerRelationsService';

// The existing canonical types. Billing evidence is deliberately not an input.
export const COOPERATION_TYPES = [
  'importer_has_dealer', 'importer_has_service_partner', 'importer_has_dealer_customer',
  'dealer_has_service_partner', 'dealer_has_dealer_customer',
  'service_partner_has_dealer_customer', 'service_partner_has_dealer',
] as const satisfies readonly PartnerAccountRelationType[];
type Account = Parameters<typeof resolvePartnerAccountType>[0] & { id: string };
export type CooperationPartner = Account & { account_number: string; company_name: string | null;
  is_deleted?: boolean; is_blocked?: boolean; is_active?: boolean | null };
export function validCooperationTypes(parent: Account, child: Account): PartnerAccountRelationType[] {
  if (parent.id === child.id) return [];
  const key = `${resolvePartnerAccountType(parent)}_has_${resolvePartnerAccountType(child)}`;
  return COOPERATION_TYPES.filter(type => type === key);
}
export function cooperationTypeLabel(type: PartnerAccountRelationType): string {
  const [source, target] = type.split('_has_');
  return `${getPartnerAccountTypeLabel(source as PartnerAccountTypeId, 'da')} → ${getPartnerAccountTypeLabel(target as PartnerAccountTypeId, 'da')}`;
}
/** Reused from the local Servicepartner review: read-only C5 evidence, never approval criteria. */
export function cooperationBillingLabel(account: string, invoice: string | null | undefined): string {
  if (invoice === undefined) return 'C5-fakturakonto ikke hentet';
  if (!invoice?.trim()) return 'C5 INVOICEACCOUNT: tom · samarbejde kan godkendes uafhængigt';
  return invoice.trim() === account.trim() ? `Egen konto #${account} · C5` : `Konto #${invoice.trim()} · C5`;
}
