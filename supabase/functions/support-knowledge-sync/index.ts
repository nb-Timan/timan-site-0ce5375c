import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
import { DOMParser } from 'npm:linkedom@0.18.12';
import {
  SUPPORT_CHUNK_OVERLAP_WORDS,
  SUPPORT_CHUNK_TARGET_WORDS,
  SUPPORT_PROCESSOR_VERSION,
  chunkKnowledgePages,
  normalizeExtractedText,
  sha256Hex,
} from '../_shared/supportKnowledgeIngestion.ts';
import {
  canonicalTimanUrl,
  timanLanguageFromUrl,
  timanPageCategory,
  timanProductRelations,
} from '../_shared/supportTimanKnowledge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-support-knowledge-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ServiceClient = ReturnType<typeof createClient>;
type WordpressRow = {
  id: number;
  link: string;
  modified: string;
  status: string;
  type: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
};
type DiscoveredPage = {
  canonicalUrl: string;
  title: string;
  content: string;
  language: string;
  category: string;
  productRelations: string[];
  modifiedAt: string | null;
  contentHash: string;
  pageType: string;
};
type KnowledgeSourceRow = {
  id: string;
  knowledge_item_id: string;
  revision: number;
  is_current: boolean;
  created_at: string;
  normalized_content_hash: string | null;
  lifecycle_status: string;
  source_type: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') {
    return reason.message;
  }
  return 'SYNC_FAILED';
}

function plainText(html: string): string {
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  if (!document) return '';
  for (const node of document.querySelectorAll('script,style,noscript,svg,form,iframe')) node.remove();
  for (const node of document.querySelectorAll('br,p,li,h1,h2,h3,h4,h5,h6,tr,th,td,caption,figcaption,dt,dd,blockquote,section')) node.append('\n');
  const text = document.querySelector('main')?.textContent || '';
  return normalizeExtractedText(text.replace(/\[\/?[a-z][^\]]*\]/gi, ' '));
}

async function resolveActor(service: ServiceClient, authUser: { id: string; email?: string | null }) {
  const byAuth = await service.from('app_users').select('id').eq('auth_user_id', authUser.id).maybeSingle();
  if (byAuth.data?.id) return byAuth.data.id as string;
  if (!authUser.email) return null;
  const byEmail = await service.from('app_users').select('id').ilike('email', authUser.email).maybeSingle();
  return (byEmail.data?.id as string | undefined) || null;
}

async function authorize(request: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) throw new Error('SERVER_CONFIGURATION');
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const schedulerSecret = request.headers.get('x-support-knowledge-sync-secret');
  if (schedulerSecret) {
    const { data, error } = await service.rpc('is_support_knowledge_sync_scheduler', { p_secret: schedulerSecret });
    if (error || data !== true) throw new Error('UNAUTHORIZED');
    return { service, actorId: null, triggerType: 'SCHEDULED' as const };
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new Error('UNAUTHORIZED');
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const [{ data: authData, error: authError }, { data: allowed, error: accessError }] = await Promise.all([
    userClient.auth.getUser(),
    userClient.rpc('can_access_support'),
  ]);
  if (authError || !authData.user) throw new Error('UNAUTHORIZED');
  if (accessError || allowed !== true) throw new Error('FORBIDDEN');
  return { service, actorId: await resolveActor(service, authData.user), triggerType: 'MANUAL' as const };
}

function wordpressUrl(language: string, pageType: string, probe: boolean) {
  const endpoint = pageType === 'posts' ? 'posts' : 'pages';
  const url = new URL(`https://timan.dk/wp-json/wp/v2/${endpoint}`);
  url.searchParams.set('per_page', probe ? '1' : '100');
  url.searchParams.set('page', '1');
  url.searchParams.set('lang', language);
  url.searchParams.set('_fields', probe ? 'link' : 'id,link,modified,status,type,title,content,excerpt');
  return url;
}

async function fetchWordpressJson(url: URL): Promise<WordpressRow[]> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TimanPortalKnowledgeSync/1.0 (+https://timan.dk)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`TIMAN_FETCH_${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows as WordpressRow[] : [];
}

