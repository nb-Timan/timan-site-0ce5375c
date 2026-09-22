-- Canonical service-partner hierarchy and billing account selection.
--
-- The hierarchy continues to use partner_account_relations. A null
-- billing_account_id means that the partner is billed on its own account.

alter table public.dealer_accounts
  add column if not exists billing_account_id uuid
    references public.dealer_accounts(id) on delete restrict;

create index if not exists dealer_accounts_billing_account_idx
  on public.dealer_accounts (billing_account_id)
  where billing_account_id is not null;

comment on column public.dealer_accounts.billing_account_id is
  'Current billing/debtor partner account. NULL means the partner uses its own account. Historical commercial snapshots are unaffected.';

create table if not exists public.partner_account_relation_history (
  id uuid primary key default gen_random_uuid(),
  child_account_id uuid references public.dealer_accounts(id) on delete set null,
  child_account_number text not null,
  previous_parent_account_id uuid references public.dealer_accounts(id) on delete set null,
  previous_parent_account_number text,
  new_parent_account_id uuid references public.dealer_accounts(id) on delete set null,
  new_parent_account_number text,
  previous_billing_account_id uuid references public.dealer_accounts(id) on delete set null,
  previous_billing_account_number text,
  new_billing_account_id uuid references public.dealer_accounts(id) on delete set null,
  new_billing_account_number text,
  changed_by uuid references public.app_users(id) on delete set null,
  changed_by_email text,
  changed_at timestamptz not null default now()
);

create index if not exists partner_account_relation_history_child_idx
  on public.partner_account_relation_history (child_account_id, changed_at desc);

alter table public.partner_account_relation_history enable row level security;
revoke all on public.partner_account_relation_history from anon, public;
grant select on public.partner_account_relation_history to authenticated;
grant all on public.partner_account_relation_history to service_role;

drop policy if exists partner_account_relation_history_internal_select
  on public.partner_account_relation_history;
create policy partner_account_relation_history_internal_select
  on public.partner_account_relation_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_accounts child
      where child.id = partner_account_relation_history.child_account_id
        and public.can_manage_partner_admin_fields(
          child.assigned_seller_id,
          child.assigned_seller_email,
          child.assigned_seller_initials
        )
    )
  );

-- Assigned Timan sellers may read a relation only when both sides are in
-- their existing administrative scope. Mutations remain RPC/backend-only.
drop policy if exists partner_account_relations_internal_scoped_select
  on public.partner_account_relations;
create policy partner_account_relations_internal_scoped_select
  on public.partner_account_relations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_accounts child
      join public.dealer_accounts parent
        on parent.id = partner_account_relations.source_account_id
      where child.id = partner_account_relations.target_account_id
        and public.can_manage_partner_admin_fields(
          child.assigned_seller_id,
          child.assigned_seller_email,
          child.assigned_seller_initials
        )
        and public.can_manage_partner_admin_fields(
          parent.assigned_seller_id,
          parent.assigned_seller_email,
          parent.assigned_seller_initials
        )
    )
  );

create or replace function public.validate_dealer_billing_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.billing_account_id is null then
    return new;
  end if;

  if new.billing_account_id = new.id then
    raise exception 'Use own billing account by leaving billing_account_id empty'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.partner_account_relations relation
    where relation.source_account_id = new.billing_account_id
      and relation.target_account_id = new.id
      and relation.active = true
      and relation.relation_type in (
        'dealer_has_service_partner',
        'importer_has_service_partner'
      )
  ) then
    raise exception 'Billing account must be the active linked main partner'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists dealer_accounts_validate_billing_account
  on public.dealer_accounts;
create trigger dealer_accounts_validate_billing_account
before insert or update of billing_account_id
on public.dealer_accounts
for each row
execute function public.validate_dealer_billing_account();

-- Keep the billing link valid if someone uses the legacy relation admin page.
create or replace function public.guard_partner_relation_billing_reference()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.active = true and exists (
       select 1
       from public.dealer_accounts child
       where child.id = old.target_account_id
         and child.billing_account_id = old.source_account_id
    ) then
      raise exception 'Change Fakturering via before removing the active main-partner relation'
        using errcode = '23503';
    end if;
    return old;
  end if;

  if new.active = false and old.active = true and exists (
    select 1
    from public.dealer_accounts child
    where child.id = old.target_account_id
      and child.billing_account_id = old.source_account_id
  ) then
    raise exception 'Change Fakturering via before removing the active main-partner relation'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists partner_account_relations_guard_billing_reference
  on public.partner_account_relations;
create trigger partner_account_relations_guard_billing_reference
before update of active or delete
on public.partner_account_relations
for each row
execute function public.guard_partner_relation_billing_reference();

