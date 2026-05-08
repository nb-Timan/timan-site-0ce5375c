/**
 * Read-only aggregator for the CRM Budget Dashboard.
 *
 * Pulls existing CRM services and groups everything by:
 *   sellerEmail → quarter (1..4) → machineKey → CellAgg
 *
 * No writes. No new tables. Pricing/PDF/email/n8n/auth untouched.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BUDGET_SELLERS,
  listBudgetLines,
  listForecasts,
  listSalesActuals,
  type BudgetSellerRef,
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
import type { PortalRole } from "@/lib/portalAccess";

export type Quarter = 1 | 2 | 3 | 4;
export type MachineKey = "RC-751" | "RC-1000s" | "Timan 3330" | "Timan 2620";

export const DASHBOARD_MACHINES: MachineKey[] = [
  "RC-751",
  "RC-1000s",
  "Timan 3330",
  "Timan 2620",
];

export interface SellerDisplay extends BudgetSellerRef {
  display_name: string;
}

/** Display-name mapping requested by the brief (initials → first name). */
const SELLER_DISPLAY: Record<string, string> = {
  AKR: "Alexander",
  BP: "Birger",
  EM: "Esben",
  JTN: "Jakob",
  NB: "Nicolai",
};

export const DASHBOARD_SELLERS: SellerDisplay[] = BUDGET_SELLERS
  .map((s) => ({ ...s, display_name: SELLER_DISPLAY[s.initials] || s.initials }))
  .sort((a, b) => a.display_name.localeCompare(b.display_name, "da"));

export type CellItemKind = "lead" | "quote" | "order";

export interface CellDetailItem {
  kind: CellItemKind;
  id: string;
  title: string;
  dealer: string | null;
  status: string | null;
  machine: string | null;
  date: string | null; // ISO
  sellerLabel: string | null;
  /** Internal route to navigate to. */
  href: string;
}

export interface CellAgg {
  budgetQty: number;
  orderQty: number;
  workingQty: number;
  items: CellDetailItem[];
}

export type DashboardData = Record<string, Record<Quarter, Record<MachineKey, CellAgg>>>;

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

function emptySellerData(): Record<Quarter, Record<MachineKey, CellAgg>> {
  const out = {} as Record<Quarter, Record<MachineKey, CellAgg>>;
  for (const q of [1, 2, 3, 4] as Quarter[]) {
    out[q] = {} as Record<MachineKey, CellAgg>;
    for (const m of DASHBOARD_MACHINES) out[q][m] = emptyCell();
  }
  return out;
}

