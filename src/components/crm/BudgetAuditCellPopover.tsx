/**
 * BudgetAuditCellPopover — small history icon next to an editable budget
 * cell. Clicking opens a popover that fetches audit history for exactly
 * this cell (year + seller + product + month + budget type).
 *
 * Read scope is enforced by RLS (Phase 21) — backend sees all, sellers
 * only see their own.
 */
import { useEffect, useState } from "react";
import { History, Link2 } from "lucide-react";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchBudgetAuditEntries, type AuditEntry } from "@/lib/audit-log-store";
import { listBudgetReferences, type BudgetReference } from "@/lib/budgetReferencesService";

interface Props {
  cellKey: string;
  /** Optional latest entry to render the "changed" indicator + tooltip
   *  without opening the popover. */
  latest?: AuditEntry | null;
  /** Compact: indicator + icon together (used inside number cells). */
  className?: string;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("da-DK", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function valueOf(v: unknown): number | string {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    const x = (v as { value: unknown }).value;
    return typeof x === "number" ? x : String(x ?? "");
  }
  return typeof v === "number" ? v : String(v ?? "");
}

export default function BudgetAuditCellPopover({ cellKey, latest, className }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [refs, setRefs] = useState<BudgetReference[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    Promise.all([
      fetchBudgetAuditEntries({ cell_key: cellKey, limit: 25 }),
      listBudgetReferences({ cell_key: cellKey, limit: 25 }),
    ])
      .then(([r, ref]) => { if (alive) { setRows(r); setRefs(ref); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [open, cellKey]);

  const indicator = latest ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block w-1 h-1 rounded-full bg-amber-400 align-middle" aria-label="changed" />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Senest ændret af {latest.actor_name || latest.actor_email || latest.user || "ukendt"}
        {" "}den {fmtDateTime(latest.ts)}
      </TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <span className={className}>
      {indicator}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center p-0.5 ml-0.5 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-600"
            title="Vis ændringshistorik"
            onClick={(e) => e.stopPropagation()}
          >
            <History className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top" align="end"
          className="w-[360px] p-0 max-h-[60vh] overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
            <div className="text-xs font-semibold text-slate-700">Ændringshistorik</div>
            <div className="text-[11px] text-slate-500 truncate">{cellKey}</div>
          </div>
          {busy && <div className="px-3 py-3 text-xs text-slate-500">Indlæser…</div>}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-3 text-xs text-slate-500">Ingen ændringer registreret.</div>
          )}
          {!busy && rows.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const oldV = valueOf(r.old_value);
                const newV = valueOf(r.new_value);
                const diff = (typeof oldV === "number" && typeof newV === "number") ? (newV - oldV) : null;
                return (
                  <li key={r.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">
                        {r.actor_name || r.actor_email || r.user}
                      </span>
                      <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(r.ts)}</span>
                    </div>
                    <div className="text-slate-600 mt-0.5 flex items-center gap-2">
                      <span className="tabular-nums">{String(oldV)}</span>
                      <span>→</span>
                      <span className="tabular-nums font-semibold">{String(newV)}</span>
                      {diff != null && (
                        <span className={diff >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          ({diff >= 0 ? "+" : ""}{diff})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {r.active_mode ? `${r.active_mode} · ` : ""}{r.seller_context || "—"} · {r.status}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!busy && refs.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="px-3 py-1.5 bg-amber-50/60 text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Referencer ({refs.length})
              </div>
              <ul className="divide-y divide-slate-100">
                {refs.map((ref) => (
                  <li key={ref.id} className="px-3 py-2 text-xs space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">
                        {ref.dealer_name || ref.contact_name || ref.lead_id || ref.demo_id || "Reference"}
                      </span>
                      <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(ref.created_at)}</span>
                    </div>
                    {ref.contact_name && <div className="text-slate-600">Kontakt: {ref.contact_name}</div>}
                    {(ref.lead_id || ref.demo_id) && (
                      <div className="text-slate-600">
                        {ref.lead_id && <>Lead: <span className="font-mono">{ref.lead_id}</span> </>}
                        {ref.demo_id && <>Demo: <span className="font-mono">{ref.demo_id}</span></>}
                      </div>
                    )}
                    {ref.note && <div className="text-slate-500 italic">"{ref.note}"</div>}
                    <div className="text-[10px] text-slate-400">af {ref.created_by_name || ref.created_by_email || "—"}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
