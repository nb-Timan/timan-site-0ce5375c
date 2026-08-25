/**
 * CRM Quotes & Orders service.
 *
 * Reads from the public.crm_configurations_view created by
 * docs/sql/phase23_configurator_ownership.sql, falling back to a direct
 * select on public.configurations when the view is missing (so the SPA
 * keeps working before the migration is applied).
 *
 * Ownership filtering rules (mirrors crmScope.ts):
 *   • Timan Backend (no view-as)        → see ALL non-deleted rows.
 *   • Timan Backend viewing as a seller → see rows owned by that seller
 *     (resolved via assigned_seller_id OR seller_initials/seller_email).
 *   • Timan Sælger (real seller)        → see rows owned by themselves.
 *   • External dealer/importer/service  → see rows whose dealer_number
 *     matches their app_users.dealer_number.
 *
 * Pricing, calculations, PDFs, n8n flows are NOT touched.
 */
import { supabase } from '@/lib/supabase';
import { PortalRole } from '@/lib/portalAccess';
import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import type { ConfiguratorState } from '@/types/configurator';
import { sellerInitialsMatch } from '@/lib/sellerInitials';
import { currencyFromLanguage, toDkk, type Currency } from '@/lib/currency';

export type CrmDocumentType = 'quote' | 'order';

export interface CrmConfigurationRow {
  id: string;
  document_type: CrmDocumentType;
  /** Raw case_type from configurations when exposed by the source. */
  case_type: string | null;
  case_status: string | null;
  status: string | null;
  created_at: string;
  last_saved_at: string | null;
  title: string | null;
  quote_number: string | null;
  order_number: string | null;
  total_price: number | null;
  note: unknown | null;

  seller_initials: string | null;
  seller_email: string | null;
  seller_name: string | null;
  assigned_seller_id: string | null;

  dealer_number: string | null;
  dealer_name: string | null;
  dealer_account_id: string | null;
  dealer_company_name: string | null;
  dealer_account_number: string | null;
  dealer_country: string | null;

  created_by_email: string | null;
  created_by_user_id: string | null;
  created_by_role: string | null;
  active_mode: string | null;
  owner_status: string | null;

  lead_id: string | null;
  quote_sent_at: string | null;
  order_sent_at: string | null;
  submitted_at: string | null;
}

export interface CrmConfigurationFilter {
  /** Effective portal role (already resolved with active "view as" mode). */
  role: PortalRole | null;
  /** app_users.id of the responsible seller in the current scope (null for backend admin / external). */
  sellerId: string | null;
  /** Initials of the active seller (BP/JTN/EM/AKR/NB) when in seller-view mode. */
  sellerInitials?: string | null;
  /** Email of the active seller view (when known). */
  sellerEmail?: string | null;
  /** dealer_number from the logged-in external user's app_users row. */
  dealerNumber?: string | null;
  /** 'quote' or 'order' to filter the result set. */
  documentType: CrmDocumentType;
}

