import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { hasInternalMesseAccess, isMesseVariantUser } from '@/lib/portalAccess';
import { isMessePreviewActive, useMessePreviewVersion } from '@/lib/messePreview';
import { canSwitchMode } from '@/lib/activeMode';

/**
 * Single guard for /messe/* routes.
 *
 * Allow rendering when:
 *  - real user has appUser.portal_variant === 'messe', OR
 *  - real user is a backend user with Messe preview active.
 *
 * Otherwise redirect:
 *  - no user → /portal?redirect=/messe (login first)
 *  - logged-in user without messe access → /portal
 */
export function MesseRouteGuard({ children }: { children: ReactNode }) {
  useMessePreviewVersion();
  const { appUser, loading } = useAppUser();
  if (loading) return null;
  if (!appUser) return <Navigate to="/portal?redirect=/messe" replace />;
  if (isMesseVariantUser(appUser)) return <>{children}</>;
  if (hasInternalMesseAccess(appUser)) return <>{children}</>;
  if (canSwitchMode(appUser) && isMessePreviewActive(appUser.email)) {
    return <>{children}</>;
  }
  return <Navigate to="/portal" replace />;
}

/**
 * Single guard for /portal/*, /, /configurator and other non-messe routes.
 *
 * Real Messe-variant users are locked to /messe; everything else passes through.
 */
export function PortalLockGuard({ children }: { children: ReactNode }) {
  useMessePreviewVersion();
  const { appUser } = useAppUser();
  if (appUser && isMesseVariantUser(appUser)) {
    return <Navigate to="/messe" replace />;
  }
  return <>{children}</>;
}