/** Resolve a seller_email / initials / id from a quote/order row to one of our 5 seller emails. */
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
  // fuzzy: owner_name starts with initials (e.g. "BP - Birger Pedersen")
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
        || (p.sellerInitials && upper(s.initials) === upper(p.sellerInitials)),
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
        const [lines, forecasts, actuals, leads, quotesRes, ordersRes] = await Promise.all([
          listBudgetLines({ year: p.year }),
          listForecasts(p.year),
          listSalesActuals(p.year),
          listLeads({ limit: 500 }),
          listScopedConfigurations({ ...filter, documentType: "quote" }),
          listScopedConfigurations({ ...filter, documentType: "order" }),
        ]);

        // Init empty buckets for every visible seller.
        const out: DashboardData = {};
        for (const s of visibleSellers) out[s.email] = emptySellerData();

        const sellerByEmail = new Map(visibleSellers.map((s) => [norm(s.email), s]));
        const lineById = new Map(lines.map((l) => [l.id, l]));

        // ── Budget qty per quarter ────────────────────────────────────────
        for (const l of lines) {
          if (l.category !== "machine") continue;
          const sEmail = norm(l.seller_email);
          const seller = sellerByEmail.get(sEmail);
          if (!seller) continue;
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(l.product_key));
          if (!machine) continue;
          const split = (l.monthly_split && l.monthly_split.length === 12)
            ? l.monthly_split
            : Array.from({ length: 12 }, () => 1 / 12);
          for (let m = 0; m < 12; m++) {
            const q = quarterOfMonth(m);
            out[seller.email][q][machine].budgetQty += (l.qty_budget || 0) * (split[m] || 0);
          }
        }

        // ── Orders qty per quarter from listSalesActuals (monthly_qty) ────
        for (const a of actuals) {
          const line = lineById.get(a.budget_line_id);
          if (!line) continue;
          const seller = sellerByEmail.get(norm(line.seller_email));
          if (!seller) continue;
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(line.product_key));
          if (!machine) continue;
          const monthly = a.monthly_qty || [];
          for (let m = 0; m < 12; m++) {
            const q = quarterOfMonth(m);
            out[seller.email][q][machine].orderQty += monthly[m] || 0;
          }
        }

        // ── Arbejdsbudget per quarter ─────────────────────────────────────
        // Source 1: forecast.monthly_qty mapped via budget line product/seller.
        for (const f of forecasts) {
          const line = lineById.get(f.budget_line_id);
          if (!line) continue;
          const seller = sellerByEmail.get(norm(line.seller_email));
          if (!seller) continue;
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(line.product_key));
          if (!machine) continue;
          if (Array.isArray(f.monthly_qty) && f.monthly_qty.length === 12) {
            for (let m = 0; m < 12; m++) {
              const q = quarterOfMonth(m);
              out[seller.email][q][machine].workingQty += f.monthly_qty[m] || 0;
            }
          } else if (f.qty_forecast && line.monthly_split) {
            // Spread annual forecast via line split.
            for (let m = 0; m < 12; m++) {
              const q = quarterOfMonth(m);
              out[seller.email][q][machine].workingQty += (f.qty_forecast || 0) * (line.monthly_split[m] || 0);
            }
          }
        }

        // Source 2: leads "moved to working" — also feeds drilldown.
        const contribs = buildLeadWorkingContributions(leads).filter((c) => c.year === p.year);
        for (const c of contribs) {
          const machine = DASHBOARD_MACHINES.find((m) => norm(m) === norm(c.product_key));
          if (!machine) continue;
          const sellerEmail = leadOwnerEmail(c, visibleSellers);
          if (!sellerEmail || !out[sellerEmail]) continue;
          const q = quarterOfMonth(c.month_idx);
          out[sellerEmail][q][machine].workingQty += c.qty || 0;
          out[sellerEmail][q][machine].items.push({
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

        // ── Drilldown enrichment from quotes & orders ─────────────────────
        for (const r of (quotesRes.rows || [])) {
          const sellerEmail = matchSellerEmail(r, visibleSellers);
          if (!sellerEmail || !out[sellerEmail]) continue;
          const machine = machineFromKeys(r.machine_keys);
          if (!machine) continue;
          const d = r.month_iso ? new Date(r.month_iso) : null;
          if (!d || isNaN(d.getTime()) || d.getFullYear() !== p.year) continue;
          const q = quarterOfMonth(d.getMonth());
          out[sellerEmail][q][machine].items.push({
            kind: "quote",
            id: r.id,
            title: r.title || r.quote_number || "Tilbud",
            dealer: r.dealer_company_name || r.dealer_name || r.dealer_number || null,
            status: r.case_status || "tilbud",
            machine,
            date: r.month_iso,
            sellerLabel: r.seller_initials || r.seller_email || null,
            href: `/portal/crm/quotes?focus=${encodeURIComponent(r.id)}`,
          });
        }

        for (const r of (ordersRes.rows || [])) {
          const sellerEmail = matchSellerEmail(r, visibleSellers);
          if (!sellerEmail || !out[sellerEmail]) continue;
          const machine = machineFromKeys(r.machine_keys);
          if (!machine) continue;
          const d = r.month_iso ? new Date(r.month_iso) : null;
          if (!d || isNaN(d.getTime()) || d.getFullYear() !== p.year) continue;
          const q = quarterOfMonth(d.getMonth());
          out[sellerEmail][q][machine].items.push({
            kind: "order",
            id: r.id,
            title: r.title || r.order_number || "Ordre",
            dealer: r.dealer_company_name || r.dealer_name || r.dealer_number || null,
            status: r.case_status || "ordre",
            machine,
            date: r.month_iso,
            sellerLabel: r.seller_initials || r.seller_email || null,
            href: `/portal/crm/orders?focus=${encodeURIComponent(r.id)}`,
          });
        }

        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [p.year, p.role, p.sellerId, p.sellerEmail, p.sellerInitials, visibleSellers]);

  return { data, loading, error, sellers: visibleSellers };
}
