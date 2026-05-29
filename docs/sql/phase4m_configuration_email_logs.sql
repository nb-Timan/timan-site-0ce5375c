-- Phase 4m: Configuration email send log
--
-- Append-only audit log of every send attempt (success or failed) for
-- quotes and orders dispatched via the n8n webhook.
--
-- - Does NOT change pricing, PDF layout, n8n workflow or CRM scope.
-- - One row per send attempt (resend = new row).
-- - CC/BCC columns exist for future readiness; UI logs empty arrays today.
-- - Safe to re-run: idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- - No DELETE / UPDATE policies are created. Logs are immutable.

create table if not exists public.configuration_email_logs (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id) on delete cascade,
  document_type text not null check (document_type in ('quote','order')),
  quote_number text,
  order_number text,
  to_recipients text[] not null default '{}',
  cc_recipients text[] not null default '{}',
  bcc_recipients text[] not null default '{}',
  sent_at timestamptz not null default now(),
  send_status text not null check (send_status in ('success','failed')),
  http_status int,
  error_message text,
  webhook_response text,
  webhook_url text,
  pdf_filename text,
  pdf_storage_path text,
  created_by_user_id uuid,
  created_by_email text,
  seller_email text,
  seller_initials text,
  created_at timestamptz not null default now()
);

create index if not exists configuration_email_logs_config_idx
  on public.configuration_email_logs (configuration_id, sent_at desc);
create index if not exists configuration_email_logs_doctype_idx
  on public.configuration_email_logs (document_type, sent_at desc);
create index if not exists configuration_email_logs_seller_idx
  on public.configuration_email_logs (seller_email, sent_at desc);

-- Grants (Supabase Data API requires explicit grants on public schema)
grant select, insert on public.configuration_email_logs to authenticated;
grant all on public.configuration_email_logs to service_role;

alter table public.configuration_email_logs enable row level security;

-- INSERT: any authenticated user may write log rows. The send-flow always
-- runs with a real authenticated session; we attach created_by_user_id from
-- the client. No anon insert.
drop policy if exists "configuration_email_logs insert authenticated"
  on public.configuration_email_logs;
create policy "configuration_email_logs insert authenticated"
on public.configuration_email_logs
for insert
to authenticated
with check (true);

-- SELECT: Timan internal sees all. Otherwise the user must be the owner of
-- the parent configuration (created it, is the assigned seller, or the
-- configuration carries their email).
drop policy if exists "configuration_email_logs select scoped"
  on public.configuration_email_logs;
create policy "configuration_email_logs select scoped"
on public.configuration_email_logs
for select
to authenticated
using (
  public.is_timan_internal()
  or exists (
    select 1
    from public.configurations c
    where c.id = configuration_email_logs.configuration_id
      and (
        c.created_by_user_id = auth.uid()
        or c.assigned_seller_id = auth.uid()
        or lower(coalesce(c.created_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(c.seller_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

-- No UPDATE policy.
-- No DELETE policy.
