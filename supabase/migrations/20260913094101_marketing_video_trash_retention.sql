-- Canonical 24-hour trash lifecycle for Marketing videos.
-- Relations deliberately remain while a video is archived so restore is lossless.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.marketing_videos
  add column if not exists archived_at timestamptz,
  add column if not exists delete_after timestamptz,
  add column if not exists archived_previous_status text;

alter table public.marketing_videos
  drop constraint if exists marketing_videos_archived_previous_status_check;

alter table public.marketing_videos
  add constraint marketing_videos_archived_previous_status_check
  check (archived_previous_status is null or archived_previous_status in ('draft', 'published'));

create index if not exists marketing_videos_expired_trash_idx
  on public.marketing_videos (delete_after)
  where status = 'archived' and delete_after is not null;

-- Existing archived rows get a complete grace period from this rollout.
-- Nothing is permanently removed merely because this migration is applied.
update public.marketing_videos
set
  archived_at = coalesce(archived_at, now()),
  delete_after = coalesce(delete_after, now() + interval '24 hours'),
  archived_previous_status = coalesce(archived_previous_status, 'draft'),
  is_active = false
where status = 'archived'
  and (archived_at is null or delete_after is null or archived_previous_status is null or is_active);

create or replace function public.enforce_marketing_video_trash_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'archived' then
    if new.status = 'archived' then
      if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
        raise exception 'Archived marketing videos cannot be edited. Restore the video first.';
      end if;
      return new;
    end if;

    if old.delete_after is null or old.delete_after <= now() then
      raise exception 'Archived marketing video can no longer be restored.';
    end if;
    if new.status is distinct from old.archived_previous_status then
      raise exception 'Archived marketing video must be restored to its previous status.';
    end if;

    new.archived_at = null;
    new.delete_after = null;
    new.archived_previous_status = null;
    new.is_active = new.status = 'published';
    return new;
  end if;

  if new.status = 'archived' then
    if (to_jsonb(new) - array['status', 'is_active', 'archived_at', 'delete_after', 'archived_previous_status', 'updated_at', 'updated_by'])
      is distinct from
      (to_jsonb(old) - array['status', 'is_active', 'archived_at', 'delete_after', 'archived_previous_status', 'updated_at', 'updated_by']) then
      raise exception 'Archive a marketing video separately from content edits.';
    end if;

    new.archived_at = now();
    new.delete_after = now() + interval '24 hours';
    new.archived_previous_status = old.status;
    new.is_active = false;
    new.published_at = old.published_at;
  elsif new.status in ('draft', 'published') then
    new.archived_at = null;
    new.delete_after = null;
    new.archived_previous_status = null;
    new.is_active = new.status = 'published';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_marketing_video_trash_lifecycle on public.marketing_videos;
create trigger enforce_marketing_video_trash_lifecycle
before update on public.marketing_videos
for each row execute function public.enforce_marketing_video_trash_lifecycle();

create or replace function public.archive_marketing_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.can_manage_marketing_videos() then
    raise exception 'Marketing video management access denied.' using errcode = '42501';
  end if;

  select status into v_status
  from public.marketing_videos
  where id = p_video_id
  for update;

  if not found then
    raise exception 'Marketing video not found.' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    return;
  end if;

  update public.marketing_videos
  set
    status = 'archived',
    updated_by = (
      select au.id from public.app_users au where au.auth_user_id = (select auth.uid()) limit 1
    )
  where id = p_video_id;
end;
$$;

create or replace function public.restore_marketing_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
  v_delete_after timestamptz;
begin
  if not public.can_manage_marketing_videos() then
    raise exception 'Marketing video management access denied.' using errcode = '42501';
  end if;

  select archived_previous_status, delete_after
  into v_previous_status, v_delete_after
  from public.marketing_videos
  where id = p_video_id and status = 'archived'
  for update;

  if not found then
    raise exception 'Archived marketing video not found.' using errcode = 'P0002';
  end if;
  if v_delete_after is null or v_delete_after <= now() then
    raise exception 'Archived marketing video can no longer be restored.' using errcode = '22023';
  end if;

  update public.marketing_videos
  set
    status = v_previous_status,
    updated_by = (
      select au.id from public.app_users au where au.auth_user_id = (select auth.uid()) limit 1
    )
  where id = p_video_id;
end;
$$;

-- The scheduler passes an opaque Vault-held secret. Only the Edge Function's
-- service-role client can call this verifier; it never exposes the secret.
create or replace function public.is_marketing_video_retention_scheduler(p_secret text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'marketing_video_retention_scheduler_secret'
      and decrypted_secret = p_secret
  );
$$;

revoke all on function public.archive_marketing_video(uuid) from public;
revoke all on function public.restore_marketing_video(uuid) from public;
revoke all on function public.is_marketing_video_retention_scheduler(text) from public;
grant execute on function public.archive_marketing_video(uuid) to authenticated;
grant execute on function public.restore_marketing_video(uuid) to authenticated;
grant execute on function public.is_marketing_video_retention_scheduler(text) to service_role;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'marketing_video_retention_scheduler_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'marketing_video_retention_scheduler_secret',
      'Authenticates the Marketing Video retention scheduler to its Edge Function.'
    );
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'marketing-video-retention-hourly'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'marketing-video-retention-hourly',
    '17 * * * *',
    $cron$
      select net.http_post(
        url := 'https://rdodyoixxybiozvmuqon.supabase.co/functions/v1/marketing-video-retention',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'sb_publishable_yGHuYBzLY-dRDJ0U_s5FRw_CXIwFHK2',
          'x-marketing-video-retention-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'marketing_video_retention_scheduler_secret'
          )
        ),
        body := '{"action":"cleanup_expired"}'::jsonb
      );
    $cron$
  );
end;
$$;

;
