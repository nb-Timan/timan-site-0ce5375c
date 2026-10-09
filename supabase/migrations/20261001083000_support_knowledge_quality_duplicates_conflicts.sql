-- Canonical Knowledge Quality layer. Additive only: no Knowledge source, chunk, or audit row is deleted.

alter table public.support_knowledge_sources
  add column if not exists quality_status text not null default 'READY_FOR_REVIEW',
  add column if not exists quality_score integer not null default 100,
  add column if not exists quality_reasons text[] not null default '{}',
  add column if not exists topic_key text,
  add column if not exists authority_tier smallint not null default 4,
  add column if not exists authority_kind text not null default 'OTHER_APPROVED',
  add column if not exists retrieval_excluded boolean not null default false;

alter table public.support_knowledge_sources
  drop constraint if exists support_knowledge_sources_quality_status_check,
  add constraint support_knowledge_sources_quality_status_check check (quality_status in (
    'READY_FOR_REVIEW', 'REJECTED_EXTRACTION_NOISE', 'DUPLICATE', 'NEAR_DUPLICATE',
    'EMPTY_CONTENT', 'LANGUAGE_MISMATCH'
  )),
  drop constraint if exists support_knowledge_sources_quality_score_check,
  add constraint support_knowledge_sources_quality_score_check check (quality_score between 0 and 100),
  drop constraint if exists support_knowledge_sources_authority_tier_check,
  add constraint support_knowledge_sources_authority_tier_check check (authority_tier between 1 and 4),
  drop constraint if exists support_knowledge_sources_authority_kind_check,
  add constraint support_knowledge_sources_authority_kind_check check (authority_kind in (
    'CANONICAL_DOCUMENT', 'TIMAN_DK', 'INTERNAL_FAQ', 'OTHER_APPROVED'
  ));

update public.support_knowledge_sources s
   set authority_tier = case
         when s.source_type = 'TIMAN_DK_REGISTRY' then 2
         when i.knowledge_type = 'MANUAL_QA' then 3
         when s.source_type in ('UPLOADED_PDF', 'PLAIN_TEXT') then 1
         else 4
       end,
       authority_kind = case
         when s.source_type = 'TIMAN_DK_REGISTRY' then 'TIMAN_DK'
         when i.knowledge_type = 'MANUAL_QA' then 'INTERNAL_FAQ'
         when s.source_type in ('UPLOADED_PDF', 'PLAIN_TEXT') then 'CANONICAL_DOCUMENT'
         else 'OTHER_APPROVED'
       end
  from public.support_knowledge_items i
 where i.id = s.knowledge_item_id;

create index if not exists support_knowledge_sources_quality_idx
  on public.support_knowledge_sources (quality_status, source_language, created_at desc);
create index if not exists support_knowledge_sources_topic_idx
  on public.support_knowledge_sources (topic_key, source_language) where topic_key is not null;
create index if not exists support_knowledge_sources_authority_idx
  on public.support_knowledge_sources (authority_tier, is_current, lifecycle_status);

alter table public.support_knowledge_sync_runs
  add column if not exists quality_clean_count integer not null default 0,
  add column if not exists quality_needs_review_count integer not null default 0,
  add column if not exists quality_rejected_count integer not null default 0,
  add column if not exists near_duplicate_count integer not null default 0,
  add column if not exists potential_conflict_count integer not null default 0;

create table public.support_knowledge_quality_assessments (
  id uuid primary key default gen_random_uuid(),
  knowledge_source_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  ingestion_run_id uuid references public.support_ingestion_runs(id) on delete restrict,
  assessment_version text not null,
  status text not null check (status in (
    'READY_FOR_REVIEW', 'REJECTED_EXTRACTION_NOISE', 'DUPLICATE', 'NEAR_DUPLICATE',
    'EMPTY_CONTENT', 'LANGUAGE_MISMATCH'
  )),
  score integer not null check (score between 0 and 100),
  reasons text[] not null default '{}',
  markup_residue_count integer not null default 0 check (markup_residue_count >= 0),
  meaningful_character_count integer not null default 0 check (meaningful_character_count >= 0),
  normalized_content_hash text,
  canonical_url text,
  source_type text not null,
  language text not null,
  metadata jsonb not null default '{}'::jsonb,
  assessed_at timestamptz not null default now(),
  unique (knowledge_source_id, assessment_version)
);

