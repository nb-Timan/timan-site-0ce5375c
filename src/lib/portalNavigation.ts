import type { PortalAreaId } from '@/lib/portalAreas';
import { portalCapabilityRoute } from '../../supabase/functions/_shared/portalCapabilityContract';

/** Canonical destinations for the cards on the portal home page. */
export const PORTAL_AREA_ROUTES: Record<PortalAreaId, string> = {
  teknik_service: portalCapabilityRoute('area.technical_service'),
  salg_marketing: portalCapabilityRoute('area.sales'),
  calendar: portalCapabilityRoute('area.calendar'),
  marketing: portalCapabilityRoute('area.marketing'),
  timan_crm: portalCapabilityRoute('area.crm'),
  timan_backend: portalCapabilityRoute('area.backend'),
  dealer_data: portalCapabilityRoute('area.partner_data'),
};

export const ACADEMY_ROUTE = portalCapabilityRoute('area.academy');
