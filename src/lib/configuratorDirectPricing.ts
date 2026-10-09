import type { AppUser } from '@/data/appUsers';
import { derivePortalRole } from '@/lib/portalAccess';

type DirectPricingUser = Pick<AppUser, 'role' | 'partner_type'> & {
  email?: string | null;
  portal_role?: string | null;
  module_access?: string[] | null;
};

/** Direct pricing follows the effective portal role, including View-as. */
export function canUseDirectPricing(user: DirectPricingUser | null | undefined): boolean {
  const role = derivePortalRole(user ?? null);
  return role === 'timan_seller' || role === 'timan_backend';
}
