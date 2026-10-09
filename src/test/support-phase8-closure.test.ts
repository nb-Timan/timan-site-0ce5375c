import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/publishedProductMaster', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/publishedProductMaster')>(),
  isProductActive: () => true,
}));

import { buildCanonicalActionParityReport } from '@/lib/supportActionParity';

const migration = readFileSync('supabase/migrations/20260928143907_phase8_closure_bindings_and_live_auth.sql', 'utf8');
const multiSourceMigration = readFileSync('supabase/migrations/20260928150914_phase8_multisource_localized_golden_set.sql', 'utf8');
const promptInjectionMigration = readFileSync('supabase/migrations/20260928164500_phase8_prompt_injection_case_key_correction.sql', 'utf8');
const safeFallbackMigration = readFileSync('supabase/migrations/20260928172000_phase8_prompt_injection_safe_fallback_expectations.sql', 'utf8');
const localizedFactsMigration = readFileSync('supabase/migrations/20260928174000_phase8_localized_facts_and_confidence_semantics.sql', 'utf8');
const stableFactsMigration = readFileSync('supabase/migrations/20260928180000_phase8_stable_semantic_fact_markers.sql', 'utf8');
const semanticGroupsMigration = readFileSync('supabase/migrations/20260928182500_phase8_semantic_fact_groups.sql', 'utf8');
const technicalServiceDeMigration = readFileSync('supabase/migrations/20260928190000_phase8_technical_service_de_fact_group.sql', 'utf8');
const huConflictMigration = readFileSync('supabase/migrations/20260928193000_phase8_hu_source_conflict_fact_group.sql', 'utf8');
const worker = readFileSync('supabase/functions/support-evaluate/index.ts', 'utf8');
const evaluationService = readFileSync('src/lib/supportEvaluationService.ts', 'utf8');

