import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canApplyExtraDealerDiscount,
  canSelectConfiguratorDemo,
} from '../../supabase/functions/_shared/configuratorPermissionContract';

const seller = {
  portalRole: 'timan_seller',
  permissions: { can_apply_extra_dealer_discount: false },
  canEditDiscount: false,
};

describe('Configurator Demo access', () => {
  it('lets a canonical Timan seller select Demo independently of price and extra-discount permissions', () => {
    expect(canApplyExtraDealerDiscount(seller)).toBe(false);
    expect(canSelectConfiguratorDemo({
      portalRole: seller.portalRole,
      hasConfiguratorAccess: true,
      canViewPrices: false,
      isDirectPricing: false,
      isExhibition: false,
    })).toBe(true);
  });

  it('does not make campaign state part of Demo authorization', () => {
    const input = {
      portalRole: seller.portalRole,
      hasConfiguratorAccess: true,
      canViewPrices: true,
      isDirectPricing: false,
      isExhibition: false,
    };
    expect(canSelectConfiguratorDemo(input)).toBe(true);
    expect(Object.keys(input)).not.toContain('campaignPricingActive');
  });

  it('preserves explicit extra-discount denial and Backend defaults', () => {
    expect(canApplyExtraDealerDiscount(seller)).toBe(false);
    expect(canApplyExtraDealerDiscount({ portalRole: 'timan_backend' })).toBe(true);
    expect(canApplyExtraDealerDiscount({
      portalRole: 'timan_backend',
      permissions: { can_apply_extra_dealer_discount: false },
    })).toBe(false);
  });

  it('keeps Direct pricing and exhibition flows incompatible with Demo pricing', () => {
    const base = {
      portalRole: seller.portalRole,
      hasConfiguratorAccess: true,
      canViewPrices: true,
    };
    expect(canSelectConfiguratorDemo({ ...base, isDirectPricing: true, isExhibition: false })).toBe(false);
    expect(canSelectConfiguratorDemo({ ...base, isDirectPricing: false, isExhibition: true })).toBe(false);
  });

  it('uses the shared permission contract in both the Configurator and protected Assistant action', () => {
    const page = readFileSync(resolve('src/pages/ConfiguratorPage.tsx'), 'utf8');
    const endpoint = readFileSync(resolve('supabase/functions/support-actions/index.ts'), 'utf8');
    expect(page).toContain('canSelectConfiguratorDemo({');
    expect(page).toContain('resolveExtraDealerDiscountPermission({');
    expect(endpoint).toContain('canApplyExtraDealerDiscount({');
    expect(endpoint).toContain("throw new Error('EXTRA_DISCOUNT_DENIED')");
  });
});
