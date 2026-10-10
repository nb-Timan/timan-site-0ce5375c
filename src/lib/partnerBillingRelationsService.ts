import { supabase } from './supabase';
import type { BillingAction, BillingPreview } from './partnerBillingRelations';
export async function loadBillingRelations(mainId: string | null = null): Promise<BillingPreview> {
  const { data, error } = await supabase.rpc('partner_billing_preview', { p_main_partner_id: mainId });
  // A deployed UI must remain usable before the separately approved DB migration.
  if (error?.code === 'PGRST202' || error?.code === '42883') return {enabled:false,relations:[],history:[],candidates:[]};
  if (error) throw error;
  return data as unknown as BillingPreview;
}
export async function changeBillingRelation(input: {
  mainId: string; accountNumber: string | null; action: BillingAction; expectedVersion: number;
  reason: string; source: string; confirmed: boolean; requestId: string;
}) {
  const { data, error } = await supabase.rpc('partner_billing_change', {
    p_main_partner_id:input.mainId,p_account_number:input.accountNumber,p_action:input.action,
    p_expected_version:input.expectedVersion,p_reason:input.reason,p_source:input.source,
    p_confirmed:input.confirmed,p_request_id:input.requestId,
  });
  if (error) throw error;
  return data as string;
}
export function billingRelationError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/VERSION_CONFLICT|STATE_CONFLICT|REQUEST_CONFLICT/.test(message)) return 'Relationen er ændret. Genindlæs før du fortsætter.';
  if (/CYCLE/.test(message)) return 'Relationen ville skabe en cyklus.';
  if (/BACKEND_ONLY|AUTH_REQUIRED|SCOPE_REQUIRED/.test(message)) return 'Din aktuelle adgang tillader ikke denne handling.';
  return 'Betalingsrelationen kunne ikke gemmes. Kontrollér konto, godkendelse og kilde.';
}
