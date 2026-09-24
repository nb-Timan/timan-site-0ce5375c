import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULE_ACCESS, hasModuleAccess, type ModuleAccessKey } from '@/lib/portalAccess';
import { canAccessAcademy, hasAcademyModuleAccess, isAcademyCapabilityGated, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';

const seller = (allowed_modules: string[] | null) => ({
  role: 'timan_saelger' as const,
  partner_type: null,
  portal_role: 'timan_seller',
  allowed_modules,
  module_access: allowed_modules,
});

describe('Academy module access', () => {
  it('defaults existing role access to Academy off', () => {
    expect(DEFAULT_MODULE_ACCESS.timan_seller).not.toContain('academy');
    expect(DEFAULT_MODULE_ACCESS.timan_dealer).not.toContain('academy');
    expect(DEFAULT_MODULE_ACCESS.timan_backend).not.toContain('academy');
  });

  it('only enables Academy and capability locks for an explicit Academy module', () => {
    const academyOff = seller(['salg_marketing', 'byg_din_timan', 'timan_crm']);
    const academyOn = seller(['salg_marketing', 'byg_din_timan', 'timan_crm', 'academy']);

    expect(hasAcademyModuleAccess(academyOff)).toBe(false);
    expect(canAccessAcademy(academyOff)).toBe(false);
    expect(isAcademyCapabilityGated(academyOff)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academyOff, 'configurator', [])).toBe(true);

    expect(hasAcademyModuleAccess(academyOn)).toBe(true);
    expect(canAccessAcademy(academyOn)).toBe(true);
    expect(isAcademyCapabilityGated(academyOn)).toBe(true);
    expect(isAcademyCapabilityUnlocked(academyOn, 'configurator', [])).toBe(false);
  });

  it('does not grant Academy implicitly to Backend users', () => {
    const backendOff = {
      role: 'timan_saelger' as const,
      partner_type: null,
      portal_role: 'timan_backend',
      allowed_modules: ['timan_backend', 'timan_crm'] as ModuleAccessKey[],
      module_access: ['timan_backend', 'timan_crm'],
    };

    expect(canAccessAcademy(backendOff)).toBe(false);
    expect(isAcademyCapabilityGated(backendOff)).toBe(false);
    expect(isAcademyCapabilityUnlocked(backendOff, 'configurator', [])).toBe(true);
    expect(hasModuleAccess('timan_backend', 'academy', backendOff.allowed_modules)).toBe(false);
    expect(hasModuleAccess('timan_backend', 'timan_crm', backendOff.allowed_modules)).toBe(true);
  });

  it('lets the canonical allowed_modules value win over stale module_access', () => {
    const academyOffWithStaleCache = {
      ...seller(['salg_marketing', 'byg_din_timan']),
      module_access: ['academy'],
    };

    expect(hasAcademyModuleAccess(academyOffWithStaleCache)).toBe(false);
    expect(canAccessAcademy(academyOffWithStaleCache)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academyOffWithStaleCache, 'configurator', [])).toBe(true);
  });

  it('uses the existing backend editor and route guards instead of a new data field', () => {
    const editor = readFileSync('src/pages/backend/BackendUsersPage.tsx', 'utf8');
    const routes = readFileSync('src/App.tsx', 'utf8');
    const portal = readFileSync('src/pages/PortalPage.tsx', 'utf8');
    const academyPage = readFileSync('src/pages/AcademyPage.tsx', 'utf8');

    expect(editor).toContain('academy: "Timan Academy"');
    expect(editor).toContain('data-access-domain="Academy"');
    expect(routes).toContain('<AcademyAccessGuard><AcademyPage /></AcademyAccessGuard>');
    expect(portal).toContain("const academyEnabled = hasTopLevelPortalAreaAccess(effectiveUser, 'academy');");
    expect(academyPage).toContain('useEffectivePortalUserState(appUser)');
  });

  it('keeps Academy completion gates inside the active local sandbox', () => {
    const guard = readFileSync('src/components/academy/AcademyCapabilityGuard.tsx', 'utf8');

    expect(guard).toContain('if (!academySandbox.isActive()) return <>{children}</>;');
    expect(guard).toContain('isAcademyCapabilityUnlocked');
    expect(guard).toContain("academySandbox.getActiveCase() === ACADEMY_CASE_1");
  });

  it('uses the active Academy case to restrict Portal Basics without changing real portal permissions', () => {
    const portal = readFileSync('src/pages/PortalPage.tsx', 'utf8');
    const sandbox = readFileSync('src/lib/academySandbox.ts', 'utf8');

    expect(portal).toContain('academySandbox.getAllowedPortalHomeCardIds()');
    expect(portal).toContain('academyAllowedHomeCards.includes(card.id)');
    expect(sandbox).toContain("'portal.basics_5': ['academy', 'dealer_data', 'messe']");
  });
});
