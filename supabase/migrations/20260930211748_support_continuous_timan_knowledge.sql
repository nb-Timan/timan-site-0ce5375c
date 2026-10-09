-- Controlled Timan.dk discovery, review candidates and audited web fallback.
-- Existing Phase 6 lifecycle remains authoritative: discovered content enters REVIEW
-- and is not retrievable until a Backend user approves and indexes the revision.

alter table public.support_controlled_source_registry
  add column if not exists title text,
  add column if not exists category text,
  add column if not exists product_relations text[] not null default '{}',
  add column if not exists previous_content_hash text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists source_state text not null default 'ACTIVE',
  add column if not exists last_http_status integer,
  add column if not exists discovery_method text;

alter table public.support_controlled_source_registry
  drop constraint if exists support_controlled_source_registry_source_state_check;
alter table public.support_controlled_source_registry
  add constraint support_controlled_source_registry_source_state_check
  check (source_state in ('ACTIVE', 'CHANGED', 'MISSING', 'ERROR'));
alter table public.support_controlled_source_registry
  drop constraint if exists support_controlled_source_registry_previous_hash_check;
alter table public.support_controlled_source_registry
  add constraint support_controlled_source_registry_previous_hash_check
  check (previous_content_hash is null or previous_content_hash ~ '^[0-9a-f]{64}$');

alter table public.support_ingestion_runs
  drop constraint if exists support_ingestion_runs_run_reason_check;
alter table public.support_ingestion_runs
  add constraint support_ingestion_runs_run_reason_check
  check (run_reason in ('UPLOAD', 'REPROCESS', 'RECHUNK', 'TIMAN_DK_SYNC'));

create table public.support_knowledge_sync_config (
  id boolean primary key default true check (id),
  sync_enabled boolean not null default true,
  auto_promotion_enabled boolean not null default false,
  allowed_domains text[] not null default array['timan.dk', 'www.timan.dk'],
  enabled_languages text[] not null default array['da','en','de','it','hu','sv','fr','pl','cs'],
  priority_languages text[] not null default array['da','en','de'],
  wordpress_page_types text[] not null default array['pages','posts'],
  max_pages_per_run integer not null default 900 check (max_pages_per_run between 1 and 2000),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.support_knowledge_sync_config (id)
values (true)
on conflict (id) do nothing;

create table public.support_knowledge_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('MANUAL', 'SCHEDULED')),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  requested_by_user_id uuid references public.app_users(id) on delete set null,
  discovered_count integer not null default 0,
  created_count integer not null default 0,
  changed_count integer not null default 0,
  unchanged_count integer not null default 0,
  missing_count integer not null default 0,
  failed_count integer not null default 0,
  language_counts jsonb not null default '{}'::jsonb,
  discovery_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.support_web_knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  normalized_group_key text not null unique,
  canonical_url text not null,
  title text,
  language text not null,
  query_text text not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  status text not null default 'REVIEW' check (status in ('REVIEW', 'ACCEPTED', 'DISMISSED')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_question_id uuid references public.support_questions(id) on delete set null,
  knowledge_item_id uuid references public.support_knowledge_items(id) on delete restrict,
  check (canonical_url ~ '^https://(www\.)?timan\.dk(/|$)')
);

create table public.support_web_search_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  question_id uuid references public.support_questions(id) on delete set null,
  response_id uuid references public.support_responses(id) on delete set null,
  provider text not null default 'openai',
  model_name text not null,
  provider_request_id text,
  query_text text not null,
  portal_language text not null,
  allowed_domains text[] not null,
  source_urls text[] not null default '{}',
  source_titles text[] not null default '{}',
  status text not null check (status in ('SUCCESS', 'NO_MATCH', 'FAILED', 'BLOCKED')),
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric,
  latency_ms integer,
  error_category text,
  created_at timestamptz not null default now()
);

create index support_controlled_source_registry_state_idx
  on public.support_controlled_source_registry (source_state, approval_state, language);
create index support_knowledge_sync_runs_started_idx
  on public.support_knowledge_sync_runs (started_at desc);
create index support_knowledge_sync_runs_requested_by_idx
  on public.support_knowledge_sync_runs (requested_by_user_id)
  where requested_by_user_id is not null;
create index support_web_candidates_status_idx
  on public.support_web_knowledge_candidates (status, last_seen_at desc);
create index support_web_candidates_question_idx
  on public.support_web_knowledge_candidates (last_question_id)
  where last_question_id is not null;
create index support_web_candidates_knowledge_item_idx
  on public.support_web_knowledge_candidates (knowledge_item_id)
  where knowledge_item_id is not null;
create index support_web_search_events_created_idx
  on public.support_web_search_events (created_at desc);
create index support_web_search_events_question_idx
  on public.support_web_search_events (question_id)
  where question_id is not null;
create index support_web_search_events_response_idx
  on public.support_web_search_events (response_id)
  where response_id is not null;

alter table public.support_knowledge_sync_config enable row level security;
alter table public.support_knowledge_sync_runs enable row level security;
alter table public.support_web_knowledge_candidates enable row level security;
alter table public.support_web_search_events enable row level security;

