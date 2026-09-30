import { supabase } from '@/lib/supabase';
import { FALLBACK_LANGUAGE, normalizePortalLanguageCode, portalLanguageQueryAliases } from '@/lib/portalLanguages';
import {
  EMPTY_SUPPORT_ADMIN_OVERVIEW,
  canTransitionKnowledgeStatus,
  type SupportAdminOverview,
  type SupportFeedbackRow,
  type SupportGapFilters,
  type SupportKnowledgeDraft,
  type SupportKnowledgeFilters,
  type SupportKnowledgeGapRow,
  type SupportKnowledgeItem,
  type SupportKnowledgeLifecycleEvent,
  type SupportKnowledgeAssociations,
  type SupportKnowledgeSource,
  type SupportProductOption,
  type SupportQuestionFilters,
  type SupportQuestionRow,
} from '@/lib/supportAdminTypes';

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

async function throwSupportFunctionError(error: unknown, data?: unknown): Promise<never> {
  let payload = data as { error?: string; message?: string } | null | undefined;
  const context = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (context instanceof Response) {
    try {
      payload = await context.clone().json() as { error?: string; message?: string };
    } catch {
      // Keep the canonical client error when the response has no JSON body.
    }
  }
  const resolved = new Error(payload?.message || (error instanceof Error ? error.message : 'Knowledge processing failed.')) as Error & { code?: string };
  resolved.code = payload?.error || 'OTHER';
  throw resolved;
}

export async function fetchSupportAdminOverview(): Promise<SupportAdminOverview> {
  const [{ data, error }, actionOverview] = await Promise.all([
    supabase.rpc('get_support_admin_overview'),
    supabase.rpc('get_support_action_overview'),
  ]);
  if (error) throw error;
  return {
    ...EMPTY_SUPPORT_ADMIN_OVERVIEW,
    ...((data || {}) as Partial<SupportAdminOverview>),
    ...(!actionOverview.error ? (actionOverview.data || {}) as Partial<SupportAdminOverview> : {}),
  };
}

