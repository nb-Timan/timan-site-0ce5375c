-- Phase 8 FULL rerun: immutable semantic wording and canonical-source alternatives.

do $$
declare
  v_approver uuid;
  v_machine_status_item_ids uuid[];
  v_machine_status_source_ids uuid[];
  v_case record;
  v_suite record;
  v_expected jsonb;
  v_suite_version uuid;
  v_case_count integer;
begin
  select id into strict v_approver
  from public.app_users
  where lower(email) = 'nb@timan.dk';

  select array_agg(distinct i.id order by i.id), array_agg(distinct s.id order by s.id)
  into strict v_machine_status_item_ids, v_machine_status_source_ids
  from public.support_knowledge_items i
  join public.support_knowledge_sources s
    on s.knowledge_item_id = i.id and s.is_current and s.lifecycle_status = 'APPROVED'
  join public.support_knowledge_index_states idx
    on idx.knowledge_source_id = s.id and idx.status = 'INDEXED'
  where i.status = 'APPROVED'
    and i.title in (
      'PHASE 8 QA TEST — Public portal, machine and commercial facts',
      'PHASE 8 QA TEST — Technical Service restricted knowledge'
    );

  if coalesce(array_length(v_machine_status_source_ids, 1), 0) <> 2 then
    raise exception 'Expected the approved public and Technical Service machine-status sources';
  end if;

  for v_case in
    select c.id as case_id, c.case_key, cv.title, cv.category, cv.language,
           cv.actor_fixture, cv.page_context, cv.request_text, cv.expected_result,
           cv.severity, cv.tags, cv.is_critical, cv.source_kind
    from public.support_evaluation_cases c
    join public.support_evaluation_case_versions cv on cv.case_id = c.id
    where cv.version_number = 11 and cv.status = 'APPROVED'
    order by c.case_key
  loop
    v_expected := v_case.expected_result || jsonb_build_object('bindingVersion', 'phase8-semantic-v12');

    if v_case.case_key = 'P8-006-portal-language-de' then
      v_expected := (v_expected - 'facts') || jsonb_build_object(
        'factGroups', jsonb_build_array(
          jsonb_build_array('Portalsprache', 'Sprache des Portals'),
          jsonb_build_array('Header', 'Kopfbereich')
        )
      );
    elsif v_case.case_key = 'P8-051-maskinstatus' then
      v_expected := v_expected || jsonb_build_object(
        'knowledgeItemIds', to_jsonb(v_machine_status_item_ids),
        'sourceRevisionIds', to_jsonb(v_machine_status_source_ids),
        'citationIds', to_jsonb(v_machine_status_source_ids)
      );
    end if;

    insert into public.support_evaluation_case_versions (
      case_id, version_number, status, title, category, language, actor_fixture, page_context,
      request_text, expected_result, severity, tags, is_critical, content_hash, source_kind,
      approved_by, approved_at, created_by
    ) values (
      v_case.case_id, 12, 'APPROVED', v_case.title, v_case.category, v_case.language,
      v_case.actor_fixture, v_case.page_context, v_case.request_text, v_expected,
      v_case.severity, v_case.tags, v_case.is_critical,
      encode(extensions.digest(convert_to(v_case.case_key || ':phase8-semantic-v12:' || v_expected::text, 'UTF8'), 'sha256'), 'hex'),
      v_case.source_kind, v_approver, now(), v_approver
    ) on conflict (case_id, version_number) do nothing;
  end loop;

  for v_suite in
    select s.id as suite_id, s.suite_key, sv.tier, sv.configuration
    from public.support_evaluation_suites s
    join public.support_evaluation_suite_versions sv on sv.suite_id = s.id
    where sv.version_number = 11 and sv.status = 'APPROVED'
    order by s.suite_key
  loop
    select count(*) into v_case_count
    from public.support_evaluation_suite_cases sc
    join public.support_evaluation_suite_versions sv on sv.id = sc.suite_version_id
    where sv.suite_id = v_suite.suite_id and sv.version_number = 11;

    insert into public.support_evaluation_suite_versions (
      suite_id, version_number, status, tier, content_hash, case_count, configuration,
      approved_by, approved_at, created_by
    ) values (
      v_suite.suite_id, 12, 'APPROVED', v_suite.tier,
      encode(extensions.digest(convert_to(v_suite.suite_key || ':phase8-semantic-v12', 'UTF8'), 'sha256'), 'hex'),
      v_case_count,
      v_suite.configuration || jsonb_build_object('bindingVersion', 'phase8-semantic-v12'),
      v_approver, now(), v_approver
    ) on conflict (suite_id, version_number) do nothing
    returning id into v_suite_version;

    if v_suite_version is null then
      select id into v_suite_version
      from public.support_evaluation_suite_versions
      where suite_id = v_suite.suite_id and version_number = 12;
    end if;

    insert into public.support_evaluation_suite_cases (suite_version_id, case_version_id, sort_order, is_required)
    select v_suite_version, cv12.id, sc.sort_order, sc.is_required
    from public.support_evaluation_suite_versions sv11
    join public.support_evaluation_suite_cases sc on sc.suite_version_id = sv11.id
    join public.support_evaluation_case_versions cv11 on cv11.id = sc.case_version_id
    join public.support_evaluation_case_versions cv12
      on cv12.case_id = cv11.case_id and cv12.version_number = 12
    where sv11.suite_id = v_suite.suite_id and sv11.version_number = 11
    on conflict (suite_version_id, case_version_id) do nothing;

    v_suite_version := null;
  end loop;
end $$;
