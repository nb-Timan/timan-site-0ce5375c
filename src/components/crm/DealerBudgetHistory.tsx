/**
 * DealerBudgetHistory — read-only månedlig oversigt over arbejdsbudget,
 * realiseret og tilknyttede referencer for én forhandler (eller gruppe),
 * brudt ned PR. MODEL/MASKINE.
 *
 * Ændrer ALDRIG budgettal — viser kun eksisterende data.
 *
 * Datakilder (samme som Budget Dashboard / budgetmodulet):
 *  • crm_budget_dealer_lines  → budget pr. (måned, model, forhandler)
 *  • won orders (machine_qty_by_key keyed by mc.type === product_key)
 *  • budget_references         → reference-linjer pr. cell + valgte stk.
 *
 * Koblings-strategi for referencer (Phase 48):
 *  1. Primær: dealer_account_number matcher forhandlerens kontonr.
 *  2. Fallback: gamle rækker uden dealer_account_number, hvor dealer_name
 *     (label-feltet) starter med forhandlerens company_name. Vises tydeligt
 *     som "Usikre" og indgår ikke i totalerne.
 *
 * Model-kobling for referencer: matcher BudgetReference.product_code mod
 * BudgetDealerLine.product_key eller .item_number (case-insensitiv). Hvis
 * intet match → vises på "Ukendt model"-linjen (aldrig blandet ind i en
 * anden model).
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { listBudgetReferences, type BudgetReference } from "@/lib/budgetReferencesService";
import {
  listBudgetDealerLines,
  normalizeDealerName,
  type BudgetDealerLine,
} from "@/lib/crmBudgetService";
import type { CrmOrderWithValue } from "@/lib/crmConfigurationsService";
import type { DealerAccount } from "@/lib/dealerAccountsService";

const MONTHS_DA = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface Props {
  year: number;
  /** Forhandlerkontonumre der hører til denne visning (branch eller gruppe). */
  scopeNumbers: string[];
  /** Forhandlere i scope — bruges til match af dealer-lines og navne-fallback. */
  dealersInScope: DealerAccount[];
  /** Vundne ordrer for forhandlerscopet (allerede filtreret). */
  wonOrdersInScope: CrmOrderWithValue[];
}

interface ModelMonthRow {
  monthIdx: number;
  productKey: string;        // "" hvis ukendt model
  productName: string;       // visningsnavn
  itemNumber: string | null; // varenr (typisk = reference.product_code)
  budget: number;
  realised: number;
  refQty: number;
  refRows: BudgetReference[];
  uncertainQty: number;
  uncertainRows: BudgetReference[];
}

function orderMonthIdx(o: CrmOrderWithValue, year: number): number | null {
  const iso = o.order_sent_at || o.submitted_at || o.last_saved_at || o.created_at;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year) return null;
  return d.getMonth();
}

function isWonOrder(o: CrmOrderWithValue): boolean {
  const s = (o.case_status || "").toLowerCase();
  return s === "ordre_afgivet" || !!o.order_sent_at || !!o.submitted_at;
}

function refMatchesModel(
  r: BudgetReference,
  productKey: string,
  itemNumber: string | null,
  productName: string | null,
): boolean {
  const code = norm(r.product_code);
  const model = norm(r.model_name);
  if (!code && !model) return false;
  if (productKey) {
    const pk = norm(productKey);
    if (code && code === pk) return true;
    if (model && model === pk) return true;
  }
  if (itemNumber && code && norm(itemNumber) === code) return true;
  if (productName && model && norm(productName) === model) return true;
  return false;
}

function refLabel(r: BudgetReference): string {
  const qty = r.delta_qty != null ? Math.max(0, Math.trunc(r.delta_qty)) : 0;
  const parts: string[] = [];
  if (r.lead_id) parts.push(`Lead ${r.lead_id}`);
  if (r.demo_id) parts.push(`Demo ${r.demo_id}`);
  const dealerLabel = r.dealer_name ? r.dealer_name.split("·")[0]?.trim() || r.dealer_name : null;
  if (dealerLabel && !r.lead_id && !r.demo_id) parts.push(dealerLabel);
  if (r.contact_name) parts.push(r.contact_name);
  const model = r.model_name || r.product_code;
  if (model) parts.push(model);
  if (!r.lead_id && !r.demo_id) parts.push("uden lead");
  return `${qty} stk. ${parts.filter(Boolean).join(" · ")}`;
}

