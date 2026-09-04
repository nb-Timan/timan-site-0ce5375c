-- A submitted Configurator order closes its linked CRM lead without creating
-- duplicate quote/order records. Existing submitted rows are deliberately not
-- bulk-updated: only the canonical submission transition changes a lead.

create or replace function public.sync_submitted_configuration_order_to_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
begin
  if new.lead_id is null
    or public.is_submitted_configurator_order(old)
    or not public.is_submitted_configurator_order(new) then
    return new;
  end if;

  update public.crm_leads
     set next_activity = 'Closed with order',
         probability = 100,
         pipeline_stage = 'Won',
         status = 'closed',
         incomplete_from_configurator = false,
         updated_at = now()
   where id = new.lead_id;

  select * into actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    actor.actor_user_id, actor.actor_email, actor.actor_name, actor.actor_role,
    'submitted_order_closed_lead', 'crm', 'crm_leads', new.lead_id::text,
    coalesce(new.order_number, new.quote_number, new.id::text),
    jsonb_build_object('configuration_id', new.id),
    jsonb_build_object('configuration_id', new.id, 'next_activity', 'Closed with order', 'pipeline_stage', 'Won'),
    array['next_activity', 'probability', 'pipeline_stage', 'status'], 'success'
  );

  return new;
end;
$$;

drop trigger if exists sync_submitted_configuration_order_to_lead on public.configurations;
create trigger sync_submitted_configuration_order_to_lead
  after update on public.configurations
  for each row execute function public.sync_submitted_configuration_order_to_lead();

-- Submitted orders never become drafts again. A Backend correction opens one
-- short-lived, user-bound exception that the write guards below verify.
create table if not exists public.configurator_order_correction_sessions (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id) on delete cascade,
  actor_auth_user_id uuid not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  reason text not null check (length(btrim(reason)) > 0),
  before_snapshot jsonb not null,
  after_snapshot jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz
);

create index if not exists configurator_order_correction_sessions_active_idx
  on public.configurator_order_correction_sessions (configuration_id, actor_auth_user_id, expires_at)
  where status = 'active';

alter table public.configurator_order_correction_sessions enable row level security;
revoke all on table public.configurator_order_correction_sessions from anon, authenticated, public;

create or replace function public.has_active_submitted_configurator_order_correction(
  p_configuration_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_timan_backend()
     and exists (
       select 1
       from public.configurator_order_correction_sessions s
       where s.configuration_id = p_configuration_id
         and s.actor_auth_user_id = auth.uid()
         and s.status = 'active'
         and s.expires_at > now()
     );
$$;

create or replace function public.begin_submitted_configurator_order_correction(
  p_configuration_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.configurations;
  actor record;
  session_id uuid;
  snapshot jsonb;
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can correct submitted orders' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A correction reason is required' using errcode = '22023';
  end if;

  select * into target from public.configurations where id = p_configuration_id for update;
  if not found or not public.is_submitted_configurator_order(target) then
    raise exception 'Only submitted orders can be corrected' using errcode = '22023';
  end if;

  update public.configurator_order_correction_sessions
     set status = 'expired'
   where configuration_id = p_configuration_id and status = 'active' and expires_at <= now();

  select jsonb_build_object(
    'configuration', to_jsonb(target),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.configuration_items i where i.configuration_id = p_configuration_id), '[]'::jsonb)
  ) into snapshot;
  select * into actor from public.audit_current_actor();

  insert into public.configurator_order_correction_sessions (
    configuration_id, actor_auth_user_id, actor_user_id, reason, before_snapshot
  ) values (
    p_configuration_id, auth.uid(), actor.actor_user_id, btrim(p_reason), snapshot
  ) returning id into session_id;

  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    actor.actor_user_id, actor.actor_email, actor.actor_name, actor.actor_role,
    'submitted_order_correction_started', 'configurator', 'configurations', p_configuration_id::text,
    coalesce(target.order_number, target.quote_number, p_configuration_id::text),
    jsonb_build_object('reason', btrim(p_reason)), jsonb_build_object('session_id', session_id, 'expires_at', now() + interval '15 minutes'),
    array['backend_correction'], 'success'
  );

  return session_id;
end;
$$;

create or replace function public.complete_submitted_configurator_order_correction(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.configurator_order_correction_sessions;
  target public.configurations;
  actor record;
  snapshot jsonb;
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can complete submitted-order corrections' using errcode = '42501';
  end if;

  select * into session_row
    from public.configurator_order_correction_sessions
   where id = p_session_id and actor_auth_user_id = auth.uid() and status = 'active'
   for update;
  if not found or session_row.expires_at <= now() then
    raise exception 'The correction window has expired' using errcode = '42501';
  end if;

  select * into target from public.configurations where id = session_row.configuration_id;
  if not found or not public.is_submitted_configurator_order(target) then
    raise exception 'The configuration must remain a submitted order' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'configuration', to_jsonb(target),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.configuration_items i where i.configuration_id = target.id), '[]'::jsonb)
  ) into snapshot;

  update public.configurator_order_correction_sessions
     set after_snapshot = snapshot, status = 'completed', completed_at = now()
   where id = p_session_id;

  select * into actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    actor.actor_user_id, actor.actor_email, actor.actor_name, actor.actor_role,
    'submitted_order_correction_completed', 'configurator', 'configurations', target.id::text,
    coalesce(target.order_number, target.quote_number, target.id::text),
    session_row.before_snapshot, snapshot, array['backend_correction'], 'success'
  );
end;
$$;

-- Reuse the P1 guard: a submitted order remains read-only unless the caller
-- holds the short-lived Backend correction session for that exact order.
create or replace function public.prevent_submitted_configurator_order_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_configuration_id uuid;
begin
  if tg_table_name = 'configurations' then
    if public.is_submitted_configurator_order(old)
      and not public.has_active_submitted_configurator_order_correction(old.id) then
      raise exception 'Submitted configurator orders are read-only';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  target_configuration_id := case when tg_op = 'DELETE' then old.configuration_id else new.configuration_id end;
  if exists (
    select 1 from public.configurations c
    where c.id = target_configuration_id
      and public.is_submitted_configurator_order(c)
      and not public.has_active_submitted_configurator_order_correction(c.id)
  ) then
    raise exception 'Items on submitted configurator orders are read-only';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.has_active_submitted_configurator_order_correction(uuid) from public, anon, authenticated;
revoke all on function public.begin_submitted_configurator_order_correction(uuid, text) from public, anon;
revoke all on function public.complete_submitted_configurator_order_correction(uuid) from public, anon;
grant execute on function public.begin_submitted_configurator_order_correction(uuid, text) to authenticated;
grant execute on function public.complete_submitted_configurator_order_correction(uuid) to authenticated;