export async function fetchSupportQuestions(filters: SupportQuestionFilters = {}): Promise<SupportQuestionRow[]> {
  let query = supabase
    .from('support_questions')
    .select(`
      *,
      response:support_responses(
        id, response_text, answer_status, grounded, latency_ms, model_name, error_category, created_at,
        confidence_level, confidence_score, confidence_reason, outcome_type,
        sources:support_response_sources(id, knowledge_item_id, knowledge_version, citation_label)
      ),
      feedback:support_feedback(id, question_id, response_id, submitted_by_user_id, sentiment, comment, created_at)
    `)
    .order('created_at', { ascending: false })
    .limit(250);

  const search = clean(filters.search);
  if (search) query = query.ilike('question_text', `%${search.replace(/[%_]/g, '\\$&')}%`);
  if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`);
  if (filters.userId) query = query.eq('asked_by_user_id', filters.userId);
  if (filters.partnerId) query = query.eq('partner_id', filters.partnerId);
  if (filters.role) query = query.eq('role_snapshot', filters.role);
  const languageAliases = portalLanguageQueryAliases(filters.language);
  if (languageAliases.length) query = query.in('portal_language', languageAliases);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.machineId) query = query.eq('machine_id', filters.machineId);
  if (filters.resultStatus) query = query.eq('result_status', filters.resultStatus);
  if (filters.confidenceLevel) query = query.eq('confidence_level', filters.confidenceLevel);
  if (filters.outcomeType) query = query.eq('outcome_type', filters.outcomeType);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    portal_language: normalizePortalLanguageCode(row.portal_language) || row.portal_language,
  })) as unknown as SupportQuestionRow[];
}

export async function fetchSupportFeedback(): Promise<SupportFeedbackRow[]> {
  const { data, error } = await supabase
    .from('support_feedback')
    .select(`
      *,
      question:support_questions(id, question_text, portal_language),
      response:support_responses(
        id, response_text, answer_status, confidence_level,
        question:support_questions(id, question_text, portal_language),
        sources:support_response_sources(id, knowledge_item_id, knowledge_version, citation_label)
      ),
      submitted_by:app_users(id, email)
    `)
    .order('created_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  return (data || []).map((row) => {
    const question = row.question || row.response?.question || null;
    return {
      ...row,
      question: question ? {
        ...question,
        portal_language: normalizePortalLanguageCode(question.portal_language) || question.portal_language,
      } : null,
    };
  }) as unknown as SupportFeedbackRow[];
}

export async function fetchSupportKnowledgeGaps(filters: SupportGapFilters = {}): Promise<SupportKnowledgeGapRow[]> {
  let query = supabase
    .from('support_knowledge_gaps')
    .select('*, question:support_questions(id, question_text, portal_language)')
    .order('occurrence_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(250);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.reason) query = query.eq('reason_code', filters.reason);
  if (filters.machineId) query = query.eq('machine_id', filters.machineId);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.minimumOccurrences) query = query.gte('occurrence_count', filters.minimumOccurrences);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    languages: Array.from(new Set((row.languages || []).map((language) => normalizePortalLanguageCode(language) || language))),
    question: row.question ? {
      ...row.question,
      portal_language: normalizePortalLanguageCode(row.question.portal_language) || row.question.portal_language,
    } : row.question,
  })) as unknown as SupportKnowledgeGapRow[];
}

export async function fetchSupportKnowledgeItems(filters: SupportKnowledgeFilters = {}): Promise<SupportKnowledgeItem[]> {
  let query = supabase
    .from('support_knowledge_items')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(250);
  const search = clean(filters.search);
  if (search) {
    const escaped = search.replace(/[%,_]/g, '\\$&');
    query = query.or(`title.ilike.%${escaped}%,summary.ilike.%${escaped}%,content.ilike.%${escaped}%`);
  }
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.type) query = query.eq('knowledge_type', filters.type);
  if (filters.machineId) query = query.eq('machine_id', filters.machineId);
  if (filters.category) query = query.eq('category', filters.category);
  const languageAliases = portalLanguageQueryAliases(filters.language);
  if (languageAliases.length) query = query.in('language', languageAliases);
  if (filters.accessScope) query = query.eq('access_scope', filters.accessScope);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    language: normalizePortalLanguageCode(row.language) || row.language,
  })) as SupportKnowledgeItem[];
}

function knowledgePayload(draft: SupportKnowledgeDraft) {
  return {
    title: draft.title.trim(),
    knowledge_type: draft.knowledge_type,
    content: draft.content.trim(),
    summary: nullable(draft.summary),
    machine_id: nullable(draft.machine_id),
    product_id: nullable(draft.product_id),
    category: nullable(draft.category),
    keywords: draft.keywords.map((keyword) => keyword.trim()).filter(Boolean),
    source_reference: nullable(draft.source_reference),
    language: normalizePortalLanguageCode(draft.language) || FALLBACK_LANGUAGE,
    status: draft.status,
    access_scope: draft.access_scope,
    required_area: nullable(draft.required_area),
    required_module: nullable(draft.required_module),
    effective_from: draft.effective_from ? new Date(draft.effective_from).toISOString() : null,
    effective_until: draft.effective_until ? new Date(draft.effective_until).toISOString() : null,
    next_review_at: draft.next_review_at ? new Date(draft.next_review_at).toISOString() : null,
  };
}

export function normalizeControlledTimanUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !['timan.dk', 'www.timan.dk'].includes(url.hostname.toLowerCase())) return null;
    if (url.username || url.password) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

async function registerControlledTimanSource(item: SupportKnowledgeItem): Promise<void> {
  const canonicalUrl = normalizeControlledTimanUrl(item.source_reference || '');
  if (!canonicalUrl) return;
  const language = normalizePortalLanguageCode(item.language) || FALLBACK_LANGUAGE;
  const { data: existing, error: readError } = await supabase
    .from('support_controlled_source_registry')
    .select('id, knowledge_item_id')
    .eq('canonical_url', canonicalUrl)
    .eq('language', language)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.knowledge_item_id && existing.knowledge_item_id !== item.id) {
    throw new Error('Controlled Timan source is already linked to another knowledge item.');
  }
  if (existing) {
    if (!existing.knowledge_item_id) {
      const { error } = await supabase.from('support_controlled_source_registry')
        .update({ knowledge_item_id: item.id }).eq('id', existing.id);
      if (error) throw error;
    }
    return;
  }
  const parsed = new URL(canonicalUrl);
  const { error } = await supabase.from('support_controlled_source_registry').insert({
    knowledge_item_id: item.id,
    canonical_url: canonicalUrl,
    domain: parsed.hostname,
    language,
    page_type: 'PRODUCT_PAGE',
    approval_state: 'DRAFT',
  });
  if (error) throw error;
}

export async function createSupportKnowledgeItem(
  draft: SupportKnowledgeDraft,
): Promise<SupportKnowledgeItem> {
  const { data, error } = await supabase
    .from('support_knowledge_items')
    .insert({
      ...knowledgePayload({ ...draft, status: 'DRAFT' }),
      source_family_key: crypto.randomUUID(),
    })
    .select('*')
    .single();
  if (error) throw error;
  const item = data as SupportKnowledgeItem;
  await registerControlledTimanSource(item);
  return item;
}

export async function updateSupportKnowledgeItem(
  item: SupportKnowledgeItem,
  draft: SupportKnowledgeDraft,
): Promise<SupportKnowledgeItem> {
  if (!canTransitionKnowledgeStatus(item.status, draft.status)) {
    throw new Error(`Invalid support knowledge transition: ${item.status} -> ${draft.status}`);
  }
  const { data, error } = await supabase
    .from('support_knowledge_items')
    .update(knowledgePayload(draft))
    .eq('id', item.id)
    .select('*')
    .single();
  if (error) throw error;
  const updated = data as SupportKnowledgeItem;
  await registerControlledTimanSource(updated);
  return updated;
}

export function draftKnowledgeFromGap(gap: SupportKnowledgeGapRow): SupportKnowledgeDraft {
  return {
    title: gap.question?.question_text ? `Knowledge: ${gap.question.question_text}` : 'Knowledge draft',
    knowledge_type: 'MANUAL_QA',
    content: '',
    summary: '',
    machine_id: gap.machine_id || '',
    product_id: '',
    category: gap.category || '',
    keywords: [],
    source_reference: gap.question_id ? `support-question:${gap.question_id}` : '',
    language: normalizePortalLanguageCode(gap.question?.portal_language || gap.languages[0]) || FALLBACK_LANGUAGE,
    status: 'DRAFT',
    access_scope: 'BACKEND',
    required_area: '',
    required_module: '',
    effective_from: '',
    effective_until: '',
    next_review_at: '',
  };
}

export async function fetchSupportKnowledgeSources(knowledgeItemId: string): Promise<SupportKnowledgeSource[]> {
  const { data: sources, error } = await supabase
    .from('support_knowledge_sources')
    .select('*')
    .eq('knowledge_item_id', knowledgeItemId)
    .order('revision', { ascending: false });
  if (error) throw error;
  if (!sources?.length) return [];
  const sourceIds = sources.map((source) => source.id);
  const [{ data: runs, error: runError }, { data: states, error: stateError }] = await Promise.all([
    supabase.from('support_ingestion_runs').select('*').in('knowledge_source_id', sourceIds).order('created_at', { ascending: false }),
    supabase.from('support_knowledge_index_states').select('*').in('knowledge_source_id', sourceIds),
  ]);
  if (runError) throw runError;
  if (stateError) throw stateError;
  return sources.map((source) => ({
    ...source,
    source_language: normalizePortalLanguageCode(source.source_language) || source.source_language,
    runs: (runs || []).filter((run) => run.knowledge_source_id === source.id),
    index_state: (states || []).find((state) => state.knowledge_source_id === source.id) || null,
  })) as SupportKnowledgeSource[];
}

export async function fetchSupportKnowledgeLifecycleEvents(knowledgeItemId: string): Promise<SupportKnowledgeLifecycleEvent[]> {
  const { data, error } = await supabase
    .from('support_knowledge_lifecycle_events')
    .select('*')
    .eq('knowledge_item_id', knowledgeItemId)
    .order('created_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  return (data || []) as SupportKnowledgeLifecycleEvent[];
}

export async function transitionSupportKnowledgeSource(
  sourceId: string,
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ARCHIVED',
) {
  const { data, error } = await supabase.rpc('support_transition_source_revision', {
    p_source_id: sourceId,
    p_new_status: status,
    p_note: null,
  });
  if (error) throw error;
  const source = data as SupportKnowledgeSource;
  const { data: item } = await supabase.from('support_knowledge_items')
    .select('id, source_reference, language').eq('id', source.knowledge_item_id).maybeSingle();
  const canonicalUrl = normalizeControlledTimanUrl(item?.source_reference || '');
  if (canonicalUrl && item) {
    const language = normalizePortalLanguageCode(item.language) || FALLBACK_LANGUAGE;
    const { error: registryError } = await supabase.from('support_controlled_source_registry')
      .update({ approval_state: status })
      .eq('canonical_url', canonicalUrl)
      .eq('language', language)
      .eq('knowledge_item_id', item.id);
    if (registryError) throw registryError;
  }
  return source;
}

export async function fetchSupportKnowledgeAssociations(knowledgeItemId: string): Promise<SupportKnowledgeAssociations> {
  const [{ data: machines, error: machineError }, { data: products, error: productError }] = await Promise.all([
    supabase.from('support_knowledge_item_machines').select('machine_id').eq('knowledge_item_id', knowledgeItemId),
    supabase.from('support_knowledge_item_products').select('product_id').eq('knowledge_item_id', knowledgeItemId),
  ]);
  if (machineError) throw machineError;
  if (productError) throw productError;
  return {
    machineIds: (machines || []).map((row) => row.machine_id),
    productIds: (products || []).map((row) => row.product_id),
  };
}

export async function replaceSupportKnowledgeAssociations(
  knowledgeItemId: string,
  associations: SupportKnowledgeAssociations,
): Promise<void> {
  const uniqueMachines = Array.from(new Set(associations.machineIds.map((value) => value.trim()).filter(Boolean)));
  const uniqueProducts = Array.from(new Set(associations.productIds.filter(Boolean)));
  const deleteMachines = await supabase.from('support_knowledge_item_machines').delete().eq('knowledge_item_id', knowledgeItemId);
  if (deleteMachines.error) throw deleteMachines.error;
  const deleteProducts = await supabase.from('support_knowledge_item_products').delete().eq('knowledge_item_id', knowledgeItemId);
  if (deleteProducts.error) throw deleteProducts.error;
  if (uniqueMachines.length) {
    const { error } = await supabase.from('support_knowledge_item_machines').insert(
      uniqueMachines.map((machine_id) => ({ knowledge_item_id: knowledgeItemId, machine_id })),
    );
    if (error) throw error;
  }
  if (uniqueProducts.length) {
    const { error } = await supabase.from('support_knowledge_item_products').insert(
      uniqueProducts.map((product_id) => ({ knowledge_item_id: knowledgeItemId, product_id })),
    );
    if (error) throw error;
  }
}

export async function fetchSupportProductOptions(): Promise<SupportProductOption[]> {
  const { data, error } = await supabase
    .from('price_list_items')
    .select('id,item_number,item_text_da,item_text_en')
    .eq('is_active', true)
    .order('item_number')
    .limit(2000);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    itemNumber: row.item_number,
    label: row.item_text_da || row.item_text_en || row.item_number,
  }));
}

export async function uploadSupportKnowledgeSource(input: {
  knowledgeItemId: string;
  sourceLanguage: string;
  file: File;
}): Promise<{ source_id: string; ingestion_run_id: string; revision: number; status: string }> {
  const form = new FormData();
  form.set('knowledge_item_id', input.knowledgeItemId);
  form.set('source_language', normalizePortalLanguageCode(input.sourceLanguage) || FALLBACK_LANGUAGE);
  form.set('file', input.file);
  const { data, error } = await supabase.functions.invoke('support-knowledge-ingestion', { body: form });
  if (error || data?.error) await throwSupportFunctionError(error, data);
  return data;
}

export async function reprocessSupportKnowledgeSource(sourceId: string, action: 'reprocess' | 'rechunk') {
  const { data, error } = await supabase.functions.invoke('support-knowledge-ingestion', {
    body: { source_id: sourceId, action },
  });
  if (error || data?.error) await throwSupportFunctionError(error, data);
  return data as { source_id: string; ingestion_run_id: string; status: string };
}

export async function indexSupportKnowledgeSource(sourceId: string, mode: 'index' | 'reindex' | 'reembed' = 'index') {
  const { data, error } = await supabase.functions.invoke('support-index-knowledge', {
    body: { source_id: sourceId, batch_size: 20, mode },
  });
  if (error || data?.error) await throwSupportFunctionError(error, data);
  return data as { processed: number; completed: number; failed: number; has_more: boolean };
}

export async function createSupportKnowledgeSourceDownloadUrl(source: SupportKnowledgeSource): Promise<string> {
  if (!source.storage_path || !source.storage_bucket) throw new Error('Source file is unavailable.');
  const { data, error } = await supabase.storage.from(source.storage_bucket).createSignedUrl(source.storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}
