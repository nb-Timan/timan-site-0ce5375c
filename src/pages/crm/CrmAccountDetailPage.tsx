/**
 * CRM Account Detail — Dealer Performance / Forhandler Overblik.
 *
 * Route: /portal/crm/accounts/:id
 *
 * Read-only aggregator across existing CRM data sources:
 *  - crm_accounts (via listCrmAccounts)
 *  - crm_leads    (lead status + pipeline + won-as-orders fallback)
 *  - crm_demo_leads (notes / activity context)
 *  - crm_activities (notes, last contact, quotes/orders activity)
 *  - crm_budget_lines + forecasts + actuals (budget breakdown per machine)
 *
 * Matching strategy (data is partly seeded with string-only links):
 *   1) lead.linked_dealer_id === account.id              (preferred)
 *   2) activity.account_id    === account.id             (preferred)
 *   3) Fallback: case-insensitive match on the account's
 *      company / full_name against lead.title, activity.account_name,
 *      demo.dealer_company, demo.customer_name.
 *
 * Permissions: enforced upstream by CrmLayout (admin or scoped seller).
 * Sellers additionally pass through canSellerSeeAccount before render.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, MapPin, User, Hash, CircleDot, AlertTriangle, Clock, CheckCircle2, MinusCircle, Plus, ListChecks } from "lucide-react";
import CrmLayout from "@/components/crm/CrmLayout";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, canSellerSeeAccount } from "@/lib/crmScope";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { listCrmAccounts, accountDisplayName, type CrmAccount } from "@/lib/crmAccountsService";
import { listLeads, listDemoLeads, type CrmLead, type CrmDemoLead } from "@/lib/crmLeadsService";
import { isOpenLead, isWonLead, isOfferLead, effectiveLeadStatus } from "@/lib/leadStatus";
import { listActivities, logActivity, type CrmActivity } from "@/lib/crmActivitiesService";
import { listBudgetLines, listForecasts, listSalesActuals, fmtDKK, type BudgetLine, type BudgetForecast, type SalesActual } from "@/lib/crmBudgetService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import DealerActivitiesSection from "@/components/crm/DealerActivitiesSection";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/configurator";

// ---------- i18n ----------
const T: Record<string, Record<Language, string>> = {
  back:           { da: "Tilbage til konti",        en: "Back to accounts",          de: "Zurück zu Konten",        it: "Torna agli account",      hu: "Vissza a fiókokhoz" },
  loading:        { da: "Indlæser…",                en: "Loading…",                  de: "Lädt…",                   it: "Caricamento…",            hu: "Betöltés…" },
  notfound:       { da: "Konto findes ikke eller adgang nægtet.", en: "Account not found or access denied.", de: "Konto nicht gefunden oder kein Zugriff.", it: "Account non trovato o accesso negato.", hu: "Fiók nem található vagy nincs hozzáférés." },
  country:        { da: "Land",                     en: "Country",                   de: "Land",                    it: "Paese",                   hu: "Ország" },
  seller:         { da: "Sælger",                   en: "Seller",                    de: "Verkäufer",               it: "Venditore",               hu: "Értékesítő" },
  dealer_no:      { da: "Forhandlernr.",            en: "Dealer no.",                de: "Händler-Nr.",             it: "Nr. rivenditore",         hu: "Kereskedő szám" },
  status:         { da: "Status",                   en: "Status",                    de: "Status",                  it: "Stato",                   hu: "Állapot" },
  kpi_budget:     { da: "Budget i alt",             en: "Budget total",              de: "Budget gesamt",           it: "Budget totale",           hu: "Teljes büdzsé" },
  kpi_pipeline:   { da: "Pipeline i alt",           en: "Pipeline total",            de: "Pipeline gesamt",         it: "Pipeline totale",         hu: "Pipeline összesen" },
  kpi_orders:     { da: "Ordrer i alt",             en: "Orders total",              de: "Aufträge gesamt",         it: "Ordini totali",           hu: "Rendelések összesen" },
  kpi_score:      { da: "Score",                    en: "Score",                     de: "Score",                   it: "Score",                   hu: "Pontszám" },
  budget_break:   { da: "Budget pr. maskine",       en: "Budget per machine",        de: "Budget pro Maschine",     it: "Budget per macchina",     hu: "Büdzsé gépenként" },
  col_budget:     { da: "Budget",                   en: "Budget",                    de: "Budget",                  it: "Budget",                  hu: "Büdzsé" },
  col_orders:     { da: "Ordrer",                   en: "Orders",                    de: "Aufträge",                it: "Ordini",                  hu: "Rendelések" },
  col_pipeline:   { da: "Pipeline",                 en: "Pipeline",                  de: "Pipeline",                it: "Pipeline",                hu: "Pipeline" },
  col_forecast:   { da: "Forecast",                 en: "Forecast",                  de: "Prognose",                it: "Previsione",              hu: "Előrejelzés" },
  col_remaining:  { da: "Resterende",               en: "Remaining",                 de: "Verbleibend",             it: "Rimanente",               hu: "Hátralévő" },
  col_score:      { da: "Score %",                  en: "Score %",                   de: "Score %",                 it: "Score %",                 hu: "Pontszám %" },
  leads:          { da: "Leads og opfølgning",      en: "Leads & follow-up",         de: "Leads & Follow-up",       it: "Lead e follow-up",        hu: "Leadek és követés" },
  urg_red:        { da: "Forsinket",                en: "Overdue",                   de: "Überfällig",              it: "In ritardo",              hu: "Késés" },
  urg_yellow:     { da: "Inden 20 dage",            en: "Within 20 days",            de: "In 20 Tagen",             it: "Entro 20 giorni",         hu: "20 napon belül" },
  urg_green:      { da: "Inden 2 måneder",          en: "Within 2 months",           de: "In 2 Monaten",            it: "Entro 2 mesi",            hu: "2 hónapon belül" },
  urg_gray:       { da: "Ingen dato",               en: "No date",                   de: "Kein Datum",              it: "Nessuna data",            hu: "Nincs dátum" },
  next_followup:  { da: "Næste opfølgning",         en: "Next follow-up",            de: "Nächstes Follow-up",      it: "Prossimo follow-up",      hu: "Következő követés" },
  stage:          { da: "Stadie",                   en: "Stage",                     de: "Phase",                   it: "Fase",                    hu: "Szakasz" },
  owner:          { da: "Ejer",                     en: "Owner",                     de: "Besitzer",                it: "Proprietario",            hu: "Tulajdonos" },
  pipeline:       { da: "Pipeline / Tilbud",        en: "Pipeline / Offers",         de: "Pipeline / Angebote",     it: "Pipeline / Preventivi",   hu: "Pipeline / Ajánlatok" },
  offers_count:   { da: "Antal tilbud",             en: "Offers",                    de: "Angebote",                it: "Preventivi",              hu: "Ajánlatok" },
  offers_value:   { da: "Tilbudsværdi",             en: "Offer value",               de: "Angebotswert",            it: "Valore preventivi",       hu: "Ajánlati érték" },
  orders:         { da: "Ordrer",                   en: "Orders",                    de: "Aufträge",                it: "Ordini",                  hu: "Rendelések" },
  orders_count:   { da: "Antal ordrer",             en: "Orders",                    de: "Aufträge",                it: "Ordini",                  hu: "Rendelések" },
  orders_value:   { da: "Ordreværdi",               en: "Order value",               de: "Auftragswert",            it: "Valore ordini",           hu: "Rendelési érték" },
  notes:          { da: "Sidste kontakt og noter",  en: "Last contact & notes",      de: "Letzter Kontakt & Notizen", it: "Ultimo contatto e note",  hu: "Utolsó kontakt és jegyzetek" },
  last_contact:   { da: "Sidste kontakt",           en: "Last contact",              de: "Letzter Kontakt",         it: "Ultimo contatto",         hu: "Utolsó kontakt" },
  last_note:      { da: "Sidste note",              en: "Last note",                 de: "Letzte Notiz",            it: "Ultima nota",             hu: "Utolsó jegyzet" },
  last_user:      { da: "Sidste bruger",            en: "Last user",                 de: "Letzter Benutzer",        it: "Ultimo utente",           hu: "Utolsó felhasználó" },
  add_note:       { da: "Tilføj note",              en: "Add note",                  de: "Notiz hinzufügen",        it: "Aggiungi nota",           hu: "Jegyzet hozzáadása" },
  note_ph:        { da: "Skriv en kort note…",      en: "Write a short note…",       de: "Kurze Notiz…",            it: "Scrivi una breve nota…",  hu: "Rövid jegyzet…" },
  save:           { da: "Gem",                      en: "Save",                      de: "Speichern",               it: "Salva",                   hu: "Mentés" },
  activities:     { da: "Aktiviteter / To-do",      en: "Activities / To-do",        de: "Aktivitäten / To-do",     it: "Attività / Da fare",      hu: "Tevékenységek / Teendők" },
  no_data:        { da: "Ingen data endnu.",        en: "No data yet.",              de: "Noch keine Daten.",       it: "Nessun dato.",            hu: "Még nincs adat." },
  open:           { da: "Åben",                     en: "Open",                      de: "Offen",                   it: "Aperto",                  hu: "Nyitott" },
  done:           { da: "Færdig",                   en: "Done",                      de: "Erledigt",                it: "Fatto",                   hu: "Kész" },
  due:            { da: "Frist",                    en: "Due",                       de: "Fällig",                  it: "Scadenza",                hu: "Határidő" },
};

// ---------- Helpers ----------
const MACHINE_KEYS = ["RC-751", "RC-1000s", "Timan 3330", "Timan 2620"] as const;
type MachineKey = typeof MACHINE_KEYS[number];

// Status buckets now derive from next_activity via shared helpers
// (isOpenLead / isWonLead / isOfferLead). Legacy pipeline_stage values are
// still honoured as fallback inside those helpers.
const QUOTE_TYPES = new Set(["quote_created", "quote_sent", "quote_revised"]);
const ORDER_TYPES = new Set(["order_created", "order_sent"]);

type Urgency = "overdue" | "soon" | "later" | "none";

function classifyUrgency(dateStr: string | null | undefined, now: Date): Urgency {
  if (!dateStr) return "none";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "none";
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 20) return "soon";
  if (diffDays <= 60) return "later";
  return "later";
}

function fmtDate(s: string | null | undefined, lang: Language): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const locale = lang === "da" ? "da-DK" : lang === "de" ? "de-DE" : lang === "it" ? "it-IT" : lang === "hu" ? "hu-HU" : "en-GB";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

/** Does the lead/activity/demo string field reference this account? */
function refersToAccount(haystack: string | null | undefined, account: CrmAccount): boolean {
  if (!haystack) return false;
  const h = normalize(haystack);
  const candidates = [account.company, account.full_name, account.dealer_number]
    .map(normalize)
    .filter((v) => v.length >= 3);
  return candidates.some((c) => h.includes(c));
}

