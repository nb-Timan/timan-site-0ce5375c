import { Fragment, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Lock, Unlock, Plus, Trash2, Save, X, ShieldAlert, Calendar,
  Wallet, Sparkles, Edit3, Minus, ChevronDown, ChevronRight, Wrench,
} from "lucide-react";
import CrmLayout from "@/components/crm/CrmLayout";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { cn } from "@/lib/utils";
import { Language } from "@/types/configurator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BUDGET_PRODUCTS, BUDGET_SELLERS, BUDGET_BACKEND_USERS, availableYears, fmtDKK,
  listBudgetLines, listForecasts, listSalesActuals,
  createBudgetLine, deleteBudgetLine, setLineLock, upsertForecast, upsertBudgetLine,
  EQUIPMENT_BY_MACHINE, localizedName,
  type BudgetLine, type BudgetForecast, type SalesActual, findProduct,
} from "@/lib/crmBudgetService";

// ────────────────────────────────────────────────────────────
// i18n — all visible UI strings for the Budget module
// ────────────────────────────────────────────────────────────
const T: Record<string, Record<Language, string>> = {
  page_title:    { da: 'Budget',                en: 'Budget',                  de: 'Budget',                  it: 'Budget',                  hu: 'Költségvetés' },
  annual_budget: { da: 'Årligt budget',         en: 'Annual budget',           de: 'Jahresbudget',            it: 'Budget annuale',          hu: 'Éves költségvetés' },
  subtitle_admin:{ da: 'Administrer officielle budgetter, lås og se forecast på tværs af sælgere.',
                   en: 'Manage official budgets, lock entries and view forecasts across sellers.',
                   de: 'Offizielle Budgets verwalten, sperren und Prognosen über Verkäufer hinweg sehen.',
                   it: 'Gestisci i budget ufficiali, blocca le voci e visualizza le previsioni per venditore.',
                   hu: 'Hivatalos költségvetések kezelése, zárolása és előrejelzések megtekintése értékesítőnként.' },
  subtitle_seller:{da: 'Se dit eget budget og opdater dit working forecast.',
                   en: 'View your own budget and update your working forecast.',
                   de: 'Eigenes Budget einsehen und Arbeitsprognose aktualisieren.',
                   it: 'Visualizza il tuo budget e aggiorna la previsione di lavoro.',
                   hu: 'Tekintse meg saját költségvetését és frissítse a munka-előrejelzést.' },
  seller_label:  { da: 'Sælger',                en: 'Seller',                  de: 'Verkäufer',               it: 'Venditore',               hu: 'Értékesítő' },
  all_sellers:   { da: 'Alle sælgere',          en: 'All sellers',             de: 'Alle Verkäufer',          it: 'Tutti i venditori',       hu: 'Összes értékesítő' },
  my_view:       { da: 'Min egen visning',      en: 'My own view',             de: 'Eigene Ansicht',          it: 'La mia vista',            hu: 'Saját nézet' },
  backend_group: { da: 'Backend',               en: 'Backend',                 de: 'Backend',                 it: 'Backend',                 hu: 'Backend' },
  edit_working:  { da: 'Rediger arbejdsbudget', en: 'Edit working forecast',   de: 'Arbeitsprognose bearbeiten', it: 'Modifica previsione',  hu: 'Munka-előrejelzés szerkesztése' },
  cancel:        { da: 'Annuller',              en: 'Cancel',                  de: 'Abbrechen',               it: 'Annulla',                 hu: 'Mégse' },
  save_working:  { da: 'Gem arbejdsbudget',     en: 'Save working forecast',   de: 'Arbeitsprognose speichern', it: 'Salva previsione',      hu: 'Munka-előrejelzés mentése' },
  new_line:      { da: 'Ny budgetlinje',        en: 'New budget line',         de: 'Neue Budgetzeile',        it: 'Nuova riga budget',       hu: 'Új költségvetés-sor' },
  kpi_budget:    { da: 'Budget (stk.)',         en: 'Budget (qty)',            de: 'Budget (Stk.)',           it: 'Budget (pz)',             hu: 'Költségvetés (db)' },
  kpi_orders:    { da: 'Ordrer (stk.)',         en: 'Orders (qty)',            de: 'Aufträge (Stk.)',         it: 'Ordini (pz)',             hu: 'Rendelések (db)' },
  kpi_working:   { da: 'Arbejdsbudget',         en: 'Working forecast',        de: 'Arbeitsprognose',         it: 'Previsione lavoro',       hu: 'Munka-előrejelzés' },
  kpi_score:     { da: 'Score',                 en: 'Score',                   de: 'Score',                   it: 'Punteggio',               hu: 'Pontszám' },
  pcs:           { da: 'stk.',                  en: 'pcs',                     de: 'Stk.',                    it: 'pz',                      hu: 'db' },
  legend_budget: { da: 'Budget',                en: 'Budget',                  de: 'Budget',                  it: 'Budget',                  hu: 'Költségvetés' },
  legend_orders: { da: 'Ordrer',                en: 'Orders',                  de: 'Aufträge',                it: 'Ordini',                  hu: 'Rendelések' },
  legend_pipe:   { da: 'Pipeline / tilbud',     en: 'Pipeline / quotes',       de: 'Pipeline / Angebote',     it: 'Pipeline / preventivi',   hu: 'Pipeline / ajánlatok' },
  legend_work:   { da: 'Arbejdsbudget',         en: 'Working forecast',        de: 'Arbeitsprognose',         it: 'Previsione lavoro',       hu: 'Munka-előrejelzés' },
  legend_perf_n: { da: 'Performance −',         en: 'Performance −',           de: 'Performance −',           it: 'Performance −',           hu: 'Teljesítmény −' },
  legend_perf_p: { da: 'Performance +',         en: 'Performance +',           de: 'Performance +',           it: 'Performance +',           hu: 'Teljesítmény +' },
  col_model:     { da: 'Model & Kategori',      en: 'Model & Category',        de: 'Modell & Kategorie',      it: 'Modello e categoria',     hu: 'Modell és kategória' },
  col_total:     { da: 'Total',                 en: 'Total',                   de: 'Gesamt',                  it: 'Totale',                  hu: 'Összesen' },
  col_score:     { da: 'Score',                 en: 'Score',                   de: 'Score',                   it: 'Punteggio',               hu: 'Pontszám' },
  loading:       { da: 'Indlæser budget…',      en: 'Loading budget…',         de: 'Budget wird geladen…',    it: 'Caricamento budget…',     hu: 'Költségvetés betöltése…' },
  empty_year:    { da: 'Ingen budgetlinjer for dette år.', en: 'No budget lines for this year.', de: 'Keine Budgetzeilen für dieses Jahr.', it: 'Nessuna riga budget per questo anno.', hu: 'Nincsenek költségvetés-sorok ebben az évben.' },
  coming_soon:   { da: 'Kommer snart',          en: 'Coming soon',             de: 'Demnächst',               it: 'In arrivo',               hu: 'Hamarosan' },
  locked:        { da: 'Låst',                  en: 'Locked',                  de: 'Gesperrt',                it: 'Bloccato',                hu: 'Zárolt' },
  unlock:        { da: 'Lås op',                en: 'Unlock',                  de: 'Entsperren',              it: 'Sblocca',                 hu: 'Feloldás' },
  lock:          { da: 'Lås',                   en: 'Lock',                    de: 'Sperren',                 it: 'Blocca',                  hu: 'Zárolás' },
  delete_line:   { da: 'Slet linje',            en: 'Delete line',             de: 'Zeile löschen',           it: 'Elimina riga',            hu: 'Sor törlése' },
  delete_confirm:{ da: 'Slet denne budgetlinje?', en: 'Delete this budget line?', de: 'Diese Budgetzeile löschen?', it: 'Eliminare questa riga di budget?', hu: 'Törli ezt a költségvetés-sort?' },
  row_budget_orders:{ da: 'BUDGET / ORDRER',    en: 'BUDGET / ORDERS',         de: 'BUDGET / AUFTRÄGE',       it: 'BUDGET / ORDINI',         hu: 'KÖLTSÉGVETÉS / RENDELÉSEK' },
  row_pipeline:  { da: 'PIPELINE (TILBUD)',     en: 'PIPELINE (QUOTES)',       de: 'PIPELINE (ANGEBOTE)',     it: 'PIPELINE (PREVENTIVI)',   hu: 'PIPELINE (AJÁNLATOK)' },
  row_working:   { da: 'ARBEJDSBUDGET',         en: 'WORKING FORECAST',        de: 'ARBEITSPROGNOSE',         it: 'PREVISIONE DI LAVORO',    hu: 'MUNKA-ELŐREJELZÉS' },
  row_perf:      { da: 'PERFORMANCE',           en: 'PERFORMANCE',             de: 'PERFORMANCE',             it: 'PERFORMANCE',             hu: 'TELJESÍTMÉNY' },
  tip_quotes:    { da: 'tilbud',                en: 'quotes',                  de: 'Angebote',                it: 'preventivi',              hu: 'ajánlat' },
  tip_customer:  { da: 'Kunde',                 en: 'Customer',                de: 'Kunde',                   it: 'Cliente',                 hu: 'Ügyfél' },
  tip_machine:   { da: 'Maskine',               en: 'Machine',                 de: 'Maschine',                it: 'Macchina',                hu: 'Gép' },
  tip_attach:    { da: 'Redskab',               en: 'Attachment',              de: 'Anbaugerät',              it: 'Attrezzatura',            hu: 'Tartozék' },
  tip_sent:      { da: 'Sendt',                 en: 'Sent',                    de: 'Gesendet',                it: 'Inviato',                 hu: 'Elküldve' },
  modal_title:   { da: 'Ny budgetlinje',        en: 'New budget line',         de: 'Neue Budgetzeile',        it: 'Nuova riga budget',       hu: 'Új költségvetés-sor' },
  field_product: { da: 'Produkt',               en: 'Product',                 de: 'Produkt',                 it: 'Prodotto',                hu: 'Termék' },
  field_seller:  { da: 'Sælger',                en: 'Seller',                  de: 'Verkäufer',               it: 'Venditore',               hu: 'Értékesítő' },
  field_country: { da: 'Land',                  en: 'Country',                 de: 'Land',                    it: 'Paese',                   hu: 'Ország' },
  field_qty:     { da: 'Antal (qty budget)',    en: 'Quantity (budget qty)',   de: 'Menge (Budget-Menge)',    it: 'Quantità (budget)',       hu: 'Mennyiség (költségvetés)' },
  field_notes:   { da: 'Noter',                 en: 'Notes',                   de: 'Notizen',                 it: 'Note',                    hu: 'Megjegyzések' },
  placeholder_name:{ da: 'Navn',                en: 'Name',                    de: 'Name',                    it: 'Nome',                    hu: 'Név' },
  create:        { da: 'Opret',                 en: 'Create',                  de: 'Erstellen',               it: 'Crea',                    hu: 'Létrehozás' },
  cs_confirm:    { da: 'er markeret som "Kommer snart". Tilføj alligevel?',
                   en: 'is marked as "Coming soon". Add anyway?',
                   de: 'ist als "Demnächst" markiert. Trotzdem hinzufügen?',
                   it: 'è contrassegnato come "In arrivo". Aggiungere comunque?',
                   hu: '"Hamarosan" jelölésű. Mégis hozzáadja?' },
  no_access:     { da: 'Ingen adgang',          en: 'No access',               de: 'Kein Zugriff',            it: 'Nessun accesso',          hu: 'Nincs hozzáférés' },
  no_access_msg: { da: 'Budgetmodulet er kun tilgængeligt for Timan Backend og Timan Sælger.',
                   en: 'The budget module is only available to Timan Backend and Timan Sellers.',
                   de: 'Das Budgetmodul ist nur für Timan Backend und Timan Verkäufer verfügbar.',
                   it: 'Il modulo budget è disponibile solo per Timan Backend e Timan Seller.',
                   hu: 'A költségvetés modul csak Timan Backend és Timan értékesítők számára érhető el.' },
  loading_short: { da: 'Indlæser…',             en: 'Loading…',                de: 'Wird geladen…',           it: 'Caricamento…',            hu: 'Betöltés…' },
  equipment_for: { da: 'Redskaber til',         en: 'Equipment for',           de: 'Werkzeuge für',           it: 'Attrezzature per',        hu: 'Eszközök:' },
  preview_row:   { da: 'Planlægning',           en: 'Preview',                 de: 'Planung',                 it: 'Pianificazione',          hu: 'Tervezés' },
  show_equipment:{ da: 'Vis redskaber',         en: 'Show equipment',          de: 'Werkzeuge anzeigen',      it: 'Mostra attrezzature',     hu: 'Eszközök megjelenítése' },
  hide_equipment:{ da: 'Skjul redskaber',       en: 'Hide equipment',          de: 'Werkzeuge ausblenden',    it: 'Nascondi attrezzature',   hu: 'Eszközök elrejtése' },
};

