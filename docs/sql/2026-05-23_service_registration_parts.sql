-- Phase 44 — Service registration: structured parts + total prices.
-- Run this in the external Supabase project (SQL editor) AFTER phase43_service_maintenance.sql.
-- Actual service registration table used by the app: public.service_registrations.
-- Safe to run multiple times.

alter table public.service_registrations
  add column if not exists total_servicekit_price numeric(12,2) not null default 0,
  add column if not exists total_extra_parts_price numeric(12,2) not null default 0,
  add column if not exists total_price numeric(12,2) not null default 0;

create table if not exists public.service_registration_parts (
  id uuid primary key default gen_random_uuid(),
  service_registration_id uuid not null
    references public.service_registrations(id) on delete cascade,
  source_type text not null check (source_type in ('servicekit','extra')),
  item_number text,
  description text,
  unit_price numeric(12,2) not null default 0,
  quantity numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists service_registration_parts_reg_id_idx
  on public.service_registration_parts (service_registration_id);
create index if not exists service_registration_parts_item_idx
  on public.service_registration_parts (item_number);

alter table public.service_registration_parts enable row level security;

drop policy if exists service_registration_parts_select on public.service_registration_parts;
create policy service_registration_parts_select
  on public.service_registration_parts for select
  to authenticated
  using (
    public.is_timan_backend()
    or exists (
      select 1 from public.service_registrations r
      where r.id = service_registration_parts.service_registration_id
        and r.dealer_number is not null
        and r.dealer_number = public.current_user_dealer_number()
    )
  );

drop policy if exists service_registration_parts_insert on public.service_registration_parts;
create policy service_registration_parts_insert
  on public.service_registration_parts for insert
  to authenticated
  with check (
    public.is_timan_backend()
    or exists (
      select 1 from public.service_registrations r
      where r.id = service_registration_parts.service_registration_id
        and r.dealer_number is not null
        and r.dealer_number = public.current_user_dealer_number()
    )
  );

drop policy if exists service_registration_parts_update on public.service_registration_parts;
create policy service_registration_parts_update
  on public.service_registration_parts for update
  to authenticated
  using (
    public.is_timan_backend()
    or exists (
      select 1 from public.service_registrations r
      where r.id = service_registration_parts.service_registration_id
        and r.dealer_number is not null
        and r.dealer_number = public.current_user_dealer_number()
    )
  )
  with check (
    public.is_timan_backend()
    or exists (
      select 1 from public.service_registrations r
      where r.id = service_registration_parts.service_registration_id
        and r.dealer_number is not null
        and r.dealer_number = public.current_user_dealer_number()
    )
  );
