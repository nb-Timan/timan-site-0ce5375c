alter table public.support_knowledge_items
  add column if not exists evaluation_only boolean not null default false;

comment on column public.support_knowledge_items.evaluation_only is
  'When true, the item is excluded from normal Support retrieval and can only be included by an explicit evaluation retrieval context.';

create index if not exists support_knowledge_items_evaluation_only_idx
  on public.support_knowledge_items (evaluation_only)
  where evaluation_only;

-- One-time classification of the four existing canonical Phase 8 sources. Runtime
-- retrieval relies only on evaluation_only and never on titles.
do $$
declare
  v_actor_auth_user_id uuid;
  v_actor_count integer;
begin
  select count(*)
    into v_actor_count
    from public.app_users
   where portal_role::text = 'timan_backend'
     and approved
     and is_active
     and auth_user_id is not null
     and coalesce((permissions ->> 'support_access')::boolean, false);

  if v_actor_count <> 1 then
    raise exception 'Expected exactly one active Backend Support actor for evaluation-only metadata backfill';
  end if;

  select auth_user_id
    into v_actor_auth_user_id
    from public.app_users
   where portal_role::text = 'timan_backend'
     and approved
     and is_active
     and auth_user_id is not null
     and coalesce((permissions ->> 'support_access')::boolean, false);

  perform set_config('request.jwt.claim.sub', v_actor_auth_user_id::text, true);
end;
$$;

update public.support_knowledge_items
   set evaluation_only = true
 where title in (
   'PHASE 8 QA TEST — Public portal, machine and commercial facts',
   'PHASE 8 QA TEST — Technical Service restricted knowledge',
   'PHASE 8 QA TEST — English cross-language retrieval source',
   'PHASE 8 QA TEST — Confidence conflict and prompt injection'
 );

drop function if exists public.support_retrieve_authorized_chunks_v2(
  uuid, extensions.vector, text, integer, integer, text, text, uuid
);

create function public.support_retrieve_authorized_chunks_v2(
  p_actor_user_id uuid,
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_candidate_limit integer default 30,
  p_result_limit integer default 6,
  p_language text default 'da',
  p_machine_id text default null,
  p_product_id uuid default null,
  p_include_evaluation_only boolean default false
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
  fused_score double precision,
  machine_ids text[],
  product_ids uuid[],
  stale_states text[],
  review_overdue boolean
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
), cfg as (
  select * from public.support_ai_runtime_config where id = true
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
             select 1 from public.support_knowledge_item_machines m where m.knowledge_item_id = i.id and m.machine_id = p_machine_id
           )
         ) then 0.05 else 0 end as machine_boost,
         case when p_product_id is not null and (
           i.product_id = p_product_id or exists (
             select 1 from public.support_knowledge_item_products p where p.knowledge_item_id = i.id and p.product_id = p_product_id
           )
         ) then 0.05 else 0 end as product_boost,
         array_remove(array_prepend(i.machine_id, array(
           select m.machine_id from public.support_knowledge_item_machines m where m.knowledge_item_id = i.id
         )), null) as machine_ids,
         array_remove(array_prepend(i.product_id, array(
           select p.product_id from public.support_knowledge_item_products p where p.knowledge_item_id = i.id
         )), null) as product_ids,
         s.stale_states,
         ('REVIEW_OVERDUE' = any(s.stale_states)) as review_overdue
    from public.support_knowledge_chunks c
    join public.support_knowledge_sources s on s.id = c.knowledge_source_id
    join public.support_knowledge_items i on i.id = c.knowledge_item_id
    join public.support_ingestion_runs r on r.id = c.ingestion_run_id
    join public.support_knowledge_index_states idx on idx.knowledge_source_id = s.id and idx.ingestion_run_id = r.id
    join public.support_chunk_embeddings e on e.chunk_id = c.id and e.content_hash = c.content_hash and e.status = 'INDEXED'
    join public.support_embedding_models em on em.id = e.embedding_model_id and em.enabled and em.dimensions = 1536
    cross join actor a
    cross join cfg config
   where i.status = 'APPROVED'
     and (not i.evaluation_only or p_include_evaluation_only)
     and s.lifecycle_status = 'APPROVED'
     and s.is_current
     and s.ingestion_status = 'READY_FOR_REVIEW'
     and r.status = 'READY_FOR_REVIEW'
     and idx.status = 'INDEXED'
     and idx.embedding_model_id = em.id
     and em.model_name = config.embedding_model
     and e.embedding is not null
     and coalesce(i.effective_from, '-infinity'::timestamptz) <= now()
     and coalesce(i.effective_until, 'infinity'::timestamptz) > now()
     and coalesce(s.effective_from, '-infinity'::timestamptz) <= now()
     and coalesce(s.effective_until, 'infinity'::timestamptz) > now()
     and not (s.stale_states && array['CONTENT_STALE', 'INDEX_STALE', 'EMBEDDING_STALE']::text[])
     and (config.allow_review_overdue_retrieval or not ('REVIEW_OVERDUE' = any(s.stale_states)))
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
    from eligible e order by e.semantic_similarity desc, e.chunk_id
   limit greatest(1, least(p_candidate_limit, 100))
), keyword_ranked as (
  select e.chunk_id, row_number() over (order by e.keyword_score desc, e.chunk_id) as keyword_rank
    from eligible e where e.keyword_score > 0 order by e.keyword_score desc, e.chunk_id
   limit greatest(1, least(p_candidate_limit, 100))
), candidates as (
  select chunk_id from semantic_ranked union select chunk_id from keyword_ranked
), fused as (
  select e.*,
         (case when sr.semantic_rank is null then 0 else 1.0 / (60 + sr.semantic_rank) end)
       + (case when kr.keyword_rank is null then 0 else 1.0 / (60 + kr.keyword_rank) end)
       + e.language_boost + e.machine_boost + e.product_boost as fused_score
    from candidates x join eligible e on e.chunk_id = x.chunk_id
    left join semantic_ranked sr on sr.chunk_id = x.chunk_id
    left join keyword_ranked kr on kr.chunk_id = x.chunk_id
)
select f.chunk_id, f.knowledge_item_id, f.knowledge_source_id,
       f.source_revision, f.title, f.source_reference, f.original_filename,
       f.source_language, f.page_start, f.page_end, f.heading, f.content,
       f.category, f.semantic_similarity, f.keyword_score, f.fused_score,
       f.machine_ids, f.product_ids, f.stale_states, f.review_overdue
  from fused f
 order by f.fused_score desc, f.semantic_similarity desc, f.chunk_id
 limit greatest(1, least(p_result_limit, 20));
