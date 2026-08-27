import { describe, expect, it } from 'vitest';
import { hasAreaAccess, hasModuleAccess } from '@/lib/portalAccess';

const seller = {
  email: 'akr@timan.dk',
  role: 'timan_saelger',
  partner_type: null,
  portal_role: 'timan_seller',
};

describe('portal access precedence', () => {
  it('uses role defaults when no manual area override exists', () => {
    expect(hasAreaAccess(seller, 'timan_crm')).toBe(true);
    expect(hasAreaAccess(seller, 'marketing')).toBe(false);
  });

  it('lets a manual area override grant extra access', () => {
    expect(hasAreaAccess({ ...seller, allowed_areas: ['marketing'] }, 'marketing')).toBe(true);
  });

  it('respects an explicitly empty manual area override', () => {
    expect(hasAreaAccess({ ...seller, allowed_areas: [] }, 'timan_crm')).toBe(false);
  });

  it('respects an explicitly empty module override', () => {
    expect(hasModuleAccess('timan_seller', 'timan_crm', [])).toBe(false);
  });
});
