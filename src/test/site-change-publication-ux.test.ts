import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPublishedFeatureContent } from '@/lib/portalChangelogService';

describe('New features publication UX', () => {
  const page = readFileSync('src/pages/backend/BackendChangelogPage.tsx', 'utf8');

  it('keeps row selection separate from the grouping checkbox state', () => {
    expect(page).toContain('const [selectedRowId, setSelectedRowId] = useState<string | null>(null);');
    expect(page).toContain('const [selectedIds, setSelectedIds] = useState<string[]>([]);');
    expect(page).toContain('onClick={() => selectRow(row)}');
    expect(page).toContain('aria-selected={selectedRowId === row.id}');
    expect(page).toContain('onClick={(event) => event.stopPropagation()}');
    expect(page).toContain('aria-label={st("siteFeaturesGroupSelect")}');
  });

  it('uses compact user-facing cards instead of exposing technical table columns', () => {
    expect(page).toContain('data-testid="site-feature-card"');
    expect(page).toContain('data-testid="site-feature-card-description"');
    expect(page).toContain('featureCardDescription(published.description)');
    expect(page).toContain('isCoherentSiteFeatureGroup(groupChildren[row.id] || [])');
    expect(page).toContain('visibleRows.map((row) =>');
    expect(page).not.toContain('<table');
    expect(page).not.toContain('{st("siteFeaturesInternalTitle")}: {row.title_internal}');
    expect(page).not.toContain('{row.source_ref && <div');
  });

  it('shows the user-facing published copy and its concrete change bullets in the selected preview', () => {
    expect(page).toContain('getPublishedFeatureContent(selectedRow, uiLanguage)');
    expect(page).toContain('function publicationPreview(description: string)');
    expect(page).toContain('siteFeaturesPublicationPreview');
    expect(page).toContain('siteFeaturesWhatChanged');
    expect(page).toContain('selectedPreview.bullets.map');
    expect(page).toContain('siteFeaturesShowTechnicalHistory');
  });

  it('keeps edit and publish actions available only for the selected feature preview', () => {
    expect(page).toContain('onClick={() => startEdit(selectedRow)}');
    expect(page).toContain('onClick={() => void quickStatus(selectedRow, "published")}');
    expect(page).toContain('disabled={saving || !selectedCanPublish}');
    expect(page).toContain('localizedContentFromDraft(draft)');
  });

  it('uses manual public copy before a generic generated fallback', () => {
    const published = getPublishedFeatureContent({
      module: 'dealer_data',
      change_type: 'improvement',
      source: 'github',
      source_ref: 'github:example',
      title_internal: 'fix: partner data',
      title_public: 'Partnerdata: selektiv SharePoint-sync',
      description_public: 'Hvad er ændret?\n• Kun valgte partnere synkroniseres\n• Aftalehistorik vises kun ét sted',
    }, 'da');

    expect(published.title).toBe('Partnerdata: selektiv SharePoint-sync');
    expect(published.description).toContain('Kun valgte partnere synkroniseres');
    expect(published.description).toContain('Aftalehistorik vises kun ét sted');
  });
});
