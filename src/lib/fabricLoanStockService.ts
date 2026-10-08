import { supabase } from '@/lib/supabase';
import type { FabricLoanStock } from '@/lib/fabricLoanStock';

export async function getFabricLoanStock(): Promise<FabricLoanStock> {
  const { data, error } = await supabase.rpc('loan_stock_snapshot');
  if (error || !data || !Array.isArray(data.assets) || !data.sync) throw new Error('LOAN_STOCK_UNAVAILABLE');
  return data as FabricLoanStock;
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
