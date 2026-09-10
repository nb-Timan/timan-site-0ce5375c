import { describe, expect, it } from 'vitest';
import { canAccessContractsModule } from '@/lib/portalAccess';
import { dealerMatchesContractSellerScope } from '@/lib/dealerContractsService';

const akr = {
  email: 'akr@timan.dk',
  initials: 'AKR',
  role: 'slutkunde' as const,
  partner_type: null,
  portal_role: 'timan_seller',
  allowed_modules: ['contracts'],
  module_access: [],
};

describe('contract seller permissions', () => {
  it('uses the canonical module resolver for seller contract access', () => {
    expect(canAccessContractsModule(akr)).toBe(true);
    expect(canAccessContractsModule({ ...akr, allowed_modules: [] })).toBe(false);
  });

  it('narrows View-as seller scope to the canonical dealer assignment', () => {
    const assignedDealer = {
      assigned_seller_id: 'seller-id',
      assigned_seller_email: 'akr@timan.dk',
      assigned_seller_initials: 'AKR',
    };
    expect(dealerMatchesContractSellerScope(assignedDealer, { sellerEmail: 'akr@timan.dk' })).toBe(true);
    expect(dealerMatchesContractSellerScope(assignedDealer, { sellerEmail: 'em@timan.dk' })).toBe(false);
  });
});
