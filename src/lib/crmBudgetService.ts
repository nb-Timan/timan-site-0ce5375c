/**
 * CRM Budget service — Phase 1.
 *
 * Source of truth (when available): public.crm_budget_years,
 * public.crm_budget_lines, public.crm_budget_forecasts,
 * public.crm_budget_sales_actuals.
 *
 * Phase 1 ships with a localStorage fallback + product catalog seed so the UI
 * is fully usable in preview before any tables exist. We do NOT touch the
 * configurator pricing — we only read product names / item numbers.
 */
import { supabase } from "@/lib/supabase";
import { PRODUCTS, ACCESSORIES } from "@/data/machines";
import type { Language, LocalizedString } from "@/types/configurator";

// ---------- Types ----------
export type BudgetCategory = "machine" | "attachment" | "service" | "other";
export type ProductStatus = "available" | "coming_soon" | "preview";

export interface BudgetProduct {
  key: string;            // stable id we use across budget rows
  name: string;
  varenr: string | null;  // item number
  category: BudgetCategory;
  status: ProductStatus;
  priceDKK?: number | null;
  priceEUR?: number | null;
  /** For equipment rows: which machine they hang under. */
  parent_machine_key?: string | null;
}

export type MonthlySplit = number[]; // length 12, Jan..Dec (qty or share)

export interface BudgetLine {
  id: string;
  year: number;
  product_key: string;
  product_name: string;
  item_number: string | null;
  category: BudgetCategory;
  /** For attachment/equipment rows: the machine product_key they belong under. */
  parent_machine_key?: string | null;
  seller_id: string | null;
  seller_name: string | null;
  /** Email of the assigned seller — used for scoping when seller_id is unknown
   *  (e.g. preview-role sessions or rows seeded before auth linking). */
  seller_email: string | null;
  /** Short initials (e.g. "EM", "AKR", "JTN") — used as the human-readable
   *  identifier and for the backend filter dropdown. */
  seller_initials: string | null;
  country: string | null;
  qty_budget: number;
  value_budget: number;       // currency-agnostic, DKK assumed for Phase 1
  monthly_split: MonthlySplit; // share 0..1 summing to ~1
  notes?: string | null;
  locked: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  created_at: string;
}

export interface BudgetForecast {
  id: string;
  budget_line_id: string;
  qty_forecast: number;
  value_forecast: number;
  comments?: string | null;
  expected_timing?: string | null; // YYYY-MM
  risk_level?: "low" | "medium" | "high" | null;
  probability?: number | null;     // 0..100
  updated_at: string;
}

export interface SalesActual {
  budget_line_id: string;
  qty_sold: number;
  value_sold: number;
}

// ---------- Product catalog ----------
// Read from existing configurator data where possible. NEVER mutate.
function stripBaseSuffix(name: string): string {
  // Remove "Basismaskine" / "Base machine" / "Basismaschine" / "Macchina base" / "Alapgép"
  // and any trailing whitespace/punctuation. Keep just the model name.
  return name
    .replace(/\s*[-–—]?\s*(Basismaskine|Basismaskin|Base machine|Basismaschine|Macchina base|Alapg[eé]p)\s*$/i, "")
    .trim();
}

function readConfiguratorMachine(key: string): { name: string; varenr: string; priceDKK: number; priceEUR: number } | null {
  const m = PRODUCTS[key];
  if (!m) return null;
  const rawName = typeof m.name === "string" ? m.name : (m.name?.da || m.name?.en || key);
  return { name: stripBaseSuffix(rawName), varenr: m.varenr || "", priceDKK: m.priceDKK || 0, priceEUR: m.priceEUR || 0 };
}

const RC1000 = readConfiguratorMachine("RC-1000S");
const RC751  = readConfiguratorMachine("RC-751");
const T3330  = readConfiguratorMachine("Timan 3330");

