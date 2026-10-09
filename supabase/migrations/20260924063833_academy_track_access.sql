-- Track entitlement reuses protected app_users.permissions. Absent keys retain
-- the previous Basic + Sales curriculum; Service is never enabled implicitly.
create or replace function public.academy_assigned_case_ids(p_modules text[], p_permissions jsonb)
returns text[] language sql immutable security invoker set search_path = public
as $$
  select case when coalesce('academy' = any(p_modules), false) then
    array['partnerdata.part_1_profile', 'partnerdata.part_2_relations', 'portal.basics_5', 'portal.partner_map']::text[]
    || case when coalesce(nullif(p_permissions->'academy_track_sales', 'null'::jsonb), 'true'::jsonb) = 'true'::jsonb then
      array['sales.case_1_rc1000', 'sales.case_2_video_3330', 'crm.part_1', 'crm.part_2']::text[]
      else '{}'::text[] end
    else '{}'::text[] end;
$$;
revoke all on function public.academy_assigned_case_ids(text[], jsonb) from public, anon;
grant execute on function public.academy_assigned_case_ids(text[], jsonb) to authenticated, service_role;

-- Freeze only the curriculum identity at completion, not training data or access.
alter table public.academy_cycles add column if not exists completed_curriculum text[];
update public.academy_cycles set completed_curriculum = array[
  'partnerdata.part_1_profile', 'partnerdata.part_2_relations', 'portal.basics_5', 'portal.partner_map',
  'sales.case_1_rc1000', 'sales.case_2_video_3330', 'crm.part_1', 'crm.part_2'
] where status = 'completed' and completed_curriculum is null;

create or replace function public.record_academy_cycle_completion(p_cycle_id uuid, p_case_id text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := public.academy_current_user_id();
  v_cycle public.academy_cycles;
  v_cases text[];
  v_total integer;
  v_next_activation timestamptz;
begin
  select public.academy_assigned_case_ids(coalesce(au.allowed_modules, au.module_access), au.permissions)
    into v_cases from public.app_users au
    where au.id = v_user_id and au.approved and au.is_active;
  if not coalesce(p_case_id = any(v_cases), false) then
    raise exception 'Academy case is not assigned to this user.' using errcode = '42501';
  end if;
  select * into v_cycle from public.academy_cycles
    where id = p_cycle_id and user_id = v_user_id for update;
  if not found or v_cycle.status <> 'active' then
    raise exception 'Academy cycle is not active for this user.' using errcode = '42501';
  end if;

  insert into public.academy_cycle_completions (cycle_id, case_id)
    values (p_cycle_id, p_case_id) on conflict (cycle_id, case_id) do nothing;
  if p_case_id = 'sales.case_1_rc1000' then
    insert into public.academy_cycle_awards (cycle_id, award) values (p_cycle_id, 'bronze') on conflict (cycle_id, award) do nothing;
  elsif p_case_id = 'sales.case_2_video_3330' then
    insert into public.academy_cycle_awards (cycle_id, award) values (p_cycle_id, 'silver') on conflict (cycle_id, award) do nothing;
  end if;
  select count(*) into v_total from public.academy_cycle_completions
    where cycle_id = p_cycle_id and case_id = any(v_cases);
  if v_total = cardinality(v_cases) then
    insert into public.academy_cycle_awards (cycle_id, award) values (p_cycle_id, 'gold') on conflict (cycle_id, award) do nothing;
    v_next_activation := case v_cycle.cadence
      when 'annual' then now() + interval '1 year'
      when 'biennial' then now() + interval '2 years'
      when 'custom' then v_cycle.next_activation_at else null end;
    update public.academy_cycles set status = 'completed', completed_at = now(),
      completed_curriculum = v_cases, next_activation_at = v_next_activation, updated_at = now()
      where id = p_cycle_id returning * into v_cycle;
    perform public.academy_write_audit('academy_cycle_completed', v_cycle, null,
      jsonb_build_object('completion_count', v_total, 'curriculum', v_cases, 'next_activation_at', v_next_activation),
      array['status', 'completed_at', 'completed_curriculum', 'next_activation_at']);
  end if;
  return jsonb_build_object('cycle', to_jsonb(v_cycle), 'completion_count', v_total);
end;
$$;
revoke all on function public.record_academy_cycle_completion(uuid, text) from public, anon, service_role;
grant execute on function public.record_academy_cycle_completion(uuid, text) to authenticated;
