-- Phase 8 closure: localize exact fact checks and align confidence-policy questions.

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
    where cv.version_number = 5 and cv.status = 'APPROVED'
    order by c.case_key
  loop
    v_expected := v_case.expected_result || jsonb_build_object('bindingVersion', 'phase8-closure-v6');

    case v_case.case_key
      when 'P8-022-configuration-save-da' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('Gem sag', 'T-nummer'));
      when 'P8-023-configuration-save-en' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('Gem sag', 'T-number'));
      when 'P8-024-configuration-save-de' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('Gem sag', 'T-Nummer'));
      when 'P8-025-3330-t2-da' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('Timan 3330', 'T2'));
      when 'P8-026-3330-t2-en' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('Timan 3330', 'T2'));
      when 'P8-027-3330-t2-de' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('Timan 3330', 'T2', 'Bestätigung'));
      when 'P8-029-demo-discount-en' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('32.5%'));
      when 'P8-032-demo-surcharge-en' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('75 DKK'));
      when 'P8-066-case-reopen' then
        v_expected := v_expected || jsonb_build_object('facts', jsonb_build_array('same case', 'quote number'));
      when 'P8-087-er-s-bizony-t-k' then
        v_expected := (v_expected - 'citationIds') || jsonb_build_object(
          'confidence', 'NO_GROUNDED_ANSWER',
          'fallback', 'NO_RELEVANT_KNOWLEDGE'
        );
      when 'P8-088-gyenge-bizony-t-k' then
        v_expected := v_expected || jsonb_build_object('confidence', 'HIGH', 'fallback', null);
      when 'P8-089-forr-s-tk-z-s' then
        v_expected := v_expected || jsonb_build_object(
          'facts', jsonb_build_array('forráskonfliktus'),
          'confidence', 'HIGH',
          'fallback', null
        );
      when 'P8-090-inaktuell-k-lla' then
        v_expected := v_expected || jsonb_build_object('confidence', 'HIGH', 'fallback', null);
      else
        null;
    end case;

    insert into public.support_evaluation_case_versions (
      case_id, version_number, status, title, category, language, actor_fixture, page_context,
      request_text, expected_result, severity, tags, is_critical, content_hash, source_kind,
      approved_by, approved_at, created_by
    ) values (
      v_case.case_id, 6, 'APPROVED', v_case.title, v_case.category, v_case.language,
      v_case.actor_fixture, v_case.page_context, v_case.request_text, v_expected,
      v_case.severity, v_case.tags, v_case.is_critical,
      encode(extensions.digest(convert_to(v_case.case_key || ':phase8-closure-v6:' || v_expected::text, 'UTF8'), 'sha256'), 'hex'),
      v_case.source_kind, v_approver, now(), v_approver
    )
    on conflict (case_id, version_number) do nothing;
  end loop;

  for v_suite in
    select s.id as suite_id, s.suite_key, sv.tier, sv.configuration
    from public.support_evaluation_suites s
    join public.support_evaluation_suite_versions sv on sv.suite_id = s.id
    where sv.version_number = 5 and sv.status = 'APPROVED'
    order by s.suite_key
  loop
    select count(*) into v_case_count
    from public.support_evaluation_suite_cases sc
    join public.support_evaluation_suite_versions sv on sv.id = sc.suite_version_id
    where sv.suite_id = v_suite.suite_id and sv.version_number = 5;

    insert into public.support_evaluation_suite_versions (
      suite_id, version_number, status, tier, content_hash, case_count, configuration,
      approved_by, approved_at, created_by
    ) values (
      v_suite.suite_id, 6, 'APPROVED', v_suite.tier,
      encode(extensions.digest(convert_to(v_suite.suite_key || ':phase8-closure-v6', 'UTF8'), 'sha256'), 'hex'),
      v_case_count,
      v_suite.configuration || jsonb_build_object('bindingVersion', 'phase8-closure-v6'),
      v_approver, now(), v_approver
    )
    on conflict (suite_id, version_number) do nothing
    returning id into v_suite_version;

    if v_suite_version is null then
      select id into v_suite_version
      from public.support_evaluation_suite_versions
      where suite_id = v_suite.suite_id and version_number = 6;
    end if;

    insert into public.support_evaluation_suite_cases (suite_version_id, case_version_id, sort_order, is_required)
    select v_suite_version, cv6.id, sc.sort_order, sc.is_required
    from public.support_evaluation_suite_versions sv5
    join public.support_evaluation_suite_cases sc on sc.suite_version_id = sv5.id
    join public.support_evaluation_case_versions cv5 on cv5.id = sc.case_version_id
    join public.support_evaluation_case_versions cv6 on cv6.case_id = cv5.case_id and cv6.version_number = 6
    where sv5.suite_id = v_suite.suite_id and sv5.version_number = 5
    on conflict (suite_version_id, case_version_id) do nothing;

    v_suite_version := null;
  end loop;
end $$;
