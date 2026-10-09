import { describe, expect, it } from 'vitest';
import { opensPublicNewsModal } from '@/pages/messe/MesseNewsPage';

describe('Messe news modal routing', () => {
  it('opens CMS news in the canonical public modal even when the template has a CTA URL', () => {
    expect(opensPublicNewsModal({
      source: 'news_cms',
      localized_content: { da: { headline: 'Superior førerkomfort til Timan 3330' } },
    })).toBe(true);
  });

  it('keeps non-CMS external content outside the CMS modal flow', () => {
    expect(opensPublicNewsModal({ source: 'legacy', localized_content: null })).toBe(false);
  });
});
