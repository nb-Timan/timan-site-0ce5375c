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
    if (filter.sellerInitials && row.seller_initials
        && row.seller_initials.toUpperCase() === filter.sellerInitials.toUpperCase()) return true;
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
