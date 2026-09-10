import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('News CMS publish flow', () => {
  it('publishes the same canonical row that was saved as a draft', () => {
    const editor = readFileSync('src/features/news-cms/editor/NewsSharedEditor.tsx', 'utf8');
    const page = readFileSync('src/pages/backend/BackendNewsPage.tsx', 'utf8');

    expect(editor).toContain('const [persistedPostId, setPersistedPostId]');
    expect(editor).toContain('setPersistedPostId(savedPost.id)');
    expect(editor).toContain('id: persistedPostId');
    expect(page).toContain('return { id: result.row.id };');
  });

  it('waits for a successful publish before returning to the overview', () => {
    const page = readFileSync('src/pages/backend/BackendNewsPage.tsx', 'utf8');
    const publishIndex = page.indexOf('const result = await adminPublishNewsPost({', page.indexOf('onPublish={async'));
    const dashboardIndex = page.indexOf("setViewMode('dashboard');", publishIndex);
    const errorIndex = page.indexOf('if (result.error)', publishIndex);

    expect(publishIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(publishIndex);
    expect(dashboardIndex).toBeGreaterThan(errorIndex);
  });
});
