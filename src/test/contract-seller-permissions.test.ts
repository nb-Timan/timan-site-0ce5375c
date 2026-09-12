import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('narrows non-internal view-as contract reads with the canonical organisation scope', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');

    expect(source).toContain("import { buildJournalScope } from '@/lib/machineJournalScope';");
    expect(source).toContain('const scope = await buildJournalScope(effectiveUser, portalRole);');
    expect(source).toContain('!scope.dealerNumbers.has(accountNumber)');
    expect(source).toContain("error: 'Du har ikke adgang til denne kontrakt.'");
  });
});
