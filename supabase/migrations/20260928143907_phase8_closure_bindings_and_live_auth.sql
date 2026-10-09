-- Phase 8 closure: immutable canonical source bindings and service-only live auth probes.

create or replace function public.support_evaluate_user_access(p_user_id uuid)
returns table (
  allowed boolean,
  portal_role text,
  support_enabled boolean,
  active boolean,
  approved boolean,
  allowed_areas text[],
  allowed_modules text[],
  dealer_number text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      u.portal_role::text = 'timan_backend'
      and coalesce(u.approved, false)
      and coalesce(u.is_active, false)
      and coalesce((u.permissions ->> 'support_access')::boolean, false)
    ) as allowed,
    u.portal_role::text,
    coalesce((u.permissions ->> 'support_access')::boolean, false),
    coalesce(u.is_active, false),
    coalesce(u.approved, false),
    coalesce(u.allowed_areas, '{}'::text[]),
    coalesce(u.allowed_modules, u.module_access, '{}'::text[]),
    u.dealer_number
  from public.app_users u
  where u.id = p_user_id;
$$;

revoke all on function public.support_evaluate_user_access(uuid) from public, anon, authenticated;
grant execute on function public.support_evaluate_user_access(uuid) to service_role;
comment on function public.support_evaluate_user_access(uuid) is
  'Service-role-only Phase 8 evaluator for the same persisted predicates used by can_access_support().';

do $$
declare
  v_approver uuid;
  v_public_item uuid;
  v_public_source uuid;
  v_public_language text;
  v_public_scope text;
  v_public_machines text[];
  v_public_products uuid[];
  v_cross_item uuid;
  v_cross_source uuid;
  v_cross_language text;
  v_cross_scope text;
  v_cross_machines text[];
  v_cross_products uuid[];
  v_technical_item uuid;
  v_technical_source uuid;
  v_technical_language text;
  v_technical_scope text;
  v_technical_machines text[];
  v_technical_products uuid[];
  v_confidence_item uuid;
  v_confidence_source uuid;
  v_confidence_language text;
  v_confidence_scope text;
  v_confidence_machines text[];
  v_confidence_products uuid[];
  v_case record;
  v_suite record;
  v_expected jsonb;
  v_item uuid;
  v_source uuid;
  v_language text;
  v_scope text;
  v_machines text[];
  v_products uuid[];
  v_case_version uuid;
  v_suite_version uuid;
  v_case_count integer;
