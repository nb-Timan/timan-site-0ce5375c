-- Marketing -> Byg din Timan editorial content.
--
-- Canonical product identity, prices and dependencies remain in the frontend
-- catalog. This table contains only marketing-owned presentation content.
-- Draft and published values are separate rows so sales can never read a
-- marketing draft through the public product surface.

create table if not exists public.marketing_configurator_product_content (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  machine_key text not null,
  item_number text not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_configurator_product_content_status_check
    check (status in ('draft', 'published')),
  constraint marketing_configurator_product_content_unique_version
    unique (product_key, status)
);

create index if not exists marketing_configurator_product_content_published_idx
  on public.marketing_configurator_product_content (status, published_at desc)
  where status = 'published';

create index if not exists marketing_configurator_product_content_machine_idx
  on public.marketing_configurator_product_content (machine_key, item_number);

create or replace function public.touch_marketing_configurator_product_content_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_marketing_configurator_product_content_updated_at
  on public.marketing_configurator_product_content;
create trigger touch_marketing_configurator_product_content_updated_at
before update on public.marketing_configurator_product_content
for each row execute function public.touch_marketing_configurator_product_content_updated_at();

create or replace function public.can_manage_marketing_configurator_content()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, true) = true
      and (
        au.portal_role::text = 'timan_backend'
        or (
          au.portal_role::text = 'timan_service'
          and 'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))
          and coalesce((au.permissions ->> 'marketing_configurator_manage')::boolean, false)
        )
      )
  );
$$;

alter table public.marketing_configurator_product_content enable row level security;

revoke all on table public.marketing_configurator_product_content from anon, authenticated;
grant select on table public.marketing_configurator_product_content to anon, authenticated;
grant insert, update, delete on table public.marketing_configurator_product_content to authenticated;

-- Sales and public product views only receive the published row. Marketing
-- managers receive both versions for the editor.
drop policy if exists marketing_configurator_product_content_public_read_published
  on public.marketing_configurator_product_content;
create policy marketing_configurator_product_content_public_read_published
on public.marketing_configurator_product_content
for select
to anon, authenticated
using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists marketing_configurator_product_content_manage_select_all
  on public.marketing_configurator_product_content;
create policy marketing_configurator_product_content_manage_select_all
on public.marketing_configurator_product_content
for select
to authenticated
using (public.can_manage_marketing_configurator_content());

drop policy if exists marketing_configurator_product_content_manage_insert
  on public.marketing_configurator_product_content;
create policy marketing_configurator_product_content_manage_insert
on public.marketing_configurator_product_content
for insert
to authenticated
with check (public.can_manage_marketing_configurator_content());

drop policy if exists marketing_configurator_product_content_manage_update
  on public.marketing_configurator_product_content;
create policy marketing_configurator_product_content_manage_update
on public.marketing_configurator_product_content
for update
to authenticated
using (public.can_manage_marketing_configurator_content())
with check (public.can_manage_marketing_configurator_content());

drop policy if exists marketing_configurator_product_content_manage_delete
  on public.marketing_configurator_product_content;
create policy marketing_configurator_product_content_manage_delete
on public.marketing_configurator_product_content
for delete
to authenticated
using (public.can_manage_marketing_configurator_content());

-- Reuse the existing public news-assets bucket. Upload policies deliberately
-- mirror the table's permission helper; public URLs are only placed on a
-- published content row by an authorized Marketing user.
drop policy if exists marketing_configurator_content_assets_manage
  on storage.objects;
create policy marketing_configurator_content_assets_manage
on storage.objects
for all
to authenticated
using (
  bucket_id = 'news-assets'
  and name like 'marketing-configurator/%'
  and public.can_manage_marketing_configurator_content()
)
with check (
  bucket_id = 'news-assets'
  and name like 'marketing-configurator/%'
  and public.can_manage_marketing_configurator_content()
);
