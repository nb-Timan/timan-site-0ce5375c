import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { AppUser, SLUTKUNDE_DEFAULTS } from '@/data/appUsers';
import { supabase } from '@/lib/supabase';
import { linkAuthUserIdIfNeeded } from '@/lib/linkAuthUser';
import { fetchDealerStatusForUser } from '@/lib/dealerAccountsService';
import { defaultCanViewPrices, defaultCanSubmitOrder } from '@/lib/sessionPermissionDefaults';

export type SessionUser = AppUser & {
  email: string;
  portal_role?: string | null;
  preferred_language?: string | null;
  preferred_currency?: string | null;
  company_dealer?: string | null;
  module_access?: string[] | null;
  allowed_areas?: string[] | null;
  allowed_modules?: string[] | null;
  status?: string | null;
  dealer_number?: string | null;
  permissions?: Record<string, boolean> | null;
  quick_actions?: string[] | null;
  /** Phase 59 — 'standard' (default) or 'messe' (locked to /messe layout). */
  portal_variant?: string | null;
};

export interface DealerAccessStatus {
  isBlocked: boolean;
  isDeleted: boolean;
  companyName: string | null;
}

interface AppUserContextValue {
  appUser: SessionUser | null;
  loading: boolean;
  setAppUser: (user: SessionUser | null) => void;
  logout: () => Promise<void>;
  dealerStatus: DealerAccessStatus | null;
  /**
   * Re-fetch the logged-in user's row from Supabase `app_users` and
   * REPLACE the cached SessionUser (does not merge with stale fields).
   * Returns the fresh user, or null if not signed in / not approved.
   *
   * Call this after editing the currently logged-in user in
   * Backend → Brugere so role / module / dealer changes take effect
   * without a full page reload.
   */
  refreshAppUser: () => Promise<SessionUser | null>;
}

const AppUserContext = createContext<AppUserContextValue | undefined>(undefined);

const STORAGE_KEY = 'timan.appUser';
const SESSION_CACHE_VERSION = 2;
const EXHIBITION_FLAG = 'timan.exhibitionMode';

/** Synthetic user used for the public Timan Messe (exhibition) session. */
export const EXHIBITION_SESSION_USER: SessionUser = {
  email: 'messe@timan.local',
  role: 'slutkunde',
  partner_type: null,
  approved: true,
  is_active: true,
  start_step: 1,
  max_step: 4,
  can_view_prices: true,
  can_submit_order: false,
  can_edit_discount: false,
  can_switch_customer_mode: false,
  display_name: 'Timan Messe',
  portal_role: 'exhibition_user',
  preferred_language: null,
  preferred_currency: null,
  company_dealer: null,
  module_access: [],
  allowed_areas: [],
  allowed_modules: [],
  status: 'exhibition',
  dealer_number: null,
  permissions: null,
  quick_actions: [],
  portal_variant: 'messe',
};

function isExhibitionFlagSet(): boolean {
  try { return localStorage.getItem(EXHIBITION_FLAG) === '1'; } catch { return false; }
}

const REAL_AUTH_ROLES = new Set(['timan_backend', 'timan_service']);

function readCachedSessionUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch { return null; }
}

function loadFromStorage(): SessionUser | null {
  const cached = readCachedSessionUser();
  // Real authenticated backend/service user ALWAYS wins over a stale
  // exhibition flag — otherwise admins get trapped in /messe demo mode.
  const cachedRole = (cached?.portal_role || '').toLowerCase();
  if (cached && REAL_AUTH_ROLES.has(cachedRole)) {
    return cached;
  }
  if (isExhibitionFlagSet()) return EXHIBITION_SESSION_USER;
  return cached;
}

