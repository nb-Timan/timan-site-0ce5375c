-- Timan Assistant Phase 6: deterministic confidence and safe knowledge-version governance.
-- Existing source revisions and embeddings are preserved. A replacement source becomes
-- current only after human approval and a complete index for the active embedding model.

alter table public.support_ai_runtime_config
  add column if not exists confidence_high_threshold numeric(5,4) not null default 0.7600,
  add column if not exists confidence_medium_threshold numeric(5,4) not null default 0.5400,
  add column if not exists confidence_min_top_similarity numeric(5,4) not null default 0.4200,
  add column if not exists confidence_min_citation_coverage numeric(5,4) not null default 0.5000,
  add column if not exists confidence_conflict_score_tolerance numeric(5,4) not null default 0.0600,
  add column if not exists confidence_require_machine_for_ambiguous boolean not null default true,
  add column if not exists allow_review_overdue_retrieval boolean not null default true;

alter table public.support_ai_runtime_config
  drop constraint if exists support_ai_runtime_config_confidence_thresholds_check,
  add constraint support_ai_runtime_config_confidence_thresholds_check check (
    confidence_high_threshold > confidence_medium_threshold
    and confidence_medium_threshold >= 0 and confidence_high_threshold <= 1
    and confidence_min_top_similarity >= 0 and confidence_min_top_similarity <= 1
    and confidence_min_citation_coverage >= 0 and confidence_min_citation_coverage <= 1
    and confidence_conflict_score_tolerance >= 0 and confidence_conflict_score_tolerance <= 1
  );

alter table public.support_questions
  add column if not exists confidence_level text,
  add column if not exists confidence_score numeric(5,4),
  add column if not exists confidence_reason text,
  add column if not exists outcome_type text,
  add column if not exists clarification_requested boolean not null default false,
  add column if not exists source_conflict boolean not null default false,
  add column if not exists stale_knowledge_blocked boolean not null default false;

alter table public.support_questions
  drop constraint if exists support_questions_confidence_level_check,
  add constraint support_questions_confidence_level_check check (
    confidence_level is null or confidence_level in ('HIGH', 'MEDIUM', 'LOW', 'NO_GROUNDED_ANSWER')
  ),
  drop constraint if exists support_questions_confidence_score_check,
  add constraint support_questions_confidence_score_check check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  ),
  drop constraint if exists support_questions_outcome_type_check,
  add constraint support_questions_outcome_type_check check (
    outcome_type is null or outcome_type in (
      'ANSWERED', 'CAUTIOUS_ANSWER', 'CLARIFICATION_REQUIRED', 'SOURCE_CONFLICT',
      'NO_RELEVANT_KNOWLEDGE', 'STALE_KNOWLEDGE', 'PROVIDER_FAILURE',
      'RETRIEVAL_FAILURE', 'ACCESS_RESTRICTED', 'SERVICE_DISABLED'
    )
  );

alter table public.support_responses
  add column if not exists confidence_level text,
  add column if not exists confidence_score numeric(5,4),
  add column if not exists confidence_reason text,
  add column if not exists outcome_type text;

alter table public.support_responses
  drop constraint if exists support_responses_confidence_level_check,
  add constraint support_responses_confidence_level_check check (
    confidence_level is null or confidence_level in ('HIGH', 'MEDIUM', 'LOW', 'NO_GROUNDED_ANSWER')
  ),
  drop constraint if exists support_responses_confidence_score_check,
  add constraint support_responses_confidence_score_check check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  );

alter table public.support_retrieval_events
  add column if not exists confidence_level text,
  add column if not exists confidence_score numeric(5,4),
  add column if not exists confidence_reason text,
  add column if not exists citation_coverage numeric(5,4),
  add column if not exists clarification_requested boolean not null default false,
  add column if not exists source_conflict boolean not null default false,
  add column if not exists stale_block_count integer not null default 0;

alter table public.support_retrieval_events
  drop constraint if exists support_retrieval_events_confidence_level_check,
  add constraint support_retrieval_events_confidence_level_check check (
    confidence_level is null or confidence_level in ('HIGH', 'MEDIUM', 'LOW', 'NO_GROUNDED_ANSWER')
  ),
  drop constraint if exists support_retrieval_events_stale_block_count_check,
  add constraint support_retrieval_events_stale_block_count_check check (stale_block_count >= 0);