// Localized month labels.
const MONTHS_BY_LANG: Record<Language, string[]> = {
  da: ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  de: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
  it: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
  hu: ['Jan','Feb','Már','Ápr','Máj','Jún','Júl','Aug','Szep','Okt','Nov','Dec'],
};

// Locale tag for date formatting.
const LOCALE_BY_LANG: Record<Language, string> = { da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU' };


const EVEN: number[] = Array.from({ length: 12 }, () => 1 / 12);

// ---------- Pipeline (sent offers) mock ----------
interface PipelineOffer {
  offer_no: string;
  dealer: string;
  machine_key: string;
  attachment: string;
  customer: string;
  value: number;
  sent_date: string; // ISO
  status: string;
}

// Deterministic pseudo-random per machine/month so values are stable across renders.
function seedRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_DEALERS = [
  "Nordsjællands Maskinforretning", "Sydjysk Have & Park", "Kirschner Maschinen GmbH",
  "Fyn Park Service", "Aarhus Grøn Pleje", "Odense Kommunale Værksted",
];
const SAMPLE_CUSTOMERS = [
  "Køge Kommune", "Roskilde Park", "Vejle Vejvæsen", "Stadt München",
  "Hamburg Grünflächen", "Hillerød Drift", "Aalborg Park & Natur",
];
const SAMPLE_ATTACHMENTS = ["Slagleklipper 1500", "Krat-skærer", "Buskrydder XL", "Kost", "Sneskraber", "Saltspreder"];
const SAMPLE_STATUSES = ["sent", "sent", "sent", "dialog", "negotiation"] as const;
const STATUS_LABELS: Record<typeof SAMPLE_STATUSES[number], Record<Language, string>> = {
  sent:        { da: 'Sendt',       en: 'Sent',         de: 'Gesendet',     it: 'Inviato',       hu: 'Elküldve' },
  dialog:      { da: 'I dialog',    en: 'In dialog',    de: 'Im Dialog',    it: 'In dialogo',    hu: 'Egyeztetés' },
  negotiation: { da: 'Forhandling', en: 'Negotiation',  de: 'Verhandlung',  it: 'Negoziazione',  hu: 'Tárgyalás' },
};

function generatePipeline(line: BudgetLine, year: number): PipelineOffer[][] {
  const months: PipelineOffer[][] = Array.from({ length: 12 }, () => []);
  const rnd = seedRand(`${line.id}|${year}|pipe`);
  // Roughly 0..2 sent offers per machine per month, weighted by season.
  const split = (line.monthly_split && line.monthly_split.length === 12) ? line.monthly_split : EVEN;
  const unit = line.qty_budget > 0 ? line.value_budget / line.qty_budget : 0;
  let counter = 1;
  for (let m = 0; m < 12; m++) {
    const intensity = split[m] * 12; // ~1 on average
    const draw = rnd();
    let count = 0;
    if (draw < 0.15 * intensity) count = 0;
    else if (draw < 0.55 * intensity) count = 1;
    else if (draw < 0.85 * intensity) count = 2;
    else count = rnd() < 0.4 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const dealer = SAMPLE_DEALERS[Math.floor(rnd() * SAMPLE_DEALERS.length)];
      const customer = SAMPLE_CUSTOMERS[Math.floor(rnd() * SAMPLE_CUSTOMERS.length)];
      const attachment = SAMPLE_ATTACHMENTS[Math.floor(rnd() * SAMPLE_ATTACHMENTS.length)];
      const status = SAMPLE_STATUSES[Math.floor(rnd() * SAMPLE_STATUSES.length)];
      const variance = 0.85 + rnd() * 0.3;
      months[m].push({
        offer_no: `T-${year}-${String(line.id.slice(-3)).toUpperCase()}-${String(counter).padStart(3, "0")}`,
        dealer,
        machine_key: line.product_key,
        attachment,
        customer,
        value: Math.round(unit * variance),
        sent_date: new Date(year, m, 5 + Math.floor(rnd() * 22)).toISOString(),
        status,
      });
      counter++;
    }
  }
  return months;
}

