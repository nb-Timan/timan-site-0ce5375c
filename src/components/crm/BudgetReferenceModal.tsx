/**
 * BudgetReferenceModal — optional reference attachment for a budget cell.
 *
 * All fields are optional. Saving without filling anything is allowed and
 * simply closes the modal without writing a row. References are explanatory
 * only — they never affect budget / pipeline / order calculations.
 */
import { useState } from "react";
import { Link2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createBudgetReference } from "@/lib/budgetReferencesService";
import type { BudgetType } from "@/lib/crmBudgetService";

export interface BudgetReferenceContext {
  cell_key: string;
  budget_year: number;
  seller_initials: string | null;
  seller_email: string | null;
  product_code: string | null;
  model_name: string | null;
  category: string | null;
  month: string | null;
  month_idx: number | null;
  budget_type: BudgetType;
  old_value: number | null;
  new_value: number | null;
  actor_email: string | null;
  actor_name: string | null;
}

interface Props {
  open: boolean;
  ctx: BudgetReferenceContext | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function BudgetReferenceModal({ open, ctx, onClose, onSaved }: Props) {
  const [dealer, setDealer] = useState("");
  const [contact, setContact] = useState("");
  const [leadId, setLeadId] = useState("");
  const [demoId, setDemoId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setDealer(""); setContact(""); setLeadId(""); setDemoId(""); setNote("");
  }

  async function handleSave() {
    if (!ctx) { onClose(); return; }
    const anyField = [dealer, contact, leadId, demoId, note].some(s => s.trim().length > 0);
    if (!anyField) {
      toast.message("Ingen reference angivet", { description: "Lukker uden at gemme." });
      reset(); onClose(); return;
    }
    setBusy(true);
    try {
      await createBudgetReference({
        cell_key: ctx.cell_key,
        budget_year: ctx.budget_year,
        seller_initials: ctx.seller_initials,
        seller_email: ctx.seller_email,
        product_code: ctx.product_code,
        model_name: ctx.model_name,
        category: ctx.category,
        month: ctx.month,
        month_idx: ctx.month_idx,
        budget_type: ctx.budget_type,
        old_value: ctx.old_value,
        new_value: ctx.new_value,
        dealer_name: dealer.trim() || null,
        contact_name: contact.trim() || null,
        lead_id: leadId.trim() || null,
        demo_id: demoId.trim() || null,
        note: note.trim() || null,
        created_by_email: ctx.actor_email,
        created_by_name: ctx.actor_name,
      });
      toast.success("Reference gemt");
      reset(); onSaved?.(); onClose();
    } catch (err) {
      console.error(err);
      toast.error("Kunne ikke gemme reference");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-500" />
            Tilføj reference til budgetændring
          </DialogTitle>
          <DialogDescription>
            Alle felter er valgfri. Tilknyt forhandler, kontakt, lead/demo eller en kort note for sporbarhed.
          </DialogDescription>
        </DialogHeader>

        {ctx && (
          <div className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-0.5">
            <Row label="Sælger" value={ctx.seller_initials || "—"} />
            <Row label="Model" value={ctx.model_name || ctx.product_code || "—"} />
            <Row label="Måned" value={ctx.month || "—"} />
            <Row label="Type" value={ctx.budget_type === "budget" ? "Budget" : "Arbejdsbudget"} />
            {ctx.old_value != null && ctx.new_value != null && (
              <Row label="Ændring" value={`${ctx.old_value} → ${ctx.new_value}`} />
            )}
          </div>
        )}

        <div className="space-y-3">
          <Field label="Dealer / forhandler"  v={dealer}  set={setDealer} placeholder="fx. Maskinhuset ApS" />
          <Field label="Kontaktperson"        v={contact} set={setContact} placeholder="fx. Lars Hansen" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Lead ID"  v={leadId} set={setLeadId} placeholder="L-1042" />
            <Field label="Demo ID"  v={demoId} set={setDemoId} placeholder="D-4007" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Kort begrundelse / kontekst …" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={busy}>Annullér</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? "Gemmer…" : "Gem reference"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, v, set, placeholder }: { label: string; v: string; set: (s: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={v} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
