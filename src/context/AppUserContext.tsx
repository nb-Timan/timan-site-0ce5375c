import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { AppUser, SLUTKUNDE_DEFAULTS } from '@/data/appUsers';
import { supabase } from '@/lib/supabase';
import { linkAuthUserIdIfNeeded } from '@/lib/linkAuthUser';
import { fetchDealerStatusForUser } from '@/lib/dealerAccountsService';

export type SessionUser = AppUser & {
  email: string;
  portal_role?: string | null;
  preferred_language?: string | null;
  preferred_currency?: string | null;
  company_dealer?: string | null;
  module_access?: string[] | null;
  status?: string | null;
  dealer_number?: string | null;
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
        // Refresh from DB if cache is missing portal_role (stale pre-Phase 1B cache).
        const cacheIsFresh = cached
          && cached.email.toLowerCase() === session.user.email.toLowerCase()
          && Object.prototype.hasOwnProperty.call(cached, 'portal_role');
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
          setAppUser({
            email: row.email,
            role: row.role,
            partner_type: row.partner_type ?? null,
            approved: row.approved,
            is_active: row.is_active,
            start_step: row.start_step ?? 1,
            max_step: row.max_step ?? 4,
            can_view_prices: row.can_view_prices ?? false,
            can_submit_order: row.can_submit_order ?? false,
            can_edit_discount: row.can_edit_discount ?? false,
            can_switch_customer_mode: row.can_switch_customer_mode ?? false,
            working_for: row.working_for ?? null,
            display_name: row.display_name || row.full_name,
            portal_role: row.portal_role ?? null,
            preferred_language: row.preferred_language ?? null,
            preferred_currency: row.preferred_currency ?? null,
            company_dealer: row.company_dealer ?? null,
            module_access: row.module_access ?? null,
            status: row.status ?? null,
          });
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

  return (
    <AppUserContext.Provider value={{ appUser, loading, setAppUser, logout }}>
      {children}
    </AppUserContext.Provider>
  );
}

export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error('useAppUser must be used within AppUserProvider');
  return ctx;
}
