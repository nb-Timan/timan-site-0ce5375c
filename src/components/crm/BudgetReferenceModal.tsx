/**
 * BudgetReferenceModal — optional reference attachment for a budget cell.
 *
 * All fields are optional. Saving without filling anything is allowed and
 * simply closes the modal without writing a row. References are explanatory
 * only — they never affect budget / pipeline / order calculations.
 *
 * Dealer field is a searchable combobox sourced from dealer_accounts.
 *  - Backend: sees ALL dealers
 *  - Seller : sees only dealers assigned to the active seller
 * Existing free-text references (from before this change) still render as-is
 * via the audit/reference list. Only new references use the combobox.
 */
import { useEffect, useMemo, useState } from "react";
import { Link2, ChevronsUpDown, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createBudgetReference } from "@/lib/budgetReferencesService";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";
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
  /** Backend admins see all dealers; sellers only see dealers assigned to them. */
  isAdmin?: boolean;
  /** Active seller initials (used for filtering when !isAdmin). */
  currentSellerInitials?: string | null;
  /** Active seller email (used for filtering when !isAdmin). */
  currentSellerEmail?: string | null;
}

interface DealerOption {
  value: string; // dealer.id
  label: string;
  searchKey: string;
  account_number: string | null;
  company_name: string;
  assigned_seller_initials: string | null;
}

function dealerToOption(d: DealerAccount): DealerOption {
  const ini = d.assigned_seller_initials || "—";
  return {
    value: d.id,
    label: `${d.company_name}${d.account_number ? ` · ${d.account_number}` : ""}${ini !== "—" ? ` · ${ini}` : ""}`,
    searchKey: [d.company_name, d.account_number, d.country, d.assigned_seller_initials, d.assigned_seller_name]
      .filter(Boolean).join(" ").toLowerCase(),
    account_number: d.account_number || null,
    company_name: d.company_name,
    assigned_seller_initials: d.assigned_seller_initials,
  };
}

export default function BudgetReferenceModal({
  open, ctx, onClose, onSaved,
  isAdmin = true, currentSellerInitials = null, currentSellerEmail = null,
}: Props) {
  const [dealerId, setDealerId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [leadId, setLeadId] = useState("");
  const [demoId, setDemoId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);

  // Load dealers when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDealersLoading(true);
    fetchDealerAccounts({ includeDeleted: false })
      .then((res) => { if (!cancelled) setDealers(res.rows); })
      .catch(() => { /* keep empty list — Input still works as no-op */ })
      .finally(() => { if (!cancelled) setDealersLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const options = useMemo<DealerOption[]>(() => {
    const ini = (currentSellerInitials || "").toUpperCase();
    const eml = (currentSellerEmail || "").toLowerCase();
    const filtered = isAdmin
      ? dealers
      : dealers.filter((d) => {
          const di = (d.assigned_seller_initials || "").toUpperCase();
          const de = (d.assigned_seller_email || "").toLowerCase();
          return (ini && di === ini) || (eml && de === eml);
        });
    return filtered.map(dealerToOption).sort((a, b) => a.label.localeCompare(b.label));
  }, [dealers, isAdmin, currentSellerInitials, currentSellerEmail]);

  const selected = options.find((o) => o.value === dealerId) || null;

  function reset() {
    setDealerId(""); setContact(""); setLeadId(""); setDemoId(""); setNote("");
  }

  async function handleSave() {
    if (!ctx) { onClose(); return; }
    const anyField = [selected?.company_name || "", contact, leadId, demoId, note].some(s => s.trim().length > 0);
    if (!anyField) {
      toast.message("Ingen reference angivet", { description: "Lukker uden at gemme." });
      reset(); onClose(); return;
    }
    setBusy(true);
    try {
      // Persist a structured dealer label so account_number + assigned seller
      // are preserved without changing the budget_references schema.
      const dealerLabel = selected
        ? `${selected.company_name}${selected.account_number ? ` · ${selected.account_number}` : ""}${selected.assigned_seller_initials ? ` · ${selected.assigned_seller_initials}` : ""}`
        : null;
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
        dealer_name: dealerLabel,
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

  const triggerLabel = selected
    ? selected.label
    : dealersLoading
      ? "Henter forhandlere…"
      : isAdmin ? "Vælg forhandler" : "Vælg blandt mine forhandlere";

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
          <div className="space-y-1">
            <Label className="text-xs">Dealer / forhandler</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className={cn(
                    "w-full justify-between font-normal",
                    !selected && "text-slate-500",
                  )}
                  disabled={busy}
                >
                  <span className="truncate">{triggerLabel}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command
                  filter={(value, search) => {
                    const opt = options.find((o) => o.value === value);
                    if (!opt) return 0;
                    return opt.searchKey.includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Søg firma, kontonr., land, sælger…" />
                  <CommandList>
                    <CommandEmpty>
                      {dealersLoading ? "Henter forhandlere…" : "Ingen match"}
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value=""
                        onSelect={() => { setDealerId(""); setPickerOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !dealerId ? "opacity-100" : "opacity-0")} />
                        Ingen forhandler
                      </CommandItem>
                      {options.map((o) => (
                        <CommandItem
                          key={o.value}
                          value={o.value}
                          onSelect={() => { setDealerId(o.value); setPickerOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", dealerId === o.value ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{o.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {!isAdmin && (
              <p className="text-[10px] text-slate-500">
                Viser kun forhandlere tilknyttet dig.
              </p>
            )}
          </div>

          <Field label="Kontaktperson" v={contact} set={setContact} placeholder="fx. Lars Hansen" />
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
