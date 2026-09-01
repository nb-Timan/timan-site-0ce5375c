/**
 * Read-only aggregator for the CRM Budget Dashboard (matrix layout).
 *
 * Pulls existing CRM services and groups everything by:
 *   sellerEmail → dealerKey → quarter (1..4) → machineKey → CellAgg
 *
 * Dealers per seller come from dealer_accounts (assigned_seller_initials).
 * Items that can't be matched to a known dealer fall into a synthetic
 * "uden forhandler" row so totals remain visible.
 *
 * No writes. No new tables. Pricing/PDF/email/n8n/auth untouched.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BUDGET_SELLERS,
  listBudgetLines,
  listForecasts,
  listSalesActuals,
  listBudgetDealerLines,
  type BudgetSellerRef,
  type BudgetDealerLine,
} from "@/lib/crmBudgetService";
import {
  listLeads,
  buildLeadWorkingContributions,
  formatLeadNo,
  type LeadWorkingContribution,
} from "@/lib/crmLeadsService";
import {
  listScopedConfigurations,
  type ScopedConfiguration,
} from "@/lib/crmRelationsService";
import {
  fetchDealerAccounts,
  type DealerAccount,
} from "@/lib/dealerAccountsService";
import type { PortalRole } from "@/lib/portalAccess";
import {
  normalizeSellerInitials,
  formatCountryBadge,
  getCountryIsoList,
  countryToIso,
} from "@/lib/sellerInitials";

export type Quarter = 1 | 2 | 3 | 4;
export type MachineKey = "RC-751" | "RC-1000s" | "Timan 3330" | "Timan 2620";

export const DASHBOARD_MACHINES: MachineKey[] = [
  "RC-751",
  "RC-1000s",
  "Timan 3330",
  "Timan 2620",
];

/** Compact label shown in matrix header (e.g. "3330" instead of "Timan 3330"). */
export const MACHINE_SHORT_LABEL: Record<MachineKey, string> = {
  "RC-751": "RC-751",
  "RC-1000s": "RC-1000s",
  "Timan 3330": "3330",
  "Timan 2620": "2620",
};

export interface SellerDisplay extends BudgetSellerRef {
  display_name: string;
}

/** Display-name mapping (canonical normalised initials → first name).
 *  AKR is normalised to AK so dealer rows assigned to "AK" also resolve here. */
const SELLER_DISPLAY: Record<string, string> = {
  AK: "Alexander",
  BP: "Birger",
  EM: "Esben",
  JTN: "Jakob",
  NB: "Nicolai",
};

export const DASHBOARD_SELLERS: SellerDisplay[] = BUDGET_SELLERS
  .map((s) => {
    const canonical = normalizeSellerInitials(s.initials);
    return {
      ...s,
      // Display canonical initials (AK, not AKR) in the UI badge.
      initials: canonical,
      display_name: SELLER_DISPLAY[canonical] || canonical,
    };
  })
  .sort((a, b) => a.display_name.localeCompare(b.display_name, "da"));

export type CellItemKind = "lead" | "quote" | "order";

export interface CellDetailItem {
  kind: CellItemKind;
  id: string;
  title: string;
  dealer: string | null;
  status: string | null;
  machine: string | null;
  date: string | null;
  sellerLabel: string | null;
  href: string;
}

export interface CellAgg {
  budgetQty: number;
  orderQty: number;
  workingQty: number;
  items: CellDetailItem[];
}

export interface DealerRow {
  /** Stable key used for matrix cells. Equals "id:<dealer_account_id>" for
   *  known dealers, or "unassigned" for the synthetic catch-all row. */
  key: string;
  name: string;
  account_number: string | null;
  unassigned?: boolean;
  /** ISO-3166 alpha-2 code (DK/DE/...) when the raw country resolves. */
  countryIso?: string | null;
}

export interface SellerSection {
  dealers: DealerRow[];
  cells: Record<string, Record<Quarter, Record<MachineKey, CellAgg>>>;
  /** Compact country badge derived from assigned dealer countries. */
  countryBadge: { label: string; tooltip: string | null };
  /** Sorted list of ISO codes for chips in the seller header. */
  countryIsos: string[];
}

