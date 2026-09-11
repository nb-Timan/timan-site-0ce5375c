import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const academyPage = readFileSync('src/pages/AcademyPage.tsx', 'utf8');

describe('Academy fullwidth dashboard layout', () => {
  it('keeps the shared portal header while removing the Academy-only sidebar', () => {
    expect(academyPage).toContain('<PortalHeader');
    expect(academyPage).not.toContain('<aside');
    expect(academyPage).toContain('max-w-[1600px]');
  });

  it('keeps the existing Academy progress dashboard and exit path', () => {
    expect(academyPage).toContain('Din progression');
    expect(academyPage).toContain('Næste oplåsning: Konfigurator');
    expect(academyPage).toContain('Næste milepæl');
    expect(academyPage).toContain('Fortsæt hvor jeg slap');
    expect(academyPage).toContain('Badges / aktivitet');
    expect(academyPage).toContain('Din Sales Academy');
    expect(academyPage).toContain('Tilbage til portalen');
  });
});
