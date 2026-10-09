-- A restore is a pure lifecycle transition. Content changes require a
-- subsequent normal update once the archived video has been restored.
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
    if (to_jsonb(new) - array['status', 'is_active', 'archived_at', 'delete_after', 'archived_previous_status', 'updated_at', 'updated_by'])
      is distinct from
      (to_jsonb(old) - array['status', 'is_active', 'archived_at', 'delete_after', 'archived_previous_status', 'updated_at', 'updated_by']) then
      raise exception 'Restore a marketing video separately from content edits.';
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
$$;;
