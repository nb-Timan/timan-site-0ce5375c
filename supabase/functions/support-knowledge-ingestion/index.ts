import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.4.0';
import {
  SUPPORT_CHUNK_OVERLAP_WORDS,
  SUPPORT_CHUNK_TARGET_WORDS,
  SUPPORT_KNOWLEDGE_BUCKET,
  SUPPORT_PROCESSOR_VERSION,
  chunkKnowledgePages,
  detectKnowledgeSections,
  knowledgeStoragePath,
  normalizeExtractedText,
  sha256Hex,
  validateKnowledgeFile,
  type ExtractedPage,
} from '../_shared/supportKnowledgeIngestion.ts';
import {
  SUPPORT_KNOWLEDGE_QUALITY_VERSION,
  assessKnowledgeQuality,
  canonicalTopicKey,
  compareKnowledgeDocuments,
} from '../_shared/supportKnowledgeQuality.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ServiceClient = ReturnType<typeof createClient>;
type RunReason = 'UPLOAD' | 'REPROCESS' | 'RECHUNK';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function publicError(reason: unknown): { code: string; message: string } {
  const code = reason instanceof Error ? reason.message : String(reason);
  const known: Record<string, string> = {
    INVALID_FILE: 'The selected file is invalid.',
    UNSUPPORTED_FORMAT: 'Only PDF and plain-text files are supported.',
    EMPTY_CONTENT: 'The selected source contains no usable content.',
    DUPLICATE_SOURCE: 'A possible duplicate source already exists.',
    OCR_REQUIRED: 'The PDF contains too little text and requires OCR before ingestion.',
    STORAGE_ERROR: 'The private source file could not be stored.',
  };
  return { code: known[code] ? code : 'OTHER', message: known[code] || 'Knowledge processing failed.' };
}

async function resolveActor(service: ServiceClient, authUser: { id: string; email?: string | null }): Promise<string | null> {
  const byAuth = await service.from('app_users').select('id').eq('auth_user_id', authUser.id).maybeSingle();
  if (byAuth.data?.id) return byAuth.data.id as string;
  if (!authUser.email) return null;
  const byEmail = await service.from('app_users').select('id').ilike('email', authUser.email).maybeSingle();
  return (byEmail.data?.id as string | undefined) || null;
}

async function authorize(request: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) throw new Error('UNAUTHORIZED');
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error('UNAUTHORIZED');
  const { data: allowed, error: accessError } = await userClient.rpc('can_access_support');
  if (accessError || allowed !== true) throw new Error('FORBIDDEN');
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { service, actorId: await resolveActor(service, authData.user) };
}

async function extractPages(bytes: Uint8Array, mimeType: string): Promise<{ pages: ExtractedPage[]; method: string }> {
  if (mimeType === 'text/plain') {
    const text = normalizeExtractedText(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!text) throw new Error('EMPTY_CONTENT');
    return { pages: [{ page: 1, text }], method: 'UTF8_TEXT' };
  }
  const pdf = await getDocumentProxy(bytes, { isEvalSupported: false, stopAtErrors: false });
  if (pdf.numPages > 500) throw new Error('INVALID_FILE');
  const extracted = await extractText(pdf, { mergePages: false });
  const pageText = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  const pages = pageText.map((text, index) => ({ page: index + 1, text: normalizeExtractedText(text) }));
  const characters = pages.reduce((total, page) => total + page.text.length, 0);
  if (characters < Math.max(40, pages.length * 12)) throw new Error('OCR_REQUIRED');
  return { pages, method: 'UNPDF_1_4_0' };
}

async function recordEvent(service: ServiceClient, values: Record<string, unknown>) {
  await service.from('support_ingestion_events').insert(values);
}