export type DashboardData = Record<string, SellerSection>;

interface Params {
  year: number;
  role: PortalRole | null;
  sellerId: string | null;
  sellerEmail: string | null;
  sellerInitials: string | null;
  /** When true → backend/admin: show all sellers. */
  showAllSellers: boolean;
}

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const upper = (s: string | null | undefined) => (s || "").trim().toUpperCase();

function quarterOfMonth(m: number): Quarter {
  return (Math.floor(m / 3) + 1) as Quarter;
}

function emptyCell(): CellAgg {
  return { budgetQty: 0, orderQty: 0, workingQty: 0, items: [] };
}

function emptyQuarters(): Record<Quarter, Record<MachineKey, CellAgg>> {
  const out = {} as Record<Quarter, Record<MachineKey, CellAgg>>;
  for (const q of [1, 2, 3, 4] as Quarter[]) {
    out[q] = {} as Record<MachineKey, CellAgg>;
    for (const m of DASHBOARD_MACHINES) out[q][m] = emptyCell();
  }
  return out;
}

const UNASSIGNED_KEY = "unassigned";

interface DealerLookup {
  /** Map of all candidate keys → canonical row key. */
  byKey: Map<string, string>;
  /** Map from row.key → DealerRow. */
  rows: Map<string, DealerRow>;
}

function buildDealerLookup(dealers: DealerAccount[]): DealerLookup {
  const byKey = new Map<string, string>();
  const rows = new Map<string, DealerRow>();
  for (const d of dealers) {
    const rowKey = `id:${d.id}`;
    rows.set(rowKey, {
      key: rowKey,
      name: d.company_name || d.account_number || "(uden navn)",
      account_number: d.account_number || null,
      countryIso: countryToIso(d.country),
    });
    byKey.set(`id:${d.id}`, rowKey);
    if (d.account_number) byKey.set(`num:${d.account_number.trim()}`, rowKey);
    const nameKey = norm(d.company_name);
    if (nameKey) byKey.set(`name:${nameKey}`, rowKey);
  }
  return { byKey, rows };
}

function ensureUnassignedRow(section: SellerSection): string {
  if (!section.cells[UNASSIGNED_KEY]) {
    section.cells[UNASSIGNED_KEY] = emptyQuarters();
    if (!section.dealers.some((d) => d.key === UNASSIGNED_KEY)) {
      section.dealers.push({
        key: UNASSIGNED_KEY,
        name: "(uden forhandler)",
        account_number: null,
        unassigned: true,
      });
    }
  }
  return UNASSIGNED_KEY;
}

function resolveDealerKey(
  section: SellerSection,
  lookup: DealerLookup,
  candidates: Array<string | null | undefined>,
): string {
  for (const c of candidates) {
    if (!c) continue;
    const hit = lookup.byKey.get(c);
    if (hit) {
      if (!section.cells[hit]) section.cells[hit] = emptyQuarters();
      return hit;
    }
  }
  return ensureUnassignedRow(section);
}

function matchSellerEmail(row: ScopedConfiguration, sellers: SellerDisplay[]): string | null {
  const email = norm(row.seller_email);
  if (email) {
    const hit = sellers.find((s) => norm(s.email) === email);
    if (hit) return hit.email;
  }
  const ini = upper(row.seller_initials);
  if (ini) {
    const hit = sellers.find((s) => upper(s.initials) === ini);
    if (hit) return hit.email;
  }
  return null;
}

function machineFromKeys(keys: string[]): MachineKey | null {
  for (const k of keys) {
    const hit = DASHBOARD_MACHINES.find((m) => norm(m) === norm(k));
    if (hit) return hit;
  }
  return null;
}

function leadOwnerEmail(c: LeadWorkingContribution, sellers: SellerDisplay[]): string | null {
  const email = norm(c.owner_email);
  if (email) {
    const hit = sellers.find((s) => norm(s.email) === email);
    if (hit) return hit.email;
  }
  const name = (c.owner_name || "").trim();
  for (const s of sellers) {
    if (name.toUpperCase().startsWith(s.initials.toUpperCase())) return s.email;
  }
  return null;
}

