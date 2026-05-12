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
  case_status: string | null;
  created_at: string;
  last_saved_at: string | null;
  title: string | null;
  quote_number: string | null;
  order_number: string | null;

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
  const docType = (row.document_type as string) || (row.case_type as string) || 'quote';
  return {
    id: String(row.id),
    document_type: docType === 'order' ? 'order' : 'quote',
    case_status: (row.case_status as string | null) ?? null,
    created_at: (row.created_at as string) || new Date().toISOString(),
    last_saved_at: (row.last_saved_at as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    quote_number: (row.quote_number as string | null) ?? null,
    order_number: (row.order_number as string | null) ?? null,
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
    const q = supabase
      .from('crm_configurations_view')
      .select('*')
      .eq('document_type', docType)
      .neq('case_status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(500);
    const { data, error } = await q;
    if (error) throw error;
    rows = (data ?? []).map((r) => rowToConfig(r as Record<string, unknown>));
  } catch (e) {
    viewError = e instanceof Error ? e.message : String(e);
    // Fallback: direct select from configurations.
    try {
      const { data, error } = await supabase
        .from('configurations')
        .select('*')
        .or(`document_type.eq.${docType},case_type.eq.${docType}`)
        .neq('case_status', 'deleted')
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

  return { rows: rows.filter((r) => rowVisibleToScope(r, filter)) };
}

// ────────────────────────────────────────────────────────────
// Order-with-value helpers (Phase 23 fix — Dashboard/Budget alignment)
// ────────────────────────────────────────────────────────────

export interface CrmOrderWithValue extends CrmConfigurationRow {
  /** Computed via calcConfigurationTotals(state_json). 0 if state missing. */
  total_value: number;
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
