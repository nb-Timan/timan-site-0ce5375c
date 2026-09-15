-- Messe users need a minimal, authoritative directory of internal users who
-- may be selected as responsible CRM sellers. The general directory view is
-- security-invoker and therefore intentionally empty for external Messe users.
create or replace function public.list_messe_assignable_timan_sellers()
returns table(
  id uuid,
  email text,
  initials text,
  full_name text,
  portal_role text
)
language sql
stable
security definer
set search_path = public
as $$
  with actor as (
    select
      au.portal_role::text as portal_role,
      au.portal_variant,
      au.allowed_modules,
      au.module_access
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.is_active = true
      and au.approved = true
      and lower(au.status) in ('active', 'approved')
  )
  select
    seller.id,
    lower(seller.email) as email,
    upper(seller.initials) as initials,
    seller.full_name,
    seller.portal_role::text as portal_role
  from public.app_users seller
  where exists (
    select 1
    from actor
    where lower(actor.portal_variant) = 'messe'
      or actor.portal_role = 'exhibition_user'
      or actor.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
      or 'messe_portal' = any(actor.allowed_modules)
      or 'messe_portal' = any(actor.module_access)
  )
    and seller.is_active = true
    and seller.approved = true
    and lower(seller.status) in ('active', 'approved')
    and seller.portal_role::text in ('timan_seller', 'timan_backend')
    and nullif(trim(seller.email), '') is not null
    and nullif(trim(seller.initials), '') is not null
  order by upper(seller.initials), lower(seller.email);
$$;

revoke all on function public.list_messe_assignable_timan_sellers() from public, anon;
grant execute on function public.list_messe_assignable_timan_sellers() to authenticated;
