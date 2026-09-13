-- Archived rows predating the trash lifecycle had no previous-status field.
-- A retained published timestamp is the existing canonical evidence that the
-- item came from published state; new archives already store this explicitly.
update public.marketing_videos
set archived_previous_status = 'published'
where status = 'archived'
  and archived_previous_status = 'draft'
  and published_at is not null;
