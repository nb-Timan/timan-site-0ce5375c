import { beforeEach, describe, expect, it } from 'vitest';
import { academySandbox } from '@/lib/academySandbox';

describe('Academy Partnerkort progression', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/academy');
    academySandbox.enterSession();
    academySandbox.startPartnerMap();
  });

  it('requires the four standard actions and persists them locally', () => {
    academySandbox.trackPartnerMapOwnDealer();
    academySandbox.trackPartnerMapFullscreen();
    academySandbox.trackPartnerMapWarrantyLayer();
    expect(academySandbox.getPartnerMap().completed).toBe(false);

    academySandbox.trackPartnerMapWarrantyOpened();
    expect(academySandbox.getPartnerMap()).toMatchObject({
      ownDealerShown: true,
      fullscreenUsed: true,
      warrantyLayerShown: true,
      warrantyOpened: true,
      completed: true,
    });
  });

  it('adds the canonical service-detail action only when the existing access allows it', () => {
    academySandbox.configurePartnerMapServiceDetail(true);
    academySandbox.trackPartnerMapOwnDealer();
    academySandbox.trackPartnerMapFullscreen();
    academySandbox.trackPartnerMapWarrantyLayer();
    academySandbox.trackPartnerMapWarrantyOpened();
    expect(academySandbox.getPartnerMap().completed).toBe(false);

    academySandbox.trackPartnerMapServiceDetail();
    expect(academySandbox.getPartnerMap().completed).toBe(true);
  });
});
