export const SUPPORT_RESULT_STATUSES = ['PENDING', 'ANSWERED', 'NO_ANSWER', 'ERROR'] as const;
export const SUPPORT_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'NO_GROUNDED_ANSWER'] as const;
export const SUPPORT_OUTCOMES = [
  'ANSWERED', 'CAUTIOUS_ANSWER', 'CLARIFICATION_REQUIRED', 'SOURCE_CONFLICT',
  'NO_RELEVANT_KNOWLEDGE', 'STALE_KNOWLEDGE', 'PROVIDER_FAILURE',
  'RETRIEVAL_FAILURE', 'ACCESS_RESTRICTED', 'SERVICE_DISABLED',
] as const;
export const SUPPORT_GAP_REASONS = [
  'NO_RELEVANT_KNOWLEDGE',
  'ACCESS_RESTRICTED',
  'LOW_CONFIDENCE',
  'AMBIGUOUS_QUESTION',
  'SOURCE_CONFLICT',
  'STALE_KNOWLEDGE',
  'MISSING_DOCUMENTATION',
  'RETRIEVAL_ERROR',
  'AI_PROVIDER_ERROR',
  'OTHER',
] as const;
export const SUPPORT_GAP_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
export const SUPPORT_KNOWLEDGE_TYPES = [
  'MANUAL_QA',
  'FAQ',
  'TECHNICAL_NOTE',
  'MACHINE_INFORMATION',
  'PRODUCT_INFORMATION',
  'DOCUMENT',
  'MANUAL',
  'TIMAN_DK_PAGE',
  'VIDEO',
  'TSB',
  'APPROVED_SERVICE_CASE',
  'URL_REFERENCE',
  'OTHER',
] as const;
export const SUPPORT_KNOWLEDGE_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED'] as const;
export const SUPPORT_ACCESS_SCOPES = ['PUBLIC', 'PORTAL', 'SALES', 'TECHNICAL_SERVICE', 'BACKEND'] as const;