create table public.support_knowledge_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null unique,
  category text,
  product_relations text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_knowledge_topic_variants (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.support_knowledge_topics(id) on delete restrict,
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete restrict,
  knowledge_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  language text not null,
  canonical_url text,
  created_at timestamptz not null default now(),
  unique (topic_id, knowledge_item_id, language)
);

create table public.support_knowledge_duplicate_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_key text not null unique,
  source_a_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  source_b_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  language text not null,
  similarity_score numeric(6,5) not null check (similarity_score between 0 and 1),
  detection_methods text[] not null default '{}',
  matching_headings text[] not null default '{}',
  shared_relations text[] not null default '{}',
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  resolution text check (resolution in ('KEEP_BOTH', 'KEEP_A', 'KEEP_B', 'LINK_SAME_TOPIC', 'NEEDS_MORE_INFORMATION')),
  resolution_note text,
  resolved_by_user_id uuid references public.app_users(id) on delete set null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (source_a_id <> source_b_id)
);

create table public.support_knowledge_conflicts (
  id uuid primary key default gen_random_uuid(),
  conflict_key text not null unique,
  subject text not null,
  attribute text not null,
  source_a_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  source_b_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  value_a text not null,
  value_b text not null,
  context_a text,
  context_b text,
  language text not null,
  severity text not null default 'MATERIAL' check (severity in ('INFORMATIONAL', 'MATERIAL', 'CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  resolution text check (resolution in (
    'KEEP_SOURCE_A', 'KEEP_SOURCE_B', 'BOTH_VALID_DIFFERENT_CONTEXT',
    'SOURCE_A_SUPERSEDED', 'SOURCE_B_SUPERSEDED', 'NEEDS_MORE_INFORMATION'
  )),
  resolution_note text,
  resolved_by_user_id uuid references public.app_users(id) on delete set null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (source_a_id <> source_b_id)
);

create table public.support_knowledge_quality_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'QUALITY_ASSESSED', 'DUPLICATE_DETECTED', 'DUPLICATE_RESOLVED',
    'CONFLICT_DETECTED', 'CONFLICT_RESOLVED', 'TOPIC_LINKED'
  )),
  knowledge_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  duplicate_cluster_id uuid references public.support_knowledge_duplicate_clusters(id) on delete restrict,
  conflict_id uuid references public.support_knowledge_conflicts(id) on delete restrict,
  actor_user_id uuid references public.app_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index support_knowledge_quality_assessments_status_idx
  on public.support_knowledge_quality_assessments (status, language, assessed_at desc);
create index support_knowledge_topic_variants_item_idx
  on public.support_knowledge_topic_variants (knowledge_item_id, language);
create index support_knowledge_duplicate_clusters_status_idx
  on public.support_knowledge_duplicate_clusters (status, similarity_score desc, detected_at desc);
create index support_knowledge_conflicts_status_idx
  on public.support_knowledge_conflicts (status, severity, detected_at desc);
create index support_knowledge_quality_events_created_idx
  on public.support_knowledge_quality_events (created_at desc);

create or replace function public.support_knowledge_quality_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger support_knowledge_topics_touch_updated_at
before update on public.support_knowledge_topics
for each row execute function public.support_knowledge_quality_touch_updated_at();
create trigger support_knowledge_duplicate_clusters_touch_updated_at
before update on public.support_knowledge_duplicate_clusters
for each row execute function public.support_knowledge_quality_touch_updated_at();
create trigger support_knowledge_conflicts_touch_updated_at
before update on public.support_knowledge_conflicts
for each row execute function public.support_knowledge_quality_touch_updated_at();

create or replace function public.support_prevent_quality_event_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'SUPPORT_KNOWLEDGE_QUALITY_EVENTS_APPEND_ONLY';
end;
$$;

create trigger support_knowledge_quality_events_append_only
before update or delete on public.support_knowledge_quality_events
for each row execute function public.support_prevent_quality_event_mutation();

create or replace function public.support_record_quality_detection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'support_knowledge_duplicate_clusters' then
    insert into public.support_knowledge_quality_events(event_type, duplicate_cluster_id, metadata)
    values ('DUPLICATE_DETECTED', new.id, jsonb_build_object('similarity', new.similarity_score, 'methods', new.detection_methods));
  else
    insert into public.support_knowledge_quality_events(event_type, conflict_id, metadata)
    values ('CONFLICT_DETECTED', new.id, jsonb_build_object('subject', new.subject, 'attribute', new.attribute, 'severity', new.severity));
  end if;
  return new;
