/**
 * CRM Relations service — shared, read-only normalization layer for
 * configurator quotes & orders so every CRM surface (Budget Pipeline,
 * Dashboard pipeline value, Dealer detail, Seller cockpit) consumes the
 * SAME source as CRM → Tilbud / Ordrer (`crm_configurations_view`).
 *
 * No writes. No schema changes. Pricing/PDF/email/n8n/auth/order actuals
 * are NOT touched.
 *
 * Each row gets canonical relation keys:
 *   • dealer_key   → dealer_account_id ?? dealer_number/account_number ?? norm(dealer_company_name||dealer_name)
 *   • seller_key   → assigned_seller_id ?? seller_email ?? seller_initials ?? created_by_user_id (legacy)
 *   • machine_keys → state_json.machineConfigs[].type → product key (with title fallback)
 *   • month_iso    → quote_sent_at ?? order_sent_at ?? submitted_at ?? last_saved_at ?? created_at
 *   • total_value  → calcConfigurationTotals(state_json).finalPrice (fallback row.total_price)
 */
import { supabase } from '@/lib/supabase';
import {
  listCrmConfigurations,
  type CrmConfigurationFilter,
  type CrmConfigurationRow,
  type CrmDocumentType,
} from '@/lib/crmConfigurationsService';
import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { PRODUCTS } from '@/data/machines';
import { BUDGET_PRODUCTS } from '@/lib/crmBudgetService';
import type { ConfiguratorState } from '@/types/configurator';

// ---------- helpers ----------

const normKey = (s: string | null | undefined) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const lc = (s: string | null | undefined) => (s || '').trim().toLowerCase();
const uc = (s: string | null | undefined) => (s || '').trim().toUpperCase();

function buildProductLookup(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [key, p] of Object.entries(PRODUCTS)) {
    m.set(normKey(key), key);
    if (p.varenr) m.set(normKey(p.varenr), key);
  }
  for (const p of BUDGET_PRODUCTS) {
    m.set(normKey(p.key), p.key);
    if (p.varenr) m.set(normKey(p.varenr), p.key);
  }
  return m;
}

function resolveMachineKey(value: string | null | undefined, lookup: Map<string, string>): string | null {
  const n = normKey(value);
  if (!n) return null;
  if (lookup.has(n)) return lookup.get(n)!;
  let best: string | null = null;
  for (const [cand, key] of lookup.entries()) {
    if (cand.length < 4) continue;
    if (n.includes(cand) && (!best || cand.length > normKey(best).length)) best = key;
  }
  return best;
}

function parseStateJson(value: unknown): ConfiguratorState | null {
  if (!value) return null;
  try {
    if (typeof value === 'string') {
      return normalizeConfiguratorState(JSON.parse(value) as Partial<ConfiguratorState>);
    }
    return normalizeConfiguratorState(value as Partial<ConfiguratorState>);
  } catch {
    return null;
  }
}

// ---------- types ----------

export interface ScopedConfiguration extends CrmConfigurationRow {
  /** Computed total (state_json) → fallback row.total_price → 0. */
  total_value: number;
  /** Distinct product keys (e.g. ["RC-1000s"]). */
  machine_keys: string[];
  /** Per-machine quantity. */
  machine_qty_by_key: Record<string, number>;
  /** Canonical month timestamp (ISO). */
  month_iso: string;
  /** Canonical dealer relation key. */
  dealer_key: string | null;
  /** Canonical seller relation key. */
  seller_key: string | null;
}

const OPEN_QUOTE_EXCLUDED_STATUSES = new Set([
  'deleted', 'ordre_afgivet', 'lost', 'tabt', 'cancelled', 'annulleret',
]);

export function isOpenQuoteRow(row: Pick<CrmConfigurationRow, 'document_type' | 'case_status'>): boolean {
  if (row.document_type !== 'quote') return false;
  const s = (row.case_status || '').toLowerCase();
  return !OPEN_QUOTE_EXCLUDED_STATUSES.has(s);
}

export function dealerKeyOf(row: Pick<CrmConfigurationRow,
  'dealer_account_id' | 'dealer_number' | 'dealer_account_number' | 'dealer_company_name' | 'dealer_name'>): string | null {
  if (row.dealer_account_id) return `id:${row.dealer_account_id}`;
  const num = row.dealer_number || row.dealer_account_number;
  if (num) return `num:${String(num).trim()}`;
  const name = row.dealer_company_name || row.dealer_name;
  const n = normKey(name);
  return n ? `name:${n}` : null;
}

export function sellerKeyOf(row: Pick<CrmConfigurationRow,
  'assigned_seller_id' | 'seller_email' | 'seller_initials' | 'created_by_user_id'>): string | null {
  if (row.assigned_seller_id) return `id:${row.assigned_seller_id}`;
  if (row.seller_email) return `email:${lc(row.seller_email)}`;
  if (row.seller_initials) return `ini:${uc(row.seller_initials)}`;
  if (row.created_by_user_id) return `cby:${row.created_by_user_id}`;
  return null;
}

export function quoteMonthIso(row: Pick<CrmConfigurationRow,
  'quote_sent_at' | 'order_sent_at' | 'submitted_at' | 'last_saved_at' | 'created_at'>): string {
  return row.quote_sent_at
    || row.order_sent_at
    || row.submitted_at
    || row.last_saved_at
    || row.created_at;
}

// ---------- core loader ----------

