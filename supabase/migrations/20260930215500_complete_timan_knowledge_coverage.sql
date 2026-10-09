alter table public.support_knowledge_sync_config
  add column if not exists secondary_language_cadence_days integer not null default 7
    check (secondary_language_cadence_days between 1 and 30),
  add column if not exists last_secondary_sync_at timestamptz;

alter table public.support_web_knowledge_candidates
  add column if not exists relevant_excerpt text;

update public.support_knowledge_sync_config
set last_secondary_sync_at = (
  select max(completed_at)
  from public.support_knowledge_sync_runs
  where status = 'COMPLETED' and language_counts ? 'cs'
)
where id = true and last_secondary_sync_at is null;

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
    'language_counts', coalesce((
      select jsonb_object_agg(langs.language, (select count(*) from public.support_controlled_source_registry r where r.language = langs.language))
      from unnest((select enabled_languages from public.support_knowledge_sync_config where id = true)) as langs(language)
    ), '{}'::jsonb),
    'language_indexed_counts', coalesce((
      select jsonb_object_agg(langs.language, (
        select count(*) from public.support_controlled_source_registry r
        where r.language = langs.language and exists (
          select 1 from public.support_knowledge_sources s
          join public.support_knowledge_index_states i on i.knowledge_source_id = s.id and i.status = 'INDEXED'
          where s.knowledge_item_id = r.knowledge_item_id and s.is_current
        )
      ))
      from unnest((select enabled_languages from public.support_knowledge_sync_config where id = true)) as langs(language)
    ), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_support_knowledge_sync_overview() from public, anon;
grant execute on function public.get_support_knowledge_sync_overview() to authenticated;

comment on column public.support_knowledge_sync_config.secondary_language_cadence_days is
  'Scheduled cadence for enabled non-priority languages; manual sync always checks all enabled languages.';