create or replace function public.set_service_partner_main_relation(
  p_child_account_id uuid,
  p_parent_account_id uuid default null,
  p_bill_via_parent boolean default false
)
returns table (
  child_account_id uuid,
  parent_account_id uuid,
  billing_account_id uuid,
  relation_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.app_users%rowtype;
  v_child public.dealer_accounts%rowtype;
  v_parent public.dealer_accounts%rowtype;
  v_previous_parent_id uuid;
  v_previous_parent_number text;
  v_previous_billing_id uuid;
  v_previous_billing_number text;
  v_relation_type text;
  v_relation_id uuid;
  v_new_billing_id uuid;
begin
  select au.*
  into v_actor
  from public.app_users au
  where coalesce(au.approved, false) = true
    and coalesce(au.is_active, false) = true
    and (
      au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  order by (au.auth_user_id = auth.uid()) desc
  limit 1;

  if v_actor.id is null then
    raise exception 'An approved Timan user is required'
      using errcode = '42501';
  end if;

  select *
  into v_child
  from public.dealer_accounts
  where id = p_child_account_id
  for update;

  if v_child.id is null then
    raise exception 'The partner account was not found'
      using errcode = 'P0002';
  end if;

  if public.partner_account_kind(v_child.id) <> 'service_partner'
     and (p_parent_account_id is not null or p_bill_via_parent) then
    raise exception 'Only a service partner can be linked beneath a main partner'
      using errcode = '23514';
  end if;

  if not public.can_manage_partner_admin_fields(
    v_child.assigned_seller_id,
    v_child.assigned_seller_email,
    v_child.assigned_seller_initials
  ) then
    raise exception 'The service partner is outside your permitted partner scope'
      using errcode = '42501';
  end if;

  select relation.source_account_id, parent.account_number
  into v_previous_parent_id, v_previous_parent_number
  from public.partner_account_relations relation
  join public.dealer_accounts parent on parent.id = relation.source_account_id
  where relation.target_account_id = v_child.id
    and relation.active = true
    and relation.relation_type in (
      'dealer_has_service_partner',
      'importer_has_service_partner'
    )
  order by relation.updated_at desc, relation.created_at desc
  limit 1;

  v_previous_billing_id := v_child.billing_account_id;
  if v_previous_billing_id is not null then
    select account_number
    into v_previous_billing_number
    from public.dealer_accounts
    where id = v_previous_billing_id;
  end if;

  if p_parent_account_id is null then
    if p_bill_via_parent then
      raise exception 'A linked main partner is required for parent billing'
        using errcode = '23514';
    end if;
    v_new_billing_id := null;
  else
    if p_parent_account_id = v_child.id then
      raise exception 'A partner cannot be linked to itself'
        using errcode = '23514';
    end if;

    select *
    into v_parent
    from public.dealer_accounts
    where id = p_parent_account_id
    for update;

    if v_parent.id is null
       or public.partner_account_kind(v_parent.id) not in ('dealer', 'importer')
       or coalesce(v_parent.is_blocked, false)
       or coalesce(v_parent.is_deleted, false)
       or not coalesce(v_parent.is_active, true) then
      raise exception 'The linked main partner must be an active dealer or importer'
        using errcode = '23514';
    end if;

    if not public.can_manage_partner_admin_fields(
      v_parent.assigned_seller_id,
      v_parent.assigned_seller_email,
      v_parent.assigned_seller_initials
    ) then
      raise exception 'The main partner is outside your permitted partner scope'
        using errcode = '42501';
    end if;

    v_relation_type := case public.partner_account_kind(v_parent.id)
      when 'importer' then 'importer_has_service_partner'
      else 'dealer_has_service_partner'
    end;

    insert into public.partner_account_relations (
      source_account_id,
      target_account_id,
      relation_type,
      active
    ) values (
      v_parent.id,
      v_child.id,
      v_relation_type,
      true
    )
    on conflict (source_account_id, target_account_id, relation_type)
    do update set active = true, updated_at = now()
    returning id into v_relation_id;

    v_new_billing_id := case when p_bill_via_parent then v_parent.id else null end;
  end if;

  update public.dealer_accounts
  set billing_account_id = v_new_billing_id,
      updated_at = now()
  where id = v_child.id;

  update public.partner_account_relations relation
  set active = false,
      updated_at = now()
  where relation.target_account_id = v_child.id
    and relation.active = true
    and relation.relation_type in (
      'dealer_has_service_partner',
      'importer_has_service_partner'
    )
    and (p_parent_account_id is null or relation.source_account_id <> p_parent_account_id);

  if v_previous_parent_id is distinct from p_parent_account_id
     or v_previous_billing_id is distinct from v_new_billing_id then
    insert into public.partner_account_relation_history (
      child_account_id,
      child_account_number,
      previous_parent_account_id,
      previous_parent_account_number,
      new_parent_account_id,
      new_parent_account_number,
      previous_billing_account_id,
      previous_billing_account_number,
      new_billing_account_id,
      new_billing_account_number,
      changed_by,
      changed_by_email
    ) values (
      v_child.id,
      v_child.account_number,
      v_previous_parent_id,
      v_previous_parent_number,
      v_parent.id,
      v_parent.account_number,
      v_previous_billing_id,
      v_previous_billing_number,
      v_new_billing_id,
      case when v_new_billing_id is not null then v_parent.account_number else null end,
      v_actor.id,
      v_actor.email
    );
  end if;

  return query
  select v_child.id, p_parent_account_id, v_new_billing_id, v_relation_id;
end;
$$;

revoke execute on function public.set_service_partner_main_relation(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.set_service_partner_main_relation(uuid, uuid, boolean)
  to authenticated, service_role;

-- The billing relation is an administrative field. External self-service
-- updates must not be able to change it through dealer_accounts UPDATE.
create or replace function public.prevent_external_partner_admin_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_partner_admin_fields(
    old.assigned_seller_id,
    old.assigned_seller_email,
    old.assigned_seller_initials
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
    or new.billing_account_id is distinct from old.billing_account_id
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
    raise exception 'Kun interne Timan-brugere kan rette administrative partneroplysninger.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.set_service_partner_main_relation(uuid, uuid, boolean) is
  'Atomically sets a service partner main dealer/importer and independent current billing account. Uses caller scope and appends relation history.';
