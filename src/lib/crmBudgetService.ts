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
import { PRODUCTS } from "@/data/machines";

// ---------- Types ----------
export type BudgetCategory = "machine" | "attachment" | "service" | "other";
export type ProductStatus = "available" | "coming_soon";

export interface BudgetProduct {
  key: string;            // stable id we use across budget rows
  name: string;
  varenr: string | null;  // item number
  category: BudgetCategory;
  status: ProductStatus;
  priceDKK?: number | null;
  priceEUR?: number | null;
}

export type MonthlySplit = number[]; // length 12, Jan..Dec (qty or share)

export interface BudgetLine {
  id: string;
  year: number;
  product_key: string;
  product_name: string;
  item_number: string | null;
  category: BudgetCategory;
  seller_id: string | null;
  seller_name: string | null;
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
function readConfiguratorMachine(key: string): { name: string; varenr: string; priceDKK: number; priceEUR: number } | null {
  const m = PRODUCTS[key];
  if (!m) return null;
  const name = typeof m.name === "string" ? m.name : (m.name?.da || m.name?.en || key);
  return { name, varenr: m.varenr || "", priceDKK: m.priceDKK || 0, priceEUR: m.priceEUR || 0 };
}

const RC1000 = readConfiguratorMachine("RC-1000S");
const RC751  = readConfiguratorMachine("RC-751");
const T3330  = readConfiguratorMachine("Timan 3330");

export const BUDGET_PRODUCTS: BudgetProduct[] = [
  {
    key: "RC-751",
    name: RC751?.name || "RC-751 Basismaskine",
    varenr: RC751?.varenr || "410040",
    category: "machine",
    status: "available",
    priceDKK: RC751?.priceDKK ?? 167500,
    priceEUR: RC751?.priceEUR ?? 22515,
  },
  {
    key: "RC-1000s",
    name: RC1000?.name || "RC-1000s Basismaskine",
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
  {
    key: "Tool-Trac",
    name: "Tool-Trac",
    varenr: null,
    category: "machine",
    status: "available",
  },
];

export function findProduct(key: string): BudgetProduct | undefined {
  return BUDGET_PRODUCTS.find(p => p.key === key);
}

// ---------- Storage (localStorage fallback) ----------
const LS_LINES = "timan.crm.budget.lines";
const LS_FORECASTS = "timan.crm.budget.forecasts";
const LS_ACTUALS = "timan.crm.budget.actuals";

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

// ---------- Seed (only if empty) ----------
function ensureSeed() {
  const existing = readLS<BudgetLine>(LS_LINES);
  if (existing.length > 0) return;
  const year = new Date().getFullYear() >= 2026 ? new Date().getFullYear() : 2026;
  const seedLines: BudgetLine[] = [
    {
      id: uid(), year, product_key: "RC-1000s", product_name: "RC-1000s Basismaskine",
      item_number: "411000", category: "machine",
      seller_id: null, seller_name: "Esben Madsen", country: "DK",
      qty_budget: 18, value_budget: 18 * 235000, monthly_split: EVEN_SPLIT,
      notes: "Hovedfokus 2026", locked: false, created_at: new Date().toISOString(),
    },
    {
      id: uid(), year, product_key: "RC-751", product_name: "RC-751 Basismaskine",
      item_number: "410040", category: "machine",
      seller_id: null, seller_name: "Anders Krogh", country: "DK",
      qty_budget: 12, value_budget: 12 * 167500, monthly_split: EVEN_SPLIT,
      notes: null, locked: false, created_at: new Date().toISOString(),
    },
    {
      id: uid(), year, product_key: "Timan 3330", product_name: "Timan 3330",
      item_number: "712000", category: "machine",
      seller_id: null, seller_name: "Esben Madsen", country: "DK",
      qty_budget: 8, value_budget: 8 * 361700, monthly_split: EVEN_SPLIT,
      notes: null, locked: false, created_at: new Date().toISOString(),
    },
    {
      id: uid(), year, product_key: "Tool-Trac", product_name: "Tool-Trac",
      item_number: null, category: "machine",
      seller_id: null, seller_name: "Anders Krogh", country: "DK",
      qty_budget: 4, value_budget: 0, monthly_split: EVEN_SPLIT,
      notes: "Pris fastsættes pr. ordre", locked: false, created_at: new Date().toISOString(),
    },
  ];
  writeLS(LS_LINES, seedLines);
}

// ---------- Public API ----------
export interface ListBudgetParams {
  year: number;
}

export async function listBudgetLines({ year }: ListBudgetParams): Promise<BudgetLine[]> {
  // Try Supabase first. If table missing or any error → fallback.
  try {
    const { data, error } = await supabase
      .from("crm_budget_lines")
      .select("*")
      .eq("year", year);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as BudgetLine[];
    }
  } catch { /* */ }
  ensureSeed();
  return readLS<BudgetLine>(LS_LINES).filter(l => l.year === year);
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
