-- Correct the over-broad Partnerdata maintenance grant from
-- 20261002081241. Capability and account scope are separate decisions:
-- Backend keeps global access, Sellers use the canonical Mine forhandlere
-- hierarchy, explicit Service access stays global, and external users keep
-- self-service access to their own canonical account only.

create or replace function public.partnerdata_seller_account_scope(
  p_seller_id uuid
)
returns table(dealer_account_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive
  direct_accounts as (
    select da.id
    from public.dealer_accounts da
    where da.assigned_seller_id = p_seller_id
  ),
  inherited_branches as (
    select child.id
    from public.dealer_accounts child
    join public.dealer_accounts parent
      on parent.account_number = child.parent_account_number
    where parent.assigned_seller_id = p_seller_id
  ),
  assigned_or_inherited as (
    select id from direct_accounts
    union
    select id from inherited_branches
  ),
  anchored_accounts as (
    select id from assigned_or_inherited
    union
    select parent.id
    from public.dealer_accounts child
    join assigned_or_inherited scoped on scoped.id = child.id
    join public.dealer_accounts parent
      on parent.account_number = child.parent_account_number
  ),
  scoped_accounts(dealer_account_id) as (
    select id from anchored_accounts
    union
    select predecessor.id
    from public.dealer_accounts predecessor
    join public.dealer_accounts successor
      on predecessor.successor_dealer_id = successor.id
      or (
        predecessor.successor_dealer_id is null
        and predecessor.successor_dealer_account_number = successor.account_number
      )
    join scoped_accounts current_scope
      on current_scope.dealer_account_id = successor.id
    where coalesce(predecessor.is_deleted, false)
       or coalesce(predecessor.is_blocked, false)
  )
  select distinct scoped_accounts.dealer_account_id
  from scoped_accounts;
$$;

comment on function public.partnerdata_seller_account_scope(uuid) is
  'Canonical Mine forhandlere account graph: direct seller accounts, inherited branches, parent anchors and inactive predecessors.';

create or replace function public.can_edit_partnerdata_account_as(
  p_dealer_account_id uuid,
  p_effective_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dealer_accounts da
    join public.app_users actor on actor.id = p_effective_actor_id
    where da.id = p_dealer_account_id
      and coalesce(actor.approved, false) = true
      and coalesce(actor.is_active, false) = true
      and (
        (
          actor.portal_role::text in ('timan_backend', 'timan_service')
          and public.can_maintain_partnerdata_as(actor.id)
        )
        or (
          actor.portal_role::text = 'timan_seller'
          and public.can_maintain_partnerdata_as(actor.id)
          and da.id in (
            select scope.dealer_account_id
            from public.partnerdata_seller_account_scope(actor.id) scope
          )
        )
        or (
          actor.portal_role::text in (
            'timan_dealer',
            'timan_importer',
            'timan_service_partner',
            'dealer_customer',
            'dealer_user'
          )
          and nullif(trim(actor.dealer_number), '') is not null
          and da.account_number = actor.dealer_number
        )
      )
  );
$$;

comment on function public.can_edit_partnerdata_account_as(uuid, uuid) is
  'Combines Partnerdata capability with the effective actor canonical account scope.';

create or replace function public.can_access_partnerdata_account(
  p_dealer_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_or(
    public.can_edit_partnerdata_account_as(p_dealer_account_id, actor.id)
  ), false)
  from public.current_timan_app_user() actor;
$$;

comment on function public.can_access_partnerdata_account(uuid) is
  'Authenticated-session wrapper for row-level Partnerdata account access.';

create or replace function public.list_partnerdata_accounts(
  p_effective_user_id uuid default null,
  p_include_deleted boolean default false
)
returns setof public.dealer_accounts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_actor_id uuid;
begin
  v_effective_actor_id := public.partnerdata_effective_actor_id(p_effective_user_id);

  return query
    select da.*
    from public.dealer_accounts da
    where (p_include_deleted or not coalesce(da.is_deleted, false))
      and public.can_edit_partnerdata_account_as(da.id, v_effective_actor_id)
    order by da.company_name asc;
end;
$$;

comment on function public.list_partnerdata_accounts(uuid, boolean) is
  'Server-scoped Partnerdata list for the authenticated user or a Backend View-as identity.';

-- Sellers and external partners may maintain normal profile fields, but may
-- never move ownership or change administrative account state through a
-- manipulated direct-table request. Backend and explicit Service access keep
-- the pre-existing administrative behavior.
create or replace function public.prevent_external_partner_admin_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.current_timan_app_user() actor
    where actor.portal_role::text in ('timan_backend', 'timan_service')
  ) then
    return new;
  end if;

  if new.assigned_seller_id is distinct from old.assigned_seller_id
    or new.assigned_seller_initials is distinct from old.assigned_seller_initials
    or new.assigned_seller_name is distinct from old.assigned_seller_name
    or new.assigned_seller_email is distinct from old.assigned_seller_email
    or new.dealer_type is distinct from old.dealer_type
    or new.customer_type is distinct from old.customer_type
    or new.customer_type_label is distinct from old.customer_type_label
    or new.account_number is distinct from old.account_number
    or new.parent_account_number is distinct from old.parent_account_number
    or new.is_main_account is distinct from old.is_main_account
    or new.is_blocked is distinct from old.is_blocked
    or new.blocked_at is distinct from old.blocked_at
    or new.blocked_by is distinct from old.blocked_by
    or new.is_deleted is distinct from old.is_deleted
    or new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
    or new.status is distinct from old.status
    or new.successor_dealer_id is distinct from old.successor_dealer_id
    or new.successor_dealer_account_number is distinct from old.successor_dealer_account_number
    or new.closed_reason is distinct from old.closed_reason
    or new.closed_at is distinct from old.closed_at
  then
    raise exception 'Partner ownership and administrative fields require Backend access.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Direct table reads and writes use the same account boundary as the RPCs.
