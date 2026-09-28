-- Timan Assistant Phase 3: Backend administration and observability foundation.
-- No AI provider, retrieval engine, embeddings, automatic ingestion or fake
-- production records are introduced by this migration.

create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  started_by_user_id uuid references public.app_users(id) on delete set null,
  partner_id uuid references public.dealer_accounts(id) on delete set null,
  role_snapshot text,
  portal_language text not null default 'da',
  current_route text,
  machine_id text,
  product_id uuid references public.price_list_items(id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_questions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  asked_by_user_id uuid references public.app_users(id) on delete set null,
  partner_id uuid references public.dealer_accounts(id) on delete set null,
  role_snapshot text,
  portal_language text not null default 'da',
  question_text text not null check (length(btrim(question_text)) > 0),
  current_route text,
  machine_id text,
  product_id uuid references public.price_list_items(id) on delete set null,
  category text,
  result_status text not null default 'PENDING'
    check (result_status in ('PENDING', 'ANSWERED', 'NO_ANSWER', 'ERROR')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  retention_expires_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.support_responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.support_questions(id) on delete cascade,
  response_text text,
  answer_status text not null default 'ACCEPTED'
    check (answer_status in ('ACCEPTED', 'NO_ANSWER', 'ERROR')),
  grounded boolean not null default false,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  model_name text,
  provider_response_id text,
  error_category text,
  created_at timestamptz not null default now()
);

create table public.support_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  knowledge_type text not null check (knowledge_type in (
    'MANUAL_QA', 'FAQ', 'TECHNICAL_NOTE', 'MACHINE_INFORMATION',
    'PRODUCT_INFORMATION', 'DOCUMENT', 'MANUAL', 'TIMAN_DK_PAGE',
    'VIDEO', 'TSB', 'APPROVED_SERVICE_CASE', 'URL_REFERENCE', 'OTHER'
  )),
  content text not null default '',
  summary text,
  machine_id text,
  product_id uuid references public.price_list_items(id) on delete set null,
  category text,
  keywords text[] not null default '{}',
  source_reference text,
  language text not null default 'da',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED')),
  access_scope text not null default 'BACKEND'
    check (access_scope in ('PUBLIC', 'PORTAL', 'SALES', 'TECHNICAL_SERVICE', 'BACKEND')),
  required_area text,
  required_module text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  version_number integer not null default 1 check (version_number > 0),
  source_version text,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_response_sources (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.support_responses(id) on delete cascade,
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete restrict,
  knowledge_version integer not null check (knowledge_version > 0),
  citation_label text,
  created_at timestamptz not null default now(),
  unique (response_id, knowledge_item_id, knowledge_version)
);

create table public.support_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.support_conversations(id) on delete cascade,
  question_id uuid references public.support_questions(id) on delete cascade,
  response_id uuid references public.support_responses(id) on delete cascade,
  submitted_by_user_id uuid references public.app_users(id) on delete set null,
  sentiment text not null check (sentiment in ('POSITIVE', 'NEGATIVE')),
  comment text,
  created_at timestamptz not null default now(),
  check (conversation_id is not null or question_id is not null or response_id is not null)
);

create table public.support_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.support_questions(id) on delete cascade,
  response_id uuid references public.support_responses(id) on delete cascade,
  retrieval_status text not null
    check (retrieval_status in ('HIT', 'NO_MATCH', 'ACCESS_RESTRICTED', 'ERROR')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  result_count integer not null default 0 check (result_count >= 0),
  error_category text,
  created_at timestamptz not null default now()
);

