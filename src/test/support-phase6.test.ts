import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectSourceConflict,
  evaluateSupportConfidence,
  supportFallback,
  type ConfidenceCandidate,
  type SupportConfidenceConfig,
} from '../../supabase/functions/_shared/supportConfidence';

const migration = readFileSync(resolve('supabase/migrations/20260927174500_support_confidence_version_governance.sql'), 'utf8');
const ingestionMigration = readFileSync(resolve('supabase/migrations/20260927135312_support_knowledge_ingestion.sql'), 'utf8');
const chat = readFileSync(resolve('supabase/functions/support-chat/index.ts'), 'utf8');
const indexer = readFileSync(resolve('supabase/functions/support-index-knowledge/index.ts'), 'utf8');
const admin = readFileSync(resolve('src/pages/backend/BackendAiSupportPage.tsx'), 'utf8');
const adminService = readFileSync(resolve('src/lib/supportAdminService.ts'), 'utf8');

const config: SupportConfidenceConfig = {
  confidence_high_threshold: 0.76,
  confidence_medium_threshold: 0.54,
  confidence_min_top_similarity: 0.42,
  confidence_min_citation_coverage: 0.5,
  confidence_conflict_score_tolerance: 0.06,
  confidence_require_machine_for_ambiguous: true,
};

function candidate(overrides: Partial<ConfidenceCandidate> = {}): ConfidenceCandidate {
  return {
    knowledge_item_id: 'item-1', semantic_similarity: 0.95, keyword_score: 0.2,
    fused_score: 0.12, content: 'Use 10 L hydraulic oil.', machine_ids: ['RC-1000s'],
    product_ids: [], stale_states: [], review_overdue: false, ...overrides,
  };
}

describe('Phase 6 deterministic confidence policy', () => {
  it('classifies strong cited evidence as HIGH', () => {
    const result = evaluateSupportConfidence({
      question: 'Hydraulic service interval RC-1000s',
      candidates: [candidate(), candidate({ knowledge_item_id: 'item-2', content: 'Hydraulic service uses 10 L.' })],
      config, machineId: 'RC-1000s', citationCount: 2,
    });
    expect(result.level).toBe('HIGH');
    expect(result.outcome).toBe('ANSWERED');
  });

  it('keeps consistent multi-source evidence HIGH or MEDIUM', () => {
    const result = evaluateSupportConfidence({
      question: 'Service interval', candidates: [candidate({ semantic_similarity: 0.72 }), candidate({ knowledge_item_id: 'item-2', semantic_similarity: 0.7 })],
      config, machineId: 'RC-1000s', citationCount: 2,
    });
    expect(['HIGH', 'MEDIUM']).toContain(result.level);
  });

  it('returns LOW for weak retrieval', () => {
    const result = evaluateSupportConfidence({
      question: 'Unknown detail', candidates: [candidate({ semantic_similarity: 0.2, keyword_score: 0 })],
      config, citationCount: 0,
    });
    expect(result.level).toBe('LOW');
    expect(result.reason).toBe('WEAK_RETRIEVAL');
  });

  it('accepts strong lexical evidence when semantic similarity is modest', () => {
    const result = evaluateSupportConfidence({
      question: 'RC-1000s base width',
      candidates: [
        candidate({ semantic_similarity: 0.3, keyword_score: 0.2 }),
        candidate({ knowledge_item_id: 'item-2', semantic_similarity: 0.25, keyword_score: 0 }),
      ],
      config,
      citationCount: 1,
    });
    expect(result.level).toBe('HIGH');
    expect(result.outcome).toBe('ANSWERED');
  });

  it('calibrates cosine similarity from long approved chunks', () => {
    const result = evaluateSupportConfidence({
      question: 'Where can I find my quotes?',
      candidates: [
        candidate({ semantic_similarity: 0.34, keyword_score: 0 }),
        candidate({ knowledge_item_id: 'item-2', semantic_similarity: 0.3, keyword_score: 0 }),
      ],
      config,
      citationCount: 1,
    });
    expect(['HIGH', 'MEDIUM']).toContain(result.level);
    expect(['ANSWERED', 'CAUTIOUS_ANSWER']).toContain(result.outcome);
  });

  it('returns NO_GROUNDED_ANSWER when retrieval is empty', () => {
    expect(evaluateSupportConfidence({ question: 'Unknown', candidates: [], config }).level)
      .toBe('NO_GROUNDED_ANSWER');
  });

  it('asks for the machine on an ambiguous oil question', () => {
    const result = evaluateSupportConfidence({ question: 'What oil should I use?', candidates: [candidate()], config });
    expect(result.outcome).toBe('CLARIFICATION_REQUIRED');
    expect(result.clarificationRequested).toBe(true);
  });

  it('uses current page context instead of asking an unnecessary clarification', () => {
    const result = evaluateSupportConfidence({
      question: 'What oil should I use?', candidates: [candidate()], config,
      machineId: 'RC-1000s', citationCount: 1,
    });
    expect(result.clarificationRequested).toBe(false);
    expect(['HIGH', 'MEDIUM']).toContain(result.level);
  });

  it('detects materially conflicting facts and lowers confidence', () => {
    const candidates = [candidate(), candidate({ knowledge_item_id: 'item-2', content: 'Use 14 L hydraulic oil.', fused_score: 0.11 })];
    expect(detectSourceConflict(candidates, 0.06)).toBe(true);
    const result = evaluateSupportConfidence({ question: 'Oil capacity RC-1000s', candidates, config, machineId: 'RC-1000s' });
    expect(result.outcome).toBe('SOURCE_CONFLICT');
    expect(result.level).toBe('LOW');
  });

  it('does not treat unrelated measurements with the same unit as a conflict', () => {
    const candidates = [
      candidate({ content: 'RC-1000s base width is 995 mm.' }),
      candidate({ knowledge_item_id: 'item-2', content: 'RC-1000s cutting width is 1.000 mm.', fused_score: 0.11 }),
    ];
    expect(detectSourceConflict(candidates, 0.06)).toBe(false);
  });

  it('identifies stale-only retrieval as a distinct safe outcome', () => {
    const result = evaluateSupportConfidence({ question: 'Current manual?', candidates: [], config, staleBlockCount: 1 });
    expect(result.outcome).toBe('STALE_KNOWLEDGE');
  });

  it('has canonical fallbacks in all nine portal languages', () => {
    for (const language of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
      for (const kind of ['NO_RELEVANT_KNOWLEDGE', 'LOW_CONFIDENCE', 'AMBIGUOUS_QUESTION', 'SOURCE_CONFLICT', 'STALE_KNOWLEDGE', 'PROVIDER_FAILURE', 'RETRIEVAL_FAILURE', 'ACCESS_RESTRICTED', 'SERVICE_DISABLED'] as const) {
        expect(supportFallback(language, kind).length).toBeGreaterThan(20);
      }
    }
  });
});