// ---------- Equipment categories under machines ----------
// Reads from the configurator ACCESSORIES catalog. We expose grouped
// equipment "categories" (no manual prices) so the budget UI can plan
// per category exactly as it does for machines.
//
// Keys are stable so localStorage seed/forecast/actuals stay consistent
// across renders. Names use LocalizedString so the table can translate.
export interface EquipmentCategory {
  key: string;                // stable across renders
  parent_machine_key: string; // RC-1000s | Timan 3330 | Timan 2620
  name: LocalizedString;
  varenr: string | null;      // representative varenr if available, else null
  status: ProductStatus;      // "preview" → planning row, no orders/forecasts
}

// RC-1000s: pulled from existing configurator items (no manual prices).
function findAcc(key: string, varenr: string) {
  const list = ACCESSORIES[key] || [];
  return list.find(a => String(a.varenr) === varenr && !a.isHeader) || null;
}
function nameOf(loc: LocalizedString | string | undefined, fallback: string): LocalizedString {
  if (!loc) return { da: fallback, en: fallback };
  if (typeof loc === "string") return { da: loc, en: loc };
  return loc;
}

function rc1000Item(varenr: string, fallback: string, key: string): EquipmentCategory {
  const a = findAcc("RC-1000S", varenr);
  return {
    key,
    parent_machine_key: "RC-1000s",
    name: nameOf(a?.name as LocalizedString | undefined, fallback),
    varenr: a?.varenr ?? varenr,
    status: "available",
  };
}

const RC1000_EQUIPMENT: EquipmentCategory[] = [
  rc1000Item("410910",   "Slagleklipper inkl Y-slagle sæt",     "RC1000_410910"),
  rc1000Item("411666",   "Rotorklipper 1350 mm",                "RC1000_411666"),
  rc1000Item("411800",   "Fingerklipper 1700 mm",               "RC1000_411800"),
  rc1000Item("412040",   "Skivehøster 1150 mm",                 "RC1000_412040"),
  rc1000Item("HFS-1012", "Stubfræser m/hydraulisk sving",       "RC1000_HFS1012"),
  rc1000Item("411742",   "V-plov m/gummiskær",                  "RC1000_411742"),
  rc1000Item("411845",   "Centerdrevet fejemaskine",            "RC1000_411845"),
  rc1000Item("418000",   "Sneslynge 1100 mm",                   "RC1000_418000"),
  rc1000Item("730600",   "WB-170 Ukrudtsbørste basisenhed",     "RC1000_730600"),
];

// Timan 3330: re-use the configurator section headers (already localized).
function headerName(machineKey: string, headerId: string, fallback: string): LocalizedString {
  const list = ACCESSORIES[machineKey] || [];
  const h = list.find(a => a.id === headerId && a.isHeader);
  return nameOf(h?.name as LocalizedString | undefined, fallback);
}
const T3330_EQUIPMENT: EquipmentCategory[] = [
  { key: "T3330_SWEEP",   parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "SWEEP_HEADER",  "Feje/Sug Redskaber"), varenr: null, status: "available" },
  { key: "T3330_WB",      parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "WB_HEADER",     "Ukrudtsbørste"),      varenr: null, status: "available" },
  { key: "T3330_GRASS",   parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "GRASS_HEADER",  "Græs opgaver"),       varenr: null, status: "available" },
  { key: "T3330_WINTER",  parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "WINTER_HEADER", "Vinter redskaber"),   varenr: null, status: "available" },
  { key: "T3330_OTHER",   parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "OTHER_HEADER",  "Øvrige Redskaber"),   varenr: null, status: "available" },
];

