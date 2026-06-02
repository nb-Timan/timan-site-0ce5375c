/**
 * Contextual back navigation for portal pages.
 *
 * Returns the route a "Tilbage" / "Back" control should navigate to,
 * based on the current pathname. Keeps users inside the same portal area
 * instead of bouncing all the way to the portal frontpage.
 */

import type { NavigateFunction } from 'react-router-dom';

export type PortalBackTarget =
  | '/portal'
  | '/portal/teknik-service'
  | '/portal/salg-marketing'
  | '/portal/backend'
  | '/portal/crm';

const SERVICE_PREFIXES = [
  '/portal/service/tsb',
  '/portal/service/claims',
  '/portal/service/warranty',
];

const SALES_PREFIXES = [
  '/portal/configurator',
  '/portal/offers',
  '/portal/orders',
  '/portal/resources',
  '/portal/videos',
  '/portal/misc',
];

const BACKEND_CHILD_PREFIXES = [
  '/portal/backend/users',
  '/portal/backend/roles',
  '/portal/backend/module-access',
  '/portal/backend/audit-log',
];

const AREA_PAGES = [
  '/portal/teknik-service',
  '/portal/salg-marketing',
  '/portal/backend',
  '/portal/crm',
];

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'));
}

/**
 * Map a pathname to its contextual back target.
 *
 * - Service child pages → /portal/teknik-service
 * - Sales child pages   → /portal/salg-marketing
 * - CRM child pages     → /portal/crm
 * - Backend child pages → /portal/backend
 * - Area pages          → /portal
 * - Anything else       → /portal
 */
export function getPortalBackTarget(pathname: string): PortalBackTarget {
  // Area pages first → portal frontpage
  if (AREA_PAGES.includes(pathname)) return '/portal';

  // CRM dashboard route is treated as the CRM area landing → back to portal
  if (pathname === '/portal/crm/dashboard') return '/portal';

  if (startsWithAny(pathname, SERVICE_PREFIXES)) return '/portal/teknik-service';
  if (startsWithAny(pathname, SALES_PREFIXES)) return '/portal/salg-marketing';
  if (startsWithAny(pathname, BACKEND_CHILD_PREFIXES)) return '/portal/backend';
  if (pathname.startsWith('/portal/crm/')) return '/portal/crm';

  return '/portal';
}

/**
 * Go one step back in the browser history when there is history to pop,
 * otherwise navigate to a sensible fallback inside the portal.
 *
 * This is the standard behaviour for "Tilbage" buttons across the portal:
 * users only move one step back, but deep-links still work because the
 * fallback maps the current page to its parent area.
 */
export function goBackOrFallback(
  navigate: NavigateFunction,
  location: { key?: string; pathname: string },
  fallback?: string,
): void {
  if (location.key && location.key !== 'default') {
    navigate(-1);
    return;
  }
  navigate(fallback ?? getPortalBackTarget(location.pathname));
}
