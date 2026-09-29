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
  const { data, error } = await supabase.rpc("move_crm_working_budget_allocations", {
    p_budget_line_id: input.budgetLineId,
    p_source_month_idx: input.sourceMonthIdx,
    p_destination_month_idx: input.destinationMonthIdx,
    p_selections: input.selections,
    p_request_id: input.requestId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("Working Budget move returned no result");
  }
  return data as WorkingBudgetMoveResult;
}
