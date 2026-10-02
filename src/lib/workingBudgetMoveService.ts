import { supabase } from "@/lib/supabase";

export type WorkingBudgetMoveSelection =
  | {
      kind: "dealer";
      dealer_account_id: string | null;
      dealer_account_number: string | null;
      dealer_name: string;
      quantity: number;
    }
  | {
      kind: "unallocated";
      quantity: number;
    };

export interface WorkingBudgetMoveInput {
  budgetLineId: string;
  sourceMonthIdx: number;
  destinationMonthIdx: number;
  selections: WorkingBudgetMoveSelection[];
  expectedSourceValue: number;
  requestId: string;
}

export interface WorkingBudgetMoveResult {
  status: "applied" | "already_applied";
  request_id: string;
  source_month_idx: number;
  destination_month_idx: number;
  source_value: number;
  destination_value: number;
  quantity: number;
  allocations: WorkingBudgetMoveSelection[];
}

export async function moveWorkingBudgetAllocations(
  input: WorkingBudgetMoveInput,
): Promise<WorkingBudgetMoveResult> {
  const { data, error } = await supabase.rpc("move_crm_working_budget_unit", {
    p_budget_line_id: input.budgetLineId,
    p_source_month_idx: input.sourceMonthIdx,
    p_destination_month_idx: input.destinationMonthIdx,
    p_selections: input.selections,
    p_expected_source_value: input.expectedSourceValue,
    p_request_id: input.requestId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("Working Budget move returned no result");
  }
  return data as WorkingBudgetMoveResult;
}

export interface WorkingBudgetQuantityAdjustmentInput {
  budgetLineId: string;
  monthIdx: number;
  delta: 1 | -1;
  expectedValue: number;
  selection?: WorkingBudgetMoveSelection | null;
  requestId: string;
}

export interface WorkingBudgetQuantityAdjustmentResult {
  status: "applied" | "already_applied";
  request_id: string;
  month_idx: number;
  old_value: number;
  new_value: number;
  delta: 1 | -1;
  allocation: WorkingBudgetMoveSelection | null;
}

export async function adjustWorkingBudgetQuantity(
  input: WorkingBudgetQuantityAdjustmentInput,
): Promise<WorkingBudgetQuantityAdjustmentResult> {
  const { data, error } = await supabase.rpc("adjust_crm_working_budget_quantity", {
    p_budget_line_id: input.budgetLineId,
    p_month_idx: input.monthIdx,
    p_delta: input.delta,
    p_expected_value: input.expectedValue,
    p_selection: input.selection ?? null,
    p_request_id: input.requestId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("Working Budget adjustment returned no result");
  }
  return data as WorkingBudgetQuantityAdjustmentResult;
}
