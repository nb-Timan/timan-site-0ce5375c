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
  SUPPORT_KNOWLEDGE_QUALITY_VERSION,
  assessKnowledgeQuality,
  canonicalTopicKey,
  cleanWordpressText,
  compareKnowledgeDocuments,
  detectKnowledgeFactConflicts,
  type KnowledgeQualityAssessment,
  type SimilarityDocument,
} from '../_shared/supportKnowledgeQuality.ts';
import {
  canonicalTimanUrl,
  timanLanguageFromUrl,
  timanPageCategory,
  timanProductRelations,
  timanTranslationLinksFromHtml,
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
  topicKey: string;
  quality: KnowledgeQualityAssessment;
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
  source_language: string;
  original_url: string | null;
  topic_key: string | null;
  authority_tier: number | null;
  quality_status: string | null;
};

type CorpusSource = SimilarityDocument & {
  sourceId: string;
  knowledgeItemId: string;
  lifecycleStatus: string;
  authorityTier: number;
  normalizedHash: string | null;
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
  return normalizeExtractedText(cleanWordpressText(text.replace(/\[\/?[a-z][^\]]*\]/gi, ' ')));
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

async function fetchTimanHead(canonicalUrl: string): Promise<string> {
  const response = await fetch(canonicalUrl, {
    headers: { Accept: 'text/html', 'User-Agent': 'TimanPortalKnowledgeSync/1.0 (+https://timan.dk)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  try {
    while (html.length < 120_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return html;
}

async function linkTranslationTopics(pages: DiscoveredPage[]) {
  const identityByUrl = new Map<string, string>();
  const applyLinks = (fallbackUrl: string, html: string) => {
    const links = timanTranslationLinksFromHtml(html, fallbackUrl);
    for (const url of links.alternateUrls) identityByUrl.set(url, links.identityUrl);
  };
  const primaryPages = pages.filter((page) => page.language === 'da');
  const primaryResults = await mapWithConcurrency(primaryPages, 6, async (page) => ({
    url: page.canonicalUrl,
    html: await fetchTimanHead(page.canonicalUrl).catch(() => ''),
  }));
  for (const result of primaryResults) applyLinks(result.url, result.html);
  const unlinked = pages.filter((page) => !identityByUrl.has(page.canonicalUrl));
  const fallbackResults = await mapWithConcurrency(unlinked, 6, async (page) => ({
    url: page.canonicalUrl,
    html: await fetchTimanHead(page.canonicalUrl).catch(() => ''),
  }));
  for (const result of fallbackResults) applyLinks(result.url, result.html);
  for (const page of pages) {
    const identityUrl = identityByUrl.get(page.canonicalUrl) || page.canonicalUrl;
    page.topicKey = canonicalTopicKey(identityUrl, timanPageCategory(identityUrl), page.productRelations);
  }
}

async function discoverPages(languages: string[], pageTypes: string[], maxPages: number) {
  const tasks = languages.flatMap((language) => pageTypes.map((pageType) => ({ language, pageType })));
  const feeds = await mapWithConcurrency(tasks, 3, async ({ language, pageType }) => ({
    language,
    pageType,
    rows: await fetchWordpressRows(language, pageType),
  }));
  const discovered = new Map<string, DiscoveredPage>();
  discovery: for (const feed of feeds) {
    for (const row of feed.rows) {
      if (row.status !== 'publish') continue;
      const canonicalUrl = canonicalTimanUrl(row.link);
      if (!canonicalUrl) continue;
      const language = timanLanguageFromUrl(canonicalUrl);
      if (language !== feed.language) continue;
      const title = plainText(row.title?.rendered || '').slice(0, 500);
      const body = plainText(row.content?.rendered || row.excerpt?.rendered || '');
      const content = normalizeExtractedText([title, body].filter(Boolean).join('\n\n')).slice(0, 150_000);
      if (!title) continue;
      const category = timanPageCategory(canonicalUrl);
      const productRelations = timanProductRelations(`${canonicalUrl} ${title} ${content.slice(0, 4000)}`);
      const topicKey = canonicalTopicKey(canonicalUrl, category, productRelations);
      const quality = assessKnowledgeQuality({ text: content, language, canonicalUrl });
      const key = `${language}:${canonicalUrl}`;
      discovered.set(key, {
        canonicalUrl,
        title,
        content,
        language,
        category,
        productRelations,
        modifiedAt: row.modified ? new Date(row.modified).toISOString() : null,
        contentHash: await sha256Hex(content),
        pageType: row.type || feed.pageType,
        topicKey,
        quality,
      });
      if (discovered.size >= maxPages) break discovery;
    }
  }
  const pages = [...discovered.values()];
  await linkTranslationTopics(pages);
  return { pages, feeds };
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
    const [
      { data: registryRows, error: registryError },
      { data: sourceRows, error: sourceError },
      { data: corpusRows, error: corpusError },
    ] = await Promise.all([
      service.from('support_controlled_source_registry').select('*').eq('domain', 'timan.dk'),
      service.from('support_knowledge_sources')
        .select('id,knowledge_item_id,revision,is_current,created_at,normalized_content_hash,lifecycle_status,source_type,source_language,original_url,topic_key,authority_tier,quality_status')
        .order('revision', { ascending: false })
        .order('created_at', { ascending: false }),
      service.from('support_ingestion_runs')
        .select('knowledge_source_id,extracted_text,detected_sections,created_at,source:support_knowledge_sources!inner(id,knowledge_item_id,source_language,original_url,topic_key,authority_tier,lifecycle_status,normalized_content_hash,knowledge_item:support_knowledge_items!inner(title,status))')
        .eq('status', 'READY_FOR_REVIEW')
        .not('extracted_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1500),
    ]);
    if (registryError || sourceError || corpusError) throw registryError || sourceError || corpusError;
    const registryByKey = new Map((registryRows || []).map((row) => [`${row.language}:${row.canonical_url}`, row]));
    const latestSourceByItem = new Map<string, KnowledgeSourceRow>();
    for (const source of (sourceRows || []) as KnowledgeSourceRow[]) {
      if (!latestSourceByItem.has(source.knowledge_item_id)) latestSourceByItem.set(source.knowledge_item_id, source);
    }
    const corpusBySource = new Map<string, CorpusSource>();
    for (const row of (corpusRows || []) as Array<Record<string, unknown>>) {
      const source = row.source as Record<string, unknown> | null;
      const item = source?.knowledge_item as Record<string, unknown> | null;
      const sourceId = String(source?.id || '');
      if (!sourceId || corpusBySource.has(sourceId)) continue;
      corpusBySource.set(sourceId, {
        id: sourceId,
        sourceId,
        knowledgeItemId: String(source?.knowledge_item_id || ''),
        text: String(row.extracted_text || ''),
        title: String(item?.title || ''),
        headings: ((row.detected_sections || []) as Array<{ heading?: string }>).map((entry) => entry.heading || '').filter(Boolean),
        language: String(source?.source_language || ''),
        canonicalUrl: source?.original_url ? String(source.original_url) : null,
        topicKey: source?.topic_key ? String(source.topic_key) : null,
        productRelations: [],
        lifecycleStatus: String(source?.lifecycle_status || ''),
        authorityTier: Number(source?.authority_tier || 4),
        normalizedHash: source?.normalized_content_hash ? String(source.normalized_content_hash) : null,
        similarityCacheKey: source?.normalized_content_hash ? String(source.normalized_content_hash) : sourceId,
      });
    }

    const itemInserts: Record<string, unknown>[] = [];
    const sourceInserts: Record<string, unknown>[] = [];
    const runInserts: Record<string, unknown>[] = [];
    const chunkInserts: Record<string, unknown>[] = [];
    const indexInserts: Record<string, unknown>[] = [];
    const registryUpserts: Record<string, unknown>[] = [];
    const qualityInserts: Record<string, unknown>[] = [];
    const topicUpserts: Record<string, unknown>[] = [];
    const topicVariantPending: Array<{ sourceId: string; knowledgeItemId: string; topicKey: string; language: string; canonicalUrl: string }> = [];
    const duplicateUpserts: Record<string, unknown>[] = [];
    const conflictUpserts: Record<string, unknown>[] = [];
    const qualityEventInserts: Record<string, unknown>[] = [];
    const sourceTopicUpdates: Array<{ sourceId: string; topicKey: string }> = [];
    const seen = new Set<string>();
    const now = new Date().toISOString();
    let createdCount = 0;
    let changedCount = 0;
    let unchangedCount = 0;
    let cleanCount = 0;
    let needsReviewCount = 0;
    let rejectedCount = 0;
    const languageCounts: Record<string, number> = {};

    for (const page of pages) {
      const key = `${page.language}:${page.canonicalUrl}`;
      seen.add(key);
      languageCounts[page.language] = (languageCounts[page.language] || 0) + 1;
      const existing = registryByKey.get(key);
      const knowledgeItemId = existing?.knowledge_item_id || crypto.randomUUID();
      const latest = latestSourceByItem.get(knowledgeItemId);
      const unchanged = existing?.normalized_content_hash === page.contentHash;
      if (unchanged) {
        unchangedCount += 1;
        const unchangedQuality = latest?.quality_status || page.quality.status;
        if (unchangedQuality === 'READY_FOR_REVIEW') cleanCount += 1;
        else if (unchangedQuality === 'NEAR_DUPLICATE') needsReviewCount += 1;
        else rejectedCount += 1;
        if (latest) {
          topicUpserts.push({ topic_key: page.topicKey, category: page.category, product_relations: page.productRelations });
          topicVariantPending.push({ sourceId: latest.id, knowledgeItemId, topicKey: page.topicKey, language: page.language, canonicalUrl: page.canonicalUrl });
          if (latest.topic_key !== page.topicKey) {
            sourceTopicUpdates.push({ sourceId: latest.id, topicKey: page.topicKey });
            qualityEventInserts.push({
              event_type: 'TOPIC_LINKED', knowledge_source_id: latest.id, actor_user_id: actorId,
              metadata: { previous_topic_key: latest.topic_key, topic_key: page.topicKey, method: 'TIMAN_HREFLANG' },
            });
          }
        }
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
      const exactDuplicate = [...corpusBySource.values()].find((candidate) => candidate.normalizedHash === page.contentHash
        && candidate.knowledgeItemId !== knowledgeItemId);
      let nearest: { source: CorpusSource; similarity: ReturnType<typeof compareKnowledgeDocuments> } | null = null;
      for (const candidate of corpusBySource.values()) {
        if (candidate.knowledgeItemId === knowledgeItemId || candidate.language !== page.language || exactDuplicate) continue;
        const similarity = compareKnowledgeDocuments({
          id: sourceId, text: page.content, title: page.title, language: page.language,
          canonicalUrl: page.canonicalUrl, topicKey: page.topicKey, productRelations: page.productRelations,
          similarityCacheKey: page.contentHash,
        }, candidate);
        if (!nearest || similarity.score > nearest.similarity.score) nearest = { source: candidate, similarity };
      }
      const isNearDuplicate = !!nearest && nearest.similarity.score >= 0.78;
      const quality = assessKnowledgeQuality({
        text: page.content,
        language: page.language,
        canonicalUrl: page.canonicalUrl,
        duplicate: !!exactDuplicate,
        nearDuplicate: isNearDuplicate,
      });
      const reviewable = quality.status === 'READY_FOR_REVIEW' || quality.status === 'NEAR_DUPLICATE';
      const chunks = reviewable ? chunkKnowledgePages([{ page: 1, text: page.content }]) : [];
      if (quality.status === 'READY_FOR_REVIEW') cleanCount += 1;
      else if (quality.status === 'NEAR_DUPLICATE') needsReviewCount += 1;
      else rejectedCount += 1;
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
          status: reviewable ? 'REVIEW' : 'DRAFT',
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
        ingestion_status: reviewable ? 'READY_FOR_REVIEW' : 'FAILED',
        ...(reviewable ? { lifecycle_status: 'REVIEW' } : { lifecycle_status: 'DRAFT' }),
        reviewed_by_user_id: reviewable ? actorId : null,
        reviewed_at: reviewable ? now : null,
        quality_status: quality.status,
        quality_score: quality.score,
        quality_reasons: quality.reasons,
        topic_key: page.topicKey,
        authority_tier: 2,
        authority_kind: 'TIMAN_DK',
        duplicate_of_source_id: exactDuplicate?.sourceId || null,
      });
      runInserts.push({
        id: ingestionRunId,
        knowledge_source_id: sourceId,
        status: reviewable ? 'READY_FOR_REVIEW' : 'FAILED',
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
        warnings: quality.reasons,
        error_code: reviewable ? null : quality.status,
        error_message_sanitized: reviewable ? null : 'Content did not pass the Knowledge Quality gate.',
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
        status_reason: reviewable ? 'AWAITING_BACKEND_APPROVAL' : `QUALITY_GATE_${quality.status}`,
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
        approval_state: reviewable ? 'REVIEW' : 'DRAFT',
        source_state: reviewable ? (existing ? 'CHANGED' : 'ACTIVE') : 'ERROR',
        last_http_status: 200,
        discovery_method: 'WORDPRESS_REST',
      });
      qualityInserts.push({
        knowledge_source_id: sourceId,
        ingestion_run_id: ingestionRunId,
        assessment_version: SUPPORT_KNOWLEDGE_QUALITY_VERSION,
        status: quality.status,
        score: quality.score,
        reasons: quality.reasons,
        markup_residue_count: quality.markupResidueCount,
        meaningful_character_count: quality.meaningfulCharacterCount,
        normalized_content_hash: page.contentHash,
        canonical_url: page.canonicalUrl,
        source_type: 'TIMAN_DK_REGISTRY',
        language: page.language,
        metadata: { previous_hash: existing?.normalized_content_hash || null, processor_version: SUPPORT_PROCESSOR_VERSION },
      });
      topicUpserts.push({ topic_key: page.topicKey, category: page.category, product_relations: page.productRelations });
      topicVariantPending.push({ sourceId, knowledgeItemId, topicKey: page.topicKey, language: page.language, canonicalUrl: page.canonicalUrl });
      qualityEventInserts.push({
        event_type: 'QUALITY_ASSESSED', knowledge_source_id: sourceId, actor_user_id: actorId,
        metadata: { status: quality.status, score: quality.score, reasons: quality.reasons },
      });
      const duplicateTarget = exactDuplicate || (isNearDuplicate ? nearest?.source : null);
      if (duplicateTarget) {
        const pair = [sourceId, duplicateTarget.sourceId].sort();
        const similarity = exactDuplicate
          ? { score: 1, methods: ['EXACT_HASH'], matchingHeadings: [], sharedRelations: [] }
          : nearest!.similarity;
        duplicateUpserts.push({
          cluster_key: `${pair[0]}:${pair[1]}`,
          source_a_id: pair[0], source_b_id: pair[1], language: page.language,
          similarity_score: similarity.score, detection_methods: similarity.methods,
          matching_headings: similarity.matchingHeadings, shared_relations: similarity.sharedRelations,
        });
      }
      if (!exactDuplicate && nearest && (nearest.source.topicKey === page.topicKey || nearest.similarity.score >= 0.65)) {
        const conflicts = detectKnowledgeFactConflicts(page.content, nearest.source.text).filter((entry) => !entry.contextual);
        for (const conflict of conflicts.slice(0, 20)) {
          const pair = [sourceId, nearest.source.sourceId].sort();
          conflictUpserts.push({
            conflict_key: `${pair[0]}:${pair[1]}:${conflict.left.subject}:${conflict.left.attribute}:${conflict.left.value}:${conflict.right.value}`,
            subject: conflict.left.subject, attribute: conflict.left.attribute,
            source_a_id: sourceId, source_b_id: nearest.source.sourceId,
            value_a: conflict.left.value, value_b: conflict.right.value,
            context_a: conflict.left.context, context_b: conflict.right.context,
            language: page.language,
          });
        }
      }
      corpusBySource.set(sourceId, {
        id: sourceId,
        sourceId,
        knowledgeItemId,
        text: page.content,
        title: page.title,
        headings: [],
        language: page.language,
        canonicalUrl: page.canonicalUrl,
        topicKey: page.topicKey,
        productRelations: page.productRelations,
        lifecycleStatus: reviewable ? 'REVIEW' : 'DRAFT',
        authorityTier: 2,
        normalizedHash: page.contentHash,
        similarityCacheKey: page.contentHash,
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
    if (qualityInserts.length) { const { error } = await service.from('support_knowledge_quality_assessments').upsert(qualityInserts, { onConflict: 'knowledge_source_id,assessment_version' }); if (error) throw error; }
    if (sourceTopicUpdates.length) {
      await mapWithConcurrency(sourceTopicUpdates, 12, async (entry) => {
        const { error } = await service.from('support_knowledge_sources').update({ topic_key: entry.topicKey }).eq('id', entry.sourceId);
        if (error) throw error;
      });
    }
    if (topicUpserts.length) {
      const uniqueTopics = [...new Map(topicUpserts.map((topic) => [String(topic.topic_key), topic])).values()];
      const { error } = await service.from('support_knowledge_topics').upsert(uniqueTopics, { onConflict: 'topic_key' });
      if (error) throw error;
      const { data: topics, error: topicError } = await service.from('support_knowledge_topics')
        .select('id,topic_key').in('topic_key', uniqueTopics.map((topic) => String(topic.topic_key)));
      if (topicError) throw topicError;
      const topicIds = new Map((topics || []).map((topic) => [topic.topic_key, topic.id]));
      const variants = topicVariantPending.flatMap((variant) => {
        const topicId = topicIds.get(variant.topicKey);
        return topicId ? [{
          topic_id: topicId, knowledge_item_id: variant.knowledgeItemId, knowledge_source_id: variant.sourceId,
          language: variant.language, canonical_url: variant.canonicalUrl,
        }] : [];
      });
      if (variants.length) {
        const { error } = await service.from('support_knowledge_topic_variants')
          .upsert(variants, { onConflict: 'knowledge_item_id,language' });
        if (error) throw error;
      }
    }
    if (duplicateUpserts.length) { const { error } = await service.from('support_knowledge_duplicate_clusters').upsert(duplicateUpserts, { onConflict: 'cluster_key' }); if (error) throw error; }
    if (conflictUpserts.length) { const { error } = await service.from('support_knowledge_conflicts').upsert(conflictUpserts, { onConflict: 'conflict_key' }); if (error) throw error; }
    if (qualityEventInserts.length) { const { error } = await service.from('support_knowledge_quality_events').insert(qualityEventInserts); if (error) throw error; }
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
      quality_clean_count: cleanCount,
      quality_needs_review_count: needsReviewCount,
      quality_rejected_count: rejectedCount,
      near_duplicate_count: duplicateUpserts.filter((row) => (row.detection_methods as string[]).includes('NORMALIZED_TEXT')).length,
      potential_conflict_count: conflictUpserts.length,
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