end;
$$;

create trigger support_knowledge_duplicate_detection_audit
after insert on public.support_knowledge_duplicate_clusters
for each row execute function public.support_record_quality_detection();
create trigger support_knowledge_conflict_detection_audit
after insert on public.support_knowledge_conflicts
for each row execute function public.support_record_quality_detection();

create or replace function public.support_enforce_knowledge_quality_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lifecycle_status = 'APPROVED' and old.lifecycle_status is distinct from 'APPROVED' then
    if new.quality_status <> 'READY_FOR_REVIEW' then
      if not (new.quality_status = 'NEAR_DUPLICATE' and exists (
        select 1 from public.support_knowledge_duplicate_clusters d
         where (d.source_a_id = new.id or d.source_b_id = new.id)
           and d.status = 'RESOLVED'
           and d.resolution in ('KEEP_BOTH', 'KEEP_A', 'KEEP_B', 'LINK_SAME_TOPIC')
      )) then
        raise exception 'KNOWLEDGE_QUALITY_REVIEW_REQUIRED';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger support_knowledge_quality_approval_gate
before update of lifecycle_status on public.support_knowledge_sources
for each row execute function public.support_enforce_knowledge_quality_approval();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'support_knowledge_quality_assessments', 'support_knowledge_topics',
    'support_knowledge_topic_variants', 'support_knowledge_duplicate_clusters',
    'support_knowledge_conflicts', 'support_knowledge_quality_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.can_access_support()))',
      table_name || '_select_support', table_name
    );
  end loop;
end $$;

create or replace function public.resolve_support_knowledge_duplicate(
  p_cluster_id uuid,
  p_resolution text,
  p_note text default null
) returns public.support_knowledge_duplicate_clusters
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_row public.support_knowledge_duplicate_clusters%rowtype;
begin
  if not public.can_access_support() then raise exception 'FORBIDDEN'; end if;
  if p_resolution not in ('KEEP_BOTH', 'KEEP_A', 'KEEP_B', 'LINK_SAME_TOPIC', 'NEEDS_MORE_INFORMATION') then
    raise exception 'INVALID_RESOLUTION';
  end if;
  v_actor := public.support_current_actor_user_id();
  if v_actor is null then raise exception 'FORBIDDEN'; end if;
  select * into v_row from public.support_knowledge_duplicate_clusters where id = p_cluster_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.support_knowledge_duplicate_clusters
     set status = case when p_resolution = 'NEEDS_MORE_INFORMATION' then 'OPEN' else 'RESOLVED' end,
         resolution = p_resolution, resolution_note = nullif(trim(p_note), ''),
         resolved_by_user_id = v_actor,
         resolved_at = case when p_resolution = 'NEEDS_MORE_INFORMATION' then null else now() end
   where id = p_cluster_id returning * into v_row;
  if p_resolution = 'KEEP_A' then
    update public.support_knowledge_sources set retrieval_excluded = true where id = v_row.source_b_id;
  elsif p_resolution = 'KEEP_B' then
    update public.support_knowledge_sources set retrieval_excluded = true where id = v_row.source_a_id;
  end if;
  insert into public.support_knowledge_quality_events(event_type, duplicate_cluster_id, actor_user_id, metadata)
  values ('DUPLICATE_RESOLVED', v_row.id, v_actor, jsonb_build_object('resolution', p_resolution, 'note', p_note));
  return v_row;
end;
$$;