$$;

revoke all on function public.support_retrieve_authorized_chunks_v2(
  uuid, extensions.vector, text, integer, integer, text, text, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.support_retrieve_authorized_chunks_v2(
  uuid, extensions.vector, text, integer, integer, text, text, uuid, boolean
) to service_role;

create or replace function public.support_count_authorized_stale_sources(
  p_actor_user_id uuid,
  p_machine_id text default null,
  p_product_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select u.portal_role::text as portal_role,
           coalesce(u.allowed_areas, '{}'::text[]) as allowed_areas,
           coalesce(u.allowed_modules, u.module_access, '{}'::text[]) as allowed_modules
      from public.app_users u where u.id = p_actor_user_id and u.approved and u.is_active
  )
  select count(*)::integer
    from public.support_knowledge_sources s
    join public.support_knowledge_items i on i.id = s.knowledge_item_id
    cross join actor a
   where i.status = 'APPROVED'
     and not i.evaluation_only
     and s.is_current
     and s.stale_states && array['CONTENT_STALE', 'INDEX_STALE', 'EMBEDDING_STALE']::text[]
     and (p_machine_id is null or i.machine_id = p_machine_id or exists (
       select 1 from public.support_knowledge_item_machines m where m.knowledge_item_id = i.id and m.machine_id = p_machine_id
     ))
     and (p_product_id is null or i.product_id = p_product_id or exists (
       select 1 from public.support_knowledge_item_products p where p.knowledge_item_id = i.id and p.product_id = p_product_id
     ))
     and (
       i.access_scope in ('PUBLIC', 'PORTAL')
       or (i.access_scope = 'BACKEND' and a.portal_role = 'timan_backend')
       or (i.access_scope = 'SALES' and 'salg_marketing' = any(a.allowed_areas))
       or (i.access_scope = 'TECHNICAL_SERVICE' and 'teknik_service' = any(a.allowed_areas))
     )
     and (i.required_area is null or i.required_area = any(a.allowed_areas))
     and (i.required_module is null or i.required_module = any(a.allowed_modules))
$$;

revoke all on function public.support_count_authorized_stale_sources(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.support_count_authorized_stale_sources(uuid, text, uuid) to service_role;

comment on function public.support_retrieve_authorized_chunks_v2(
  uuid, extensions.vector, text, integer, integer, text, text, uuid, boolean
) is 'Authorization-first retrieval. Normal callers exclude evaluation-only knowledge; evaluation callers may explicitly include it.';
