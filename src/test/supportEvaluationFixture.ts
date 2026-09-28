import { buildSupportEvaluationReport, evaluateSupportCase, selectCasesForTier } from '../lib/supportEvaluationEngine.ts';
import { SUPPORT_EVALUATION_GOLDEN_SET } from '../lib/supportEvaluationGoldenSet.ts';
import type { SupportEvaluationCase, SupportEvaluationObservation, SupportEvaluationTier } from '../lib/supportEvaluationTypes.ts';

export function deterministicObservation(testCase: SupportEvaluationCase): SupportEvaluationObservation {
  const expected = testCase.expected;
  const fixtureAllowed = expected.authorizationAllowed !== false;
  const allowed = fixtureAllowed && expected.authorizationAllowed !== false;
  return {
    authorizationAllowed: fixtureAllowed,
    responseText: allowed ? (expected.facts || []).join(' · ') : '', responseLanguage: testCase.language,
    sourceRevisionIds: allowed ? expected.sourceRevisionIds || [] : [], citationIds: allowed ? expected.citationIds || [] : [],
    confidence: allowed ? expected.confidence : 'NO_GROUNDED_ANSWER', fallback: allowed ? expected.fallback : 'ACCESS_RESTRICTED',
    action: expected.action, actionExecuted: allowed && expected.actionExecuted === true,
    price: expected.price, discount: expected.discount, dependencies: expected.dependencies || [],
    stateChanged: false, externalSideEffects: [], latencyMs: 2, retrievalLatencyMs: 0, providerLatencyMs: 0,
    cost: 0, inputTokens: 0, outputTokens: 0, retries: 0, timedOut: false,
    retrievalCandidates: (allowed ? expected.sourceRevisionIds || [] : []).map((sourceRevisionId, index) => ({
      chunkId: `fixture:${index + 1}`, sourceRevisionId, rank: index + 1, score: 1 - index * 0.01, authorizationEligible: true,
    })),
  };
}

export function runDeterministicEvaluationTier(tier: SupportEvaluationTier) {
  const cases = selectCasesForTier(SUPPORT_EVALUATION_GOLDEN_SET, tier);
  const startedAt = new Date().toISOString();
  const results = cases.map((testCase) => evaluateSupportCase(testCase, deterministicObservation(testCase)));
  return buildSupportEvaluationReport({ tier, suiteKey: tier === 'TARGETED' ? 'RAG' : tier, suiteVersion: 1, startedAt,
    gitCommit: process.env.GIT_COMMIT || 'working-tree', provider: 'deterministic-contract', model: 'no-provider-call',
    embeddingModel: 'no-embedding-call', promptVersion: 'phase5-grounded-v1', knowledgeSnapshot: 'golden-set-v1', results });
}
