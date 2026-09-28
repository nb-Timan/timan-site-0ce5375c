-- Phase 8: additive, reproducible quality and security evaluation.
create table public.support_evaluation_suites (
  id uuid primary key default gen_random_uuid(), suite_key text not null unique, title text not null,
  description text, is_active boolean not null default true, created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.support_evaluation_suite_versions (
  id uuid primary key default gen_random_uuid(), suite_id uuid not null references public.support_evaluation_suites(id) on delete restrict,
  version_number integer not null check (version_number>0), status text not null check (status in ('DRAFT','APPROVED','RETIRED')),
  tier text not null check (tier in ('SMOKE','TARGETED','FULL','SECURITY')), content_hash text not null,
  case_count integer not null default 0 check (case_count>=0), configuration jsonb not null default '{}'::jsonb,
  approved_by uuid references public.app_users(id) on delete set null, approved_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null, created_at timestamptz not null default now(),
  unique(suite_id,version_number), unique(suite_id,content_hash),
  check(status<>'APPROVED' or (approved_at is not null and approved_by is not null))
);
create table public.support_evaluation_cases (
  id uuid primary key default gen_random_uuid(), case_key text not null unique,
  created_by uuid references public.app_users(id) on delete set null, created_at timestamptz not null default now()
);
create table public.support_evaluation_case_versions (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_evaluation_cases(id) on delete restrict,
  version_number integer not null check(version_number>0), status text not null check(status in ('DRAFT','APPROVED','RETIRED')),
  title text not null, category text not null, language text not null check(language in ('da','en','de','it','hu','sv','fr','pl','cs')),
  actor_fixture jsonb not null, page_context text, request_text text not null, expected_result jsonb not null,
  severity text not null check(severity in ('SEV-0','SEV-1','SEV-2','SEV-3','SEV-4')),
  tags text[] not null default '{}', is_critical boolean not null default false, content_hash text not null,
  source_kind text not null default 'GOLDEN_SET' check(source_kind in ('GOLDEN_SET','FEEDBACK_PROPOSAL','SECURITY_CORPUS','ACTION_PARITY')),
  approved_by uuid references public.app_users(id) on delete set null, approved_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null, created_at timestamptz not null default now(),
  unique(case_id,version_number), unique(case_id,content_hash),
  check(status<>'APPROVED' or (approved_at is not null and approved_by is not null))
);
create table public.support_evaluation_suite_cases (
  id uuid primary key default gen_random_uuid(), suite_version_id uuid not null references public.support_evaluation_suite_versions(id) on delete restrict,
  case_version_id uuid not null references public.support_evaluation_case_versions(id) on delete restrict,
  sort_order integer not null check(sort_order>0), is_required boolean not null default true, created_at timestamptz not null default now(),
  unique(suite_version_id,case_version_id), unique(suite_version_id,sort_order)
);
create table public.support_evaluation_runs (
  id uuid primary key default gen_random_uuid(), suite_version_id uuid not null references public.support_evaluation_suite_versions(id) on delete restrict,
  baseline_run_id uuid references public.support_evaluation_runs(id) on delete set null,
  tier text not null check(tier in ('SMOKE','TARGETED','FULL','SECURITY')),
  status text not null default 'QUEUED' check(status in ('QUEUED','RUNNING','COMPLETED','FAILED')),
  release_decision text check(release_decision in ('RELEASE_PASS','RELEASE_BLOCKED')),
  git_commit text not null, provider text not null, model text not null, embedding_model text not null, prompt_version text not null,
  runtime_config jsonb not null, knowledge_snapshot text not null, knowledge_snapshot_metadata jsonb not null default '{}'::jsonb,
  metrics jsonb, failure_reasons text[] not null default '{}', machine_result jsonb,
  started_at timestamptz not null default now(), completed_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null, created_at timestamptz not null default now(),
  check(status not in ('COMPLETED','FAILED') or completed_at is not null),
  check(status<>'COMPLETED' or release_decision is not null)
);
create table public.support_evaluation_results (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.support_evaluation_runs(id) on delete restrict,
  case_version_id uuid not null references public.support_evaluation_case_versions(id) on delete restrict,
  passed boolean not null, severity text not null check(severity in ('SEV-0','SEV-1','SEV-2','SEV-3','SEV-4')),
  is_critical boolean not null default false, new_regression boolean not null default false,
  review_state text not null default 'NOT_REQUIRED' check(review_state in ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
  observation jsonb not null, duration_ms integer not null default 0 check(duration_ms>=0),
  retrieval_latency_ms integer check(retrieval_latency_ms>=0), provider_latency_ms integer check(provider_latency_ms>=0),
  input_tokens integer not null default 0 check(input_tokens>=0), output_tokens integer not null default 0 check(output_tokens>=0),
  estimated_cost numeric(18,8) not null default 0 check(estimated_cost>=0), retries integer not null default 0 check(retries>=0),
  timed_out boolean not null default false, judge_model text, judge_version text, created_at timestamptz not null default now(),
  unique(run_id,case_version_id)
);
create table public.support_evaluation_assertions (
  id uuid primary key default gen_random_uuid(), result_id uuid not null references public.support_evaluation_results(id) on delete restrict,
  assertion_type text not null, passed boolean not null,
  severity text not null check(severity in ('SEV-0','SEV-1','SEV-2','SEV-3','SEV-4')),
  expected_value jsonb, actual_value jsonb, message text not null, created_at timestamptz not null default now()
);
create table public.support_evaluation_retrieval_observations (
  id uuid primary key default gen_random_uuid(), result_id uuid not null references public.support_evaluation_results(id) on delete restrict,
  chunk_id uuid references public.support_knowledge_chunks(id) on delete set null,
  source_revision_id uuid references public.support_knowledge_sources(id) on delete set null,
  candidate_reference text not null, rank integer not null check(rank>0), score numeric(12,8) not null,
  authorization_eligible boolean not null, expected_source boolean not null default false,
  created_at timestamptz not null default now(), unique(result_id,rank)
);
create table public.support_evaluation_reviews (
  id uuid primary key default gen_random_uuid(), result_id uuid not null references public.support_evaluation_results(id) on delete restrict,
  review_reason text not null check(review_reason in ('AI_JUDGE_UNCERTAINTY','SOURCE_CONFLICT','HIGH_CONFIDENCE_NEGATIVE_FEEDBACK','SECURITY_ANOMALY','ACTION_MISMATCH','MULTILINGUAL_UNCERTAINTY','BASELINE_DISAGREEMENT')),
  decision text not null check(decision in ('PENDING','CONFIRMED_FAILURE','FALSE_POSITIVE','CASE_UPDATE_REQUIRED')),
  comment text, reviewer_id uuid references public.app_users(id) on delete set null, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.support_evaluation_baselines (
  id uuid primary key default gen_random_uuid(), suite_version_id uuid not null references public.support_evaluation_suite_versions(id) on delete restrict,
  run_id uuid not null references public.support_evaluation_runs(id) on delete restrict,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','SUPERSEDED')), justification text not null,
  approved_by uuid not null references public.app_users(id) on delete restrict, approved_at timestamptz not null default now(),
  superseded_at timestamptz, created_at timestamptz not null default now(), unique(suite_version_id,run_id)
);
create table public.support_evaluation_case_proposals (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check(source_kind in ('NEGATIVE_FEEDBACK','KNOWLEDGE_GAP','REPEAT_QUESTION','ESCALATION','ABANDONMENT','HUMAN_CORRECTION')),
  source_reference uuid, proposed_case jsonb not null,
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid references public.app_users(id) on delete set null, reviewed_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null, created_at timestamptz not null default now()
);

create index support_evaluation_case_versions_filter_idx on public.support_evaluation_case_versions(category,language,severity);
create index support_evaluation_case_versions_tags_idx on public.support_evaluation_case_versions using gin(tags);
create index support_evaluation_runs_recent_idx on public.support_evaluation_runs(started_at desc);
create index support_evaluation_results_failures_idx on public.support_evaluation_results(run_id,passed,severity);
create index support_evaluation_assertions_failure_idx on public.support_evaluation_assertions(result_id,passed,assertion_type);

create function public.support_evaluation_prevent_change() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_EVALUATION_HISTORY' using errcode='55000'; end; $$;
create function public.support_evaluation_protect_definition() returns trigger language plpgsql set search_path='' as $$
begin if tg_op='DELETE' or old.status in ('APPROVED','RETIRED') then raise exception 'APPROVED_EVALUATION_VERSION_IS_IMMUTABLE' using errcode='55000'; end if; return new; end; $$;
create function public.support_evaluation_protect_run() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.status in ('COMPLETED','FAILED') then raise exception 'COMPLETED_EVALUATION_RUN_IS_IMMUTABLE' using errcode='55000'; end if;
  if new.suite_version_id<>old.suite_version_id or new.git_commit<>old.git_commit or new.provider<>old.provider or new.model<>old.model
    or new.embedding_model<>old.embedding_model or new.prompt_version<>old.prompt_version or new.runtime_config<>old.runtime_config
    or new.knowledge_snapshot<>old.knowledge_snapshot then raise exception 'EVALUATION_RUN_CONFIGURATION_IS_IMMUTABLE' using errcode='55000'; end if;
  return new;
end; $$;
create trigger support_evaluation_suite_versions_immutable before update or delete on public.support_evaluation_suite_versions for each row execute function public.support_evaluation_protect_definition();
create trigger support_evaluation_case_versions_immutable before update or delete on public.support_evaluation_case_versions for each row execute function public.support_evaluation_protect_definition();
create trigger support_evaluation_runs_immutable before update or delete on public.support_evaluation_runs for each row execute function public.support_evaluation_protect_run();
create trigger support_evaluation_results_immutable before update or delete on public.support_evaluation_results for each row execute function public.support_evaluation_prevent_change();
create trigger support_evaluation_assertions_immutable before update or delete on public.support_evaluation_assertions for each row execute function public.support_evaluation_prevent_change();
create trigger support_evaluation_retrieval_immutable before update or delete on public.support_evaluation_retrieval_observations for each row execute function public.support_evaluation_prevent_change();

do $$ declare n text; begin
  foreach n in array array['support_evaluation_suites','support_evaluation_suite_versions','support_evaluation_cases','support_evaluation_case_versions','support_evaluation_suite_cases','support_evaluation_runs','support_evaluation_results','support_evaluation_assertions','support_evaluation_retrieval_observations','support_evaluation_reviews','support_evaluation_baselines','support_evaluation_case_proposals'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated',n);
    execute format('grant select on public.%I to authenticated',n);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_support())',n||'_support_read',n);
  end loop;
end $$;

create function public.get_support_evaluation_overview() returns jsonb language sql stable security definer set search_path='' as $$
select case when public.can_access_support() then jsonb_build_object(
  'latest_run',(select to_jsonb(r) from public.support_evaluation_runs r order by r.started_at desc limit 1),
  'baseline_run',(select to_jsonb(r) from public.support_evaluation_baselines b join public.support_evaluation_runs r on r.id=b.run_id where b.status='ACTIVE' order by b.approved_at desc limit 1),
  'recent_runs',coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (select * from public.support_evaluation_runs order by started_at desc limit 20)x),'[]'::jsonb),
  'open_reviews',(select count(*) from public.support_evaluation_reviews where decision='PENDING'),
  'approved_case_count',(select count(*) from public.support_evaluation_case_versions where status='APPROVED'),
  'approved_suite_count',(select count(*) from public.support_evaluation_suite_versions where status='APPROVED')) else null end; $$;
revoke all on function public.get_support_evaluation_overview() from public,anon,authenticated,service_role;
grant execute on function public.get_support_evaluation_overview() to authenticated;

create function public.support_submit_evaluation_review(p_result_id uuid,p_reason text,p_decision text,p_comment text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; r uuid; begin
  if not public.can_access_support() then raise exception 'SUPPORT_ACCESS_DENIED' using errcode='42501'; end if;
  select id into u from public.app_users where auth_user_id=auth.uid() or lower(email)=lower(auth.jwt()->>'email') limit 1;
  insert into public.support_evaluation_reviews(result_id,review_reason,decision,comment,reviewer_id,reviewed_at)
  values(p_result_id,p_reason,p_decision,nullif(trim(p_comment),''),u,case when p_decision='PENDING' then null else now() end) returning id into r;
  return r;
end; $$;
revoke all on function public.support_submit_evaluation_review(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.support_submit_evaluation_review(uuid,text,text,text) to authenticated;

create function public.support_approve_evaluation_baseline(p_run_id uuid,p_justification text)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; sv uuid; b uuid; begin
  if not public.can_access_support() then raise exception 'SUPPORT_ACCESS_DENIED' using errcode='42501'; end if;
  if nullif(trim(p_justification),'') is null then raise exception 'BASELINE_JUSTIFICATION_REQUIRED'; end if;
  select id into u from public.app_users where auth_user_id=auth.uid() or lower(email)=lower(auth.jwt()->>'email') limit 1;
  select suite_version_id into sv from public.support_evaluation_runs where id=p_run_id and status='COMPLETED' and release_decision='RELEASE_PASS';
  if sv is null then raise exception 'ONLY_PASSING_COMPLETED_RUN_CAN_BE_BASELINE'; end if;
  update public.support_evaluation_baselines set status='SUPERSEDED',superseded_at=now() where suite_version_id=sv and status='ACTIVE';
  insert into public.support_evaluation_baselines(suite_version_id,run_id,justification,approved_by) values(sv,p_run_id,trim(p_justification),u) returning id into b;
  return b;
end; $$;
revoke all on function public.support_approve_evaluation_baseline(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.support_approve_evaluation_baseline(uuid,text) to authenticated;

comment on table public.support_evaluation_runs is 'Immutable after completion; captures model, prompt, runtime, and Knowledge snapshot.';
comment on table public.support_evaluation_results is 'Append-only evidence. Routine evaluation permits no production business side effects.';