// ---------- Helpers ----------
function splitToMonthly(qty: number, split: number[]): number[] {
  const safe = split.length === 12 ? split : EVEN;
  // Distribute qty across months by share, then round so totals stay close to qty.
  const raw = safe.map(s => qty * s);
  const floors = raw.map(v => Math.floor(v));
  let remainder = qty - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].i]++; remainder--;
  }
  return result;
}

function fmtDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(LOCALE_BY_LANG[lang], { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------- KPI ----------
function KpiCard({ label, value, sub, icon: Icon, tone = "neutral" }: { label: string; value: string; sub?: string; icon: typeof Wallet; tone?: "neutral" | "primary" | "ok" | "warn" }) {
  const toneMap = {
    neutral: "from-slate-50 to-white text-slate-900",
    primary: "from-emerald-50 to-white text-emerald-900",
    ok:      "from-emerald-50 to-white text-emerald-900",
    warn:    "from-amber-50 to-white text-amber-900",
  } as const;
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-gradient-to-b shadow-sm p-5", toneMap[tone])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-slate-500 mt-1">{sub}</div> : null}
    </div>
  );
}

interface NewRowState {
  product_key: string;
  seller_name: string;
  country: string;
  qty_budget: number;
  notes: string;
}

// Per-machine working forecast monthly draft.
type WorkingDraft = Record<string, number[]>; // budget_line_id -> 12 numbers

