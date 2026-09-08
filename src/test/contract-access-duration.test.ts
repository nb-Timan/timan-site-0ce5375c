import { describe, expect, it } from 'vitest';
import { addContractAccessDuration, getContractAccessDurationMinutes } from '@/lib/contractAccessDuration';

describe('contract access duration', () => {
  it('supports custom hours and days within the explicit limits', () => {
    expect(getContractAccessDurationMinutes(6, 'hours')).toBe(360);
    expect(getContractAccessDurationMinutes(2, 'days')).toBe(2_880);
    expect(getContractAccessDurationMinutes(169, 'hours')).toBeNull();
    expect(getContractAccessDurationMinutes(31, 'days')).toBeNull();
  });

  it('calculates expiry from the selected opening time', () => {
    expect(addContractAccessDuration('2026-09-08T12:00:00.000Z', 6, 'hours')).toBe('2026-09-08T18:00:00.000Z');
    expect(addContractAccessDuration('2026-09-08T12:00:00.000Z', 2, 'days')).toBe('2026-09-10T12:00:00.000Z');
  });
});
