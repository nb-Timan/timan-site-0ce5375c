create index if not exists price_list_releases_previous_idx
  on public.price_list_releases (previous_release_id)
  where previous_release_id is not null;

create index if not exists price_list_publish_logs_release_idx
  on public.price_list_publish_logs (release_id)
  where release_id is not null;
