-- Marketing video model generation status
--
-- Keeps publication status separate from whether a video belongs to a current
-- or previous Timan model. Existing videos default to current because there is
-- no canonical metadata that classifies legacy models automatically.

alter table public.marketing_videos
  add column if not exists model_generation_status text not null default 'current';

alter table public.marketing_videos
  drop constraint if exists marketing_videos_model_generation_status_check;

alter table public.marketing_videos
  add constraint marketing_videos_model_generation_status_check
  check (model_generation_status in ('current', 'legacy'));

create index if not exists marketing_videos_model_generation_status_idx
  on public.marketing_videos (model_generation_status, status, published_at desc);
