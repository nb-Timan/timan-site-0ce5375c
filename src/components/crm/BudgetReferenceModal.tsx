/**
 * BudgetReferenceModal — attach one or MORE optional references to a budget
 * cell change.
 *
 * Each reference row stores:
 *   - dealer (id / name / account_number / assigned seller initials)
 *   - contact person
 *   - antal stk. denne reference dækker (delta_qty)
 *   - lead id (dropdown filtreret på valgt forhandler)
 *   - demo id (dropdown filtreret på valgt forhandler)
 *   - note
 *
 * Alle felter er valgfri. Tomme rækker springes over. References er ren
 * forklarende metadata — de ændrer ALDRIG budget / pipeline / ordreberegning,
 * og de overskriver ALDRIG eksisterende budgetlinjer eller andre referencer.
 */
import { useEffect, useMemo, useState } from "react";
import { sellerInitialsMatch } from "@/lib/sellerInitials";
import { Link2, ChevronsUpDown, Check, Plus, Trash2, Minus } from "lucide-react";
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
import { createBudgetReference, deleteBudgetReferencesForCell, listBudgetReferences, type BudgetReference } from "@/lib/budgetReferencesService";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";
import { listLeads, listDemoLeads, formatLeadNo, formatDemoNo, type CrmLead, type CrmDemoLead } from "@/lib/crmLeadsService";
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
  /** Stabil id for den budgetændring (typisk audit-id). Gemmes på alle
   *  reference-rækker fra dette gem og bruges til at finde/erstatte dem
   *  hvis brugeren åbner fordelingen igen. */
  change_id: string | null;
  /** Totalen brugeren må fordele i denne modal. Det er CELLENS aktuelle
   *  antal stk. (ikke kun den seneste budgetændring), så modal afspejler
   *  hele cellens samlede fordeling. */
  delta_total: number;
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
  qty: number;
  leadId: string;
  demoId: string;
  note: string;
}