create or replace function public.resolve_support_knowledge_conflict(
  p_conflict_id uuid,
  p_resolution text,
  p_note text default null
) returns public.support_knowledge_conflicts
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_row public.support_knowledge_conflicts%rowtype;
begin
  if not public.can_access_support() then raise exception 'FORBIDDEN'; end if;
  if p_resolution not in (
    'KEEP_SOURCE_A', 'KEEP_SOURCE_B', 'BOTH_VALID_DIFFERENT_CONTEXT',
    'SOURCE_A_SUPERSEDED', 'SOURCE_B_SUPERSEDED', 'NEEDS_MORE_INFORMATION'
  ) then raise exception 'INVALID_RESOLUTION'; end if;
  v_actor := public.support_current_actor_user_id();
  if v_actor is null then raise exception 'FORBIDDEN'; end if;
  select * into v_row from public.support_knowledge_conflicts where id = p_conflict_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.support_knowledge_conflicts
     set status = case when p_resolution = 'NEEDS_MORE_INFORMATION' then 'OPEN' else 'RESOLVED' end,
         resolution = p_resolution, resolution_note = nullif(trim(p_note), ''),
         resolved_by_user_id = v_actor,
         resolved_at = case when p_resolution = 'NEEDS_MORE_INFORMATION' then null else now() end
   where id = p_conflict_id returning * into v_row;
  if p_resolution in ('KEEP_SOURCE_A', 'SOURCE_B_SUPERSEDED') then
    update public.support_knowledge_sources set retrieval_excluded = true where id = v_row.source_b_id;
  elsif p_resolution in ('KEEP_SOURCE_B', 'SOURCE_A_SUPERSEDED') then
    update public.support_knowledge_sources set retrieval_excluded = true where id = v_row.source_a_id;
  end if;
  insert into public.support_knowledge_quality_events(event_type, conflict_id, actor_user_id, metadata)
  values ('CONFLICT_RESOLVED', v_row.id, v_actor, jsonb_build_object('resolution', p_resolution, 'note', p_note));
  return v_row;
end;
$$;

revoke all on function public.resolve_support_knowledge_duplicate(uuid, text, text) from public, anon;
grant execute on function public.resolve_support_knowledge_duplicate(uuid, text, text) to authenticated, service_role;
revoke all on function public.resolve_support_knowledge_conflict(uuid, text, text) from public, anon;
grant execute on function public.resolve_support_knowledge_conflict(uuid, text, text) to authenticated, service_role;

create or replace function public.get_support_knowledge_quality_overview()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.can_access_support() then jsonb_build_object(
    'exact_duplicates_blocked', (select count(*) from public.support_knowledge_quality_assessments where status = 'DUPLICATE'),
    'near_duplicates_open', (select count(*) from public.support_knowledge_duplicate_clusters where status = 'OPEN'),
    'open_conflicts', (select count(*) from public.support_knowledge_conflicts where status = 'OPEN'),
    'resolved_conflicts', (select count(*) from public.support_knowledge_conflicts where status = 'RESOLVED'),
    'extraction_failures', (select count(*) from public.support_knowledge_quality_assessments where status in ('EMPTY_CONTENT', 'LANGUAGE_MISMATCH')),
    'markup_noise_failures', (select count(*) from public.support_knowledge_quality_assessments where status = 'REJECTED_EXTRACTION_NOISE'),
    'language_quality', coalesce((select jsonb_object_agg(language, counts) from (
      select language, jsonb_build_object(
        'clean', count(*) filter (where status = 'READY_FOR_REVIEW'),
        'needs_review', count(*) filter (where status = 'NEAR_DUPLICATE'),
        'rejected', count(*) filter (where status in ('REJECTED_EXTRACTION_NOISE', 'EMPTY_CONTENT', 'LANGUAGE_MISMATCH', 'DUPLICATE'))
      ) counts from public.support_knowledge_quality_assessments group by language
    ) per_language), '{}'::jsonb)
  ) else null end;
$$;

revoke all on function public.get_support_knowledge_quality_overview() from public, anon;
grant execute on function public.get_support_knowledge_quality_overview() to authenticated, service_role;

