/**
 * Active "view as" mode for Timan Backend users.
 *
 * - The real portal_role in Supabase is unchanged.
 * - Active mode is a UI-only override stored in localStorage, keyed by the
 *   logged-in user's email.
 * - Any user whose real portal_role is `timan_backend` may switch their
 *   active view to "Backend" (default) or to any of the predefined seller
 *   views (BP / JTN / EM / AKR / NB). Normal Timan Sælger users are NOT
 *   allowed to switch — they always see their own seller scope.
 * - When a seller view is active:
 *     • derivePortalRole() returns `timan_seller`.
 *     • resolveSellerId() resolves the SELECTED seller's app_users.id, so
 *       every CRM page (dashboard, leads, accounts, activities, calendar,
 *       budget, "Mine forhandlere", etc.) filters as that seller.
 *     • A clear banner is shown: "Viewing as <XX> Sælger".
 * - Database permissions / RLS are NOT affected — this is presentation only.
 *
 * No SQL/RLS migration is required.
 */

export type SellerViewKey = 'BP' | 'JTN' | 'EM' | 'AKR' | 'NB';

export interface SellerView {
  key: SellerViewKey;
  initials: SellerViewKey;
  email: string;
  label: string;
}

/** Predefined seller views any backend user may switch into. */
export const SELLER_VIEWS: readonly SellerView[] = [
  { key: 'BP',  initials: 'BP',  email: 'bp@timan.dk',  label: 'BP Sælger' },
  { key: 'JTN', initials: 'JTN', email: 'jtn@timan.dk', label: 'JTN Sælger' },
  { key: 'EM',  initials: 'EM',  email: 'em@timan.dk',  label: 'EM Sælger' },
  { key: 'AKR', initials: 'AKR', email: 'akr@timan.dk', label: 'AKR Sælger' },
  { key: 'NB',  initials: 'NB',  email: 'nb@timan.dk',  label: 'NB Sælger' },
];

/**
 * Active mode value:
 *  - 'backend' → no override, full backend view.
 *  - SellerViewKey → view as that seller.
 *
 * Legacy values 'seller' (from the old BP/NB-only switch) are migrated on
 * read into the seller view matching the user's own email when possible.
 */
export type ActiveMode = 'backend' | SellerViewKey;

const STORAGE_PREFIX = 'timan.activeMode.';

function normEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

/**
 * Whether the given user is allowed to switch active mode.
 *
 * Anyone with portal_role = 'timan_backend' may switch. We check it via the
 * user object instead of an email allow-list so any future backend user
 * gets the switcher automatically.
 */
export function canSwitchMode(user: { portal_role?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return (user.portal_role || '').toLowerCase() === 'timan_backend';
}

export function getSellerViewByKey(key: string | null | undefined): SellerView | null {
  if (!key) return null;
  const k = key.toUpperCase() as SellerViewKey;
  return SELLER_VIEWS.find((v) => v.key === k) || null;
}

export function getSellerViewByEmail(email: string | null | undefined): SellerView | null {
  const e = normEmail(email);
  if (!e) return null;
  return SELLER_VIEWS.find((v) => v.email === e) || null;
}

/**
 * Read the active mode for the given logged-in user email.
 * Migrates the legacy 'seller' value (BP/NB-only switch) into the matching
 * seller view based on the user's own email.
 */
export function getActiveMode(email: string | null | undefined): ActiveMode {
  const e = normEmail(email);
  if (!e) return 'backend';
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + e);
    if (!v) return 'backend';
    if (v === 'backend') return 'backend';
    // Legacy: previous switch only had 'seller' meaning "view as myself"
    if (v === 'seller') {
      const own = getSellerViewByEmail(e);
      return own ? own.key : 'backend';
    }
    const view = getSellerViewByKey(v);
    return view ? view.key : 'backend';
  } catch {
    return 'backend';
  }
}

export function setActiveMode(email: string | null | undefined, mode: ActiveMode): void {
  const e = normEmail(email);
  if (!e) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + e, mode);
    // Notify listeners in this tab (storage event only fires across tabs).
    window.dispatchEvent(new CustomEvent('timan:active-mode-changed', { detail: { email: e, mode } }));
  } catch {
    /* ignore */
  }
}

/** Resolve the SellerView the given backend user is currently viewing as, or null when in Backend mode. */
export function getActiveSellerView(email: string | null | undefined): SellerView | null {
  const mode = getActiveMode(email);
  if (mode === 'backend') return null;
  return getSellerViewByKey(mode);
}

/**
 * The email that should be used for seller-scope queries (CRM dashboards,
 * resolveSellerId, "Mine forhandlere" filtering). When a backend user is
 * viewing as a seller this returns the SELECTED seller's email, otherwise
 * the logged-in user's own email.
 */
export function getEffectiveSellerEmail(user: { email?: string | null } | null | undefined): string | null {
  if (!user?.email) return null;
  const view = getActiveSellerView(user.email);
  return view ? view.email : user.email;
}

/** Same as getEffectiveSellerEmail but returns initials (uppercase) when known. */
export function getEffectiveSellerInitials(user: { email?: string | null; display_name?: string | null } | null | undefined): string | null {
  if (!user?.email) return null;
  const view = getActiveSellerView(user.email);
  if (view) return view.initials;
  // Fallback: derive from own display_name (e.g. "BP (Timan)") then email local-part
  const dn = user.display_name || '';
  const m = dn.match(/^([A-ZÆØÅ]{2,4})/);
  if (m?.[1]) return m[1];
  const local = (user.email.split('@')[0] || '').toUpperCase();
  return local || null;
}
