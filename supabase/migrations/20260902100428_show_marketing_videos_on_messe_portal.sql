alter table public.marketing_videos
  add column if not exists show_on_messe_portal boolean not null default false;

create index if not exists marketing_videos_messe_public_idx
  on public.marketing_videos (published_at desc)
  where status = 'published' and show_on_messe_portal = true;

create or replace function public.can_read_marketing_video(
  video_status text,
  video_published_at timestamptz,
  video_show_on_messe_portal boolean
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    public.can_manage_marketing_videos()
    or (
      video_status = 'published'
      and video_published_at is not null
      and video_published_at <= now()
      and (
        video_show_on_messe_portal
        or exists (
          select 1
          from public.app_users au
          where au.auth_user_id = (select auth.uid())
            and coalesce(au.is_active, true) = true
            and lower(coalesce(au.status, 'active')) in ('active', 'approved')
            and lower(coalesce(au.portal_role::text, '')) <> 'exhibition_user'
            and lower(coalesce(au.portal_variant, '')) <> 'messe'
        )
      )
    );
$$;

drop policy if exists marketing_videos_anon_read_published on public.marketing_videos;
drop policy if exists marketing_videos_authenticated_read_visible on public.marketing_videos;

create policy marketing_videos_anon_read_published
on public.marketing_videos
for select
to anon
using (
  public.can_read_marketing_video(status, published_at, show_on_messe_portal)
);

create policy marketing_videos_authenticated_read_visible
on public.marketing_videos
for select
to authenticated
using (
  public.can_read_marketing_video(status, published_at, show_on_messe_portal)
);

drop policy if exists marketing_video_product_links_public_read_published on public.marketing_video_product_links;
drop policy if exists marketing_video_product_links_anon_read_published on public.marketing_video_product_links;
drop policy if exists marketing_video_product_links_authenticated_read_visible on public.marketing_video_product_links;
drop policy if exists marketing_video_primary_products_public_read_published on public.marketing_video_primary_products;
drop policy if exists marketing_video_primary_products_anon_read_published on public.marketing_video_primary_products;
drop policy if exists marketing_video_primary_products_authenticated_read_visible on public.marketing_video_primary_products;

create policy marketing_video_product_links_public_read_published
on public.marketing_video_product_links
for select
to anon
using (
  exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_product_links.video_id
      and public.can_read_marketing_video(mv.status, mv.published_at, mv.show_on_messe_portal)
  )
);

create policy marketing_video_product_links_authenticated_read_visible
on public.marketing_video_product_links
for select
to authenticated
using (
  exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_product_links.video_id
      and public.can_read_marketing_video(mv.status, mv.published_at, mv.show_on_messe_portal)
  )
);

create policy marketing_video_primary_products_public_read_published
on public.marketing_video_primary_products
for select
to anon
using (
  exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_primary_products.video_id
      and public.can_read_marketing_video(mv.status, mv.published_at, mv.show_on_messe_portal)
  )
);

create policy marketing_video_primary_products_authenticated_read_visible
on public.marketing_video_primary_products
for select
to authenticated
using (
  exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_primary_products.video_id
      and public.can_read_marketing_video(mv.status, mv.published_at, mv.show_on_messe_portal)
  )
);
