export const SUPPORT_EVALUATION_TIERS = ['SMOKE', 'TARGETED', 'FULL', 'SECURITY'] as const;
export const SUPPORT_EVALUATION_SEVERITIES = ['SEV-0', 'SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'] as const;
export const SUPPORT_EVALUATION_ASSERTIONS = [
  'AUTHORIZATION_ALLOWED', 'AUTHORIZATION_DENIED', 'EXPECTED_FACT_PRESENT', 'PROHIBITED_FACT_ABSENT',
  'EXPECTED_SOURCE_PRESENT', 'FORBIDDEN_SOURCE_ABSENT', 'EXPECTED_CITATION_PRESENT', 'FORBIDDEN_CITATION_ABSENT',
  'CONFIDENCE_EQUALS', 'FALLBACK_EQUALS', 'ACTION_EXECUTED', 'ACTION_NOT_EXECUTED', 'PRICE_EQUALS_CANONICAL',
  'DISCOUNT_EQUALS_CANONICAL', 'CONFIG_DEPENDENCY_EQUALS_CANONICAL', 'STATE_UNCHANGED', 'NO_EXTERNAL_SIDE_EFFECT',
  'LANGUAGE_MATCH', 'LATENCY_BELOW', 'COST_BELOW',
] as const;

export type SupportEvaluationTier = typeof SUPPORT_EVALUATION_TIERS[number];
export type SupportEvaluationSeverity = typeof SUPPORT_EVALUATION_SEVERITIES[number];
export type SupportEvaluationAssertionType = typeof SUPPORT_EVALUATION_ASSERTIONS[number];
export type SupportEvaluationReleaseDecision = 'RELEASE_PASS' | 'RELEASE_BLOCKED';
export type SupportEvaluationLanguage = 'da' | 'en' | 'de' | 'it' | 'hu' | 'sv' | 'fr' | 'pl' | 'cs';
export type SupportEvaluationCategory = 'PORTAL_HELP' | 'MACHINE_INFORMATION' | 'PRODUCTS_ATTACHMENTS'
  | 'TECHNICAL_SERVICE' | 'TIMAN_PUBLIC' | 'SALES_CONFIGURATOR' | 'PRICING_DISCOUNTS'
  | 'PARTNERDATA_SCOPE' | 'QUOTE_LEAD_DOCUMENTS' | 'CONFIDENCE_FALLBACK' | 'SECURITY_AUTHORIZATION';

export interface SupportEvaluationActorFixture {
  role: 'BACKEND' | 'SALES' | 'DEALER' | 'IMPORTER' | 'SERVICE_PARTNER' | 'TECHNICAL_SERVICE' | 'DISABLED';
  supportEnabled: boolean;
  active: boolean;
  approved: boolean;
  partnerId?: string;
  accountScope?: string[];
  allowedAreas?: string[];
  allowedModules?: string[];
  viewAsUserId?: string;
}

export interface SupportEvaluationExpectation {
  authorizationAllowed?: boolean;
  facts?: string[];
  prohibitedFacts?: string[];
  sourceRevisionIds?: string[];
  prohibitedSourceRevisionIds?: string[];
  citationIds?: string[];
  prohibitedCitationIds?: string[];
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_GROUNDED_ANSWER';
  fallback?: string | null;
  action?: string | null;
  actionExecuted?: boolean;
  price?: number;
  discount?: number;
  dependencies?: string[];
  stateUnchanged?: boolean;
  noExternalSideEffect?: boolean;
  responseLanguage?: SupportEvaluationLanguage;
  latencyBelowMs?: number;
  costBelow?: number;
  expectedSourceRankAtMost?: number;
}

export interface SupportEvaluationCase {
  key: string;
  version: number;
  title: string;
  category: SupportEvaluationCategory;
  language: SupportEvaluationLanguage;
  actor: SupportEvaluationActorFixture;
  pageContext: string;
  request: string;
  expected: SupportEvaluationExpectation;
  severity: SupportEvaluationSeverity;
  tags: string[];
  critical: boolean;
}

export interface SupportEvaluationRetrievalCandidate {
  chunkId: string;
  sourceRevisionId: string;
  rank: number;
  score: number;
  authorizationEligible: boolean;
}

