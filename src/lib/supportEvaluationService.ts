import { supabase } from '@/lib/supabase';
import { buildCanonicalActionParityReport } from '@/lib/supportActionParity';
import type { SupportEvaluationAssertionResult, SupportEvaluationCaseResult, SupportEvaluationRunSummary, SupportEvaluationTier } from './supportEvaluationTypes';

export interface SupportEvaluationSuiteRow {
  id: string; suite_key: string; title: string; is_active: boolean;
  versions?: Array<{ id: string; version_number: number; status: string; tier: SupportEvaluationTier; case_count: number; created_at: string }>;
}

export interface SupportEvaluationDashboardData {
  latestRun: SupportEvaluationRunSummary | null;
  baselineRun: SupportEvaluationRunSummary | null;
  recentRuns: SupportEvaluationRunSummary[];
  suites: SupportEvaluationSuiteRow[];
  failures: SupportEvaluationCaseResult[];
  securityFailures: SupportEvaluationCaseResult[];
  openReviews: number;
  approvedCaseCount: number;
  approvedSuiteCount: number;
}

interface EvaluationResultRow {
  id: string;
  case_version?: {
    case?: { case_key?: string } | null;
    category?: SupportEvaluationCaseResult['category'];
    language?: SupportEvaluationCaseResult['language'];
  } | null;
  severity: SupportEvaluationCaseResult['severity'];
  is_critical: boolean;
  passed: boolean;
  assertions?: Array<{
    assertion_type: SupportEvaluationAssertionResult['type'];
    passed: boolean;
    severity: SupportEvaluationAssertionResult['severity'];
    expected_value: unknown;
    actual_value: unknown;
    message: string;
  }>;
  observation?: SupportEvaluationCaseResult['observation'];
  duration_ms?: number;
  estimated_cost?: number | string;
  new_regression?: boolean;
  review_state?: SupportEvaluationCaseResult['reviewState'];
}

function empty(): SupportEvaluationDashboardData {
  return { latestRun: null, baselineRun: null, recentRuns: [], suites: [], failures: [], securityFailures: [], openReviews: 0, approvedCaseCount: 0, approvedSuiteCount: 0 };
}

export async function fetchSupportEvaluationDashboard(): Promise<SupportEvaluationDashboardData> {
  const [{ data: overview, error: overviewError }, { data: suites, error: suitesError }] = await Promise.all([
    supabase.rpc('get_support_evaluation_overview'),
    supabase.from('support_evaluation_suites').select('id,suite_key,title,is_active,versions:support_evaluation_suite_versions(id,version_number,status,tier,case_count,created_at)').order('suite_key'),
  ]);
  if (overviewError) {
    if (overviewError.code === 'PGRST202' || overviewError.code === '42P01') return empty();
    throw overviewError;
  }
  if (suitesError) throw suitesError;
  const suiteRows = (suites || []) as SupportEvaluationSuiteRow[];
  const suiteVersionMetadata = new Map(
    suiteRows.flatMap((suite) => (suite.versions || []).map((version) => [version.id, {
      suiteKey: suite.suite_key,
      versionNumber: version.version_number,
    }] as const)),
  );
  const enrichRun = (run: SupportEvaluationRunSummary | null) => {
    if (!run) return null;
    const metadata = run.suite_version_id ? suiteVersionMetadata.get(run.suite_version_id) : undefined;
    return {
      ...run,
      suite_key: run.suite_key || metadata?.suiteKey || run.tier,
      suite_version: run.suite_version || metadata?.versionNumber || 0,
    };
  };
  const value = (overview || {}) as Record<string, unknown>;
  const latestRun = enrichRun((value.latest_run || null) as SupportEvaluationRunSummary | null);
  let failures: SupportEvaluationCaseResult[] = [];
  if (latestRun?.id) {
    const { data, error } = await supabase
      .from('support_evaluation_results')
      .select('*,case_version:support_evaluation_case_versions(case:support_evaluation_cases(case_key),category,language),assertions:support_evaluation_assertions(*)')
      .eq('run_id', latestRun.id).eq('passed', false).order('severity').limit(250);
    if (error) throw error;
    failures = ((data || []) as unknown as EvaluationResultRow[]).map((row) => ({
      resultId: row.id, caseKey: row.case_version?.case?.case_key || row.id, category: row.case_version?.category,
      language: row.case_version?.language, severity: row.severity, critical: row.is_critical,
      passed: row.passed, assertions: (row.assertions || []).map((assertion) => ({
        type: assertion.assertion_type,
        passed: assertion.passed,
        severity: assertion.severity,
        expected: assertion.expected_value,
        actual: assertion.actual_value,
        message: assertion.message,
      })), observation: row.observation || {},
      durationMs: row.duration_ms || 0, cost: Number(row.estimated_cost || 0), newRegression: row.new_regression, reviewState: row.review_state,
    }));
  }
  return {
    latestRun, baselineRun: enrichRun((value.baseline_run || null) as SupportEvaluationRunSummary | null),
    recentRuns: ((value.recent_runs || []) as SupportEvaluationRunSummary[]).map((run) => enrichRun(run)!), suites: suiteRows,
    failures, securityFailures: failures.filter((item) => item.category === 'SECURITY_AUTHORIZATION'),
    openReviews: Number(value.open_reviews || 0), approvedCaseCount: Number(value.approved_case_count || 0), approvedSuiteCount: Number(value.approved_suite_count || 0),
  };
}

export async function startSupportEvaluation(tier: SupportEvaluationTier): Promise<{ runId: string; decision?: string }> {
  const gitCommit = String(import.meta.env.VITE_GIT_COMMIT || 'working-tree');
  const { data, error } = await supabase.functions.invoke('support-evaluate', {
    body: { action: 'RUN', tier, gitCommit, actionParity: buildCanonicalActionParityReport() },
  });
  if (error) throw error;
  if (!data?.runId) throw new Error(data?.message || 'Evaluation did not return a run id.');
  return data;
}

export async function submitSupportEvaluationReview(input: { resultId: string; reason: string; decision: string; comment?: string }) {
  const { data, error } = await supabase.rpc('support_submit_evaluation_review', {
    p_result_id: input.resultId, p_reason: input.reason, p_decision: input.decision, p_comment: input.comment || null,
  });
  if (error) throw error;
  return data as string;
}

export async function approveSupportEvaluationBaseline(runId: string, justification: string) {
  const { data, error } = await supabase.rpc('support_approve_evaluation_baseline', { p_run_id: runId, p_justification: justification });
  if (error) throw error;
  return data as string;
}
