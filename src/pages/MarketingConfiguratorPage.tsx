import { Navigate } from 'react-router-dom';
import ConfiguratorPage from '@/pages/ConfiguratorPage';
import { useAppUser } from '@/context/AppUserContext';
import { canManageMarketingConfiguratorContent } from '@/lib/portalAccess';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';

/**
 * Marketing changes presentation data inside the canonical Configurator.
 * This route only resolves access; the cards, validation and product rules are
 * shared with Sales through ConfiguratorPage.
 */
export default function MarketingConfiguratorPage() {
  const { appUser, loading } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);

  if (loading || resolving) return null;
  if (!appUser || !canManageMarketingConfiguratorContent(effectiveUser)) {
    return <Navigate to="/portal/marketing" replace />;
  }

  return <ConfiguratorPage marketingEditMode />;
}
