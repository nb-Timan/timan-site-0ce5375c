-- Operational Audit Log
--
-- Purpose: "who changed what, when, and on which record".
-- Keep this separate from portal_module_usage, which measures usage analytics.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  actor_name text,
  actor_role text,
  active_mode text,
  seller_context text,
  action text not null,
  module text not null,
  record_type text,
  record_id text,
  record_label text,
  old_value jsonb,
  new_value jsonb,
  changed_fields text[] not null default '{}',
  status text not null default 'success',
  ip_address text,
  user_agent text
);

alter table public.audit_log
  add column if not exists actor_user_id uuid,
  add column if not exists changed_fields text[] not null default '{}';

alter table public.audit_log
  alter column old_value type jsonb using
    case
      when old_value is null then null
      when jsonb_typeof(to_jsonb(old_value)) = 'object' then to_jsonb(old_value)
      else to_jsonb(old_value)
    end,
  alter column new_value type jsonb using
    case
      when new_value is null then null
      when jsonb_typeof(to_jsonb(new_value)) = 'object' then to_jsonb(new_value)
      else to_jsonb(new_value)
    end;

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_module_idx on public.audit_log (module);
create index if not exists audit_log_action_idx on public.audit_log (action);
create index if not exists audit_log_actor_email_idx on public.audit_log (actor_email);
create index if not exists audit_log_record_type_idx on public.audit_log (record_type);
create index if not exists audit_log_record_lookup_idx on public.audit_log (record_type, record_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log insert by authenticated" on public.audit_log;
drop policy if exists "audit_log read by timan backend" on public.audit_log;
drop policy if exists "audit_log insert by anon" on public.audit_log;
drop policy if exists "audit_log read budget for seller" on public.audit_log;

drop policy if exists audit_log_insert_authenticated on public.audit_log;
create policy audit_log_insert_authenticated
on public.audit_log
for insert
to authenticated
with check (true);

drop policy if exists audit_log_read_timan_backend on public.audit_log;
create policy audit_log_read_timan_backend
on public.audit_log
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.portal_role::text = 'timan_backend'
      and au.approved is true
      and au.is_active is true
  )
);

grant select, insert on public.audit_log to authenticated;

create or replace function public.audit_current_actor()
returns table (
  actor_user_id uuid,
  actor_email text,
  actor_name text,
  actor_role text
)
language sql
stable
set search_path = public
as $$
  select
    au.id,
    au.email,
    coalesce(au.full_name, au.display_name, au.email),
    au.portal_role::text
  from public.app_users au
  where au.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.audit_filter_payload(payload jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(payload, '{}'::jsonb))
  where key not in (
    'password',
    'token',
    'secret',
    'credential',
    'access_token',
    'refresh_token',
    'service_role_key',
    'supabase_service_role_key',
    'attachments',
    'updated_at'
  )
$$;

create or replace function public.audit_changed_fields(old_payload jsonb, new_payload jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(key order by key), '{}'::text[])
  from (
    select key
    from jsonb_object_keys(coalesce(old_payload, '{}'::jsonb) || coalesce(new_payload, '{}'::jsonb)) as keys(key)
    where coalesce(old_payload -> key, 'null'::jsonb) is distinct from coalesce(new_payload -> key, 'null'::jsonb)
  ) changed
$$;

create or replace function public.audit_crm_lead_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  a record;
  old_payload jsonb;
  new_payload jsonb;
  changed text[];
  label text;
  rec_id text;
begin
  select * into a from public.audit_current_actor();

  if tg_op = 'INSERT' then
    old_payload := null;
    new_payload := public.audit_filter_payload(to_jsonb(new));
    label := coalesce(new.title, new.customer_type, new.id::text);
    rec_id := new.id::text;
  elsif tg_op = 'UPDATE' then
    old_payload := public.audit_filter_payload(to_jsonb(old));
    new_payload := public.audit_filter_payload(to_jsonb(new));
    changed := public.audit_changed_fields(old_payload, new_payload);
    if coalesce(array_length(changed, 1), 0) = 0 then
      return new;
    end if;
    old_payload := (
      select coalesce(jsonb_object_agg(field, old_payload -> field), '{}'::jsonb)
      from unnest(changed) field
    );
    new_payload := (
      select coalesce(jsonb_object_agg(field, new_payload -> field), '{}'::jsonb)
      from unnest(changed) field
    );
    label := coalesce(new.title, old.title, new.customer_type, old.customer_type, new.id::text);
    rec_id := new.id::text;
  else
    old_payload := public.audit_filter_payload(to_jsonb(old));
    new_payload := null;
    label := coalesce(old.title, old.customer_type, old.id::text);
    rec_id := old.id::text;
  end if;

  changed := coalesce(changed, public.audit_changed_fields(old_payload, new_payload));

  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_name,
    actor_role,
    action,
    module,
    record_type,
    record_id,
    record_label,
    old_value,
    new_value,
    changed_fields,
    status
  )
  values (
    a.actor_user_id,
    coalesce(a.actor_email, (select auth.email())),
    a.actor_name,
    a.actor_role,
    lower(tg_op),
    'crm_leads',
    tg_table_name,
    rec_id,
    label,
    old_payload,
    new_payload,
    changed,
    'success'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.crm_leads') is not null then
    drop trigger if exists audit_crm_leads_changes on public.crm_leads;
    create trigger audit_crm_leads_changes
      after insert or update or delete on public.crm_leads
      for each row execute function public.audit_crm_lead_change();
  end if;

  if to_regclass('public.crm_demo_leads') is not null then
    drop trigger if exists audit_crm_demo_leads_changes on public.crm_demo_leads;
    create trigger audit_crm_demo_leads_changes
      after insert or update or delete on public.crm_demo_leads
      for each row execute function public.audit_crm_lead_change();
  end if;
end $$;

grant execute on function public.audit_current_actor() to authenticated;
grant execute on function public.audit_filter_payload(jsonb) to authenticated;
grant execute on function public.audit_changed_fields(jsonb, jsonb) to authenticated;
grant execute on function public.audit_crm_lead_change() to authenticated;
