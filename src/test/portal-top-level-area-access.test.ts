import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_AREAS } from '@/lib/backend-users-store';
import {
  PORTAL_TOP_LEVEL_ACCESS,
  hasTopLevelPortalAreaAccess,
  isMesseVariantUser,
} from '@/lib/portalAccess';

const seller = {
  email: 'akr@timan.dk',
  role: 'timan_saelger' as const,
  partner_type: null,
  portal_role: 'timan_seller',
};

describe('canonical top-level portal area access', () => {
  it('exposes the same nine areas in the user editor order', () => {
    expect(PORTAL_TOP_LEVEL_ACCESS.map((entry) => entry.id)).toEqual([
      'salg_marketing',
      'marketing',
      'teknik_service',
      'dealer_data',
      'timan_crm',
      'calendar',
      'messe',
      'academy',
      'timan_backend',
    ]);
    expect(ALL_AREAS).toContain('calendar');
  });

  it('keeps Messe and Academy on their existing canonical module gates', () => {
    const messe = PORTAL_TOP_LEVEL_ACCESS.find((entry) => entry.id === 'messe');
    const academy = PORTAL_TOP_LEVEL_ACCESS.find((entry) => entry.id === 'academy');
    expect(messe).toEqual({ id: 'messe', source: 'module', key: 'messe_portal' });
    expect(academy).toEqual({ id: 'academy', source: 'module', key: 'academy' });
  });

  it('lets explicit area/module overrides independently control the top-level cards', () => {
    const effectiveSeller = {
      ...seller,
      allowed_areas: ['salg_marketing', 'timan_crm'],
      allowed_modules: ['messe_portal', 'academy'],
    };
    expect(hasTopLevelPortalAreaAccess(effectiveSeller, 'calendar')).toBe(false);
    expect(hasTopLevelPortalAreaAccess(effectiveSeller, 'messe')).toBe(true);
    expect(hasTopLevelPortalAreaAccess(effectiveSeller, 'academy')).toBe(true);
    expect(hasTopLevelPortalAreaAccess({ ...effectiveSeller, allowed_modules: ['academy'] }, 'messe')).toBe(false);
  });

  it('keeps Standard Portal Messe access independent from the Messe portal variant', () => {
    const standardWithMesse = { ...seller, portal_variant: 'standard', allowed_modules: ['messe_portal'] };
    expect(isMesseVariantUser(standardWithMesse)).toBe(false);
    expect(hasTopLevelPortalAreaAccess(standardWithMesse, 'messe')).toBe(true);

    const lockedMesseVariant = { ...seller, portal_variant: 'messe', allowed_modules: [] };
    expect(isMesseVariantUser(lockedMesseVariant)).toBe(true);
    expect(hasTopLevelPortalAreaAccess(lockedMesseVariant, 'messe')).toBe(false);

    const guards = readFileSync('src/components/messe/MesseGuards.tsx', 'utf8');
    const lockGuard = guards.slice(guards.indexOf('export function PortalLockGuard'));
    expect(lockGuard).not.toContain("portalRole === 'dealer_user' && hasMessePortalAccess(appUser)");
    expect(lockGuard).toContain("isMesseVariantUser(appUser) || portalRole === 'exhibition_user'");
  });

  it('guards the calendar route with the effective canonical area gate', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain('<PortalAreaAccessGuard area="calendar">');
    expect(app).toContain('<CrmCalendarPage />');
  });
});