export function useBudgetDashboardData(p: Params) {
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visibleSellers = useMemo<SellerDisplay[]>(() => {
    if (p.showAllSellers) return DASHBOARD_SELLERS;
    const own = DASHBOARD_SELLERS.find(
      (s) => (p.sellerEmail && norm(s.email) === norm(p.sellerEmail))
        || (p.sellerInitials
          && normalizeSellerInitials(s.initials) === normalizeSellerInitials(p.sellerInitials)),
    );
    return own ? [own] : [];
  }, [p.showAllSellers, p.sellerEmail, p.sellerInitials]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const filter = {
          role: p.role,
          sellerId: p.sellerId,
          sellerInitials: p.sellerInitials,
          sellerEmail: p.sellerEmail,
        };

        // Dealers per visible seller — match by NORMALISED initials so AK
        // dealer rows resolve to the same seller as AKR-coded budget data.
        const dealersBySeller = new Map<string, DealerAccount[]>();
        const allDealersRes = await fetchDealerAccounts({ includeDeleted: false });
        if (allDealersRes.error) throw new Error(allDealersRes.error);
        for (const s of visibleSellers) {
          const target = normalizeSellerInitials(s.initials);
          const mine = allDealersRes.rows.filter(
            (d) => normalizeSellerInitials(d.assigned_seller_initials) === target,
          );
          dealersBySeller.set(s.email, mine);
        }

        const [lines, forecasts, actuals, leads, quotesRes, ordersRes, dealerLines] = await Promise.all([
          listBudgetLines({ year: p.year }),
          listForecasts(p.year),
          listSalesActuals(p.year),
          listLeads({ limit: 500, payload: "summary" }),
          listScopedConfigurations({ ...filter, documentType: "quote" }),
          listScopedConfigurations({ ...filter, documentType: "order" }),
          listBudgetDealerLines(p.year),
        ]);

        // Init buckets.
        const out: DashboardData = {};
        const lookups = new Map<string, DealerLookup>();
        for (const s of visibleSellers) {
          const dealers = dealersBySeller.get(s.email) || [];
          dealers.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "", "da"));
          const lookup = buildDealerLookup(dealers);
          lookups.set(s.email, lookup);
          const cells: SellerSection["cells"] = {};
          for (const [, row] of lookup.rows) cells[row.key] = emptyQuarters();
          out[s.email] = {
            dealers: Array.from(lookup.rows.values()),
            cells,
            countryBadge: formatCountryBadge(dealers.map((d) => d.country)),
            countryIsos: getCountryIsoList(dealers.map((d) => d.country)),
          };
        }

        const sellerByEmail = new Map(visibleSellers.map((s) => [norm(s.email), s]));
        const lineById = new Map(lines.map((l) => [l.id, l]));

        // ── Phase 35 / Step 5 — index dealer-line presence per cell so we
        //    don't double-count the manual crm_budget_lines value below. ──
        const dealerHasMonth = new Set<string>(); // `${sellerEmail}|${machine}|${m}`
        const dealerKey = (e: string, mk: MachineKey, m: number) => `${e.toLowerCase()}|${mk}|${m}`;
        for (const r of dealerLines) {
          if (r.excluded_from_total) continue;
          if (!r.qty || r.qty <= 0) continue;
          const machine = DASHBOARD_MACHINES.find((mm) => norm(mm) === norm(r.product_key));
          if (!machine) continue;
          const seller = sellerByEmail.get(norm(r.seller_email));
          if (!seller) continue;
          if (r.month_idx < 0 || r.month_idx > 11) continue;
          dealerHasMonth.add(dealerKey(seller.email, machine, r.month_idx));
        }

        // ── Budget qty per quarter from manual crm_budget_lines.
        //    Skipped per-month when an imported dealer-line covers that month
        //    (those months are accounted for in the dealer pass below). ────
        for (const l of lines) {
          if (l.category !== "machine") continue;
          const seller = sellerByEmail.get(norm(l.seller_email));
          if (!seller) continue;
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(l.product_key));
          if (!machine) continue;
          const section = out[seller.email];
          const dKey = ensureUnassignedRow(section);
          const split = (l.monthly_split && l.monthly_split.length === 12)
            ? l.monthly_split
            : Array.from({ length: 12 }, () => 1 / 12);
          for (let m = 0; m < 12; m++) {
            if (dealerHasMonth.has(dealerKey(seller.email, machine, m))) continue;
            const q = quarterOfMonth(m);
            section.cells[dKey][q][machine].budgetQty += (l.qty_budget || 0) * (split[m] || 0);
          }
        }

        // ── Imported dealer-level budget rows → attribute to dealer row ───
        for (const r of dealerLines) {
          if (r.excluded_from_total) continue;
          if (!r.qty || r.qty <= 0) continue;
          const seller = sellerByEmail.get(norm(r.seller_email));
          if (!seller) continue;
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(r.product_key));
          if (!machine) continue;
          if (r.month_idx < 0 || r.month_idx > 11) continue;
          const section = out[seller.email];
          const lookup = lookups.get(seller.email)!;
          const candidates: Array<string | null> = [
            r.dealer_account_id ? `id:${r.dealer_account_id}` : null,
            r.dealer_account_number ? `num:${r.dealer_account_number.trim()}` : null,
            r.dealer_name ? `name:${norm(r.dealer_name)}` : null,
          ];
          const dKey = resolveDealerKey(section, lookup, candidates);
          const q = quarterOfMonth(r.month_idx);
          section.cells[dKey][q][machine].budgetQty += r.qty;
        }


        // ── Orders qty per quarter from actuals ───────────────────────────
        for (const a of actuals) {
          const line = lineById.get(a.budget_line_id);
          if (!line) continue;
          const seller = sellerByEmail.get(norm(line.seller_email));
          if (!seller) continue;
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(line.product_key));
          if (!machine) continue;
          const section = out[seller.email];
          const dKey = ensureUnassignedRow(section);
          const monthly = a.monthly_qty || [];
          for (let m = 0; m < 12; m++) {
            const q = quarterOfMonth(m);
            section.cells[dKey][q][machine].orderQty += monthly[m] || 0;
          }
        }

        // ── Arbejdsbudget – forecast monthly ──────────────────────────────
        for (const f of forecasts) {
          const line = lineById.get(f.budget_line_id);
          if (!line) continue;
          const seller = sellerByEmail.get(norm(line.seller_email));
          if (!seller) continue;
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(line.product_key));
          if (!machine) continue;
          const section = out[seller.email];
          const dKey = ensureUnassignedRow(section);
          if (Array.isArray(f.monthly_qty) && f.monthly_qty.length === 12) {
            for (let m = 0; m < 12; m++) {
              const q = quarterOfMonth(m);
              section.cells[dKey][q][machine].workingQty += f.monthly_qty[m] || 0;
            }
          } else if (f.qty_forecast && line.monthly_split) {
            for (let m = 0; m < 12; m++) {
              const q = quarterOfMonth(m);
              section.cells[dKey][q][machine].workingQty += (f.qty_forecast || 0) * (line.monthly_split[m] || 0);
            }
          }
        }

        // ── Arbejdsbudget – leads moved to working ────────────────────────
        const contribs = buildLeadWorkingContributions(leads).filter((c) => c.year === p.year);
        for (const c of contribs) {
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(c.product_key));
          if (!machine) continue;
          const sellerEmail = leadOwnerEmail(c, visibleSellers);
          if (!sellerEmail || !out[sellerEmail]) continue;
          const section = out[sellerEmail];
          const lookup = lookups.get(sellerEmail)!;
          const dealerName = norm(c.dealer);
          const dKey = resolveDealerKey(section, lookup, [
            c.dealer ? `id:${c.dealer}` : null,
            c.dealer ? `num:${(c.dealer || "").trim()}` : null,
            dealerName ? `name:${dealerName}` : null,
          ]);
          const q = quarterOfMonth(c.month_idx);
          section.cells[dKey][q][machine].workingQty += c.qty || 0;
          section.cells[dKey][q][machine].items.push({
            kind: "lead",
            id: c.lead_id,
            title: `${c.lead_no ? formatLeadNo(c.lead_no) + " · " : ""}${c.title}`,
            dealer: c.dealer || c.customer || null,
            status: "Arbejdsbudget",
            machine: c.machine_label || machine,
            date: c.expected_close_date,
            sellerLabel: c.owner_name || c.owner_email || null,
            href: `/portal/crm/leads/${c.lead_id}`,
          });
        }

        // ── Quotes & orders enrichment + dealer-row counters ──────────────
        const enrichConfig = (rows: ScopedConfiguration[], kind: "quote" | "order") => {
          for (const r of rows) {
            const sellerEmail = matchSellerEmail(r, visibleSellers);
            if (!sellerEmail || !out[sellerEmail]) continue;
            const machine = machineFromKeys(r.machine_keys);
            if (!machine) continue;
            const d = r.month_iso ? new Date(r.month_iso) : null;
            if (!d || isNaN(d.getTime()) || d.getFullYear() !== p.year) continue;
            const section = out[sellerEmail];
            const lookup = lookups.get(sellerEmail)!;
            const candidates: Array<string | null> = [
              r.dealer_account_id ? `id:${r.dealer_account_id}` : null,
              r.dealer_number ? `num:${r.dealer_number.trim()}` : null,
              r.dealer_account_number ? `num:${r.dealer_account_number.trim()}` : null,
            ];
            const nm = norm(r.dealer_company_name || r.dealer_name);
            if (nm) candidates.push(`name:${nm}`);
            const dKey = resolveDealerKey(section, lookup, candidates);
            const q = quarterOfMonth(d.getMonth());
            const qty = (r.machine_qty_by_key && r.machine_qty_by_key[machine]) || 1;
            if (kind === "order") {
              // orderQty already aggregated from actuals at seller-total
              // level; we DO want it on the dealer cell row for visibility.
              section.cells[dKey][q][machine].orderQty += 0;
            }
            section.cells[dKey][q][machine].items.push({
              kind,
              id: r.id,
              title: r.title || (kind === "quote" ? r.quote_number : r.order_number) || (kind === "quote" ? "Tilbud" : "Ordre"),
              dealer: r.dealer_company_name || r.dealer_name || r.dealer_number || null,
              status: r.case_status || kind,
              machine,
              date: r.month_iso,
              sellerLabel: r.seller_initials || r.seller_email || null,
              href: kind === "quote"
                ? `/portal/crm/quotes?focus=${encodeURIComponent(r.id)}`
                : `/portal/crm/orders?focus=${encodeURIComponent(r.id)}`,
            });
            // Distribute qty to the dealer cell so dealer rows show numbers
            // even when actuals (which are seller-total) aren't dealer-keyed.
            if (kind === "order") {
              section.cells[dKey][q][machine].orderQty += qty;
              // Compensate the unassigned bucket so seller totals don't
              // double-count vs the actuals path above.
              const un = section.cells[UNASSIGNED_KEY];
              if (un && un[q][machine].orderQty >= qty) {
                un[q][machine].orderQty -= qty;
              }
            }
          }
        };
        enrichConfig(quotesRes.rows || [], "quote");
        enrichConfig(ordersRes.rows || [], "order");

        // Drop empty unassigned rows that have no values + no items.
        for (const s of visibleSellers) {
          const section = out[s.email];
          const un = section.cells[UNASSIGNED_KEY];
          if (!un) continue;
          let hasAny = false;
          for (const q of [1, 2, 3, 4] as Quarter[]) {
            for (const m of DASHBOARD_MACHINES) {
              const c = un[q][m];
              if (c.budgetQty || c.orderQty || c.workingQty || c.items.length) { hasAny = true; break; }
            }
            if (hasAny) break;
          }
          if (!hasAny) {
            delete section.cells[UNASSIGNED_KEY];
            section.dealers = section.dealers.filter((d) => d.key !== UNASSIGNED_KEY);
          }
        }

        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [p.year, p.role, p.sellerId, p.sellerEmail, p.sellerInitials, visibleSellers, p.showAllSellers]);

  return { data, loading, error, sellers: visibleSellers };
}
