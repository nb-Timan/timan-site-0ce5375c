-- Marketing video editorial i18n
--
-- Extends the existing one-record-per-video model with the same editorial
-- language shape used by News CMS: localized JSON content plus explicit source
-- language and translation metadata. Legacy title/description remain as
-- Danish/source fallbacks and for older read paths.

alter table public.marketing_videos
  add column if not exists localized_content jsonb not null default '{}'::jsonb,
  add column if not exists source_language text not null default 'da',
  add column if not exists translation_meta jsonb not null default '{}'::jsonb;

alter table public.marketing_videos
  drop constraint if exists marketing_videos_source_language_check;

alter table public.marketing_videos
  add constraint marketing_videos_source_language_check
  check (source_language in ('da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'));

create index if not exists marketing_videos_localized_content_gin
  on public.marketing_videos using gin (localized_content);

update public.marketing_videos
set localized_content = jsonb_build_object(
    coalesce(nullif(source_language, ''), 'da'),
    jsonb_strip_nulls(jsonb_build_object(
      'title', title,
      'description', description
    ))
  ) || localized_content
where localized_content = '{}'::jsonb
   or not (localized_content ? coalesce(nullif(source_language, ''), 'da'));
