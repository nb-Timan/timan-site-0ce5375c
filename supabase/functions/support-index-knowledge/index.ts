import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
import { createEmbedding } from '../_shared/supportAssistantProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ServiceClient = ReturnType<typeof createClient>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function authorize(request: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) throw new Error('UNAUTHORIZED');
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error('UNAUTHORIZED');
  const { data: allowed, error: accessError } = await userClient.rpc('can_access_support');
  if (accessError || allowed !== true) throw new Error('FORBIDDEN');
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor } = await service.from('app_users').select('id')
    .or(`auth_user_id.eq.${authData.user.id},email.ilike.${authData.user.email || ''}`)
    .eq('portal_role', 'timan_backend').eq('approved', true).eq('is_active', true).limit(1).single();
  if (!actor?.id) throw new Error('FORBIDDEN');
  return { service, actorId: actor.id as string };
}

async function effectivePrice(service: ServiceClient, provider: string, model: string, inputTokens: number | null) {
  if (inputTokens === null) return { estimated_cost: null, cost_currency: null };
  const { data } = await service.from('support_model_pricing').select('*')
    .eq('provider', provider).eq('model_name', model)
    .lte('effective_from', new Date().toISOString())
    .or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`)
    .order('effective_from', { ascending: false }).limit(1).maybeSingle();
  if (!data || data.input_per_million == null) return { estimated_cost: null, cost_currency: null };
  return {
    estimated_cost: (inputTokens / 1_000_000) * Number(data.input_per_million),
    cost_currency: data.currency,
  };
}

async function updateSourceState(service: ServiceClient, sourceId: string, runId: string, model: Record<string, unknown>) {
  const [{ count: total }, { count: indexed }, { count: failed }] = await Promise.all([
    service.from('support_knowledge_chunks').select('id', { head: true, count: 'exact' }).eq('knowledge_source_id', sourceId).eq('ingestion_run_id', runId),
    service.from('support_chunk_embeddings').select('id, chunk:support_knowledge_chunks!inner(knowledge_source_id, ingestion_run_id)', { head: true, count: 'exact' })
      .eq('status', 'INDEXED').eq('chunk.knowledge_source_id', sourceId).eq('chunk.ingestion_run_id', runId),
    service.from('support_chunk_embeddings').select('id, chunk:support_knowledge_chunks!inner(knowledge_source_id, ingestion_run_id)', { head: true, count: 'exact' })
      .eq('status', 'FAILED').eq('chunk.knowledge_source_id', sourceId).eq('chunk.ingestion_run_id', runId),
  ]);
  const status = total && indexed === total ? 'INDEXED' : failed ? 'FAILED' : 'INDEXING';
  await service.from('support_knowledge_index_states').update({
    ingestion_run_id: runId,
    status,
    status_reason: status === 'FAILED' ? 'ONE_OR_MORE_CHUNKS_FAILED' : null,
    indexed_at: status === 'INDEXED' ? new Date().toISOString() : null,
    embedding_model_id: model.id,
    embedding_model_name: model.model_name,
  }).eq('knowledge_source_id', sourceId);
  if (status === 'INDEXED') {
    await service.rpc('support_promote_indexed_source', {
      p_source_id: sourceId, p_embedding_model_id: model.id,
    });
  }
  return status;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const authorized = await authorize(request);
    const service = authorized.service;
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'PROVIDER_NOT_CONFIGURED' }, 503);
    const payload = await request.json().catch(() => ({})) as {
      source_id?: string;
      batch_size?: number;
      mode?: 'index' | 'reindex' | 'reembed';
    };
    const batchSize = Math.max(1, Math.min(20, Number(payload.batch_size || 10)));
    const mode = payload.mode || 'index';
    const { data: config, error: configError } = await service.from('support_ai_runtime_config').select('*').eq('id', true).single();
    if (configError || !config) return json({ error: 'RUNTIME_CONFIGURATION_ERROR' }, 500);
    if (!config.ai_enabled) return json({ error: 'AI_DISABLED' }, 503);
    const { data: modelRow } = await service.from('support_embedding_models').select('*')
      .eq('provider', config.primary_provider).eq('model_name', config.embedding_model).eq('enabled', true).single();
    if (!modelRow || modelRow.dimensions !== config.embedding_dimensions) return json({ error: 'EMBEDDING_CONFIGURATION_ERROR' }, 500);

    let sourceQuery = service.from('support_knowledge_sources').select(`
      id, knowledge_item_id, revision, is_current, ingestion_status, lifecycle_status,
      item:support_knowledge_items!inner(id, status),
      index_state:support_knowledge_index_states!inner(ingestion_run_id, status)
    `).eq('lifecycle_status', 'APPROVED').eq('ingestion_status', 'READY_FOR_REVIEW')
      .eq('item.status', 'APPROVED').in('index_state.status', ['NOT_INDEXED', 'QUEUED', 'STALE', 'FAILED', 'INDEXING', 'INDEXED']);
    if (payload.source_id) sourceQuery = sourceQuery.eq('id', payload.source_id);
    const { data: sources, error: sourceError } = await sourceQuery.limit(20);
    if (sourceError) throw sourceError;

    let governanceJobId: string | null = null;
    let governanceProcessedChunkIds = new Set<string>();
    if (payload.source_id && mode !== 'index') {
      const source = (sources || []).find((entry) => entry.id === payload.source_id);
      if (!source) return json({ error: 'SOURCE_NOT_ELIGIBLE' }, 409);
      const jobType = mode === 'reembed' ? 'REEMBED' : 'REINDEX';
      const { data: activeJob } = await service.from('support_knowledge_governance_jobs')
        .select('id, processed_chunk_ids').eq('knowledge_source_id', source.id)
        .eq('job_type', jobType).eq('status', 'RUNNING').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (activeJob) {
        governanceJobId = activeJob.id;
        governanceProcessedChunkIds = new Set(activeJob.processed_chunk_ids || []);
      } else {
        const { data: job, error: jobError } = await service.from('support_knowledge_governance_jobs').insert({
          knowledge_item_id: source.knowledge_item_id, knowledge_source_id: source.id,
          job_type: jobType, status: 'RUNNING', requested_by_user_id: authorized.actorId,
          embedding_model_id: modelRow.id, started_at: new Date().toISOString(),
        }).select('id').single();
        if (jobError) throw jobError;
        governanceJobId = job.id;
        await service.from('support_knowledge_lifecycle_events').insert({
          knowledge_item_id: source.knowledge_item_id, knowledge_source_id: source.id,
          event_type: mode === 'reembed' ? 'REEMBED_REQUESTED' : 'REINDEX_REQUESTED',
          actor_user_id: authorized.actorId, version_after: source.revision,
          metadata: { embedding_model: modelRow.model_name },
        });
        await service.from('support_knowledge_index_states').update({
          status: 'STALE', status_reason: mode === 'reembed' ? 'REEMBED_REQUESTED' : 'REINDEX_REQUESTED',
        }).eq('knowledge_source_id', source.id);
        const staleState = mode === 'reembed' ? 'EMBEDDING_STALE' : 'INDEX_STALE';
        const { data: sourceState } = await service.from('support_knowledge_sources').select('stale_states').eq('id', source.id).single();
        await service.from('support_knowledge_sources').update({
          stale_states: [...new Set([...(sourceState?.stale_states || []), staleState])],
          stale_reason: `${jobType}_REQUESTED`,
        }).eq('id', source.id);
      }
    }

    const jobs: Array<{ chunk: Record<string, unknown>; sourceId: string; runId: string }> = [];
    const touched = new Map<string, string>();
    for (const source of sources || []) {
      const state = Array.isArray(source.index_state) ? source.index_state[0] : source.index_state;
      if (!state?.ingestion_run_id) continue;
      if (state.status === 'INDEXED' && mode === 'index') {
        if (!source.is_current) {
          await service.rpc('support_promote_indexed_source', {
            p_source_id: source.id, p_embedding_model_id: modelRow.id,
          });
        }
        continue;
      }
      await service.from('support_knowledge_index_states').update({ status: 'INDEXING', status_reason: null })
        .eq('knowledge_source_id', source.id);
      touched.set(source.id, state.ingestion_run_id);
      const { data: chunks } = await service.from('support_knowledge_chunks').select('*')
        .eq('knowledge_source_id', source.id).eq('ingestion_run_id', state.ingestion_run_id)
        .order('chunk_index').limit(1000);
      const chunkIds = (chunks || []).map((chunk) => chunk.id);
      const { data: existing } = chunkIds.length
        ? await service.from('support_chunk_embeddings').select('chunk_id, content_hash, status')
          .in('chunk_id', chunkIds).eq('embedding_model_id', modelRow.id)
        : { data: [] };
      const indexed = new Map((existing || []).map((row) => [row.chunk_id, row]));
      for (const chunk of chunks || []) {
        if (governanceProcessedChunkIds.has(String(chunk.id))) continue;
        const current = indexed.get(chunk.id);
        if (mode === 'index' && current?.status === 'INDEXED' && current.content_hash === chunk.content_hash) continue;
        jobs.push({ chunk, sourceId: source.id, runId: state.ingestion_run_id });
        if (jobs.length >= batchSize) break;
      }
      if (jobs.length >= batchSize) break;
    }

    let completed = 0;
    let failed = 0;
    for (const job of jobs) {
      const chunkId = String(job.chunk.id);
      await service.from('support_chunk_embeddings').upsert({
        chunk_id: chunkId, embedding_model_id: modelRow.id,
        content_hash: job.chunk.content_hash, embedding: null,
        status: 'PROCESSING', error_code: null,
      }, { onConflict: 'chunk_id,embedding_model_id' });
      let lastError = 'EMBEDDING_ERROR';
      let embedded = false;
      for (let attempt = 0; attempt <= config.retry_count; attempt += 1) {
        try {
          const result = await createEmbedding(String(job.chunk.content), config.embedding_model, config.embedding_dimensions, {
            apiKey, timeoutMs: config.provider_timeout_ms, retryCount: 0,
          });
          if (Array.isArray(result)) throw new Error('INVALID_EMBEDDING_RESPONSE');
          await service.from('support_chunk_embeddings').update({
            embedding: JSON.stringify(result.embedding), status: 'INDEXED', error_code: null,
          }).eq('chunk_id', chunkId).eq('embedding_model_id', modelRow.id);
          const cost = await effectivePrice(service, result.provider, result.model, result.inputTokens);
          await service.from('support_usage_events').insert({
            category: 'KNOWLEDGE_INDEXING', model_name: result.model, provider: result.provider,
            provider_request_id: result.providerRequestId, request_status: 'SUCCESS',
            total_latency_ms: result.latencyMs, model_latency_ms: result.latencyMs,
            input_tokens: result.inputTokens, estimated_cost: cost.estimated_cost,
            cost_currency: cost.cost_currency, retry_count: attempt,
          });
          completed += 1;
          embedded = true;
          break;
        } catch (reason) {
          lastError = reason instanceof Error ? reason.message : 'EMBEDDING_ERROR';
        }
      }
      if (!embedded) {
        failed += 1;
        await service.from('support_chunk_embeddings').update({ status: 'FAILED', error_code: lastError })
          .eq('chunk_id', chunkId).eq('embedding_model_id', modelRow.id);
        await service.from('support_usage_events').insert({
          category: 'KNOWLEDGE_INDEXING', model_name: config.embedding_model,
          provider: config.primary_provider, request_status: 'FAILED', provider_error: true,
          error_category: lastError, retry_count: config.retry_count,
        });
      }
      governanceProcessedChunkIds.add(chunkId);
    }
    let finalStatus = 'INDEXED';
    for (const [sourceId, runId] of touched) finalStatus = await updateSourceState(service, sourceId, runId, modelRow);
    if (governanceJobId) {
      await service.from('support_knowledge_governance_jobs').update({
        status: failed > 0 || finalStatus === 'FAILED' ? 'FAILED' : jobs.length === batchSize ? 'RUNNING' : 'COMPLETED',
        error_code: failed > 0 ? 'ONE_OR_MORE_CHUNKS_FAILED' : null,
        completed_at: failed > 0 || jobs.length < batchSize ? new Date().toISOString() : null,
        processed_chunk_ids: [...governanceProcessedChunkIds],
      }).eq('id', governanceJobId);
    }
    return json({ processed: jobs.length, completed, failed, has_more: jobs.length === batchSize });
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : 'OTHER';
    return json({ error: code === 'FORBIDDEN' || code === 'UNAUTHORIZED' ? code : 'INDEXING_ERROR' }, code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : 500);
  }
});
