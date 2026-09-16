-- Central append-only mail metadata audit. Mail bodies and attachment contents
-- are intentionally excluded. Retention is managed operationally; keep metadata
-- for 24 months unless legal/operational policy requires a different period.

create table if not exists public.mail_audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  category text not null check (category in ('messe_lead', 'crm_lead', 'quote', 'order', 'invoice', 'warranty', 'service', 'claim', 'contract', 'system')),
  source_module text not null,
  source_action text not null,
  subject text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  responsible_user_id uuid references public.app_users(id) on delete set null,
  responsible_seller_id uuid references public.app_users(id) on delete set null,
  triggered_by_user_id uuid references public.app_users(id) on delete set null,
  related_entity_type text,
  related_entity_id text,
  related_entity_label text,
  status text not null check (status in ('queued', 'sent', 'failed')),
  provider text,
  provider_message_id text,
  attachment_count integer not null default 0 check (attachment_count >= 0),
  error_message text,
  constraint mail_audit_events_error_only_on_failure
    check (status = 'failed' or error_message is null)
);

create index if not exists mail_audit_events_created_at_idx
  on public.mail_audit_events (created_at desc);
create index if not exists mail_audit_events_category_created_at_idx
  on public.mail_audit_events (category, created_at desc);
create index if not exists mail_audit_events_status_created_at_idx
  on public.mail_audit_events (status, created_at desc);
create index if not exists mail_audit_events_related_entity_idx
  on public.mail_audit_events (related_entity_type, related_entity_id, created_at desc);
create index if not exists mail_audit_events_responsible_seller_idx
  on public.mail_audit_events (responsible_seller_id, created_at desc);

create or replace function public.mail_audit_actor_is_allowed()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.is_active = true
      and au.approved = true
      and lower(au.status) in ('active', 'approved')
      and au.portal_role::text in ('timan_backend', 'timan_seller', 'exhibition_user')
  );
$$;

create or replace function public.mail_audit_set_trigger_actor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  select au.id
  into new.triggered_by_user_id
  from public.app_users au
  where au.auth_user_id = (select auth.uid())
  limit 1;

  if new.responsible_user_id is null then
    new.responsible_user_id := new.responsible_seller_id;
  end if;

  return new;
end;
$$;

drop trigger if exists mail_audit_events_set_trigger_actor on public.mail_audit_events;
create trigger mail_audit_events_set_trigger_actor
before insert on public.mail_audit_events
for each row execute function public.mail_audit_set_trigger_actor();

alter table public.mail_audit_events enable row level security;
revoke all on public.mail_audit_events from public, anon;
grant select, insert on public.mail_audit_events to authenticated;
grant all on public.mail_audit_events to service_role;

drop policy if exists mail_audit_events_insert_internal_or_messe on public.mail_audit_events;
create policy mail_audit_events_insert_internal_or_messe
on public.mail_audit_events
for insert
to authenticated
with check ((select public.mail_audit_actor_is_allowed()));

drop policy if exists mail_audit_events_select_backend_only on public.mail_audit_events;
create policy mail_audit_events_select_backend_only
on public.mail_audit_events
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.portal_role::text = 'timan_backend'
      and au.is_active = true
      and au.approved = true
      and lower(au.status) in ('active', 'approved')
  )
);

comment on table public.mail_audit_events is
  'Append-only portal mail metadata. No mail body or attachment contents. Proposed metadata retention: 24 months.';
