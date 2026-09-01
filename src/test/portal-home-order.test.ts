import { describe, expect, it } from 'vitest';
import { PORTAL_AREAS } from '@/lib/portalAreas';
import { sortPortalHomeCards, type PortalHomeCard } from '@/lib/portalHomeOrder';

function cards(ids: PortalHomeCard['id'][]): PortalHomeCard[] {
  return ids.map((id) => id === 'messe'
    ? { kind: 'messe', id }
    : { kind: 'area', id });
}

function ids(input: PortalHomeCard[]) {
  return sortPortalHomeCards(input).map((card) => card.id);
}

describe('portal home module order', () => {
  it('sorts a backend user with full access into the fixed global order', () => {
    expect(ids(cards([
      'teknik_service',
      'salg_marketing',
      'calendar',
      'marketing',
      'timan_backend',
      'dealer_data',
      'projects',
      'messe',
      'timan_crm',
    ]))).toEqual([
      'salg_marketing',
      'dealer_data',
      'timan_crm',
      'marketing',
      'teknik_service',
      'calendar',
      'projects',
      'messe',
      'timan_backend',
    ]);
  });

  it('packs seller modules forward when a middle card is not visible', () => {
    expect(ids(cards([
      'calendar',
      'timan_crm',
      'teknik_service',
      'salg_marketing',
      'dealer_data',
      'projects',
      'messe',
    ]))).toEqual([
      'salg_marketing',
      'dealer_data',
      'timan_crm',
      'teknik_service',
      'calendar',
      'projects',
      'messe',
    ]);
  });

  it('keeps external users compact with only their visible modules', () => {
    expect(ids(cards([
      'teknik_service',
      'dealer_data',
      'salg_marketing',
    ]))).toEqual([
      'salg_marketing',
      'dealer_data',
      'teknik_service',
    ]);
  });

  it('uses the real Partnerdata and CRM area ids in the expected order', () => {
    const realCards = PORTAL_AREAS
      .filter((area) => ['salg_marketing', 'timan_crm', 'dealer_data'].includes(area.id))
      .map((area) => ({ kind: 'area' as const, id: area.id, area }));

    expect(realCards.map((card) => card.id)).toEqual(['salg_marketing', 'timan_crm', 'dealer_data']);
    expect(sortPortalHomeCards(realCards).map((card) => card.id)).toEqual(['salg_marketing', 'dealer_data', 'timan_crm']);
  });
});
