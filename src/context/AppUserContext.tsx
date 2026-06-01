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

function loadFromStorage(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function AppUserProvider({ children }: { children: ReactNode }) {
  const [appUser, setAppUserState] = useState<SessionUser | null>(() => loadFromStorage());
  const [loading, setLoading] = useState(true);
  const [dealerStatus, setDealerStatus] = useState<DealerAccessStatus | null>(null);

  const setAppUser = useCallback((user: SessionUser | null) => {
    setAppUserState(user);
    if (user) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
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
          && Object.prototype.hasOwnProperty.call(cached, 'quick_actions');
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
    module_access: (row.module_access as string[] | null) ?? null,
    allowed_areas: (row.allowed_areas as string[] | null) ?? null,
    allowed_modules: (row.allowed_modules as string[] | null) ?? null,
    status: (row.status as string | null) ?? null,
    dealer_number: (row.dealer_number as string | null) ?? null,
    permissions: (row.permissions as Record<string, boolean> | null) ?? null,
    quick_actions: (row.quick_actions as string[] | null) ?? null,
  };
}

export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error('useAppUser must be used within AppUserProvider');
  return ctx;
}
