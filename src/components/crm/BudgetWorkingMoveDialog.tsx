import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { WorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";
import type { WorkingBudgetMoveSelection } from "@/lib/workingBudgetMoveService";

export interface BudgetWorkingMoveContext {
  budgetLineId: string;
  modelName: string;
  sellerLabel: string;
  sourceMonthIdx: number;
  sourceMonthLabel: string;
  allocation: WorkingBudgetAllocation;
}

interface Props {
  open: boolean;
  context: BudgetWorkingMoveContext | null;
  monthLabels: string[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (destinationMonthIdx: number, selections: WorkingBudgetMoveSelection[]) => void;
}

type QuantityMap = Record<string, number>;

function dealerKey(index: number): string {
  return `dealer:${index}`;
}

export default function BudgetWorkingMoveDialog({
  open,
  context,
  monthLabels,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const [destinationMonthIdx, setDestinationMonthIdx] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<QuantityMap>({});

  useEffect(() => {
    if (!open) return;
    setDestinationMonthIdx(null);
    setQuantities({});
  }, [open, context?.budgetLineId, context?.sourceMonthIdx]);

  const totalSelected = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  );

  if (!context) return null;

  const setQuantity = (key: string, maximum: number, next: number) => {
    const safe = Math.max(0, Math.min(maximum, Math.trunc(next || 0)));
    setQuantities((current) => ({ ...current, [key]: safe }));
  };

  const selections: WorkingBudgetMoveSelection[] = [
    ...context.allocation.allocations.flatMap((allocation, index) => {
      const quantity = quantities[dealerKey(index)] || 0;
      return quantity > 0 ? [{
        kind: "dealer" as const,
        dealer_account_id: allocation.dealer_account_id,
        dealer_account_number: allocation.dealer_account_number,
        dealer_name: allocation.dealer_name,
        quantity,
      }] : [];
    }),
    ...((quantities.unallocated || 0) > 0 ? [{
      kind: "unallocated" as const,
      quantity: quantities.unallocated,
    }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Flyt Working Budget-allokering</DialogTitle>
          <DialogDescription>
            Vælg præcis hvilke enheder der flyttes fra {context.sourceMonthLabel}. Forhandleridentiteten følger med.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <div className="font-semibold text-slate-900">{context.modelName}</div>
          <div className="text-slate-600">{context.sellerLabel} · {context.sourceMonthLabel} · {context.allocation.total} stk.</div>
        </div>

        <div className="space-y-2">
          <Label>1. Hvilken allokering vil du flytte?</Label>
          {context.allocation.allocations.map((allocation, index) => {
            const key = dealerKey(index);
            const quantity = quantities[key] || 0;
            return (
              <AllocationRow
                key={`${allocation.dealer_account_id || allocation.dealer_account_number || allocation.dealer_name}-${index}`}
                checked={quantity > 0}
                label={allocation.dealer_name}
                detail={`${allocation.dealer_account_number ? `#${allocation.dealer_account_number} · ` : ""}${allocation.qty} stk. tilgængelig`}
                quantity={quantity}
                maximum={allocation.qty}
                busy={busy}
                onChecked={(checked) => setQuantity(key, allocation.qty, checked ? 1 : 0)}
                onQuantity={(next) => setQuantity(key, allocation.qty, next)}
              />
            );
          })}
          {context.allocation.unallocated > 0 && (
            <AllocationRow
              checked={(quantities.unallocated || 0) > 0}
              label="Ikke fordelt"
              detail={`${context.allocation.unallocated} stk. uden forhandler`}
              quantity={quantities.unallocated || 0}
              maximum={context.allocation.unallocated}
              busy={busy}
              onChecked={(checked) => setQuantity("unallocated", context.allocation.unallocated, checked ? 1 : 0)}
              onQuantity={(next) => setQuantity("unallocated", context.allocation.unallocated, next)}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="working-budget-destination">2. Vælg destinationsmåned</Label>
          <select
            id="working-budget-destination"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={destinationMonthIdx ?? ""}
            onChange={(event) => setDestinationMonthIdx(
              event.target.value === "" ? null : Number(event.target.value),
            )}
            disabled={busy}
          >
            <option value="">Vælg måned</option>
            {monthLabels.map((month, monthIdx) => monthIdx === context.sourceMonthIdx ? null : (
              <option key={monthIdx} value={monthIdx}>{month}</option>
            ))}
          </select>
        </div>

        {totalSelected > 0 && destinationMonthIdx != null && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <span className="font-semibold">Flyt {totalSelected} stk.</span>
            <span>{context.sourceMonthLabel}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
            <span>{monthLabels[destinationMonthIdx]}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuller</Button>
          <Button
            type="button"
            onClick={() => destinationMonthIdx != null && onConfirm(destinationMonthIdx, selections)}
            disabled={busy || totalSelected <= 0 || destinationMonthIdx == null}
          >
            {busy ? "Flytter…" : "Flyt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocationRow({
  checked,
  label,
  detail,
  quantity,
  maximum,
  busy,
  onChecked,
  onQuantity,
}: {
  checked: boolean;
  label: string;
  detail: string;
  quantity: number;
  maximum: number;
  busy: boolean;
  onChecked: (checked: boolean) => void;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-slate-200 bg-white p-2.5">
      <Checkbox checked={checked} onCheckedChange={(value) => onChecked(value === true)} disabled={busy} />
      <div className="min-w-0">
        <div className="break-words text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{detail}</div>
      </div>
      {checked && (
        <div className="inline-flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => onQuantity(quantity - 1)} disabled={busy || quantity <= 1}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => onQuantity(quantity + 1)} disabled={busy || quantity >= maximum}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
