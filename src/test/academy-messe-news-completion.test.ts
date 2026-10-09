import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTAL_BASICS_NEWS_ID } from '@/lib/academySandbox';

describe('Academy Portal Basics Messe news completion', () => {
  const source = readFileSync(join(process.cwd(), 'src/pages/messe/MesseNewsPage.tsx'), 'utf8');

  it('adds the local canonical target to the Academy news surface and records its ID before opening the modal', () => {
    expect(PORTAL_BASICS_NEWS_ID).toBe('academy-news-rc1000s-disc-mower');
    expect(source).toContain('id: PORTAL_BASICS_NEWS_ID');
    expect(source).toContain("academySandbox.getActiveCase() === ACADEMY_PORTAL_BASICS");
    expect(source).toContain('academySandbox.trackPortalBasicsNews(post.id);');
  });
});
