/**
 * Single source of truth for Timan Messe / exhibition mode + role preview.
 *
 * Concepts:
 *  - realUser              — backend/service user previewing a role.
 *  - appUserIsMesseVariant — real authenticated app_users row with
 *                            portal_variant = 'messe' (Phase 59).
 *  - activePreviewRole     — selected "Vis som" preview for backend users.
 *  - isExhibitionPreview   — activePreviewRole === 'role:exhibition_user'.
 *
 * Routing rules:
 *  - /messe requires login. Either a Messe variant user, or a backend
 *    user previewing Timan Messe. No more anonymous public access.
 *  - Messe variant users are locked to /messe; navigation away is bounced
 *    back to /messe.
 *  - Backend users in non-exhibition preview on /messe are bounced to
 *    their portal home.
 */
import { useSyncExternalStore } from 'react';
import {
  getActiveMode,
  setActiveMode,
  type ActiveMode,
} from './activeMode';
import {
  enterExhibitionMode,
  leaveExhibitionMode,
} from './exhibitionMode';
import {
  getCachedRealBackendUser,
  getRealBackendUserFromAppUser,
} from './cachedRealUser';
import { isMesseVariantUser } from './portalAccess';
import type { SessionUser } from '@/context/AppUserContext';

export type { ActiveMode };

let version = 0;
function subscribe(cb: () => void) {
  const h = () => { version += 1; cb(); };
  window.addEventListener('storage', h);
  window.addEventListener('timan:active-mode-changed', h);
  window.addEventListener('timan:exhibition-mode-changed', h);
  return () => {
    window.removeEventListener('storage', h);
    window.removeEventListener('timan:active-mode-changed', h);
    window.removeEventListener('timan:exhibition-mode-changed', h);
  };
}

export interface MesseModeState {
  realUser: SessionUser | null;
  appUserIsMesseVariant: boolean;
  activePreviewRole: ActiveMode;
  isExhibitionPreview: boolean;
  /** Public visitor on /messe with no login — must be sent to /portal?redirect=/messe. */
  isPublicMesseVisitor: boolean;
  shouldRenderMesseLayout: boolean;
  shouldRenderPortalHeader: boolean;
  /** Non-null when current route conflicts with selected mode. */
  redirectTarget: string | null;
}

function portalDestinationFor(realUser: SessionUser | null, mode: ActiveMode): string {
  if (mode === 'backend' && (realUser?.portal_role || '').toLowerCase() === 'timan_backend') {
    return '/portal/backend';
  }
  return '/portal';
}

const ALLOW_WITHOUT_LOGIN = new Set(['/update-password', '/reset-password']);

export function computeMesseMode(
  appUser: SessionUser | null,
  pathname: string,
): MesseModeState {
  const onMesse = pathname.startsWith('/messe');
  const realUser =
    getRealBackendUserFromAppUser(appUser) || getCachedRealBackendUser();
  const activePreviewRole: ActiveMode = realUser?.email
    ? getActiveMode(realUser.email)
    : 'backend';
  const isExhibitionPreview = activePreviewRole === 'role:exhibition_user';
  const appUserIsMesseVariant = isMesseVariantUser(appUser);

  const canViewMesseLayout = isExhibitionPreview || appUserIsMesseVariant;
  const isPublicMesseVisitor = !appUser && onMesse;
  const shouldRenderMesseLayout = onMesse && canViewMesseLayout;
  const shouldRenderPortalHeader = !!realUser;

  let redirectTarget: string | null = null;
  if (onMesse) {
    if (!appUser) {
      redirectTarget = '/portal?redirect=/messe';
    } else if (realUser && !isExhibitionPreview && !appUserIsMesseVariant) {
      // Backend user in non-exhibition preview — back to portal.
      redirectTarget = portalDestinationFor(realUser, activePreviewRole);
    } else if (!realUser && !appUserIsMesseVariant) {
      // Logged-in regular user landed on /messe by accident — go home.
      redirectTarget = '/portal';
    }
  } else {
    if (appUserIsMesseVariant && !ALLOW_WITHOUT_LOGIN.has(pathname)) {
      redirectTarget = '/messe';
    } else if (realUser && isExhibitionPreview) {
      redirectTarget = '/messe';
    }
  }

  return {
    realUser,
    appUserIsMesseVariant,
    activePreviewRole,
    isExhibitionPreview,
    isPublicMesseVisitor,
    shouldRenderMesseLayout,
    shouldRenderPortalHeader,
    redirectTarget,
  };
}

export function useMesseMode(
  appUser: SessionUser | null,
  pathname: string,
): MesseModeState {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return computeMesseMode(appUser, pathname);
}

/**
 * Centralized "Vis som rolle" handler for backend users. Switch preview
 * role and navigate to the matching route. The synthetic exhibition_user
 * is in-memory only — never persisted to Supabase.
 */
export function switchPreviewRole(realUserEmail: string, mode: ActiveMode): void {
  try {
    setActiveMode(realUserEmail, mode);
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith('timan.crm.sellerId.')) sessionStorage.removeItem(k);
    });
  } catch { /* ignore */ }

  if (mode === 'role:exhibition_user') {
    enterExhibitionMode();
    window.location.assign('/messe');
    return;
  }

  leaveExhibitionMode();
  const real = getCachedRealBackendUser();
  if (real) {
    try { sessionStorage.setItem('timan.appUser', JSON.stringify(real)); } catch { /* ignore */ }
  }
  window.location.assign(portalDestinationFor(real, mode));
}
