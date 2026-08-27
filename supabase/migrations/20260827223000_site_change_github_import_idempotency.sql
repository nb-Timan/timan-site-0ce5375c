create unique index if not exists site_change_entries_github_source_ref_unique
on public.site_change_entries (source_ref)
where source = 'github' and source_ref is not null;
