-- Timan Assistant Phase 5: read-only AI runtime and authorization-first RAG.
-- This migration is additive. Existing Knowledge lifecycle, source revisions,
-- audit history and Support permissions remain canonical and unchanged.

create extension if not exists vector with schema extensions;

create table public.support_embedding_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_name text not null,
  model_version text not null,
  dimensions integer not null check (dimensions > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, model_name, model_version)
);

create table public.support_chunk_embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.support_knowledge_chunks(id) on delete restrict,
  embedding_model_id uuid not null references public.support_embedding_models(id) on delete restrict,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  embedding extensions.vector(1536),
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'PROCESSING', 'INDEXED', 'STALE', 'FAILED')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chunk_id, embedding_model_id)
);

create table public.support_ai_runtime_config (
  id boolean primary key default true check (id),
  ai_enabled boolean not null default false,
  primary_provider text not null default 'openai',
  fast_model text not null,
  standard_model text not null,
  reasoning_model text not null,
  fallback_model text,
  embedding_model text not null,
  embedding_dimensions integer not null check (embedding_dimensions = 1536),
  max_input_characters integer not null default 4000 check (max_input_characters between 1 and 20000),
  max_output_tokens integer not null default 800 check (max_output_tokens between 1 and 4000),
  retrieval_candidate_limit integer not null default 30 check (retrieval_candidate_limit between 1 and 100),
  final_chunk_limit integer not null default 6 check (final_chunk_limit between 1 and 20),
  provider_timeout_ms integer not null default 20000 check (provider_timeout_ms between 1000 and 60000),
  overall_timeout_ms integer not null default 30000 check (overall_timeout_ms between 1000 and 90000),
  retry_count integer not null default 1 check (retry_count between 0 and 3),
  per_user_minute_limit integer not null default 10 check (per_user_minute_limit > 0),
  per_user_hour_limit integer not null default 100 check (per_user_hour_limit > 0),
  per_user_concurrency_limit integer not null default 2 check (per_user_concurrency_limit > 0),
  per_partner_minute_limit integer not null default 30 check (per_partner_minute_limit > 0),
  conversation_turn_limit integer not null default 12 check (conversation_turn_limit between 0 and 30),
  updated_at timestamptz not null default now()
);

create table public.support_model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_name text not null,
  input_per_million numeric(16, 8),
  cached_input_per_million numeric(16, 8),
  output_per_million numeric(16, 8),
  currency text not null default 'USD',
  effective_from timestamptz not null,
  effective_to timestamptz,
  source_reference text,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (input_per_million is null or input_per_million >= 0),
  check (cached_input_per_million is null or cached_input_per_million >= 0),
  check (output_per_million is null or output_per_million >= 0),
  unique (provider, model_name, effective_from)
);