async function fetchWordpressRows(language: string, pageType: string): Promise<WordpressRow[]> {
  const probe = await fetchWordpressJson(wordpressUrl(language, pageType, true));
  const firstCanonicalUrl = probe[0]?.link ? canonicalTimanUrl(probe[0].link) : null;
  if (firstCanonicalUrl && timanLanguageFromUrl(firstCanonicalUrl) !== language) return [];
  return fetchWordpressJson(wordpressUrl(language, pageType, false));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function discoverPages(languages: string[], pageTypes: string[], maxPages: number) {
  const tasks = languages.flatMap((language) => pageTypes.map((pageType) => ({ language, pageType })));
  const feeds = await mapWithConcurrency(tasks, 3, async ({ language, pageType }) => ({
    language,
    pageType,
    rows: await fetchWordpressRows(language, pageType),
  }));
  const discovered = new Map<string, DiscoveredPage>();
  for (const feed of feeds) {
    for (const row of feed.rows) {
      if (row.status !== 'publish') continue;
      const canonicalUrl = canonicalTimanUrl(row.link);
      if (!canonicalUrl) continue;
      const language = timanLanguageFromUrl(canonicalUrl);
      if (language !== feed.language) continue;
      const title = plainText(row.title?.rendered || '').slice(0, 500);
      const body = plainText(row.content?.rendered || row.excerpt?.rendered || '');
      const content = normalizeExtractedText([title, body].filter(Boolean).join('\n\n')).slice(0, 150_000);
      if (!title || content.length < 80) continue;
      const key = `${language}:${canonicalUrl}`;
      discovered.set(key, {
        canonicalUrl,
        title,
        content,
        language,
        category: timanPageCategory(canonicalUrl),
        productRelations: timanProductRelations(`${canonicalUrl} ${title} ${content.slice(0, 4000)}`),
        modifiedAt: row.modified ? new Date(row.modified).toISOString() : null,
        contentHash: await sha256Hex(content),
        pageType: row.type || feed.pageType,
      });
      if (discovered.size >= maxPages) return { pages: [...discovered.values()], feeds };
    }
  }
  return { pages: [...discovered.values()], feeds };
}

async function runSync(service: ServiceClient, actorId: string | null, triggerType: 'MANUAL' | 'SCHEDULED') {
  const { data: config, error: configError } = await service.from('support_knowledge_sync_config').select('*').eq('id', true).single();
  if (configError || !config?.sync_enabled) throw new Error('SYNC_DISABLED');
  const { data: run, error: runError } = await service.from('support_knowledge_sync_runs').insert({
    trigger_type: triggerType,
    requested_by_user_id: actorId,
    status: 'RUNNING',
  }).select('id').single();
  if (runError || !run) throw runError || new Error('RUN_CREATE_FAILED');
  await service.from('support_knowledge_sync_config').update({ last_started_at: new Date().toISOString() }).eq('id', true);

  try {
    const enabledLanguages = config.enabled_languages as string[];
    const priorityLanguages = config.priority_languages as string[];
    const secondaryLanguages = enabledLanguages.filter((language) => !priorityLanguages.includes(language));
    const cadenceMs = Number(config.secondary_language_cadence_days || 7) * 86_400_000;
    const secondaryDue = triggerType === 'MANUAL'
      || !config.last_secondary_sync_at
      || Date.now() - new Date(config.last_secondary_sync_at).getTime() >= cadenceMs;
    const effectiveLanguages = secondaryDue ? enabledLanguages : priorityLanguages;
    const effectiveLanguageSet = new Set(effectiveLanguages);
    const { pages, feeds } = await discoverPages(effectiveLanguages, config.wordpress_page_types, config.max_pages_per_run);
    const [{ data: registryRows, error: registryError }, { data: sourceRows, error: sourceError }] = await Promise.all([
      service.from('support_controlled_source_registry').select('*').eq('domain', 'timan.dk'),
      service.from('support_knowledge_sources')
        .select('id,knowledge_item_id,revision,is_current,created_at,normalized_content_hash,lifecycle_status,source_type')
        .order('revision', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    if (registryError || sourceError) throw registryError || sourceError;
    const registryByKey = new Map((registryRows || []).map((row) => [`${row.language}:${row.canonical_url}`, row]));
    const latestSourceByItem = new Map<string, KnowledgeSourceRow>();
    for (const source of (sourceRows || []) as KnowledgeSourceRow[]) {
      if (!latestSourceByItem.has(source.knowledge_item_id)) latestSourceByItem.set(source.knowledge_item_id, source);
    }

    const itemInserts: Record<string, unknown>[] = [];
    const sourceInserts: Record<string, unknown>[] = [];
    const runInserts: Record<string, unknown>[] = [];
    const chunkInserts: Record<string, unknown>[] = [];
    const indexInserts: Record<string, unknown>[] = [];
    const registryUpserts: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    const now = new Date().toISOString();
    let createdCount = 0;
    let changedCount = 0;
    let unchangedCount = 0;
    const languageCounts: Record<string, number> = {};

    for (const page of pages) {
      const key = `${page.language}:${page.canonicalUrl}`;
      seen.add(key);
      languageCounts[page.language] = (languageCounts[page.language] || 0) + 1;
      const existing = registryByKey.get(key);
      const unchanged = existing?.normalized_content_hash === page.contentHash;
      if (unchanged) {
        unchangedCount += 1;
        registryUpserts.push({
          id: existing.id,
          knowledge_item_id: existing.knowledge_item_id,
          canonical_url: page.canonicalUrl,
          domain: 'timan.dk',
          language: page.language,
          page_type: page.pageType,
          title: page.title,
          category: page.category,
          product_relations: page.productRelations,
          fetched_at: now,
          last_seen_at: now,
          changed_at: existing.changed_at,
          previous_content_hash: existing.previous_content_hash,
          normalized_content_hash: existing.normalized_content_hash,
          approval_state: existing.approval_state,
          last_http_status: 200,
          source_state: existing.source_state === 'CHANGED' && existing.approval_state === 'REVIEW'
            ? 'CHANGED'
            : 'ACTIVE',
          discovery_method: 'WORDPRESS_REST',
          etag: existing.etag,
          last_modified: existing.last_modified,
        });
        continue;
      }

      const knowledgeItemId = existing?.knowledge_item_id || crypto.randomUUID();
      const latest = latestSourceByItem.get(knowledgeItemId);
      const reusableReviewSource = latest?.source_type === 'TIMAN_DK_REGISTRY'
        && latest.lifecycle_status === 'REVIEW'
        && latest.normalized_content_hash === page.contentHash;
      if (existing && reusableReviewSource) {
        changedCount += 1;
        registryUpserts.push({
          id: existing.id,
          knowledge_item_id: knowledgeItemId,
          canonical_url: page.canonicalUrl,
          domain: 'timan.dk',
          language: page.language,
          page_type: page.pageType,
          title: page.title,
          category: page.category,
          product_relations: page.productRelations,
          fetched_at: now,
          last_seen_at: now,
          changed_at: now,
          previous_content_hash: existing.normalized_content_hash,
          normalized_content_hash: page.contentHash,
          approval_state: 'REVIEW',
          source_state: 'CHANGED',
          last_http_status: 200,
          discovery_method: 'WORDPRESS_REST',
          etag: existing.etag,
          last_modified: existing.last_modified,
        });
        continue;
      }
      const revision = Number(latest?.revision || 0) + 1;
      const sourceId = crypto.randomUUID();
      const ingestionRunId = crypto.randomUUID();
      const chunks = chunkKnowledgePages([{ page: 1, text: page.content }]);
      if (!existing) {
        createdCount += 1;
        itemInserts.push({
          id: knowledgeItemId,
          title: page.title,
          knowledge_type: 'TIMAN_DK_PAGE',
          content: page.content,
          summary: page.content.slice(0, 500),
          category: page.category,
          keywords: page.productRelations,
          source_reference: page.canonicalUrl,
          language: page.language,
          status: 'REVIEW',
          access_scope: 'PORTAL',
          version_number: 1,
          source_version: page.modifiedAt,
          content_hash: page.contentHash,
          source_family_key: `timan-dk:${page.canonicalUrl}`,
          created_by_user_id: actorId,
        });
      } else {
        changedCount += 1;
      }
      sourceInserts.push({
        id: sourceId,
        knowledge_item_id: knowledgeItemId,
        source_type: 'TIMAN_DK_REGISTRY',
        revision,
        original_url: page.canonicalUrl,
        mime_type: 'text/html',
        raw_sha256: page.contentHash,
        normalized_content_hash: page.contentHash,
        source_language: page.language,
        source_updated_at: page.modifiedAt,
        uploaded_by: actorId,
        supersedes_source_id: latest?.id || null,
        is_current: false,
        ingestion_status: 'READY_FOR_REVIEW',
        lifecycle_status: 'REVIEW',
        reviewed_by_user_id: actorId,
        reviewed_at: now,
      });
      runInserts.push({
        id: ingestionRunId,
        knowledge_source_id: sourceId,
        status: 'READY_FOR_REVIEW',
        run_reason: 'TIMAN_DK_SYNC',
        processor_version: SUPPORT_PROCESSOR_VERSION,
        processor_config: { target_words: SUPPORT_CHUNK_TARGET_WORDS, overlap_words: SUPPORT_CHUNK_OVERLAP_WORDS, source: 'WORDPRESS_REST' },
        started_at: now,
        completed_at: now,
        extraction_method: 'WORDPRESS_REST_RENDERED_HTML',
        page_count: 1,
        extracted_character_count: page.content.length,
        chunk_count: chunks.length,
        extracted_text: page.content,
        detected_sections: [],
        created_by: actorId,
      });
      for (const chunk of chunks) {
        chunkInserts.push({
          id: crypto.randomUUID(),
          knowledge_item_id: knowledgeItemId,
          knowledge_source_id: sourceId,
          ingestion_run_id: ingestionRunId,
          source_revision: revision,
          chunk_index: chunk.chunkIndex,
          content: chunk.content,
          content_hash: await sha256Hex(chunk.content),
          page_start: chunk.pageStart,
          page_end: chunk.pageEnd,
          heading: chunk.heading,
          section_path: chunk.sectionPath,
          language: page.language,
          category_snapshot: page.category,
          access_scope_snapshot: 'PORTAL',
        });
      }
      indexInserts.push({
        knowledge_source_id: sourceId,
        ingestion_run_id: ingestionRunId,
        status: 'NOT_INDEXED',
        status_reason: 'AWAITING_BACKEND_APPROVAL',
        processor_version: SUPPORT_PROCESSOR_VERSION,
        indexed_content_hash: null,
      });
      registryUpserts.push({
        id: existing?.id || crypto.randomUUID(),
        knowledge_item_id: knowledgeItemId,
        canonical_url: page.canonicalUrl,
        domain: 'timan.dk',
        language: page.language,
        page_type: page.pageType,
        title: page.title,
        category: page.category,
        product_relations: page.productRelations,
        fetched_at: now,
        last_seen_at: now,
        changed_at: now,
        previous_content_hash: existing?.normalized_content_hash || null,
        normalized_content_hash: page.contentHash,
        approval_state: 'REVIEW',
        source_state: existing ? 'CHANGED' : 'ACTIVE',
        last_http_status: 200,
        discovery_method: 'WORDPRESS_REST',
      });
    }

    const missingRows = (registryRows || []).filter((row) => effectiveLanguageSet.has(row.language)
      && row.discovery_method === 'WORDPRESS_REST'
      && !seen.has(`${row.language}:${row.canonical_url}`));
    const missingSourceIds = missingRows.flatMap((row) => {
      const source = latestSourceByItem.get(row.knowledge_item_id);
      return source?.id ? [source.id] : [];
    });

    if (itemInserts.length) { const { error } = await service.from('support_knowledge_items').insert(itemInserts); if (error) throw error; }
    if (sourceInserts.length) { const { error } = await service.from('support_knowledge_sources').insert(sourceInserts); if (error) throw error; }
    if (runInserts.length) { const { error } = await service.from('support_ingestion_runs').insert(runInserts); if (error) throw error; }
    if (chunkInserts.length) { const { error } = await service.from('support_knowledge_chunks').insert(chunkInserts); if (error) throw error; }
    if (indexInserts.length) { const { error } = await service.from('support_knowledge_index_states').insert(indexInserts); if (error) throw error; }
    if (registryUpserts.length) {
      const { error } = await service.from('support_controlled_source_registry').upsert(registryUpserts, { onConflict: 'canonical_url,language' });
      if (error) throw error;
    }
    if (missingRows.length) {
      const { error } = await service.from('support_controlled_source_registry').update({
        source_state: 'MISSING',
        last_http_status: 404,
        changed_at: now,
      }).in('id', missingRows.map((row) => row.id));
      if (error) throw error;
    }
    if (missingSourceIds.length) {
      const { error } = await service.from('support_knowledge_sources').update({
        stale_states: ['CONTENT_STALE'],
        stale_reason: 'TIMAN_DK_SOURCE_MISSING',
      }).in('id', missingSourceIds);
      if (error) throw error;
    }

    const summary = {
      discovered_count: pages.length,
      created_count: createdCount,
      changed_count: changedCount,
      unchanged_count: unchangedCount,
      missing_count: missingRows.length,
      failed_count: 0,
      language_counts: languageCounts,
      discovery_metadata: {
        method: 'WORDPRESS_REST',
        canonical_sitemap: 'https://timan.dk/wp-sitemap.xml',
        feed_count: feeds.length,
        configured_languages: config.enabled_languages,
        effective_languages: effectiveLanguages,
        secondary_language_cadence_days: Number(config.secondary_language_cadence_days || 7),
        auto_promotion_enabled: false,
      },
      status: 'COMPLETED',
      completed_at: now,
    };
    await service.from('support_knowledge_sync_runs').update(summary).eq('id', run.id);
    await service.from('support_knowledge_sync_config').update({
      last_completed_at: now,
      ...(secondaryDue && secondaryLanguages.length ? { last_secondary_sync_at: now } : {}),
    }).eq('id', true);
    return { run_id: run.id, ...summary };
  } catch (reason) {
    const code = errorMessage(reason).slice(0, 200);
    await service.from('support_knowledge_sync_runs').update({
      status: 'FAILED',
      failed_count: 1,
      error_code: code,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    throw reason;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const payload = await request.json().catch(() => ({}));
    if (payload.action !== 'sync') return json({ error: 'INVALID_REQUEST' }, 400);
    const { service, actorId, triggerType } = await authorize(request);
    return json(await runSync(service, actorId, triggerType));
  } catch (reason) {
    const code = errorMessage(reason);
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'FORBIDDEN') return json({ error: code }, 403);
    return json({ error: 'SYNC_FAILED', message: code }, 500);
  }
});
