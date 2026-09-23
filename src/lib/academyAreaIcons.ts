import { Building2, Compass, ShoppingCart, Target } from 'lucide-react';

/** One stable visual identity per Academy subject area. */
export const ACADEMY_AREA_ICONS = {
  sales: ShoppingCart,
  portalBasics: Compass,
  partnerData: Building2,
  crm: Target,
} as const;
