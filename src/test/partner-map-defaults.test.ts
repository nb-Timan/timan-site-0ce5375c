import { describe, expect, it } from 'vitest';
import {
  getDefaultPartnerMapTypes,
  showsWarrantyLayerByDefault,
} from '@/pages/misc/PartnerMapPage';

describe('partner map defaults', () => {
  it('opens the Timan map without suppliers and with warranty registrations visible', () => {
    for (const role of ['timan_backend', 'timan_seller', 'timan_service']) {
      expect(getDefaultPartnerMapTypes(role).has('supplier')).toBe(false);
      expect(showsWarrantyLayerByDefault(role, false)).toBe(true);
    }
  });

  it('keeps dealer-side defaults unchanged and never enables the warranty layer in the public messe view', () => {
    expect(getDefaultPartnerMapTypes('timan_dealer').has('supplier')).toBe(true);
    expect(showsWarrantyLayerByDefault('timan_dealer', false)).toBe(false);
    expect(showsWarrantyLayerByDefault('timan_backend', true)).toBe(false);
  });
});
