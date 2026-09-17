/**
 * Thin wrappers that re-use existing portal pages inside the /messe namespace.
 *
 * Access control is handled by <MesseRouteGuard /> in App.tsx. Any allowed
 * Messe entry path reaches the same wrappers; the /messe route context selects
 * the event-oriented presentation inside the shared pages.
 *
 * The wrapped pages read the live appUser + preview state via
 * isMesseVariantUser() / isMessePreviewActive() to suppress save/send/account
 * UI in demo mode.
 */
import ConfiguratorPage from '@/pages/ConfiguratorPage';
import PartnerMapPage from '@/pages/misc/PartnerMapPage';

export function MesseConfiguratorPage() {
  return <ConfiguratorPage />;
}

export function MessePartnerMapPage() {
  return <PartnerMapPage />;
}