function newRow(): RefRow {
  return {
    uid: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `r-${Math.random().toString(36).slice(2)}`,
    dealerId: "", contact: "", qty: 1, leadId: "", demoId: "", note: "",
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

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [demos, setDemos] = useState<CrmDemoLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  // Load dealer/lead/demo lists AND ALL existing references for this cell so
  // the user re-enters the same distribution she already saved — including
  // legacy rows that may pre-date reference_group_id.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDealersLoading(true);
    setLeadsLoading(true);

    const cellKey = ctx?.cell_key || null;
    const existingP: Promise<BudgetReference[]> = cellKey
      ? listBudgetReferences({
          cell_key: cellKey,
          year: ctx?.budget_year,
          budget_type: ctx?.budget_type,
          limit: 200,
        }).catch(() => [])
      : Promise.resolve([]);

    Promise.all([
      fetchDealerAccounts({ includeDeleted: false }).then(r => r.rows).catch(() => [] as DealerAccount[]),
      listLeads({ limit: 500, payload: "summary" }).catch(() => [] as CrmLead[]),
      listDemoLeads({ limit: 500, payload: "summary" }).catch(() => [] as CrmDemoLead[]),
      existingP,
    ]).then(([d, l, dm, existing]) => {
      if (cancelled) return;
      setDealers(d);
      setLeads(l);
      setDemos(dm);

      if (existing.length > 0) {
        const seed: RefRow[] = existing.map((ex): RefRow => {
          const accountFromLabel = (ex.dealer_name || "").split("·")[1]?.trim() || null;
          const match = d.find(x =>
            (accountFromLabel && x.account_number === accountFromLabel) ||
            (ex.dealer_name && x.company_name && ex.dealer_name.startsWith(x.company_name))
          );
          return {
            uid: typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `r-${Math.random().toString(36).slice(2)}`,
            dealerId: match?.id || "",
            contact: ex.contact_name || "",
            qty: ex.delta_qty ?? 1,
            leadId: ex.lead_id || "",
            demoId: ex.demo_id || "",
            note: ex.note || "",
          };
        });
        setRows(seed);
      } else {
        setRows([newRow()]);
      }
    }).finally(() => {
      if (cancelled) return;
      setDealersLoading(false);
      setLeadsLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, ctx?.cell_key, ctx?.budget_year, ctx?.budget_type]);

  const options = useMemo<DealerOption[]>(() => {
    const ini = (currentSellerInitials || "").toUpperCase();
    const eml = (currentSellerEmail || "").toLowerCase();
    const filtered = isAdmin
      ? dealers
      : dealers.filter((d) => {
          const de = (d.assigned_seller_email || "").toLowerCase();
          return (ini && sellerInitialsMatch(d.assigned_seller_initials, ini)) || (eml && de === eml);
        });
    return filtered.map(dealerToOption).sort((a, b) => a.label.localeCompare(b.label));
  }, [dealers, isAdmin, currentSellerInitials, currentSellerEmail]);

  // Total stk. brugeren må fordele i denne modal. Kommer fra ctx.delta_total
  // (typisk = |new − old| af seneste budgetændring). Aldrig negativ.
  const totalAllowed = Math.max(0, Math.trunc(ctx?.delta_total ?? 0));
  const allocated = rows.reduce((s, r) => s + Math.max(0, Math.trunc(r.qty || 0)), 0);
  const overAllocated = allocated > totalAllowed;
  const underAllocated = allocated < totalAllowed;
  const remaining = totalAllowed - allocated;

  function patchRow(uid: string, patch: Partial<RefRow>) {
    setRows((rs) => rs.map((r) => {
      if (r.uid !== uid) return r;
      const next = { ...r, ...patch };
      // Cap qty so the running total never exceeds the allowed total.
      if (patch.qty != null && totalAllowed > 0) {
        const otherSum = rs.reduce((s, x) => s + (x.uid === uid ? 0 : Math.max(0, x.qty || 0)), 0);
        const room = Math.max(0, totalAllowed - otherSum);
        next.qty = Math.min(Math.max(0, Math.trunc(next.qty || 0)), room);
      }
      return next;
    }));
  }
  function removeRow(uid: string) {
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.uid !== uid)));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }

  function rowHasContent(r: RefRow): boolean {
    if (r.dealerId) return true;
    if (r.qty && r.qty !== 0) return true;
    return [r.contact, r.leadId, r.demoId, r.note].some((s) => s.trim().length > 0);
  }

  async function handleSave() {
    if (!ctx) { onClose(); return; }
    const filled = rows.filter(rowHasContent);
    const cellTarget = {
      cell_key: ctx.cell_key,
      budget_year: ctx.budget_year,
      budget_type: ctx.budget_type,
    };
    if (filled.length === 0) {
      // Empty save = wipe every reference row for this cell so the user
      // can clean up over-allocations.
      try { await deleteBudgetReferencesForCell(cellTarget); } catch { /* */ }
      toast.message("Reference-fordeling ryddet");
      onSaved?.();
      onClose(); return;
    }
    const sum = filled.reduce((s, r) => s + Math.max(0, Math.trunc(r.qty || 0)), 0);
    if (totalAllowed > 0 && sum > totalAllowed) {
      toast.error(`Du har fordelt ${sum} stk., men cellen har kun ${totalAllowed} stk.`);
      return;
    }
    setBusy(true);
    try {
      // Replace strategy keyed on the cell itself: clear ALL prior rows for
      // (cell_key, year, type) — including legacy rows without a group_id —
      // so re-saving never stacks duplicates and always matches what the
      // modal showed.
      await deleteBudgetReferencesForCell(cellTarget);
      for (const r of filled) {
        const opt = options.find((o) => o.value === r.dealerId) || null;
        const dealerLabel = opt
          ? `${opt.company_name}${opt.account_number ? ` · ${opt.account_number}` : ""}${opt.assigned_seller_initials ? ` · ${opt.assigned_seller_initials}` : ""}`
          : null;
        const qty = Number.isFinite(r.qty) ? Math.trunc(r.qty) : null;
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
          dealer_account_number: opt?.account_number || null,
          contact_name: r.contact.trim() || null,
          lead_id: r.leadId.trim() || null,
          demo_id: r.demoId.trim() || null,
          note: r.note.trim() || null,
          created_by_email: ctx.actor_email,
          created_by_name: ctx.actor_name,
          delta_qty: qty,
          reference_group_id: ctx.change_id,
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
            Angiv antal stk. denne reference dækker. Felterne ændrer ikke budgettet — de er kun forklarende metadata.
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

        {/* Allocation summary: explains that the qty inputs distribute the
            recent budget change, not extra budget on top. */}
        <div
          className={cn(
            "text-xs rounded-lg border px-3 py-2 flex items-center justify-between gap-3",
            overAllocated
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : underAllocated
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-300 bg-emerald-50 text-emerald-800",
          )}
        >
          <span>
            Fordelt: <span className="font-semibold tabular-nums">{allocated}</span> / <span className="font-semibold tabular-nums">{totalAllowed}</span> stk.
          </span>
          <span className="text-[11px]">
            {totalAllowed === 0
              ? "Ingen budgetændring at fordele"
              : overAllocated
                ? `${allocated - totalAllowed} stk. for meget`
                : underAllocated
                  ? `${remaining} stk. ikke fordelt`
                  : "Alt fordelt"}
          </span>
        </div>

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
              leads={leads}
              demos={demos}
              leadsLoading={leadsLoading}
              qtyRoomForRow={Math.max(0, totalAllowed - (allocated - Math.max(0, r.qty || 0)))}
              onChange={(patch) => patchRow(r.uid, patch)}
              onRemove={() => removeRow(r.uid)}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={busy || (totalAllowed > 0 && allocated >= totalAllowed)}
            className="w-full border border-dashed border-slate-300 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Tilføj reference
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annullér</Button>
          <Button onClick={handleSave} disabled={busy || overAllocated}>
            {busy ? "Gemmer…" : "Gem referencer"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function ReferenceRowEditor({
  index, row, options, dealersLoading, isAdmin, busy, canRemove, leads, demos, leadsLoading, qtyRoomForRow, onChange, onRemove,
}: {
  index: number;
  row: RefRow;
  options: DealerOption[];
  dealersLoading: boolean;
  isAdmin: boolean;
  busy: boolean;
  canRemove: boolean;
  leads: CrmLead[];
  demos: CrmDemoLead[];
  leadsLoading: boolean;
  /** Largest qty this row may hold without exceeding the modal-wide total. */
  qtyRoomForRow: number;
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

  // Filtered leads/demos for the currently selected dealer.
  const dealerAccountNo = (selected?.account_number || "").trim();
  const dealerCompany = (selected?.company_name || "").trim().toLowerCase();
  const filteredLeads = useMemo<CrmLead[]>(() => {
    if (!selected) return [];
    return leads.filter(l => {
      const linked = (l.linked_dealer_id || "").trim();
      if (dealerAccountNo && linked && linked === dealerAccountNo) return true;
      return false;
    });
  }, [leads, selected, dealerAccountNo]);
  const filteredDemos = useMemo<CrmDemoLead[]>(() => {
    if (!selected) return [];
    return demos.filter(d => {
      const company = (d.dealer_company || "").trim().toLowerCase();
      return !!company && !!dealerCompany && company === dealerCompany;
    });
  }, [demos, selected, dealerCompany]);

  const leadPlaceholder = !selected
    ? "Vælg forhandler først"
    : leadsLoading
      ? "Henter leads…"
      : filteredLeads.length === 0
        ? "Ingen leads fundet"
        : "Ingen — spring over";
  const demoPlaceholder = !selected
    ? "Vælg forhandler først"
    : leadsLoading
      ? "Henter demoer…"
      : filteredDemos.length === 0
        ? "Ingen demoer fundet"
        : "Ingen — spring over";

  function setQty(v: number) {
    const safe = Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
    onChange({ qty: safe });
  }

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
                  <CommandItem value="" onSelect={() => {
                    onChange({ dealerId: "", leadId: "", demoId: "" });
                    setPickerOpen(false);
                  }}>
                    <Check className={cn("mr-2 h-4 w-4", !row.dealerId ? "opacity-100" : "opacity-0")} />
                    Ingen forhandler
                  </CommandItem>
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      onSelect={() => {
                        // Reset lead/demo when dealer changes so we never carry
                        // an ID belonging to a different dealer.
                        onChange({ dealerId: o.value, leadId: "", demoId: "" });
                        setPickerOpen(false);
                      }}
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

      <div className="grid grid-cols-2 gap-2">
        <Field label="Kontaktperson" v={row.contact} set={(v) => onChange({ contact: v })} placeholder="fx. Lars Hansen" />
        <div className="space-y-1">
          <Label className="text-xs">Antal stk. (denne reference)</Label>
          <div className="inline-flex items-center gap-1 w-full">
            <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0" disabled={busy} onClick={() => setQty(row.qty - 1)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              min={0}
              step={1}
              className="text-center tabular-nums"
              value={row.qty}
              onChange={(e) => setQty(parseInt(e.target.value, 10))}
              disabled={busy}
            />
            <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0"
              disabled={busy || row.qty >= qtyRoomForRow}
              onClick={() => setQty(row.qty + 1)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Lead ID (kun for valgt forhandler)</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            value={row.leadId}
            onChange={(e) => onChange({ leadId: e.target.value })}
            disabled={busy || !selected || leadsLoading || filteredLeads.length === 0}
          >
            <option value="">{leadPlaceholder}</option>
            {filteredLeads.map(l => (
              <option key={l.id} value={formatLeadNo(l.lead_no) || l.id}>
                {formatLeadNo(l.lead_no) || l.id.slice(0, 8)} — {l.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Demo ID (kun for valgt forhandler)</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            value={row.demoId}
            onChange={(e) => onChange({ demoId: e.target.value })}
            disabled={busy || !selected || leadsLoading || filteredDemos.length === 0}
          >
            <option value="">{demoPlaceholder}</option>
            {filteredDemos.map(d => (
              <option key={d.id} value={formatDemoNo(d.demo_no) || d.id}>
                {formatDemoNo(d.demo_no) || d.id.slice(0, 8)} — {d.title}
              </option>
            ))}
          </select>
        </div>
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
