-- Canonical organization-level access for external partner users.
-- This is separate from portal_role/module_access: it expands account scope,
-- but does not grant extra modules.

alter table public.app_users
  add column if not exists organization_access_role text;

do $$
begin
  alter table public.app_users
    add constraint app_users_organization_access_role_check
    check (
      organization_access_role is null
      or organization_access_role = 'collaboration_manager'
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists app_users_organization_access_role_idx
  on public.app_users (organization_access_role)
  where organization_access_role is not null;

create or replace function public.resolve_collaboration_manager_accounts()
returns table (
  id uuid,
  account_number text,
  company_name text,
  branch_name text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with caller as (
    select
      au.id,
      au.auth_user_id,
      au.email,
      coalesce(au.portal_role::text, au.role) as portal_role,
      au.dealer_number,
      au.organization_access_role
    from public.app_users au
    where coalesce(au.approved, false) = true
      and coalesce(au.is_active, false) = true
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    order by (au.auth_user_id = auth.uid()) desc
    limit 1
  ),
  own as (
    select da.id, da.account_number, da.company_name, da.branch_name
    from caller c
    join public.dealer_accounts da
      on da.account_number = c.dealer_number
    where c.organization_access_role = 'collaboration_manager'
      and c.portal_role in ('timan_importer','timan_dealer','timan_service_partner','dealer_customer','dealer_user')
      and coalesce(da.is_active, true) = true
      and coalesce(da.is_blocked, false) = false
      and coalesce(da.is_deleted, false) = false
      and coalesce(da.status, 'active') = 'active'
      and not public.is_protected_internal_crm_account(da.account_number, da.company_name, da.branch_name)
  ),
  scoped as (
    select own.id, own.account_number, own.company_name, own.branch_name
    from own

    union

    select child.id, child.account_number, child.company_name, child.branch_name
    from own
    join public.dealer_accounts child
      on child.parent_account_number = own.account_number
    where coalesce(child.is_active, true) = true
      and coalesce(child.is_blocked, false) = false
      and coalesce(child.is_deleted, false) = false
      and coalesce(child.status, 'active') = 'active'
      and not public.is_protected_internal_crm_account(child.account_number, child.company_name, child.branch_name)

    union

    select target.id, target.account_number, target.company_name, target.branch_name
    from own
    join public.partner_account_relations par
      on par.source_account_id = own.id
     and par.active = true
    join public.dealer_accounts target
      on target.id = par.target_account_id
    where coalesce(target.is_active, true) = true
      and coalesce(target.is_blocked, false) = false
      and coalesce(target.is_deleted, false) = false
      and coalesce(target.status, 'active') = 'active'
      and not public.is_protected_internal_crm_account(target.account_number, target.company_name, target.branch_name)
  )
  select distinct scoped.id, scoped.account_number, scoped.company_name, scoped.branch_name
  from scoped
  where scoped.account_number is not null;
$$;

create or replace function public.can_assign_organization_access_role(
  p_target_app_user_id uuid,
  p_role text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  with actor as (
    select
      au.id,
      lower(trim(au.email)) as email,
      coalesce(au.portal_role::text, au.role) as portal_role
    from public.app_users au
    where coalesce(au.approved, false) = true
      and coalesce(au.is_active, false) = true
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    order by (au.auth_user_id = auth.uid()) desc
    limit 1
  ),
  target_user as (
    select
      au.id,
      coalesce(au.portal_role::text, au.role) as portal_role,
      au.dealer_number
    from public.app_users au
    where au.id = p_target_app_user_id
  ),
  target_dealer as (
    select da.*
    from target_user tu
    join public.dealer_accounts da
      on da.account_number = tu.dealer_number
    where coalesce(da.is_active, true) = true
      and coalesce(da.is_blocked, false) = false
      and coalesce(da.is_deleted, false) = false
      and coalesce(da.status, 'active') = 'active'
  )
  select coalesce((
    select
      (p_role is null or p_role = '' or p_role = 'collaboration_manager')
      and tu.portal_role in ('timan_importer','timan_dealer','timan_service_partner','dealer_customer','dealer_user')
      and (
        actor.portal_role = 'timan_backend'
        or (
          actor.portal_role = 'timan_seller'
          and exists (
            select 1
            from target_dealer td
            left join public.dealer_accounts parent
              on parent.account_number = td.parent_account_number
            where td.assigned_seller_id = actor.id
               or lower(trim(coalesce(td.assigned_seller_email, ''))) = actor.email
               or parent.assigned_seller_id = actor.id
               or lower(trim(coalesce(parent.assigned_seller_email, ''))) = actor.email
          )
        )
      )
    from actor, target_user tu
  ), false);
$$;

-- These SECURITY DEFINER functions derive their result from auth.uid()/JWT.
-- They are intentionally available to signed-in users only; never expose them
-- to anonymous callers or through the default PUBLIC function grant.
revoke execute on function public.resolve_collaboration_manager_accounts() from anon, public;
revoke execute on function public.can_assign_organization_access_role(uuid, text) from anon, authenticated, public;
grant execute on function public.resolve_collaboration_manager_accounts() to authenticated;

create or replace function public.app_users_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  protected text[] := array[
    'id','email','role','partner_type','portal_role','permissions',
    'allowed_modules','allowed_areas','backend_modules','module_access',
    'quick_actions','organization_access_role','is_active','approved','status','auth_user_id','user_id',
    'dealer_id','dealer_number','company_dealer','seller_initials','seller_email',
    'can_view_prices','can_submit_order','can_edit_discount',
    'can_switch_customer_mode','start_step','max_step',
    'account_owner_user_id','account_owner_name','account_owner_initials',
    'account_owner_email','portal_variant','login_count','auth_status'
  ];
  oldj jsonb := to_jsonb(old);
  newj jsonb := to_jsonb(new);
  col  text;
  changed text[] := '{}';
begin
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('request.jwt.claims', true), '') ilike '%service_role%'
     or current_user = 'service_role' then
    return new;
  end if;

  foreach col in array protected loop
    if oldj ? col and newj ? col and oldj -> col is distinct from newj -> col then
      changed := changed || col;
    end if;
  end loop;

  if array_length(changed, 1) is not null then
    raise exception
      'app_users: protected column(s) % may only be changed by an administrator via admin-user-actions',
      array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end
$function$;

drop policy if exists app_users_select_collaboration_manager_organization on public.app_users;
create policy app_users_select_collaboration_manager_organization
  on public.app_users
  for select
  to authenticated
  using (
    dealer_number in (
      select account_number
      from public.resolve_collaboration_manager_accounts()
    )
    and coalesce(portal_role::text, role) in ('timan_importer','timan_dealer','timan_service_partner','dealer_customer','dealer_user')
  );

drop policy if exists partner_account_relations_select_collaboration_manager_organization on public.partner_account_relations;
create policy partner_account_relations_select_collaboration_manager_organization
  on public.partner_account_relations
  for select
  to authenticated
  using (
    active = true
    and exists (
      select 1
      from public.resolve_collaboration_manager_accounts() scoped
      where scoped.id = partner_account_relations.source_account_id
         or scoped.id = partner_account_relations.target_account_id
    )
  );

drop policy if exists dealer_accounts_select_collaboration_manager_organization on public.dealer_accounts;
create policy dealer_accounts_select_collaboration_manager_organization
  on public.dealer_accounts
  for select
  to authenticated
  using (
    account_number in (
      select account_number
      from public.resolve_collaboration_manager_accounts()
    )
  );

drop policy if exists crm_leads_select_collaboration_manager_organization on public.crm_leads;
create policy crm_leads_select_collaboration_manager_organization
  on public.crm_leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.resolve_collaboration_manager_accounts() scoped
      where scoped.id = crm_leads.linked_dealer_id
    )
  );

drop policy if exists crm_demo_leads_select_collaboration_manager_organization on public.crm_demo_leads;
create policy crm_demo_leads_select_collaboration_manager_organization
  on public.crm_demo_leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.resolve_collaboration_manager_accounts() scoped
      cross join lateral unnest(array[scoped.company_name, scoped.branch_name, scoped.account_number]) dealer_names(v)
      where lower(trim(coalesce(crm_demo_leads.dealer_company, ''))) = lower(trim(dealer_names.v))
    )
  );

drop policy if exists configurations_select_collaboration_manager_organization on public.configurations;
create policy configurations_select_collaboration_manager_organization
  on public.configurations
  for select
  to authenticated
  using (
    dealer_number in (
      select account_number
      from public.resolve_collaboration_manager_accounts()
    )
  );

;