insert into public.support_knowledge_quality_assessments (
  knowledge_source_id, ingestion_run_id, assessment_version, status, score, reasons,
  markup_residue_count, meaningful_character_count, normalized_content_hash,
  canonical_url, source_type, language, metadata
)
select s.id, r.id, 'knowledge-quality-v1',
       case when coalesce(length(trim(r.extracted_text)), 0) < 40 then 'EMPTY_CONTENT'
            when r.extracted_text ~* '(\[/?vc_[^]]*\]|<[^>]+>)' then 'REJECTED_EXTRACTION_NOISE'
            else 'READY_FOR_REVIEW' end,
       case when coalesce(length(trim(r.extracted_text)), 0) < 40 then 10
            when r.extracted_text ~* '(\[/?vc_[^]]*\]|<[^>]+>)' then 40 else 100 end,
       case when coalesce(length(trim(r.extracted_text)), 0) < 40 then array['MEANINGFUL_TEXT_TOO_SHORT']
            when r.extracted_text ~* '(\[/?vc_[^]]*\]|<[^>]+>)' then array['LEGACY_MARKUP_REQUIRES_REPROCESSING']
            else '{}'::text[] end,
       case when r.extracted_text ~* '(\[/?vc_[^]]*\]|<[^>]+>)' then 1 else 0 end,
       coalesce(length(regexp_replace(r.extracted_text, '[^[:alnum:]]', '', 'g')), 0),
       s.normalized_content_hash, s.original_url, s.source_type, s.source_language,
       jsonb_build_object('backfilled', true)
  from public.support_knowledge_sources s
  left join lateral (
    select run.* from public.support_ingestion_runs run
     where run.knowledge_source_id = s.id order by run.created_at desc limit 1
  ) r on true
on conflict (knowledge_source_id, assessment_version) do nothing;

update public.support_knowledge_sources s
   set quality_status = q.status, quality_score = q.score, quality_reasons = q.reasons
  from public.support_knowledge_quality_assessments q
 where q.knowledge_source_id = s.id and q.assessment_version = 'knowledge-quality-v1';

create or replace function public.support_knowledge_topic_key(p_url text, p_category text, p_relations text[])
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_path text;
  v_relations text;
begin
  v_path := regexp_replace(coalesce(p_url, ''), '^https://(www\.)?timan\.dk/?', '', 'i');
  v_path := regexp_replace(v_path, '^(da|dk|en|gb|de|it|hu|se|sv|fr|pl|cz|cs)(/|$)', '', 'i');
  v_path := '/' || trim(both '/' from regexp_replace(lower(v_path), '[^a-z0-9/-]+', '-', 'g'));
  select coalesce(string_agg(lower(trim(value)), ',' order by lower(trim(value))), '')
    into v_relations from unnest(coalesce(p_relations, '{}'::text[])) value where trim(value) <> '';
  return v_path || '|' || lower(coalesce(trim(p_category), '')) || '|' || v_relations;
end;
$$;

insert into public.support_knowledge_topics(topic_key, category, product_relations)
select distinct on (public.support_knowledge_topic_key(r.canonical_url, r.category, r.product_relations))
       public.support_knowledge_topic_key(r.canonical_url, r.category, r.product_relations),
       r.category, r.product_relations
  from public.support_controlled_source_registry r
 where r.domain = 'timan.dk'
 order by public.support_knowledge_topic_key(r.canonical_url, r.category, r.product_relations), r.updated_at desc
on conflict (topic_key) do update set
  category = coalesce(excluded.category, public.support_knowledge_topics.category),
  product_relations = case when cardinality(excluded.product_relations) > 0 then excluded.product_relations else public.support_knowledge_topics.product_relations end;

insert into public.support_knowledge_topic_variants(topic_id, knowledge_item_id, knowledge_source_id, language, canonical_url)
select t.id, r.knowledge_item_id, s.id, r.language, r.canonical_url
  from public.support_controlled_source_registry r
  join public.support_knowledge_topics t on t.topic_key = public.support_knowledge_topic_key(r.canonical_url, r.category, r.product_relations)
  left join lateral (
    select src.id from public.support_knowledge_sources src where src.knowledge_item_id = r.knowledge_item_id order by src.revision desc limit 1
  ) s on true
 where r.knowledge_item_id is not null
on conflict (topic_id, knowledge_item_id, language) do update set
  knowledge_source_id = excluded.knowledge_source_id, canonical_url = excluded.canonical_url;

update public.support_knowledge_sources s
   set topic_key = t.topic_key
  from public.support_knowledge_topic_variants v
  join public.support_knowledge_topics t on t.id = v.topic_id
 where v.knowledge_source_id = s.id;

comment on table public.support_knowledge_quality_assessments is 'Observable, versioned ingestion quality gates. Historical assessments are retained.';
comment on table public.support_knowledge_duplicate_clusters is 'Human-reviewed exact and semantic duplicate candidates; source records remain immutable.';
comment on table public.support_knowledge_conflicts is 'Potential fact conflicts with contextual, auditable human resolution.';
comment on table public.support_knowledge_quality_events is 'Append-only audit for Knowledge Quality detections and reviewer decisions.';
