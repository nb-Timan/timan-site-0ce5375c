-- Phase 20: Audit log table for Timan Backend
-- Run this in Supabase SQL Editor.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
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
  old_value text,
  new_value text,
  status text not null default 'success',
  ip_address text,
  user_agent text
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_module_idx on public.audit_log (module);
create index if not exists audit_log_action_idx on public.audit_log (action);
create index if not exists audit_log_actor_email_idx on public.audit_log (actor_email);

alter table public.audit_log enable row level security;

-- Anyone authenticated may insert their own audit entries (actor_email matches).
-- Keeping insert open to authenticated so client-side handlers can log actions.
drop policy if exists "audit_log insert by authenticated" on public.audit_log;
create policy "audit_log insert by authenticated"
on public.audit_log
for insert
to authenticated
with check (true);

-- Only Timan Backend users (app_users.role = 'timan_backend') may read.
drop policy if exists "audit_log read by timan backend" on public.audit_log;
create policy "audit_log read by timan backend"
on public.audit_log
for select
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'timan_backend'
  )
);

-- Anonymous insert allowed too, in case unauthenticated flows need to log
-- (e.g. login attempts). Comment out if not desired.
drop policy if exists "audit_log insert by anon" on public.audit_log;
create policy "audit_log insert by anon"
on public.audit_log
for insert
to anon
with check (true);
