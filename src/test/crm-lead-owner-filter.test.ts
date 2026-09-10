import { describe, expect, it } from 'vitest';
import {
  buildCrmLeadOwnerFilterOptions,
  crmLeadOwnerFilterSellerId,
} from '@/lib/crmLeadOwnerFilter';

describe('CRM lead owner filter', () => {
  it('uses canonical user ids as filter values while grouping the named seller initials', () => {
    const result = buildCrmLeadOwnerFilterOptions([
      { id: 'seller-em', initials: 'EM' },
      { id: 'seller-bp', initials: 'bp' },
      { id: 'seller-akr', initials: 'AKR' },
      { id: 'seller-jtn', initials: 'JTN' },
      { id: 'seller-other', initials: 'TS' },
    ]);

    expect(result.primary).toEqual([
      { id: 'seller-akr', initials: 'AKR' },
      { id: 'seller-bp', initials: 'BP' },
      { id: 'seller-em', initials: 'EM' },
      { id: 'seller-jtn', initials: 'JTN' },
    ]);
    expect(result.primarySellerIds).toEqual(['seller-akr', 'seller-bp', 'seller-em', 'seller-jtn']);
    expect(result.hasOtherSellers).toBe(true);
    expect(crmLeadOwnerFilterSellerId('seller:seller-akr')).toBe('seller-akr');
  });

  it('does not infer ownership from a person name or email address', () => {
    const result = buildCrmLeadOwnerFilterOptions([
      { id: 'seller-1', initials: null },
      { id: 'seller-2', initials: 'EM' },
    ]);

    expect(result.primary).toEqual([{ id: 'seller-2', initials: 'EM' }]);
    expect(result.primarySellerIds).toEqual(['seller-2']);
    expect(result.hasOtherSellers).toBe(true);
    expect(crmLeadOwnerFilterSellerId('partner_created')).toBeNull();
    expect(crmLeadOwnerFilterSellerId('unassigned_timan_seller')).toBeNull();
  });
});
