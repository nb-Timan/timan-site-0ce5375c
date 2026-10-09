import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('supabase/migrations/20260928092629_support_quality_security_evaluation.sql','utf8');
const worker = readFileSync('supabase/functions/support-evaluate/index.ts','utf8');

describe('Phase 8 evaluation persistence and isolation', () => {
  it('defines every required versioned and immutable evaluation structure', () => {
    for (const table of ['support_evaluation_suites','support_evaluation_suite_versions','support_evaluation_cases','support_evaluation_case_versions','support_evaluation_suite_cases','support_evaluation_runs','support_evaluation_results','support_evaluation_assertions','support_evaluation_retrieval_observations','support_evaluation_reviews','support_evaluation_baselines']) expect(schema).toContain(`create table public.${table}`);
    expect(schema).toContain('APPROVED_EVALUATION_VERSION_IS_IMMUTABLE');
    expect(schema).toContain('COMPLETED_EVALUATION_RUN_IS_IMMUTABLE');
    expect(schema).toContain('IMMUTABLE_EVALUATION_HISTORY');
  });

  it('keeps RLS Support-only and authenticated writes behind security-definer RPCs', () => {
    expect(schema).toContain('using (public.can_access_support())');
    expect(schema).toContain('revoke all on public.%I from public,anon,authenticated');
    expect(schema).toContain('support_submit_evaluation_review');
    expect(schema).toContain('support_approve_evaluation_baseline');
    expect(worker).toContain("userClient.rpc('can_access_support')");
  });

  it('prohibits production side effects in the routine worker', () => {
    expect(worker).toContain("externalSideEffects: []");
    expect(worker).toContain("executionMode: 'DETERMINISTIC_CONTRACT'");
    expect(worker).toContain("const executionMode = body.executionMode === 'DETERMINISTIC_CONTRACT' ? 'DETERMINISTIC_CONTRACT' : 'PRODUCTION_RAG'");
    expect(worker).toContain("productionRagExecuted:executionMode==='PRODUCTION_RAG'");
    expect(worker).not.toContain("functions.invoke('send-quote'");
    expect(worker).not.toContain("from('crm_leads').insert");
    expect(worker).not.toContain("from('quotes').insert");
    expect(worker).not.toContain("from('orders').insert");
  });
});
