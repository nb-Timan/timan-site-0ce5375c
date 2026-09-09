import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULE_ACCESS } from '@/lib/portalAccess';
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

  it('uses the existing backend editor and route guards instead of a new data field', () => {
    const editor = readFileSync('src/pages/backend/BackendUsersPage.tsx', 'utf8');
    const routes = readFileSync('src/App.tsx', 'utf8');
    const portal = readFileSync('src/pages/PortalPage.tsx', 'utf8');
    const academyPage = readFileSync('src/pages/AcademyPage.tsx', 'utf8');

    expect(editor).toContain('academy: "Timan Academy"');
    expect(editor).toContain('{ label: "Academy", modules: ["academy"] }');
    expect(routes).toContain('<AcademyAccessGuard><AcademyPage /></AcademyAccessGuard>');
    expect(portal).toContain('const academyEnabled = canAccessAcademy(effectiveUser);');
    expect(academyPage).toContain('useEffectivePortalUserState(appUser)');
  });
});
