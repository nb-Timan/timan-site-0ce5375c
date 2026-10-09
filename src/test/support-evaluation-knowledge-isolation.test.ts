import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260928201500_support_evaluation_only_knowledge.sql', 'utf8');
const chat = readFileSync('supabase/functions/support-chat/index.ts', 'utf8');
const evaluator = readFileSync('supabase/functions/support-evaluate/index.ts', 'utf8');

describe('Support evaluation-only knowledge isolation', () => {
  it('stores a canonical evaluation-only flag without changing lifecycle state', () => {
    expect(migration).toContain('evaluation_only boolean not null default false');
    expect(migration).toContain('set evaluation_only = true');
    expect(migration).not.toMatch(/set\s+(status|lifecycle_status|is_current|ingestion_status)\s*=/i);
  });

  it('filters evaluation-only knowledge before hybrid ranking', () => {
    const retrieval = migration.slice(migration.indexOf('create function public.support_retrieve_authorized_chunks_v2'));
    expect(retrieval).toContain('and (not i.evaluation_only or p_include_evaluation_only)');
    expect(retrieval.indexOf('and (not i.evaluation_only or p_include_evaluation_only)'))
      .toBeLessThan(retrieval.indexOf('semantic_ranked as'));
    expect(retrieval).not.toContain("i.title like 'PHASE 8 QA TEST");
  });

  it('makes normal chat exclusion and evaluation inclusion explicit', () => {
    expect(chat).toContain('p_include_evaluation_only: false');
    expect(evaluator).toContain('p_include_evaluation_only: true');
  });

  it('keeps evaluation-only stale sources out of normal fallback diagnostics', () => {
    const staleCount = migration.slice(migration.indexOf('create or replace function public.support_count_authorized_stale_sources'));
    expect(staleCount).toContain('and not i.evaluation_only');
  });

  it('keeps the retrieval RPC service-role only', () => {
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });
});