function rowToConfig(row: Record<string, unknown>): CrmConfigurationRow {
  const rawDocumentType = (row.document_type as string | null) ?? null;
  const rawCaseType = (row.case_type as string | null) ?? null;
  const caseStatus = (row.case_status as string | null) ?? null;
  const isOrderLike = rawDocumentType === 'order'
    || rawCaseType === 'order'
    || caseStatus === 'ordre_afgivet';
  return {
    id: String(row.id),
    document_type: isOrderLike ? 'order' : 'quote',
    case_type: rawCaseType,
    case_status: caseStatus,
    lead_id: (row.lead_id as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    created_at: (row.created_at as string) || new Date().toISOString(),
    last_saved_at: (row.last_saved_at as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    quote_number: (row.quote_number as string | null) ?? null,
    order_number: (row.order_number as string | null) ?? null,
    total_price: row.total_price == null ? null : Number(row.total_price),
    note: row.note ?? null,
    seller_initials: (row.seller_initials as string | null) ?? null,
    seller_email: (row.seller_email as string | null) ?? null,
    seller_name: (row.seller_name as string | null) ?? null,
    assigned_seller_id: (row.assigned_seller_id as string | null) ?? null,
    dealer_number: (row.dealer_number as string | null) ?? null,
    dealer_name: (row.dealer_name as string | null) ?? null,
    dealer_account_id: (row.dealer_account_id as string | null) ?? null,
    dealer_company_name: (row.dealer_company_name as string | null) ?? null,
    dealer_account_number: (row.dealer_account_number as string | null) ?? null,
    dealer_country: (row.dealer_country as string | null) ?? null,
    created_by_email: (row.created_by_email as string | null) ?? null,
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    created_by_role: (row.created_by_role as string | null) ?? null,
    active_mode: (row.active_mode as string | null) ?? null,
    owner_status: (row.owner_status as string | null) ?? null,
    quote_sent_at: (row.quote_sent_at as string | null) ?? null,
    order_sent_at: (row.order_sent_at as string | null) ?? null,
    submitted_at: (row.submitted_at as string | null) ?? null,
  };
}

/** Returns true when the given row should be visible to the current scope. */
export function rowVisibleToScope(
  row: CrmConfigurationRow,
  filter: CrmConfigurationFilter,
): boolean {
  if (filter.role === 'timan_backend') return true;

  if (filter.role === 'timan_seller') {
    if (filter.sellerId && row.assigned_seller_id === filter.sellerId) return true;
    if (filter.sellerInitials && sellerInitialsMatch(row.seller_initials, filter.sellerInitials)) return true;
    if (filter.sellerEmail && row.seller_email
        && row.seller_email.toLowerCase() === filter.sellerEmail.toLowerCase()) return true;
    // Legacy fallback: rows created BEFORE phase 23 may only carry
    // created_by_user_id. Accept those when they match the seller.
    if (filter.sellerId && row.created_by_user_id === filter.sellerId) return true;
    return false;
  }

  // External dealer-side roles: scope by dealer_number.
  if (filter.dealerNumber && row.dealer_number === filter.dealerNumber) return true;
  return false;
}

/**
 * Fetch quotes or orders for the current scope.
 * Tries the crm_configurations_view first, then falls back to selecting
 * directly from configurations if the view is missing.
 */
export async function listCrmConfigurations(
  filter: CrmConfigurationFilter,
): Promise<{ rows: CrmConfigurationRow[]; error?: string }> {
  const docType = filter.documentType;

  // Prefer the view (joins dealer_accounts for company name + country).
  let rows: CrmConfigurationRow[] = [];
  let viewError: string | null = null;

  try {
    let q = supabase
      .from('crm_configurations_view')
      .select('*')
      .neq('case_status', 'deleted');
    // Converted legacy quotes may have document_type='quote' while
    // case_type/status were correctly saved as an order. Treat those rows as
    // orders on read; hide order-like rows from active Tilbud.
    // NOTE: crm_configurations_view does NOT expose case_type (it is folded
    // into document_type via coalesce). Only reference columns the view
    // actually has, otherwise PostgREST errors and we lose all rows.
    if (docType === 'order') {
      q = q.or('document_type.eq.order,case_status.eq.ordre_afgivet');
    } else {
      q = q.eq('document_type', 'quote')
        .neq('case_status', 'ordre_afgivet');
    }
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    rows = (data ?? []).map((r) => rowToConfig(r as Record<string, unknown>));
  } catch (e) {
    viewError = e instanceof Error ? e.message : String(e);
    // Fallback: direct select from configurations.
    try {
      let q = supabase
        .from('configurations')
        .select('*')
        .neq('case_status', 'deleted');
      if (docType === 'order') {
        q = q.or('document_type.eq.order,case_type.eq.order,case_status.eq.ordre_afgivet');
      } else {
        q = q.or('document_type.eq.quote,case_type.eq.quote')
          .neq('case_status', 'ordre_afgivet')
          .or('case_type.is.null,case_type.neq.order');
      }
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      rows = (data ?? []).map((r) => rowToConfig(r as Record<string, unknown>));
    } catch (e2) {
      return {
        rows: [],
        error: `Kunne ikke hente ${docType === 'order' ? 'ordrer' : 'tilbud'}: ${
          e2 instanceof Error ? e2.message : String(e2)
        }${viewError ? ` (view: ${viewError})` : ''}`,
      };
    }
  }

  return {
    rows: rows
      .filter((r) => isSentForCrm(r, docType))
      .filter((r) => rowVisibleToScope(r, filter)),
  };
}

/**
 * CRM visibility gate.
 *
 * Quotes (CRM → Tilbud):
 *   Show every row whose document_type='quote' AND a quote_number is
 *   assigned, UNLESS it has been converted to an order
 *   (case_status/status = 'ordre_afgivet'). The base list query already
 *   excludes case_status='deleted'. We deliberately do NOT require
 *   quote_sent_at — historically that hid quotes whose send-stamp never
 *   persisted (e.g. column stripped by legacy DB retry, or the send-flow
 *   wrote the CRM activity but the row update was rejected). Drafts
 *   without a quote_number are still filtered out.
 *
 * Orders (CRM → Ordrer):
 *   Visible when order_sent_at / submitted_at is set, OR
 *   case_status/status = 'ordre_afgivet'.
 *
 * Saved drafts (no quote/order number assigned yet) remain in "Min konto"
 * via configurationsService and are NOT touched by this gate.
 */
export function isSentForCrm(row: CrmConfigurationRow, docType: CrmDocumentType): boolean {
  if (docType === 'order') {
    if (row.order_sent_at) return true;
    if (row.submitted_at) return true;
    if ((row.case_status || '').toLowerCase() === 'ordre_afgivet') return true;
    if ((row.status || '').toLowerCase() === 'ordre_afgivet') return true;
    return false;
  }
  // quote — must have a quote_number AND not be converted to an order.
  if (!row.quote_number) return false;
  if ((row.case_status || '').toLowerCase() === 'ordre_afgivet') return false;
  if ((row.status || '').toLowerCase() === 'ordre_afgivet') return false;
  return true;
}

/**
 * Fetch a single configuration row for the CRM scope and return the
 * normalized CRM row IF (and only if) the current user is allowed to see
 * it under CRM visibility rules.
 *
 * Used by "Åbn i konfigurator" from CRM → Tilbud/Ordrer so a backend
 * admin, the assigned seller, or the owning dealer can re-open a quote
 * created by someone else (e.g. Birger's quote opened by a backend user).
 *
 * Does not write, does not change ownership, does not touch state_json.
 */
export async function fetchCrmConfigurationVisible(
  id: string,
  filter: Omit<CrmConfigurationFilter, 'documentType'>,
): Promise<{ row: CrmConfigurationRow | null; error?: string }> {
  try {
    let res = await supabase
      .from('crm_configurations_view')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (res.error) {
      res = await supabase
        .from('configurations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    }
    if (res.error) throw res.error;
    if (!res.data) return { row: null };
    const row = rowToConfig(res.data as Record<string, unknown>);
    const fullFilter: CrmConfigurationFilter = {
      ...filter,
      documentType: row.document_type,
    };
    if (!rowVisibleToScope(row, fullFilter)) {
      return { row: null, error: 'not_visible' };
    }
    return { row };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────
// Order-with-value helpers (Phase 23 fix — Dashboard/Budget alignment)
// ────────────────────────────────────────────────────────────

export interface CrmOrderWithValue extends CrmConfigurationRow {
  /** Computed via calcConfigurationTotals(state_json), in ORIGINAL currency. 0 if state missing. */
  total_value: number;
  /** Same total converted to DKK using EUR_TO_DKK from src/lib/currency.ts. */
  total_value_dkk: number;
  /** Original currency the configurator was saved in. */
  currency: Currency;
  /** Distinct machine_type keys from the configuration (e.g. ["RC-1000S"]). */
  machine_keys: string[];
  /** Per-machine quantities (e.g. {"RC-1000S": 2}). */
  machine_qty_by_key: Record<string, number>;
  /** Effective "closed/won" timestamp — order_sent_at ?? submitted_at ?? created_at. */
  closed_at: string;
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

/**
 * Fetch scoped orders (same visibility rules as listCrmConfigurations) AND
 * compute their total_value + machine breakdown from configurations.state_json.
 *
 * This is the SHARED source for the CRM Dashboard "Lukkede ordrer" KPI and
 * for Budget actuals — guaranteeing that any row visible in CRM → Ordrer is
 * also counted on the Dashboard and in Budget.
 */
export async function listScopedOrdersWithValue(
  filter: Omit<CrmConfigurationFilter, 'documentType'>,
): Promise<{ rows: CrmOrderWithValue[]; error?: string }> {
  const baseFilter: CrmConfigurationFilter = { ...filter, documentType: 'order' };
  const { rows: scoped, error } = await listCrmConfigurations(baseFilter);
  if (error) return { rows: [], error };
  if (scoped.length === 0) return { rows: [] };

  // Bulk fetch state (try state_json first; fall back to `note` if column missing).
  const ids = scoped.map((r) => r.id);
  const stateById = new Map<string, ConfiguratorState | null>();
  try {
    const trySel = async (cols: string) => supabase
      .from('configurations')
      .select(cols)
      .in('id', ids);
    let res = await trySel('id, state_json, note');
    if (res.error && /state_json/.test(res.error.message || '')) {
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
    }
  } catch (e) {
    console.warn('[listScopedOrdersWithValue] state fetch failed (values will be 0):', e);
  }

  const out: CrmOrderWithValue[] = scoped.map((r) => {
    const state = stateById.get(r.id) ?? null;
    let total = 0;
    const qtyByKey: Record<string, number> = {};
    const currency: Currency = currencyFromLanguage(state?.language ?? null);
    if (state) {
      try {
        total = calcConfigurationTotals(state).finalPrice || 0;
      } catch { /* ignore */ }
      for (const mc of state.machineConfigs ?? []) {
        const key = mc.type;
        if (!key) continue;
        qtyByKey[key] = (qtyByKey[key] || 0) + (mc.qty || 0);
      }
    }
    const closedAt = r.order_sent_at || r.submitted_at || r.last_saved_at || r.created_at;
    return {
      ...r,
      total_value: total,
      total_value_dkk: toDkk(total, currency),
      currency,
      machine_keys: Object.keys(qtyByKey),
      machine_qty_by_key: qtyByKey,
      closed_at: closedAt,
    };
  });

  return { rows: out };
}

// ────────────────────────────────────────────────────────────
// Soft-delete (Backend only) — sets case_status = 'deleted'.
// Does NOT touch related rows (configuration_items, dealer, seller, etc.).
// ────────────────────────────────────────────────────────────
export async function softDeleteConfiguration(
  id: string,
): Promise<{ error?: string }> {
  try {
    const { error } = await supabase
      .from('configurations')
      .update({ case_status: 'deleted' })
      .eq('id', id);
    if (error) throw error;
    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[softDeleteConfiguration] failed', { id, error: e });
    return { error: msg };
  }
}

// ────────────────────────────────────────────────────────────
// Phase 33 — Lead-linked configurator quotes.
// Reads scoped quotes filtered to a specific crm_leads.id.
// ────────────────────────────────────────────────────────────
export interface CrmLeadQuoteRow extends CrmConfigurationRow {
  total_value: number;
  machine_keys: string[];
}

export async function listConfigurationsForLead(
  leadId: string,
): Promise<{ rows: CrmLeadQuoteRow[]; error?: string }> {
  try {
    const trySel = async (table: string) => supabase
      .from(table)
      .select('*')
      .eq('lead_id', leadId)
      .neq('case_status', 'deleted')
      .order('created_at', { ascending: false });
    let res = await trySel('crm_configurations_view');
    if (res.error) res = await trySel('configurations');
    if (res.error) throw res.error;

    const rows: CrmLeadQuoteRow[] = [];
    for (const r of (res.data ?? []) as Array<Record<string, unknown>>) {
      const base = rowToConfig(r);
      let total = Number((r as { total_price?: unknown }).total_price) || 0;
      const keys: string[] = [];
      try {
        const raw = (r as { state_json?: unknown }).state_json;
        const state = raw && typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (state && typeof state === 'object') {
          const ns = normalizeConfiguratorState(state as Partial<ConfiguratorState>);
          if (!total) total = Math.round(calcConfigurationTotals(ns).finalPrice || 0);
          for (const mc of ns.machineConfigs ?? []) if (mc.type) keys.push(mc.type);
        }
      } catch { /* */ }
      rows.push({ ...base, total_value: total, machine_keys: Array.from(new Set(keys)) });
    }
    return { rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}