export function AppUserProvider({ children }: { children: ReactNode }) {
  const [appUser, setAppUserState] = useState<SessionUser | null>(() => loadFromStorage());
  const [loading, setLoading] = useState(true);
  const [dealerStatus, setDealerStatus] = useState<DealerAccessStatus | null>(null);

  const setAppUser = useCallback((user: SessionUser | null) => {
    setAppUserState(user);
    if (user) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...user, __permission_defaults_version: SESSION_CACHE_VERSION }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      setDealerStatus(null);
    }
  }, []);

  // Refresh dealer block/delete status whenever the user (and their dealer link) changes.
  useEffect(() => {
    let cancelled = false;
    const dn = appUser?.dealer_number ?? null;
    if (!appUser || !dn) {
      setDealerStatus(null);
      return;
    }
    (async () => {
      const res = await fetchDealerStatusForUser(dn);
      if (cancelled) return;
      if (res.linked) {
        setDealerStatus({ isBlocked: res.isBlocked, isDeleted: res.isDeleted, companyName: res.companyName });
      } else {
        setDealerStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser]);

  // Re-hydrate from Supabase session on mount: if a session exists but no cached user, look up app_users.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Exhibition mode short-circuits any Supabase session lookup —
        // but ONLY for public visitors. If a real Supabase session exists
        // (backend/service user), the real user wins and we clear the
        // stale exhibition flag so admins can navigate the normal portal.
        if (isExhibitionFlagSet()) {
          const { data: sessionProbe } = await supabase.auth.getSession();
          if (!sessionProbe.session?.user?.email) {
            setAppUserState(EXHIBITION_SESSION_USER);
            setLoading(false);
            return;
          }
          // Real auth session present — drop the stale flag and continue.
          try { localStorage.removeItem(EXHIBITION_FLAG); } catch { /* ignore */ }
        }
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session?.user?.email) {
          setLoading(false);
          return;
        }
        const cached = loadFromStorage();
        // Refresh from DB if cache is missing portal_role or dealer_number (stale cache).
        const cacheIsFresh = cached
          && cached.email.toLowerCase() === session.user.email.toLowerCase()
          && Object.prototype.hasOwnProperty.call(cached, 'portal_role')
          && Object.prototype.hasOwnProperty.call(cached, 'dealer_number')
          // Phase 27 — re-fetch when cache pre-dates the `permissions` field
          // Phase 37 — also re-fetch when cache pre-dates `allowed_areas`
          // so portal area filtering applies without manual logout.
          && Object.prototype.hasOwnProperty.call(cached, 'permissions')
          && Object.prototype.hasOwnProperty.call(cached, 'allowed_areas')
          && Object.prototype.hasOwnProperty.call(cached, 'quick_actions')
          && (cached as SessionUser & { __permission_defaults_version?: number }).__permission_defaults_version === SESSION_CACHE_VERSION;
        if (cacheIsFresh) {
          setLoading(false);
          return;
        }
        const email = session.user.email.toLowerCase();
        const { data: row } = await supabase
          .from('app_users')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (cancelled) return;

        if (row && row.approved && row.is_active) {
          // Best-effort: link auth uid to app_users row if not yet linked.
          linkAuthUserIdIfNeeded();
          setAppUser(rowToSessionUser(row));
        } else {
          // Session present but not approved → treat as guest with limited access
          setAppUser({ ...SLUTKUNDE_DEFAULTS, email, display_name: undefined });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // React to auth changes (sign-out elsewhere)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setAppUser(null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [setAppUser]);

  const logout = useCallback(async () => {
    try { localStorage.removeItem(EXHIBITION_FLAG); } catch { /* ignore */ }
    await supabase.auth.signOut();
    setAppUser(null);
  }, [setAppUser]);

  /**
   * Re-fetch the logged-in user from Supabase and REPLACE the cached
   * SessionUser. Used after Backend → Brugere edits so role / module /
   * dealer changes apply without a page reload.
   */
  const refreshAppUser = useCallback(async (): Promise<SessionUser | null> => {
    const { data } = await supabase.auth.getSession();
    const sessionEmail = data.session?.user?.email?.toLowerCase();
    if (!sessionEmail) return null;
    const { data: row } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', sessionEmail)
      .maybeSingle();
    if (row && row.approved && row.is_active) {
      const fresh = rowToSessionUser(row);
      setAppUser(fresh);
      return fresh;
    }
    const guest: SessionUser = { ...SLUTKUNDE_DEFAULTS, email: sessionEmail, display_name: undefined };
    setAppUser(guest);
    return guest;
  }, [setAppUser]);

  return (
    <AppUserContext.Provider value={{ appUser, loading, setAppUser, logout, dealerStatus, refreshAppUser }}>
      {children}
    </AppUserContext.Provider>
  );
}

function rowToSessionUser(row: Record<string, unknown>): SessionUser {
  return {
    email: row.email as string,
    role: row.role as SessionUser['role'],
    partner_type: (row.partner_type as SessionUser['partner_type']) ?? null,
    approved: row.approved as boolean,
    is_active: row.is_active as boolean,
    start_step: (row.start_step as number) ?? 1,
    max_step: (row.max_step as number) ?? 4,
    can_view_prices: defaultCanViewPrices(row.can_view_prices, row.portal_role, row.role, row.partner_type),
    can_submit_order: defaultCanSubmitOrder(row.can_submit_order, row.portal_role, row.role, row.partner_type),
    can_edit_discount: (row.can_edit_discount as boolean) ?? false,
    can_switch_customer_mode: (row.can_switch_customer_mode as boolean) ?? false,
    working_for: (row.working_for as SessionUser['working_for']) ?? null,
    display_name: (row.display_name as string) || (row.full_name as string),
    portal_role: (row.portal_role as string | null) ?? null,
    preferred_language: (row.preferred_language as string | null) ?? null,
    preferred_currency: (row.preferred_currency as string | null) ?? null,
    company_dealer: (row.company_dealer as string | null) ?? null,
    module_access: ((row.module_access as string[] | null) ?? (row.allowed_modules as string[] | null)) ?? null,
    allowed_areas: (row.allowed_areas as string[] | null) ?? null,
    allowed_modules: (row.allowed_modules as string[] | null) ?? null,
    status: (row.status as string | null) ?? null,
    dealer_number: (row.dealer_number as string | null) ?? null,
    permissions: (row.permissions as Record<string, boolean> | null) ?? null,
    quick_actions: (row.quick_actions as string[] | null) ?? null,
    portal_variant: (row.portal_variant as string | null) ?? 'standard',
  };
}

export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error('useAppUser must be used within AppUserProvider');
  return ctx;
}
