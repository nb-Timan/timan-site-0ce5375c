import type { PortalAreaId } from '@/lib/portalAreas';

/** Canonical destinations for the cards on the portal home page. */
export const PORTAL_AREA_ROUTES: Record<PortalAreaId, string> = {
  teknik_service: '/portal/teknik-service',
  salg_marketing: '/portal/salg-marketing',
  calendar: '/portal/crm/calendar',
  marketing: '/portal/marketing',
  timan_crm: '/portal/crm',
  timan_backend: '/portal/backend',
  dealer_data: '/portal/dealer-data',
};

export const ACADEMY_ROUTE = '/academy';
