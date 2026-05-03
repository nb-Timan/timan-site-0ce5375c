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
import { appendAuditEntry } from "@/lib/audit-log-store";
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
  /** When true, this entry is only a visual sub-folder heading (no budget row). */
  isHeader?: boolean;
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
// Each header is a visual sub-folder (no budget row); items below it are full budget rows.
function t3330Item(varenr: string, daName: string, key: string): EquipmentCategory {
  return {
    key,
    parent_machine_key: "Timan 3330",
    name: { da: daName, en: daName, de: daName, it: daName, hu: daName },
    varenr,
    status: "available",
  };
}
const T3330_EQUIPMENT: EquipmentCategory[] = [
  // — Feje/Sug Redskaber —
  { key: "T3330_SWEEP",   parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "SWEEP_HEADER",  "Feje/Sug Redskaber"), varenr: null, status: "available", isHeader: true },
  t3330Item("720125", "T2 Opsamlingstank uden højtryksslange",                                              "T3330_720125"),
  t3330Item("720130", "T2 Opsamlingstank inkl. højtryksrenser",                                             "T3330_720130"),
  t3330Item("720132", "T3 Opsamlingstank med tørsug",                                                       "T3330_720132"),
  t3330Item("720133", "T3 Opsamlingstank med tørsug og højtryksrenser",                                     "T3330_720133"),
  t3330Item("730030", "Forkostesæt med 2 koste til fejesug forberedt til venstre og højre sidekost",        "T3330_730030"),

  // — Ukrudtsbørste —
  { key: "T3330_WB",      parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "WB_HEADER",     "Ukrudtsbørste"),      varenr: null, status: "available", isHeader: true },
  t3330Item("730600", "WB-170 Ukrudtsbørste basisenhed", "T3330_730600"),

  // — Græs opgaver —
  { key: "T3330_GRASS",   parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "GRASS_HEADER",  "Græs opgaver"),       varenr: null, status: "available", isHeader: true },
  t3330Item("730017",   "Rotorklipper med 3 gatorknive og tilt-up, 135 cm klippebredde",               "T3330_730017"),
  t3330Item("HGM-2007", "Rotorklipper 150 cm med hydraulisk højdejustering og tilt-up",                "T3330_HGM2007"),
  t3330Item("730130",   "Rotorklipper 120 cm for opsamling til fejesugtank (husk centersug)",          "T3330_730130"),

  // — Vinter redskaber —
  { key: "T3330_WINTER",  parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "WINTER_HEADER", "Vinter redskaber"),   varenr: null, status: "available", isHeader: true },
  t3330Item("730020", "Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster", "T3330_730020"),
  t3330Item("730114", "V-plov 130-150 cm med gummiskær",                                   "T3330_730114"),
  t3330Item("730105", "Dozerblad 130 cm med gummiskær",                                    "T3330_730105"),
  t3330Item("730106", "Sneslynge, 110 cm arbejdsbredde",                                   "T3330_730106"),
  t3330Item("725131", "CS-200 Valsespreder, manuel reg. (husk lad og vogn)",               "T3330_725131"),
  t3330Item("725132", "CS-200 Combi, manuel reg. (husk lad og vogn)",                      "T3330_725132"),
  t3330Item("725138", "CS-200 Combi, el reg. (husk lad og vogn)",                          "T3330_725138"),

  // — Øvrige Redskaber —
  { key: "T3330_OTHER",   parent_machine_key: "Timan 3330", name: headerName("Timan 3330", "OTHER_HEADER",  "Øvrige Redskaber"),   varenr: null, status: "available", isHeader: true },
  t3330Item("HGM-20083", "Fingerklipper for Termit-arm", "T3330_HGM20083"),
  t3330Item("HGM-20082", "Multitrimmer for Termit-arm",  "T3330_HGM20082"),
];

