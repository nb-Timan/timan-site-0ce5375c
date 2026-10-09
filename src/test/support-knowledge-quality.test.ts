import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assessKnowledgeQuality,
  canonicalTopicKey,
  cleanWordpressText,
  compareKnowledgeDocuments,
  detectKnowledgeFactConflicts,
  selectDiverseKnowledgeCandidates,
} from '../../supabase/functions/_shared/supportKnowledgeQuality';
import { timanTranslationLinksFromHtml } from '../../supabase/functions/_shared/supportTimanKnowledge';

const migration = readFileSync('supabase/migrations/20261001083000_support_knowledge_quality_duplicates_conflicts.sql', 'utf8');
const sync = readFileSync('supabase/functions/support-knowledge-sync/index.ts', 'utf8');
const ingestion = readFileSync('supabase/functions/support-knowledge-ingestion/index.ts', 'utf8');
const chat = readFileSync('supabase/functions/support-chat/index.ts', 'utf8');
const qualityUi = readFileSync('src/components/support/KnowledgeQualityPanel.tsx', 'utf8');
const sourceUi = readFileSync('src/components/support/KnowledgeSourcesPanel.tsx', 'utf8');

describe('Knowledge Quality normalization and gates', () => {
  it('removes nested WordPress and Visual Composer residue while preserving content', () => {
    const cleaned = cleanWordpressText('[vc_row][vc_column][vc_column_text]RC-751\nHøjde 603 mm[/vc_column_text][/vc_column][/vc_row]');
    expect(cleaned).toContain('RC-751');
    expect(cleaned).toContain('603 mm');
    expect(cleaned).not.toMatch(/\[\/?vc_/);
  });

  it('rejects markup noise and accepts clean meaningful content', () => {
    expect(assessKnowledgeQuality({ text: '[vc_row] [vc_column] [vc_empty_space] navigation '.repeat(10), language: 'da', canonicalUrl: 'https://timan.dk/test/' }).status)
      .toBe('REJECTED_EXTRACTION_NOISE');
    expect(assessKnowledgeQuality({ text: 'RC-751 er en kompakt redskabsbærer med dokumenterede mål og anvendelser.', language: 'da', canonicalUrl: 'https://timan.dk/rc-751/' }).status)
      .toBe('READY_FOR_REVIEW');
  });

  it('links translated URLs through one topic without treating languages as exact duplicates', () => {
    expect(canonicalTopicKey('https://timan.dk/da/maskiner/rc-751/', 'machine', ['RC-751']))
      .toBe(canonicalTopicKey('https://timan.dk/en/maskiner/rc-751/', 'machine', ['RC-751']));
    const result = compareKnowledgeDocuments(
      { id: 'da', text: 'RC-751 dimensioner og tekniske specifikationer', language: 'da', topicKey: 'rc-751' },
      { id: 'en', text: 'RC-751 dimensions and technical specifications', language: 'en', topicKey: 'rc-751' },
    );
    expect(result.methods).toContain('CROSS_LANGUAGE_VARIANT');
  });

  it('uses Timan.dk hreflang metadata to link translated slugs canonically', () => {
    const links = timanTranslationLinksFromHtml(`
      <link rel="alternate" hreflang="da" href="https://timan.dk/om-timan/">
      <link rel="alternate" hreflang="en" href="https://timan.dk/en/om-timan/">
      <link rel="alternate" hreflang="de" href="https://timan.dk/de/ueber-timan-2/">
      <link rel="alternate" hreflang="x-default" href="https://timan.dk/om-timan/">
    `, 'https://timan.dk/de/ueber-timan-2/');
    expect(links.identityUrl).toBe('https://timan.dk/om-timan/');
    expect(links.alternateUrls).toContain('https://timan.dk/de/ueber-timan-2/');
  });

  it('finds semantic near duplicates but not merely related pages', () => {
    const duplicate = compareKnowledgeDocuments(
      { id: 'a', title: 'RC-1000s', text: 'RC-1000s is a remote controlled tool carrier for steep slopes with low ground pressure.', productRelations: ['RC-1000s'] },
      { id: 'b', title: 'RC 1000s', text: 'The RC-1000s remote controlled tool carrier works on steep slopes and has low ground pressure.', productRelations: ['RC-1000s'] },
    );
    const related = compareKnowledgeDocuments(
      { id: 'a', title: 'RC-1000s dimensions', text: 'Machine height width length and weight.', productRelations: ['RC-1000s'] },
      { id: 'b', title: 'RC-1000s attachments', text: 'Snow blade sweeper mower and weed brush attachments.', productRelations: ['RC-1000s'] },
    );
    expect(duplicate.score).toBeGreaterThan(related.score);
    expect(related.score).toBeLessThan(0.78);
  });

  it('detects true factual conflicts and preserves contextual differences', () => {
    const conflict = detectKnowledgeFactConflicts('RC-1000s width is 995 mm.', 'RC-1000s width is 1000 mm.');
    expect(conflict.some((row) => !row.contextual && row.left.attribute === 'width')).toBe(true);
    const contextual = detectKnowledgeFactConflicts('RC-1000s base width is 995 mm.', 'RC-1000s cutting width is 1000 mm.');
    expect(contextual.filter((row) => !row.contextual)).toHaveLength(0);
  });

  it('deduplicates evidence, prefers same language and source authority', () => {
    const base = { knowledge_item_id: 'item', semantic_similarity: 0.9, fused_score: 0.9, heading: null };
    const selected = selectDiverseKnowledgeCandidates([
      { ...base, knowledge_source_id: 'web', source_language: 'en', content: 'same fact', normalized_content_hash: 'same', authority_tier: 2 },
      { ...base, knowledge_source_id: 'canonical', source_language: 'da', content: 'same fact', normalized_content_hash: 'same', authority_tier: 1 },
      { ...base, knowledge_source_id: 'other', source_language: 'da', content: 'different useful fact', normalized_content_hash: 'other', authority_tier: 3 },
    ], 6, 'da');
    expect(selected.map((row) => row.knowledge_source_id)).toEqual(['canonical', 'other']);
  });
});

describe('Knowledge Quality governance integration', () => {
  it('stores quality, duplicate, conflict, translation and append-only audit state under RLS', () => {
    for (const table of ['support_knowledge_quality_assessments', 'support_knowledge_topics', 'support_knowledge_duplicate_clusters', 'support_knowledge_conflicts', 'support_knowledge_quality_events']) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.%I enable row level security`);
    }
    expect(migration).toContain('SUPPORT_KNOWLEDGE_QUALITY_EVENTS_APPEND_ONLY');
    expect(migration).toContain('support_enforce_knowledge_quality_approval');
    expect(migration).toContain('authority_tier');
  });

  it('keeps canonical URL revisions and automatic sync behind quality review', () => {
    expect(sync).toContain("existing?.normalized_content_hash === page.contentHash");
    expect(sync).toContain("status: reviewable ? 'REVIEW' : 'DRAFT'");
    expect(sync).toContain('support_knowledge_quality_assessments');
    expect(sync).toContain('support_knowledge_duplicate_clusters');
    expect(sync).toContain('support_knowledge_conflicts');
  });

  it('shows duplicate upload choices and never rechunks unchanged same-item content', () => {
    expect(ingestion).toContain("duplicate.knowledge_item_id === knowledgeItemId");
    expect(sourceUi).toContain('Mulig dublet fundet');
    expect(sourceUi).toContain('Annullér upload');
    expect(sourceUi).toContain('Opret ny revision');
    expect(sourceUi).toContain('Fortsæt som særskilt viden');
  });

  it('provides duplicate and conflict review actions with reviewer RPCs', () => {
    expect(qualityUi).toContain('Mulige dubletter');
    expect(qualityUi).toContain('Konflikter');
    expect(qualityUi).toContain('Behold A');
    expect(qualityUi).toContain('Begge korrekte');
    expect(migration).toContain('resolved_by_user_id');
    expect(migration).toContain('resolve_support_knowledge_conflict');
  });

  it('deduplicates retrieval and lowers confidence for unresolved persisted conflicts', () => {
    expect(chat).toContain('selectDiverseKnowledgeCandidates');
    expect(chat).toContain('openPersistedConflict');
    expect(chat).toContain('unresolvedConflict: openPersistedConflict');
    expect(chat).toContain('retrieval_excluded');
  });
});