// Timan 2620: no configurator data yet → planning rows, no prices.
const T2620_EQUIPMENT: EquipmentCategory[] = [
  { key: "T2620_SWEEP",  parent_machine_key: "Timan 2620", name: { da: "Feje/Sug Redskaber",   en: "Sweep/Vac implements", de: "Kehr-/Sauggeräte",      it: "Attrezzature spazzatura", hu: "Seprés/szívó eszközök" }, varenr: null, status: "preview" },
  { key: "T2620_GRASS",  parent_machine_key: "Timan 2620", name: { da: "Græs opgaver",         en: "Grass tasks",          de: "Grasarbeiten",          it: "Lavori erba",             hu: "Fű feladatok" },          varenr: null, status: "preview" },
  { key: "T2620_WINTER", parent_machine_key: "Timan 2620", name: { da: "Vinter redskaber",     en: "Winter implements",    de: "Wintergeräte",          it: "Attrezzature invernali",  hu: "Téli eszközök" },         varenr: null, status: "preview" },
  { key: "T2620_OTHER",  parent_machine_key: "Timan 2620", name: { da: "Øvrige Redskaber",     en: "Other implements",     de: "Weitere Geräte",        it: "Altri attrezzi",          hu: "Egyéb eszközök" },        varenr: null, status: "preview" },
];

export const EQUIPMENT_BY_MACHINE: Record<string, EquipmentCategory[]> = {
  "RC-1000s":   RC1000_EQUIPMENT,
  "Timan 3330": T3330_EQUIPMENT,
  "Timan 2620": T2620_EQUIPMENT,
};

/** Localized name resolver — used by the page to render equipment rows. */
export function localizedName(name: LocalizedString, lang: Language): string {
  return name[lang] || name.da || name.en || "";
}

export const BUDGET_PRODUCTS: BudgetProduct[] = [
  {
    key: "RC-751",
    name: RC751?.name || "RC-751",
    varenr: RC751?.varenr || "410040",
    category: "machine",
    status: "available",
    priceDKK: RC751?.priceDKK ?? 167500,
    priceEUR: RC751?.priceEUR ?? 22515,
  },
  {
    key: "RC-1000s",
    name: RC1000?.name || "RC-1000s",
    varenr: RC1000?.varenr || "411000",
    category: "machine",
    status: "available",
    priceDKK: RC1000?.priceDKK ?? 235000,
    priceEUR: RC1000?.priceEUR ?? 31590,
  },
  {
    key: "Timan 3330",
    name: T3330?.name || "Timan 3330",
    varenr: T3330?.varenr || "712000",
    category: "machine",
    status: "available",
    priceDKK: T3330?.priceDKK ?? 361700,
    priceEUR: T3330?.priceEUR ?? 48684,
  },
  {
    key: "Timan 2620",
    name: "Timan 2620",
    varenr: "563219",
    category: "machine",
    status: "coming_soon",
  },
];

export function findProduct(key: string): BudgetProduct | undefined {
  return BUDGET_PRODUCTS.find(p => p.key === key);
}

// Storage (localStorage fallback)
// Bump suffix when changing seed shape so previews refresh.
const LS_LINES = "timan.crm.budget.lines.v5";
const LS_FORECASTS = "timan.crm.budget.forecasts.v5";
const LS_ACTUALS = "timan.crm.budget.actuals.v5";

function readLS<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as T[]; } catch { return []; }
}
function writeLS<T>(key: string, rows: T[]) {
  try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* */ }
}

