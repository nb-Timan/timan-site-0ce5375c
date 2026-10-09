import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTAL_BASICS_NEWS_TITLE } from '@/lib/academySandbox';

describe('Academy Portal Basics compact guidance', () => {
  const portalPage = readFileSync(join(process.cwd(), 'src/pages/PortalPage.tsx'), 'utf8');
  const guidancePanel = readFileSync(join(process.cwd(), 'src/components/academy/AcademyGuidancePanel.tsx'), 'utf8');

  it('uses a compact three-column task grid without fixed task-card heights', () => {
    expect(portalPage).toContain('taskColumns={3}');
    expect(portalPage).toContain('compactTasks');
    expect(guidancePanel).toContain("taskColumns === 3 ? 'mt-3 grid gap-2 lg:grid-cols-3'");
    expect(guidancePanel).toContain("compactTasks ? 'border p-2.5'");
    expect(guidancePanel).not.toContain('min-h-');
  });

  it('keeps the full-screen helper and makes Partnerdata navigation explicit', () => {
    expect(portalPage).toContain("academyPortalBasicsFullscreenDescription");
    expect(portalPage).toContain('Tryk på Partnerdata og derefter Timan-logoet øverst på siden');
  });

  it('uses the single canonical Academy news title in guidance and the Academy news card', () => {
    const latestFromTiman = readFileSync(join(process.cwd(), 'src/components/portal/LatestFromTiman.tsx'), 'utf8');

    expect(PORTAL_BASICS_NEWS_TITLE).toBe('Skivehøster til Timan RC-1000s');
    expect(portalPage).toContain('Messe → Nyheder → ${PORTAL_BASICS_NEWS_TITLE}');
    expect(latestFromTiman).toContain('title: PORTAL_BASICS_NEWS_TITLE');
  });
});