revoke all on public.support_knowledge_sync_config from public, anon, authenticated;
revoke all on public.support_knowledge_sync_runs from public, anon, authenticated;
revoke all on public.support_web_knowledge_candidates from public, anon, authenticated;
revoke all on public.support_web_search_events from public, anon, authenticated;

grant select on public.support_knowledge_sync_config to authenticated;
grant select on public.support_knowledge_sync_runs to authenticated;
grant select on public.support_web_knowledge_candidates to authenticated;
grant select on public.support_web_search_events to authenticated;
grant all on public.support_knowledge_sync_config to service_role;
grant all on public.support_knowledge_sync_runs to service_role;
grant all on public.support_web_knowledge_candidates to service_role;
grant all on public.support_web_search_events to service_role;

create policy support_sync_config_read on public.support_knowledge_sync_config
for select to authenticated using (public.can_access_support());
create policy support_sync_runs_read on public.support_knowledge_sync_runs
for select to authenticated using (public.can_access_support());
create policy support_web_candidates_read on public.support_web_knowledge_candidates
for select to authenticated using (public.can_access_support());
create policy support_web_events_read on public.support_web_search_events
for select to authenticated using (public.can_access_support());

create trigger support_knowledge_sync_config_touch_updated_at
before update on public.support_knowledge_sync_config
for each row execute function public.support_touch_updated_at();

create or replace function public.is_support_knowledge_sync_scheduler(p_secret text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'support_knowledge_sync_scheduler_secret'
      and decrypted_secret = p_secret
  );
$$;

revoke all on function public.is_support_knowledge_sync_scheduler(text) from public, anon, authenticated;
grant execute on function public.is_support_knowledge_sync_scheduler(text) to service_role;

create or replace function public.get_support_knowledge_sync_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not public.can_access_support() then
    raise exception 'Support administration access denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'sync_enabled', coalesce((select sync_enabled from public.support_knowledge_sync_config where id = true), false),
    'auto_promotion_enabled', coalesce((select auto_promotion_enabled from public.support_knowledge_sync_config where id = true), false),
    'last_sync_at', (select completed_at from public.support_knowledge_sync_runs where status = 'COMPLETED' order by completed_at desc limit 1),
    'last_sync_status', (select status from public.support_knowledge_sync_runs order by started_at desc limit 1),
    'timan_sources_total', (select count(*) from public.support_controlled_source_registry),
    'timan_sources_review', (select count(*) from public.support_controlled_source_registry where approval_state = 'REVIEW'),
    'timan_sources_approved', (select count(*) from public.support_controlled_source_registry where approval_state = 'APPROVED'),
    'timan_sources_changed', (select count(*) from public.support_controlled_source_registry where source_state = 'CHANGED'),
    'timan_sources_stale', (select count(*) from public.support_controlled_source_registry where source_state in ('MISSING','ERROR')),
    'timan_sources_indexed', (select count(*) from public.support_controlled_source_registry r join public.support_knowledge_sources s on s.knowledge_item_id = r.knowledge_item_id and s.is_current join public.support_knowledge_index_states i on i.knowledge_source_id = s.id and i.status = 'INDEXED'),
    'web_candidates_review', (select count(*) from public.support_web_knowledge_candidates where status = 'REVIEW'),
    'web_fallback_30d', (select count(*) from public.support_web_search_events where status = 'SUCCESS' and created_at >= now() - interval '30 days'),
    'source_breakdown_30d', jsonb_build_object(
      'structured', (select count(*) from public.support_usage_events where provider = 'STRUCTURED' and created_at >= now() - interval '30 days'),
      'rag', (select count(*) from public.support_usage_events where provider = 'openai' and coalesce(candidate_count,0) > 0 and created_at >= now() - interval '30 days'),
      'timan_web', (select count(*) from public.support_web_search_events where status = 'SUCCESS' and created_at >= now() - interval '30 days'),
      'safe_fallback', (select count(*) from public.support_questions where result_status = 'NO_ANSWER' and created_at >= now() - interval '30 days')
    ),
    'language_counts', coalesce((select jsonb_object_agg(language, source_count) from (
      select language, count(*) source_count from public.support_controlled_source_registry group by language order by language
    ) x), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_support_knowledge_sync_overview() from public, anon;
grant execute on function public.get_support_knowledge_sync_overview() to authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'support_knowledge_sync_scheduler_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'support_knowledge_sync_scheduler_secret',
      'Authenticates the controlled Timan.dk Knowledge scheduler.'
    );
  end if;
end;
$$;

do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'support-timan-knowledge-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'support-timan-knowledge-daily',
    '23 2 * * *',
    $cron$
      select net.http_post(
        url := 'https://rdodyoixxybiozvmuqon.supabase.co/functions/v1/support-knowledge-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'sb_publishable_yGHuYBzLY-dRDJ0U_s5FRw_CXIwFHK2',
          'x-support-knowledge-sync-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'support_knowledge_sync_scheduler_secret'
          )
        ),
        body := '{"action":"sync"}'::jsonb
      );
    $cron$
  );
end;
$$;

comment on table public.support_knowledge_sync_config is
  'Controlled Timan.dk sync configuration. Auto-promotion is deliberately disabled.';
comment on table public.support_web_knowledge_candidates is
  'Review-only candidates discovered by domain-locked Timan.dk web fallback.';
