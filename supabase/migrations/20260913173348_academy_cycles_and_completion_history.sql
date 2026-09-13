-- Canonical Academy cycle metadata. Training exercises remain local-only;
-- these tables retain only the user's Academy lifecycle and completion history.

create table public.academy_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  cycle_number integer not null check (cycle_number > 0),
  status text not null default 'active' check (status in ('active', 'completed')),
  cadence text not null default 'manual' check (cadence in ('manual', 'annual', 'biennial', 'custom')),
  activated_at timestamptz not null default now(),
  completed_at timestamptz,
  next_activation_at timestamptz,
  reset_version integer not null default 0 check (reset_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_cycles_user_number_key unique (user_id, cycle_number),
  constraint academy_cycles_completed_at_check check (
    (status = 'active' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index academy_cycles_one_active_per_user_idx
  on public.academy_cycles (user_id)
  where status = 'active';

create index academy_cycles_user_history_idx
  on public.academy_cycles (user_id, cycle_number desc);

create index academy_cycles_due_idx
  on public.academy_cycles (next_activation_at)
  where status = 'completed' and next_activation_at is not null;

create table public.academy_cycle_completions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.academy_cycles(id) on delete cascade,
  case_id text not null,
  completed_at timestamptz not null default now(),
  constraint academy_cycle_completions_cycle_case_key unique (cycle_id, case_id)
);

create index academy_cycle_completions_cycle_idx
  on public.academy_cycle_completions (cycle_id, completed_at);

-- Awards are immutable historical facts, not counters. A reset can clear a
-- current cycle's training progress without manufacturing another award.
create table public.academy_cycle_awards (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.academy_cycles(id) on delete cascade,
  award text not null check (award in ('bronze', 'silver', 'gold')),
  awarded_at timestamptz not null default now(),
  constraint academy_cycle_awards_cycle_award_key unique (cycle_id, award)
);

create index academy_cycle_awards_cycle_idx
  on public.academy_cycle_awards (cycle_id, awarded_at);

alter table public.academy_cycles enable row level security;
alter table public.academy_cycle_completions enable row level security;
alter table public.academy_cycle_awards enable row level security;

create or replace function public.academy_is_backend()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_timan_backend();
$$;

create or replace function public.academy_current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select au.id into v_user_id
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and coalesce(au.approved, false)
    and coalesce(au.is_active, false)
  limit 1;

  if v_user_id is null then
    raise exception 'Academy requires an active portal user.' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.academy_write_audit(
  p_action text,
  p_cycle public.academy_cycles,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_changed_fields text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    v_actor.actor_user_id, v_actor.actor_email, v_actor.actor_name, v_actor.actor_role,
    p_action, 'academy', 'academy_cycle', p_cycle.id::text,
    format('Academy cycle %s for %s', p_cycle.cycle_number, p_cycle.user_id),
    p_old_value, p_new_value, p_changed_fields, 'success'
  );
end;
$$;

create or replace function public.academy_activate_due_cycle(p_user_id uuid)
returns public.academy_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due public.academy_cycles;
  v_cycle public.academy_cycles;
begin
  -- Both login activation and Backend actions can reach this helper. Locking
  -- the user keeps the partial unique index from becoming a race condition.
  perform pg_advisory_xact_lock(hashtext('academy-cycle:' || p_user_id::text));

  select * into v_cycle
  from public.academy_cycles
  where user_id = p_user_id and status = 'active'
  order by cycle_number desc
  limit 1;
  if found then return v_cycle; end if;

  select * into v_due
  from public.academy_cycles
  where user_id = p_user_id
    and status = 'completed'
    and next_activation_at is not null
    and next_activation_at <= now()
  order by cycle_number desc
  limit 1;
  if not found then return null; end if;

  insert into public.academy_cycles (user_id, cycle_number, status, cadence, activated_at)
  values (p_user_id, v_due.cycle_number + 1, 'active', v_due.cadence, now())
  returning * into v_cycle;

  perform public.academy_write_audit(
    'academy_cycle_reactivated', v_cycle, null,
    jsonb_build_object('source_cycle_id', v_due.id, 'cadence', v_cycle.cadence),
    array['status', 'activated_at']
  );
  return v_cycle;
end;
$$;

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
  -- Renewal is evaluated by trusted server code at login/read time. A portal
  -- user cannot choose the date, cadence, or target user, and a per-user lock
  -- makes a due renewal idempotent.
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
      'award_counts', jsonb_build_object('bronze', 0, 'silver', 0, 'gold', 0),
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
    'gold', count(*) filter (where a.award = 'gold')
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

create or replace function public.record_academy_cycle_completion(
  p_cycle_id uuid,
  p_case_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.academy_current_user_id();
  v_cycle public.academy_cycles;
  v_total integer;
  v_next_activation timestamptz;
begin
  if p_case_id not in (
    'sales.case_1_rc1000', 'sales.case_2_video_3330',
    'portal.basics_5', 'portal.partner_map',
    'crm.part_1', 'crm.part_2',
    'partnerdata.part_1_profile', 'partnerdata.part_2_relations'
  ) then
    raise exception 'Unknown Academy case.' using errcode = '22023';
  end if;

  select * into v_cycle
  from public.academy_cycles
  where id = p_cycle_id and user_id = v_user_id
  for update;
  if not found or v_cycle.status <> 'active' then
    raise exception 'Academy cycle is not active for this user.' using errcode = '42501';
  end if;

  insert into public.academy_cycle_completions (cycle_id, case_id)
  values (p_cycle_id, p_case_id)
  on conflict (cycle_id, case_id) do nothing;

  if p_case_id = 'sales.case_1_rc1000' then
    insert into public.academy_cycle_awards (cycle_id, award)
    values (p_cycle_id, 'bronze')
    on conflict (cycle_id, award) do nothing;
  elsif p_case_id = 'sales.case_2_video_3330' then
    insert into public.academy_cycle_awards (cycle_id, award)
    values (p_cycle_id, 'silver')
    on conflict (cycle_id, award) do nothing;
  end if;

  select count(*) into v_total
  from public.academy_cycle_completions
  where cycle_id = p_cycle_id;

  if v_total = 8 then
    insert into public.academy_cycle_awards (cycle_id, award)
    values (p_cycle_id, 'gold')
    on conflict (cycle_id, award) do nothing;
    v_next_activation := case v_cycle.cadence
      when 'annual' then now() + interval '1 year'
      when 'biennial' then now() + interval '2 years'
      when 'custom' then v_cycle.next_activation_at
      else null
    end;
    update public.academy_cycles
       set status = 'completed', completed_at = now(), next_activation_at = v_next_activation, updated_at = now()
     where id = p_cycle_id
     returning * into v_cycle;
    perform public.academy_write_audit(
      'academy_cycle_completed', v_cycle, null,
      jsonb_build_object('completion_count', v_total, 'next_activation_at', v_next_activation),
      array['status', 'completed_at', 'next_activation_at']
    );
  end if;

  return jsonb_build_object('cycle', to_jsonb(v_cycle), 'completion_count', v_total);
end;
$$;

create or replace function public.admin_start_academy_cycle(
  p_user_id uuid,
  p_cadence text default 'manual',
  p_next_activation_at timestamptz default null
)
returns public.academy_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.academy_cycles;
begin
  if not public.academy_is_backend() then
    raise exception 'Only Timan Backend can start Academy cycles.' using errcode = '42501';
  end if;
  if p_cadence not in ('manual', 'annual', 'biennial', 'custom') then
    raise exception 'Invalid Academy cadence.' using errcode = '22023';
  end if;
  if p_cadence = 'custom' and p_next_activation_at is null then
    raise exception 'Custom Academy cadence requires an activation date.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('academy-cycle:' || p_user_id::text));

  if not exists (
    select 1
    from public.app_users au
    where au.id = p_user_id
      and coalesce(au.approved, false)
      and coalesce(au.is_active, false)
  ) then
    raise exception 'Academy cycles require an active approved portal user.' using errcode = '42501';
  end if;

  select * into v_cycle from public.academy_cycles
  where user_id = p_user_id and status = 'active'
  order by cycle_number desc limit 1;
  if found then return v_cycle; end if;

  insert into public.academy_cycles (user_id, cycle_number, cadence, next_activation_at)
  values (
    p_user_id,
    coalesce((select max(cycle_number) + 1 from public.academy_cycles where user_id = p_user_id), 1),
    p_cadence,
    case when p_cadence = 'custom' then p_next_activation_at else null end
  ) returning * into v_cycle;
  perform public.academy_write_audit('academy_cycle_started', v_cycle, null,
    jsonb_build_object('cadence', p_cadence, 'next_activation_at', v_cycle.next_activation_at),
    array['status', 'cadence', 'activated_at']);
  return v_cycle;
end;
$$;

create or replace function public.admin_reset_academy_cycle(p_user_id uuid)
returns public.academy_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.academy_cycles;
  v_old jsonb;
begin
  if not public.academy_is_backend() then
    raise exception 'Only Timan Backend can reset Academy cycles.' using errcode = '42501';
  end if;
  select * into v_cycle from public.academy_cycles
  where user_id = p_user_id and status = 'active'
  order by cycle_number desc limit 1 for update;
  if not found then
    raise exception 'No active Academy cycle to reset.' using errcode = 'P0002';
  end if;
  v_old := jsonb_build_object('reset_version', v_cycle.reset_version, 'completion_count',
    (select count(*) from public.academy_cycle_completions where cycle_id = v_cycle.id));
  delete from public.academy_cycle_completions where cycle_id = v_cycle.id;
  update public.academy_cycles
     set reset_version = reset_version + 1, activated_at = now(), updated_at = now()
   where id = v_cycle.id
   returning * into v_cycle;
  perform public.academy_write_audit('academy_cycle_reset', v_cycle, v_old,
    jsonb_build_object('reset_version', v_cycle.reset_version), array['reset_version', 'activated_at']);
  return v_cycle;
end;
$$;

create or replace function public.admin_set_academy_cycle_cadence(
  p_user_id uuid,
  p_cadence text,
  p_next_activation_at timestamptz default null
)
returns public.academy_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.academy_cycles;
  v_old jsonb;
  v_next_activation timestamptz;
begin
  if not public.academy_is_backend() then
    raise exception 'Only Timan Backend can plan Academy recurrence.' using errcode = '42501';
  end if;
  if p_cadence not in ('manual', 'annual', 'biennial', 'custom') then
    raise exception 'Invalid Academy cadence.' using errcode = '22023';
  end if;
  if p_cadence = 'custom' and p_next_activation_at is null then
    raise exception 'Custom Academy cadence requires an activation date.' using errcode = '22023';
  end if;
  select * into v_cycle from public.academy_cycles
  where user_id = p_user_id order by cycle_number desc limit 1 for update;
  if not found then
    raise exception 'No Academy cycle found for this user.' using errcode = 'P0002';
  end if;
  v_old := jsonb_build_object('cadence', v_cycle.cadence, 'next_activation_at', v_cycle.next_activation_at);
  v_next_activation := case
    when p_cadence = 'annual' and v_cycle.completed_at is not null then v_cycle.completed_at + interval '1 year'
    when p_cadence = 'biennial' and v_cycle.completed_at is not null then v_cycle.completed_at + interval '2 years'
    when p_cadence = 'custom' then p_next_activation_at
    else null
  end;
  update public.academy_cycles
     set cadence = p_cadence,
         next_activation_at = v_next_activation,
         updated_at = now()
   where id = v_cycle.id
   returning * into v_cycle;
  perform public.academy_write_audit('academy_cycle_cadence_updated', v_cycle, v_old,
    jsonb_build_object('cadence', v_cycle.cadence, 'next_activation_at', v_cycle.next_activation_at),
    array['cadence', 'next_activation_at']);
  return v_cycle;
end;
$$;

create or replace function public.admin_get_academy_cycle_history(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.academy_is_backend() then
    raise exception 'Only Timan Backend can view Academy history.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cycle', to_jsonb(c),
      'completion_ids', coalesce((select jsonb_agg(ac.case_id order by ac.completed_at)
        from public.academy_cycle_completions ac where ac.cycle_id = c.id), '[]'::jsonb),
      'awards', coalesce((select jsonb_agg(aa.award order by aa.awarded_at)
        from public.academy_cycle_awards aa where aa.cycle_id = c.id), '[]'::jsonb)
    ) order by c.cycle_number desc)
    from public.academy_cycles c
    where c.user_id = p_user_id
  ), '[]'::jsonb);
