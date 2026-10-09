export type ConfiguratorPermissionContext = {
  portalRole: string | null | undefined;
  permissions?: Record<string, boolean> | null;
  canEditDiscount?: boolean | null;
};

export type ConfiguratorDemoAccessContext = {
  portalRole: string | null | undefined;
  hasConfiguratorAccess: boolean;
  canViewPrices: boolean;
  isDirectPricing: boolean;
  isExhibition: boolean;
};

/** Shared permission contract for manual partner-pricing adjustments. */
export function canApplyExtraDealerDiscount(context: ConfiguratorPermissionContext): boolean {
  const explicit = context.permissions?.can_apply_extra_dealer_discount;
  if (explicit !== undefined) return explicit === true;
  return context.portalRole === 'timan_backend' || context.canEditDiscount === true;
}

/**
 * Demo is a machine state, not a manual-discount capability. Internal sellers
 * and Backend may therefore select it even when price visibility was explicitly
 * disabled; other roles retain the existing price-visibility requirement.
 */
export function canSelectConfiguratorDemo(context: ConfiguratorDemoAccessContext): boolean {
  if (!context.hasConfiguratorAccess || context.isDirectPricing || context.isExhibition) return false;
  if (context.portalRole === 'timan_backend' || context.portalRole === 'timan_seller') return true;
  return context.canViewPrices;
}
