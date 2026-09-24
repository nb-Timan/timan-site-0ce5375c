import { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { academySandbox } from '@/lib/academySandbox';
import { canOpenAcademyService } from '@/lib/academyMachineSandbox';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, hasAreaAccess, type PortalAreaAccessKey } from '@/lib/portalAccess';
import { useEffectivePortalUser, useEffectivePortalUserState } from '@/lib/viewAsUser';

export function PortalAreaAccessGuard({
  area,
  children,
}: {
  area: PortalAreaAccessKey;
  children?: ReactNode;
}) {
  const { appUser, loading } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  if (loading || resolving) return null;
  if (!appUser || !hasAreaAccess(effectiveUser, area)) return <Navigate to="/portal" replace />;
  return <>{children ?? <Outlet />}</>;
}

/**
 * Blocks Dealer User from any Teknik & Service URL.
 *
 * Dealer User is restricted to Salg & Marketing (and optionally
 * Forhandlerdata when explicitly allowed). Direct URL access to
 * /portal/service/*, /portal/claims, /portal/warranty, /portal/tsb,
 * /portal/teknik-service is redirected to /portal.
 *
 * All other roles (Backend, Sælger, Service, Importør, Forhandler,
 * Service Partner, Messe) pass through unchanged.
 */
export function DealerUserServiceGuard({ children }: { children?: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser) ?? appUser;
  const { pathname } = useLocation();
  if (loading) return null;
  const role = derivePortalRole(effectiveUser);
  const academyMachineRoute = academySandbox.isActive()
    && (pathname === '/portal/teknik-service' || /^\/portal\/service\/machines(?:\/[^/]+)?$/.test(pathname))
    && canOpenAcademyService(effectiveUser);
  if (role === 'dealer_user' && !academyMachineRoute) return <Navigate to="/portal" replace />;
  return <>{children ?? <Outlet />}</>;
}
