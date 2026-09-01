-- Marketing video library
--
-- Adds one canonical video foundation used by Marketing management, the Sales
-- video library and the Configurator primary-product video relation.

create table if not exists public.marketing_videos (
  id uuid primary key default gen_random_uuid(),
  youtube_url text not null,
  youtube_video_id text not null,
  title text not null,
  description text,
  content_type text not null default 'product',
  seasons text[] not null default array['all_year']::text[],
  tags text[] not null default array[]::text[],
  custom_thumbnail_url text,
  custom_thumbnail_path text,
  status text not null default 'draft',
  is_active boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_videos_youtube_video_id_check check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint marketing_videos_status_check check (status in ('draft', 'published', 'archived')),
  constraint marketing_videos_content_type_check check (
    content_type in (
      'product',
      'how_to',
      'installation',
      'service',
      'maintenance',
      'troubleshooting',
      'sales',
      'training',
      'safety',
      'campaign'
    )
  )
);

alter table public.marketing_videos
  add column if not exists youtube_url text,
  add column if not exists youtube_video_id text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists content_type text not null default 'product',
  add column if not exists seasons text[] not null default array['all_year']::text[],
  add column if not exists tags text[] not null default array[]::text[],
  add column if not exists custom_thumbnail_url text,
  add column if not exists custom_thumbnail_path text,
  add column if not exists status text not null default 'draft',
  add column if not exists is_active boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists created_by uuid references public.app_users(id) on delete set null,
  add column if not exists updated_by uuid references public.app_users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.marketing_video_product_links (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.marketing_videos(id) on delete cascade,
  product_key text not null,
  item_number text not null,
  product_label text,
  machine_key text,
  created_at timestamptz not null default now(),
  unique (video_id, product_key)
);

create table if not exists public.marketing_video_primary_products (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.marketing_videos(id) on delete cascade,
  product_key text not null unique,
  item_number text not null,
  product_label text,
  machine_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_videos_public_idx
  on public.marketing_videos (status, published_at desc)
  where status = 'published';

create index if not exists marketing_videos_search_idx
  on public.marketing_videos using gin (tags);

create index if not exists marketing_video_product_links_item_idx
  on public.marketing_video_product_links (item_number);

create index if not exists marketing_video_product_links_product_idx
  on public.marketing_video_product_links (product_key);

create index if not exists marketing_video_primary_products_video_idx
  on public.marketing_video_primary_products (video_id);

create or replace function public.touch_marketing_video_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_marketing_videos_updated_at on public.marketing_videos;
create trigger touch_marketing_videos_updated_at
before update on public.marketing_videos
for each row execute function public.touch_marketing_video_updated_at();

drop trigger if exists touch_marketing_video_primary_products_updated_at on public.marketing_video_primary_products;
create trigger touch_marketing_video_primary_products_updated_at
before update on public.marketing_video_primary_products
for each row execute function public.touch_marketing_video_updated_at();

create or replace function public.can_manage_marketing_videos()
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
        or coalesce(au.permissions ->> 'news_manage', 'false') = 'true'
        or 'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))
      )
  );
$$;

alter table public.marketing_videos enable row level security;
alter table public.marketing_video_product_links enable row level security;
alter table public.marketing_video_primary_products enable row level security;

revoke all on table public.marketing_videos from anon, authenticated;
revoke all on table public.marketing_video_product_links from anon, authenticated;
revoke all on table public.marketing_video_primary_products from anon, authenticated;

grant select on table public.marketing_videos to anon, authenticated;
grant select on table public.marketing_video_product_links to anon, authenticated;
grant select on table public.marketing_video_primary_products to anon, authenticated;
grant insert, update, delete on table public.marketing_videos to authenticated;
grant insert, update, delete on table public.marketing_video_product_links to authenticated;
grant insert, update, delete on table public.marketing_video_primary_products to authenticated;

drop policy if exists marketing_videos_public_read_published on public.marketing_videos;
create policy marketing_videos_public_read_published
on public.marketing_videos
for select
to anon, authenticated
using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists marketing_videos_manage_select_all on public.marketing_videos;
create policy marketing_videos_manage_select_all
on public.marketing_videos
for select
to authenticated
using (public.can_manage_marketing_videos());

drop policy if exists marketing_videos_manage_insert on public.marketing_videos;
create policy marketing_videos_manage_insert
on public.marketing_videos
for insert
to authenticated
with check (public.can_manage_marketing_videos());

drop policy if exists marketing_videos_manage_update on public.marketing_videos;
create policy marketing_videos_manage_update
on public.marketing_videos
for update
to authenticated
using (public.can_manage_marketing_videos())
with check (public.can_manage_marketing_videos());

drop policy if exists marketing_videos_manage_delete on public.marketing_videos;
create policy marketing_videos_manage_delete
on public.marketing_videos
for delete
to authenticated
using (public.can_manage_marketing_videos());

drop policy if exists marketing_video_product_links_public_read_published on public.marketing_video_product_links;
create policy marketing_video_product_links_public_read_published
on public.marketing_video_product_links
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_product_links.video_id
      and mv.status = 'published'
      and mv.published_at is not null
      and mv.published_at <= now()
  )
);

drop policy if exists marketing_video_product_links_manage_all on public.marketing_video_product_links;
create policy marketing_video_product_links_manage_all
on public.marketing_video_product_links
for all
to authenticated
using (public.can_manage_marketing_videos())
with check (public.can_manage_marketing_videos());

drop policy if exists marketing_video_primary_products_public_read_published on public.marketing_video_primary_products;
create policy marketing_video_primary_products_public_read_published
on public.marketing_video_primary_products
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_primary_products.video_id
      and mv.status = 'published'
      and mv.published_at is not null
      and mv.published_at <= now()
  )
);

drop policy if exists marketing_video_primary_products_manage_all on public.marketing_video_primary_products;
create policy marketing_video_primary_products_manage_all
on public.marketing_video_primary_products
for all
to authenticated
using (public.can_manage_marketing_videos())
with check (public.can_manage_marketing_videos());
