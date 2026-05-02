-- =====================================================================
-- Phase 15 — Parent / child dealer accounts
--
-- Adds optional parent/child grouping to public.dealer_accounts.
-- A dealer can be a "main" account; other dealers can point to it via
-- parent_account_number. Branches keep their own account_number, users,
-- quotes, orders and statistics — but can be aggregated under the parent.
--
-- This migration:
--   1. Adds columns parent_account_number, is_main_account, branch_name
--   2. Adds a CHECK preventing self-parent
--   3. Adds a trigger preventing circular parent chains
--   4. Adds a FK (deferred) so parent_account_number must reference an
--      existing dealer_accounts.account_number, but allows NULL
--   5. Updates list_dealer_accounts_for_backend() so the returned rows
--      include the new columns
--   6. Adds set_dealer_parent(child_account_number, parent_account_number)
--      RPC for safe assignment from the frontend (timan_backend only)
--
-- Does NOT touch configurator pricing, product data, quote/order logic,
-- n8n webhook logic or auth setup. Safe to run multiple times.
-- =====================================================================

-- ---------- 1) Columns ------------------------------------------------
alter table public.dealer_accounts
  add column if not exists parent_account_number text,
  add column if not exists is_main_account       boolean not null default false,
  add column if not exists branch_name           text;

create index if not exists dealer_accounts_parent_idx
  on public.dealer_accounts (parent_account_number);

create index if not exists dealer_accounts_main_idx
  on public.dealer_accounts (is_main_account);

-- ---------- 2) Self-parent CHECK -------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dealer_accounts_no_self_parent'
  ) then
    alter table public.dealer_accounts
      add constraint dealer_accounts_no_self_parent
      check (parent_account_number is null
             or parent_account_number <> account_number);
  end if;
end $$;

-- ---------- 3) FK to existing account_number (nullable) --------------
-- Use NOT VALID first to skip historical bad data, then validate.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'dealer_accounts_parent_fk'
  ) then
    alter table public.dealer_accounts
      add constraint dealer_accounts_parent_fk
      foreign key (parent_account_number)
      references public.dealer_accounts (account_number)
      on update cascade
      on delete set null
      deferrable initially deferred
      not valid;
  end if;
end $$;

-- Try to validate (will succeed if all current parent_account_number
-- values point to a real dealer; otherwise leave NOT VALID until cleaned).
do $$ begin
  begin
    alter table public.dealer_accounts validate constraint dealer_accounts_parent_fk;
  exception when others then
    raise notice 'dealer_accounts_parent_fk left NOT VALID — clean orphans then VALIDATE';
  end;
end $$;

-- ---------- 4) Circular-parent guard ---------------------------------
create or replace function public.dealer_accounts_check_no_cycle()
returns trigger
language plpgsql
as $$
declare
  v_cur text;
  v_steps int := 0;
begin
  if new.parent_account_number is null then return new; end if;
  if new.parent_account_number = new.account_number then
    raise exception 'dealer cannot be its own parent';
  end if;

  v_cur := new.parent_account_number;
  while v_cur is not null loop
    v_steps := v_steps + 1;
    if v_steps > 32 then
      raise exception 'parent chain too deep (possible cycle) for %', new.account_number;
    end if;
    if v_cur = new.account_number then
      raise exception 'circular parent relationship detected for %', new.account_number;
    end if;
    select parent_account_number
      into v_cur
      from public.dealer_accounts
      where account_number = v_cur;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_dealer_accounts_no_cycle on public.dealer_accounts;
create trigger trg_dealer_accounts_no_cycle
  before insert or update of parent_account_number, account_number
  on public.dealer_accounts
  for each row execute function public.dealer_accounts_check_no_cycle();

-- ---------- 5) Refresh list_dealer_accounts_for_backend --------------
-- Must drop first because the return type (setof dealer_accounts) now
-- includes new columns automatically — but we explicitly recreate to
-- ensure the function is up to date.
drop function if exists public.list_dealer_accounts_for_backend();

create or replace function public.list_dealer_accounts_for_backend()
returns setof public.dealer_accounts
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user' using errcode = '42501';
  end if;
  return query
    select * from public.dealer_accounts
    order by company_name asc;
end;
$$;

revoke all on function public.list_dealer_accounts_for_backend() from public;
grant execute on function public.list_dealer_accounts_for_backend() to authenticated;

-- ---------- 6) set_dealer_parent RPC ---------------------------------
-- Sets / clears the parent of one dealer. Pass parent_account_number = NULL
-- (or empty string) to detach. Backend-only.
create or replace function public.set_dealer_parent(
  child_account_number  text,
  parent_account_number text,
  mark_parent_as_main   boolean default true
)
returns public.dealer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child  text := nullif(trim(child_account_number), '');
  v_parent text := nullif(trim(parent_account_number), '');
  v_row    public.dealer_accounts;
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user' using errcode = '42501';
  end if;
  if v_child is null then
    raise exception 'child_account_number is required' using errcode = '22023';
  end if;
  if v_parent is not null and v_parent = v_child then
    raise exception 'dealer cannot be its own parent' using errcode = '22023';
  end if;
  if v_parent is not null and not exists (
    select 1 from public.dealer_accounts where account_number = v_parent
  ) then
    raise exception 'parent dealer % does not exist', v_parent using errcode = '23503';
  end if;

  update public.dealer_accounts
     set parent_account_number = v_parent,
         updated_at = now()
   where account_number = v_child
   returning * into v_row;

  if v_row.id is null then
    raise exception 'child dealer % does not exist', v_child using errcode = '23503';
  end if;

  if v_parent is not null and mark_parent_as_main then
    update public.dealer_accounts
       set is_main_account = true,
           updated_at = now()
     where account_number = v_parent
       and coalesce(is_main_account, false) = false;
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_dealer_parent(text, text, boolean) from public;
grant execute on function public.set_dealer_parent(text, text, boolean) to authenticated;

-- ---------- 7) set_dealer_main RPC -----------------------------------
-- Toggle is_main_account flag manually. Backend-only.
create or replace function public.set_dealer_main(
  p_account_number text,
  p_is_main        boolean
)
returns public.dealer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dealer_accounts;
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user' using errcode = '42501';
  end if;
  update public.dealer_accounts
     set is_main_account = coalesce(p_is_main, false),
         updated_at = now()
   where account_number = p_account_number
   returning * into v_row;
  if v_row.id is null then
    raise exception 'dealer % does not exist', p_account_number using errcode = '23503';
  end if;
  return v_row;
end;
$$;

revoke all on function public.set_dealer_main(text, boolean) from public;
grant execute on function public.set_dealer_main(text, boolean) to authenticated;

-- =====================================================================
-- Verify (signed-in as a Timan Backend user):
--   select account_number, parent_account_number, is_main_account, branch_name
--     from public.dealer_accounts
--    where account_number in ('10100','10190');
--
-- Mark 10100 as main, then attach 10190 as a branch:
--   select public.set_dealer_main('10100', true);
--   select public.set_dealer_parent('10190', '10100', true);
--
-- Self-parent rejected:
--   select public.set_dealer_parent('10100', '10100', false);  -- error
-- =====================================================================
