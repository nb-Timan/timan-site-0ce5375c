import { describe, expect, it } from 'vitest';
import { NEWS_CONTENT_LANGUAGES, getNewsTranslationCoverage } from '@/features/news-cms/lib/newsContent';
import type { LocalizedNewsContent } from '@/features/news-cms/templates/types';

const fields = [
  { key: 'headline', type: 'text', labelKey: 'newsCmsFieldHeadline', required: true },
  { key: 'subtitle', type: 'text', labelKey: 'newsCmsFieldSubtitle', required: false },
] as const;

function completeContent(headline = 'Dansk master') {
  return NEWS_CONTENT_LANGUAGES.reduce((content, language) => {
    content[language] = { headline: language === 'da' ? headline : `${language} translation` };
    return content;
  }, {} as LocalizedNewsContent);
}

describe('News translation coverage', () => {
  it('identifies incomplete secondary locales as generation candidates before publication', () => {
    const coverage = getNewsTranslationCoverage({ da: { headline: 'Klar dansk master' } }, fields, 'da');

    expect(coverage.missingLanguages).toEqual(NEWS_CONTENT_LANGUAGES.filter((language) => language !== 'da'));
    expect(coverage.staleLanguages).toEqual([]);
  });

  it('marks all persisted locales as current when the source has not changed', () => {
    const content = completeContent();
    const coverage = getNewsTranslationCoverage(content, fields, 'da', content);

    expect(coverage.missingLanguages).toEqual([]);
    expect(coverage.staleLanguages).toEqual([]);
    expect(coverage.currentLanguages).toEqual(NEWS_CONTENT_LANGUAGES);
  });

  it('distinguishes complete but outdated secondary locales after the master text changes', () => {
    const persisted = completeContent('Første danske master');
    const changed = completeContent('Opdateret dansk master');
    const coverage = getNewsTranslationCoverage(changed, fields, 'da', persisted);

    expect(coverage.missingLanguages).toEqual([]);
    expect(coverage.staleLanguages).toEqual(NEWS_CONTENT_LANGUAGES.filter((language) => language !== 'da'));
    expect(coverage.currentLanguages).toEqual(['da']);
  });
});
