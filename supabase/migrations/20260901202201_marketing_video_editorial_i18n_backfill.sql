-- Backfill legacy marketing video editorial fields into the source-language
-- JSON slot when a row still has empty localized content after schema rollout.

update public.marketing_videos
set localized_content = jsonb_build_object(
    coalesce(nullif(source_language, ''), 'da'),
    jsonb_strip_nulls(jsonb_build_object(
      'title', title,
      'description', description
    ))
  ) || coalesce(localized_content, '{}'::jsonb)
where (localized_content = '{}'::jsonb
   or not (localized_content ? coalesce(nullif(source_language, ''), 'da')))
  and nullif(btrim(title), '') is not null;
