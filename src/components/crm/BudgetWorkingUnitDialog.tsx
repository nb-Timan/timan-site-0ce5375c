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
import type { WorkingBudgetUnit } from "@/lib/workingBudgetMoveService";
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
  onRemove: (unit: WorkingBudgetUnit) => void;
  onMove: (unit: WorkingBudgetUnit, destinationMonthIdx: number) => void;
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
  const [selectedUnit, setSelectedUnit] = useState<WorkingBudgetUnitChoice | null>(null);
  const [selectedDestinationIdx, setSelectedDestinationIdx] = useState<number | null>(null);
  const [showAllMonths, setShowAllMonths] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    setMode("choose");
    setSelectedUnit(null);
    setSelectedDestinationIdx(null);
    setShowAllMonths(false);
  }, [open, context?.budgetLineId, context?.monthIdx, context?.action]);

  const currentMonth = context?.months.find((month) => month.monthIdx === context.monthIdx) ?? null;
  const sortedMonths = useMemo(
    () => context ? sortWorkingBudgetMonths(context.months, context.monthIdx) : [],
    [context],
  );
  const sourceMonths = sortedMonths.filter((month) => month.units.length > 0);
  const visibleSourceMonths = showAllMonths ? sourceMonths : sourceMonths.slice(0, 6);
  const visibleDestinationMonths = showAllMonths ? sortedMonths : sortedMonths.slice(0, 6);
  const originalMonthLabel = (monthIdx: number) => (
    context?.months.find((month) => month.monthIdx === monthIdx)?.monthLabel || `M${monthIdx + 1}`
  );
  const currentChoices = workingBudgetUnitChoices(currentMonth?.units ?? [], originalMonthLabel);

  if (!context || !currentMonth) return null;

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    setSelectedUnit(null);
    setSelectedDestinationIdx(null);
    setShowAllMonths(false);
  };

  const confirm = () => {
    if (mode === "add") {
      onAddNew();
      return;
    }
    if (mode === "remove" && selectedUnit) {
      onRemove(selectedUnit.unit);
      return;
    }
    if (mode === "move" && selectedUnit) {
      const destination = context.action === "increase"
        ? context.monthIdx
        : selectedDestinationIdx;
      if (destination != null) onMove(selectedUnit.unit, destination);
    }
  };

  const canConfirm = mode === "add"
    || (mode === "remove" && selectedUnit != null)
    || (mode === "move" && selectedUnit != null
      && (context.action === "increase" || selectedDestinationIdx != null));

  const sourceMonth = selectedUnit
    ? context.months.find((month) => month.monthIdx === selectedUnit.unit.month_idx) ?? null
    : null;
  const destinationMonth = context.action === "increase"
    ? currentMonth
    : context.months.find((month) => month.monthIdx === selectedDestinationIdx) ?? null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {context.action === "increase" ? "Tilføj" : "Reducer"} {context.modelName} · {context.monthLabel}
          </DialogTitle>
          <DialogDescription>
            Vælg én konkret enhed. Forhandler og historik følger altid den valgte enhed.
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

        {mode === "move" && context.action === "increase" && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Vælg enhed</div>
            <div className="space-y-3">
              {visibleSourceMonths.map((month) => (
                <UnitMonthGroup
                  key={month.monthIdx}
                  month={month}
                  selected={selectedUnit}
                  onSelect={setSelectedUnit}
                  busy={busy}
                  originalMonthLabel={originalMonthLabel}
                />
              ))}
            </div>
            {!showAllMonths && sourceMonths.length > 6 && (
              <Button type="button" variant="ghost" className="px-2" onClick={() => setShowAllMonths(true)}>Vis alle måneder</Button>
            )}
            {sourceMonths.length === 0 && <p className="text-sm text-slate-500">Der er ingen enheder i andre måneder.</p>}
          </div>
        )}

        {mode === "move" && context.action === "decrease" && (
          <div className="space-y-4">
            <UnitChoices choices={currentChoices} selected={selectedUnit} onSelect={setSelectedUnit} busy={busy} />
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">Vælg destinationsmåned</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleDestinationMonths.map((month) => (
                  <button
                    type="button"
                    key={month.monthIdx}
                    className={`rounded-md border px-3 py-2.5 text-left text-sm ${selectedDestinationIdx === month.monthIdx ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    onClick={() => setSelectedDestinationIdx(month.monthIdx)}
                    disabled={busy}
                  >
                    <span className="font-semibold text-slate-900">{month.monthLabel}</span>
                    <span className="block text-xs text-slate-500">{month.allocation.total} stk.</span>
                  </button>
                ))}
              </div>
              {!showAllMonths && sortedMonths.length > 6 && (
                <Button type="button" variant="ghost" className="mt-1 px-2" onClick={() => setShowAllMonths(true)}>Vis alle måneder</Button>
              )}
            </div>
          </div>
        )}

        {mode === "remove" && (
          <UnitChoices choices={currentChoices} selected={selectedUnit} onSelect={setSelectedUnit} busy={busy} />
        )}

        {mode === "move" && selectedUnit && sourceMonth && destinationMonth && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
            <div className="font-semibold text-slate-900">Flyt 1 × {context.modelName}</div>
            <div className="mt-1 break-words text-slate-700">{selectedUnit.label} · {selectedUnit.detail}</div>
            <div className="mt-2 text-xs text-slate-500">Fra {sourceMonth.monthLabel} · Til {destinationMonth.monthLabel}</div>
          </div>
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

function UnitMonthGroup({
  month,
  selected,
  onSelect,
  busy,
  originalMonthLabel,
}: {
  month: WorkingBudgetMonthState;
  selected: WorkingBudgetUnitChoice | null;
  onSelect: (choice: WorkingBudgetUnitChoice) => void;
  busy: boolean;
  originalMonthLabel: (monthIdx: number) => string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-label={`${month.monthLabel} · ${month.units.length} stk.`}>
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
        {month.monthLabel} · {month.units.length} stk.
      </div>
      <div className="space-y-1 p-2">
        {workingBudgetUnitChoices(month.units, originalMonthLabel).map((choice) => (
          <UnitChoiceButton key={choice.key} choice={choice} selected={selected?.key === choice.key} onSelect={onSelect} busy={busy} />
        ))}
      </div>
    </section>
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
        <UnitChoiceButton key={choice.key} choice={choice} selected={selected?.key === choice.key} onSelect={onSelect} busy={busy} />
      ))}
    </div>
  );
}

function UnitChoiceButton({
  choice,
  selected,
  onSelect,
  busy,
}: {
  choice: WorkingBudgetUnitChoice;
  selected: boolean;
  onSelect: (choice: WorkingBudgetUnitChoice) => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-md border px-3 py-2.5 text-left ${selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
      onClick={() => onSelect(choice)}
      disabled={busy}
    >
      <div className="break-words text-sm font-medium text-slate-900">{choice.label}</div>
      <div className="text-xs text-slate-500">{choice.detail}</div>
    </button>
  );
}
