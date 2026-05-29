/**
 * DealerBudgetHistory — read-only 12-måneders oversigt over budget,
 * realiseret og tilknyttede referencer for én forhandler (eller gruppe).
 *
 * Ændrer ALDRIG budgettal — viser kun eksisterende data.
 *
 * Koblings-strategi (Phase 48):
 *  1. Primær: budget_references.dealer_account_number matcher en af
 *     forhandlerens kontonumre (branch eller gruppe).
 *  2. Fallback: gamle rækker uden dealer_account_number, hvor dealer_name
 *     (label-feltet) starter med forhandlerens company_name. Vises tydeligt
 *     som "Ikke sikkert matchet".
 *
 * Pipeline indgår ikke her — den vises i DealerBudgetCard.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { listBudgetReferences, type BudgetReference } from "@/lib/budgetReferencesService";
import type { DealerBudgetTotals } from "@/lib/crmDealerBudget";
import type { DealerAccount } from "@/lib/dealerAccountsService";

const MONTHS_DA = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface Props {
  year: number;
  totals: DealerBudgetTotals;
  /** Forhandlerkontonumre der hører til denne visning (branch eller gruppe). */
  scopeNumbers: string[];
  /** Forhandlere i scope — bruges til navne-fallback for gamle rækker. */
  dealersInScope: DealerAccount[];
}

interface MonthRow {
  idx: number;
  budget: number;
  realised: number;
  refQty: number;
  refRows: BudgetReference[];
  uncertainQty: number;
  uncertainRows: BudgetReference[];
}

export default function DealerBudgetHistory({ year, totals, scopeNumbers, dealersInScope }: Props) {
  const [refs, setRefs] = useState<BudgetReference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBudgetReferences({ year, budget_type: "work", limit: 1000 })
      .then((rows) => { if (!cancelled) setRefs(rows); })
      .catch(() => { if (!cancelled) setRefs([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const monthRows = useMemo<MonthRow[]>(() => {
    const accountSet = new Set(scopeNumbers.map((n) => (n || "").trim()).filter(Boolean));
    const nameSet = new Set<string>();
    for (const d of dealersInScope) {
      const n = normalize(d.company_name);
      if (n) nameSet.add(n);
      const bn = normalize(d.branch_name);
      if (bn) nameSet.add(bn);
    }

    const init: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({
      idx: i,
      budget: totals.monthlyBudget[i] || 0,
      realised: totals.monthlyRealised[i] || 0,
      refQty: 0,
      refRows: [],
      uncertainQty: 0,
      uncertainRows: [],
    }));

    for (const r of refs) {
      const monthIdx = r.month_idx;
      if (monthIdx == null || monthIdx < 0 || monthIdx > 11) continue;
      const qty = r.delta_qty != null ? Math.max(0, Math.trunc(r.delta_qty)) : 0;
      if (qty <= 0) continue;
      const acct = (r.dealer_account_number || "").trim();
      if (acct && accountSet.has(acct)) {
        // Primær kobling
        init[monthIdx].refQty += qty;
        init[monthIdx].refRows.push(r);
        continue;
      }
      if (!acct && r.dealer_name) {
        // Navne-fallback for gamle rækker. Label-format er typisk
        // "Firma · 123456 · AB" — vi tjekker første led mod company_name.
        const firstPart = r.dealer_name.split("·")[0]?.trim() || r.dealer_name;
        const nKey = normalize(firstPart);
        if (nKey && nameSet.has(nKey)) {
          // Match på navn, men ingen account_number → vis som "Ikke sikkert matchet"
          init[monthIdx].uncertainQty += qty;
          init[monthIdx].uncertainRows.push(r);
        }
      }
    }

    return init;
  }, [refs, scopeNumbers, dealersInScope, totals.monthlyBudget, totals.monthlyRealised]);

  const totalUncertain = monthRows.reduce((s, m) => s + m.uncertainQty, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Månedlig budgethistorik {year}
        </h3>
        <span className="text-[10px] text-slate-400">
          Kun visning · ændrer ikke budgettal
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Henter referencer…</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3">Måned</th>
                  <th className="text-right py-2 px-3">Arbejdsbudget</th>
                  <th className="text-right py-2 px-3">Realiseret</th>
                  <th className="text-right py-2 px-3">Diff</th>
                  <th className="text-right py-2 px-3">Refer. stk.</th>
                  <th className="text-right py-2 pl-3">Usikre</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((m) => {
                  const diff = m.realised - m.budget;
                  const diffCls = diff >= 0 ? "text-emerald-700" : "text-rose-700";
                  return (
                    <tr key={m.idx} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3 font-semibold text-slate-700">{MONTHS_DA[m.idx]}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{m.budget || "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{m.realised || "—"}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums font-semibold ${m.budget || m.realised ? diffCls : "text-slate-400"}`}>
                        {m.budget || m.realised ? (diff > 0 ? `+${diff}` : diff) : "—"}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{m.refQty || "—"}</td>
                      <td className="py-1.5 pl-3 text-right tabular-nums">
                        {m.uncertainQty > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700" title="Gamle referencer uden kontonr. — navne-match er ikke sikkert">
                            <AlertTriangle className="h-3 w-3" /> {m.uncertainQty}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalUncertain > 0 && (
            <p className="mt-3 text-[11px] text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {totalUncertain} stk. fra ældre referencer er matchet på forhandlernavn, ikke kontonummer. Vises som "Usikre" og indgår ikke i totalerne. Nyere referencer gemmes med kontonummer og er sikre.
            </p>
          )}
        </>
      )}
    </div>
  );
}
