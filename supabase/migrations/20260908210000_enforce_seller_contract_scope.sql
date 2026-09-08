-- Timan sellers may only read or change contracts for their assigned accounts.
-- Backend and service retain the existing internal contract access semantics.

create or replace function public.is_global_internal_contract_actor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.current_timan_app_user() au
    where au.portal_role in ('timan_backend', 'timan_service')
  );
$$;

revoke all on function public.is_global_internal_contract_actor() from public, anon;
grant execute on function public.is_global_internal_contract_actor() to authenticated, service_role;

create or replace function public.can_read_dealer_contract(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_contracts dc
    left join public.dealer_accounts da
      on da.id = dc.dealer_account_id
      or da.account_number = dc.dealer_account_number
    left join public.current_timan_app_user() au on true
    where dc.id = p_contract_id
      and (
        public.is_global_internal_contract_actor()
        or public.can_manage_dealer_contract_access(coalesce(dc.dealer_account_id, da.id))
        or (
          coalesce(dc.dealer_account_number, da.account_number) = au.dealer_number
          and (
            dc.contract_status in ('awaiting_signed_upload', 'submitted_for_approval', 'changes_requested', 'approved', 'archived')
            or public.has_active_dealer_contract_window(coalesce(dc.dealer_account_id, da.id), dc.id, au.id)
          )
        )
      )
  );
$$;

drop policy if exists dealer_contracts_insert_controlled on public.dealer_contracts;
create policy dealer_contracts_insert_controlled
on public.dealer_contracts
for insert to authenticated
with check (
  public.is_global_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or exists (
    select 1
    from public.current_timan_app_user() au
    where dealer_contracts.dealer_account_number = au.dealer_number
      and public.has_active_dealer_contract_window(
        dealer_contracts.dealer_account_id,
        dealer_contracts.id,
        au.id
      )
  )
);

drop policy if exists dealer_contracts_update_controlled on public.dealer_contracts;
create policy dealer_contracts_update_controlled
on public.dealer_contracts
for update to authenticated
using (
  public.is_global_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or exists (
    select 1
    from public.current_timan_app_user() au
    where dealer_contracts.dealer_account_number = au.dealer_number
      and dealer_contracts.contract_status in ('draft', 'guided_review', 'ready_for_signature')
      and public.has_active_dealer_contract_window(
        dealer_contracts.dealer_account_id,
        dealer_contracts.id,
        au.id
      )
  )
)
with check (
  public.is_global_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or exists (
    select 1
    from public.current_timan_app_user() au
    where dealer_contracts.dealer_account_number = au.dealer_number
      and dealer_contracts.contract_status in ('draft', 'guided_review', 'ready_for_signature')
      and public.has_active_dealer_contract_window(
        dealer_contracts.dealer_account_id,
        dealer_contracts.id,
        au.id
      )
  )
);
