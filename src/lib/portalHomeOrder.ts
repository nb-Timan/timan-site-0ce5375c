import type { PortalArea } from '@/lib/portalAreas';

export const PORTAL_HOME_AREA_ORDER = [
  'salg_marketing',
  'dealer_data',
  'timan_crm',
  'marketing',
  'teknik_service',
  'calendar',
  'messe',
  'timan_backend',
] as const;

export type PortalHomeCard =
  | { kind: 'area'; id: PortalArea['id']; area?: PortalArea }
  | { kind: 'messe'; id: 'messe' };

export function sortPortalHomeCards<T extends PortalHomeCard>(cards: T[]): T[] {
  const priority = new Map(PORTAL_HOME_AREA_ORDER.map((id, index) => [id, index]));
  return [...cards].sort((a, b) => (priority.get(a.id) ?? 999) - (priority.get(b.id) ?? 999));
}