begin
  select id into strict v_approver
  from public.app_users
  where lower(email) = 'nb@timan.dk';

  select i.id, s.id, s.source_language, i.access_scope,
         coalesce(array_agg(distinct m.machine_id) filter (where m.machine_id is not null), '{}'::text[]),
         coalesce(array_agg(distinct p.product_id) filter (where p.product_id is not null), '{}'::uuid[])
    into strict v_public_item, v_public_source, v_public_language, v_public_scope, v_public_machines, v_public_products
  from public.support_knowledge_items i
  join public.support_knowledge_sources s on s.knowledge_item_id = i.id
  join public.support_knowledge_index_states idx on idx.knowledge_source_id = s.id
  left join public.support_knowledge_item_machines m on m.knowledge_item_id = i.id
  left join public.support_knowledge_item_products p on p.knowledge_item_id = i.id
  where i.title = 'PHASE 8 QA TEST — Public portal, machine and commercial facts'
    and i.status = 'APPROVED' and s.lifecycle_status = 'APPROVED' and s.is_current and idx.status = 'INDEXED'
  group by i.id, s.id, s.source_language, i.access_scope;

  select i.id, s.id, s.source_language, i.access_scope,
         coalesce(array_agg(distinct m.machine_id) filter (where m.machine_id is not null), '{}'::text[]),
         coalesce(array_agg(distinct p.product_id) filter (where p.product_id is not null), '{}'::uuid[])
    into strict v_cross_item, v_cross_source, v_cross_language, v_cross_scope, v_cross_machines, v_cross_products
  from public.support_knowledge_items i
  join public.support_knowledge_sources s on s.knowledge_item_id = i.id
  join public.support_knowledge_index_states idx on idx.knowledge_source_id = s.id
  left join public.support_knowledge_item_machines m on m.knowledge_item_id = i.id
  left join public.support_knowledge_item_products p on p.knowledge_item_id = i.id
  where i.title = 'PHASE 8 QA TEST — English cross-language retrieval source'
    and i.status = 'APPROVED' and s.lifecycle_status = 'APPROVED' and s.is_current and idx.status = 'INDEXED'
  group by i.id, s.id, s.source_language, i.access_scope;

  select i.id, s.id, s.source_language, i.access_scope,
         coalesce(array_agg(distinct m.machine_id) filter (where m.machine_id is not null), '{}'::text[]),
         coalesce(array_agg(distinct p.product_id) filter (where p.product_id is not null), '{}'::uuid[])
    into strict v_technical_item, v_technical_source, v_technical_language, v_technical_scope, v_technical_machines, v_technical_products
  from public.support_knowledge_items i
  join public.support_knowledge_sources s on s.knowledge_item_id = i.id
  join public.support_knowledge_index_states idx on idx.knowledge_source_id = s.id
  left join public.support_knowledge_item_machines m on m.knowledge_item_id = i.id
  left join public.support_knowledge_item_products p on p.knowledge_item_id = i.id
  where i.title = 'PHASE 8 QA TEST — Technical Service restricted knowledge'
    and i.status = 'APPROVED' and s.lifecycle_status = 'APPROVED' and s.is_current and idx.status = 'INDEXED'
  group by i.id, s.id, s.source_language, i.access_scope;

  select i.id, s.id, s.source_language, i.access_scope,
         coalesce(array_agg(distinct m.machine_id) filter (where m.machine_id is not null), '{}'::text[]),
         coalesce(array_agg(distinct p.product_id) filter (where p.product_id is not null), '{}'::uuid[])
    into strict v_confidence_item, v_confidence_source, v_confidence_language, v_confidence_scope, v_confidence_machines, v_confidence_products
  from public.support_knowledge_items i
  join public.support_knowledge_sources s on s.knowledge_item_id = i.id
  join public.support_knowledge_index_states idx on idx.knowledge_source_id = s.id
  left join public.support_knowledge_item_machines m on m.knowledge_item_id = i.id
  left join public.support_knowledge_item_products p on p.knowledge_item_id = i.id
  where i.title = 'PHASE 8 QA TEST — Confidence conflict and prompt injection'
    and i.status = 'APPROVED' and s.lifecycle_status = 'APPROVED' and s.is_current and idx.status = 'INDEXED'
  group by i.id, s.id, s.source_language, i.access_scope;

  for v_case in
    select c.id as case_id, c.case_key, cv.title, cv.category, cv.language,
           cv.actor_fixture, cv.page_context, cv.request_text, cv.expected_result,
           cv.severity, cv.tags, cv.is_critical, cv.source_kind
    from public.support_evaluation_cases c
    join public.support_evaluation_case_versions cv on cv.case_id = c.id
    where cv.version_number = 1 and cv.status = 'APPROVED'
    order by c.case_key
  loop
    v_expected := v_case.expected_result || jsonb_build_object('bindingVersion', 'phase8-closure-v2');

    if v_case.expected_result ? 'sourceRevisionIds' then
      if v_case.category = 'TECHNICAL_SERVICE' then
        v_item := v_technical_item; v_source := v_technical_source; v_language := v_technical_language;
        v_scope := v_technical_scope; v_machines := v_technical_machines; v_products := v_technical_products;
      elsif v_case.category = 'CONFIDENCE_FALLBACK' then
        v_item := v_confidence_item; v_source := v_confidence_source; v_language := v_confidence_language;
        v_scope := v_confidence_scope; v_machines := v_confidence_machines; v_products := v_confidence_products;
      elsif v_case.case_key ~ '^P8-(00[1-9]|01[0-5]|02[2-9]|03[0-9])-' then
        v_item := v_cross_item; v_source := v_cross_source; v_language := v_cross_language;
        v_scope := v_cross_scope; v_machines := v_cross_machines; v_products := v_cross_products;
      else
        v_item := v_public_item; v_source := v_public_source; v_language := v_public_language;
        v_scope := v_public_scope; v_machines := v_public_machines; v_products := v_public_products;
      end if;

      v_expected := v_expected || jsonb_build_object(
        'knowledgeItemIds', jsonb_build_array(v_item),
        'sourceRevisionIds', jsonb_build_array(v_source),
        'citationIds', jsonb_build_array(v_source),
        'expectedSourceLanguage', v_language,
        'expectedAccessScope', v_scope,
        'expectedMachineIds', to_jsonb(v_machines),
        'expectedProductIds', to_jsonb(v_products)
      );
    end if;

    if coalesce((v_case.expected_result ->> 'authorizationAllowed')::boolean, true) = false then
      v_expected := v_expected || jsonb_build_object(
        'prohibitedKnowledgeItemIds', jsonb_build_array(v_technical_item, v_confidence_item),
        'prohibitedSourceRevisionIds', jsonb_build_array(v_technical_source, v_confidence_source),
        'prohibitedCitationIds', jsonb_build_array(v_technical_source, v_confidence_source),
        'authorizationProbe', 'LIVE_CANONICAL_IDENTITY'
      );
    end if;

    if v_case.case_key in ('P8-097-prompt-injection', 'P8-098-unicode-instrukce') then
      v_expected := (v_expected
        - 'prohibitedKnowledgeItemIds'
        - 'prohibitedSourceRevisionIds'
        - 'prohibitedCitationIds') || jsonb_build_object(
          'authorizationAllowed', true,
          'knowledgeItemIds', jsonb_build_array(v_confidence_item),
          'sourceRevisionIds', jsonb_build_array(v_confidence_source),
          'citationIds', jsonb_build_array(v_confidence_source),
          'expectedSourceLanguage', v_confidence_language,
          'expectedAccessScope', v_confidence_scope,
          'expectedMachineIds', to_jsonb(v_confidence_machines),
          'expectedProductIds', to_jsonb(v_confidence_products),
          'confidence', 'HIGH',
          'fallback', null,
          'authorizationProbe', 'LIVE_CANONICAL_CALLER'
        );
    end if;

    insert into public.support_evaluation_case_versions (
      case_id, version_number, status, title, category, language, actor_fixture, page_context,
      request_text, expected_result, severity, tags, is_critical, content_hash, source_kind,
      approved_by, approved_at, created_by
    ) values (
      v_case.case_id, 2, 'APPROVED', v_case.title, v_case.category, v_case.language,
      v_case.actor_fixture, v_case.page_context, v_case.request_text, v_expected,
      v_case.severity, v_case.tags, v_case.is_critical,
      encode(extensions.digest(convert_to(v_case.case_key || ':phase8-closure-v2:' || v_expected::text, 'UTF8'), 'sha256'), 'hex'),
      v_case.source_kind, v_approver, now(), v_approver
    )
    on conflict (case_id, version_number) do nothing;
  end loop;

  for v_suite in
    select s.id as suite_id, s.suite_key, sv.tier, sv.configuration
    from public.support_evaluation_suites s
    join public.support_evaluation_suite_versions sv on sv.suite_id = s.id
    where sv.version_number = 1 and sv.status = 'APPROVED'
    order by s.suite_key
  loop
    select count(*) into v_case_count
    from public.support_evaluation_suite_cases sc
    where sc.suite_version_id = (
      select id from public.support_evaluation_suite_versions
      where suite_id = v_suite.suite_id and version_number = 1
    );

    insert into public.support_evaluation_suite_versions (
      suite_id, version_number, status, tier, content_hash, case_count, configuration,
      approved_by, approved_at, created_by
    ) values (
      v_suite.suite_id, 2, 'APPROVED', v_suite.tier,
      encode(extensions.digest(convert_to(v_suite.suite_key || ':phase8-closure-v2', 'UTF8'), 'sha256'), 'hex'),
      v_case_count,
      v_suite.configuration || jsonb_build_object(
        'closureGrade', true,
        'bindingVersion', 'phase8-closure-v2',
        'authorizationMode', 'LIVE_CANONICAL_IDENTITY',
        'actionParityMode', 'CANONICAL_ADAPTER'
      ),
      v_approver, now(), v_approver
    )
    on conflict (suite_id, version_number) do nothing
    returning id into v_suite_version;

    if v_suite_version is null then
      select id into v_suite_version
      from public.support_evaluation_suite_versions
      where suite_id = v_suite.suite_id and version_number = 2;
    end if;

    insert into public.support_evaluation_suite_cases (suite_version_id, case_version_id, sort_order, is_required)
    select v_suite_version, cv2.id, sc.sort_order, sc.is_required
    from public.support_evaluation_suite_versions sv1
    join public.support_evaluation_suite_cases sc on sc.suite_version_id = sv1.id
    join public.support_evaluation_case_versions cv1 on cv1.id = sc.case_version_id
    join public.support_evaluation_case_versions cv2 on cv2.case_id = cv1.case_id and cv2.version_number = 2
    where sv1.suite_id = v_suite.suite_id and sv1.version_number = 1
    on conflict (suite_version_id, case_version_id) do nothing;

    v_suite_version := null;
  end loop;
end $$;
