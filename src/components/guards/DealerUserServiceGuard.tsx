import { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, hasModuleAccess, ModuleAccessKey } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';

/**
 * Blocks Forhandlerbruger from Teknik & Service URLs unless the user has
 * been granted Teknik & Service access explicitly.
 */
export function DealerUserServiceGuard({ children }: { children?: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser) ?? appUser;
  if (loading) return null;
  const role = derivePortalRole(effectiveUser);
  const moduleOverride = (effectiveUser?.module_access ?? null) as ModuleAccessKey[] | null;
  if (role === 'dealer_user' && !hasModuleAccess(role, 'teknik_service', moduleOverride)) {
    return <Navigate to="/portal" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}
