-- Personal favorites for the Marketing video library.
--
-- Favorites are a user-specific Salg/library layer. They do not change video
-- metadata, publication status, product relations, or editorial content.

create table if not exists public.marketing_video_user_favorites (
  user_id uuid not null references public.app_users(id) on delete cascade,
  video_id uuid not null references public.marketing_videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists marketing_video_user_favorites_video_idx
  on public.marketing_video_user_favorites (video_id);

alter table public.marketing_video_user_favorites enable row level security;

revoke all on table public.marketing_video_user_favorites from anon, authenticated;
grant select, insert, delete on table public.marketing_video_user_favorites to authenticated;

drop policy if exists marketing_video_user_favorites_select_own on public.marketing_video_user_favorites;
create policy marketing_video_user_favorites_select_own
on public.marketing_video_user_favorites
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.id = marketing_video_user_favorites.user_id
      and au.auth_user_id = (select auth.uid())
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, true) = true
  )
);

drop policy if exists marketing_video_user_favorites_insert_own on public.marketing_video_user_favorites;
create policy marketing_video_user_favorites_insert_own
on public.marketing_video_user_favorites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.app_users au
    where au.id = marketing_video_user_favorites.user_id
      and au.auth_user_id = (select auth.uid())
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, true) = true
  )
  and exists (
    select 1
    from public.marketing_videos mv
    where mv.id = marketing_video_user_favorites.video_id
      and mv.status = 'published'
      and mv.published_at is not null
      and mv.published_at <= now()
  )
);

drop policy if exists marketing_video_user_favorites_delete_own on public.marketing_video_user_favorites;
create policy marketing_video_user_favorites_delete_own
on public.marketing_video_user_favorites
for delete
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.id = marketing_video_user_favorites.user_id
      and au.auth_user_id = (select auth.uid())
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, true) = true
  )
);