alter table public.support_knowledge_gaps
  add column if not exists confidence_reason text,
  add column if not exists confidence_level text;

alter table public.support_knowledge_gaps
  drop constraint if exists support_knowledge_gaps_reason_code_check,
  add constraint support_knowledge_gaps_reason_code_check check (reason_code in (
    'NO_RELEVANT_KNOWLEDGE', 'ACCESS_RESTRICTED', 'LOW_CONFIDENCE',
    'AMBIGUOUS_QUESTION', 'SOURCE_CONFLICT', 'STALE_KNOWLEDGE',
    'MISSING_DOCUMENTATION', 'RETRIEVAL_ERROR', 'AI_PROVIDER_ERROR', 'OTHER'
  ));

alter table public.support_knowledge_items
  add column if not exists effective_from timestamptz,
  add column if not exists effective_until timestamptz,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists next_review_at timestamptz,
  add column if not exists source_family_key text;

alter table public.support_knowledge_items
  drop constraint if exists support_knowledge_items_effective_range_check,
  add constraint support_knowledge_items_effective_range_check check (
    effective_until is null or effective_from is null or effective_until > effective_from
  );

-- This additive backfill is executed by the migration owner, not an application user.
-- Keep the canonical actor-validation and updated_at triggers active at runtime while
-- preserving existing audit timestamps during this one controlled data migration.
alter table public.support_knowledge_items disable trigger support_knowledge_items_lifecycle;
alter table public.support_knowledge_items disable trigger support_knowledge_items_touch_updated_at;
update public.support_knowledge_items
   set source_family_key = coalesce(source_family_key, id::text),
       effective_from = coalesce(effective_from, approved_at, created_at),
       last_reviewed_at = coalesce(last_reviewed_at, approved_at)
 where source_family_key is null or effective_from is null
    or (status = 'APPROVED' and last_reviewed_at is null);
alter table public.support_knowledge_items enable trigger support_knowledge_items_touch_updated_at;
alter table public.support_knowledge_items enable trigger support_knowledge_items_lifecycle;

alter table public.support_knowledge_items alter column source_family_key set not null;
create index if not exists support_knowledge_items_review_due_idx
  on public.support_knowledge_items (next_review_at) where status = 'APPROVED';
create index if not exists support_knowledge_items_family_idx
  on public.support_knowledge_items (source_family_key, version_number desc);

alter table public.support_knowledge_sources
  add column if not exists lifecycle_status text not null default 'DRAFT',
  add column if not exists effective_from timestamptz,
  add column if not exists effective_until timestamptz,
  add column if not exists reviewed_by_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_by_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists promoted_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists stale_states text[] not null default '{}',
  add column if not exists stale_reason text;

alter table public.support_knowledge_sources
  drop constraint if exists support_knowledge_sources_lifecycle_status_check,
  add constraint support_knowledge_sources_lifecycle_status_check check (
    lifecycle_status in ('DRAFT', 'REVIEW', 'APPROVED', 'SUPERSEDED', 'ARCHIVED')
  ),
  drop constraint if exists support_knowledge_sources_stale_states_check,
  add constraint support_knowledge_sources_stale_states_check check (
    stale_states <@ array['CONTENT_STALE', 'INDEX_STALE', 'EMBEDDING_STALE', 'REVIEW_OVERDUE']::text[]
  ),
  drop constraint if exists support_knowledge_sources_effective_range_check,
  add constraint support_knowledge_sources_effective_range_check check (
    effective_until is null or effective_from is null or effective_until > effective_from
  );

update public.support_knowledge_sources s
   set lifecycle_status = case
         when s.is_current then 'APPROVED'
         when exists (
           select 1 from public.support_knowledge_sources newer
            where newer.knowledge_item_id = s.knowledge_item_id and newer.revision > s.revision
         ) then 'SUPERSEDED'
         else 'DRAFT'
       end,
       effective_from = coalesce(s.effective_from, s.source_published_at, s.created_at),
       approved_at = case when s.is_current then coalesce(s.approved_at, i.approved_at, s.created_at) else s.approved_at end,
       approved_by_user_id = case when s.is_current then coalesce(s.approved_by_user_id, i.approved_by_user_id) else s.approved_by_user_id end,
       promoted_at = case when s.is_current then coalesce(s.promoted_at, s.updated_at) else s.promoted_at end,
       superseded_at = case when not s.is_current and exists (
         select 1 from public.support_knowledge_sources newer
          where newer.knowledge_item_id = s.knowledge_item_id and newer.revision > s.revision
       ) then coalesce(s.superseded_at, s.updated_at) else s.superseded_at end
  from public.support_knowledge_items i
 where i.id = s.knowledge_item_id;

