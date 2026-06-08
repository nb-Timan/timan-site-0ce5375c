/**
 * Thin wrappers that re-use existing pages but render them inside the
 * /messe namespace. Pages already read role/session from context, and
 * derive "exhibition_user" via portalAccess — they automatically suppress
 * save/send/account UI when the active role is exhibition_user.
 */
import ConfiguratorPage from '@/pages/ConfiguratorPage';
import PartnerMapPage from '@/pages/misc/PartnerMapPage';

export function MesseConfiguratorPage() {
  return <ConfiguratorPage />;
}

export function MessePartnerMapPage() {
  return <PartnerMapPage />;
}