create table public.support_ai_requests (
  request_id uuid primary key,
  conversation_id uuid references public.support_conversations(id) on delete set null,
  user_id uuid not null references public.app_users(id) on delete restrict,
  partner_id uuid references public.dealer_accounts(id) on delete set null,
  question_id uuid references public.support_questions(id) on delete set null,
  response_id uuid references public.support_responses(id) on delete set null,
  status text not null check (status in (
    'RUNNING', 'SUCCESS', 'NO_ANSWER', 'FAILED', 'THROTTLED', 'DISABLED'
  )),
  error_category text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.support_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_ai_requests(request_id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null,
  model_name text not null,
  provider_request_id text,
  status text not null check (status in ('SUCCESS', 'FAILED', 'TIMEOUT')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cached_tokens integer check (cached_tokens is null or cached_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  finish_reason text,
  error_category text,
  created_at timestamptz not null default now(),
  unique (request_id, attempt_number)
);

alter table public.support_questions
  add column if not exists request_id uuid,
  add column if not exists intent text;

alter table public.support_responses
  add column if not exists request_id uuid,
  add column if not exists provider text,
  add column if not exists finish_reason text;

alter table public.support_response_sources
  add column if not exists knowledge_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  add column if not exists source_revision integer,
  add column if not exists chunk_id uuid references public.support_knowledge_chunks(id) on delete restrict,
  add column if not exists opaque_citation_id text,
  add column if not exists page_start integer,
  add column if not exists page_end integer,
  add column if not exists heading text,
  add column if not exists source_language text;

alter table public.support_retrieval_events
  add column if not exists request_id uuid,
  add column if not exists candidate_count integer,
  add column if not exists selected_chunk_count integer,
  add column if not exists unique_knowledge_item_count integer,
  add column if not exists top_similarity numeric,
  add column if not exists second_similarity numeric,
  add column if not exists score_spread numeric,
  add column if not exists citation_count integer,
  add column if not exists retrieval_empty boolean,
  add column if not exists source_languages text[];

alter table public.support_usage_events
  add column if not exists request_id uuid,
  add column if not exists provider text,
  add column if not exists provider_request_id text,
  add column if not exists throttled boolean not null default false,
  add column if not exists candidate_count integer,
  add column if not exists selected_chunk_count integer,
  add column if not exists citation_count integer;

create unique index if not exists support_questions_request_id_uidx
  on public.support_questions (request_id) where request_id is not null;
create unique index if not exists support_responses_request_id_uidx
  on public.support_responses (request_id) where request_id is not null;
create unique index if not exists support_usage_events_request_id_uidx
  on public.support_usage_events (request_id) where request_id is not null;
create index if not exists support_ai_requests_user_created_idx
  on public.support_ai_requests (user_id, created_at desc);
create index if not exists support_ai_requests_partner_created_idx
  on public.support_ai_requests (partner_id, created_at desc) where partner_id is not null;
create index if not exists support_ai_requests_running_idx
  on public.support_ai_requests (user_id, status) where status = 'RUNNING';
create index if not exists support_provider_attempts_request_idx
  on public.support_provider_attempts (request_id, attempt_number);
create index if not exists support_chunk_embeddings_status_idx
  on public.support_chunk_embeddings (status, updated_at);
create index if not exists support_chunk_embeddings_vector_hnsw_idx
  on public.support_chunk_embeddings using hnsw (embedding vector_cosine_ops)
  where status = 'INDEXED';

create trigger support_chunk_embeddings_touch_updated_at
before update on public.support_chunk_embeddings
for each row execute function public.support_touch_updated_at();

create trigger support_ai_runtime_config_touch_updated_at
before update on public.support_ai_runtime_config
for each row execute function public.support_touch_updated_at();

insert into public.support_embedding_models (
  provider, model_name, model_version, dimensions, enabled
)
values ('openai', 'text-embedding-3-small', 'text-embedding-3-small', 1536, true)
on conflict (provider, model_name, model_version) do update
set dimensions = excluded.dimensions, enabled = true;

insert into public.support_ai_runtime_config (
  id, ai_enabled, primary_provider, fast_model, standard_model,
  reasoning_model, fallback_model, embedding_model, embedding_dimensions
)
values (
  true, false, 'openai', 'gpt-4.1-mini-2025-04-14',
  'gpt-4.1-mini-2025-04-14', 'gpt-4.1-mini-2025-04-14', null,
  'text-embedding-3-small', 1536
)
on conflict (id) do nothing;

-- Effective-dated prices verified against the provider documentation on the
-- migration date. Unknown models deliberately produce a NULL estimate.
insert into public.support_model_pricing (
  provider, model_name, input_per_million, cached_input_per_million,
  output_per_million, currency, effective_from, source_reference
)
values
  ('openai', 'gpt-4.1-mini-2025-04-14', 0.40, 0.10, 1.60, 'USD',
   '2026-09-27T00:00:00Z', 'https://developers.openai.com/api/docs/models/gpt-4.1-mini'),
  ('openai', 'text-embedding-3-small', 0.02, null, null, 'USD',
   '2026-09-27T00:00:00Z', 'https://developers.openai.com/api/docs/models/text-embedding-3-small')
on conflict (provider, model_name, effective_from) do nothing;

alter table public.support_embedding_models enable row level security;
alter table public.support_chunk_embeddings enable row level security;
alter table public.support_ai_runtime_config enable row level security;
alter table public.support_model_pricing enable row level security;
alter table public.support_ai_requests enable row level security;
alter table public.support_provider_attempts enable row level security;

revoke all on public.support_embedding_models from anon, authenticated;
revoke all on public.support_chunk_embeddings from anon, authenticated;
revoke all on public.support_ai_runtime_config from anon, authenticated;
revoke all on public.support_model_pricing from anon, authenticated;
revoke all on public.support_ai_requests from anon, authenticated;
revoke all on public.support_provider_attempts from anon, authenticated;

grant all on public.support_embedding_models to service_role;
grant all on public.support_chunk_embeddings to service_role;
grant all on public.support_ai_runtime_config to service_role;
grant all on public.support_model_pricing to service_role;
grant all on public.support_ai_requests to service_role;
grant all on public.support_provider_attempts to service_role;

create or replace function public.support_claim_ai_request(
  p_request_id uuid,
  p_user_id uuid,
  p_partner_id uuid,
  p_conversation_id uuid
)
returns table (
  decision text,
  existing_status text,
  existing_response_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.support_ai_runtime_config%rowtype;
  existing public.support_ai_requests%rowtype;
  minute_count integer;
  hour_count integer;
  concurrent_count integer;
  partner_count integer;
begin
  if coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into existing
    from public.support_ai_requests
   where request_id = p_request_id;
  if found then
    if existing.user_id <> p_user_id then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    return query select 'DUPLICATE'::text, existing.status, existing.response_id;
    return;
  end if;

  select * into cfg from public.support_ai_runtime_config where id = true;
  if not found or not cfg.ai_enabled then
    insert into public.support_ai_requests (
      request_id, conversation_id, user_id, partner_id, status, error_category, completed_at
    ) values (
      p_request_id, p_conversation_id, p_user_id, p_partner_id,
      'DISABLED', 'AI_DISABLED', now()
    );
    return query select 'DISABLED'::text, 'DISABLED'::text, null::uuid;
    return;
  end if;

  select count(*) into minute_count
    from public.support_ai_requests
   where user_id = p_user_id and created_at >= now() - interval '1 minute'
     and status not in ('THROTTLED', 'DISABLED');
  select count(*) into hour_count
    from public.support_ai_requests
   where user_id = p_user_id and created_at >= now() - interval '1 hour'
     and status not in ('THROTTLED', 'DISABLED');
  select count(*) into concurrent_count
    from public.support_ai_requests
   where user_id = p_user_id and status = 'RUNNING';
  select count(*) into partner_count
    from public.support_ai_requests
   where p_partner_id is not null and partner_id = p_partner_id
     and created_at >= now() - interval '1 minute'
     and status not in ('THROTTLED', 'DISABLED');

  if minute_count >= cfg.per_user_minute_limit
     or hour_count >= cfg.per_user_hour_limit
     or concurrent_count >= cfg.per_user_concurrency_limit
     or (p_partner_id is not null and partner_count >= cfg.per_partner_minute_limit) then
    insert into public.support_ai_requests (
      request_id, conversation_id, user_id, partner_id, status, error_category, completed_at
    ) values (
      p_request_id, p_conversation_id, p_user_id, p_partner_id,
      'THROTTLED', case when concurrent_count >= cfg.per_user_concurrency_limit
        then 'CONCURRENCY_LIMIT' else 'RATE_LIMIT' end, now()
    );
    return query select 'THROTTLED'::text, 'THROTTLED'::text, null::uuid;
    return;
  end if;

  insert into public.support_ai_requests (
    request_id, conversation_id, user_id, partner_id, status
  ) values (p_request_id, p_conversation_id, p_user_id, p_partner_id, 'RUNNING');
  return query select 'ACCEPTED'::text, 'RUNNING'::text, null::uuid;
end;
$$;

revoke all on function public.support_claim_ai_request(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_claim_ai_request(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.support_retrieve_authorized_chunks(
  p_actor_user_id uuid,
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_candidate_limit integer default 30,
  p_result_limit integer default 6,
  p_language text default 'da',
  p_machine_id text default null,
  p_product_id uuid default null
)
returns table (
  chunk_id uuid,
  knowledge_item_id uuid,
  knowledge_source_id uuid,
  source_revision integer,
  title text,
  source_reference text,
  original_filename text,
  source_language text,
  page_start integer,
  page_end integer,
  heading text,
  content text,
  category text,
  semantic_similarity double precision,
  keyword_score real,
  fused_score double precision
)
language sql
stable
security definer
set search_path = ''
as $$
with actor as (
  select u.portal_role::text as portal_role,
         coalesce(u.allowed_areas, '{}'::text[]) as allowed_areas,
         coalesce(u.allowed_modules, u.module_access, '{}'::text[]) as allowed_modules
    from public.app_users u
   where u.id = p_actor_user_id and u.approved and u.is_active
), eligible as (
  select c.id as chunk_id, c.knowledge_item_id, c.knowledge_source_id,
         c.source_revision, i.title, i.source_reference, s.original_filename,
         c.language as source_language, c.page_start, c.page_end, c.heading,
         c.content, i.category,
         1 - (e.embedding operator(extensions.<=>) p_query_embedding) as semantic_similarity,
         ts_rank_cd(to_tsvector('simple', c.content), plainto_tsquery('simple', p_query_text)) as keyword_score,
         case when p_language is not null and lower(c.language) = lower(p_language) then 0.02 else 0 end as language_boost,
         case when p_machine_id is not null and (
           i.machine_id = p_machine_id or exists (
             select 1 from public.support_knowledge_item_machines m
              where m.knowledge_item_id = i.id and m.machine_id = p_machine_id
           )
         ) then 0.05 else 0 end as machine_boost,
         case when p_product_id is not null and (
           i.product_id = p_product_id or exists (
             select 1 from public.support_knowledge_item_products p
              where p.knowledge_item_id = i.id and p.product_id = p_product_id
           )
         ) then 0.05 else 0 end as product_boost
    from public.support_knowledge_chunks c
    join public.support_knowledge_sources s on s.id = c.knowledge_source_id
    join public.support_knowledge_items i on i.id = c.knowledge_item_id
    join public.support_ingestion_runs r on r.id = c.ingestion_run_id
    join public.support_knowledge_index_states idx
      on idx.knowledge_source_id = s.id and idx.ingestion_run_id = r.id
    join public.support_chunk_embeddings e
      on e.chunk_id = c.id and e.content_hash = c.content_hash and e.status = 'INDEXED'
    join public.support_embedding_models em
      on em.id = e.embedding_model_id and em.enabled and em.dimensions = 1536
    cross join actor a
   where i.status = 'APPROVED'
     and s.is_current
     and s.ingestion_status = 'READY_FOR_REVIEW'
     and r.status = 'READY_FOR_REVIEW'
     and idx.status = 'INDEXED'
     and e.embedding is not null
     and (
       i.access_scope in ('PUBLIC', 'PORTAL')
       or (i.access_scope = 'BACKEND' and a.portal_role = 'timan_backend')
       or (i.access_scope = 'SALES' and 'salg_marketing' = any(a.allowed_areas))
       or (i.access_scope = 'TECHNICAL_SERVICE' and 'teknik_service' = any(a.allowed_areas))
     )
     and (i.required_area is null or i.required_area = any(a.allowed_areas))
     and (i.required_module is null or i.required_module = any(a.allowed_modules))
), semantic_ranked as (
  select e.*, row_number() over (order by e.semantic_similarity desc, e.chunk_id) as semantic_rank
    from eligible e
   order by e.semantic_similarity desc, e.chunk_id
   limit greatest(1, least(p_candidate_limit, 100))
), keyword_ranked as (
  select e.chunk_id, row_number() over (order by e.keyword_score desc, e.chunk_id) as keyword_rank
    from eligible e
   where e.keyword_score > 0
   order by e.keyword_score desc, e.chunk_id
   limit greatest(1, least(p_candidate_limit, 100))
), candidates as (
  select chunk_id from semantic_ranked
  union
  select chunk_id from keyword_ranked
), fused as (
  select e.*,
         (case when sr.semantic_rank is null then 0 else 1.0 / (60 + sr.semantic_rank) end)
       + (case when kr.keyword_rank is null then 0 else 1.0 / (60 + kr.keyword_rank) end)
       + e.language_boost + e.machine_boost + e.product_boost as fused_score
    from candidates x
    join eligible e on e.chunk_id = x.chunk_id
    left join semantic_ranked sr on sr.chunk_id = x.chunk_id
    left join keyword_ranked kr on kr.chunk_id = x.chunk_id
)
select f.chunk_id, f.knowledge_item_id, f.knowledge_source_id,
       f.source_revision, f.title, f.source_reference, f.original_filename,
       f.source_language, f.page_start, f.page_end, f.heading, f.content,
       f.category, f.semantic_similarity, f.keyword_score, f.fused_score
  from fused f
 order by f.fused_score desc, f.semantic_similarity desc, f.chunk_id
 limit greatest(1, least(p_result_limit, 20));
$$;

revoke all on function public.support_retrieve_authorized_chunks(
  uuid, extensions.vector, text, integer, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.support_retrieve_authorized_chunks(
  uuid, extensions.vector, text, integer, integer, text, text, uuid
) to service_role;

comment on table public.support_chunk_embeddings is
  'Phase 5 provider-neutral embeddings. Raw vectors are service-role only.';
comment on function public.support_retrieve_authorized_chunks is
  'Authorization-first hybrid retrieval. Status and scope filtering occur before ranking or AI exposure.';
