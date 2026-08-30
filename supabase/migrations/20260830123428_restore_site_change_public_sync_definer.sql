-- Restore the site-change publish trigger as the only server-side writer for
-- the public changelog projection. Browser users keep write access only to
-- site_change_entries through its existing admin RLS policies.

create or replace function public.sync_site_change_public_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  public_title text;
  public_description text;
  public_localized_content jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.site_change_public_entries where id = old.id;
    return old;
  end if;

  if new.status = 'published' then
    public_title := coalesce(nullif(new.title_public, ''), nullif(new.localized_content #>> '{da,title}', ''), new.title_internal);
    public_description := nullif(coalesce(new.description_public, new.localized_content #>> '{da,description}', ''), '');
    public_localized_content := public.site_change_public_content(
      new.localized_content,
      public_title,
      public_description,
      new.module,
      new.change_type
    );

    insert into public.site_change_public_entries (
      id,
      published_at,
      implemented_at,
      title,
      description,
      localized_content,
      module,
      change_type,
      affected_roles,
      is_important,
      source_ref,
      updated_at
    )
    values (
      new.id,
      coalesce(new.published_at, now()),
      new.implemented_at,
      public_title,
      public_description,
      public_localized_content,
      new.module,
      new.change_type,
      coalesce(new.affected_roles, array['all']::text[]),
      new.is_important,
      new.source_ref,
      now()
    )
    on conflict (id) do update set
      published_at = excluded.published_at,
      implemented_at = excluded.implemented_at,
      title = excluded.title,
      description = excluded.description,
      localized_content = excluded.localized_content,
      module = excluded.module,
      change_type = excluded.change_type,
      affected_roles = excluded.affected_roles,
      is_important = excluded.is_important,
      source_ref = excluded.source_ref,
      updated_at = now();

    if new.published_at is null then
      new.published_at = now();
    end if;
  else
    delete from public.site_change_public_entries where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_site_change_public_entry() from public, anon, authenticated;