export type SupportResultStatus = typeof SUPPORT_RESULT_STATUSES[number];
export type SupportConfidenceLevel = typeof SUPPORT_CONFIDENCE_LEVELS[number];
export type SupportOutcome = typeof SUPPORT_OUTCOMES[number];
export type SupportGapReason = typeof SUPPORT_GAP_REASONS[number];
export type SupportGapStatus = typeof SUPPORT_GAP_STATUSES[number];
export type SupportKnowledgeType = typeof SUPPORT_KNOWLEDGE_TYPES[number];
export type SupportKnowledgeStatus = typeof SUPPORT_KNOWLEDGE_STATUSES[number];
export type SupportKnowledgeAccessScope = typeof SUPPORT_ACCESS_SCOPES[number];
export const SUPPORT_INGESTION_STATUSES = ['RECEIVED', 'QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'FAILED', 'CANCELLED', 'SUPERSEDED'] as const;
export const SUPPORT_INDEX_STATUSES = ['NOT_INDEXED', 'QUEUED', 'INDEXING', 'INDEXED', 'STALE', 'FAILED'] as const;
export type SupportIngestionStatus = typeof SUPPORT_INGESTION_STATUSES[number];
export type SupportIndexStatus = typeof SUPPORT_INDEX_STATUSES[number];

export interface SupportAdminOverview {
  total_questions: number;
  unique_users: number;
  answered_questions: number;
  grounded_answers: number;
  no_answer_questions: number;
  positive_feedback: number;
  total_feedback: number;
  average_response_time_ms: number;
  questions_today: number;
  questions_7_days: number;
  questions_30_days: number;
  open_knowledge_gaps: number;
  approved_knowledge_items: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  p95_latency_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  estimated_cost: number;
  confidence_high: number;
  confidence_medium: number;
  confidence_low: number;
  confidence_none: number;
  confidence_unknown: number;
  clarification_requests: number;
  source_conflicts: number;
  stale_knowledge_blocks: number;
  overdue_reviews: number;
  reindex_jobs: number;
  reembed_jobs: number;
  failed_promotions: number;
  configuration_started: number;
  configuration_completed: number;
  quote_previewed: number;
  quote_created: number;
  lead_created_or_linked: number;
  pdf_generated: number;
  email_prepared: number;
  email_sent: number;
  sales_handoffs: number;
  service_handoffs: number;
  failed_actions: number;
  open_workflows: number;
  sync_enabled: boolean;
  auto_promotion_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  timan_sources_total: number;
  timan_sources_review: number;
  timan_sources_approved: number;
  timan_sources_changed: number;
  timan_sources_stale: number;
  timan_sources_indexed: number;
  web_candidates_review: number;
  web_fallback_30d: number;
  source_breakdown_30d: Record<string, number>;
  language_counts: Record<string, number>;
  language_indexed_counts: Record<string, number>;
  exact_duplicates_blocked: number;
  near_duplicates_open: number;
  open_conflicts: number;
  resolved_conflicts: number;
  extraction_failures: number;
  markup_noise_failures: number;
  language_quality: Record<string, { clean: number; needs_review: number; rejected: number }>;
}

export const EMPTY_SUPPORT_ADMIN_OVERVIEW: SupportAdminOverview = {
  total_questions: 0,
  unique_users: 0,
  answered_questions: 0,
  grounded_answers: 0,
  no_answer_questions: 0,
  positive_feedback: 0,
  total_feedback: 0,
  average_response_time_ms: 0,
  questions_today: 0,
  questions_7_days: 0,
  questions_30_days: 0,
  open_knowledge_gaps: 0,
  approved_knowledge_items: 0,
  total_requests: 0,
  successful_requests: 0,
  failed_requests: 0,
  p95_latency_ms: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_cached_tokens: 0,
  estimated_cost: 0,
  confidence_high: 0,
  confidence_medium: 0,
  confidence_low: 0,
  confidence_none: 0,
  confidence_unknown: 0,
  clarification_requests: 0,
  source_conflicts: 0,
  stale_knowledge_blocks: 0,
  overdue_reviews: 0,
  reindex_jobs: 0,
  reembed_jobs: 0,
  failed_promotions: 0,
  configuration_started: 0,
  configuration_completed: 0,
  quote_previewed: 0,
  quote_created: 0,
  lead_created_or_linked: 0,
  pdf_generated: 0,
  email_prepared: 0,
  email_sent: 0,
  sales_handoffs: 0,
  service_handoffs: 0,
  failed_actions: 0,
  open_workflows: 0,
  sync_enabled: false,
  auto_promotion_enabled: false,
  last_sync_at: null,
  last_sync_status: null,
  timan_sources_total: 0,
  timan_sources_review: 0,
  timan_sources_approved: 0,
  timan_sources_changed: 0,
  timan_sources_stale: 0,
  timan_sources_indexed: 0,
  web_candidates_review: 0,
  web_fallback_30d: 0,
  source_breakdown_30d: {},
  language_counts: {},
  language_indexed_counts: {},
  exact_duplicates_blocked: 0,
  near_duplicates_open: 0,
  open_conflicts: 0,
  resolved_conflicts: 0,
  extraction_failures: 0,
  markup_noise_failures: 0,
  language_quality: {},
};

export interface SupportQuestionRow {
  id: string;
  conversation_id: string;
  asked_by_user_id: string | null;
  partner_id: string | null;
  role_snapshot: string | null;
  portal_language: string;
  question_text: string;
  current_route: string | null;
  machine_id: string | null;
  product_id: string | null;
  category: string | null;
  result_status: SupportResultStatus;
  latency_ms: number | null;
  confidence_level: SupportConfidenceLevel | null;
  confidence_score: number | null;
  confidence_reason: string | null;
  outcome_type: SupportOutcome | null;
  clarification_requested: boolean;
  source_conflict: boolean;
  stale_knowledge_blocked: boolean;
  created_at: string;
  response?: SupportResponseRow | null;
  feedback?: SupportFeedbackRow[];
}

export interface SupportResponseRow {
  id: string;
  response_text: string | null;
  answer_status: 'ACCEPTED' | 'NO_ANSWER' | 'ERROR';
  grounded: boolean;
  latency_ms: number | null;
  model_name: string | null;
  error_category: string | null;
  confidence_level: SupportConfidenceLevel | null;
  confidence_score: number | null;
  confidence_reason: string | null;
  outcome_type: SupportOutcome | null;
  created_at: string;
  sources?: SupportResponseSourceRow[];
}

export interface SupportResponseSourceRow {
  id: string;
  knowledge_item_id: string;
  knowledge_version: number;
  citation_label: string | null;
}

export interface SupportFeedbackRow {
  id: string;
  conversation_id: string | null;
  question_id: string | null;
  response_id: string | null;
  submitted_by_user_id: string | null;
  sentiment: 'POSITIVE' | 'NEGATIVE';
  reason_code: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
  question?: Pick<SupportQuestionRow, 'id' | 'question_text' | 'portal_language'> | null;
  response?: {
    id: string;
    response_text: string;
    answer_status: string;
    confidence_level: string | null;
    question?: Pick<SupportQuestionRow, 'id' | 'question_text' | 'portal_language'> | null;
    sources?: SupportResponseSourceRow[];
  } | null;
  submitted_by?: { id: string; email: string } | null;
}

export interface SupportKnowledgeGapRow {
  id: string;
  question_id: string | null;
  machine_id: string | null;
  category: string | null;
  languages: string[];
  reason_code: SupportGapReason;
  status: SupportGapStatus;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolution_note: string | null;
  question?: Pick<SupportQuestionRow, 'id' | 'question_text' | 'portal_language'> | null;
}

export interface SupportKnowledgeItem {
  id: string;
  title: string;
  knowledge_type: SupportKnowledgeType;
  content: string;
  summary: string | null;
  machine_id: string | null;
  product_id: string | null;
  category: string | null;
  keywords: string[];
  source_reference: string | null;
  language: string;
  status: SupportKnowledgeStatus;
  access_scope: SupportKnowledgeAccessScope;
  evaluation_only: boolean;
  required_area: string | null;
  required_module: string | null;
  created_by_user_id: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  version_number: number;
  source_version: string | null;
  effective_from: string | null;
  effective_until: string | null;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  source_family_key: string;
  created_at: string;
  updated_at: string;
}

export interface SupportKnowledgeDraft {
  title: string;
  knowledge_type: SupportKnowledgeType;
  content: string;
  summary: string;
  machine_id: string;
  product_id: string;
  category: string;
  keywords: string[];
  source_reference: string;
  language: string;
  status: SupportKnowledgeStatus;
  access_scope: SupportKnowledgeAccessScope;
  required_area: string;
  required_module: string;
  effective_from: string;
  effective_until: string;
  next_review_at: string;
}

export interface SupportKnowledgeSource {
  id: string;
  knowledge_item_id: string;
  source_type: 'UPLOADED_PDF' | 'PLAIN_TEXT' | 'TIMAN_DK_REGISTRY';
  revision: number;
  original_filename: string | null;
  original_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  raw_sha256: string | null;
  normalized_content_hash: string | null;
  source_language: string;
  supersedes_source_id: string | null;
  is_current: boolean;
  lifecycle_status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'ARCHIVED';
  effective_from: string | null;
  effective_until: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  promoted_at: string | null;
  superseded_at: string | null;
  stale_states: SupportStaleState[];
  stale_reason: string | null;
  ingestion_status: SupportIngestionStatus;
  content_equivalent_source_id: string | null;
  created_at: string;
  updated_at: string;
  quality_status: 'READY_FOR_REVIEW' | 'REJECTED_EXTRACTION_NOISE' | 'DUPLICATE' | 'NEAR_DUPLICATE' | 'EMPTY_CONTENT' | 'LANGUAGE_MISMATCH';
  quality_score: number;
  quality_reasons: string[];
  topic_key: string | null;
  authority_tier: 1 | 2 | 3 | 4;
  authority_kind: 'CANONICAL_DOCUMENT' | 'TIMAN_DK' | 'INTERNAL_FAQ' | 'OTHER_APPROVED';
  retrieval_excluded: boolean;
  runs: SupportIngestionRun[];
  index_state: SupportKnowledgeIndexState | null;
}

export interface SupportKnowledgeQualitySourceSummary {
  id: string;
  knowledge_item_id: string;
  revision: number;
  original_filename: string | null;
  original_url: string | null;
  source_language: string;
  lifecycle_status: string;
  quality_status: string;
  topic_key: string | null;
  authority_tier: number;
  updated_at: string;
  title: string;
}

export interface SupportKnowledgeDuplicateCluster {
  id: string;
  source_a_id: string;
  source_b_id: string;
  language: string;
  similarity_score: number;
  detection_methods: string[];
  matching_headings: string[];
  shared_relations: string[];
  status: 'OPEN' | 'RESOLVED';
  resolution: 'KEEP_BOTH' | 'KEEP_A' | 'KEEP_B' | 'LINK_SAME_TOPIC' | 'NEEDS_MORE_INFORMATION' | null;
  resolution_note: string | null;
  resolved_by_user_id: string | null;
  detected_at: string;
  resolved_at: string | null;
}

export interface SupportKnowledgeConflict {
  id: string;
  subject: string;
  attribute: string;
  source_a_id: string;
  source_b_id: string;
  value_a: string;
  value_b: string;
  context_a: string | null;
  context_b: string | null;
  language: string;
  severity: 'INFORMATIONAL' | 'MATERIAL' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED';
  resolution: 'KEEP_SOURCE_A' | 'KEEP_SOURCE_B' | 'BOTH_VALID_DIFFERENT_CONTEXT' | 'SOURCE_A_SUPERSEDED' | 'SOURCE_B_SUPERSEDED' | 'NEEDS_MORE_INFORMATION' | null;
  resolution_note: string | null;
  resolved_by_user_id: string | null;
  detected_at: string;
  resolved_at: string | null;
}

export interface SupportKnowledgeQualityReview {
  overview: Pick<SupportAdminOverview, 'exact_duplicates_blocked' | 'near_duplicates_open' | 'open_conflicts' | 'resolved_conflicts' | 'extraction_failures' | 'markup_noise_failures' | 'language_quality'>;
  duplicates: SupportKnowledgeDuplicateCluster[];
  conflicts: SupportKnowledgeConflict[];
  sources: Record<string, SupportKnowledgeQualitySourceSummary>;
}

export interface SupportIngestionRun {
  id: string;
  knowledge_source_id: string;
  status: SupportIngestionStatus;
  run_reason: 'UPLOAD' | 'REPROCESS' | 'RECHUNK' | 'TIMAN_DK_SYNC';
  processor_version: string;
  processor_config: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  extraction_method: string | null;
  page_count: number | null;
  extracted_character_count: number | null;
  chunk_count: number | null;
  extracted_text: string | null;
  detected_sections: Array<{ heading: string; page: number }>;
  warnings: string[];
  error_code: string | null;
  error_message_sanitized: string | null;
  created_at: string;
}

export interface SupportKnowledgeIndexState {
  id: string;
  knowledge_source_id: string;
  ingestion_run_id: string | null;
  status: SupportIndexStatus;
  status_reason: string | null;
  indexed_at: string | null;
  embedding_model_id: string | null;
  embedding_model_name: string | null;
  processor_version: string | null;
  indexed_content_hash: string | null;
  updated_at: string;
}

export interface SupportKnowledgeAssociations {
  machineIds: string[];
  productIds: string[];
}

export interface SupportProductOption {
  id: string;
  itemNumber: string;
  label: string;
}

export interface SupportQuestionFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  partnerId?: string;
  role?: string;
  language?: string;
  category?: string;
  machineId?: string;
  resultStatus?: SupportResultStatus;
  confidenceLevel?: SupportConfidenceLevel;
  outcomeType?: SupportOutcome;
}

