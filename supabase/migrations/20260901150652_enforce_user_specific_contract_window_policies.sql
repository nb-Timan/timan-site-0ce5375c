-- Ensure external contract write policies use the user-specific contract access
-- window model introduced by dealer_contract_user_access_windows.

drop policy if exists dealer_contracts_insert_controlled on public.dealer_contracts;
create policy dealer_contracts_insert_controlled
on public.dealer_contracts
for insert to authenticated
with check (
  public.is_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or exists (
    select 1
    from public.current_timan_app_user() au
    where dealer_account_number = au.dealer_number
      and public.has_active_dealer_contract_window(dealer_contracts.dealer_account_id, dealer_contracts.id, au.id)
  )
);

drop policy if exists dealer_contracts_update_controlled on public.dealer_contracts;
create policy dealer_contracts_update_controlled
on public.dealer_contracts
for update to authenticated
using (
  public.is_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or exists (
    select 1
    from public.current_timan_app_user() au
    where dealer_account_number = au.dealer_number
      and contract_status in ('draft', 'guided_review', 'ready_for_signature')
      and public.has_active_dealer_contract_window(dealer_contracts.dealer_account_id, dealer_contracts.id, au.id)
  )
)
with check (
  public.is_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or exists (
    select 1
    from public.current_timan_app_user() au
    where dealer_account_number = au.dealer_number
      and contract_status in ('draft', 'guided_review', 'ready_for_signature')
      and public.has_active_dealer_contract_window(dealer_contracts.dealer_account_id, dealer_contracts.id, au.id)
  )
);