// Timan 2620: planning-only budget rows (NOT in configurator catalog, no prices).
// These are CRM Budget planning placeholders only.
const T2620_EQUIPMENT: EquipmentCategory[] = [
  { key: "T2620_FEJESUG",     parent_machine_key: "Timan 2620", name: { da: "Feje sug 2620",        en: "Sweep/Vac 2620",      de: "Kehr-/Saug 2620",       it: "Spazzatrice/Asp. 2620",   hu: "Seprő-szívó 2620" },     varenr: "123456", status: "preview" },
  { key: "T2620_GRAESKLIPPER", parent_machine_key: "Timan 2620", name: { da: "Græsklipper for 2620", en: "Mower for 2620",     de: "Rasenmäher für 2620",   it: "Tosaerba per 2620",       hu: "Fűnyíró 2620-hoz" },     varenr: "987654", status: "preview" },
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

// ---------- Custom (Budget-only) products ----------
// Created via the "Nyt varenr." flow on the CRM Budget page. These are
// CRM-Budget-only entries — they MUST NOT be added to the configurator
// product catalog ("Byg din Timan"), pricing or order flow.
export interface CustomBudgetProduct {
  key: string;                          // stable id (`cm_…` machine, `ce_…` equipment)
  type: "machine" | "attachment";
  name: string;
  varenr: string | null;
  parent_machine_key?: string | null;   // required when type === "attachment"
  seller_email?: string | null;         // optional owner; null = all sellers
  country?: string | null;
  created_at: string;
}
const LS_CUSTOM_PRODUCTS = "timan.crm.budget.customProducts.v1";
function readCustomProducts(): CustomBudgetProduct[] {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM_PRODUCTS) || "[]"); }
  catch { return []; }
}
function writeCustomProducts(rows: CustomBudgetProduct[]) {
  try { localStorage.setItem(LS_CUSTOM_PRODUCTS, JSON.stringify(rows)); } catch { /* */ }
}
export function listCustomProducts(): CustomBudgetProduct[] {
  return readCustomProducts();
}
export function createCustomProduct(input: Omit<CustomBudgetProduct, "key" | "created_at"> & { key?: string }): CustomBudgetProduct {
  const prefix = input.type === "machine" ? "cm_" : "ce_";
  const key = input.key || (prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3));
  const row: CustomBudgetProduct = {
    key,
    type: input.type,
    name: input.name,
    varenr: input.varenr ?? null,
    parent_machine_key: input.parent_machine_key ?? null,
    seller_email: input.seller_email ?? null,
    country: input.country ?? null,
    created_at: new Date().toISOString(),
  };
  const all = readCustomProducts();
  all.push(row);
  writeCustomProducts(all);
  return row;
}

/** All custom machine products (type === "machine"). */
export function customMachineProducts(): BudgetProduct[] {
  return readCustomProducts()
    .filter(p => p.type === "machine")
    .map<BudgetProduct>(p => ({
      key: p.key,
      name: p.name,
      varenr: p.varenr,
      category: "machine",
      status: "available",
    }));
}

/** All custom equipment grouped by parent machine key. */
export function customEquipmentByMachine(): Record<string, EquipmentCategory[]> {
  const map: Record<string, EquipmentCategory[]> = {};
  for (const p of readCustomProducts()) {
    if (p.type !== "attachment" || !p.parent_machine_key) continue;
    (map[p.parent_machine_key] ||= []).push({
      key: p.key,
      parent_machine_key: p.parent_machine_key,
      name: { da: p.name, en: p.name, de: p.name, it: p.name, hu: p.name },
      varenr: p.varenr,
      status: "available",
    });
  }
  return map;
}

export function findProduct(key: string): BudgetProduct | undefined {
  const stock = BUDGET_PRODUCTS.find(p => p.key === key);
  if (stock) return stock;
  const custom = readCustomProducts().find(p => p.key === key);
  if (!custom) return undefined;
  return {
    key: custom.key,
    name: custom.name,
    varenr: custom.varenr,
    category: custom.type === "machine" ? "machine" : "attachment",
    status: "available",
  };
}

// Storage (localStorage fallback)
// Bump suffix when changing seed shape so previews refresh.
const LS_LINES = "timan.crm.budget.lines.v6";
const LS_FORECASTS = "timan.crm.budget.forecasts.v6";
const LS_ACTUALS = "timan.crm.budget.actuals.v6";

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
  { initials: "NB",  full_name: "NB",  email: "nb@timan.dk",  country: "DK" },
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
  // Demo budget seed disabled — cleanup. Budget rows now come exclusively
  // from Supabase or rows the user creates. Empty state is the default.
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

// ---------- Per-seller / per-year budget lock ----------
// Each seller has their own lock status for a given year. When LOCKED:
//   - Backend cannot edit the gray Budget row for that seller/year
//   - Sellers cannot edit their own Arbejdsbudget (working forecast)
// When UNLOCKED:
//   - Backend can edit the gray Budget row + create new lines
//   - Sellers can edit their own Arbejdsbudget
//
// Default = locked (official budgets are locked until backend opens them).
// Stored in localStorage as a single map keyed by `${year}|${sellerEmail}`.
export interface SellerYearLock {
  year: number;
  seller_email: string;
  locked: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  unlocked_by?: string | null;
  unlocked_at?: string | null;
}

