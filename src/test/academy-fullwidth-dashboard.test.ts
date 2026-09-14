import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const academyPage = readFileSync('src/pages/AcademyPage.tsx', 'utf8');

describe('Academy fullwidth dashboard layout', () => {
  it('keeps the shared portal header while removing the Academy-only sidebar', () => {
    expect(academyPage).toContain('<PortalHeader');
    expect(academyPage).not.toContain('<aside');
    expect(academyPage).toContain('max-w-[1600px]');
  });

  it('uses the compact dashboard hierarchy while preserving Academy actions', () => {
    expect(academyPage).toContain("tr('academyProgress')");
    expect(academyPage).toContain("tr('academyNextUnlock')");
    expect(academyPage).toContain('Konfigurator');
    expect(academyPage).toContain("tr('academyNextMilestone')");
    expect(academyPage).toContain("tr('academyBadges')");
    expect(academyPage).toContain("tr('academyContinueWhere')");
    expect(academyPage).toContain("tr('academySalesJourney')");
    expect(academyPage).toContain('sm:grid-cols-2 lg:grid-cols-4');
    expect(academyPage).toContain('lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]');
    expect(academyPage).toContain('lg:grid-cols-2');
    expect(academyPage).toContain('<LockedModule');
    expect(academyPage).toContain('startCase');
    expect(academyPage).toContain("tr('academyBackToPortal')");
  });
});
