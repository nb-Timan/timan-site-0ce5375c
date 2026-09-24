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

  it('allows an explicitly started unresolved case to continue after an older curriculum completed', () => {
    setAcademyCycleStorageScope('cycle-1', 0, 'completed', ['sales.case_1_rc1000']);

    expect(academySandbox.isActive()).toBe(false);
    academySandbox.startCase2();

    expect(academySandbox.isActive()).toBe(true);
    expect(academySandbox.getActiveCase()).toBe('sales.case_2_video_3330');
  });

  it('uses canonical cycle completions for the Sales Case 3 prerequisite', () => {
    setAcademyCycleStorageScope('cycle-1', 0, 'completed', [
      'sales.case_1_rc1000',
      'sales.case_2_video_3330',
    ]);

    academySandbox.startCase3();

    expect(academySandbox.isActive()).toBe(true);
    expect(academySandbox.getActiveCase()).toBe('sales.case_3_rc1000_delivery');
  });
});
