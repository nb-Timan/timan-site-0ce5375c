import { useLayoutEffect, useMemo, useState } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkingBudgetMoveSelection } from "@/lib/workingBudgetMoveService";
import {
  sortWorkingBudgetMonths,
  workingBudgetUnitChoices,
  type WorkingBudgetMonthState,
  type WorkingBudgetUnitChoice,
} from "@/lib/workingBudgetUnitActions";

export interface BudgetWorkingUnitContext {
  budgetLineId: string;
  modelName: string;
  sellerLabel: string;
  action: "increase" | "decrease";
  monthIdx: number;
  monthLabel: string;
  months: WorkingBudgetMonthState[];
}

interface Props {
  open: boolean;
  context: BudgetWorkingUnitContext | null;
  busy: boolean;
  onClose: () => void;
  onAddNew: () => void;
  onRemove: (selection: WorkingBudgetMoveSelection) => void;
  onMove: (sourceMonthIdx: number, destinationMonthIdx: number, selection: WorkingBudgetMoveSelection) => void;
}

type Mode = "choose" | "add" | "move" | "remove";

export default function BudgetWorkingUnitDialog({
  open,
  context,
  busy,
  onClose,
  onAddNew,
  onRemove,
  onMove,
}: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<WorkingBudgetUnitChoice | null>(null);
  const [showAllMonths, setShowAllMonths] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    setMode("choose");
    setSelectedMonthIdx(null);
    setSelectedChoice(null);
    setShowAllMonths(false);
  }, [open, context?.budgetLineId, context?.monthIdx, context?.action]);

  const currentMonth = context?.months.find((month) => month.monthIdx === context.monthIdx) ?? null;
  const sortedMonths = useMemo(
    () => context ? sortWorkingBudgetMonths(context.months, context.monthIdx) : [],
    [context],
  );
  const sourceMonths = sortedMonths.filter((month) => month.allocation.total > 0);
  const selectableMonths = context?.action === "increase" ? sourceMonths : sortedMonths;
  const visibleMonths = showAllMonths ? selectableMonths : selectableMonths.slice(0, 6);
  const selectedMonth = context?.months.find((month) => month.monthIdx === selectedMonthIdx) ?? null;
  const choiceAllocation = context?.action === "increase"
    ? selectedMonth?.allocation ?? null
    : currentMonth?.allocation ?? null;
  const choices = choiceAllocation ? workingBudgetUnitChoices(choiceAllocation) : [];

  if (!context || !currentMonth) return null;

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    setSelectedMonthIdx(null);
    setSelectedChoice(null);
    setShowAllMonths(false);
    if (nextMode === "remove" && currentMonth.allocation.unallocated > 0) {
      setSelectedChoice(workingBudgetUnitChoices(currentMonth.allocation).find((choice) => choice.key === "unallocated") ?? null);
    }
  };

  const confirm = () => {
    if (mode === "add") {
      onAddNew();
      return;
    }
    if (mode === "remove" && selectedChoice) {
      onRemove(selectedChoice.selection);
      return;
    }
    if (mode === "move" && selectedChoice && selectedMonthIdx != null) {
      if (context.action === "increase") {
        onMove(selectedMonthIdx, context.monthIdx, selectedChoice.selection);
      } else {
        onMove(context.monthIdx, selectedMonthIdx, selectedChoice.selection);
      }
    }
  };

  const canConfirm = mode === "add"
    || (mode === "remove" && selectedChoice != null)
    || (mode === "move" && selectedChoice != null && selectedMonthIdx != null);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {context.action === "increase" ? "Tilføj" : "Reducer"} {context.modelName} · {context.monthLabel}
          </DialogTitle>
          <DialogDescription>
            Eksisterende forhandlerfordelinger ændres kun, hvis du vælger den konkrete enhed.
          </DialogDescription>
        </DialogHeader>

        <MonthSummary month={currentMonth} sellerLabel={context.sellerLabel} />

        {mode === "choose" && context.action === "increase" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-auto min-h-12 justify-start gap-2 py-3" onClick={() => chooseMode("add")}>
              <Plus className="h-4 w-4" /> Tilføj ny enhed
            </Button>
            <Button type="button" variant="outline" className="h-auto min-h-12 justify-start gap-2 py-3" onClick={() => chooseMode("move")} disabled={sourceMonths.length === 0}>
              <ArrowRight className="h-4 w-4" /> Flyt fra en anden måned
            </Button>
          </div>
        )}

        {mode === "choose" && context.action === "decrease" && (
          <div className="space-y-2">
            {currentMonth.allocation.unallocated > 0 && (
              <Button type="button" variant="outline" className="h-auto min-h-12 w-full justify-start gap-2 py-3" onClick={() => chooseMode("remove")}>
                <Minus className="h-4 w-4" /> Fjern 1 ikke-fordelt enhed
              </Button>
            )}
            <Button type="button" variant="outline" className="h-auto min-h-12 w-full justify-start gap-2 py-3" onClick={() => chooseMode("move")}>
              <ArrowRight className="h-4 w-4" /> Flyt en enhed til en anden måned
            </Button>
            <Button type="button" variant="outline" className="h-auto min-h-12 w-full justify-start gap-2 py-3" onClick={() => chooseMode("remove")}>
              <Minus className="h-4 w-4" /> Fjern fra arbejdsbudget
            </Button>
          </div>
        )}

        {mode === "add" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
            Total bliver {currentMonth.allocation.total + 1} stk. Den nye enhed bliver ikke fordelt.
          </div>
        )}

        {mode === "move" && (
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">
                {context.action === "increase" ? "Vælg kildemåned" : "Vælg destinationsmåned"}
              </div>
              <div className="space-y-2">
                {visibleMonths.map((month) => (
                  <button
                    type="button"
                    key={month.monthIdx}
                    className={`w-full rounded-md border px-3 py-2.5 text-left text-sm ${selectedMonthIdx === month.monthIdx ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    onClick={() => { setSelectedMonthIdx(month.monthIdx); setSelectedChoice(null); }}
                    disabled={busy}
                  >
                    <div className="font-semibold text-slate-900">{month.monthLabel} · {month.allocation.total} stk.</div>
                    <div className="text-xs text-slate-500">Fordelt {month.allocation.allocated} · Ikke fordelt {month.allocation.unallocated}</div>
                    {context.action === "increase" && month.allocation.allocations.map((row) => (
                      <div key={row.dealer_account_id || row.dealer_account_number || row.dealer_name} className="mt-1 break-words text-xs text-slate-600">
                        {row.dealer_name}{row.dealer_account_number ? ` · #${row.dealer_account_number}` : ""} · {row.qty} stk.
                      </div>
                    ))}
                  </button>
                ))}
              </div>
              {!showAllMonths && selectableMonths.length > 6 && (
                <Button type="button" variant="ghost" className="mt-1 px-2" onClick={() => setShowAllMonths(true)}>Vis alle måneder</Button>
              )}
              {selectableMonths.length === 0 && <p className="text-sm text-slate-500">Der er ingen enheder i andre måneder.</p>}
            </div>

            {(context.action === "decrease" || selectedMonth) && (
              <UnitChoices choices={choices} selected={selectedChoice} onSelect={setSelectedChoice} busy={busy} />
            )}
          </div>
        )}

        {mode === "remove" && (
          <UnitChoices choices={choices} selected={selectedChoice} onSelect={setSelectedChoice} busy={busy} />
        )}

        {mode !== "choose" && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => chooseMode("choose")} disabled={busy}>Tilbage</Button>
            <Button type="button" onClick={confirm} disabled={busy || !canConfirm}>
              {busy ? "Gemmer…" : mode === "move" ? "Flyt 1 enhed" : mode === "remove" ? "Fjern 1 enhed" : "Tilføj 1 ny enhed"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MonthSummary({ month, sellerLabel }: { month: WorkingBudgetMonthState; sellerLabel: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <div className="font-semibold text-slate-900">{sellerLabel} · {month.monthLabel} · {month.allocation.total} stk.</div>
      <div className="text-slate-600">Fordelt {month.allocation.allocated} · Ikke fordelt {month.allocation.unallocated}</div>
      {month.allocation.allocations.map((row) => (
        <div key={row.dealer_account_id || row.dealer_account_number || row.dealer_name} className="mt-1 break-words text-slate-600">
          {row.dealer_name}{row.dealer_account_number ? ` · #${row.dealer_account_number}` : ""} · {row.qty} stk.
        </div>
      ))}
    </div>
  );
}

function UnitChoices({
  choices,
  selected,
  onSelect,
  busy,
}: {
  choices: WorkingBudgetUnitChoice[];
  selected: WorkingBudgetUnitChoice | null;
  onSelect: (choice: WorkingBudgetUnitChoice) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-900">Vælg den konkrete enhed</div>
      {choices.map((choice) => (
        <button
          type="button"
          key={choice.key}
          className={`w-full rounded-md border px-3 py-2.5 text-left ${selected?.key === choice.key ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          onClick={() => onSelect(choice)}
          disabled={busy}
        >
          <div className="break-words text-sm font-medium text-slate-900">{choice.label}</div>
          <div className="text-xs text-slate-500">{choice.detail}</div>
        </button>
      ))}
    </div>
  );
}
