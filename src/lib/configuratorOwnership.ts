/**
 * Configurator ownership helpers.
 *
 * Builds the seller / dealer / created-by payload that gets persisted on
 * every saved quote/order so the CRM Quotes and Orders lists, the
 * dashboard counters, and dealer-scoped views all agree on who an order
 * belongs to.
 *
 * Source of truth at write-time:
 *   • appUser (logged-in app_users row)
 *   • active "view as" mode (Timan Backend can act as a specific seller
 *     or as an external role preview — see lib/activeMode.ts)
 *
 * No pricing, discount, calculation or PDF logic is touched here.
 */
import { SessionUser } from '@/context/AppUserContext';
import { derivePortalRole, PortalRole } from '@/lib/portalAccess';
import {
  getActiveSellerView,
  getActiveRolePreview,
  SellerView,
} from '@/lib/activeMode';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { supabase } from '@/lib/supabase';

export interface ConfiguratorOwnership {
  seller_initials: string | null;
  seller_email: string | null;
  seller_name: string | null;
  assigned_seller_id: string | null;

  dealer_number: string | null;
  dealer_name: string | null;
  dealer_account_id: string | null;

  created_by_email: string | null;
  created_by_role: string | null;
  active_mode: string | null;
  owner_status: string | null;
}

export const OWNERSHIP_REQUIRED_MESSAGE = 'Vælg sælger og forhandler før gem.';
export const EXTERNAL_DEALER_MISSING_MESSAGE = 'Din bruger har ingen forhandler tilknyttet – kontakt admin.';

/** Extract the BP/JTN/EM/AKR/NB initials hint from a display name like "BP (Timan)". */
function initialsFromDisplayName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const m = displayName.match(/^([A-ZÆØÅ]{2,4})/);
  return m?.[1] ?? null;
}

/**
 * Build the ownership payload for a save.
 *
 * @param appUser  the SessionUser from AppUserContext
 * @param overrides optional explicit seller / dealer chosen via the
 *                  in-configurator pickers. `seller` is only honoured for
 *                  backend / timan_seller users; external dealer roles
 *                  always fall back to their own profile dealer.
 */
