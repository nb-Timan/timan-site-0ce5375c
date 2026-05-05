/**
 * BudgetReferenceModal — attach one or MORE optional references to a budget
 * cell change.
 *
 * Each reference row stores:
 *   - dealer (id / name / account_number / assigned seller initials)
 *   - contact person
 *   - lead id
 *   - demo id
 *   - note
 *
 * All fields are optional. Empty rows are skipped. References are explanatory
 * metadata only — they NEVER affect budget / pipeline / order calculations.
 *
 * Storage: each row is inserted as one row in public.budget_references with
 * the same cell_key. No schema change required — multiple rows per cell_key
 * naturally form the "list" of references for that cell.
 */
import { useEffect, useMemo, useState } from "react";
import { Link2, ChevronsUpDown, Check, Plus, Trash2 } from "lucide-react";
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
  isAdmin?: boolean;
  currentSellerInitials?: string | null;
  currentSellerEmail?: string | null;
}

interface DealerOption {
  value: string;
  label: string;
  searchKey: string;
  account_number: string | null;
  company_name: string;
  assigned_seller_initials: string | null;
}

interface RefRow {
  uid: string;
  dealerId: string;
  contact: string;
  leadId: string;
  demoId: string;
  note: string;
}

function newRow(): RefRow {
  return {
    uid: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `r-${Math.random().toString(36).slice(2)}`,
    dealerId: "", contact: "", leadId: "", demoId: "", note: "",
  };
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
  const [rows, setRows] = useState<RefRow[]>([newRow()]);
  const [busy, setBusy] = useState(false);

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows([newRow()]);
    let cancelled = false;
    setDealersLoading(true);
    fetchDealerAccounts({ includeDeleted: false })
      .then((res) => { if (!cancelled) setDealers(res.rows); })
      .catch(() => { /* keep empty */ })
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

  function patchRow(uid: string, patch: Partial<RefRow>) {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }
  function removeRow(uid: string) {
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.uid !== uid)));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }

  function rowHasContent(r: RefRow): boolean {
    if (r.dealerId) return true;
    return [r.contact, r.leadId, r.demoId, r.note].some((s) => s.trim().length > 0);
  }

  async function handleSave() {
    if (!ctx) { onClose(); return; }
    const filled = rows.filter(rowHasContent);
    if (filled.length === 0) {
      toast.message("Ingen reference angivet", { description: "Lukker uden at gemme." });
      onClose(); return;
    }
    setBusy(true);
    try {
      for (const r of filled) {
        const opt = options.find((o) => o.value === r.dealerId) || null;
        const dealerLabel = opt
          ? `${opt.company_name}${opt.account_number ? ` · ${opt.account_number}` : ""}${opt.assigned_seller_initials ? ` · ${opt.assigned_seller_initials}` : ""}`
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
          contact_name: r.contact.trim() || null,
          lead_id: r.leadId.trim() || null,
          demo_id: r.demoId.trim() || null,
          note: r.note.trim() || null,
          created_by_email: ctx.actor_email,
          created_by_name: ctx.actor_name,
        });
      }
      toast.success(filled.length === 1 ? "Reference gemt" : `${filled.length} referencer gemt`);
      onSaved?.(); onClose();
    } catch (err) {
      console.error(err);
      toast.error("Kunne ikke gemme reference");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-500" />
            Tilføj reference til budgetændring
          </DialogTitle>
          <DialogDescription>
            Alle felter er valgfri. Tilknyt en eller flere forhandlere, kontakter, lead/demo eller noter for sporbarhed.
          </DialogDescription>
        </DialogHeader>

        {ctx && (
          <div className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-0.5">
            <CtxRow label="Sælger" value={ctx.seller_initials || "—"} />
            <CtxRow label="Model" value={ctx.model_name || ctx.product_code || "—"} />
            <CtxRow label="Måned" value={ctx.month || "—"} />
            <CtxRow label="Type" value={ctx.budget_type === "budget" ? "Budget" : "Arbejdsbudget"} />
            {ctx.old_value != null && ctx.new_value != null && (
              <CtxRow label="Ændring" value={`${ctx.old_value} → ${ctx.new_value}`} />
            )}
          </div>
        )}

        <div className="space-y-3">
          {rows.map((r, idx) => (
            <ReferenceRowEditor
              key={r.uid}
              index={idx}
              row={r}
              options={options}
              dealersLoading={dealersLoading}
              isAdmin={isAdmin}
              busy={busy}
              canRemove={rows.length > 1}
              onChange={(patch) => patchRow(r.uid, patch)}
              onRemove={() => removeRow(r.uid)}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={busy}
            className="w-full border border-dashed border-slate-300 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Tilføj reference
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annullér</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? "Gemmer…" : "Gem referencer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferenceRowEditor({
  index, row, options, dealersLoading, isAdmin, busy, canRemove, onChange, onRemove,
}: {
  index: number;
  row: RefRow;
  options: DealerOption[];
  dealersLoading: boolean;
  isAdmin: boolean;
  busy: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<RefRow>) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = options.find((o) => o.value === row.dealerId) || null;
  const triggerLabel = selected
    ? selected.label
    : dealersLoading
      ? "Henter forhandlere…"
      : isAdmin ? "Vælg forhandler" : "Vælg blandt mine forhandlere";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Reference #{index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={busy || !canRemove}
          className="h-7 px-2 text-slate-400 hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Dealer / forhandler</Label>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={pickerOpen}
              className={cn("w-full justify-between font-normal", !selected && "text-slate-500")}
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
                <CommandEmpty>{dealersLoading ? "Henter forhandlere…" : "Ingen match"}</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="" onSelect={() => { onChange({ dealerId: "" }); setPickerOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", !row.dealerId ? "opacity-100" : "opacity-0")} />
                    Ingen forhandler
                  </CommandItem>
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      onSelect={() => { onChange({ dealerId: o.value }); setPickerOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", row.dealerId === o.value ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{o.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <Field label="Kontaktperson" v={row.contact} set={(v) => onChange({ contact: v })} placeholder="fx. Lars Hansen" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Lead ID" v={row.leadId} set={(v) => onChange({ leadId: v })} placeholder="L-1042" />
        <Field label="Demo ID" v={row.demoId} set={(v) => onChange({ demoId: v })} placeholder="D-4007" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Note</Label>
        <Textarea value={row.note} onChange={(e) => onChange({ note: e.target.value })} rows={2} placeholder="Kort begrundelse / kontekst …" />
      </div>
    </div>
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
function CtxRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