function uid(): string {
  return "b_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const EVEN_SPLIT: MonthlySplit = Array.from({ length: 12 }, () => 1 / 12);

// Realistic seasonal split (machinery: stronger Q1/Q2, lighter summer, modest Q4).
// Values are shares (sum ≈ 1.00).
const SEASONAL_SPLIT: MonthlySplit = [
  0.06, 0.08, 0.11, 0.12, 0.11, 0.09,
  0.05, 0.06, 0.09, 0.10, 0.08, 0.05,
];

// ---------- Known sellers (matches app_users) ----------
// Display name + initials + email so seed rows can be scoped to the real
// user record once they log in or via the preview role switcher.
export interface BudgetSellerRef {
  initials: string;
  full_name: string;
  email: string;
  country: string;
}
// Sellers compared in the seller-overview / performance reporting.
// NOTE: BP also has Timan Backend access (sales manager) but his own
// sales activity must still be tracked under seller initials "BP".
export const BUDGET_SELLERS: BudgetSellerRef[] = [
  { initials: "BP",  full_name: "BP",  email: "bp@timan.dk",  country: "DK" },
  { initials: "EM",  full_name: "EM",  email: "em@timan.dk",  country: "DK" },
  { initials: "JTN", full_name: "JTN", email: "jtn@timan.dk", country: "DK" },
  { initials: "AKR", full_name: "AKR", email: "akr@timan.dk", country: "DE" },
];
// Backend (Timan Backend) users who can see the full seller overview.
// BP appears here AND in BUDGET_SELLERS — backend for access, seller for performance.
export const BUDGET_BACKEND_USERS: BudgetSellerRef[] = [
  { initials: "BP", full_name: "BP", email: "bp@timan.dk", country: "DK" },
  { initials: "JA", full_name: "JA", email: "ja@timan.dk", country: "DK" },
  { initials: "NB", full_name: "NB", email: "nb@timan.dk", country: "DK" },
];

// ---------- Seed (only if empty) ----------
function makeLine(
  year: number,
  product_key: string,
  product_name: string,
  item_number: string | null,
  seller: BudgetSellerRef,
  qty_budget: number,
  value_budget: number,
  notes?: string | null,
): BudgetLine {
  return {
    id: uid(),
    year,
    product_key,
    product_name,
    item_number,
    category: "machine",
    seller_id: null,
    seller_name: seller.full_name,
    seller_email: seller.email,
    seller_initials: seller.initials,
    country: seller.country,
    qty_budget,
    value_budget,
    monthly_split: SEASONAL_SPLIT,
    notes: notes ?? null,
    locked: false,
    created_at: new Date().toISOString(),
  };
}

function ensureSeed() {
  const existing = readLS<BudgetLine>(LS_LINES);
  if (existing.length > 0) return;
  const year = 2026;

  const BP  = BUDGET_SELLERS.find(s => s.initials === "BP")!;
  const EM  = BUDGET_SELLERS.find(s => s.initials === "EM")!;
  const JTN = BUDGET_SELLERS.find(s => s.initials === "JTN")!;
  const AKR = BUDGET_SELLERS.find(s => s.initials === "AKR")!;

  // BP — DK (sales manager, key accounts)
  const bp: BudgetLine[] = [
    makeLine(year, "RC-1000s",   "RC-1000s",   "411000", BP, 6, 1_410_000, "Key accounts"),
    makeLine(year, "Timan 3330", "Timan 3330", "712000", BP, 5, 3_250_000),
  ];

  // EM — DK (full portfolio, strong volume)
  const em: BudgetLine[] = [
    makeLine(year, "RC-751",      "RC-751",     "410040", EM, 8,  1_120_000, "Hovedfokus DK"),
    makeLine(year, "RC-1000s",    "RC-1000s",   "411000", EM, 12, 2_820_000),
    makeLine(year, "Timan 3330",  "Timan 3330", "712000", EM, 6,  3_900_000),
    makeLine(year, "Timan 2620",  "Timan 2620", "563219", EM, 4,  1_600_000, "Coming soon — pre-budget"),
  ];

  // AKR — DE (eksport)
  const akr: BudgetLine[] = [
    makeLine(year, "RC-1000s",    "RC-1000s",   "411000", AKR, 6, 1_410_000),
    makeLine(year, "Timan 3330",  "Timan 3330", "712000", AKR, 4, 2_600_000),
  ];

  // JTN — DK (fokuseret portefølje)
  const jtn: BudgetLine[] = [
    makeLine(year, "RC-751",      "RC-751",     "410040", JTN, 5,  837_500),
    makeLine(year, "RC-1000s",    "RC-1000s",   "411000", JTN, 7,  1_645_000),
    makeLine(year, "Timan 3330",  "Timan 3330", "712000", JTN, 3,  1_950_000),
  ];

  const seedLines: BudgetLine[] = [...bp, ...em, ...akr, ...jtn];
  writeLS(LS_LINES, seedLines);

  // Forecast & sold seed values per seller (per machine key).
  type Pair = { qty: number; value: number };
  const fcBP: Record<string, Pair> = {
    "RC-1000s":   { qty: 7, value: 1_645_000 },
    "Timan 3330": { qty: 6, value: 3_900_000 },
  };
  const acBP: Record<string, Pair> = {
    "RC-1000s":   { qty: 2, value: 470_000 },
    "Timan 3330": { qty: 1, value: 650_000 },
  };
  const fcEM: Record<string, Pair> = {
    "RC-751":     { qty: 9, value: 1_260_000 },
    "RC-1000s":   { qty: 10, value: 2_350_000 },
    "Timan 3330": { qty: 7, value: 4_550_000 },
    "Timan 2620": { qty: 3, value: 1_200_000 },
  };
  const acEM: Record<string, Pair> = {
    "RC-751":     { qty: 2, value: 280_000 },
    "RC-1000s":   { qty: 3, value: 705_000 },
    "Timan 3330": { qty: 1, value: 650_000 },
    "Timan 2620": { qty: 0, value: 0 },
  };
  const fcAKR: Record<string, Pair> = {
    "RC-1000s":   { qty: 7, value: 1_645_000 },
    "Timan 3330": { qty: 4, value: 2_600_000 },
  };
  const acAKR: Record<string, Pair> = {
    "RC-1000s":   { qty: 1, value: 235_000 },
    "Timan 3330": { qty: 0, value: 0 },
  };
  const fcJTN: Record<string, Pair> = {
    "RC-751":     { qty: 6, value: 1_005_000 },
    "RC-1000s":   { qty: 8, value: 1_880_000 },
    "Timan 3330": { qty: 4, value: 2_600_000 },
  };
  const acJTN: Record<string, Pair> = {
    "RC-751":     { qty: 1, value: 167_500 },
    "RC-1000s":   { qty: 2, value: 470_000 },
    "Timan 3330": { qty: 0, value: 0 },
  };

  const forecasts: BudgetForecast[] = [];
  const actuals: SalesActual[] = [];
  const now = new Date().toISOString();
  function pushForLines(lines: BudgetLine[], fc: Record<string, Pair>, ac: Record<string, Pair>, prob: number) {
    for (const line of lines) {
      const f = fc[line.product_key];
      if (f) forecasts.push({ id: uid(), budget_line_id: line.id, qty_forecast: f.qty, value_forecast: f.value, probability: prob, risk_level: "medium", updated_at: now });
      const a = ac[line.product_key];
      if (a) actuals.push({ budget_line_id: line.id, qty_sold: a.qty, value_sold: a.value });
    }
  }
  pushForLines(bp, fcBP, acBP, 75);
  pushForLines(em, fcEM, acEM, 70);
  pushForLines(akr, fcAKR, acAKR, 60);
  pushForLines(jtn, fcJTN, acJTN, 65);

  writeLS(LS_FORECASTS, forecasts);
  writeLS(LS_ACTUALS, actuals);
}

// ---------- Public API ----------
export interface ListBudgetParams {
  year: number;
}

function sanitizeLines(lines: BudgetLine[]): BudgetLine[] {
  // Drop Tool-Trac from Budget (per spec) and strip any "Basismaskine"-style
  // suffix that may still live in old persisted/Supabase rows.
  return lines
    .filter(l => l.product_key !== "Tool-Trac")
    .map(l => ({ ...l, product_name: stripBaseSuffix(l.product_name || "") }));
}

export async function listBudgetLines({ year }: ListBudgetParams): Promise<BudgetLine[]> {
  // Try Supabase first. If table missing or any error → fallback.
  try {
    const { data, error } = await supabase
      .from("crm_budget_lines")
      .select("*")
      .eq("year", year);
    if (!error && Array.isArray(data) && data.length > 0) {
      return sanitizeLines(data as BudgetLine[]);
    }
  } catch { /* */ }
  ensureSeed();
  return sanitizeLines(readLS<BudgetLine>(LS_LINES).filter(l => l.year === year));
}

export async function listForecasts(year: number): Promise<BudgetForecast[]> {
  try {
    const { data, error } = await supabase
      .from("crm_budget_forecasts")
      .select("*");
    if (!error && Array.isArray(data) && data.length > 0) {
      // We don't store year on forecasts — they reference lines.
      const lines = await listBudgetLines({ year });
      const ids = new Set(lines.map(l => l.id));
      return (data as BudgetForecast[]).filter(f => ids.has(f.budget_line_id));
    }
  } catch { /* */ }
  ensureSeed();
  return readLS<BudgetForecast>(LS_FORECASTS);
}

export async function listSalesActuals(year: number): Promise<SalesActual[]> {
  try {
    const { data, error } = await supabase
      .from("crm_budget_sales_actuals")
      .select("*");
    if (!error && Array.isArray(data) && data.length > 0) {
      const lines = await listBudgetLines({ year });
      const ids = new Set(lines.map(l => l.id));
      return (data as SalesActual[]).filter(a => ids.has(a.budget_line_id));
    }
  } catch { /* */ }
  ensureSeed();
  return readLS<SalesActual>(LS_ACTUALS);
}

export async function upsertBudgetLine(line: BudgetLine): Promise<BudgetLine> {
  const all = readLS<BudgetLine>(LS_LINES);
  const idx = all.findIndex(l => l.id === line.id);
  if (idx >= 0) {
    if (all[idx].locked) {
      // ignore writes to locked lines (UI also blocks this)
      return all[idx];
    }
    all[idx] = line;
  } else {
    all.push(line);
  }
  writeLS(LS_LINES, all);
  return line;
}

export async function createBudgetLine(input: Omit<BudgetLine, "id" | "created_at" | "locked">): Promise<BudgetLine> {
  const line: BudgetLine = {
    ...input,
    id: uid(),
    created_at: new Date().toISOString(),
    locked: false,
    monthly_split: input.monthly_split && input.monthly_split.length === 12 ? input.monthly_split : EVEN_SPLIT,
  };
  const all = readLS<BudgetLine>(LS_LINES);
  all.push(line);
  writeLS(LS_LINES, all);
  return line;
}

export async function deleteBudgetLine(id: string): Promise<void> {
  const all = readLS<BudgetLine>(LS_LINES).filter(l => l.id !== id);
  writeLS(LS_LINES, all);
}

export async function setLineLock(id: string, locked: boolean, who: string | null): Promise<BudgetLine | null> {
  const all = readLS<BudgetLine>(LS_LINES);
  const idx = all.findIndex(l => l.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    locked,
    locked_by: locked ? who : null,
    locked_at: locked ? new Date().toISOString() : null,
  };
  writeLS(LS_LINES, all);
  return all[idx];
}

export async function upsertForecast(forecast: BudgetForecast): Promise<BudgetForecast> {
  const all = readLS<BudgetForecast>(LS_FORECASTS);
  const idx = all.findIndex(f => f.budget_line_id === forecast.budget_line_id);
  if (idx >= 0) all[idx] = forecast; else all.push(forecast);
  writeLS(LS_FORECASTS, all);
  return forecast;
}

// ---------- Helpers ----------
export const MONTHS_DA = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

export function availableYears(): number[] {
  const current = new Date().getFullYear();
  const base = Math.max(current, 2026);
  return [base, base + 1, base + 2];
}

export function fmtDKK(value: number): string {
  if (!Number.isFinite(value)) return "0 kr.";
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(value);
}