export type SupportStaleState = 'CONTENT_STALE' | 'INDEX_STALE' | 'EMBEDDING_STALE' | 'REVIEW_OVERDUE';

export interface SupportKnowledgeLifecycleEvent {
  id: string;
  knowledge_item_id: string;
  knowledge_source_id: string | null;
  ingestion_run_id: string | null;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  actor_user_id: string | null;
  reason: string | null;
  version_before: number | null;
  version_after: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SupportKnowledgeFilters {
  search?: string;
  status?: SupportKnowledgeStatus;
  type?: SupportKnowledgeType;
  machineId?: string;
  category?: string;
  language?: string;
  accessScope?: SupportKnowledgeAccessScope;
}

export interface SupportGapFilters {
  status?: SupportGapStatus;
  reason?: SupportGapReason;
  machineId?: string;
  category?: string;
  minimumOccurrences?: number;
}

const KNOWLEDGE_TRANSITIONS: Record<SupportKnowledgeStatus, SupportKnowledgeStatus[]> = {
  DRAFT: ['REVIEW', 'ARCHIVED'],
  REVIEW: ['DRAFT', 'APPROVED', 'ARCHIVED'],
  APPROVED: ['REVIEW', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export function canTransitionKnowledgeStatus(from: SupportKnowledgeStatus, to: SupportKnowledgeStatus): boolean {
  return from === to || KNOWLEDGE_TRANSITIONS[from].includes(to);
}

export function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
