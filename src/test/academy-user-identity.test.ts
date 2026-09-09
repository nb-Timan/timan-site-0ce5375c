import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Academy user identity isolation', () => {
  it('never restores an Academy persona as the portal session user', () => {
    const context = read('src/context/AppUserContext.tsx');

    expect(context).toContain("if (cached.id === 'academy-local-sales-user') return null;");
    expect(context).not.toContain('if (hasLocalAcademyEnrollment()) return getLocalAcademyUser();');
    expect(context).not.toContain('setAppUser(getLocalAcademyUser());');
  });

  it('keeps Academy routes from replacing the authenticated user', () => {
    const academyPage = read('src/pages/AcademyPage.tsx');
    const academyCrmRoute = read('src/pages/crm/AcademyCrmLeadsPage.tsx');
    const configurator = read('src/pages/ConfiguratorPage.tsx');

    expect(academyPage).not.toContain('setAppUser(getLocalAcademyUser())');
    expect(academyCrmRoute).not.toContain("setAppUser(getLocalAcademyUser())");
    expect(configurator).not.toContain("display_name: 'Academy Sales'");
  });

  it('provides an Academy exit path that restores the authenticated user', () => {
    const header = read('src/components/portal/PortalHeader.tsx');
    const configurator = read('src/pages/ConfiguratorPage.tsx');

    expect(header).toContain('Forlad Academy');
    expect(header).toContain('const restoredUser = await refreshAppUser();');
    expect(header).toContain("navigate('/portal', { replace: true });");
    expect(configurator).toContain('Forlad Academy');
    expect(configurator).toContain('const restoredUser = await refreshAppUser();');
  });
});
