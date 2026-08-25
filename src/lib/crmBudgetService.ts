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
import type { Language, LocalizedString, ConfiguratorState } from "@/types/configurator";
import { normalizeConfiguratorState } from "@/lib/configuratorState";
import { calcConfigurationTotals } from "@/lib/calcConfiguration";

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
  /** Exact per-month working forecast (length 12, Jan..Dec). When set, the UI
   *  must use these values verbatim and MUST NOT redistribute qty_forecast
   *  across the line's monthly_split. */
  monthly_qty?: number[] | null;
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
  /** Stable read/display dimensions for real submitted-order actuals.
   *  These MUST be used for CRM Budget order display instead of
   *  budget_line_id, because budget_line_id changes when planning rows are
   *  created/edited while real orders do not. */
  seller_key?: string | null;
  seller_email?: string | null;
  seller_initials?: string | null;
  year?: number | null;
  product_key?: string | null;
  /** Per-month qty (Jan..Dec, length 12) when derived from real orders.
   *  Empty/undefined when the source is the legacy crm_budget_sales_actuals
   *  table (which only knows annual totals). */
  monthly_qty?: number[];
  monthly_value?: number[];
  /** Per-month list of dealers contributing to that month's qty.
   *  Length 12 (Jan..Dec). Each entry is `{ name, qty }` per occurrence
   *  (duplicates intentional — UI groups them). Display only. */
  monthly_dealers?: Array<Array<{ name: string; qty: number }>>;
}

export type OrderActualsByKey = Record<string, number>;

export function orderActualSellerKey(sellerInitialsOrEmail: string | null | undefined): string {
  return norm(sellerInitialsOrEmail);
}

export function orderActualProductKey(productKey: string | null | undefined): string {
  return normKey(productKey);
}

export function orderActualKey(
  sellerInitialsOrEmail: string | null | undefined,
  year: number,
  monthIdx: number,
  productKey: string | null | undefined,
): string {
  return [orderActualSellerKey(sellerInitialsOrEmail), year, monthIdx, orderActualProductKey(productKey)].join("|");
}

function splitAnnualEvenly(qty: number): number[] {
  const floors = Array.from({ length: 12 }, () => Math.floor((Number(qty) || 0) / 12));
  let rem = Math.max(0, Math.round(Number(qty) || 0) - floors.reduce((a, b) => a + b, 0));
  for (let i = 0; i < 12 && rem > 0; i++, rem--) floors[i] += 1;
  return floors;
}

export function buildOrderActualsByKey(actuals: SalesActual[]): OrderActualsByKey {
  const out: OrderActualsByKey = {};
  for (const a of actuals) {
    if (!a.product_key || !a.year) continue;
    const sellerKeys = Array.from(new Set([a.seller_key, a.seller_email, a.seller_initials]
      .map(k => orderActualSellerKey(k))
      .filter(Boolean)));
    if (sellerKeys.length === 0) continue;
    const monthly = (a.monthly_qty && a.monthly_qty.length === 12)
      ? a.monthly_qty
      : splitAnnualEvenly(a.qty_sold || 0);
    for (let m = 0; m < 12; m++) {
      for (const sellerKey of sellerKeys) {
        const k = orderActualKey(sellerKey, a.year, m, a.product_key);
        out[k] = (out[k] || 0) + (monthly[m] || 0);
      }
    }
  }
  return out;
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

export class BudgetPersistenceError extends Error {
  constructor(message: string, public readonly table: string, public readonly cause?: unknown) {
    super(message);
    this.name = "BudgetPersistenceError";
  }
}

function errorText(error: unknown): string {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  try { return JSON.stringify(error); } catch { return String(error); }
}

function uid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* */ }
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
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

type BudgetOrderRow = Record<string, unknown>;

interface SellerIdentityIndex {
  byId: Map<string, BudgetSellerRef>;
  byEmail: Map<string, BudgetSellerRef>;
  byInitials: Map<string, BudgetSellerRef>;
}

const normKey = (s: string | null | undefined) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const upper = (s: string | null | undefined) => (s || "").trim().toUpperCase();

function buildProductLookup(): Map<string, string> {
  const productByNormKey = new Map<string, string>();
  for (const [key, p] of Object.entries(PRODUCTS)) {
    productByNormKey.set(normKey(key), key);
    if (p.varenr) productByNormKey.set(normKey(p.varenr), key);
  }
  for (const p of BUDGET_PRODUCTS) {
    productByNormKey.set(normKey(p.key), p.key);
    if (p.varenr) productByNormKey.set(normKey(p.varenr), p.key);
  }
  return productByNormKey;
}

function resolveMachineKey(value: string | null | undefined, productByNormKey: Map<string, string>): string | null {
  const n = normKey(value);
  if (!n) return null;
  if (productByNormKey.has(n)) return productByNormKey.get(n)!;
  let best: string | null = null;
  for (const [candidate, key] of productByNormKey.entries()) {
    if (candidate.length < 4) continue;
    if (n.includes(candidate) && (!best || candidate.length > normKey(best).length)) best = key;
  }
  return best;
}

function orderDateRaw(row: BudgetOrderRow): string | null {
  return (row.order_sent_at as string | null)
    || (row.submitted_at as string | null)
    || (row.created_at as string | null)
    || null;
}

function orderIsInYear(row: BudgetOrderRow, year: number): boolean {
  const raw = orderDateRaw(row);
  const d = raw ? new Date(raw) : null;
  return !!d && !isNaN(d.getTime()) && d.getFullYear() === year;
}

