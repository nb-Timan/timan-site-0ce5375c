import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminPage = readFileSync('src/pages/backend/BackendAiSupportPage.tsx', 'utf8');
const sourcesPanel = readFileSync('src/components/support/KnowledgeSourcesPanel.tsx', 'utf8');
const evaluationPanel = readFileSync('src/components/support/SupportEvaluationPanel.tsx', 'utf8');
const service = readFileSync('src/lib/supportAdminService.ts', 'utf8');

describe('AI Support language normalization', () => {
  it('renders portal labels in Support filters, editors, rows and source metadata', () => {
    expect(adminPage).toContain('getOptionLabel={portalLanguageDisplayCode}');
    expect(adminPage).toContain('{language.flag}</option>');
    expect(adminPage).toContain('portalLanguageDisplayCode(item.language)');
    expect(adminPage).toContain('row.languages.map(portalLanguageDisplayCode)');
    expect(sourcesPanel).toContain('{language.flag}</option>');
    expect(sourcesPanel).toContain('portalLanguageDisplayCode(source.source_language)');
    expect(evaluationPanel).toContain('portalLanguageDisplayCode(row.language)');
  });

  it('does not expose raw canonical codes through legacy uppercase formatting', () => {
    expect(adminPage).not.toContain('portal_language.toUpperCase()');
    expect(adminPage).not.toContain('item.language.toUpperCase()');
    expect(evaluationPanel).not.toContain('row.language.toUpperCase()');
  });

  it('normalizes filter, persistence, gap draft and upload values at service boundaries', () => {
    expect(service).toContain("query.in('portal_language', languageAliases)");
    expect(service).toContain("query.in('language', languageAliases)");
    expect(service).toContain('portal_language: normalizePortalLanguageCode(row.portal_language) || row.portal_language');
    expect(service).toContain('language: normalizePortalLanguageCode(row.language) || row.language');
    expect(service).toContain('language: normalizePortalLanguageCode(draft.language) || FALLBACK_LANGUAGE');
    expect(service).toContain('language: normalizePortalLanguageCode(gap.question?.portal_language || gap.languages[0]) || FALLBACK_LANGUAGE');
    expect(service).toContain("form.set('source_language', normalizePortalLanguageCode(input.sourceLanguage) || FALLBACK_LANGUAGE)");
  });
});