create table public.support_knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.support_questions(id) on delete set null,
  normalized_group_key text,
  machine_id text,
  category text,
  languages text[] not null default '{}',
  reason_code text not null check (reason_code in (
    'NO_RELEVANT_KNOWLEDGE', 'ACCESS_RESTRICTED', 'LOW_CONFIDENCE',
    'AMBIGUOUS_QUESTION', 'MISSING_DOCUMENTATION', 'RETRIEVAL_ERROR',
    'AI_PROVIDER_ERROR', 'OTHER'
  )),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED')),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  assigned_to_user_id uuid references public.app_users(id) on delete set null,
  resolved_by_user_id uuid references public.app_users(id) on delete set null,
  resolution_note text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_usage_events (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.support_questions(id) on delete set null,
  response_id uuid references public.support_responses(id) on delete set null,
  user_id uuid references public.app_users(id) on delete set null,
  partner_id uuid references public.dealer_accounts(id) on delete set null,
  category text,
  model_name text,
  request_status text not null check (request_status in ('SUCCESS', 'FAILED')),
  total_latency_ms integer check (total_latency_ms is null or total_latency_ms >= 0),
  retrieval_latency_ms integer check (retrieval_latency_ms is null or retrieval_latency_ms >= 0),
  model_latency_ms integer check (model_latency_ms is null or model_latency_ms >= 0),
  provider_error boolean not null default false,
  timeout_count integer not null default 0 check (timeout_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cached_tokens integer check (cached_tokens is null or cached_tokens >= 0),
  estimated_cost numeric(16, 8) check (estimated_cost is null or estimated_cost >= 0),
  cost_currency text,
  error_category text,
  created_at timestamptz not null default now()
);

create index support_conversations_started_at_idx on public.support_conversations (started_at desc);
create index support_conversations_user_idx on public.support_conversations (started_by_user_id);
create index support_conversations_partner_idx on public.support_conversations (partner_id);
create index support_questions_created_at_idx on public.support_questions (created_at desc);
create index support_questions_user_idx on public.support_questions (asked_by_user_id);
create index support_questions_partner_idx on public.support_questions (partner_id);
create index support_questions_language_idx on public.support_questions (portal_language);
create index support_questions_category_idx on public.support_questions (category);
create index support_questions_machine_idx on public.support_questions (machine_id);
create index support_questions_result_idx on public.support_questions (result_status);
create index support_questions_search_idx on public.support_questions using gin (to_tsvector('simple', question_text));
create index support_feedback_created_at_idx on public.support_feedback (created_at desc);
create index support_knowledge_items_status_idx on public.support_knowledge_items (status);
create index support_knowledge_items_type_idx on public.support_knowledge_items (knowledge_type);
create index support_knowledge_items_language_idx on public.support_knowledge_items (language);
create index support_knowledge_items_machine_idx on public.support_knowledge_items (machine_id);
create index support_knowledge_items_category_idx on public.support_knowledge_items (category);
create index support_knowledge_items_access_idx on public.support_knowledge_items (access_scope);
create index support_knowledge_items_search_idx on public.support_knowledge_items using gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))
);
create index support_knowledge_gaps_status_idx on public.support_knowledge_gaps (status);
create index support_knowledge_gaps_reason_idx on public.support_knowledge_gaps (reason_code);
create index support_knowledge_gaps_machine_idx on public.support_knowledge_gaps (machine_id);
create index support_knowledge_gaps_priority_idx on public.support_knowledge_gaps (occurrence_count desc, last_seen_at desc);
create index support_usage_events_created_at_idx on public.support_usage_events (created_at desc);
create index support_usage_events_user_idx on public.support_usage_events (user_id);
create index support_usage_events_partner_idx on public.support_usage_events (partner_id);
create index support_usage_events_category_idx on public.support_usage_events (category);

create or replace function public.support_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.support_validate_knowledge_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status = 'DRAFT' and new.status in ('REVIEW', 'ARCHIVED')) or
      (old.status = 'REVIEW' and new.status in ('DRAFT', 'APPROVED', 'ARCHIVED')) or
      (old.status = 'APPROVED' and new.status in ('REVIEW', 'ARCHIVED')) or
      (old.status = 'ARCHIVED' and new.status = 'DRAFT')
    ) then
      raise exception 'Invalid support knowledge lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.title is distinct from old.title or
    new.content is distinct from old.content or
    new.summary is distinct from old.summary or
    new.status is distinct from old.status or
    new.access_scope is distinct from old.access_scope or
    new.source_reference is distinct from old.source_reference
  ) then
    new.version_number := old.version_number + 1;
  end if;

  if new.status = 'APPROVED' and (tg_op = 'INSERT' or old.status is distinct from 'APPROVED') then
    new.approved_at := coalesce(new.approved_at, now());
  elsif new.status <> 'APPROVED' then
    new.approved_at := null;
    new.approved_by_user_id := null;
  end if;

  return new;
end;
$$;

revoke all on function public.support_touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.support_validate_knowledge_lifecycle() from public, anon, authenticated, service_role;

create trigger support_conversations_touch_updated_at
before update on public.support_conversations
for each row execute function public.support_touch_updated_at();

create trigger support_knowledge_items_lifecycle
before insert or update on public.support_knowledge_items
for each row execute function public.support_validate_knowledge_lifecycle();

create trigger support_knowledge_items_touch_updated_at
before update on public.support_knowledge_items
for each row execute function public.support_touch_updated_at();

create trigger support_knowledge_gaps_touch_updated_at
before update on public.support_knowledge_gaps
for each row execute function public.support_touch_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'support_conversations',
    'support_questions',
    'support_responses',
    'support_knowledge_items',
    'support_response_sources',
    'support_feedback',
    'support_retrieval_events',
    'support_knowledge_gaps',
    'support_usage_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.can_access_support()))',
      table_name || '_support_select', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.can_access_support()))',
      table_name || '_support_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.can_access_support())) with check ((select public.can_access_support()))',
      table_name || '_support_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.can_access_support()))',
      table_name || '_support_delete', table_name
    );
  end loop;
end;
$$;

create or replace function public.get_support_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
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
    'estimated_cost', (select coalesce(sum(estimated_cost), 0) from public.support_usage_events)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_support_admin_overview() from public, anon, authenticated, service_role;
grant execute on function public.get_support_admin_overview() to authenticated;

comment on function public.get_support_admin_overview() is
  'Phase 3 zero-safe Support administration metrics. Requires canonical Backend support_access authorization.';

comment on table public.support_questions is
  'Support question log. Free text may contain sensitive information; retention and anonymization periods require a later business decision.';
comment on table public.support_knowledge_items is
  'Human-managed Support knowledge metadata/content. Only APPROVED items may become retrieval-eligible in a later phase.';
comment on table public.support_usage_events is
  'Provider-neutral observability fields. Phase 3 does not populate tokens, costs or model data.';