export default function CrmBudgetPage() {
  const { appUser, loading } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);
  const isSeller = isScopedSeller(portalRole);
  const allowed = isAdmin || isSeller;

  const [year, setYear] = useState<number>(availableYears()[0]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [actuals, setActuals] = useState<SalesActual[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editWorking, setEditWorking] = useState(false);
  const [workingDraft, setWorkingDraft] = useState<WorkingDraft>({});
  const [showAdd, setShowAdd] = useState(false);
  // Backend-only filter: "all" | seller email (e.g. "em@timan.dk").
  const [backendFilter, setBackendFilter] = useState<string>("all");
  const [newRow, setNewRow] = useState<NewRowState>({
    product_key: BUDGET_PRODUCTS[0].key, seller_name: "", country: "DK", qty_budget: 1, notes: "",
  });
  // Per-machine expand/collapse state for equipment sections.
  // Default: expanded so backend users see the structure.
  const [expandedEquip, setExpandedEquip] = useState<Record<string, boolean>>({
    "RC-1000s": true, "Timan 3330": true, "Timan 2620": true,
  });

  useEffect(() => {
    if (appUser?.email) resolveSellerId(appUser.email).then(setSellerId);
  }, [appUser?.email]);

  useEffect(() => {
    if (!allowed) return;
    setBusy(true);
    Promise.all([listBudgetLines({ year }), listForecasts(year), listSalesActuals(year)])
      .then(([l, f, a]) => { setLines(l); setForecasts(f); setActuals(a); })
      .finally(() => setBusy(false));
  }, [year, allowed]);

  // Resolve the current user's identity for scoping. We support multiple
  // matching strategies because seed rows may have been created before the
  // user's auth_user_id was linked, and because the preview-role switcher
  // produces synthetic display_names like "[Preview] Timan Sælger".
  const myEmail = (appUser?.email || "").toLowerCase().trim();
  const myInitialsFromName = (appUser?.display_name || "").replace(/^\[Preview\]\s*/i, "").trim();

  const visibleLines = useMemo(() => {
    function belongsToMe(l: BudgetLine): boolean {
      if (sellerId && l.seller_id === sellerId) return true;
      if (myEmail && l.seller_email && l.seller_email.toLowerCase() === myEmail) return true;
      if (myInitialsFromName && l.seller_initials && l.seller_initials.toLowerCase() === myInitialsFromName.toLowerCase()) return true;
      if (myInitialsFromName && l.seller_name && l.seller_name.toLowerCase() === myInitialsFromName.toLowerCase()) return true;
      return false;
    }
    if (isAdmin) {
      if (backendFilter === "all") return lines;
      if (backendFilter === "mine") return lines.filter(belongsToMe);
      return lines.filter(l => (l.seller_email || "").toLowerCase() === backendFilter.toLowerCase());
    }
    return lines.filter(belongsToMe);
  }, [lines, isAdmin, sellerId, myEmail, myInitialsFromName, backendFilter]);

  // Pipeline per line.
  const pipelineByLine = useMemo(() => {
    const map: Record<string, PipelineOffer[][]> = {};
    visibleLines.forEach(l => { map[l.id] = generatePipeline(l, year); });
    return map;
  }, [visibleLines, year]);

  // Group lines by product (machine model). Enforce required machine order.
  const MACHINE_ORDER = ["RC-751", "RC-1000s", "Timan 3330", "Timan 2620"];
  const grouped = useMemo(() => {
    const m = new Map<string, { product_key: string; product_name: string; item_number: string | null; lines: BudgetLine[] }>();
    visibleLines.forEach(l => {
      const prev = m.get(l.product_key) || { product_key: l.product_key, product_name: l.product_name, item_number: l.item_number, lines: [] };
      prev.lines.push(l);
      m.set(l.product_key, prev);
    });
    // Ensure all 4 machines appear (even with empty lines) and in the required order.
    const out: Array<{ product_key: string; product_name: string; item_number: string | null; lines: BudgetLine[] }> = [];
    for (const key of MACHINE_ORDER) {
      if (m.has(key)) {
        out.push(m.get(key)!);
        m.delete(key);
      } else {
        const p = findProduct(key);
        if (p) out.push({ product_key: key, product_name: p.name, item_number: p.varenr, lines: [] });
      }
    }
    // Append any other product groups (filtered Tool-Trac removed in service).
    m.forEach(v => out.push(v));
    return out;
  }, [visibleLines]);

  // KPI totals
  const totals = useMemo(() => {
    const annualBudget = visibleLines.reduce((s, l) => s + l.value_budget, 0);
    const annualQty = visibleLines.reduce((s, l) => s + l.qty_budget, 0);
    const sold = actuals
      .filter(a => visibleLines.some(l => l.id === a.budget_line_id))
      .reduce((acc, a) => ({ qty: acc.qty + a.qty_sold, value: acc.value + a.value_sold }), { qty: 0, value: 0 });
    const fc = forecasts
      .filter(f => visibleLines.some(l => l.id === f.budget_line_id))
      .reduce((acc, f) => ({ qty: acc.qty + f.qty_forecast, value: acc.value + f.value_forecast }), { qty: 0, value: 0 });
    const score = annualQty > 0 ? Math.round((sold.qty / annualQty) * 100) : 0;
    return { annualBudget, annualQty, sold, fc, score };
  }, [visibleLines, actuals, forecasts]);

  if (loading) return <CrmLayout pageTitle={T.page_title[lang]}><div className="text-sm text-slate-500">{T.loading_short[lang]}</div></CrmLayout>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!allowed) {
    return (
      <CrmLayout pageTitle={T.page_title[lang]}>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">{T.no_access[lang]}</h2>
          <p className="text-sm text-slate-500 mt-1">{T.no_access_msg[lang]}</p>
        </div>
      </CrmLayout>
    );
  }

  // ---- Per-line monthly derivations ----
  function lineMonthly(line: BudgetLine) {
    const split = (line.monthly_split && line.monthly_split.length === 12) ? line.monthly_split : EVEN;
    const ac = actuals.find(a => a.budget_line_id === line.id);
    const fc = forecasts.find(f => f.budget_line_id === line.id);
    const budgetMonthly = splitToMonthly(line.qty_budget, split);
    const ordersMonthly = splitToMonthly(ac?.qty_sold ?? 0, split);
    const draft = workingDraft[line.id];
    const workingMonthly = draft ?? splitToMonthly(fc?.qty_forecast ?? line.qty_budget, split);
    return { budgetMonthly, ordersMonthly, workingMonthly, ac, fc, split };
  }

  // ---- Working forecast handlers ----
  function adjustWorking(lineId: string, monthIdx: number, delta: number) {
    setWorkingDraft(prev => {
      const cur = prev[lineId] ?? (() => {
        const l = visibleLines.find(x => x.id === lineId)!;
        const fc = forecasts.find(f => f.budget_line_id === lineId);
        const split = (l.monthly_split && l.monthly_split.length === 12) ? l.monthly_split : EVEN;
        return splitToMonthly(fc?.qty_forecast ?? l.qty_budget, split);
      })();
      const next = [...cur];
      next[monthIdx] = Math.max(0, (next[monthIdx] ?? 0) + delta);
      return { ...prev, [lineId]: next };
    });
  }

  async function saveWorkingForecast() {
    const updates: BudgetForecast[] = [];
    for (const line of visibleLines) {
      const draft = workingDraft[line.id];
      if (!draft) continue;
      const fc = forecasts.find(f => f.budget_line_id === line.id);
      const qty = draft.reduce((a, b) => a + b, 0);
      const unit = line.qty_budget > 0 ? line.value_budget / line.qty_budget : 0;
      const next: BudgetForecast = {
        id: fc?.id || ("f_" + line.id),
        budget_line_id: line.id,
        qty_forecast: qty,
        value_forecast: Math.round(qty * unit),
        comments: fc?.comments ?? null,
        expected_timing: fc?.expected_timing ?? null,
        risk_level: fc?.risk_level ?? null,
        probability: fc?.probability ?? null,
        updated_at: new Date().toISOString(),
      };
      const saved = await upsertForecast(next);
      updates.push(saved);
    }
    if (updates.length) {
      setForecasts(prev => {
        const map = new Map(prev.map(f => [f.budget_line_id, f]));
        updates.forEach(u => map.set(u.budget_line_id, u));
        return Array.from(map.values());
      });
    }
    setWorkingDraft({});
    setEditWorking(false);
  }

  async function toggleLock(line: BudgetLine) {
    if (!isAdmin) return;
    const updated = await setLineLock(line.id, !line.locked, appUser?.display_name || appUser?.email || "Backend");
    if (updated) setLines(prev => prev.map(l => l.id === line.id ? updated : l));
  }

  async function removeLine(id: string) {
    if (!isAdmin) return;
    if (!confirm(T.delete_confirm[lang])) return;
    await deleteBudgetLine(id);
    setLines(prev => prev.filter(l => l.id !== id));
  }

  async function addLine() {
    const product = findProduct(newRow.product_key);
    if (!product) return;
    if (product.status === "coming_soon") {
      if (!confirm(`${product.name} ${T.cs_confirm[lang]}`)) return;
    }
    const unit = product.priceDKK || 0;
    const qty = Math.max(0, Number(newRow.qty_budget) || 0);
    // Try to derive seller_email/initials from the typed seller name (matches a known seller)
    // or fall back to the current user's identity.
    const typedName = (newRow.seller_name || "").trim();
    const known = BUDGET_SELLERS.find(
      s => s.full_name.toLowerCase() === typedName.toLowerCase() || s.initials.toLowerCase() === typedName.toLowerCase(),
    );
    const seller_email = known?.email ?? (isAdmin ? null : (appUser?.email ?? null));
    const seller_initials = known?.initials ?? (isAdmin ? (typedName || null) : (myInitialsFromName || null));
    const created = await createBudgetLine({
      year,
      product_key: product.key,
      product_name: product.name,
      item_number: product.varenr,
      category: product.category,
      seller_id: !isAdmin && sellerId ? sellerId : null,
      seller_name: typedName || (appUser?.display_name ?? null),
      seller_email,
      seller_initials,
      country: newRow.country || null,
      qty_budget: qty,
      value_budget: qty * unit,
      monthly_split: EVEN,
      notes: newRow.notes || null,
    });
    setLines(prev => [...prev, created]);
    setShowAdd(false);
    setNewRow({ product_key: BUDGET_PRODUCTS[0].key, seller_name: "", country: "DK", qty_budget: 1, notes: "" });
  }

  // void to silence unused warning for upsertBudgetLine import (kept for future inline edits)
  void upsertBudgetLine;

  // ---- Render ----
  const monthCols = MONTHS_BY_LANG[lang];

  return (
    <CrmLayout pageTitle={T.page_title[lang]}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" /> {T.annual_budget[lang]} {year}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin ? T.subtitle_admin[lang] : T.subtitle_seller[lang]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-500" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-sm bg-transparent outline-none"
            >
              {availableYears().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{T.seller_label[lang]}</span>
              <select
                value={backendFilter}
                onChange={(e) => setBackendFilter(e.target.value)}
                className="text-sm bg-transparent outline-none"
              >
                <option value="all">{T.all_sellers[lang]}</option>
                {BUDGET_SELLERS.map(s => (
                  <option key={s.email} value={s.email}>{s.initials} — {s.country}</option>
                ))}
                <optgroup label={T.backend_group[lang]}>
                  {BUDGET_BACKEND_USERS
                    .filter(s => !BUDGET_SELLERS.some(x => x.email.toLowerCase() === s.email.toLowerCase()))
                    .map(s => (
                      <option key={s.email} value={s.email}>{s.initials}</option>
                    ))}
                  <option value="mine">{T.my_view[lang]}</option>
                </optgroup>
              </select>
            </div>
          )}
          {!editWorking ? (
            <button
              onClick={() => setEditWorking(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 shadow-sm"
            >
              <Edit3 className="h-4 w-4" /> {T.edit_working[lang]}
            </button>
          ) : (
            <>
              <button
                onClick={() => { setWorkingDraft({}); setEditWorking(false); }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 shadow-sm"
              >
                <X className="h-4 w-4" /> {T.cancel[lang]}
              </button>
              <button
                onClick={saveWorkingForecast}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 shadow-sm"
              >
                <Save className="h-4 w-4" /> {T.save_working[lang]}
              </button>
            </>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 shadow-sm"
            >
              <Plus className="h-4 w-4" /> {T.new_line[lang]}
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <KpiCard label={T.kpi_budget[lang]} value={`${totals.annualQty}`} sub={fmtDKK(totals.annualBudget)} icon={Wallet} tone="primary" />
        <KpiCard label={T.kpi_orders[lang]} value={`${totals.sold.qty}`} sub={fmtDKK(totals.sold.value)} icon={Wallet} tone="ok" />
        <KpiCard label={T.kpi_working[lang]} value={`${totals.fc.qty}`} sub={fmtDKK(totals.fc.value)} icon={Wallet} tone="warn" />
        <KpiCard label={T.kpi_score[lang]} value={`${totals.score}%`} sub={`${totals.sold.qty} / ${totals.annualQty} ${T.pcs[lang]}`} icon={Wallet} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300" /> {T.legend_budget[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> {T.legend_orders[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> {T.legend_pipe[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900" /> {T.legend_work[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500" /> {T.legend_perf_n[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> {T.legend_perf_p[lang]}</span>
      </div>

      {/* Matrix */}
      <TooltipProvider delayDuration={150}>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-900 text-slate-100">
                  <th className="sticky left-0 z-10 bg-slate-900 text-left px-3 py-2.5 font-semibold w-56 min-w-[14rem]">{T.col_model[lang]}</th>
                  {monthCols.map(m => (
                    <th key={m} className="px-2 py-2.5 font-medium text-center w-16">{m}</th>
                  ))}
                  <th className="px-2 py-2.5 font-semibold text-center w-20">{T.col_total[lang]}</th>
                  <th className="px-2 py-2.5 font-semibold text-center w-16">{T.col_score[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {busy && (
                  <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">{T.loading[lang]}</td></tr>
                )}
                {!busy && grouped.length === 0 && (
                  <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">{T.empty_year[lang]}</td></tr>
                )}

                {(() => {
                  // Reusable 4-row block (BUDGET/ORDERS, PIPELINE, WORKING, PERFORMANCE)
                  // — used both for machine groups and individual equipment items so
                  // equipment has the exact same budget functionality as machines.
                  function renderRowBlock(opts: {
                    keyPrefix: string;
                    productName: string;
                    rowLines: BudgetLine[]; // lines used for budget/orders/working aggregation
                    indent?: boolean;       // visually nest under a machine
                  }) {
                    const { keyPrefix, productName, rowLines, indent } = opts;
                    const agg = (k: "budgetMonthly" | "ordersMonthly" | "workingMonthly") => {
                      const arr = Array.from({ length: 12 }, () => 0);
                      rowLines.forEach(l => { lineMonthly(l)[k].forEach((v, i) => { arr[i] += v; }); });
                      return arr;
                    };
                    const budgetMonthly = agg("budgetMonthly");
                    const ordersMonthly = agg("ordersMonthly");
                    const workingMonthly = agg("workingMonthly");
                    const pipelineMonthly: PipelineOffer[][] = Array.from({ length: 12 }, () => []);
                    rowLines.forEach(l => {
                      const p = pipelineByLine[l.id] || [];
                      p.forEach((arr, i) => { pipelineMonthly[i].push(...arr); });
                    });
                    const totalBudget = budgetMonthly.reduce((a, b) => a + b, 0);
                    const totalOrders = ordersMonthly.reduce((a, b) => a + b, 0);
                    const totalWorking = workingMonthly.reduce((a, b) => a + b, 0);
                    const totalPipeline = pipelineMonthly.reduce((s, x) => s + x.length, 0);
                    const totalPerf = totalOrders - totalBudget;
                    const scorePct = totalBudget > 0 ? Math.round((totalOrders / totalBudget) * 100) : 0;
                    const scoreTone =
                      scorePct >= 100 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                      scorePct >= 70  ? "bg-amber-100 text-amber-800 border-amber-200" :
                      totalBudget === 0 ? "bg-slate-100 text-slate-500 border-slate-200" :
                                        "bg-rose-100 text-rose-800 border-rose-200";
                    const stickyPad = indent ? "pl-8" : "px-3";
                    return (
                      <Fragment key={`block-${keyPrefix}`}>
                        {/* BUDGET / ORDERS */}
                        <tr key={`bo-${keyPrefix}`} className="bg-slate-50/60">
                          <td className={cn("sticky left-0 z-10 bg-slate-50/60 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600", stickyPad)}>{T.row_budget_orders[lang]}</td>
                          {budgetMonthly.map((b, i) => {
                            const o = ordersMonthly[i];
                            return (
                              <td key={i} className="px-2 py-2 text-center tabular-nums text-xs">
                                <span className="text-slate-500">{b}</span>
                                <span className="text-slate-400 mx-0.5">/</span>
                                <span className={cn("font-semibold", o > 0 ? "text-emerald-600" : "text-emerald-600/40")}>{o}</span>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">
                            <span className="text-slate-600">{totalBudget}</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-emerald-700">{totalOrders}</span>
                          </td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* PIPELINE */}
                        <tr key={`pipe-${keyPrefix}`} className="bg-amber-50/40">
                          <td className={cn("sticky left-0 z-10 bg-amber-50/40 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800", stickyPad)}>{T.row_pipeline[lang]}</td>
                          {pipelineMonthly.map((offers, i) => {
                            const count = offers.length;
                            const sum = offers.reduce((a, b) => a + b.value, 0);
                            if (count === 0) {
                              return <td key={i} className="px-2 py-2 text-center text-amber-700/40 text-xs">−</td>;
                            }
                            return (
                              <td key={i} className="px-1 py-2 text-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-200 hover:bg-amber-200 transition">
                                      {count}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-sm">
                                    <div className="text-xs space-y-2">
                                      <div className="font-semibold border-b border-slate-200 pb-1">
                                        {count} {T.tip_quotes[lang]} · {fmtDKK(sum)}
                                      </div>
                                      {offers.map((o, idx) => (
                                        <div key={idx} className="space-y-0.5 pb-1.5 border-b border-slate-100 last:border-0">
                                          <div className="font-medium">{o.offer_no} · {(STATUS_LABELS as Record<string, Record<Language,string>>)[o.status]?.[lang] || o.status}</div>
                                          <div className="text-slate-600">{o.dealer}</div>
                                          <div className="text-slate-600">{T.tip_customer[lang]}: {o.customer}</div>
                                          <div className="text-slate-600">{T.tip_machine[lang]}: {productName}</div>
                                          <div className="text-slate-600">{T.tip_attach[lang]}: {o.attachment}</div>
                                          <div className="flex justify-between">
                                            <span className="text-slate-500">{T.tip_sent[lang]}: {fmtDate(o.sent_date, lang)}</span>
                                            <span className="font-semibold tabular-nums">{fmtDKK(o.value)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center text-xs font-semibold text-amber-800 tabular-nums">{totalPipeline}</td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* WORKING */}
                        <tr key={`work-${keyPrefix}`} className="bg-slate-900 text-slate-100">
                          <td className={cn("sticky left-0 z-10 bg-slate-900 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200", stickyPad)}>{T.row_working[lang]}</td>
                          {workingMonthly.map((w, i) => (
                            <td key={i} className="px-1 py-1.5 text-center tabular-nums text-xs">
                              {editWorking && rowLines.length > 0 ? (
                                <div className="inline-flex items-center gap-0.5 bg-slate-800 rounded px-0.5">
                                  <button
                                    onClick={() => adjustWorking(rowLines[0].id, i, -1)}
                                    className="p-0.5 hover:bg-slate-700 rounded"
                                    title="−1"
                                  ><Minus className="h-3 w-3" /></button>
                                  <span className="min-w-[16px] text-center font-semibold">{w}</span>
                                  <button
                                    onClick={() => adjustWorking(rowLines[0].id, i, +1)}
                                    className="p-0.5 hover:bg-slate-700 rounded"
                                    title="+1"
                                  ><Plus className="h-3 w-3" /></button>
                                </div>
                              ) : (
                                <span className="font-semibold">{w}</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">{totalWorking}</td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* PERFORMANCE */}
                        <tr key={`perf-${keyPrefix}`} className="border-b-2 border-slate-200">
                          <td className={cn("sticky left-0 z-10 bg-white py-2 text-xs font-semibold uppercase tracking-wide text-slate-500", stickyPad)}>{T.row_perf[lang]}</td>
                          {ordersMonthly.map((o, i) => {
                            const diff = o - budgetMonthly[i];
                            let cls = "text-slate-400";
                            let label: string = "•";
                            if (diff > 0) { cls = "text-emerald-600 font-semibold"; label = `+${diff}`; }
                            else if (diff < 0) { cls = "text-rose-600 font-semibold"; label = `${diff}`; }
                            return (
                              <td key={i} className={cn("px-2 py-2 text-center tabular-nums text-xs", cls)}>{label}</td>
                            );
                          })}
                          <td className={cn("px-2 py-2 text-center tabular-nums text-xs font-bold",
                            totalPerf > 0 ? "text-emerald-700" : totalPerf < 0 ? "text-rose-700" : "text-slate-500")}>
                            {totalPerf > 0 ? `+${totalPerf}` : totalPerf}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={cn("inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums", scoreTone)}>
                              {totalBudget === 0 ? "−" : `${scorePct}%`}
                            </span>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  }

                  // Synthesize an in-memory BudgetLine for an equipment item so the
                  // working-forecast stepper has a stable id to write to. We build a
                  // stable id per (year, machine, equipment.key) and seed an empty
                  // line if none exists yet; this keeps storage logic untouched.
                  function syntheticEquipLine(machineKey: string, equipKey: string, equipName: string, varenr: string | null): BudgetLine {
                    const id = `eq_${year}_${machineKey}_${equipKey}`;
                    const existing = lines.find(l => l.id === id);
                    if (existing) return existing;
                    return {
                      id,
                      year,
                      product_key: `${machineKey}::${equipKey}`,
                      product_name: equipName,
                      item_number: varenr,
                      category: "attachment",
                      parent_machine_key: machineKey,
                      seller_id: null,
                      seller_name: null,
                      seller_email: null,
                      seller_initials: null,
                      country: null,
                      qty_budget: 0,
                      value_budget: 0,
                      monthly_split: EVEN,
                      notes: null,
                      locked: false,
                      created_at: new Date().toISOString(),
                    };
                  }

                  return (
                    <>
                      {busy && (
                        <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">{T.loading[lang]}</td></tr>
                      )}
                      {!busy && grouped.length === 0 && (
                        <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">{T.empty_year[lang]}</td></tr>
                      )}

                      {grouped.map(group => {
                        const product = findProduct(group.product_key);
                        const comingSoon = product?.status === "coming_soon";
                        const anyLocked = group.lines.some(l => l.locked);
                        const equipList = EQUIPMENT_BY_MACHINE[group.product_key] || [];
                        const expanded = expandedEquip[group.product_key] !== false;

                        return (
                          <Fragment key={group.product_key}>
                            {/* Machine title row */}
                            <tr key={`title-${group.product_key}`}>
                              <td colSpan={15} className="bg-slate-50 border-t border-slate-200 px-3 py-2">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900">{group.product_name}</span>
                                    {group.item_number && <span className="text-xs text-slate-500 tabular-nums">· {group.item_number}</span>}
                                    {comingSoon && <span className="inline-flex items-center text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">{T.coming_soon[lang]}</span>}
                                    {anyLocked && <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200"><Lock className="h-3 w-3" /> {T.locked[lang]}</span>}
                                  </div>
                                  {isAdmin && group.lines.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      {group.lines.map(l => (
                                        <span key={l.id} className="inline-flex items-center gap-1 text-xs text-slate-600">
                                          <span className="text-slate-500">{l.seller_name || "—"}</span>
                                          <button onClick={() => toggleLock(l)} className="p-1 rounded hover:bg-slate-200" title={l.locked ? T.unlock[lang] : T.lock[lang]}>
                                            {l.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                          </button>
                                          <button onClick={() => removeLine(l.id)} className="p-1 rounded hover:bg-rose-100 text-rose-600" title={T.delete_line[lang]}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {renderRowBlock({
                              keyPrefix: group.product_key,
                              productName: group.product_name,
                              rowLines: group.lines,
                            })}

                            {/* Equipment section */}
                            {equipList.length > 0 && (
                              <>
                                <tr key={`equip-h-${group.product_key}`}>
                                  <td colSpan={15} className="bg-slate-50 border-t border-slate-100 px-3 py-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedEquip(prev => ({ ...prev, [group.product_key]: !expanded }))}
                                      className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:text-slate-900"
                                      aria-expanded={expanded}
                                      title={expanded ? T.hide_equipment[lang] : T.show_equipment[lang]}
                                    >
                                      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                      <Wrench className="h-3.5 w-3.5 text-emerald-600" />
                                      {T.equipment_for[lang]} {group.product_name}
                                    </button>
                                  </td>
                                </tr>

                                {expanded && equipList.map(eq => {
                                  const eqLabel = localizedName(eq.name, lang);
                                  const isPreview = eq.status === "preview";
                                  const synthetic = syntheticEquipLine(group.product_key, eq.key, eqLabel, eq.varenr);
                                  return (
                                    <Fragment key={`equip-frag-${eq.key}`}>
                                      {/* Equipment title sub-row */}
                                      <tr key={`equip-title-${eq.key}`}>
                                        <td colSpan={15} className="bg-white border-t border-slate-100 px-3 py-1.5 pl-8">
                                          <div className="flex items-center gap-2">
                                            <Wrench className="h-3 w-3 text-slate-400" />
                                            <span className="font-medium text-slate-800 text-sm">{eqLabel}</span>
                                            {eq.varenr && <span className="text-[10px] text-slate-400 tabular-nums">· {eq.varenr}</span>}
                                            {isPreview && (
                                              <span className="inline-flex items-center text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                                {T.preview_row[lang]}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                      {renderRowBlock({
                                        keyPrefix: `eq-${eq.key}`,
                                        productName: `${group.product_name} · ${eqLabel}`,
                                        rowLines: [synthetic],
                                        indent: true,
                                      })}
                                    </Fragment>
                                  );
                                })}
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </TooltipProvider>

      {/* Add modal */}
      {showAdd && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{T.modal_title[lang]} · {year}</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-slate-600">{T.field_product[lang]}</span>
                <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.product_key} onChange={(e) => setNewRow(r => ({ ...r, product_key: e.target.value }))}>
                  {BUDGET_PRODUCTS.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.name} {p.varenr ? `· ${p.varenr}` : ""} {p.status === "coming_soon" ? `(${T.coming_soon[lang]})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600">{T.field_seller[lang]}</span>
                  <input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.seller_name} onChange={(e) => setNewRow(r => ({ ...r, seller_name: e.target.value }))} placeholder={T.placeholder_name[lang]} />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-600">{T.field_country[lang]}</span>
                  <input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.country} onChange={(e) => setNewRow(r => ({ ...r, country: e.target.value }))} />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-slate-600">{T.field_qty[lang]}</span>
                <input type="number" min={0} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.qty_budget} onChange={(e) => setNewRow(r => ({ ...r, qty_budget: Number(e.target.value) }))} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">{T.field_notes[lang]}</span>
                <textarea rows={2} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.notes} onChange={(e) => setNewRow(r => ({ ...r, notes: e.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{T.cancel[lang]}</button>
              <button onClick={addLine} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-2"><Plus className="h-4 w-4" /> {T.create[lang]}</button>
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}
