import { portalCapabilityRoute } from '../../supabase/functions/_shared/portalCapabilityContract';

/** The only route that renders the dealer-facing warranty registration form. */
export const WARRANTY_CREATE_ROUTE = portalCapabilityRoute('quick.create_warranty');