describe('Phase 6 version, stale and audit governance', () => {
  it('stores centralized thresholds in server-only runtime configuration', () => {
    expect(migration).toContain('confidence_high_threshold');
    expect(migration).toContain('confidence_medium_threshold');
    expect(migration).toContain('allow_review_overdue_retrieval');
    expect(chat).toContain('evaluateSupportConfidence');
  });

  it('keeps audit append-only for authenticated clients', () => {
    expect(migration).toContain('create table public.support_knowledge_lifecycle_events');
    expect(migration).toContain('revoke all on public.support_knowledge_lifecycle_events from public, anon, authenticated');
    expect(migration).toContain('grant select on public.support_knowledge_lifecycle_events to authenticated');
    expect(migration).not.toContain('grant update on public.support_knowledge_lifecycle_events to authenticated');
    expect(migration).not.toContain('grant delete on public.support_knowledge_lifecycle_events to authenticated');
  });

  it('models effective dates, source approval, supersession and four stale states', () => {
    for (const token of ['effective_from', 'effective_until', 'approved_by_user_id', 'approved_at']) {
      expect(migration).toContain(token);
    }
    expect(`${ingestionMigration}\n${migration}`).toContain('supersedes_source_id');
    for (const state of ['CONTENT_STALE', 'INDEX_STALE', 'EMBEDDING_STALE', 'REVIEW_OVERDUE']) {
      expect(migration).toContain(state);
    }
  });

  it('assigns a stable source family when creating knowledge after Phase 6', () => {
    expect(migration).toContain('alter column source_family_key set not null');
    expect(adminService).toContain('source_family_key: crypto.randomUUID()');
  });

  it('promotes only approved fully indexed replacements atomically', () => {
    const promotion = migration.slice(migration.indexOf('create or replace function public.support_promote_indexed_source'));
    expect(promotion).toContain("v_source.lifecycle_status <> 'APPROVED'");
    expect(promotion).toContain("v_state.status <> 'INDEXED'");
    expect(promotion).toContain("status = 'INDEXED'");
    expect(promotion.indexOf('update public.support_knowledge_sources')).toBeGreaterThan(-1);
    expect(indexer).toContain("service.rpc('support_promote_indexed_source'");
  });

  it('keeps the previous current source when candidate indexing fails', () => {
    expect(indexer).toContain("status: 'FAILED'");
    expect(indexer).toContain("if (status === 'INDEXED')");
    expect(migration).toContain("where knowledge_item_id = v_source.knowledge_item_id and is_current and id <> p_source_id");
  });

  it('retrieves only authorized approved current effective non-stale knowledge for the active model', () => {
    const retrieval = migration.slice(migration.indexOf('create or replace function public.support_retrieve_authorized_chunks_v2'));
    expect(retrieval).toContain("i.status = 'APPROVED'");
    expect(retrieval).toContain("s.lifecycle_status = 'APPROVED'");
    expect(retrieval).toContain('s.is_current');
    expect(retrieval).toContain("not (s.stale_states && array['CONTENT_STALE', 'INDEX_STALE', 'EMBEDDING_STALE']");
    expect(retrieval).toContain('em.model_name = config.embedding_model');
    expect(retrieval.indexOf("i.access_scope in ('PUBLIC', 'PORTAL')")).toBeLessThan(retrieval.indexOf('semantic_ranked as'));
  });

  it('exposes traceable reprocess, rechunk, reindex and reembed controls without auto-approval', () => {
    for (const action of ['REPROCESS', 'RECHUNK', 'REINDEX', 'REEMBED']) expect(migration).toContain(action);
    expect(indexer).toContain("mode?: 'index' | 'reindex' | 'reembed'");
    expect(indexer).not.toContain("lifecycle_status: 'APPROVED'");
  });

  it('shows confidence filters, version comparison and read-only audit in the admin UI', () => {
    expect(admin).toContain('SUPPORT_CONFIDENCE_LEVELS');
    expect(admin).toContain('SUPPORT_OUTCOMES');
    expect(admin).toContain('confidence_level');
    const sources = readFileSync(resolve('src/components/support/KnowledgeSourcesPanel.tsx'), 'utf8');
    expect(sources).toContain('compareVersions');
    expect(sources).toContain('lifecycleAudit');
    expect(sources).toContain("indexSource(source.id, 'reembed')");
  });
});