end;
$$;

create policy academy_cycles_select_owner_or_backend
on public.academy_cycles for select to authenticated
using (user_id = public.academy_current_user_id() or public.academy_is_backend());

create policy academy_cycle_completions_select_owner_or_backend
on public.academy_cycle_completions for select to authenticated
using (
  exists (
    select 1 from public.academy_cycles c
    where c.id = academy_cycle_completions.cycle_id
      and (c.user_id = public.academy_current_user_id() or public.academy_is_backend())
  )
);

create policy academy_cycle_awards_select_owner_or_backend
on public.academy_cycle_awards for select to authenticated
using (
  exists (
    select 1 from public.academy_cycles c
    where c.id = academy_cycle_awards.cycle_id
      and (c.user_id = public.academy_current_user_id() or public.academy_is_backend())
  )
);

grant select on public.academy_cycles, public.academy_cycle_completions, public.academy_cycle_awards to authenticated;

-- Lifecycle writes remain behind explicit RPCs. The two narrow read helpers
-- must be executable by authenticated users because the RLS policies invoke
-- them while evaluating direct read access.
revoke all on function public.academy_is_backend() from public, anon, authenticated, service_role;
revoke all on function public.academy_current_user_id() from public, anon, authenticated, service_role;
revoke all on function public.academy_write_audit(text, public.academy_cycles, jsonb, jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.academy_activate_due_cycle(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_academy_cycle() from public, anon, authenticated, service_role;
revoke all on function public.record_academy_cycle_completion(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_start_academy_cycle(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.admin_reset_academy_cycle(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_academy_cycle_cadence(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_academy_cycle_history(uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_my_academy_cycle() to authenticated;
grant execute on function public.record_academy_cycle_completion(uuid, text) to authenticated;
grant execute on function public.admin_start_academy_cycle(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_reset_academy_cycle(uuid) to authenticated;
grant execute on function public.admin_set_academy_cycle_cadence(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_get_academy_cycle_history(uuid) to authenticated;
grant execute on function public.academy_is_backend() to authenticated;
grant execute on function public.academy_current_user_id() to authenticated;
