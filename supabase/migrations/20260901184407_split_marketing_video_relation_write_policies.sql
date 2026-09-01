-- Avoid broad FOR ALL policies on relation tables.
-- Visibility stays in the read policies; managers still get insert/update/delete.

drop policy if exists marketing_video_product_links_manage_all on public.marketing_video_product_links;
drop policy if exists marketing_video_primary_products_manage_all on public.marketing_video_primary_products;

create policy marketing_video_product_links_manage_insert
on public.marketing_video_product_links
for insert
to authenticated
with check (public.can_manage_marketing_videos());

create policy marketing_video_product_links_manage_update
on public.marketing_video_product_links
for update
to authenticated
using (public.can_manage_marketing_videos())
with check (public.can_manage_marketing_videos());

create policy marketing_video_product_links_manage_delete
on public.marketing_video_product_links
for delete
to authenticated
using (public.can_manage_marketing_videos());

create policy marketing_video_primary_products_manage_insert
on public.marketing_video_primary_products
for insert
to authenticated
with check (public.can_manage_marketing_videos());

create policy marketing_video_primary_products_manage_update
on public.marketing_video_primary_products
for update
to authenticated
using (public.can_manage_marketing_videos())
with check (public.can_manage_marketing_videos());

create policy marketing_video_primary_products_manage_delete
on public.marketing_video_primary_products
for delete
to authenticated
using (public.can_manage_marketing_videos());
