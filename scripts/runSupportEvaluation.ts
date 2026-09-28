import { runDeterministicEvaluationTier } from '../src/test/supportEvaluationFixture.ts';
import type { SupportEvaluationTier } from '../src/lib/supportEvaluationTypes.ts';

const tier = String(process.argv[2] || 'SMOKE').toUpperCase() as SupportEvaluationTier;
if (!['SMOKE', 'TARGETED', 'FULL', 'SECURITY'].includes(tier)) {
  console.error(JSON.stringify({ decision: 'RELEASE_BLOCKED', reasons: [`Unknown tier: ${tier}`] }));
  process.exit(2);
}
const report = runDeterministicEvaluationTier(tier);
console.log(JSON.stringify(report));
if (report.decision === 'RELEASE_BLOCKED') process.exit(1);
