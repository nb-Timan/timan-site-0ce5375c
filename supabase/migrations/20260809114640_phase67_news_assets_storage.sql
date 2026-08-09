-- Phase 67 - News CMS asset storage
--
-- Creates the public `news-assets` bucket used by News CMS image fields and
-- custom feature icons. Public read is required because published news is
-- visible in the portal without a signed-in editor session.

insert into storage.buckets (id, name, public)
values ('news-assets', 'news-assets', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "news_assets_select_public" on storage.objects;
drop policy if exists "news_assets_insert_authenticated" on storage.objects;
drop policy if exists "news_assets_update_authenticated" on storage.objects;
drop policy if exists "news_assets_delete_authenticated" on storage.objects;

create policy "news_assets_select_public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'news-assets');

create policy "news_assets_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'news-assets');

create policy "news_assets_update_authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'news-assets')
with check (bucket_id = 'news-assets');

create policy "news_assets_delete_authenticated"
on storage.objects
for delete
to authenticated
using (bucket_id = 'news-assets');
