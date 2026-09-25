-- Add the second optional Sales bonus case without changing the mandatory
-- curriculum. The campaign and simulated order remain browser-local Academy data.
alter table public.academy_cycle_awards
  drop constraint if exists academy_cycle_awards_award_check;
alter table public.academy_cycle_awards
  add constraint academy_cycle_awards_award_check
  check (award in ('bronze', 'silver', 'gold', 'advanced_sales'));

create or replace function public.academy_assigned_case_ids(p_modules text[], p_permissions jsonb)
returns text[] language sql immutable security invoker set search_path = public
as $$
  select case when coalesce('academy' = any(p_modules), false) then
    array['partnerdata.part_1_profile', 'partnerdata.part_2_relations', 'portal.basics_5', 'portal.partner_map']::text[]
    || case when coalesce(nullif(p_permissions->'academy_track_sales', 'null'::jsonb), 'true'::jsonb) = 'true'::jsonb then
      array[
        'sales.case_1_rc1000',
        'sales.case_2_video_3330',
        'sales.case_3_rc1000_delivery',
        'sales.bonus_case_2_3330_cs200_campaign',
        'crm.part_1',
        'crm.part_2'
      ]::text[]
      else '{}'::text[] end
    || case when p_permissions->'academy_track_service' = 'true'::jsonb then
      array['service.case_1_machine_history']::text[] else '{}'::text[] end
    else '{}'::text[] end;
$$;
revoke all on function public.academy_assigned_case_ids(text[], jsonb) from public, anon;
grant execute on function public.academy_assigned_case_ids(text[], jsonb) to authenticated, service_role;

create or replace function public.get_my_academy_cycle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.academy_current_user_id();
  v_cycle public.academy_cycles;
  v_completions jsonb;
  v_award_counts jsonb;
  v_cycle_awards jsonb;
begin
  v_cycle := public.academy_activate_due_cycle(v_user_id);

  if v_cycle.id is null then
    select * into v_cycle
    from public.academy_cycles
    where user_id = v_user_id
    order by cycle_number desc
    limit 1;
  end if;

  if v_cycle.id is null then
    return jsonb_build_object(
      'cycle', null,
      'completion_ids', '[]'::jsonb,
      'completed_cycle_count', 0,
      'award_counts', jsonb_build_object('bronze', 0, 'silver', 0, 'gold', 0, 'advanced_sales', 0),
      'awards', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(c.case_id order by c.completed_at), '[]'::jsonb)
    into v_completions
  from public.academy_cycle_completions c
  where c.cycle_id = v_cycle.id;

  select coalesce(jsonb_agg(a.award order by a.awarded_at), '[]'::jsonb)
    into v_cycle_awards
  from public.academy_cycle_awards a
  where a.cycle_id = v_cycle.id;

  select jsonb_build_object(
    'bronze', count(*) filter (where a.award = 'bronze'),
    'silver', count(*) filter (where a.award = 'silver'),
    'gold', count(*) filter (where a.award = 'gold'),
    'advanced_sales', count(*) filter (where a.award = 'advanced_sales')
  ) into v_award_counts
  from public.academy_cycle_awards a
  join public.academy_cycles c on c.id = a.cycle_id
  where c.user_id = v_user_id;

  return jsonb_build_object(
    'cycle', to_jsonb(v_cycle),
    'completion_ids', v_completions,
    'completed_cycle_count', (select count(*) from public.academy_cycles where user_id = v_user_id and status = 'completed'),
    'award_counts', v_award_counts,
    'awards', v_cycle_awards
  );
end;
$$;
revoke all on function public.get_my_academy_cycle() from public, anon, service_role;
grant execute on function public.get_my_academy_cycle() to authenticated;

create or replace function public.record_academy_cycle_completion(p_cycle_id uuid, p_case_id text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := public.academy_current_user_id();
  v_cycle public.academy_cycles;
  v_cases text[];
  v_mandatory_cases text[];
  v_total integer;
  v_bonus_total integer;
  v_next_activation timestamptz;
begin
  select public.academy_assigned_case_ids(coalesce(au.allowed_modules, au.module_access), au.permissions)
    into v_cases from public.app_users au
    where au.id = v_user_id and au.approved and au.is_active;
  if not coalesce(p_case_id = any(v_cases), false) then
    raise exception 'Academy case is not assigned to this user.' using errcode = '42501';
  end if;
  v_mandatory_cases := array_remove(
    array_remove(v_cases, 'sales.case_3_rc1000_delivery'),
    'sales.bonus_case_2_3330_cs200_campaign'
  );

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

  select count(*) into v_bonus_total from public.academy_cycle_completions
    where cycle_id = p_cycle_id
      and case_id in ('sales.case_3_rc1000_delivery', 'sales.bonus_case_2_3330_cs200_campaign');
  if v_bonus_total = 2 then
    insert into public.academy_cycle_awards (cycle_id, award)
      values (p_cycle_id, 'advanced_sales') on conflict (cycle_id, award) do nothing;
  end if;

  select count(*) into v_total from public.academy_cycle_completions
    where cycle_id = p_cycle_id and case_id = any(v_mandatory_cases);
  if v_total = cardinality(v_mandatory_cases) then
    insert into public.academy_cycle_awards (cycle_id, award) values (p_cycle_id, 'gold') on conflict (cycle_id, award) do nothing;
    v_next_activation := case v_cycle.cadence
      when 'annual' then now() + interval '1 year'
      when 'biennial' then now() + interval '2 years'
      when 'custom' then v_cycle.next_activation_at else null end;
    update public.academy_cycles set status = 'completed', completed_at = now(),
      completed_curriculum = v_mandatory_cases, next_activation_at = v_next_activation, updated_at = now()
      where id = p_cycle_id returning * into v_cycle;
    perform public.academy_write_audit('academy_cycle_completed', v_cycle, null,
      jsonb_build_object('completion_count', v_total, 'curriculum', v_mandatory_cases, 'next_activation_at', v_next_activation),
      array['status', 'completed_at', 'completed_curriculum', 'next_activation_at']);
  end if;
  return jsonb_build_object('cycle', to_jsonb(v_cycle), 'completion_count', v_total);
end;
$$;
revoke all on function public.record_academy_cycle_completion(uuid, text) from public, anon, service_role;
grant execute on function public.record_academy_cycle_completion(uuid, text) to authenticated;
