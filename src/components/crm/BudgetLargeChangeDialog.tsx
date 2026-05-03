/**
 * BudgetLargeChangeDialog — confirmation popup shown before saving a
 * "large" budget change. Triggered when:
 *   - |Δ| >= 10 units, OR
 *   - |Δ| > 50% of old value (when old value > 0), OR
 *   - old = 0 AND new >= 5
 */
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface LargeChangeContext {
  oldValue: number;
  newValue: number;
  seller: string;
  model: string;
  month: string;
  budget_type: "budget" | "arbejdsbudget";
}

export function isLargeBudgetChange(oldV: number, newV: number): boolean {
  const diff = Math.abs(newV - oldV);
  if (diff >= 10) return true;
  if (oldV === 0 && newV >= 5) return true;
  if (oldV > 0 && diff / oldV > 0.5) return true;
  return false;
}

interface Props {
  open: boolean;
  ctx: LargeChangeContext | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function BudgetLargeChangeDialog({ open, ctx, onConfirm, onCancel }: Props) {
  const diff = ctx ? ctx.newValue - ctx.oldValue : 0;
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stor budgetændring</AlertDialogTitle>
          <AlertDialogDescription>
            Du er ved at lave en stor budgetændring. Er du sikker?
          </AlertDialogDescription>
        </AlertDialogHeader>
        {ctx && (
          <div className="text-sm space-y-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <Row label="Sælger" value={ctx.seller} />
            <Row label="Model" value={ctx.model} />
            <Row label="Måned" value={ctx.month} />
            <Row label="Type" value={ctx.budget_type === "budget" ? "Budget" : "Arbejdsbudget"} />
            <Row label="Gammel værdi" value={String(ctx.oldValue)} />
            <Row label="Ny værdi" value={String(ctx.newValue)} />
            <Row
              label="Ændring"
              value={`${diff >= 0 ? "+" : ""}${diff}`}
              valueClassName={diff >= 0 ? "text-emerald-700" : "text-rose-700"}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Annullér</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Bekræft ændring</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={"font-medium tabular-nums " + (valueClassName || "")}>{value}</span>
    </div>
  );
}
