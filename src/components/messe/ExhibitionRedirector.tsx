import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, isExhibitionRole } from '@/lib/portalAccess';
import { getCachedRealBackendUser, getRealBackendUserFromAppUser } from '@/lib/cachedRealUser';
import { getActiveMode, type ActiveMode } from '@/lib/activeMode';
import { isExhibitionActive, leaveExhibitionMode } from '@/lib/exhibitionMode';

let modeSnapshotVersion = 0;

export function getPortalDestinationForActiveMode(mode: ActiveMode | null): '/portal/backend' | '/portal' {
  return mode === 'backend' ? '/portal/backend' : '/portal';
}

function subscribeToModeChanges(callback: () => void) {
  const onChange = () => {
    modeSnapshotVersion += 1;
    callback();
  };
  window.addEventListener('storage', onChange);
  window.addEventListener('timan:active-mode-changed', onChange);
  window.addEventListener('timan:exhibition-mode-changed', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('timan:active-mode-changed', onChange);
    window.removeEventListener('timan:exhibition-mode-changed', onChange);
  };
}

export function useMesseRouteGuardState(appUser: ReturnType<typeof useAppUser>['appUser']) {
  useSyncExternalStore(subscribeToModeChanges, () => modeSnapshotVersion, () => 0);
  const realUser = getRealBackendUserFromAppUser(appUser) || getCachedRealBackendUser();
  const activeMode = realUser?.email ? getActiveMode(realUser.email) : null;
  const isExhibitionPreview = activeMode === 'role:exhibition_user';
  return {
    realUser,
    activeMode,
    isExhibitionPreview,
    shouldLeaveMesse: !!realUser && !isExhibitionPreview,
    destination: getPortalDestinationForActiveMode(activeMode),
  };
}

export function MesseRouteGuard({ children }: { children: ReactNode }) {
  const { appUser } = useAppUser();
  const { shouldLeaveMesse, destination } = useMesseRouteGuardState(appUser);

  useEffect(() => {
    if (shouldLeaveMesse) leaveExhibitionMode();
  }, [shouldLeaveMesse]);

  if (shouldLeaveMesse) return <Navigate to={destination} replace />;
  return <>{children}</>;
}

/**
 * Global redirector for the public Timan Messe / exhibition session.
 *
 * - Public visitors on the exhibition session are bounced back to /messe
 *   whenever they hit any non-/messe path.
 * - A REAL authenticated Timan Backend / Timan Service user is NEVER
 *   trapped here — they may freely navigate to /portal/backend etc. If
 *   they land here with a stale exhibition flag, we clear it.
 */
export default function ExhibitionRedirector() {
  const { appUser } = useAppUser();
  const guard = useMesseRouteGuardState(appUser);
  const location = useLocation();
  const navigate = useNavigate();
  const role = derivePortalRole(appUser);
  const isExhibition = isExhibitionRole(role);

  useEffect(() => {
    const exhibitionActive = isExhibitionActive();
    const { realUser, activeMode, shouldLeaveMesse, destination } = guard;

    // DEV log — temporary, helps diagnose stuck exhibition issues.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[ExhibitionRedirector]', {
        path: location.pathname,
        realUserExists: !!realUser,
        realPortalRole: realUser?.portal_role ?? null,
        exhibitionActive,
        activeMode,
        derivedRole: role,
        isExhibition,
        redirectDecision: shouldLeaveMesse && location.pathname.startsWith('/messe') ? destination : null,
      });
    }

    const onMesse = location.pathname.startsWith('/messe');

    // Real backend/service user
    if (realUser) {
      // If on /messe but active preview is NOT exhibition_user → leave /messe
      // and route to the correct portal for the selected mode.
      if (onMesse) {
        if (shouldLeaveMesse) {
          leaveExhibitionMode();
          navigate(destination, { replace: true });
        }
        return;
      }
      // Outside /messe: clear stale exhibition flag if it lingers.
      if (exhibitionActive) leaveExhibitionMode();
      return;
    }

    if (!isExhibition) return;
    const p = location.pathname;
    if (p.startsWith('/messe')) return;
    if (p === '/update-password' || p === '/reset-password') return;
    navigate('/messe', { replace: true });
  }, [guard, isExhibition, location.pathname, navigate, role]);

  return null;
}