function parseOrderState(row: BudgetOrderRow): ConfiguratorState | null {
  try {
    const raw = row.state_json;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const state = normalizeConfiguratorState(parsed as Partial<ConfiguratorState>);
      if (Array.isArray(state.machineConfigs) && state.machineConfigs.length > 0) return state;
    }
  } catch { /* ignore */ }
  try {
    const noteRaw = row.note;
    const noteParsed = typeof noteRaw === "string" ? JSON.parse(noteRaw) : noteRaw;
    if (noteParsed && typeof noteParsed === "object") {
      const inner = (noteParsed as Record<string, unknown>).state ?? noteParsed;
      const state = normalizeConfiguratorState(inner as Partial<ConfiguratorState>);
      if (Array.isArray(state.machineConfigs) && state.machineConfigs.length > 0) return state;
    }
  } catch { /* ignore */ }
  return null;
}

function machineQtyFromOrder(row: BudgetOrderRow, productByNormKey: Map<string, string>): { qtyByKey: Record<string, number>; totalQty: number } {
  const qtyByKey: Record<string, number> = {};
  let totalQty = 0;
  const state = parseOrderState(row);
  if (state) {
    for (const mc of state.machineConfigs ?? []) {
      const machineKey = resolveMachineKey(mc?.type, productByNormKey) || mc?.type;
      if (!machineKey) continue;
      const qty = Number(mc.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      qtyByKey[machineKey] = (qtyByKey[machineKey] || 0) + qty;
      totalQty += qty;
    }
  }
  if (totalQty === 0) {
    const fromTitle = resolveMachineKey(row.title as string | null, productByNormKey);
    if (fromTitle) {
      qtyByKey[fromTitle] = 1;
      totalQty = 1;
    }
  }
  return { qtyByKey, totalQty };
}

async function loadSellerIdentityIndex(): Promise<SellerIdentityIndex> {
  const byId = new Map<string, BudgetSellerRef>();
  const byEmail = new Map<string, BudgetSellerRef>();
  const byInitials = new Map<string, BudgetSellerRef>();
  for (const s of BUDGET_SELLERS) {
    byEmail.set(norm(s.email), s);
    byInitials.set(upper(s.initials), s);
  }
  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("id,email")
      .in("email", BUDGET_SELLERS.map((s) => s.email));
    if (!error) {
      for (const row of (data ?? []) as Array<{ id?: string | null; email?: string | null }>) {
        const seller = row.email ? byEmail.get(norm(row.email)) : undefined;
        if (seller && row.id) byId.set(String(row.id), seller);
      }
    }
  } catch { /* seller-id matching is best effort; email/initials still work */ }
  return { byId, byEmail, byInitials };
}

function orderSeller(row: BudgetOrderRow, sellers: SellerIdentityIndex): { seller: BudgetSellerRef | null; ownerKeys: string[] } {
  const assignedId = (row.assigned_seller_id as string | null) || null;
  const sellerEmail = norm(row.seller_email as string | null);
  const sellerInitials = upper(row.seller_initials as string | null);
  const seller = (assignedId ? sellers.byId.get(assignedId) : undefined)
    || (sellerEmail ? sellers.byEmail.get(sellerEmail) : undefined)
    || (sellerInitials ? sellers.byInitials.get(sellerInitials) : undefined)
    || null;
  const ownerKeys = new Set<string>();
  if (assignedId) ownerKeys.add(`id:${assignedId}`);
  if (sellerEmail) ownerKeys.add(`email:${sellerEmail}`);
  if (sellerInitials) ownerKeys.add(`ini:${sellerInitials}`);
  if (seller) {
    ownerKeys.add(`email:${norm(seller.email)}`);
    ownerKeys.add(`ini:${upper(seller.initials)}`);
  }
  return { seller, ownerKeys: Array.from(ownerKeys) };
}

async function fetchBudgetOrderRows(year: number): Promise<BudgetOrderRow[]> {
  const columns = "id,title,order_number,seller_email,seller_initials,seller_name,assigned_seller_id,order_sent_at,submitted_at,created_at,case_status,document_type,dealer_name,dealer_company_name,dealer_number,dealer_account_number";
  try {
    const { data, error } = await supabase
      .from("crm_configurations_view")
      .select(columns)
      .or("document_type.eq.order,case_status.eq.ordre_afgivet")
      .eq("case_status", "ordre_afgivet")
      .neq("case_status", "deleted")
      .limit(5000);
    if (error) throw error;
    const rows = ((data ?? []) as unknown as BudgetOrderRow[]).filter((r) => orderIsInYear(r, year));
    if (rows.length === 0) return [];

    const ids = rows.map((r) => String(r.id));
    let details: BudgetOrderRow[] = [];
    const trySel = async (cols: string) => supabase.from("configurations").select(cols).in("id", ids);
    let detailRes = await trySel("id,state_json,note,total_price,case_type,document_type");
    if (detailRes.error && /state_json/.test(detailRes.error.message || "")) {
      detailRes = await trySel("id,note,total_price,case_type,document_type");
    }
    if (!detailRes.error) details = (detailRes.data ?? []) as unknown as BudgetOrderRow[];
    const detailById = new Map(details.map((r) => [String(r.id), r]));
    return rows.map((r) => ({ ...(detailById.get(String(r.id)) || {}), ...r }));
  } catch {
    const trySel = async (cols: string) => supabase
      .from("configurations")
      .select(cols)
      .or("document_type.eq.order,case_type.eq.order")
      .eq("case_status", "ordre_afgivet")
      .neq("case_status", "deleted")
      .limit(5000);
    let res = await trySel("id,title,order_number,state_json,note,total_price,seller_email,seller_initials,seller_name,assigned_seller_id,order_sent_at,submitted_at,created_at,case_status,document_type,case_type,dealer_name,dealer_company_name,dealer_number,dealer_account_number");
    if (res.error && /state_json/.test(res.error.message || "")) {
      res = await trySel("id,title,order_number,note,total_price,seller_email,seller_initials,seller_name,assigned_seller_id,order_sent_at,submitted_at,created_at,case_status,document_type,case_type,dealer_name,dealer_company_name,dealer_number,dealer_account_number");
    }
    if (res.error) throw res.error;
    return ((res.data ?? []) as unknown as BudgetOrderRow[]).filter((r) => orderIsInYear(r, year));
  }
}

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
  // Try Supabase first. If the live table responds, it is the source of truth
  // even when it returns zero rows; do not resurrect stale local fallback rows.
  try {
    const { data, error } = await supabase
      .from("crm_budget_lines")
      .select("*")
      .eq("year", year);
    if (!error && Array.isArray(data)) {
      return sanitizeLines(data as BudgetLine[]);
    }
    if (error) console.error("[budget] Supabase read failed for crm_budget_lines", error);
  } catch (error) { console.error("[budget] Supabase read failed for crm_budget_lines", error); }
  return [];
}

