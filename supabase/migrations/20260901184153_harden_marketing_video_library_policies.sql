-- Tighten the Marketing video RLS shape after live advisor review.
-- This keeps the same visibility rules, but avoids duplicate authenticated
-- SELECT policies and adds covering indexes for app user FK columns.

create index if not exists marketing_videos_created_by_idx
  on public.marketing_videos (created_by)
  where created_by is not null;

create index if not exists marketing_videos_updated_by_idx
  on public.marketing_videos (updated_by)
  where updated_by is not null;

drop policy if exists marketing_videos_public_read_published on public.marketing_videos;
drop policy if exists marketing_videos_manage_select_all on public.marketing_videos;

create policy marketing_videos_anon_read_published
on public.marketing_videos
for select
to anon
using (status = 'published' and published_at is not null and published_at <= now());

create policy marketing_videos_authenticated_read_visible
on public.marketing_videos
for select
to authenticated
using (
  (status = 'published' and published_at is not null and published_at <= now())
  or public.can_manage_marketing_videos()
);

drop policy if exists marketing_video_product_links_public_read_published on public.marketing_video_product_links;

create policy marketing_video_product_links_anon_read_published
on public.marketing_video_product_links
for select
to anon
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

create policy marketing_video_product_links_authenticated_read_visible
on public.marketing_video_product_links
for select
to authenticated
using (
  public.can_manage_marketing_videos()
  or exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_product_links.video_id
      and mv.status = 'published'
      and mv.published_at is not null
      and mv.published_at <= now()
  )
);

drop policy if exists marketing_video_primary_products_public_read_published on public.marketing_video_primary_products;

create policy marketing_video_primary_products_anon_read_published
on public.marketing_video_primary_products
for select
to anon
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

create policy marketing_video_primary_products_authenticated_read_visible
on public.marketing_video_primary_products
for select
to authenticated
using (
  public.can_manage_marketing_videos()
  or exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_primary_products.video_id
      and mv.status = 'published'
      and mv.published_at is not null
      and mv.published_at <= now()
  )
);