create index if not exists support_knowledge_sources_governance_idx
  on public.support_knowledge_sources (knowledge_item_id, lifecycle_status, revision desc);
create index if not exists support_knowledge_sources_stale_idx
  on public.support_knowledge_sources using gin (stale_states);

alter table public.support_knowledge_index_states
  add column if not exists embedding_model_id uuid references public.support_embedding_models(id) on delete restrict,
  add column if not exists embedding_model_name text,
  add column if not exists processor_version text,
  add column if not exists indexed_content_hash text;

update public.support_knowledge_index_states idx
   set embedding_model_id = resolved.embedding_model_id,
       embedding_model_name = resolved.model_name,
       processor_version = resolved.processor_version,
       indexed_content_hash = resolved.content_hash
  from (
    select distinct on (s.id)
           s.id as source_id, e.embedding_model_id, em.model_name,
           r.processor_version, c.content_hash
      from public.support_knowledge_sources s
      join public.support_knowledge_chunks c on c.knowledge_source_id = s.id
      join public.support_ingestion_runs r on r.id = c.ingestion_run_id
      join public.support_chunk_embeddings e on e.chunk_id = c.id and e.status = 'INDEXED'
      join public.support_embedding_models em on em.id = e.embedding_model_id
     order by s.id, e.updated_at desc
  ) resolved
 where idx.knowledge_source_id = resolved.source_id
   and idx.status = 'INDEXED';

create table public.support_knowledge_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete restrict,
  knowledge_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  ingestion_run_id uuid references public.support_ingestion_runs(id) on delete restrict,
  event_type text not null check (event_type in (
    'CREATED', 'CONTENT_UPDATED', 'SOURCE_ADDED', 'SOURCE_PROCESSED',
    'SUBMITTED_FOR_REVIEW', 'APPROVED', 'ARCHIVED', 'SUPERSEDED',
    'CURRENT_REVISION_CHANGED', 'ACCESS_CHANGED', 'REPROCESS_REQUESTED',
    'RECHUNK_REQUESTED', 'REINDEX_REQUESTED', 'REEMBED_REQUESTED',
    'PROMOTION_FAILED', 'STALE_STATE_CHANGED'
  )),
  previous_status text,
  new_status text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  reason text,
  version_before integer,
  version_after integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index support_knowledge_lifecycle_events_item_idx
  on public.support_knowledge_lifecycle_events (knowledge_item_id, created_at desc);
create index support_knowledge_lifecycle_events_source_idx
  on public.support_knowledge_lifecycle_events (knowledge_source_id, created_at desc);

alter table public.support_knowledge_lifecycle_events enable row level security;
revoke all on public.support_knowledge_lifecycle_events from public, anon, authenticated;
grant select on public.support_knowledge_lifecycle_events to authenticated;
grant all on public.support_knowledge_lifecycle_events to service_role;
create policy support_knowledge_lifecycle_events_select
  on public.support_knowledge_lifecycle_events for select to authenticated
  using ((select public.can_access_support()));