async function readBudgetLineById(id: string): Promise<BudgetLine | null> {
  const { data, error } = await supabase
    .from("crm_budget_lines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? sanitizeLines([data as BudgetLine])[0] : null;
}

async function findBudgetLineByStableScope(line: Pick<BudgetLine, "year" | "product_key" | "seller_email">): Promise<BudgetLine | null> {
  if (!line.seller_email) return null;
  const { data, error } = await supabase
    .from("crm_budget_lines")
    .select("*")
    .eq("year", line.year)
    .eq("product_key", line.product_key)
    .ilike("seller_email", line.seller_email)
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data[0] ? sanitizeLines([data[0] as BudgetLine])[0] : null;
}

export async function listForecasts(year: number): Promise<BudgetForecast[]> {
  try {
    const { data, error } = await supabase
      .from("crm_budget_forecasts")
      .select("*");
    if (!error && Array.isArray(data)) {
      // We don't store year on forecasts — they reference lines.
      const lines = await listBudgetLines({ year });
      const ids = new Set(lines.map(l => l.id));
      return (data as BudgetForecast[]).filter(f => ids.has(f.budget_line_id));
    }
    if (error) console.error("[budget] Supabase read failed for crm_budget_forecasts", error);
  } catch (error) { console.error("[budget] Supabase read failed for crm_budget_forecasts", error); }
  return [];
}

async function readForecastByLineId(budgetLineId: string): Promise<BudgetForecast | null> {
  const { data, error } = await supabase
    .from("crm_budget_forecasts")
    .select("*")
    .eq("budget_line_id", budgetLineId)
    .maybeSingle();
  if (error) throw error;
  return (data as BudgetForecast | null) ?? null;
}

export async function listSalesActuals(year: number): Promise<SalesActual[]> {
  // Primary source for actuals: configurator orders (same source as
  // CRM → Ordrer). This guarantees Budget progress matches the Orders list.
  // Any rows in crm_budget_sales_actuals are merged on top (used for
  // historical / non-configurator manual sales).
  const fromOrders = await deriveActualsFromOrders(year);

  let fromTable: SalesActual[] = [];
  try {
    const { data, error } = await supabase
      .from("crm_budget_sales_actuals")
      .select("*");
    if (!error && Array.isArray(data) && data.length > 0) {
      const lines = await listBudgetLines({ year });
      const ids = new Set(lines.map(l => l.id));
      fromTable = (data as SalesActual[]).filter(a => ids.has(a.budget_line_id));
    }
  } catch { /* */ }

  if (fromOrders.length === 0 && fromTable.length === 0) return [];

  // Merge by budget_line_id — orders source wins (it is the live truth).
  const merged = new Map<string, SalesActual>();
  for (const row of fromTable) merged.set(row.budget_line_id, { ...row });
  for (const row of fromOrders) {
    const prev = merged.get(row.budget_line_id);
    if (!prev) {
      merged.set(row.budget_line_id, { ...row });
      continue;
    }
    const m_qty = row.monthly_qty ?? prev.monthly_qty;
    const m_val = row.monthly_value ?? prev.monthly_value;
    merged.set(row.budget_line_id, {
      budget_line_id: row.budget_line_id,
      qty_sold: prev.qty_sold + row.qty_sold,
      value_sold: prev.value_sold + row.value_sold,
      monthly_qty: m_qty,
      monthly_value: m_val,
    });
  }
  return Array.from(merged.values());
}

/**
 * Build sales actuals by walking configurator orders (the same scoped
 * source the CRM Orders page uses). Each order contributes:
 *   • qty_sold  → sum of state.machineConfigs[*].qty per machine_type
 *   • value_sold → calcConfigurationTotals(state).finalPrice, allocated
 *                  proportionally per machine when there are multiple types
 * Stored under a stable read key whose display identity is
 * (seller, year, product_key, month). The legacy budget_line_id field is kept
 * only for compatibility and is deliberately NOT a real budget line id.
 */
async function deriveActualsFromOrders(year: number): Promise<SalesActual[]> {
  try {
    const sellers = await loadSellerIdentityIndex();
    const productByNormKey = buildProductLookup();

    const data = await fetchBudgetOrderRows(year);
    const totals = new Map<string, SalesActual>();
    const ZERO12 = () => Array.from({ length: 12 }, () => 0);
    for (const row of data) {
      const status = (row.case_status as string | null) || "";
      if (status === "deleted" || status !== "ordre_afgivet") continue;

      // Month bucketing: order_sent_at → submitted_at → created_at. Delivery
      // date is deliberately not required for Budget actuals.
      const dateRaw = orderDateRaw(row);
      const d = dateRaw ? new Date(dateRaw) : null;
      if (!d || isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year) continue;
      const monthIdx = d.getMonth();

      const { seller } = orderSeller(row, sellers);
      if (!seller) continue;
      const state = parseOrderState(row);

      // Value can be 0 — qty must still be counted.
      let finalPrice = 0;
      if (state) {
        try { finalPrice = calcConfigurationTotals(state).finalPrice || 0; } catch { /* */ }
      }
      if (!finalPrice) {
        const tp = Number(row.total_price ?? 0);
        if (Number.isFinite(tp) && tp > 0) finalPrice = tp;
      }

      const { qtyByKey, totalQty } = machineQtyFromOrder(row, productByNormKey);
      if (totalQty === 0) continue;

      for (const [machineKey, qty] of Object.entries(qtyByKey)) {
        const value = finalPrice * (qty / totalQty);
        const actualId = `actual_${year}_${machineKey}_${seller.email.replace(/[^a-z0-9]/gi, "")}`;
        const prev = totals.get(actualId) || {
          budget_line_id: actualId,
          qty_sold: 0,
          value_sold: 0,
          seller_key: seller.email,
          seller_email: seller.email,
          seller_initials: seller.initials,
          year,
          product_key: machineKey,
          monthly_qty: ZERO12(),
          monthly_value: ZERO12(),
          monthly_dealers: Array.from({ length: 12 }, () => [] as Array<{ name: string; qty: number }>),
        };
        prev.qty_sold += qty;
        prev.value_sold += value;
        if (!prev.monthly_qty) prev.monthly_qty = ZERO12();
        if (!prev.monthly_value) prev.monthly_value = ZERO12();
        if (!prev.monthly_dealers) prev.monthly_dealers = Array.from({ length: 12 }, () => [] as Array<{ name: string; qty: number }>);
        prev.monthly_qty[monthIdx] += qty;
        prev.monthly_value[monthIdx] += value;
        const dealerName =
          (row.dealer_name as string | null) ||
          (row.dealer_company_name as string | null) ||
          (row.dealer_number as string | null) ||
          (row.dealer_account_number as string | null) ||
          "—";
        prev.monthly_dealers[monthIdx].push({ name: String(dealerName).trim() || "—", qty });
        totals.set(actualId, prev);
      }
    }
    return Array.from(totals.values());
  } catch (e) {
    console.warn("[deriveActualsFromOrders] failed:", e);
    return [];
  }
}

export async function upsertBudgetLine(line: BudgetLine): Promise<BudgetLine> {
  try {
    const row = {
      id: line.id,
      year: line.year,
      product_key: line.product_key,
      product_name: line.product_name,
      item_number: line.item_number ?? null,
      category: line.category,
      parent_machine_key: line.parent_machine_key ?? null,
      seller_id: line.seller_id ?? null,
      seller_name: line.seller_name ?? null,
      seller_email: line.seller_email ?? null,
      seller_initials: line.seller_initials ?? null,
      country: line.country ?? null,
      qty_budget: line.qty_budget,
      value_budget: line.value_budget,
      monthly_split: line.monthly_split && line.monthly_split.length === 12 ? line.monthly_split : EVEN_SPLIT,
      notes: line.notes ?? null,
      locked: line.locked,
      locked_by: line.locked_by ?? null,
      locked_at: line.locked_at ?? null,
    };
    const { error } = await supabase.from("crm_budget_lines").upsert(row).select("*").maybeSingle();
    if (error) throw error;
    const saved = await readBudgetLineById(line.id);
    if (!saved || saved.qty_budget !== line.qty_budget || saved.value_budget !== line.value_budget) {
      throw new BudgetPersistenceError("Budget line readback did not match saved values", "crm_budget_lines", { saved, expected: line });
    }
    return saved;
  } catch (error) {
    throw error instanceof BudgetPersistenceError
      ? error
      : new BudgetPersistenceError(`Budget line was not saved to Supabase: ${errorText(error)}`, "crm_budget_lines", error);
  }
}

export async function createBudgetLine(input: Omit<BudgetLine, "id" | "created_at" | "locked">): Promise<BudgetLine> {
  if (!input.seller_email) {
    throw new BudgetPersistenceError("Budget line requires seller_email before saving", "crm_budget_lines");
  }
  try {
    const existing = await findBudgetLineByStableScope(input);
    if (existing) return existing;
    const line: BudgetLine = {
      ...input,
      id: uid(),
      created_at: new Date().toISOString(),
      locked: false,
      monthly_split: input.monthly_split && input.monthly_split.length === 12 ? input.monthly_split : EVEN_SPLIT,
    };
    return await upsertBudgetLine(line);
  } catch (error) {
    throw error instanceof BudgetPersistenceError
      ? error
      : new BudgetPersistenceError(`Budget line was not created in Supabase: ${errorText(error)}`, "crm_budget_lines", error);
  }
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
  // Try Supabase first. We upsert by budget_line_id (UNIQUE in the schema).
  // If the column monthly_qty is missing (older DB), retry without it.
  try {
    const baseRow = {
      budget_line_id: forecast.budget_line_id,
      qty_forecast: forecast.qty_forecast,
      value_forecast: forecast.value_forecast,
      comments: forecast.comments ?? null,
      expected_timing: forecast.expected_timing ?? null,
      risk_level: forecast.risk_level ?? null,
      probability: forecast.probability ?? null,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>;
    const withMonthly = { ...baseRow, monthly_qty: forecast.monthly_qty ?? null };
    let { data, error } = await supabase
      .from("crm_budget_forecasts")
      .upsert(withMonthly, { onConflict: "budget_line_id" })
      .select("*")
      .maybeSingle();
    if (error && /monthly_qty/.test(error.message || "")) {
      const retry = await supabase
        .from("crm_budget_forecasts")
        .upsert(baseRow, { onConflict: "budget_line_id" })
        .select("*")
        .maybeSingle();
      data = retry.data; error = retry.error;
    }
    if (error) throw error;
    const saved = (data as BudgetForecast | null) ?? await readForecastByLineId(forecast.budget_line_id);
    const expectedMonthly = forecast.monthly_qty ?? null;
    const savedMonthly = saved?.monthly_qty ?? null;
    const monthlyMatches = !expectedMonthly || (
      Array.isArray(savedMonthly)
      && savedMonthly.length === 12
      && expectedMonthly.every((v, i) => Number(savedMonthly[i] || 0) === Number(v || 0))
    );
    if (!saved || saved.qty_forecast !== forecast.qty_forecast || !monthlyMatches) {
      throw new BudgetPersistenceError("Forecast readback did not match saved values", "crm_budget_forecasts", { saved, expected: forecast });
    }
    return { ...saved, monthly_qty: expectedMonthly ?? saved.monthly_qty ?? null };
  } catch (error) {
    throw error instanceof BudgetPersistenceError
      ? error
      : new BudgetPersistenceError(`Forecast was not saved to Supabase: ${errorText(error)}`, "crm_budget_forecasts", error);
  }
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
// Writes a structured audit entry (record_type='crm_budget') with jsonb
// old/new value snapshots. The cell_key uniquely identifies the cell so the
// CRM Budget cell-history popover can match exactly the right row.
export type BudgetType = "budget" | "arbejdsbudget";

export interface BudgetAuditPayload {
  year: number;
  seller_initials: string | null;
  seller_name: string | null;
  seller_email?: string | null;
  product_key?: string | null;
  product_name: string;
  item_number: string | null;
  month_idx: number;       // 0..11
  month: string;           // localized short month label e.g. "Apr"
  budget_type: BudgetType;
  old_value: number;
  new_value: number;
  actor_email?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  active_mode?: string | null;
}

export function budgetCellKey(p: {
  year: number;
  seller_initials: string | null;
  product_code: string | null;
  month_idx: number;
  budget_type: BudgetType;
}): string {
  const seller = (p.seller_initials || "—").toUpperCase();
  const code = (p.product_code || "—").toUpperCase();
  return `${p.year}|${seller}|${code}|${String(p.month_idx).padStart(2, "0")}|${p.budget_type}`;
}

export function appendBudgetAuditEntry(p: BudgetAuditPayload) {
  if (typeof window === "undefined") return;
  try {
    const product_code = p.item_number || p.product_key || p.product_name;
    const cell_key = budgetCellKey({
      year: p.year,
      seller_initials: p.seller_initials,
      product_code,
      month_idx: p.month_idx,
      budget_type: p.budget_type,
    });
    const typeLabel = p.budget_type === "budget" ? "Budget" : "Arbejdsbudget";
    const sellerLabel = p.seller_initials || p.seller_name || "—";
    const codeLabel = p.item_number || p.product_name;
    const record_label = `${p.year} · ${sellerLabel} · ${codeLabel} · ${p.month} · ${typeLabel}`;
    const snapshot = {
      cell_key,
      year: p.year,
      seller_initials: p.seller_initials,
      seller_name: p.seller_name,
      product_key: p.product_key ?? null,
      product_name: p.product_name,
      item_number: p.item_number,
      month_idx: p.month_idx,
      month: p.month,
      budget_type: p.budget_type,
    };
    appendAuditEntry({
      action: "update",
      module: "Budget",
      record_type: "crm_budget",
      record_id: cell_key,
      record_label,
      seller_context: p.seller_email || p.seller_initials || null,
      actor_email: p.actor_email ?? null,
      actor_name: p.actor_name ?? p.seller_name ?? p.seller_initials ?? null,
      actor_role: p.actor_role ?? null,
      active_mode: p.active_mode ?? null,
      old_value: { ...snapshot, value: p.old_value },
      new_value: { ...snapshot, value: p.new_value, change: p.new_value - p.old_value },
      status: "success",
    });
    } catch { /* audit log is best-effort */ }
}

// ─────────────────────────────────────────────────────────────
// Shared Budget aggregation — single source of truth used by
// CRM → Budget AND the CRM Dashboard widgets (Budget Focus,
// Seller Comparison, Budget Score, alerts). Do NOT duplicate.
// ─────────────────────────────────────────────────────────────

export interface BudgetMachineRollup {
  product_key: string;
  product_name: string;
  budgetQty: number;
  ordersQty: number;       // actuals from configurator orders + manual table
  forecastQty: number;
  remainingGap: number;
  scorePct: number;        // ordersQty / budgetQty * 100, 0 when no budget
}

export interface AggregatedBudget {
  byMachine: BudgetMachineRollup[];
  totals: { budgetQty: number; ordersQty: number; forecastQty: number; scorePct: number };
}

/**
 * Scope budget lines + actuals + forecasts to a single seller using the
 * same rules CrmBudgetPage uses (seller_email match OR seed_<year>_<key>_<emailSlug>).
 * `sellerEmail = null` returns the global (all-sellers) view.
 */
export function aggregateBudget(
  lines: BudgetLine[],
  forecasts: BudgetForecast[],
  actuals: SalesActual[],
  sellerEmail: string | null,
): AggregatedBudget {
  const scopedLines = sellerEmail
    ? lines.filter(l => (l.seller_email || "").toLowerCase() === sellerEmail.toLowerCase())
    : lines;
  const scopedLineIds = new Set(scopedLines.map(l => l.id));
  const sellerRef = sellerEmail
    ? BUDGET_SELLERS.find(s => norm(s.email) === norm(sellerEmail))
    : null;
  const scopedActuals = actuals.filter(a => {
    if (!a.product_key || !a.year) return false;
    if (!sellerEmail) return true;
    return norm(a.seller_email) === norm(sellerEmail)
      || norm(a.seller_key) === norm(sellerEmail)
      || (!!sellerRef && upper(a.seller_initials) === upper(sellerRef.initials));
  });
  const scopedForecasts = forecasts.filter(f => scopedLineIds.has(f.budget_line_id));

  // Determine all machine product_keys we should display: those with budget
  // lines (scoped) AND those that have actual orders (so a machine with
  // orders but no budget still shows, instead of "Intet budget" hiding it).
  const productMeta = new Map<string, string>(); // key → name
  for (const l of scopedLines) productMeta.set(l.product_key, l.product_name || l.product_key);
  for (const a of scopedActuals) {
    const pk = a.product_key;
    const product = BUDGET_PRODUCTS.find(p => normKey(p.key) === normKey(pk));
    productMeta.set(pk, (product?.name as string) || pk);
  }

  const byMachine: BudgetMachineRollup[] = [];
  for (const [pk, name] of productMeta) {
    const linesFor = scopedLines.filter(l => l.product_key === pk);
    const lineIds = new Set(linesFor.map(l => l.id));
    const budgetQty = linesFor.reduce((s, l) => s + (l.qty_budget || 0), 0);
    const ordersQty = scopedActuals
      .filter(a => normKey(a.product_key) === normKey(pk))
      .reduce((s, a) => s + (a.qty_sold || 0), 0);
    const forecastQty = scopedForecasts
      .filter(f => lineIds.has(f.budget_line_id))
      .reduce((s, f) => s + (f.qty_forecast || 0), 0);
    const remainingGap = Math.max(0, budgetQty - ordersQty);
    const scorePct = budgetQty === 0 ? 0 : Math.round((ordersQty / budgetQty) * 100);
    byMachine.push({ product_key: pk, product_name: name, budgetQty, ordersQty, forecastQty, remainingGap, scorePct });
  }

  // Stable order: machines from BUDGET_PRODUCTS first, then any extras.
  const order = new Map(BUDGET_PRODUCTS.map((p, i) => [p.key, i]));
  byMachine.sort((a, b) =>
    (order.get(a.product_key) ?? 999) - (order.get(b.product_key) ?? 999)
    || a.product_name.localeCompare(b.product_name));

  const totals = byMachine.reduce(
    (t, r) => {
      t.budgetQty += r.budgetQty;
      t.ordersQty += r.ordersQty;
      t.forecastQty += r.forecastQty;
      return t;
    },
    { budgetQty: 0, ordersQty: 0, forecastQty: 0, scorePct: 0 },
  );
  totals.scorePct = totals.budgetQty === 0 ? 0 : Math.round((totals.ordersQty / totals.budgetQty) * 100);
  return { byMachine, totals };
}

// ════════════════════════════════════════════════════════════════════════
// Phase 35 — Dealer-level budget lines (crm_budget_dealer_lines)
//
// Foundation only. CRM Budget page and Budget Dashboard are unchanged;
// these helpers are for the upcoming admin importer and for read-models
// that want to attribute budget to a dealer. Supabase-first with mandatory
// readback verification, mirroring upsertBudgetLine.
// ════════════════════════════════════════════════════════════════════════

export interface BudgetDealerLine {
  id: string;
  year: number;
  month_idx: number;             // 0..11
  seller_id: string | null;
  seller_name: string | null;
  seller_email: string;
  seller_initials: string | null;
  dealer_account_id: string | null;
  dealer_account_number: string | null;
  dealer_name: string | null;
  dealer_name_norm: string | null;
  product_key: string;
  product_name: string | null;
  item_number: string | null;
  qty: number;
  excluded_from_total: boolean;
  import_source: string | null;
  import_batch_id: string | null;
  imported_at?: string | null;
  imported_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type BudgetDealerLineInput = Omit<BudgetDealerLine,
  "id" | "created_at" | "updated_at" | "imported_at"
> & { id?: string };

/** Lowercase, strip company suffixes/punctuation/whitespace. Used as the
 *  dealer fallback identity when no dealer_account_id is known. */
export function normalizeDealerName(name: string | null | undefined): string | null {
  if (!name) return null;
  const stripped = String(name)
    .toLowerCase()
    .replace(/\b(gmbh|ltd|aps|a\/s|ab|inc|llc|bv|sa|srl|kg|ohg|co\.?|ag|nv|s\.r\.o\.?)\b/gi, " ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return stripped || null;
}

export async function listBudgetDealerLines(year: number): Promise<BudgetDealerLine[]> {
  try {
    const { data, error } = await supabase
      .from("crm_budget_dealer_lines")
      .select("*")
      .eq("year", year);
    if (error) {
      console.error("[budget] Supabase read failed for crm_budget_dealer_lines", error);
      return [];
    }
    return Array.isArray(data) ? (data as BudgetDealerLine[]) : [];
  } catch (error) {
    console.error("[budget] Supabase read failed for crm_budget_dealer_lines", error);
    return [];
  }
}

async function readBudgetDealerLineByIdentity(
  row: Pick<BudgetDealerLine, "year" | "month_idx" | "seller_email" | "product_key" | "dealer_account_id" | "dealer_name_norm">,
): Promise<BudgetDealerLine | null> {
  let q = supabase
    .from("crm_budget_dealer_lines")
    .select("*")
    .eq("year", row.year)
    .eq("month_idx", row.month_idx)
    .ilike("seller_email", row.seller_email)
    .eq("product_key", row.product_key);
  q = row.dealer_account_id
    ? q.eq("dealer_account_id", row.dealer_account_id)
    : q.is("dealer_account_id", null).eq("dealer_name_norm", row.dealer_name_norm ?? "");
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return Array.isArray(data) && data[0] ? (data[0] as BudgetDealerLine) : null;
}

export async function upsertBudgetDealerLine(input: BudgetDealerLineInput): Promise<BudgetDealerLine> {
  if (!input.seller_email) {
    throw new BudgetPersistenceError("Dealer budget line requires seller_email", "crm_budget_dealer_lines");
  }
  if (!input.product_key) {
    throw new BudgetPersistenceError("Dealer budget line requires product_key", "crm_budget_dealer_lines");
  }
  if (input.month_idx < 0 || input.month_idx > 11) {
    throw new BudgetPersistenceError("Dealer budget line month_idx must be 0..11", "crm_budget_dealer_lines");
  }
  const row: Record<string, unknown> = {
    id: input.id ?? uid(),
    year: input.year,
    month_idx: input.month_idx,
    seller_id: input.seller_id ?? null,
    seller_name: input.seller_name ?? null,
    seller_email: input.seller_email,
    seller_initials: input.seller_initials ?? null,
    dealer_account_id: input.dealer_account_id ?? null,
    dealer_account_number: input.dealer_account_number ?? null,
    dealer_name: input.dealer_name ?? null,
    dealer_name_norm: input.dealer_name_norm ?? normalizeDealerName(input.dealer_name),
    product_key: input.product_key,
    product_name: input.product_name ?? null,
    item_number: input.item_number ?? null,
    qty: Number.isFinite(input.qty) ? Math.trunc(input.qty) : 0,
    excluded_from_total: !!input.excluded_from_total,
    import_source: input.import_source ?? null,
    import_batch_id: input.import_batch_id ?? null,
    imported_by: input.imported_by ?? null,
  };
  try {
    const { error } = await supabase
      .from("crm_budget_dealer_lines")
      .upsert(row)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    const saved = await readBudgetDealerLineByIdentity({
      year: input.year,
      month_idx: input.month_idx,
      seller_email: input.seller_email,
      product_key: input.product_key,
      dealer_account_id: input.dealer_account_id ?? null,
      dealer_name_norm: (row.dealer_name_norm as string | null) ?? null,
    });
    if (!saved || saved.qty !== row.qty || !!saved.excluded_from_total !== !!row.excluded_from_total) {
      throw new BudgetPersistenceError(
        "Dealer budget line readback did not match saved values",
        "crm_budget_dealer_lines",
        { saved, expected: row },
      );
    }
    return saved;
  } catch (error) {
    throw error instanceof BudgetPersistenceError
      ? error
      : new BudgetPersistenceError(
          `Dealer budget line was not saved to Supabase: ${errorText(error)}`,
          "crm_budget_dealer_lines",
          error,
        );
  }
}

export async function upsertBudgetDealerLines(rows: BudgetDealerLineInput[]): Promise<BudgetDealerLine[]> {
  const out: BudgetDealerLine[] = [];
  for (const r of rows) out.push(await upsertBudgetDealerLine(r));
  return out;
}

/** Sum dealer-line qty per (seller_email, year, product_key, month_idx),
 *  honouring excluded_from_total. Useful for dashboard/import preview. */
export function summarizeDealerLines(rows: BudgetDealerLine[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.excluded_from_total) continue;
    const k = `${(r.seller_email || "").toLowerCase()}|${r.year}|${r.product_key}|${r.month_idx}`;
    out.set(k, (out.get(k) || 0) + (r.qty || 0));
  }
  return out;
}

// ------------------------------------------------------------------
// Phase 35 / Step 5 — pure aggregation helpers used by CRM Budget
// page and Budget Dashboard. Kept side-effect free so they can be
// unit-tested without Supabase.
// ------------------------------------------------------------------

function productKeysEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

/** Returns 12 numbers (Jan..Dec) summing dealer-line qty for the given
 *  product, scoped to the supplied seller emails. Pass `null` to include
 *  every seller. Rows with `excluded_from_total = true` and qty <= 0 are
 *  ignored (they exist only as "imported but not counted" markers). */
export function aggregateDealerBudgetMonthly(
  rows: BudgetDealerLine[],
  productKey: string,
  sellerEmails: Set<string> | null,
): number[] {
  const out = Array.from({ length: 12 }, () => 0);
  for (const r of rows) {
    if (r.excluded_from_total) continue;
    if (!r.qty || r.qty <= 0) continue;
    if (!productKeysEqual(r.product_key, productKey)) continue;
    if (sellerEmails && !sellerEmails.has((r.seller_email || "").toLowerCase())) continue;
    if (r.month_idx < 0 || r.month_idx > 11) continue;
    out[r.month_idx] += r.qty;
  }
  return out;
}

/** Returns 12 booleans — true when at least one non-excluded dealer line
 *  exists for that (product, seller-scope, month). Used to decide whether
 *  the manual `crm_budget_lines` value should be replaced for that month
 *  (preventing double counting). */
export function hasDealerBudgetByMonth(
  rows: BudgetDealerLine[],
  productKey: string,
  sellerEmails: Set<string> | null,
): boolean[] {
  const out = Array.from({ length: 12 }, () => false);
  for (const r of rows) {
    if (r.excluded_from_total) continue;
    if (!r.qty || r.qty <= 0) continue;
    if (!productKeysEqual(r.product_key, productKey)) continue;
    if (sellerEmails && !sellerEmails.has((r.seller_email || "").toLowerCase())) continue;
    if (r.month_idx < 0 || r.month_idx > 11) continue;
    out[r.month_idx] = true;
  }
  return out;
}

/** Pick the largest non-excluded dealer row for a given (year, month, product,
 *  seller-scope) cell. Used by CRM Budget plus/minus to know which dealer row
 *  to mutate. Tie-breaker: dealer_name asc, then id asc — deterministic. */
export function pickLargestDealerRowForCell(
  rows: BudgetDealerLine[],
  year: number,
  monthIdx: number,
  productKey: string,
  sellerEmails: Set<string> | null,
): BudgetDealerLine | null {
  const cands = rows.filter(r =>
    !r.excluded_from_total &&
    r.year === year &&
    r.month_idx === monthIdx &&
    productKeysEqual(r.product_key, productKey) &&
    (!sellerEmails || sellerEmails.has((r.seller_email || "").toLowerCase()))
  );
  if (cands.length === 0) return null;
  cands.sort((a, b) =>
    (b.qty - a.qty) ||
    (a.dealer_name || "").localeCompare(b.dealer_name || "") ||
    a.id.localeCompare(b.id)
  );
  return cands[0];
}

/** Update only the qty of an existing dealer row (preserves identity, source,
 *  excluded flag, etc). Returns the readback row from Supabase. */
export async function updateDealerLineQty(
  row: BudgetDealerLine,
  newQty: number,
  actor?: { email?: string | null },
): Promise<BudgetDealerLine> {
  return upsertBudgetDealerLine({
    id: row.id,
    year: row.year,
    month_idx: row.month_idx,
    seller_id: row.seller_id,
    seller_name: row.seller_name,
    seller_email: row.seller_email,
    seller_initials: row.seller_initials,
    dealer_account_id: row.dealer_account_id,
    dealer_account_number: row.dealer_account_number,
    dealer_name: row.dealer_name,
    dealer_name_norm: row.dealer_name_norm,
    product_key: row.product_key,
    product_name: row.product_name,
    item_number: row.item_number,
    qty: Math.max(0, Math.trunc(newQty)),
    excluded_from_total: row.excluded_from_total,
    import_source: row.import_source,
    import_batch_id: row.import_batch_id,
    imported_by: actor?.email ?? row.imported_by ?? null,
  });
}

/** Phase 35 / Step 7 — collapse all non-excluded dealer rows for a given
 *  (year, month, product, seller-scope) cell to qty=0. Used after a manual
 *  CRM Budget edit so that `crm_budget_lines` becomes the single source of
 *  truth for that cell — the dealer-prefer merge in CRM Budget and Budget
 *  Dashboard then naturally falls back to the manual value.
 *  Never modifies rows where excluded_from_total = true. */
export async function collapseDealerLinesForCell(
  rows: BudgetDealerLine[],
  year: number,
  monthIdx: number,
  productKey: string,
  sellerEmails: Set<string> | null,
  actor?: { email?: string | null },
): Promise<string[]> {
  const targets = rows.filter(r =>
    !r.excluded_from_total &&
    r.qty > 0 &&
    r.year === year &&
    r.month_idx === monthIdx &&
    productKeysEqual(r.product_key, productKey) &&
    (!sellerEmails || sellerEmails.has((r.seller_email || "").toLowerCase()))
  );
  const ids: string[] = [];
  for (const t of targets) {
    await updateDealerLineQty(t, 0, actor);
    ids.push(t.id);
  }
  return ids;
}

/** Merge manual monthly qty with dealer-line monthly qty preferring dealer
 *  rows: when a dealer row exists for that month, the manual value for that
 *  month is dropped and replaced by the dealer sum. Otherwise the manual
 *  value is kept. */
export function mergeMonthlyPreferDealer(
  manualMonthly: number[],
  dealerMonthly: number[],
  hasDealerMonth: boolean[],
): number[] {
  return Array.from({ length: 12 }, (_, i) =>
    hasDealerMonth[i] ? (dealerMonthly[i] || 0) : (manualMonthly[i] || 0),
  );
}

