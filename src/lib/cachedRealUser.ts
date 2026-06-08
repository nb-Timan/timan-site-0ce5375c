import { useEffect, useState } from 'react';
import type { SessionUser } from '@/context/AppUserContext';

const STORAGE_KEY = 'timan.appUser';
const REAL_ROLES = new Set(['timan_backend', 'timan_service']);

/**
 * Read the cached REAL Supabase-authenticated user from sessionStorage.
 *
 * When a Timan Backend / Timan Service user previews Timan Messe (or opens
 * /messe directly while already logged in), the live `appUser` is replaced
 * by the synthetic `EXHIBITION_SESSION_USER`. The original user record is
 * still in sessionStorage under `timan.appUser` — this helper recovers it
 * so the Messe pages can render the full authenticated portal header
 * (role selector, logout, etc.) for the real user.
 *
 * Returns null when there is no cached user or the cached user is not a
 * backend/service user (public QR visitors must never see backend chrome).
 */
function readCachedRealUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    const role = (parsed?.portal_role || '').toLowerCase();
    if (!REAL_ROLES.has(role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getCachedRealBackendUser(): SessionUser | null {
  return readCachedRealUser();
}

export function useCachedRealBackendUser(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(() => readCachedRealUser());
  useEffect(() => {
    const refresh = () => setUser(readCachedRealUser());
    window.addEventListener('storage', refresh);
    window.addEventListener('timan:active-mode-changed', refresh);
    window.addEventListener('timan:exhibition-mode-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('timan:active-mode-changed', refresh);
      window.removeEventListener('timan:exhibition-mode-changed', refresh);
    };
  }, []);
  return user;
}
