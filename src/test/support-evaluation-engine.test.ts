import { describe, expect, it } from 'vitest';
import { buildSupportEvaluationReport, compareSupportEvaluationRuns, evaluateSupportCase } from '@/lib/supportEvaluationEngine';
import { SUPPORT_EVALUATION_GOLDEN_SET } from '@/lib/supportEvaluationGoldenSet';
import { deterministicObservation, runDeterministicEvaluationTier } from './supportEvaluationFixture';

describe('Phase 8 deterministic assertion and release-gate engine', () => {
  it('passes deterministic smoke, security, targeted, and full contract tiers', () => {
    for (const tier of ['SMOKE','SECURITY','TARGETED','FULL'] as const) {
      const report = runDeterministicEvaluationTier(tier);
      expect(report.decision).toBe('RELEASE_PASS');
      expect(report.metrics.failed).toBe(0);
      expect(report.metrics.unauthorizedDisclosureCount).toBe(0);
    }
  });

  it('blocks unauthorized disclosure, fake citation, unsafe HIGH, and external side effects', () => {
    const testCase = SUPPORT_EVALUATION_GOLDEN_SET.find((item) => item.category === 'SECURITY_AUTHORIZATION')!;
    const observation = deterministicObservation(testCase);
    const failed = evaluateSupportCase(testCase, { ...observation, responseText: 'restricted-secret', citationIds: ['citation:fake'], confidence: 'HIGH', externalSideEffects: ['email_sent'] });
    const report = buildSupportEvaluationReport({ tier:'SECURITY',suiteKey:'SECURITY',suiteVersion:1,startedAt:new Date().toISOString(),gitCommit:'test',provider:'test',model:'test',embeddingModel:'test',promptVersion:'test',knowledgeSnapshot:'test',results:[failed] });
    expect(report.decision).toBe('RELEASE_BLOCKED');
    expect(report.metrics.unauthorizedDisclosureCount).toBe(1);
    expect(report.metrics.unsafeHighCount).toBe(1);
    expect(report.metrics.severityCounts['SEV-0']).toBeGreaterThan(0);
  });

  it('blocks canonical price/action divergence and never lets aggregate score override hard gates', () => {
    const testCase = SUPPORT_EVALUATION_GOLDEN_SET.find((item) => item.expected.price !== undefined)!;
    const result = evaluateSupportCase(testCase, { ...deterministicObservation(testCase), price: Number(testCase.expected.price) + 1 });
    expect(result.assertions.find((item) => item.type === 'PRICE_EQUALS_CANONICAL')).toMatchObject({ passed:false,severity:'SEV-1' });
  });

  it('requires review for cost growth above 15 percent and rejects new SEV-1 failures', () => {
    const current = runDeterministicEvaluationTier('SMOKE');
    const failedResult = { ...current.results[0], passed:false, severity:'SEV-1' as const };
    const candidate = { ...current, results:[failedResult,...current.results.slice(1)], metrics:{...current.metrics,totalCost:1,p95LatencyMs:current.metrics.p95LatencyMs+50}, decision:'RELEASE_BLOCKED' as const };
    const baseline = { ...current, metrics:{...current.metrics,totalCost:0.5} };
    const comparison = compareSupportEvaluationRuns(baseline,candidate);
    expect(comparison.costReviewRequired).toBe(true);
    expect(comparison.releaseDecision).toBe('RELEASE_BLOCKED');
  });
});