create table public.support_knowledge_governance_jobs (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete restrict,
  knowledge_source_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  job_type text not null check (job_type in ('REPROCESS', 'RECHUNK', 'REINDEX', 'REEMBED')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  requested_by_user_id uuid references public.app_users(id) on delete set null,
  embedding_model_id uuid references public.support_embedding_models(id) on delete restrict,
  processed_chunk_ids uuid[] not null default '{}',
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index support_knowledge_governance_jobs_item_idx
  on public.support_knowledge_governance_jobs (knowledge_item_id, created_at desc);
alter table public.support_knowledge_governance_jobs enable row level security;
revoke all on public.support_knowledge_governance_jobs from public, anon, authenticated;
grant select on public.support_knowledge_governance_jobs to authenticated;
grant all on public.support_knowledge_governance_jobs to service_role;
create policy support_knowledge_governance_jobs_select
  on public.support_knowledge_governance_jobs for select to authenticated
  using ((select public.can_access_support()));

create or replace function public.support_current_actor_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from public.app_users u
   where auth.uid() is not null
     and (u.auth_user_id = auth.uid() or lower(u.email) = lower(nullif(auth.jwt() ->> 'email', '')))
     and u.portal_role::text = 'timan_backend'
     and coalesce(u.approved, false)
     and coalesce(u.is_active, false)
     and coalesce((u.permissions ->> 'support_access')::boolean, false)
   limit 1
$$;

revoke all on function public.support_current_actor_user_id() from public, anon, authenticated;
grant execute on function public.support_current_actor_user_id() to service_role;

create or replace function public.support_record_knowledge_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.support_current_actor_user_id();
  v_event text;
begin
  if tg_table_name = 'support_knowledge_items' then
    if tg_op = 'INSERT' then
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, event_type, actor_user_id, new_status, version_after
      ) values (new.id, 'CREATED', v_actor, new.status, new.version_number);
      return new;
    end if;
    if new.status is distinct from old.status then
      v_event := case new.status
        when 'REVIEW' then 'SUBMITTED_FOR_REVIEW'
        when 'APPROVED' then 'APPROVED'
        when 'ARCHIVED' then 'ARCHIVED'
        else 'CONTENT_UPDATED'
      end;
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, event_type, actor_user_id, previous_status, new_status,
        version_before, version_after
      ) values (new.id, v_event, v_actor, old.status, new.status, old.version_number, new.version_number);
    end if;
    if new.title is distinct from old.title or new.content is distinct from old.content
       or new.summary is distinct from old.summary or new.source_reference is distinct from old.source_reference then
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, event_type, actor_user_id, version_before, version_after
      ) values (new.id, 'CONTENT_UPDATED', v_actor, old.version_number, new.version_number);
    end if;
    if new.access_scope is distinct from old.access_scope or new.required_area is distinct from old.required_area
       or new.required_module is distinct from old.required_module then
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, event_type, actor_user_id, version_before, version_after,
        metadata
      ) values (
        new.id, 'ACCESS_CHANGED', v_actor, old.version_number, new.version_number,
        jsonb_build_object('previous_access_scope', old.access_scope, 'new_access_scope', new.access_scope)
      );
      update public.support_knowledge_sources
         set stale_states = array(select distinct unnest(stale_states || array['INDEX_STALE']::text[])),
             stale_reason = 'ACCESS_CHANGED'
       where knowledge_item_id = new.id and is_current;
    end if;
    if (new.title is distinct from old.title or new.content is distinct from old.content
        or new.summary is distinct from old.summary or new.source_reference is distinct from old.source_reference)
       and old.status = 'APPROVED' then
      update public.support_knowledge_sources
         set stale_states = array(select distinct unnest(stale_states || array['CONTENT_STALE']::text[])),
             stale_reason = 'APPROVED_CONTENT_CHANGED'
       where knowledge_item_id = new.id and is_current;
    end if;
    return new;
  end if;

  if tg_table_name = 'support_knowledge_sources' then
    if tg_op = 'INSERT' then
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, knowledge_source_id, event_type, actor_user_id,
        new_status, version_after
      ) values (new.knowledge_item_id, new.id, 'SOURCE_ADDED', v_actor, new.lifecycle_status, new.revision);
      return new;
    end if;
    if new.ingestion_status = 'READY_FOR_REVIEW' and old.ingestion_status is distinct from new.ingestion_status then
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, knowledge_source_id, event_type, actor_user_id,
        previous_status, new_status, version_before, version_after
      ) values (
        new.knowledge_item_id, new.id, 'SOURCE_PROCESSED', v_actor,
        old.ingestion_status, new.ingestion_status, old.revision, new.revision
      );
    end if;
    if new.lifecycle_status is distinct from old.lifecycle_status then
      v_event := case new.lifecycle_status
        when 'REVIEW' then 'SUBMITTED_FOR_REVIEW'
        when 'APPROVED' then 'APPROVED'
        when 'SUPERSEDED' then 'SUPERSEDED'
        when 'ARCHIVED' then 'ARCHIVED'
        else 'CONTENT_UPDATED'
      end;
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, knowledge_source_id, event_type, actor_user_id,
        previous_status, new_status, version_before, version_after
      ) values (
        new.knowledge_item_id, new.id, v_event, v_actor,
        old.lifecycle_status, new.lifecycle_status, old.revision, new.revision
      );
    end if;
    if new.is_current is distinct from old.is_current then
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, knowledge_source_id, event_type, actor_user_id,
        reason, version_before, version_after, metadata
      ) values (
        new.knowledge_item_id, new.id, 'CURRENT_REVISION_CHANGED', v_actor,
        case when new.is_current then 'PROMOTED' else 'REPLACED' end,
        old.revision, new.revision, jsonb_build_object('is_current', new.is_current)
      );
    end if;
    if new.stale_states is distinct from old.stale_states then
      insert into public.support_knowledge_lifecycle_events (
        knowledge_item_id, knowledge_source_id, event_type, actor_user_id,
        reason, version_before, version_after, metadata
      ) values (
        new.knowledge_item_id, new.id, 'STALE_STATE_CHANGED', v_actor,
        new.stale_reason, old.revision, new.revision,
        jsonb_build_object('previous', old.stale_states, 'current', new.stale_states)
      );
    end if;
    return new;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.support_record_knowledge_event() from public, anon, authenticated, service_role;

