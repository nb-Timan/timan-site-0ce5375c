import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { SUPPORT_INGESTION_TRANSLATIONS } from '@/lib/i18n/supportIngestionTranslations';

const panel = readFileSync('src/components/support/KnowledgeSourcesPanel.tsx', 'utf8');
const page = readFileSync('src/pages/backend/BackendAiSupportPage.tsx', 'utf8');

describe('Phase 4 ingestion UI', () => {
  it('extends the existing Phase 3 editor without a parallel knowledge page', () => {
    expect(page).toContain('<KnowledgeSourcesPanel item={item} />');
    expect(page).toContain('KnowledgeEditor');
  });

  it('supports upload, multi-association, preview and reprocessing controls', () => {
    expect(panel).toContain('machineIds');
    expect(panel).toContain('productIds');
    expect(panel).toContain('uploadSupportKnowledgeSource');
    expect(panel).toContain('extracted_text');
    expect(panel).toContain("runAgain(source.id, 'reprocess')");
    expect(panel).toContain("runAgain(source.id, 'rechunk')");
    expect(panel).toContain('index_state');
    expect(panel).toContain("reason.code === 'DUPLICATE_SOURCE'");
  });

  it('renders localized machine labels instead of the catalogue translation object', () => {
    expect(panel).toContain('machineLabel(machine, uiLanguage)');
    expect(panel).toContain('mapUiLanguageToLegacy(uiLanguage)');
    expect(panel).not.toContain('<span>{machine.name}</span>');
  });

  it('has ingestion UI copy for all nine portal languages', () => {
    expect(PORTAL_LANGUAGE_CODES).toHaveLength(9);
    for (const language of PORTAL_LANGUAGE_CODES) {
      const copy = SUPPORT_INGESTION_TRANSLATIONS[language];
      expect(copy.heading).toBeTruthy();
      expect(copy.uploadAndProcess).toBeTruthy();
      expect(copy.extractionPreview).toBeTruthy();
      expect(copy.reprocess).toBeTruthy();
      expect(copy.duplicateSource).toBeTruthy();
    }
  });

  it('uses responsive grids without fixed page widths', () => {
    expect(panel).toContain('sm:grid-cols');
    expect(panel).toContain('lg:grid-cols');
    expect(panel).not.toContain('min-w-[');
  });
});