export async function buildConfiguratorOwnership(
  appUser: SessionUser | null | undefined,
  overrides?: {
    seller?: {
      initials?: string | null;
      email?: string | null;
      name?: string | null;
    } | null;
    dealer?: {
      account_id?: string | null;
      account_number?: string | null;
      company_name?: string | null;
    } | null;
  } | null,
): Promise<ConfiguratorOwnership> {
  // Backwards compatibility: previous callers passed the dealer object as
  // the second positional argument directly.
  const dealer = overrides?.dealer
    ?? (overrides && ('account_id' in overrides || 'account_number' in overrides || 'company_name' in overrides)
      ? (overrides as unknown as { account_id?: string | null; account_number?: string | null; company_name?: string | null })
      : undefined);
  const sellerOverride = overrides?.seller ?? null;
  const empty: ConfiguratorOwnership = {
    seller_initials: null,
    seller_email: null,
    seller_name: null,
    assigned_seller_id: null,
    dealer_number: null,
    dealer_name: null,
    dealer_account_id: null,
    created_by_email: null,
    created_by_role: null,
    active_mode: null,
    owner_status: 'aktiv',
  };

  if (!appUser) return empty;

  const portalRole: PortalRole | null = derivePortalRole(appUser);
  const sellerView: SellerView | null = getActiveSellerView(appUser.email);
  const rolePreview = getActiveRolePreview(appUser.email);
  const activeMode = sellerView
    ? `seller:${sellerView.key}`
    : rolePreview
      ? `role:${rolePreview.key}`
      : (appUser.portal_role || 'self');

  // ── Seller resolution ────────────────────────────────────────────────
  let sellerInitials: string | null = null;
  let sellerEmail: string | null = null;
  let sellerName: string | null = null;

  if (sellerView) {
    // Backend user explicitly viewing as a Timan seller.
    sellerInitials = sellerView.initials;
    sellerEmail = sellerView.email;
    sellerName = sellerView.label;
  } else if (portalRole === 'timan_seller') {
    // The user IS a Timan Sælger — they own the case.
    sellerEmail = appUser.email?.toLowerCase() ?? null;
    sellerInitials = initialsFromDisplayName(appUser.display_name) ?? null;
    sellerName = appUser.display_name ?? null;
  } else if (portalRole === 'timan_backend') {
    // Backend user in normal Backend mode (no view-as) — record as Backend.
    sellerEmail = appUser.email?.toLowerCase() ?? null;
    sellerInitials = initialsFromDisplayName(appUser.display_name) ?? null;
    sellerName = appUser.display_name ?? appUser.email ?? null;
  }
  // External roles (dealer/importer/service-partner/dealer_user) do not set a seller.

  // ── Seller override (from in-configurator picker) ────────────────────
  // Only honoured for backend / timan_seller users. For external roles the
  // override is ignored: their cases are not "sold by" anyone in Timan
  // unless a backend user later reassigns.
  const allowSellerOverride = portalRole === 'timan_backend' || portalRole === 'timan_seller';
  let assignedSellerIdOverride: string | null = null;
  if (allowSellerOverride && sellerOverride) {
    if (sellerOverride.initials) sellerInitials = sellerOverride.initials.toUpperCase();
    if (sellerOverride.email)    sellerEmail = sellerOverride.email.toLowerCase();
    if (sellerOverride.name)     sellerName = sellerOverride.name;

    // Resolve the chosen seller's app_users.id so dashboard/orders filters
    // for that seller include this case.
    if (sellerOverride.email) {
      try {
        const { data } = await supabase
          .from('app_users')
          .select('id')
          .eq('email', sellerOverride.email.toLowerCase())
          .maybeSingle();
        if (data?.id) assignedSellerIdOverride = data.id as string;
      } catch { /* ignore */ }
    }
  }

  // assigned_seller_id (app_users.id of the responsible seller). resolveSellerId
  // already honours active "view as" mode for backend users.
  let assignedSellerId = assignedSellerIdOverride ?? await resolveSellerId(appUser.email);

  // ── Dealer resolution ────────────────────────────────────────────────
  let dealerNumber: string | null = null;
  let dealerName: string | null = null;
  let dealerAccountId: string | null = null;

  if (dealer && (dealer.account_id || dealer.account_number)) {
    dealerAccountId = dealer.account_id ?? null;
    dealerNumber = dealer.account_number ?? null;
    dealerName = dealer.company_name ?? null;

    // Resolve missing fields from dealer_accounts when only one is given.
    if ((!dealerNumber || !dealerName) && dealerAccountId) {
      try {
        const { data } = await supabase
          .from('dealer_accounts')
          .select('account_number, company_name, assigned_seller_initials, assigned_seller_email, assigned_seller_name')
          .eq('id', dealerAccountId)
          .maybeSingle();
        if (data) {
          dealerNumber = dealerNumber ?? (data.account_number as string | null) ?? null;
          dealerName = dealerName ?? (data.company_name as string | null) ?? null;
            if (!sellerInitials) sellerInitials = (data.assigned_seller_initials as string | null) ?? null;
            if (!sellerEmail) sellerEmail = (data.assigned_seller_email as string | null)?.toLowerCase() ?? null;
            if (!sellerName) sellerName = (data.assigned_seller_name as string | null) ?? null;
        }
      } catch { /* ignore */ }
    } else if (!dealerAccountId && dealerNumber) {
      try {
        const { data } = await supabase
          .from('dealer_accounts')
          .select('id, company_name, assigned_seller_initials, assigned_seller_email, assigned_seller_name')
          .eq('account_number', dealerNumber)
          .maybeSingle();
        if (data) {
          dealerAccountId = (data.id as string | null) ?? null;
          dealerName = dealerName ?? (data.company_name as string | null) ?? null;
            if (!sellerInitials) sellerInitials = (data.assigned_seller_initials as string | null) ?? null;
            if (!sellerEmail) sellerEmail = (data.assigned_seller_email as string | null)?.toLowerCase() ?? null;
            if (!sellerName) sellerName = (data.assigned_seller_name as string | null) ?? null;
        }
      } catch { /* ignore */ }
    }
  } else {
    // Auto-fill from the logged-in user's own profile.
    dealerNumber = (appUser.dealer_number as string | null) ?? null;
    dealerName = (appUser.company_dealer as string | null) ?? null;
    if (dealerNumber) {
      try {
        const { data } = await supabase
          .from('dealer_accounts')
          .select('id, company_name, assigned_seller_initials, assigned_seller_email, assigned_seller_name')
          .eq('account_number', dealerNumber)
          .maybeSingle();
        if (data) {
          dealerAccountId = (data.id as string | null) ?? null;
          dealerName = dealerName ?? (data.company_name as string | null) ?? null;
            if (!sellerInitials) sellerInitials = (data.assigned_seller_initials as string | null) ?? null;
            if (!sellerEmail) sellerEmail = (data.assigned_seller_email as string | null)?.toLowerCase() ?? null;
            if (!sellerName) sellerName = (data.assigned_seller_name as string | null) ?? null;
        }
      } catch { /* ignore */ }
    }
  }

  const isExternal = isExternalDealerRole(portalRole);
  if (isExternal && (!dealerNumber || !dealerAccountId)) {
    throw new Error(EXTERNAL_DEALER_MISSING_MESSAGE);
  }

  if (sellerEmail && (!assignedSellerId || isExternal)) {
    assignedSellerId = await resolveSellerId(sellerEmail);
  }

  if (!isExternal && (!sellerInitials || !sellerEmail || !assignedSellerId || !dealerNumber || !dealerAccountId)) {
    throw new Error(OWNERSHIP_REQUIRED_MESSAGE);
  }

  if (isExternal && (!sellerInitials || !sellerEmail || !assignedSellerId)) {
    throw new Error(EXTERNAL_DEALER_MISSING_MESSAGE);
  }

  return {
    seller_initials: sellerInitials,
    seller_email: sellerEmail,
    seller_name: sellerName,
    assigned_seller_id: assignedSellerId,

    dealer_number: dealerNumber,
    dealer_name: dealerName,
    dealer_account_id: dealerAccountId,

    created_by_email: appUser.email?.toLowerCase() ?? null,
    created_by_role: portalRole ?? null,
    active_mode: activeMode,
    owner_status: 'aktiv',
  };
}

/**
 * Roles that must NOT pick a dealer manually — their dealer is taken from
 * their own app_users profile and locked.
 */
export function isExternalDealerRole(role: PortalRole | null): boolean {
  return role === 'timan_dealer'
      || role === 'timan_service_partner'
      || role === 'timan_importer'
      || role === 'dealer_user';
}

/**
 * Returns true when the (external) user can submit at all — i.e. their
 * profile carries a dealer_number we can attach to the order.
 */
export function externalDealerHasLink(
  appUser: SessionUser | null | undefined,
): boolean {
  return Boolean(appUser?.dealer_number);
}
