import { beforeEach, describe, expect, it } from 'vitest';
import { academySandbox } from '@/lib/academySandbox';
import { setAcademyCycleStorageScope } from '@/lib/academyCycleStorage';

describe('Academy server cycle context', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    academySandbox.enterSession();
  });

  it('keeps a completed cycle local history while preventing a stale training session', () => {
    setAcademyCycleStorageScope('cycle-1', 0, 'active');
    academySandbox.startPartnerMap();
    academySandbox.trackPartnerMapOwnDealer();

    setAcademyCycleStorageScope('cycle-1', 0, 'completed');

    expect(academySandbox.isActive()).toBe(false);
    expect(academySandbox.getActiveCase()).toBeNull();
    expect(academySandbox.getPartnerMap().ownDealerShown).toBe(true);
  });
});
