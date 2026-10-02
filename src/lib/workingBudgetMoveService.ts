import { supabase } from "@/lib/supabase";

export interface WorkingBudgetUnit {
  id: string;
  budget_line_id: string;
  sequence_no: number;
  month_idx: number;
  dealer_account_id: string | null;
  dealer_account_number: string | null;
  dealer_name: string | null;
  origin_type: "original_budget" | "working_reference" | "manual_add";
  version: number;
}

export interface WorkingBudgetUnitMutationResult {
  status: "applied" | "already_applied";
  request_id: string;
  unit_id: string;
  unit_sequence: number;
  unit_version: number;
  month_idx?: number;
  source_month_idx?: number;
  destination_month_idx?: number;
  old_value?: number;
  new_value?: number;
}

export async function listWorkingBudgetUnits(budgetLineId: string): Promise<WorkingBudgetUnit[]> {
  const { data, error } = await supabase.rpc("list_crm_working_budget_units", {
    p_budget_line_id: budgetLineId,
  });
  if (error) throw error;
  return (data ?? []) as WorkingBudgetUnit[];
}

export async function createWorkingBudgetUnit(input: {
  budgetLineId: string;
  monthIdx: number;
  expectedValue: number;
  requestId: string;
}): Promise<WorkingBudgetUnitMutationResult> {
  const { data, error } = await supabase.rpc("create_crm_working_budget_unit", {
    p_budget_line_id: input.budgetLineId,
    p_month_idx: input.monthIdx,
    p_expected_value: input.expectedValue,
    p_request_id: input.requestId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Working Budget add returned no result");
  return data as WorkingBudgetUnitMutationResult;
}

export async function removeWorkingBudgetUnit(input: {
  unitId: string;
  expectedVersion: number;
  requestId: string;
}): Promise<WorkingBudgetUnitMutationResult> {
  const { data, error } = await supabase.rpc("remove_crm_working_budget_unit", {
    p_unit_id: input.unitId,
    p_expected_version: input.expectedVersion,
    p_request_id: input.requestId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Working Budget removal returned no result");
  return data as WorkingBudgetUnitMutationResult;
}

export async function moveWorkingBudgetUnit(input: {
  unitId: string;
  targetMonthIdx: number;
  expectedVersion: number;
  requestId: string;
}): Promise<WorkingBudgetUnitMutationResult> {
  const { data, error } = await supabase.rpc("move_crm_working_budget_unit", {
    p_unit_id: input.unitId,
    p_target_month_idx: input.targetMonthIdx,
    p_expected_version: input.expectedVersion,
    p_request_id: input.requestId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Working Budget move returned no result");
  return data as WorkingBudgetUnitMutationResult;
}
