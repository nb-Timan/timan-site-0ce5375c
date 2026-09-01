/**
 * Budget Dashboard — celle-detalje popover.
 *
 * Viser HVAD tallene i en celle består af:
 *  • Summary (Budget / Arbejdsbudget / Realiseret / Diff / Referencer)
 *  • Sektioner: Ordrer · Tilbud · Leads · Demoer · Budgetreferencer
 *
 * Read-only. Posterne er klikbare (åbner respektive CRM-detaljeruter).
 * Bruger SAMME data som dashboard-cellen (items pushed under enrich) +
 * lazy-fetch af budgetreferencer og demoer scoped til forhandler + kvartal + model.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/types/configurator";
import type {
  CellAgg, CellDetailItem, DealerRow, MachineKey, Quarter, SellerDisplay,
} from "./useBudgetDashboardData";
import {
  listBudgetReferences, type BudgetReference,
} from "@/lib/budgetReferencesService";
import { listDemoLeads, formatDemoNo, type CrmDemoLead } from "@/lib/crmLeadsService";

interface Props {
  open: boolean;
  onClose: () => void;
  seller: SellerDisplay | null;
  dealer: DealerRow | null;
  quarter: Quarter | null;
  machine: MachineKey | null;
  cell: CellAgg | null;
  year: number;
}

const LT: Record<string, Record<Language, string>> = {
  quarter:        { da: 'kvartal', en: 'quarter', de: 'Quartal', it: 'trimestre', hu: 'negyedév' },
  budget:         { da: 'Budget',  en: 'Budget',  de: 'Budget',  it: 'Budget',    hu: 'Terv' },
  arbejdsbudget:  { da: 'Arbejdsbudget', en: 'Working', de: 'Arbeitsbudget', it: 'Lavoro', hu: 'Munka' },
  realised:       { da: 'Realiseret', en: 'Realised', de: 'Realisiert', it: 'Realizzato', hu: 'Megvalósult' },
  diff:           { da: 'Difference', en: 'Diff', de: 'Diff', it: 'Diff', hu: 'Diff' },
  refs:           { da: 'Referencer', en: 'References', de: 'Referenzen', it: 'Riferimenti', hu: 'Hivatkozások' },
  sec_orders:     { da: 'Ordrer', en: 'Orders', de: 'Aufträge', it: 'Ordini', hu: 'Rendelések' },
  sec_quotes:     { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Árajánlatok' },
  sec_leads:      { da: 'Leads',  en: 'Leads',  de: 'Leads',    it: 'Lead',      hu: 'Lead-ek' },
  sec_demos:      { da: 'Demoer', en: 'Demos',  de: 'Demos',    it: 'Demo',      hu: 'Demók' },
  sec_refs:       { da: 'Budgetreferencer', en: 'Budget references', de: 'Budget-Referenzen', it: 'Riferimenti budget', hu: 'Költségvetési hivatkozások' },
  none_orders:    { da: 'Ingen ordrer', en: 'No orders', de: 'Keine Aufträge', it: 'Nessun ordine', hu: 'Nincs rendelés' },
  none_quotes:    { da: 'Ingen tilbud', en: 'No quotes', de: 'Keine Angebote', it: 'Nessun preventivo', hu: 'Nincs árajánlat' },
  none_leads:     { da: 'Ingen leads',  en: 'No leads',  de: 'Keine Leads',    it: 'Nessun lead',     hu: 'Nincs lead' },
  none_demos:     { da: 'Ingen demoer', en: 'No demos',  de: 'Keine Demos',    it: 'Nessuna demo',    hu: 'Nincs demó' },
  none_refs:      { da: 'Ingen referencer', en: 'No references', de: 'Keine Referenzen', it: 'Nessun riferimento', hu: 'Nincs hivatkozás' },
  no_activity:    { da: 'Ingen aktivitet i denne celle.', en: 'No activity in this cell.', de: 'Keine Aktivität.', it: 'Nessuna attività.', hu: 'Nincs tevékenység.' },
  uncertain:      { da: 'Usikkert match (gammel reference uden kontonr.)', en: 'Uncertain match (legacy reference)', de: 'Unsicher', it: 'Incerto', hu: 'Bizonytalan' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return iso; }
}
function fmtQty(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function quarterMonths(q: Quarter): number[] {
  const start = (q - 1) * 3;
  return [start, start + 1, start + 2];
}
function refMatchesMachine(r: BudgetReference, machine: MachineKey): boolean {
  // Streng model-match (samme regel som DealerBudgetHistory):
  //   product_code === product_key  ELLER
  //   product_code === item_number  ELLER
  //   model_name   === product_name
  // Her bruger vi MachineKey som product_key/product_name proxy, normaliseret.
  // Ingen substring-matching — undgår at RC-751-refs lækker ind på RC-1000s.
  const m = norm(machine);
  if (!m) return false;
  if (r.product_code && norm(r.product_code) === m) return true;
  if (r.model_name && norm(r.model_name) === m) return true;
  return false;
}


interface RefRow { row: BudgetReference; uncertain: boolean }

export default function CellDetailDialog({
  open, onClose, seller, dealer, quarter, machine, cell, year,
}: Props) {
  const { language: lang } = useLanguage();
  const [refs, setRefs] = useState<BudgetReference[]>([]);
  const [demos, setDemos] = useState<CrmDemoLead[]>([]);
  const [loading, setLoading] = useState(false);

  // Load references + demos only when dialog opens (and re-load on cell change).
  useEffect(() => {
    if (!open || !dealer || !machine || !quarter) {
      setRefs([]); setDemos([]); return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listBudgetReferences({ year, limit: 1000 }).catch(() => []),
      listDemoLeads({ limit: 500, payload: "summary" }).catch(() => []),
    ]).then(([r, d]) => {
      if (cancelled) return;
      setRefs(r); setDemos(d);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, dealer, machine, quarter, year]);

  const orders = useMemo<CellDetailItem[]>(() => (cell?.items || []).filter(i => i.kind === "order"), [cell]);
  const quotes = useMemo<CellDetailItem[]>(() => (cell?.items || []).filter(i => i.kind === "quote"), [cell]);
  const leads  = useMemo<CellDetailItem[]>(() => (cell?.items || []).filter(i => i.kind === "lead"),  [cell]);

  const scopedRefs = useMemo<RefRow[]>(() => {
    if (!dealer || !machine || !quarter) return [];
    const months = new Set(quarterMonths(quarter));
    const acct = (dealer.account_number || "").trim();
    const nameKey = norm(dealer.name);
    const out: RefRow[] = [];
    for (const r of refs) {
      if (r.month_idx == null || !months.has(r.month_idx)) continue;
      if (!refMatchesMachine(r, machine)) continue;
      const rAcct = (r.dealer_account_number || "").trim();
      let dealerMatch: "primary" | "fallback" | null = null;
      if (rAcct && acct && rAcct === acct) dealerMatch = "primary";
      else if (!rAcct && r.dealer_name && nameKey) {
        const firstPart = r.dealer_name.split("·")[0]?.trim() || r.dealer_name;
        if (norm(firstPart) === nameKey) dealerMatch = "fallback";
      }
      if (!dealerMatch) continue;
      out.push({ row: r, uncertain: dealerMatch === "fallback" });
    }
    return out;
  }, [refs, dealer, machine, quarter]);

  const scopedDemos = useMemo<CrmDemoLead[]>(() => {
    if (!dealer || !machine) return [];
    const nameKey = norm(dealer.name);
    if (!nameKey) return [];
    const m = norm(machine);
    return demos.filter((d) => {
      if (norm(d.dealer_company) !== nameKey) return false;
      const haystack = [d.demo_machine, ...(d.machine_category || [])]
        .filter(Boolean).map((x) => norm(x as string)).join("|");
      return haystack.includes(m);
    });
  }, [demos, dealer, machine]);

  const refTotalQty = scopedRefs.reduce((s, r) => s + (r.row.delta_qty != null ? Math.max(0, Math.trunc(r.row.delta_qty)) : 0), 0);
  const budgetQ = cell?.budgetQty ?? 0;
  const workingQ = cell?.workingQty ?? 0;
  const orderQ = cell?.orderQty ?? 0;
  const diff = orderQ - budgetQ;
  const totallyEmpty =
    budgetQ === 0 && workingQ === 0 && orderQ === 0 &&
    orders.length === 0 && quotes.length === 0 && leads.length === 0 &&
    scopedDemos.length === 0 && scopedRefs.length === 0;

  const title = [
    dealer?.name || seller?.display_name || "—",
    quarter ? `${quarter}. ${LT.quarter[lang]}` : "",
    machine || "",
  ].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <SummaryBadge label={LT.budget[lang]} value={fmtQty(budgetQ)} tone="slate" />
          <SummaryBadge label={LT.arbejdsbudget[lang]} value={fmtQty(workingQ)} tone="sky" />
          <SummaryBadge label={LT.realised[lang]} value={fmtQty(orderQ)} tone="emerald" />
          <SummaryBadge
            label={LT.diff[lang]}
            value={(diff > 0 ? "+" : "") + fmtQty(diff)}
            tone={diff >= 0 ? "emerald" : "rose"}
          />
          <SummaryBadge label={LT.refs[lang]} value={fmtQty(refTotalQty)} tone="amber" />
        </div>

        <div className="mt-4 space-y-4">
          {totallyEmpty && !loading && (
            <div className="text-sm text-slate-500 italic py-3">{LT.no_activity[lang]}</div>
          )}

          <Section title={LT.sec_orders[lang]}>
            {orders.length === 0 ? <Empty>{LT.none_orders[lang]}</Empty> : (
              <ItemList items={orders} onClose={onClose} />
            )}
          </Section>

          <Section title={LT.sec_quotes[lang]}>
            {quotes.length === 0 ? <Empty>{LT.none_quotes[lang]}</Empty> : (
              <ItemList items={quotes} onClose={onClose} />
            )}
          </Section>

          <Section title={LT.sec_leads[lang]}>
            {leads.length === 0 ? <Empty>{LT.none_leads[lang]}</Empty> : (
              <ItemList items={leads} onClose={onClose} />
            )}
          </Section>

          <Section title={LT.sec_demos[lang]}>
            {loading && scopedDemos.length === 0 ? (
              <Empty>…</Empty>
            ) : scopedDemos.length === 0 ? (
              <Empty>{LT.none_demos[lang]}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {scopedDemos.map((d) => (
                  <li key={d.id}>
                    <Link
                      to={`/portal/crm/demo-leads/${d.id}`}
                      onClick={onClose}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">
                          {d.demo_no ? formatDemoNo(d.demo_no) + " · " : ""}
                          {d.title || d.customer_name || "Demo"}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {[d.dealer_company, d.demo_machine, fmtDate(d.demo_date)].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={LT.sec_refs[lang]}>
            {loading && scopedRefs.length === 0 ? (
              <Empty>…</Empty>
            ) : scopedRefs.length === 0 ? (
              <Empty>{LT.none_refs[lang]}</Empty>
            ) : (
              <ul className="space-y-1.5">
                {scopedRefs.map(({ row: r, uncertain }) => {
                  const qty = r.delta_qty != null ? Math.max(0, Math.trunc(r.delta_qty)) : 0;
                  const dealerLabel = r.dealer_name ? r.dealer_name.split("·")[0]?.trim() || r.dealer_name : "—";
                  const target =
                    r.lead_id ? `/portal/crm/leads/${r.lead_id}` :
                    r.demo_id ? `/portal/crm/demo-leads/${r.demo_id}` :
                    null;
                  const inner = (
                    <div className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="text-slate-900">
                          <span className="font-semibold tabular-nums">{qty} stk.</span>
                          <span className="text-slate-400"> · </span>
                          <span>{dealerLabel}</span>
                          {r.contact_name && <><span className="text-slate-400"> · </span><span>{r.contact_name}</span></>}
                          {r.lead_id && <><span className="text-slate-400"> · </span><span>Lead {r.lead_id}</span></>}
                          {r.demo_id && <><span className="text-slate-400"> · </span><span>Demo {r.demo_id}</span></>}
                          {!r.lead_id && !r.demo_id && <span className="text-slate-400"> · uden lead</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{r.model_name || r.product_code || machine}</span>
                          <span className="text-slate-400">·</span>
                          <span>{r.budget_type === "arbejdsbudget" ? LT.arbejdsbudget[lang] : LT.budget[lang]}</span>
                          {r.note && <><span className="text-slate-400">·</span><span className="truncate max-w-[280px]" title={r.note}>{r.note}</span></>}
                          {uncertain && (
                            <span className="inline-flex items-center gap-1 text-amber-700" title={LT.uncertain[lang]}>
                              <AlertTriangle className="h-3 w-3" /> usikkert match
                            </span>
                          )}
                        </div>
                      </div>
                      {target && <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-1" />}
                    </div>
                  );
                  return (
                    <li key={r.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      {target ? (
                        <Link to={target} onClick={onClose} className="block hover:bg-slate-50">{inner}</Link>
                      ) : inner}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryBadge({ label, value, tone }: {
  label: string; value: string;
  tone: "slate" | "sky" | "emerald" | "rose" | "amber";
}) {
  const toneCls: Record<string, string> = {
    slate:   "bg-slate-100 text-slate-700 border-slate-200",
    sky:     "bg-sky-50 text-sky-800 border-sky-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    rose:    "bg-rose-50 text-rose-800 border-rose-200",
    amber:   "bg-amber-50 text-amber-800 border-amber-200",
  };
  return (
    <Badge variant="outline" className={`text-[11px] font-semibold ${toneCls[tone]}`}>
      <span className="opacity-70 mr-1">{label}:</span>
      <span className="tabular-nums">{value}</span>
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1.5">{title}</h4>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-slate-400 italic px-1">{children}</div>;
}

function ItemList({ items, onClose }: { items: CellDetailItem[]; onClose: () => void }) {
  return (
    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
      {items.map((it, i) => (
        <li key={`${it.kind}-${it.id}-${i}`}>
          <Link
            to={it.href}
            onClick={onClose}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate">{it.title}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {[it.dealer, it.machine, it.status, fmtDate(it.date), it.sellerLabel]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