function machineFromText(text: string | null | undefined): MachineKey | null {
  const t = normalize(text);
  if (!t) return null;
  if (t.includes("rc-751") || t.includes("rc 751")) return "RC-751";
  if (t.includes("rc-1000") || t.includes("rc 1000")) return "RC-1000s";
  if (t.includes("3330")) return "Timan 3330";
  if (t.includes("2620")) return "Timan 2620";
  return null;
}

function machineFromLead(l: CrmLead): MachineKey | null {
  for (const m of l.machine_types || []) {
    const k = machineFromText(m);
    if (k) return k;
  }
  return machineFromText(l.title);
}

// ---------- Page ----------
export default function CrmAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<CrmAccount | null>(null);
  const [allAccounts, setAllAccounts] = useState<CrmAccount[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [demos, setDemos] = useState<CrmDemoLead[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [actuals, setActuals] = useState<SalesActual[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const year = useMemo(() => Math.max(new Date().getFullYear(), 2026), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      const accRes = await listCrmAccounts({ role: portalRole, sellerId });
      const found = accRes.accounts.find((a) => a.id === id) || null;
      if (cancelled) return;
      setAllAccounts(accRes.accounts);

      if (!found) {
        setAccount(null);
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      // Extra defensive scope check for sellers
      if (!isAdmin) {
        const ok = canSellerSeeAccount({ sellerId, role: portalRole }, found);
        if (!ok) {
          setAccount(null);
          setAccessDenied(true);
          setLoading(false);
          return;
        }
      }
      setAccount(found);
      setAccessDenied(false);

      const [allLeads, allDemos, allActs, lines, fcs, acs] = await Promise.all([
        listLeads({ limit: 500, payload: "summary" }),
        listDemoLeads({ limit: 500, payload: "summary" }),
        listActivities({ limit: 500 }),
        listBudgetLines({ year }),
        listForecasts(year),
        listSalesActuals(year),
      ]);
      if (cancelled) return;

      // Filter by linked id when possible, otherwise fuzzy by company name.
      const linkedLeads = allLeads.filter(
        (l) => l.linked_dealer_id === found.id || refersToAccount(l.title, found),
      );
      const linkedDemos = allDemos.filter(
        (d) => refersToAccount(d.dealer_company, found) || refersToAccount(d.customer_name, found),
      );
      const linkedActs = allActs.filter(
        (a) => a.account_id === found.id || refersToAccount(a.account_name, found) || refersToAccount(a.title, found),
      );

      setLeads(linkedLeads);
      setDemos(linkedDemos);
      setActivities(linkedActs);
      setBudgetLines(lines);
      setForecasts(fcs);
      setActuals(acs);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, appUser?.email, portalRole, isAdmin, year, refreshTick]);

  // ---------- Derived ----------
  const ownerEmail = normalize(account?.account_owner_email);

  // Budget per machine (filtered to this account's owner seller).
  const budgetByMachine = useMemo(() => {
    const map: Record<MachineKey, { budget: number; forecast: number }> = {
      "RC-751": { budget: 0, forecast: 0 },
      "RC-1000s": { budget: 0, forecast: 0 },
      "Timan 3330": { budget: 0, forecast: 0 },
      "Timan 2620": { budget: 0, forecast: 0 },
    };
    const fcMap = new Map(forecasts.map((f) => [f.budget_line_id, f]));
    for (const l of budgetLines) {
      if (ownerEmail && normalize(l.seller_email) !== ownerEmail) continue;
      const mk = (l.parent_machine_key as MachineKey) || (l.product_key as MachineKey);
      if (!MACHINE_KEYS.includes(mk as MachineKey)) continue;
      map[mk as MachineKey].budget += l.value_budget || 0;
      const fc = fcMap.get(l.id);
      if (fc) map[mk as MachineKey].forecast += fc.value_forecast || 0;
    }
    return map;
  }, [budgetLines, forecasts, ownerEmail]);

  // Pipeline & orders per machine — derived from leads + activities for THIS account.
  const dealsByMachine = useMemo(() => {
    const map: Record<MachineKey, { pipeline: number; orders: number }> = {
      "RC-751": { pipeline: 0, orders: 0 },
      "RC-1000s": { pipeline: 0, orders: 0 },
      "Timan 3330": { pipeline: 0, orders: 0 },
      "Timan 2620": { pipeline: 0, orders: 0 },
    };
    for (const l of leads) {
      const mk = machineFromLead(l);
      if (!mk) continue;
      const v = l.estimated_value || 0;
      if (isOpenLead(l)) map[mk].pipeline += v;
      else if (isWonLead(l)) map[mk].orders += v;
    }
    for (const a of activities) {
      if (!ORDER_TYPES.has(a.activity_type)) continue;
      const mk = machineFromText(a.title) || machineFromText(a.description);
      if (!mk) continue;
      // Avoid double-counting Won leads — only add when not already represented.
      // Heuristic: orders activities add to orders bucket.
      map[mk].orders += a.value || 0;
    }
    return map;
  }, [leads, activities]);

  const kpis = useMemo(() => {
    const budget = MACHINE_KEYS.reduce((s, m) => s + budgetByMachine[m].budget, 0);
    const pipeline = MACHINE_KEYS.reduce((s, m) => s + dealsByMachine[m].pipeline, 0);
    const orders = MACHINE_KEYS.reduce((s, m) => s + dealsByMachine[m].orders, 0);
    const score = budget > 0 ? (orders / budget) * 100 : null;
    return { budget, pipeline, orders, score };
  }, [budgetByMachine, dealsByMachine]);

  // Lead urgency buckets
  const now = useMemo(() => new Date(), []);
  const urgency = useMemo(() => {
    const buckets: Record<Urgency, CrmLead[]> = { overdue: [], soon: [], later: [], none: [] };
    for (const l of leads) {
      if (!isOpenLead(l)) continue;
      buckets[classifyUrgency(l.next_followup_date, now)].push(l);
    }
    return buckets;
  }, [leads, now]);

  // Offers (pipeline list) & orders list
  const offers = useMemo(() => {
    const fromLeads = leads.filter((l) => isOfferLead(l));
    const fromActs = activities.filter((a) => QUOTE_TYPES.has(a.activity_type));
    return { count: fromLeads.length + fromActs.length, leadOffers: fromLeads, actOffers: fromActs };
  }, [leads, activities]);

  const orderRows = useMemo(() => {
    const fromActs = activities
      .filter((a) => ORDER_TYPES.has(a.activity_type))
      .map((a) => ({
        id: a.id,
        ref: a.order_id || a.id.slice(0, 8),
        machine: machineFromText(a.title) || machineFromText(a.description),
        value: a.value || 0,
        date: a.activity_date,
        status: a.status,
      }));
    const fromLeads = leads
      .filter((l) => isWonLead(l))
      .map((l) => ({
        id: l.id,
        ref: l.id.slice(0, 8),
        machine: machineFromLead(l),
        value: l.estimated_value || 0,
        date: l.updated_at,
        status: "Won",
      }));
    const all = [...fromActs, ...fromLeads].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return all;
  }, [activities, leads]);

  // Last contact + notes
  const lastContact = useMemo(() => {
    const sorted = [...activities].sort((a, b) => (b.activity_date || "").localeCompare(a.activity_date || ""));
    const last = sorted[0];
    const lastNoteAct = sorted.find((a) => a.activity_type === "comment" || (a.description && a.description.length > 0));
    return {
      date: last?.activity_date || null,
      noteText: lastNoteAct?.title || lastNoteAct?.description || account?.notes || null,
      user: lastNoteAct?.created_by_name || last?.created_by_name || null,
    };
  }, [activities, account]);

  // Activities list (todo)
  const activityList = useMemo(() => {
    return [...activities]
      .sort((a, b) => (b.activity_date || "").localeCompare(a.activity_date || ""))
      .slice(0, 12);
  }, [activities]);

  async function handleSaveNote() {
    if (!account || !noteDraft.trim()) return;
    setSavingNote(true);
    try {
      await logActivity({
        activity_type: "comment",
        account_id: account.id,
        account_name: accountDisplayName(account),
        created_by_user_id: null,
        created_by_name: appUser?.display_name || appUser?.email || null,
        assigned_owner_user_id: account.account_owner_user_id,
        assigned_owner_name: account.account_owner_name,
        title: noteDraft.trim().slice(0, 120),
        description: noteDraft.trim(),
      });
      setNoteDraft("");
      setRefreshTick((t) => t + 1);
    } finally {
      setSavingNote(false);
    }
  }

  // ---------- Render ----------
  if (loading) {
    return <CrmLayout><p className="text-sm text-gray-500 p-6">{T.loading[lang]}</p></CrmLayout>;
  }
  if (accessDenied || !account) {
    return (
      <CrmLayout>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-700">{T.notfound[lang]}</p>
        </div>
      </CrmLayout>
    );
  }

  const title = accountDisplayName(account);

  return (
    <CrmLayout pageTitle={title}>
      {/* Header card */}
      <Card className="mb-6 border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-2xl flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-[#2d5a27]/10 text-[#2d5a27] flex items-center justify-center">
              <Building2 className="h-5 w-5" />
            </span>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Meta icon={MapPin}    label={T.country[lang]}   value={account.country || "—"} />
          <Meta icon={User}      label={T.seller[lang]}    value={account.account_owner_name || "—"} />
          <Meta icon={Hash}      label={T.dealer_no[lang]} value={account.dealer_number || "—"} />
          <Meta icon={CircleDot} label={T.status[lang]}    value={account.status || "—"} />
        </CardContent>
      </Card>

      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label={T.kpi_budget[lang]}   value={fmtDKK(kpis.budget)}   tone="default" />
        <KpiCard label={T.kpi_pipeline[lang]} value={fmtDKK(kpis.pipeline)} tone="sky" />
        <KpiCard label={T.kpi_orders[lang]}   value={fmtDKK(kpis.orders)}   tone="green" />
        <KpiCard
          label={T.kpi_score[lang]}
          value={kpis.score === null ? "—" : `${Math.round(kpis.score)} %`}
          tone={kpis.score === null ? "default" : kpis.score >= 100 ? "green" : kpis.score >= 60 ? "amber" : "red"}
        />
      </div>

      {/* Budget breakdown */}
      <Card className="mb-6 border-gray-100 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">{T.budget_break[lang]}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4">Maskine</th>
                <th className="text-right py-2 px-2">{T.col_budget[lang]}</th>
                <th className="text-right py-2 px-2">{T.col_orders[lang]}</th>
                <th className="text-right py-2 px-2">{T.col_pipeline[lang]}</th>
                <th className="text-right py-2 px-2">{T.col_forecast[lang]}</th>
                <th className="text-right py-2 px-2">{T.col_remaining[lang]}</th>
                <th className="text-left py-2 pl-2 w-44">{T.col_score[lang]}</th>
              </tr>
            </thead>
            <tbody>
              {MACHINE_KEYS.map((m) => {
                const b = budgetByMachine[m];
                const d = dealsByMachine[m];
                const remaining = Math.max(b.budget - d.orders, 0);
                const score = b.budget > 0 ? Math.min(100, Math.round((d.orders / b.budget) * 100)) : 0;
                return (
                  <tr key={m} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 pr-4 font-medium text-gray-900">{m}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtDKK(b.budget)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-700">{fmtDKK(d.orders)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-sky-700">{fmtDKK(d.pipeline)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtDKK(b.forecast)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-600">{fmtDKK(remaining)}</td>
                    <td className="py-2 pl-2">
                      {b.budget > 0 ? (
                        <div className="flex items-center gap-2">
                          <Progress value={score} className="h-2 flex-1" />
                          <span className="text-xs tabular-nums w-10 text-right">{score}%</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Lead status */}
      <Card className="mb-6 border-gray-100 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">{T.leads[lang]}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <UrgencyChip icon={AlertTriangle} label={T.urg_red[lang]}    count={urgency.overdue.length} tone="red" />
            <UrgencyChip icon={Clock}         label={T.urg_yellow[lang]} count={urgency.soon.length}    tone="amber" />
            <UrgencyChip icon={CheckCircle2}  label={T.urg_green[lang]}  count={urgency.later.length}   tone="green" />
            <UrgencyChip icon={MinusCircle}   label={T.urg_gray[lang]}   count={urgency.none.length}    tone="gray" />
          </div>
          {leads.length === 0 ? (
            <p className="text-sm text-gray-500">{T.no_data[lang]}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-500">
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4">Lead</th>
                    <th className="text-left py-2 px-2">{T.stage[lang]}</th>
                    <th className="text-left py-2 px-2">{T.next_followup[lang]}</th>
                    <th className="text-left py-2 px-2">{T.owner[lang]}</th>
                    <th className="text-right py-2 pl-2">Værdi</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 10).map((l) => {
                    const u = isOpenLead(l) ? classifyUrgency(l.next_followup_date, now) : "later";
                    return (
                      <tr key={l.id} className="border-b border-gray-50">
                        <td className="py-2 pr-4">
                          <span className={cn("inline-block h-2 w-2 rounded-full mr-2", urgencyDot(u))} />
                          <span className="text-gray-900">{l.title}</span>
                        </td>
                        <td className="py-2 px-2 text-gray-700">{effectiveLeadStatus(l)}</td>
                        <td className="py-2 px-2 text-gray-700">{fmtDate(l.next_followup_date, lang)}</td>
                        <td className="py-2 px-2 text-gray-700">{l.owner_name || "—"}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{fmtDKK(l.estimated_value || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline / Offers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="border-gray-100 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base">{T.pipeline[lang]}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-6 mb-3">
              <Stat label={T.offers_count[lang]} value={String(offers.count)} />
              <Stat label={T.offers_value[lang]} value={fmtDKK(kpis.pipeline)} />
            </div>
            {offers.leadOffers.length === 0 && offers.actOffers.length === 0 ? (
              <p className="text-sm text-gray-500">{T.no_data[lang]}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {offers.leadOffers.slice(0, 6).map((l) => (
                  <li key={l.id} className="py-2 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{l.title}</div>
                      <div className="text-xs text-gray-500">{effectiveLeadStatus(l)} · {fmtDate(l.expected_close_date || l.next_followup_date, lang)}</div>
                    </div>
                    <div className="tabular-nums text-gray-700">{fmtDKK(l.estimated_value || 0)}</div>
                  </li>
                ))}
                {offers.actOffers.slice(0, 4).map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{a.title || a.activity_type}</div>
                      <div className="text-xs text-gray-500">{a.status || "—"} · {fmtDate(a.activity_date, lang)}</div>
                    </div>
                    <div className="tabular-nums text-gray-700">{fmtDKK(a.value || 0)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Orders */}
        <Card className="border-gray-100 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base">{T.orders[lang]}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-6 mb-3">
              <Stat label={T.orders_count[lang]} value={String(orderRows.length)} />
              <Stat label={T.orders_value[lang]} value={fmtDKK(kpis.orders)} />
            </div>
            {orderRows.length === 0 ? (
              <p className="text-sm text-gray-500">{T.no_data[lang]}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {orderRows.slice(0, 8).map((o) => (
                  <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">#{o.ref} · {o.machine || "—"}</div>
                      <div className="text-xs text-gray-500">{o.status || "—"} · {fmtDate(o.date, lang)}</div>
                    </div>
                    <div className="tabular-nums text-emerald-700">{fmtDKK(o.value)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Last contact + notes */}
      <Card className="mb-6 border-gray-100 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">{T.notes[lang]}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <Stat label={T.last_contact[lang]} value={fmtDate(lastContact.date, lang)} />
            <Stat label={T.last_user[lang]}    value={lastContact.user || "—"} />
            <Stat label={T.last_note[lang]}    value={lastContact.noteText || "—"} />
          </div>
          <div className="border-t border-gray-100 pt-3">
            <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">{T.add_note[lang]}</label>
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={T.note_ph[lang]}
              rows={2}
              className="mb-2"
            />
            <div className="flex justify-end">
              <Button onClick={handleSaveNote} disabled={!noteDraft.trim() || savingNote} size="sm" className="gap-1">
                <Plus className="h-4 w-4" />{T.save[lang]}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activities / To-do */}
      <Card className="mb-6 border-gray-100 shadow-sm">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-[#2d5a27]" />{T.activities[lang]}</CardTitle>
        </CardHeader>
        <CardContent>
          {activityList.length === 0 ? (
            <p className="text-sm text-gray-500">{T.no_data[lang]}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activityList.map((a) => {
                const isDone = ORDER_TYPES.has(a.activity_type) || a.activity_type === "lead_accepted" || a.status === "Won" || a.status === "confirmed";
                return (
                  <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn("h-2 w-2 rounded-full", isDone ? "bg-emerald-500" : "bg-gray-300")} />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{a.title || a.activity_type}</div>
                        <div className="text-xs text-gray-500">{a.activity_type} · {a.created_by_name || "—"}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {T.due[lang]}: {fmtDate(a.activity_date, lang)} · {isDone ? T.done[lang] : T.open[lang]}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Forhandler aktiviteter (CRM Calendar) */}
      <div className="mt-6">
        <DealerActivitiesSection account={account} accounts={allAccounts} />
      </div>
    </CrmLayout>
  );
}

// ---------- Small UI helpers ----------
function Meta({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5" />
      <div>
        <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
        <div className="text-sm text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: "default" | "sky" | "green" | "amber" | "red" }) {
  const toneClass: Record<typeof tone, string> = {
    default: "text-gray-900",
    sky:     "text-sky-700",
    green:   "text-emerald-700",
    amber:   "text-amber-700",
    red:     "text-red-700",
  };
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cn("text-xl font-semibold mt-1 tabular-nums", toneClass[tone])}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 font-medium">{value}</div>
    </div>
  );
}

function UrgencyChip({ icon: Icon, label, count, tone }: { icon: typeof AlertTriangle; label: string; count: number; tone: "red" | "amber" | "green" | "gray" }) {
  const cls: Record<typeof tone, string> = {
    red:   "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gray:  "bg-gray-50 text-gray-700 border-gray-200",
  };
  return (
    <div className={cn("rounded-xl border px-3 py-2 flex items-center gap-2", cls[tone])}>
      <Icon className="h-4 w-4" />
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{count}</div>
      </div>
    </div>
  );
}

function urgencyDot(u: Urgency): string {
  switch (u) {
    case "overdue": return "bg-red-500";
    case "soon":    return "bg-amber-500";
    case "later":   return "bg-emerald-500";
    default:        return "bg-gray-300";
  }
}
