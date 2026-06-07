-- ============================================================
-- Partner hierarchy for Machine Journal access
-- ============================================================
-- Goal: external Machine Journal access follows real partner
-- hierarchy.
--
--   Importer hierarchy  → REUSES the existing
--   public.dealer_accounts.parent_account_number column added
--   in docs/sql/phase15_dealer_parent_child.sql. A dealer whose
--   parent_account_number = <importer_account_number> is treated
--   as a child dealer of that importer.
--   (No new importer_dealer_links table is created.)
--
--   Service-partner hierarchy → NEW additive table
--   public.service_partner_dealer_links which maps a service
--   partner account to the dealers it services.
--
-- Also adds a tiny is_timan_staff() helper (backend OR service)
-- so the policies stay readable.
--
-- Idempotent + additive. Safe to rerun. Does NOT drop data.
-- ============================================================

-- ---------- 1) is_timan_staff() helper ----------------------
create or replace function public.is_timan_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and portal_role in ('timan_backend', 'timan_service')
      and is_active = true
  );
$$;

revoke all on function public.is_timan_staff() from public;
grant execute on function public.is_timan_staff() to authenticated;

-- ---------- 2) service_partner_dealer_links table ----------
create table if not exists public.service_partner_dealer_links (
  id                          uuid primary key default gen_random_uuid(),
  service_partner_account_id  uuid not null references public.dealer_accounts(id) on delete cascade,
  dealer_account_id           uuid not null references public.dealer_accounts(id) on delete cascade,
  active                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  created_by                  uuid
);

create unique index if not exists service_partner_dealer_links_uniq
  on public.service_partner_dealer_links (service_partner_account_id, dealer_account_id);

create index if not exists service_partner_dealer_links_sp_idx
  on public.service_partner_dealer_links (service_partner_account_id);

create index if not exists service_partner_dealer_links_dealer_idx
  on public.service_partner_dealer_links (dealer_account_id);

-- ---------- 3) Grants + RLS --------------------------------
grant select on public.service_partner_dealer_links to authenticated;
grant insert, update, delete on public.service_partner_dealer_links to authenticated;
grant all on public.service_partner_dealer_links to service_role;

alter table public.service_partner_dealer_links enable row level security;

drop policy if exists spdl_select_authenticated on public.service_partner_dealer_links;
drop policy if exists spdl_insert_staff         on public.service_partner_dealer_links;
drop policy if exists spdl_update_staff         on public.service_partner_dealer_links;
drop policy if exists spdl_delete_staff         on public.service_partner_dealer_links;

-- Read: every authenticated user can read links (needed so the
-- service-partner user's client can discover its allow-list, and
-- so the Backend admin UI can render the table).
create policy spdl_select_authenticated
  on public.service_partner_dealer_links for select
  to authenticated
  using (true);

-- Write: only Timan Backend / Service can create / mutate links.
create policy spdl_insert_staff
  on public.service_partner_dealer_links for insert
  to authenticated
  with check (public.is_timan_staff());

create policy spdl_update_staff
  on public.service_partner_dealer_links for update
  to authenticated
  using (public.is_timan_staff())
  with check (public.is_timan_staff());

create policy spdl_delete_staff
  on public.service_partner_dealer_links for delete
  to authenticated
  using (public.is_timan_staff());

-- ============================================================
-- Done. Verify:
--   select * from public.service_partner_dealer_links limit 5;
--   select account_number, parent_account_number, customer_type
--     from public.dealer_accounts
--    where parent_account_number is not null
--    limit 5;
-- ============================================================