export interface SupportEvaluationObservation {
  authorizationAllowed: boolean;
  responseText?: string;
  responseLanguage?: SupportEvaluationLanguage;
  sourceRevisionIds?: string[];
  citationIds?: string[];
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_GROUNDED_ANSWER';
  fallback?: string | null;
  action?: string | null;
  actionExecuted?: boolean;
  price?: number;
  discount?: number;
  dependencies?: string[];
  stateChanged?: boolean;
  externalSideEffects?: string[];
  latencyMs?: number;
  retrievalLatencyMs?: number;
  providerLatencyMs?: number;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  retries?: number;
  timedOut?: boolean;
  retrievalCandidates?: SupportEvaluationRetrievalCandidate[];
  error?: string | null;
}

export interface SupportEvaluationAssertionResult {
  type: SupportEvaluationAssertionType;
  passed: boolean;
  severity: SupportEvaluationSeverity;
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface SupportEvaluationCaseResult {
  resultId?: string;
  caseKey: string;
  category: SupportEvaluationCategory;
  language: SupportEvaluationLanguage;
  severity: SupportEvaluationSeverity;
  critical: boolean;
  passed: boolean;
  assertions: SupportEvaluationAssertionResult[];
  observation: SupportEvaluationObservation;
  durationMs: number;
  cost: number;
  newRegression?: boolean;
  reviewState?: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface SupportEvaluationMetrics {
  total: number; passed: number; failed: number; passRate: number;
  groundingPassRate: number; citationValidity: number; citationCompleteness: number;
  unsupportedClaimRate: number; sourcePrecision: number; recallAt5: number; precisionAt5: number;
  meanReciprocalRank: number; authorizedRetrievalRate: number; wrongContextRate: number;
  confidenceAccuracy: number; unsafeHighCount: number; unnecessaryFallbackRate: number;
  unnecessaryClarificationRate: number; criticalActionCorrectness: number;
  p50LatencyMs: number; p95LatencyMs: number; totalCost: number; retries: number; timeouts: number;
  severityCounts: Record<SupportEvaluationSeverity, number>;
  unauthorizedDisclosureCount: number;
}

export interface SupportEvaluationReleaseGate {
  key: string; label: string; passed: boolean; actual: number; required: string; hard: boolean;
}

export interface SupportEvaluationRunReport {
  tier: SupportEvaluationTier; suiteKey: string; suiteVersion: number; startedAt: string; completedAt: string;
  gitCommit: string; provider: string; model: string; embeddingModel: string; promptVersion: string;
  knowledgeSnapshot: string; results: SupportEvaluationCaseResult[]; metrics: SupportEvaluationMetrics;
  gates: SupportEvaluationReleaseGate[]; decision: SupportEvaluationReleaseDecision; reasons: string[];
}

export interface SupportEvaluationRunSummary {
  id: string; suite_version_id?: string; suite_key: string; suite_version: number; tier: SupportEvaluationTier;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  release_decision: SupportEvaluationReleaseDecision | null; git_commit: string; provider: string; model: string;
  embedding_model: string; prompt_version: string; knowledge_snapshot: string;
  metrics: SupportEvaluationMetrics | null; failure_reasons: string[]; started_at: string;
  completed_at: string | null; created_by: string | null;
  machine_result?: {
    decision?: SupportEvaluationReleaseDecision;
    reasons?: string[];
    executionMode?: string;
    productionRagExecuted?: boolean;
    roleReadiness?: Partial<Record<SupportEvaluationActorFixture['role'], 'NOT_READY' | 'READY_FOR_CONTROLLED_ROLLOUT'>>;
  } | null;
}

export interface SupportEvaluationOverview {
  latestRun: SupportEvaluationRunSummary | null;
  recentRuns: SupportEvaluationRunSummary[];
  failures: SupportEvaluationCaseResult[];
  securityFailures: SupportEvaluationCaseResult[];
  baselineRun: SupportEvaluationRunSummary | null;
  roleReadiness: Record<SupportEvaluationActorFixture['role'], 'NOT_READY' | 'READY_FOR_CONTROLLED_ROLLOUT'>;
}
