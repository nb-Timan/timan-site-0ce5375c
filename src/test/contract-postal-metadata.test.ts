import { describe, expect, it } from 'vitest';
import { resolveContractPostalAreaMetadata } from '@/lib/contractPostalMetadata';

describe('contract postal metadata', () => {
  it('resolves Danish postal codes from the local postal dataset', () => {
    expect(resolveContractPostalAreaMetadata('DK', '6950')).toEqual({
      country: 'DK',
      postalCode: '6950',
      locality: 'Ringkøbing',
    });
    expect(resolveContractPostalAreaMetadata('DK', '6940')).toEqual({
      country: 'DK',
      postalCode: '6940',
      locality: 'Lem St',
    });
  });

  it('does not guess unknown or unsupported postal-code cities', () => {
    expect(resolveContractPostalAreaMetadata('DK', '1234')).toBeNull();
    expect(resolveContractPostalAreaMetadata('DE', '27404')).toBeNull();
  });
});