drop trigger if exists support_knowledge_items_lifecycle_audit on public.support_knowledge_items;
create trigger support_knowledge_items_lifecycle_audit
after insert or update on public.support_knowledge_items
for each row execute function public.support_record_knowledge_event();

drop trigger if exists support_knowledge_sources_lifecycle_audit on public.support_knowledge_sources;
create trigger support_knowledge_sources_lifecycle_audit
after insert or update on public.support_knowledge_sources
for each row execute function public.support_record_knowledge_event();

-- The Phase 4 trigger promoted before indexing. Promotion is now explicit and atomic.
drop trigger if exists support_knowledge_items_sync_current_source on public.support_knowledge_items;

create or replace function public.support_transition_source_revision(
  p_source_id uuid,
  p_new_status text,
  p_note text default null
)
returns public.support_knowledge_sources
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.support_current_actor_user_id();
  v_source public.support_knowledge_sources%rowtype;
begin
  if v_actor is null or not public.can_access_support() then
    raise exception 'Support administration access denied' using errcode = '42501';
  end if;
  select * into v_source from public.support_knowledge_sources where id = p_source_id for update;
  if not found then raise exception 'Knowledge source not found' using errcode = 'P0002'; end if;
  if not (
    (v_source.lifecycle_status = 'DRAFT' and p_new_status in ('REVIEW', 'ARCHIVED')) or
    (v_source.lifecycle_status = 'REVIEW' and p_new_status in ('DRAFT', 'APPROVED', 'ARCHIVED')) or
    (v_source.lifecycle_status = 'APPROVED' and p_new_status in ('REVIEW', 'ARCHIVED'))
  ) then
    raise exception 'Invalid source lifecycle transition: % -> %', v_source.lifecycle_status, p_new_status
      using errcode = '23514';
  end if;
  if p_new_status = 'APPROVED' and v_source.ingestion_status <> 'READY_FOR_REVIEW' then
    raise exception 'Source must be processed before approval' using errcode = '23514';
  end if;
  update public.support_knowledge_sources
     set lifecycle_status = p_new_status,
         reviewed_by_user_id = case when p_new_status in ('REVIEW', 'APPROVED') then v_actor else reviewed_by_user_id end,
         reviewed_at = case when p_new_status in ('REVIEW', 'APPROVED') then now() else reviewed_at end,
         approved_by_user_id = case when p_new_status = 'APPROVED' then v_actor else null end,
         approved_at = case when p_new_status = 'APPROVED' then now() else null end,
         stale_states = case when p_new_status = 'APPROVED' then array_remove(stale_states, 'CONTENT_STALE') else stale_states end,
         stale_reason = case when p_new_status = 'APPROVED' then null else stale_reason end
   where id = p_source_id
   returning * into v_source;
  if p_note is not null and btrim(p_note) <> '' then
    insert into public.support_knowledge_lifecycle_events (
      knowledge_item_id, knowledge_source_id, event_type, actor_user_id, reason,
      new_status, version_after
    ) values (
      v_source.knowledge_item_id, v_source.id,
      case when p_new_status = 'REVIEW' then 'SUBMITTED_FOR_REVIEW' else 'APPROVED' end,
      v_actor, left(btrim(p_note), 1000), p_new_status, v_source.revision
    );
  end if;
  return v_source;
