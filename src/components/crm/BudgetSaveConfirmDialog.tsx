/**
 * BudgetSaveConfirmDialog — single confirmation popup shown when the seller
 * clicks "Afslut redigering". Lists every changed Arbejdsbudget cell that
 * will be written, with old/new/diff. Cancel keeps the user in edit mode
 * with the unsaved drafts intact; Confirm saves and exits edit mode.
 */
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface BudgetChangedCell {
  line_id: string;
  seller: string;
  model: string;       // item_number ?? product_name
  month: string;       // localized label, e.g. "Apr"
  month_idx: number;
  budget_type: "arbejdsbudget";
  old_value: number;
  new_value: number;
}

interface Props {
  open: boolean;
  changes: BudgetChangedCell[];
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

export default function BudgetSaveConfirmDialog({ open, changes, onCancel, onConfirm, busy }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bekræft budgetændringer</DialogTitle>
          <DialogDescription>
            Du er ved at gemme ændringer i arbejdsbudgettet.
          </DialogDescription>
        </DialogHeader>

        {changes.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            Ingen ændringer at gemme.
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium">Sælger</th>
                  <th className="px-2 py-1.5 font-medium">Model</th>
                  <th className="px-2 py-1.5 font-medium">Måned</th>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 font-medium text-right">Gammel</th>
                  <th className="px-2 py-1.5 font-medium text-right">Ny</th>
                  <th className="px-2 py-1.5 font-medium text-right">Ændring</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, i) => {
                  const diff = c.new_value - c.old_value;
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{c.seller}</td>
                      <td className="px-2 py-1.5">{c.model}</td>
                      <td className="px-2 py-1.5">{c.month}</td>
                      <td className="px-2 py-1.5">Arbejdsbudget</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.old_value}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{c.new_value}</td>
                      <td className={"px-2 py-1.5 text-right tabular-nums font-medium " + (diff >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {diff >= 0 ? "+" : ""}{diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Annullér</Button>
          <Button onClick={onConfirm} disabled={busy || changes.length === 0}>
            {busy ? "Gemmer…" : "Bekræft ændringer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