async function processRun(service: ServiceClient, sourceId: string, runId: string, actorId: string | null, reason: RunReason, governanceJobId?: string | null) {
  const started = Date.now();
  try {
    await service.from('support_ingestion_runs').update({ status: 'PROCESSING', started_at: new Date().toISOString() }).eq('id', runId);
    await service.from('support_knowledge_sources').update({ ingestion_status: 'PROCESSING' }).eq('id', sourceId);
    const { data: source, error: sourceError } = await service
      .from('support_knowledge_sources')
      .select('*, knowledge_item:support_knowledge_items(*)')
      .eq('id', sourceId)
      .single();
    if (sourceError || !source?.storage_path || !source?.knowledge_item) throw new Error('STORAGE_ERROR');
    const { data: stored, error: downloadError } = await service.storage.from(SUPPORT_KNOWLEDGE_BUCKET).download(source.storage_path);
    if (downloadError || !stored) throw new Error('STORAGE_ERROR');
    const bytes = new Uint8Array(await stored.arrayBuffer());
    const { pages, method } = await extractPages(bytes, source.mime_type);
    const normalized = normalizeExtractedText(pages.map((page) => page.text).join('\n\n'));
    if (!normalized) throw new Error('EMPTY_CONTENT');
    const normalizedHash = await sha256Hex(normalized);
    const sections = detectKnowledgeSections(pages);
    const item = source.knowledge_item;
    const { data: exactDuplicate } = await service.from('support_knowledge_sources')
      .select('id,knowledge_item_id,revision,source_language,lifecycle_status')
      .eq('normalized_content_hash', normalizedHash).neq('id', source.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    let nearDuplicate: { sourceId: string; score: number; methods: string[]; matchingHeadings: string[] } | null = null;
    if (!exactDuplicate) {
      const { data: corpus } = await service.from('support_ingestion_runs')
        .select('extracted_text,detected_sections,source:support_knowledge_sources!inner(id,knowledge_item_id,source_language,lifecycle_status,topic_key)')
        .eq('status', 'READY_FOR_REVIEW').not('extracted_text', 'is', null)
        .limit(500);
      for (const row of (corpus || []) as Array<Record<string, unknown>>) {
        const candidate = row.source as Record<string, unknown> | null;
        if (!candidate?.id || candidate.id === source.id || candidate.source_language !== source.source_language) continue;
        const similarity = compareKnowledgeDocuments({
          id: source.id, text: normalized, title: item.title, language: source.source_language,
          topicKey: canonicalTopicKey('', item.category || '', item.keywords || []),
        }, {
          id: String(candidate.id), text: String(row.extracted_text || ''),
          headings: ((row.detected_sections || []) as Array<{ heading?: string }>).map((entry) => entry.heading || '').filter(Boolean),
          language: String(candidate.source_language || ''), topicKey: candidate.topic_key ? String(candidate.topic_key) : null,
        });
        if (similarity.score >= 0.78 && (!nearDuplicate || similarity.score > nearDuplicate.score)) {
          nearDuplicate = { sourceId: String(candidate.id), score: similarity.score, methods: similarity.methods, matchingHeadings: similarity.matchingHeadings };
        }
      }
    }
    const quality = assessKnowledgeQuality({
      text: normalized,
      language: source.source_language,
      duplicate: !!exactDuplicate,
      nearDuplicate: !!nearDuplicate,
    });
    const reviewable = quality.status === 'READY_FOR_REVIEW' || quality.status === 'NEAR_DUPLICATE';
    const chunks = reviewable ? chunkKnowledgePages(pages) : [];
    if (!reviewable) {
      await service.from('support_knowledge_sources').update({
        normalized_content_hash: normalizedHash,
        content_equivalent_source_id: exactDuplicate?.id || null,
        duplicate_of_source_id: exactDuplicate?.id || null,
        ingestion_status: 'FAILED',
        quality_status: quality.status,
        quality_score: quality.score,
        quality_reasons: quality.reasons,
      }).eq('id', sourceId);
      await service.from('support_ingestion_runs').update({
        status: 'FAILED', completed_at: new Date().toISOString(), extraction_method: method,
        page_count: pages.length, extracted_character_count: normalized.length, chunk_count: 0,
        extracted_text: normalized, detected_sections: sections, warnings: quality.reasons,
        error_code: quality.status, error_message_sanitized: 'Content did not pass the Knowledge Quality gate.',
      }).eq('id', runId);
      await service.from('support_knowledge_quality_assessments').upsert({
        knowledge_source_id: sourceId, ingestion_run_id: runId,
        assessment_version: SUPPORT_KNOWLEDGE_QUALITY_VERSION, status: quality.status,
        score: quality.score, reasons: quality.reasons,
        markup_residue_count: quality.markupResidueCount,
        meaningful_character_count: quality.meaningfulCharacterCount,
        normalized_content_hash: normalizedHash, source_type: source.source_type,
        language: source.source_language,
      }, { onConflict: 'knowledge_source_id,assessment_version' });
      await recordEvent(service, {
        knowledge_source_id: sourceId, ingestion_run_id: runId, event_type: 'PROCESSING_FAILED',
        source_type: source.source_type, duration_ms: Date.now() - started,
        error_code: quality.status, actor_user_id: actorId,
      });
      if (governanceJobId) await service.from('support_knowledge_governance_jobs').update({
        status: 'FAILED', completed_at: new Date().toISOString(), error_code: quality.status,
      }).eq('id', governanceJobId);
      return;
    }

    const chunkRows = [];
    for (const chunk of chunks) {
      chunkRows.push({
        knowledge_item_id: source.knowledge_item_id,
        knowledge_source_id: source.id,
        ingestion_run_id: runId,
        source_revision: source.revision,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        content_hash: await sha256Hex(chunk.content),
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        heading: chunk.heading,
        section_path: chunk.sectionPath,
        language: source.source_language,
        category_snapshot: item.category,
        access_scope_snapshot: item.access_scope,
        required_area_snapshot: item.required_area,
        required_module_snapshot: item.required_module,
      });
    }
    if (chunkRows.length) {
      const { error: chunkError } = await service.from('support_knowledge_chunks').insert(chunkRows);
      if (chunkError) throw chunkError;
    }
    await service.from('support_knowledge_sources').update({
      normalized_content_hash: normalizedHash,
      content_equivalent_source_id: exactDuplicate?.id || null,
      ingestion_status: 'READY_FOR_REVIEW',
      quality_status: quality.status,
      quality_score: quality.score,
      quality_reasons: quality.reasons,
    }).eq('id', sourceId);
    await service.from('support_ingestion_runs').update({
      status: 'READY_FOR_REVIEW',
      completed_at: new Date().toISOString(),
      extraction_method: reason === 'RECHUNK' ? `${method}_RECHUNK` : method,
      page_count: pages.length,
      extracted_character_count: normalized.length,
      chunk_count: chunkRows.length,
      extracted_text: normalized,
      detected_sections: sections,
      warnings: quality.reasons,
    }).eq('id', runId);
    await service.from('support_knowledge_quality_assessments').upsert({
      knowledge_source_id: sourceId, ingestion_run_id: runId,
      assessment_version: SUPPORT_KNOWLEDGE_QUALITY_VERSION, status: quality.status,
      score: quality.score, reasons: quality.reasons,
      markup_residue_count: quality.markupResidueCount,
      meaningful_character_count: quality.meaningfulCharacterCount,
      normalized_content_hash: normalizedHash, source_type: source.source_type,
      language: source.source_language,
    }, { onConflict: 'knowledge_source_id,assessment_version' });
    if (nearDuplicate) {
      const pair = [sourceId, nearDuplicate.sourceId].sort();
      await service.from('support_knowledge_duplicate_clusters').upsert({
        cluster_key: `${pair[0]}:${pair[1]}`, source_a_id: pair[0], source_b_id: pair[1],
        language: source.source_language, similarity_score: nearDuplicate.score,
        detection_methods: nearDuplicate.methods, matching_headings: nearDuplicate.matchingHeadings,
      }, { onConflict: 'cluster_key' });
    }
    const { data: priorIndexState } = await service.from('support_knowledge_index_states')
      .select('status').eq('knowledge_source_id', sourceId).maybeSingle();
    const indexWasBuilt = priorIndexState?.status === 'INDEXED' || priorIndexState?.status === 'INDEXING';
    await service.from('support_knowledge_index_states').upsert({
      knowledge_source_id: sourceId,
      ingestion_run_id: runId,
      status: indexWasBuilt ? 'STALE' : 'NOT_INDEXED',
      status_reason: indexWasBuilt ? 'SOURCE_REPROCESSED' : null,
    }, { onConflict: 'knowledge_source_id' });
    await recordEvent(service, {
      knowledge_source_id: sourceId, ingestion_run_id: runId, event_type: 'PROCESSING_SUCCEEDED',
      source_type: source.source_type, duration_ms: Date.now() - started, page_count: pages.length,
      character_count: normalized.length, chunk_count: chunkRows.length, actor_user_id: actorId,
    });
    if (governanceJobId) await service.from('support_knowledge_governance_jobs').update({
      status: 'COMPLETED', completed_at: new Date().toISOString(), error_code: null,
    }).eq('id', governanceJobId);
  } catch (reason) {
    const safe = publicError(reason);
    await service.from('support_ingestion_runs').update({
      status: 'FAILED', completed_at: new Date().toISOString(), error_code: safe.code,
      error_message_sanitized: safe.message,
    }).eq('id', runId);
    await service.from('support_knowledge_sources').update({ ingestion_status: 'FAILED' }).eq('id', sourceId);
    await recordEvent(service, {
      knowledge_source_id: sourceId, ingestion_run_id: runId, event_type: 'PROCESSING_FAILED',
      duration_ms: Date.now() - started, error_code: safe.code, actor_user_id: actorId,
    });
    if (governanceJobId) await service.from('support_knowledge_governance_jobs').update({
      status: 'FAILED', completed_at: new Date().toISOString(), error_code: safe.code,
    }).eq('id', governanceJobId);
  }
}

async function createRun(service: ServiceClient, sourceId: string, actorId: string | null, reason: RunReason): Promise<string> {
  const { data, error } = await service.from('support_ingestion_runs').insert({
    knowledge_source_id: sourceId,
    status: 'QUEUED',
    run_reason: reason,
    processor_version: SUPPORT_PROCESSOR_VERSION,
    processor_config: { target_words: SUPPORT_CHUNK_TARGET_WORDS, overlap_words: SUPPORT_CHUNK_OVERLAP_WORDS },
    created_by: actorId,
  }).select('id').single();
  if (error || !data) throw error || new Error('OTHER');
  await service.from('support_knowledge_sources').update({ ingestion_status: 'QUEUED' }).eq('id', sourceId);
  return data.id as string;
}

async function upload(request: Request, service: ServiceClient, actorId: string | null): Promise<Response> {
  const form = await request.formData();
  const file = form.get('file');
  const knowledgeItemId = String(form.get('knowledge_item_id') || '');
  const sourceLanguage = String(form.get('source_language') || 'da').toLowerCase();
  const duplicateDecision = String(form.get('duplicate_decision') || '');
  if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(knowledgeItemId)) return response({ error: 'INVALID_FILE' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let validated;
  try { validated = validateKnowledgeFile(file.name, file.type, bytes); }
  catch (reason) { const safe = publicError(reason); return response({ error: safe.code, message: safe.message }, 400); }
  const rawHash = await sha256Hex(bytes);
  const { data: duplicate } = await service.from('support_knowledge_sources')
    .select('id,knowledge_item_id,revision,lifecycle_status,knowledge_item:support_knowledge_items(title)')
    .eq('raw_sha256', rawHash).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (duplicate && duplicateDecision !== 'CONTINUE_DISTINCT' && duplicateDecision !== 'NEW_REVISION') {
    return response({
      error: 'DUPLICATE_SOURCE', message: 'Mulig dublet fundet',
      duplicate_source_id: duplicate.id, existing_knowledge_item_id: duplicate.knowledge_item_id,
      existing_knowledge_item_title: duplicate.knowledge_item?.title || null,
      revision: duplicate.revision, current_status: duplicate.lifecycle_status, similarity: 1,
    }, 409);
  }
  if (duplicate && duplicate.knowledge_item_id === knowledgeItemId) {
    return response({ error: 'DUPLICATE_SOURCE', message: 'Unchanged content already exists for this canonical Knowledge Item.', duplicate_source_id: duplicate.id, revision: duplicate.revision }, 409);
  }
  const { data: item } = await service.from('support_knowledge_items').select('id').eq('id', knowledgeItemId).maybeSingle();
  if (!item) return response({ error: 'INVALID_KNOWLEDGE_ITEM' }, 404);
  const { data: latest } = await service.from('support_knowledge_sources')
    .select('id, revision').eq('knowledge_item_id', knowledgeItemId).order('revision', { ascending: false }).limit(1).maybeSingle();
  const revision = Number(latest?.revision || 0) + 1;
  const sourceId = crypto.randomUUID();
  const path = knowledgeStoragePath({ knowledgeItemId, sourceId, revision, filename: validated.sanitizedFilename });
  const { error: storageError } = await service.storage.from(SUPPORT_KNOWLEDGE_BUCKET)
    .upload(path, bytes, { contentType: validated.mimeType, upsert: false });
  if (storageError) return response({ error: 'STORAGE_ERROR' }, 500);
  const { error: sourceError } = await service.from('support_knowledge_sources').insert({
    id: sourceId,
    knowledge_item_id: knowledgeItemId,
    source_type: validated.kind === 'pdf' ? 'UPLOADED_PDF' : 'PLAIN_TEXT',
    revision,
    original_filename: validated.sanitizedFilename,
    storage_bucket: SUPPORT_KNOWLEDGE_BUCKET,
    storage_path: path,
    mime_type: validated.mimeType,
    file_size: bytes.byteLength,
    raw_sha256: rawHash,
    source_language: sourceLanguage,
    uploaded_by: actorId,
    supersedes_source_id: latest?.id || null,
    is_current: false,
    ingestion_status: 'RECEIVED',
  });
  if (sourceError) {
    await service.storage.from(SUPPORT_KNOWLEDGE_BUCKET).remove([path]);
    return response({ error: 'OTHER' }, 500);
  }
  const runId = await createRun(service, sourceId, actorId, 'UPLOAD');
  await recordEvent(service, { knowledge_source_id: sourceId, ingestion_run_id: runId, event_type: 'UPLOAD_RECEIVED', source_type: validated.kind, actor_user_id: actorId });
  EdgeRuntime.waitUntil(processRun(service, sourceId, runId, actorId, 'UPLOAD'));
  return response({ source_id: sourceId, ingestion_run_id: runId, revision, status: 'QUEUED' }, 202);
}

async function retry(request: Request, service: ServiceClient, actorId: string | null): Promise<Response> {
  const payload = await request.json() as { source_id?: string; action?: 'reprocess' | 'rechunk' };
  if (!payload.source_id || !['reprocess', 'rechunk'].includes(payload.action || '')) return response({ error: 'INVALID_REQUEST' }, 400);
  const { data: source } = await service.from('support_knowledge_sources')
    .select('id, knowledge_item_id, revision').eq('id', payload.source_id).maybeSingle();
  if (!source) return response({ error: 'SOURCE_NOT_FOUND' }, 404);
  const reason: RunReason = payload.action === 'rechunk' ? 'RECHUNK' : 'REPROCESS';
  const runId = await createRun(service, source.id, actorId, reason);
  const { data: governanceJob, error: governanceError } = await service.from('support_knowledge_governance_jobs').insert({
    knowledge_item_id: source.knowledge_item_id, knowledge_source_id: source.id,
    job_type: reason, status: 'RUNNING', requested_by_user_id: actorId,
    started_at: new Date().toISOString(),
  }).select('id').single();
  if (governanceError) throw governanceError;
  await service.from('support_knowledge_lifecycle_events').insert({
    knowledge_item_id: source.knowledge_item_id, knowledge_source_id: source.id,
    ingestion_run_id: runId,
    event_type: reason === 'RECHUNK' ? 'RECHUNK_REQUESTED' : 'REPROCESS_REQUESTED',
    actor_user_id: actorId, version_after: source.revision,
  });
  await recordEvent(service, { knowledge_source_id: source.id, ingestion_run_id: runId, event_type: reason, actor_user_id: actorId });
  EdgeRuntime.waitUntil(processRun(service, source.id, runId, actorId, reason, governanceJob.id));
  return response({ source_id: source.id, ingestion_run_id: runId, status: 'QUEUED' }, 202);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const { service, actorId } = await authorize(request);
    return request.headers.get('content-type')?.includes('multipart/form-data')
      ? await upload(request, service, actorId)
      : await retry(request, service, actorId);
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : 'OTHER';
    if (code === 'UNAUTHORIZED') return response({ error: code }, 401);
    if (code === 'FORBIDDEN') return response({ error: code }, 403);
    return response({ error: 'OTHER' }, 500);
  }
});