end;
$$;

revoke all on function public.support_transition_source_revision(uuid, text, text) from public, anon;
grant execute on function public.support_transition_source_revision(uuid, text, text) to authenticated;

create or replace function public.support_promote_indexed_source(
  p_source_id uuid,
  p_embedding_model_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.support_knowledge_sources%rowtype;
  v_item public.support_knowledge_items%rowtype;
  v_state public.support_knowledge_index_states%rowtype;
  v_model public.support_embedding_models%rowtype;
  v_missing integer;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Source promotion is server-only' using errcode = '42501';
  end if;
  select * into v_source from public.support_knowledge_sources where id = p_source_id for update;
  if not found then return false; end if;
  select * into v_item from public.support_knowledge_items where id = v_source.knowledge_item_id for update;
  select * into v_state from public.support_knowledge_index_states where knowledge_source_id = p_source_id for update;
  select * into v_model from public.support_embedding_models where id = p_embedding_model_id and enabled;
  if v_item.status <> 'APPROVED' or v_source.lifecycle_status <> 'APPROVED'
     or v_source.ingestion_status <> 'READY_FOR_REVIEW' or v_state.status <> 'INDEXED'
     or v_model.id is null then
    return false;
  end if;
  select count(*) into v_missing
    from public.support_knowledge_chunks c
   where c.knowledge_source_id = p_source_id
     and c.ingestion_run_id = v_state.ingestion_run_id
     and not exists (
       select 1 from public.support_chunk_embeddings e
        where e.chunk_id = c.id and e.embedding_model_id = p_embedding_model_id
          and e.status = 'INDEXED' and e.content_hash = c.content_hash and e.embedding is not null
     );
  if v_missing > 0 then return false; end if;

  update public.support_knowledge_sources
     set is_current = false,
         lifecycle_status = 'SUPERSEDED',
         effective_until = coalesce(effective_until, now()),
         superseded_at = now()
   where knowledge_item_id = v_source.knowledge_item_id and is_current and id <> p_source_id;

  update public.support_knowledge_sources
     set is_current = true,
         promoted_at = now(),
         effective_from = coalesce(effective_from, now()),
         effective_until = null,
         superseded_at = null,
         stale_states = array_remove(array_remove(array_remove(stale_states, 'INDEX_STALE'), 'EMBEDDING_STALE'), 'CONTENT_STALE'),
         stale_reason = null
   where id = p_source_id;
  return true;
exception when others then
  insert into public.support_knowledge_lifecycle_events (
    knowledge_item_id, knowledge_source_id, event_type, reason, version_after
  ) values (
    coalesce(v_source.knowledge_item_id, v_item.id), p_source_id, 'PROMOTION_FAILED', sqlstate || ':' || sqlerrm, v_source.revision
  );
  return false;
end;
$$;

revoke all on function public.support_promote_indexed_source(uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_promote_indexed_source(uuid, uuid) to service_role;

create or replace function public.support_refresh_review_staleness()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.support_knowledge_sources s
     set stale_states = array(select distinct unnest(s.stale_states || array['REVIEW_OVERDUE']::text[])),
         stale_reason = coalesce(s.stale_reason, 'NEXT_REVIEW_OVERDUE')
    from public.support_knowledge_items i
   where i.id = s.knowledge_item_id and s.is_current and i.status = 'APPROVED'
     and i.next_review_at is not null and i.next_review_at < now()
     and not ('REVIEW_OVERDUE' = any(s.stale_states));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.support_refresh_review_staleness() from public, anon, authenticated;
grant execute on function public.support_refresh_review_staleness() to service_role;

create or replace function public.support_retrieve_authorized_chunks_v2(
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
  uuid, extensions.vector, text, integer, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.support_retrieve_authorized_chunks_v2(
  uuid, extensions.vector, text, integer, integer, text, text, uuid
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
   where i.status = 'APPROVED' and s.is_current
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

create or replace function public.get_support_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.can_access_support() then
    raise exception 'Support administration access denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total_questions', (select count(*) from public.support_questions),
    'unique_users', (select count(distinct asked_by_user_id) from public.support_questions where asked_by_user_id is not null),
    'answered_questions', (select count(*) from public.support_questions where result_status = 'ANSWERED'),
    'grounded_answers', (select count(*) from public.support_responses where answer_status = 'ACCEPTED' and grounded),
    'no_answer_questions', (select count(*) from public.support_questions where result_status = 'NO_ANSWER'),
    'positive_feedback', (select count(*) from public.support_feedback where sentiment = 'POSITIVE'),
    'total_feedback', (select count(*) from public.support_feedback),
    'average_response_time_ms', (select coalesce(avg(latency_ms), 0) from public.support_responses where latency_ms is not null),
    'questions_today', (select count(*) from public.support_questions where created_at >= date_trunc('day', now())),
    'questions_7_days', (select count(*) from public.support_questions where created_at >= now() - interval '7 days'),
    'questions_30_days', (select count(*) from public.support_questions where created_at >= now() - interval '30 days'),
    'open_knowledge_gaps', (select count(*) from public.support_knowledge_gaps where status in ('OPEN', 'REVIEWING')),
    'approved_knowledge_items', (select count(*) from public.support_knowledge_items where status = 'APPROVED'),
    'total_requests', (select count(*) from public.support_usage_events),
    'successful_requests', (select count(*) from public.support_usage_events where request_status = 'SUCCESS'),
    'failed_requests', (select count(*) from public.support_usage_events where request_status = 'FAILED'),
    'p95_latency_ms', (select coalesce(percentile_cont(0.95) within group (order by total_latency_ms), 0) from public.support_usage_events where total_latency_ms is not null),
    'total_input_tokens', (select coalesce(sum(input_tokens), 0) from public.support_usage_events),
    'total_output_tokens', (select coalesce(sum(output_tokens), 0) from public.support_usage_events),
    'total_cached_tokens', (select coalesce(sum(cached_tokens), 0) from public.support_usage_events),
    'estimated_cost', (select coalesce(sum(estimated_cost), 0) from public.support_usage_events),
    'confidence_high', (select count(*) from public.support_questions where confidence_level = 'HIGH'),
    'confidence_medium', (select count(*) from public.support_questions where confidence_level = 'MEDIUM'),
    'confidence_low', (select count(*) from public.support_questions where confidence_level = 'LOW'),
    'confidence_none', (select count(*) from public.support_questions where confidence_level = 'NO_GROUNDED_ANSWER'),
    'confidence_unknown', (select count(*) from public.support_questions where confidence_level is null),
    'clarification_requests', (select count(*) from public.support_questions where clarification_requested),
    'source_conflicts', (select count(*) from public.support_questions where source_conflict),
    'stale_knowledge_blocks', (select count(*) from public.support_questions where stale_knowledge_blocked),
    'overdue_reviews', (select count(*) from public.support_knowledge_items where status = 'APPROVED' and next_review_at < now()),
    'reindex_jobs', (select count(*) from public.support_knowledge_governance_jobs where job_type = 'REINDEX'),
    'reembed_jobs', (select count(*) from public.support_knowledge_governance_jobs where job_type = 'REEMBED'),
    'failed_promotions', (select count(*) from public.support_knowledge_lifecycle_events where event_type = 'PROMOTION_FAILED')
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_support_admin_overview() from public, anon, authenticated, service_role;
grant execute on function public.get_support_admin_overview() to authenticated;

comment on table public.support_knowledge_lifecycle_events is
  'Append-only Phase 6 lifecycle and version audit. Authenticated clients may read only with canonical Support authorization.';
comment on function public.support_promote_indexed_source(uuid, uuid) is
  'Atomically promotes a human-approved, fully indexed source revision. A failed replacement never removes the current source.';
comment on function public.support_retrieve_authorized_chunks_v2(uuid, extensions.vector, text, integer, integer, text, text, uuid) is
  'Authorization-first Phase 6 retrieval with current-version, effective-date, active-model and explicit stale-state policy.';