export default function DealerBudgetHistory({
  year, scopeNumbers, dealersInScope, wonOrdersInScope,
}: Props) {
  const [refs, setRefs] = useState<BudgetReference[]>([]);
  const [lines, setLines] = useState<BudgetDealerLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listBudgetReferences({ year, budget_type: "arbejdsbudget", limit: 1000 }).catch(() => []),
      listBudgetDealerLines(year).catch(() => []),
    ]).then(([r, l]) => {
      if (cancelled) return;
      setRefs(r);
      setLines(l);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const { rows, totalUncertain } = useMemo(() => {
    const accountIdSet = new Set(dealersInScope.map(d => d.id).filter(Boolean));
    const accountNumSet = new Set(scopeNumbers.map(n => (n || "").trim()).filter(Boolean));
    const nameSet = new Set<string>();
    for (const d of dealersInScope) {
      const n = normalizeDealerName(d.company_name);
      if (n) nameSet.add(n);
      const bn = normalizeDealerName(d.branch_name);
      if (bn) nameSet.add(bn);
    }
    const nameSetSimple = new Set<string>();
    for (const d of dealersInScope) {
      const n = norm(d.company_name);
      if (n) nameSetSimple.add(n);
      const bn = norm(d.branch_name);
      if (bn) nameSetSimple.add(bn);
    }

    // Filter dealer-lines to scope
    const scopedLines = lines.filter((r) => {
      if (r.excluded_from_total) return false;
      if (r.dealer_account_id && accountIdSet.has(r.dealer_account_id)) return true;
      if (r.dealer_account_number && accountNumSet.has(r.dealer_account_number.trim())) return true;
      const nn = r.dealer_name_norm || normalizeDealerName(r.dealer_name);
      if (nn && nameSet.has(nn)) return true;
      return false;
    });

    // Map[monthIdx][productKey] → row
    const map = new Map<string, ModelMonthRow>();
    const keyOf = (m: number, pk: string) => `${m}::${pk}`;

    const ensureRow = (
      monthIdx: number,
      productKey: string,
      productName: string,
      itemNumber: string | null,
    ): ModelMonthRow => {
      const k = keyOf(monthIdx, productKey);
      let row = map.get(k);
      if (!row) {
        row = {
          monthIdx, productKey, productName, itemNumber,
          budget: 0, realised: 0,
          refQty: 0, refRows: [],
          uncertainQty: 0, uncertainRows: [],
        };
        map.set(k, row);
      } else {
        // Keep richest label
        if (!row.productName && productName) row.productName = productName;
        if (!row.itemNumber && itemNumber) row.itemNumber = itemNumber;
      }
      return row;
    };

    // 1. Budget per (month, productKey)
    for (const l of scopedLines) {
      const qty = Number(l.qty) || 0;
      if (qty <= 0) continue;
      if (l.month_idx < 0 || l.month_idx > 11) continue;
      const pk = l.product_key || "";
      const row = ensureRow(l.month_idx, pk, l.product_name || pk || "Ukendt model", l.item_number);
      row.budget += qty;
    }

    // 2. Realised per (month, productKey) from won orders in scope
    for (const o of wonOrdersInScope) {
      if (!isWonOrder(o)) continue;
      const m = orderMonthIdx(o, year);
      if (m == null) continue;
      for (const [pk, q] of Object.entries(o.machine_qty_by_key || {})) {
        const qty = Number(q) || 0;
        if (qty <= 0) continue;
        // Try to find an existing budgeted row for nicer name; else create.
        const existing = map.get(keyOf(m, pk));
        const row = existing
          ? existing
          : ensureRow(m, pk, pk, null);
        row.realised += qty;
      }
    }

    // 3. References — match dealer first, then model
    let unsureTotal = 0;
    for (const r of refs) {
      const monthIdx = r.month_idx;
      if (monthIdx == null || monthIdx < 0 || monthIdx > 11) continue;
      const qty = r.delta_qty != null ? Math.max(0, Math.trunc(r.delta_qty)) : 0;
      if (qty <= 0) continue;

      const acct = (r.dealer_account_number || "").trim();
      let dealerMatch: "primary" | "fallback" | null = null;
      if (acct && accountNumSet.has(acct)) dealerMatch = "primary";
      else if (!acct && r.dealer_name) {
        const firstPart = r.dealer_name.split("·")[0]?.trim() || r.dealer_name;
        const nKey = norm(firstPart);
        if (nKey && nameSetSimple.has(nKey)) dealerMatch = "fallback";
      }
      if (!dealerMatch) continue;

      // Match model to one of the rows for this month
      let targetRow: ModelMonthRow | null = null;
      for (const row of map.values()) {
        if (row.monthIdx !== monthIdx) continue;
        if (refMatchesModel(r, row.productKey, row.itemNumber, row.productName)) {
          targetRow = row;
          break;
        }
      }
      if (!targetRow) {
        // No budget row for this model — create an "extra" row using reference's own model info
        const pk = r.product_code || norm(r.model_name) || "";
        const pname = r.model_name || r.product_code || "Ukendt model";
        targetRow = ensureRow(monthIdx, pk, pname, r.product_code);
      }
      if (dealerMatch === "primary") {
        targetRow.refQty += qty;
        targetRow.refRows.push(r);
      } else {
        targetRow.uncertainQty += qty;
        targetRow.uncertainRows.push(r);
        unsureTotal += qty;
      }
    }

    const out = Array.from(map.values()).sort((a, b) => {
      if (a.monthIdx !== b.monthIdx) return a.monthIdx - b.monthIdx;
      return (a.productName || "").localeCompare(b.productName || "", "da");
    });
    return { rows: out, totalUncertain: unsureTotal };
  }, [refs, lines, wonOrdersInScope, scopeNumbers, dealersInScope, year]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Månedlig budgethistorik {year} — pr. model
        </h3>
        <span className="text-[10px] text-slate-400">
          Kun visning · ændrer ikke budgettal
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Henter referencer…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Ingen budget- eller reference-linjer for {year}.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3">Måned</th>
                  <th className="text-left py-2 pr-3">Model</th>
                  <th className="text-right py-2 px-3">Arbejds&shy;budget</th>
                  <th className="text-right py-2 px-3">Realiseret</th>
                  <th className="text-right py-2 px-3">Diff</th>
                  <th className="text-right py-2 px-3">Refer. stk.</th>
                  <th className="text-left py-2 px-3">Referencer</th>
                  <th className="text-right py-2 pl-3">Usikre</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const diff = m.realised - m.budget;
                  const diffCls = diff >= 0 ? "text-emerald-700" : "text-rose-700";
                  const hasNumbers = m.budget || m.realised;
                  return (
                    <tr key={`${m.monthIdx}-${m.productKey}`} className="border-t border-slate-100 align-top">
                      <td className="py-1.5 pr-3 font-semibold text-slate-700">{MONTHS_DA[m.monthIdx]}</td>
                      <td className="py-1.5 pr-3 text-slate-800">
                        <div className="font-semibold">{m.productName || "Ukendt model"}</div>
                        {m.itemNumber && <div className="text-[10px] text-slate-400 font-mono">{m.itemNumber}</div>}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{m.budget || "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{m.realised || "—"}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums font-semibold ${hasNumbers ? diffCls : "text-slate-400"}`}>
                        {hasNumbers ? (diff > 0 ? `+${diff}` : diff) : "—"}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{m.refQty || "—"}</td>
                      <td className="py-1.5 px-3 text-slate-600">
                        {m.refRows.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <ul className="space-y-0.5 text-[11px]">
                            {m.refRows.map((r) => (
                              <li key={r.id} className="leading-snug">{refLabel(r)}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-1.5 pl-3 text-right tabular-nums">
                        {m.uncertainQty > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-amber-700"
                            title={m.uncertainRows.map(refLabel).join("\n")}
                          >
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