const LS_SELLER_LOCKS = "timan.crm.budget.sellerLocks.v1";

function readSellerLocks(): Record<string, SellerYearLock> {
  try { return JSON.parse(localStorage.getItem(LS_SELLER_LOCKS) || "{}"); }
  catch { return {}; }
}
function writeSellerLocks(map: Record<string, SellerYearLock>) {
  try { localStorage.setItem(LS_SELLER_LOCKS, JSON.stringify(map)); } catch { /* */ }
}
function lockKey(year: number, email: string): string {
  return `${year}|${email.toLowerCase()}`;
}

/** Sentinel used in `seller_email` for global (year-wide, all-sellers) lock. */
export const GLOBAL_LOCK_SCOPE = "ALL";

/** Returns the lock status for a given (year, sellerEmail). Default = locked.
 *  This is the RAW per-seller record — does NOT consider the global ALL lock.
 *  Use `getEffectiveLock` for the resolved status used by the UI. */
export function getSellerYearLock(year: number, sellerEmail: string | null | undefined): SellerYearLock {
  if (!sellerEmail) return { year, seller_email: "", locked: true };
  const map = readSellerLocks();
  const k = lockKey(year, sellerEmail);
  return map[k] ?? { year, seller_email: sellerEmail.toLowerCase(), locked: true };
}

/** Resolve the effective lock status for (year, seller). Most specific wins:
 *   1. seller/year explicit record
 *   2. global/year (ALL) record
 *   3. default = locked
 */
export function getEffectiveLock(year: number, sellerEmail: string | null | undefined): SellerYearLock {
  const map = readSellerLocks();
  if (sellerEmail) {
    const k = lockKey(year, sellerEmail);
    if (map[k]) return map[k];
  }
  const g = map[lockKey(year, GLOBAL_LOCK_SCOPE)];
  if (g) return { ...g, seller_email: (sellerEmail || "").toLowerCase() };
  return { year, seller_email: (sellerEmail || "").toLowerCase(), locked: true };
}

export function setSellerYearLock(
  year: number,
  sellerEmail: string,
  locked: boolean,
  who: string | null,
): SellerYearLock {
  const map = readSellerLocks();
  const k = lockKey(year, sellerEmail);
  const now = new Date().toISOString();
  const prev = map[k];
  const next: SellerYearLock = {
    year,
    seller_email: sellerEmail.toLowerCase(),
    locked,
    locked_by:    locked ? who : (prev?.locked_by ?? null),
    locked_at:    locked ? now : (prev?.locked_at ?? null),
    unlocked_by: !locked ? who : (prev?.unlocked_by ?? null),
    unlocked_at: !locked ? now : (prev?.unlocked_at ?? null),
  };
  map[k] = next;
  writeSellerLocks(map);
  return next;
}

/** Lock/unlock a whole year for ALL sellers (global override).
 *  Per-seller explicit records still win over this when present. */
export function setGlobalYearLock(
  year: number,
  locked: boolean,
  who: string | null,
): SellerYearLock {
  return setSellerYearLock(year, GLOBAL_LOCK_SCOPE, locked, who);
}

/** Clear the global (ALL) record for a year — falls back to per-seller / default. */
export function clearGlobalYearLock(year: number) {
  const map = readSellerLocks();
  delete map[lockKey(year, GLOBAL_LOCK_SCOPE)];
  writeSellerLocks(map);
}

// ---------- Budget audit entry helper ----------
// Writes a "arbejdsbudget_change" entry into the existing audit log store so
// Timan Backend can review who changed what in the budget module.
export interface BudgetAuditPayload {
  year: number;
  seller_initials: string | null;
  seller_name: string | null;
  product_name: string;
  item_number: string | null;
  month: string;          // localized short month label e.g. "Apr"
  old_value: number;
  new_value: number;
}

export function appendBudgetAuditEntry(p: BudgetAuditPayload) {
  if (typeof window === "undefined") return;
  try {
    const diff = p.new_value - p.old_value;
    const sign = diff >= 0 ? `+${diff}` : `${diff}`;
    const who = p.seller_initials || p.seller_name || "ukendt";
    appendAuditEntry({
      user: p.seller_name || p.seller_initials || "ukendt",
      action: "update",
      module: "Budget · Arbejdsbudget",
      record: `${p.year} · ${p.product_name}${p.item_number ? ` (${p.item_number})` : ""} · ${p.month}`,
      old_value: `qty: ${p.old_value}`,
      new_value: `qty: ${p.new_value} (${sign}) — ${who}`,
      ip: "internal",
      status: "success",
    });
  } catch { /* audit log is best-effort */ }
}