drop policy if exists dealer_accounts_select_scoped on public.dealer_accounts;
create policy dealer_accounts_select_scoped
on public.dealer_accounts
for select
to authenticated
using (public.can_access_partnerdata_account(id));

drop policy if exists dealer_accounts_update_timan_staff on public.dealer_accounts;
create policy dealer_accounts_update_timan_staff
on public.dealer_accounts
for update
to authenticated
using (public.can_access_partnerdata_account(id))
with check (public.can_access_partnerdata_account(id));

drop policy if exists dealer_contacts_select_scope on public.dealer_contacts;
create policy dealer_contacts_select_scope
on public.dealer_contacts
for select
to authenticated
using (public.can_access_partnerdata_account(dealer_account_id));

drop policy if exists dealer_contacts_insert_scope on public.dealer_contacts;
create policy dealer_contacts_insert_scope
on public.dealer_contacts
for insert
to authenticated
with check (public.can_access_partnerdata_account(dealer_account_id));

drop policy if exists dealer_contacts_update_scope on public.dealer_contacts;
create policy dealer_contacts_update_scope
on public.dealer_contacts
for update
to authenticated
using (public.can_access_partnerdata_account(dealer_account_id))
with check (public.can_access_partnerdata_account(dealer_account_id));

drop policy if exists dealer_contacts_delete_scope on public.dealer_contacts;
create policy dealer_contacts_delete_scope
on public.dealer_contacts
for delete
to authenticated
using (public.can_access_partnerdata_account(dealer_account_id));

revoke all on function public.partnerdata_seller_account_scope(uuid) from public, anon, authenticated;
revoke all on function public.can_edit_partnerdata_account_as(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_access_partnerdata_account(uuid) from public, anon;
revoke all on function public.list_partnerdata_accounts(uuid, boolean) from public, anon;

grant execute on function public.partnerdata_seller_account_scope(uuid) to service_role;
grant execute on function public.can_edit_partnerdata_account_as(uuid, uuid) to service_role;
grant execute on function public.can_access_partnerdata_account(uuid) to authenticated, service_role;
grant execute on function public.list_partnerdata_accounts(uuid, boolean) to authenticated, service_role;
