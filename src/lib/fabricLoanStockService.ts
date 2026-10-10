import { supabase } from '@/lib/supabase';
import type { FabricLoanAssignment, FabricLoanStock } from '@/lib/fabricLoanStock';

type LoanCaseOverviewRow = {
  id: string;
  loan_number: string;
  dealer_account_id: string;
  partner_name: string;
  status: string;
};

type LoanCaseItemAssignmentRow = { case_id: string; fabric_asset_id: string | null };
type LoanPartnerCountryRow = { id: string; country: string | null };

const ACTIVE_LOAN_STATUSES = new Set([
  'DRAFT', 'READY_FOR_REVIEW', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'ON_LOAN', 'RETURN_INSPECTION',
]);

async function getActiveFabricLoanAssignments(): Promise<FabricLoanAssignment[]> {
  const { data: caseData, error: caseError } = await supabase.rpc('loan_list_case_overview', {
    p_partner_id: null,
  });
  if (caseError) throw caseError;
  const activeCases = ((caseData ?? []) as LoanCaseOverviewRow[])
    .filter((loanCase) => ACTIVE_LOAN_STATUSES.has(loanCase.status));
  if (!activeCases.length) return [];

  const caseIds = activeCases.map((loanCase) => loanCase.id);
  const partnerIds = [...new Set(activeCases.map((loanCase) => loanCase.dealer_account_id))];
  const [itemResult, partnerResult] = await Promise.all([
    supabase.from('loan_case_items').select('case_id,fabric_asset_id')
      .in('case_id', caseIds).not('fabric_asset_id', 'is', null),
    supabase.from('dealer_accounts').select('id,country').in('id', partnerIds),
  ]);
  if (itemResult.error) throw itemResult.error;

  const caseById = new Map(activeCases.map((loanCase) => [loanCase.id, loanCase]));
  const countryByPartner = new Map(((partnerResult.error ? [] : partnerResult.data ?? []) as LoanPartnerCountryRow[])
    .map((partner) => [partner.id, partner.country]));
  return ((itemResult.data ?? []) as LoanCaseItemAssignmentRow[]).flatMap((item) => {
    const loanCase = caseById.get(item.case_id);
    if (!item.fabric_asset_id || !loanCase) return [];
    return [{
      asset_id: item.fabric_asset_id,
      loan_number: loanCase.loan_number,
      partner_name: loanCase.partner_name,
      partner_country: countryByPartner.get(loanCase.dealer_account_id) ?? null,
      status: loanCase.status,
    }];
  });
}

export async function getFabricLoanStock(): Promise<FabricLoanStock> {
  const [{ data, error }, activeAssignments] = await Promise.all([
    supabase.rpc('loan_stock_snapshot'),
    getActiveFabricLoanAssignments(),
  ]);
  if (error || !data || !Array.isArray(data.assets) || !data.sync) throw new Error('LOAN_STOCK_UNAVAILABLE');
  return { ...(data as FabricLoanStock), active_assignments: activeAssignments };
}

export async function refreshFabricLoanStock(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('fabric-loan-sync', { body: {} });
  if (error || !['QUEUED', 'RUNNING'].includes(data?.status)) throw new Error('LOAN_STOCK_REFRESH_FAILED');
}

export async function verifyFabricLoanAccess(): Promise<void> {
  const stock = await getFabricLoanStock();
  if (!stock.sync.configured || !stock.sync.last_success_at || stock.sync.stale || stock.sync.failed) {
    throw new Error('LOAN_FABRIC_ACCESS_FAILED');
  }
}

export async function addFabricLoanAsset(caseId: string, assetId: string): Promise<string> {
  const { data, error } = await supabase.rpc('loan_add_fabric_asset_item', { p_case_id: caseId, p_asset_id: assetId });
  if (error) throw error;
  return String(data);
}

export async function setFabricLoanAssetBrikNumber(assetId: string, brikNumber: number | null): Promise<void> {
  const { error } = await supabase.rpc('loan_set_asset_brik_number', {
    p_asset_id: assetId,
    p_brik_number: brikNumber,
  });
  if (error) throw error;
}
