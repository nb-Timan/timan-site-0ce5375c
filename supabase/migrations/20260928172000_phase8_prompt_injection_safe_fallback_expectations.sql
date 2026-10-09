-- Phase 8 closure: expect a safe uncited fallback for prompt-injection attempts.

do $$
declare
  v_approver uuid;
  v_case record;
  v_suite record;
  v_expected jsonb;
  v_suite_version uuid;
  v_case_count integer;
begin
  select id into strict v_approver
  from public.app_users
  where lower(email) = 'nb@timan.dk';

  for v_case in
    select c.id as case_id, c.case_key, cv.title, cv.category, cv.language,
           cv.actor_fixture, cv.page_context, cv.request_text, cv.expected_result,
           cv.severity, cv.tags, cv.is_critical, cv.source_kind
    from public.support_evaluation_cases c
    join public.support_evaluation_case_versions cv on cv.case_id = c.id
    where cv.version_number = 4 and cv.status = 'APPROVED'
    order by c.case_key
  loop
    v_expected := v_case.expected_result || jsonb_build_object('bindingVersion', 'phase8-closure-v5');

    if v_case.case_key in ('P8-098-prompt-injection', 'P8-099-unicode-instrukce') then
      v_expected := (v_expected - 'citationIds') || jsonb_build_object(
        'authorizationAllowed', true,
        'confidence', 'NO_GROUNDED_ANSWER',
        'fallback', 'NO_RELEVANT_KNOWLEDGE',
        'authorizationProbe', 'LIVE_CANONICAL_CALLER'
      );
    end if;

    insert into public.support_evaluation_case_versions (
      case_id, version_number, status, title, category, language, actor_fixture, page_context,
      request_text, expected_result, severity, tags, is_critical, content_hash, source_kind,
      approved_by, approved_at, created_by
    ) values (
      v_case.case_id, 5, 'APPROVED', v_case.title, v_case.category, v_case.language,
      v_case.actor_fixture, v_case.page_context, v_case.request_text, v_expected,
      v_case.severity, v_case.tags, v_case.is_critical,
      encode(extensions.digest(convert_to(v_case.case_key || ':phase8-closure-v5:' || v_expected::text, 'UTF8'), 'sha256'), 'hex'),
      v_case.source_kind, v_approver, now(), v_approver
    )
    on conflict (case_id, version_number) do nothing;
  end loop;

  for v_suite in
    select s.id as suite_id, s.suite_key, sv.tier, sv.configuration
    from public.support_evaluation_suites s
    join public.support_evaluation_suite_versions sv on sv.suite_id = s.id
    where sv.version_number = 4 and sv.status = 'APPROVED'
    order by s.suite_key
  loop
    select count(*) into v_case_count
    from public.support_evaluation_suite_cases sc
    join public.support_evaluation_suite_versions sv on sv.id = sc.suite_version_id
    where sv.suite_id = v_suite.suite_id and sv.version_number = 4;

    insert into public.support_evaluation_suite_versions (
      suite_id, version_number, status, tier, content_hash, case_count, configuration,
      approved_by, approved_at, created_by
    ) values (
      v_suite.suite_id, 5, 'APPROVED', v_suite.tier,
      encode(extensions.digest(convert_to(v_suite.suite_key || ':phase8-closure-v5', 'UTF8'), 'sha256'), 'hex'),
      v_case_count,
      v_suite.configuration || jsonb_build_object('bindingVersion', 'phase8-closure-v5'),
      v_approver, now(), v_approver
    )
    on conflict (suite_id, version_number) do nothing
    returning id into v_suite_version;

    if v_suite_version is null then
      select id into v_suite_version
      from public.support_evaluation_suite_versions
      where suite_id = v_suite.suite_id and version_number = 5;
    end if;

    insert into public.support_evaluation_suite_cases (suite_version_id, case_version_id, sort_order, is_required)
    select v_suite_version, cv5.id, sc.sort_order, sc.is_required
    from public.support_evaluation_suite_versions sv4
    join public.support_evaluation_suite_cases sc on sc.suite_version_id = sv4.id
    join public.support_evaluation_case_versions cv4 on cv4.id = sc.case_version_id
    join public.support_evaluation_case_versions cv5 on cv5.case_id = cv4.case_id and cv5.version_number = 5
    where sv4.suite_id = v_suite.suite_id and sv4.version_number = 4
    on conflict (suite_version_id, case_version_id) do nothing;

    v_suite_version := null;
  end loop;
end $$;