describe('Phase 8 closure-grade evaluation', () => {
  it('runs at least the 18 mandatory parity cases through canonical adapters without side effects', () => {
    const report = buildCanonicalActionParityReport();
    expect(report.version).toBe('phase8-canonical-adapter-v1');
    expect(report.cases.length).toBeGreaterThanOrEqual(18);
    const mismatches = report.cases.filter((item) => JSON.stringify(item.portal) !== JSON.stringify(item.assistant))
      .map((item) => ({ key: item.key, portal: item.portal, assistant: item.assistant }));
    expect(mismatches).toEqual([]);
    expect(report.cases.every((item) => item.externalSideEffects.length === 0)).toBe(true);
    expect(report.cases.find((item) => item.key === 'required-dependency')?.assistant).toMatchObject({ harnessPresent: true });
    expect(report.cases.find((item) => item.key === 'send-without-confirmation')?.assistant).toMatchObject({ allowed: false });
  });

  it('creates immutable v2 definitions bound by canonical Knowledge titles rather than generated ids', () => {
    expect(migration).toContain("version_number = 1 and cv.status = 'APPROVED'");
    expect(migration).toContain("v_case.case_id, 2, 'APPROVED'");
    expect(migration).toContain("v_suite.suite_id, 2, 'APPROVED'");
    expect(migration).toContain("'sourceRevisionIds', jsonb_build_array(v_source)");
    expect(migration).toContain("'knowledgeItemIds', jsonb_build_array(v_item)");
    expect(migration).toContain("i.title = 'PHASE 8 QA TEST");
    expect(migration).not.toContain('53bfffc7-3239-4006-97fe-1a0eb1adf257');
  });

  it('keeps live authorization probes service-only and removes production fixture short-circuiting', () => {
    expect(migration).toContain('support_evaluate_user_access');
    expect(migration).toContain('revoke all on function public.support_evaluate_user_access(uuid) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.support_evaluate_user_access(uuid) to service_role');
    expect(worker).toContain("executionMode: 'LIVE_AUTHORIZATION'");
    expect(worker).toContain("service.rpc('support_evaluate_user_access'");
    expect(worker).not.toContain("executionMode: 'AUTHORIZATION_CONTRACT'");
    expect(worker).not.toContain('actionExecuted: expected.actionExecuted === true');
    const production = worker.slice(worker.indexOf('async function productionRagObservation'), worker.indexOf('async function mapWithConcurrency'));
    expect(production).not.toContain('price: expected.price');
    expect(production).not.toContain('discount: expected.discount');
  });

  it('versions overlapping canonical sources without hardcoded generated ids', () => {
    expect(multiSourceMigration).toContain("v_case.case_id, 3, 'APPROVED'");
    expect(multiSourceMigration).toContain("'multiSourcePolicy', 'ANY_APPROVED_CANONICAL_SOURCE'");
    expect(multiSourceMigration).toContain("jsonb_build_array(v_public_source, v_cross_source)");
    expect(multiSourceMigration).not.toContain('53bfffc7-3239-4006-97fe-1a0eb1adf257');
    expect(worker).toContain('includesAny(observation.citationIds, expected.citationIds)');
  });

  it('corrects the actual prompt-injection case keys in immutable v4 definitions', () => {
    expect(promptInjectionMigration).toContain("version_number = 3 and cv.status = 'APPROVED'");
    expect(promptInjectionMigration).toContain("v_case.case_id, 4, 'APPROVED'");
    expect(promptInjectionMigration).toContain("v_suite.suite_id, 4, 'APPROVED'");
    expect(promptInjectionMigration).toContain("('P8-098-prompt-injection', 'P8-099-unicode-instrukce')");
    expect(promptInjectionMigration).not.toContain("('P8-097-prompt-injection', 'P8-098-unicode-instrukce')");
    expect(promptInjectionMigration).toContain("'authorizationAllowed', true");
    expect(promptInjectionMigration).toContain("'authorizationProbe', 'LIVE_CANONICAL_CALLER'");
    expect(promptInjectionMigration).not.toContain('f497f37d-d535-47c3-b939-4c6036eff4f4');
  });

  it('treats prompt-injection refusal as the required safe v5 outcome', () => {
    expect(safeFallbackMigration).toContain("version_number = 4 and cv.status = 'APPROVED'");
    expect(safeFallbackMigration).toContain("v_case.case_id, 5, 'APPROVED'");
    expect(safeFallbackMigration).toContain("(v_expected - 'citationIds')");
    expect(safeFallbackMigration).toContain("'confidence', 'NO_GROUNDED_ANSWER'");
    expect(safeFallbackMigration).toContain("'fallback', 'NO_RELEVANT_KNOWLEDGE'");
    expect(safeFallbackMigration).toContain("('P8-098-prompt-injection', 'P8-099-unicode-instrukce')");
  });

  it('uses localized facts and separates confidence-policy facts from runtime fallbacks in v6', () => {
    expect(localizedFactsMigration).toContain("v_case.case_id, 6, 'APPROVED'");
    expect(localizedFactsMigration).toContain("'P8-023-configuration-save-en'");
    expect(localizedFactsMigration).toContain("jsonb_build_array('Gem sag', 'T-number')");
    expect(localizedFactsMigration).toContain("jsonb_build_array('32.5%')");
    expect(localizedFactsMigration).toContain("jsonb_build_array('forráskonfliktus')");
    expect(localizedFactsMigration).toContain("'P8-087-er-s-bizony-t-k'");
    expect(localizedFactsMigration).toContain("'confidence', 'NO_GROUNDED_ANSWER'");
    expect(localizedFactsMigration).toContain("'P8-090-inaktuell-k-lla'");
  });

  it('uses stable semantic markers for generative wording in v7', () => {
    expect(stableFactsMigration).toContain("v_case.case_id, 7, 'APPROVED'");
    expect(stableFactsMigration).toContain("jsonb_build_array('CRM lead', 'T-nummer')");
    expect(stableFactsMigration).toContain("jsonb_build_array('cart', 'machine slots')");
    expect(stableFactsMigration).toContain("jsonb_build_array('SOURCE_CONFLICT')");
  });

  it('evaluates explicit semantic alternatives and a concrete strong-evidence question in v8', () => {
    expect(semanticGroupsMigration).toContain("v_case.case_id, 8, 'APPROVED'");
    expect(semanticGroupsMigration).toContain("'factAssertionMode', 'SEMANTIC_GROUPS'");
    expect(semanticGroupsMigration).toContain("jsonb_build_array('T-number', 'T-nummer', 'quote number')");
    expect(semanticGroupsMigration).toContain("A jóváhagyott forrás szerint milyen bizalmi szintet");
    expect(worker).toContain('factGroups.every((group: string[])');
    expect(worker).toContain('group.some((fact) => factBody.includes(normalize(fact)))');
    expect(worker).toContain('stableJson(observation.assistantAdapterResult || {})');
  });

  it('localizes the German Technical Service fact assertion in immutable v9', () => {
    expect(technicalServiceDeMigration).toContain("v_case.case_id, 9, 'APPROVED'");
    expect(technicalServiceDeMigration).toContain("'P8-018-service-history-de'");
    expect(technicalServiceDeMigration).toContain("jsonb_build_array('Technik & Service', 'Teknik & Service')");
  });

  it('captures the current build commit in live evaluation runs', () => {
    expect(evaluationService).toContain("import.meta.env.VITE_GIT_COMMIT || 'working-tree'");
    expect(evaluationService).toContain('body: { action: \'RUN\', tier, gitCommit, actionParity:');
    expect(worker).toContain("git_commit:String(body.gitCommit||'working-tree')");
  });

  it('accepts canonical Hungarian source-conflict terminology in immutable v10', () => {
    expect(huConflictMigration).toContain("v_case.case_id, 10, 'APPROVED'");
    expect(huConflictMigration).toContain("'source conflict', 'forráskonfliktus', 'ellentmondó'");
  });
});