/**
 * Fetch quotes (or orders) for the current scope from `crm_configurations_view`
 * and enrich each row with canonical relation keys + computed total_value /
 * machine_keys (parsed from configurations.state_json).
 *
 * Visibility scoping is delegated to listCrmConfigurations so this stays
 * consistent with CRM → Tilbud / Ordrer.
 */
export async function listScopedConfigurations(
  filter: CrmConfigurationFilter,
): Promise<{ rows: ScopedConfiguration[]; error?: string }> {
  const { rows: scoped, error } = await listCrmConfigurations(filter);
  if (error) return { rows: [], error };
  if (scoped.length === 0) return { rows: [] };

  const ids = scoped.map((r) => r.id);
  const stateById = new Map<string, ConfiguratorState | null>();
  const fallbackTotalById = new Map<string, number>();

  try {
    const trySel = async (cols: string) => supabase
      .from('configurations')
      .select(cols)
      .in('id', ids);
    let res = await trySel('id, state_json, note, total_price');
    if (res.error && /state_json|total_price/.test(res.error.message || '')) {
      res = await trySel('id, note');
    }
    if (res.error) throw res.error;
    for (const row of (res.data ?? []) as unknown as Array<Record<string, unknown>>) {
      let parsed = parseStateJson(row.state_json);
      if (!parsed || !Array.isArray(parsed.machineConfigs) || parsed.machineConfigs.length === 0) {
        try {
          const noteRaw = row.note;
          const noteParsed = typeof noteRaw === 'string' ? JSON.parse(noteRaw) : noteRaw;
          if (noteParsed && typeof noteParsed === 'object') {
            const inner = (noteParsed as Record<string, unknown>).state ?? noteParsed;
            const ns = normalizeConfiguratorState(inner as Partial<ConfiguratorState>);
            if (Array.isArray(ns.machineConfigs) && ns.machineConfigs.length > 0) parsed = ns;
          }
        } catch { /* ignore */ }
      }
      stateById.set(String(row.id), parsed);
      const tp = Number(row.total_price);
      if (Number.isFinite(tp) && tp > 0) fallbackTotalById.set(String(row.id), tp);
    }
  } catch (e) {
    console.warn('[listScopedConfigurations] state fetch failed:', e);
  }

  const lookup = buildProductLookup();
  const out: ScopedConfiguration[] = scoped.map((r) => {
    const state = stateById.get(r.id) ?? null;
    let total = 0;
    const qtyByKey: Record<string, number> = {};
    if (state) {
      try { total = calcConfigurationTotals(state).finalPrice || 0; } catch { /* ignore */ }
      for (const mc of state.machineConfigs ?? []) {
        const machineKey = resolveMachineKey(mc?.type, lookup) || mc?.type;
        if (!machineKey) continue;
        const qty = Number(mc.qty || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        qtyByKey[machineKey] = (qtyByKey[machineKey] || 0) + qty;
      }
    }
    if (Object.keys(qtyByKey).length === 0) {
      const fromTitle = resolveMachineKey(r.title, lookup);
      if (fromTitle) qtyByKey[fromTitle] = 1;
    }
    if (total === 0) total = fallbackTotalById.get(r.id) || 0;

    return {
      ...r,
      total_value: total,
      machine_keys: Object.keys(qtyByKey),
      machine_qty_by_key: qtyByKey,
      month_iso: quoteMonthIso(r),
      dealer_key: dealerKeyOf(r),
      seller_key: sellerKeyOf(r),
    };
  });

  return { rows: out };
}

/** Convenience: scoped OPEN configurator quotes (used by Pipeline surfaces). */
export async function listScopedOpenQuotes(
  filter: Omit<CrmConfigurationFilter, 'documentType'>,
): Promise<{ rows: ScopedConfiguration[]; error?: string }> {
  const res = await listScopedConfigurations({ ...filter, documentType: 'quote' as CrmDocumentType });
  if (res.error) return res;
  return { rows: res.rows.filter(isOpenQuoteRow) };
}

// ---------- aggregations ----------

export interface QuotePipelineCell {
  quotes: ScopedConfiguration[];
  qty: number;
  value: number;
}

/**
 * Build a year×12-month×product map of open quotes.
 * Returns: machineKey → 12-month array of { quotes, qty, value }.
 */
export function quotePipelineByMachineMonth(
  rows: ScopedConfiguration[],
  year: number,
): Record<string, QuotePipelineCell[]> {
  const out: Record<string, QuotePipelineCell[]> = {};
  const ensure = (key: string): QuotePipelineCell[] => {
    if (!out[key]) out[key] = Array.from({ length: 12 }, () => ({ quotes: [], qty: 0, value: 0 }));
    return out[key];
  };
  for (const r of rows) {
    const d = r.month_iso ? new Date(r.month_iso) : null;
    if (!d || isNaN(d.getTime()) || d.getFullYear() !== year) continue;
    const mIdx = d.getMonth();
    const total = r.total_value || 0;
    const totalQty = Object.values(r.machine_qty_by_key).reduce((s, q) => s + q, 0) || 1;
    for (const key of r.machine_keys.length > 0 ? r.machine_keys : ['__unknown__']) {
      const qty = r.machine_qty_by_key[key] || 1;
      // Split value pro-rata by qty so a multi-machine quote isn't double counted.
      const valueShare = total * (qty / totalQty);
      const cell = ensure(key)[mIdx];
      cell.quotes.push(r);
      cell.qty += qty;
      cell.value += valueShare;
    }
  }
  return out;
}
