/**
 * LatestBudgetChangesPanel — compact list of the most recent budget audit
 * entries for the current year + seller scope. Backend sees all sellers;
 * sellers see their own (RLS enforced).
 */
import { useEffect, useMemo, useState } from "react";
import { Clock, Link2 } from "lucide-react";
import { fetchBudgetAuditEntries, type AuditEntry } from "@/lib/audit-log-store";
import { listBudgetReferences, type BudgetReference } from "@/lib/budgetReferencesService";

interface Props {
  year: number;
  /** When set (seller mode), only fetch this seller's audit entries. */
  sellerContext?: string | null;
  /** Bumped by parent after a save so the panel refreshes. */
  refreshKey?: number;
}

function snap(v: unknown): { value?: number; month?: string; seller?: string; model?: string; type?: string } {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return {
      value: typeof o.value === "number" ? o.value : undefined,
      month: typeof o.month === "string" ? o.month : undefined,
      seller: (o.seller_initials as string) || (o.seller_name as string) || undefined,
      model: (o.item_number as string) || (o.product_name as string) || undefined,
      type: (o.budget_type as string) || undefined,
    };
  }
  return {};
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("da-DK", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function LatestBudgetChangesPanel({ year, sellerContext, refreshKey }: Props) {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    fetchBudgetAuditEntries({
      year,
      seller_context: sellerContext || undefined,
      limit: 10,
    })
      .then((r) => { if (alive) setRows(r); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [year, sellerContext, refreshKey]);

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200">
        <Clock className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800">Seneste budgetændringer</h3>
        <span className="text-xs text-slate-400">· seneste 10 · {year}</span>
      </div>
      {busy && <div className="px-4 py-4 text-xs text-slate-500">Indlæser…</div>}
      {!busy && rows.length === 0 && (
        <div className="px-4 py-4 text-xs text-slate-500">Ingen budgetændringer endnu.</div>
      )}
      {!busy && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <Th>Tid</Th><Th>Sælger</Th><Th>Model</Th><Th>Måned</Th>
                <Th>Type</Th><Th className="text-right">Gammel</Th>
                <Th className="text-right">Ny</Th><Th>Aktør</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const o = snap(r.old_value);
                const n = snap(r.new_value);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <Td className="text-slate-500 whitespace-nowrap">{fmtDateTime(r.ts)}</Td>
                    <Td>{n.seller || o.seller || "—"}</Td>
                    <Td>{n.model || o.model || "—"}</Td>
                    <Td>{n.month || o.month || "—"}</Td>
                    <Td className="capitalize">{(n.type || o.type) === "budget" ? "Budget" : "Arbejdsbudget"}</Td>
                    <Td className="text-right tabular-nums text-slate-500">{o.value ?? "—"}</Td>
                    <Td className="text-right tabular-nums font-semibold">{n.value ?? "—"}</Td>
                    <Td className="text-slate-600">{r.actor_name || r.actor_email || r.user}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"px-3 py-1.5 text-left font-medium " + (className || "")}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-1.5 align-top " + (className || "")}>{children}</td>;
}
